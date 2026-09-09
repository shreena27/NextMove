// geminiProvider — the real Gemini adapter (Task 18, design note 3/4).
// Every test here mocks the GLOBAL `fetch`; none makes a real network call —
// a test that hits the real API is not a test (design note 4): it is
// non-deterministic, costs money, and sends a citizen's text to a third
// party from CI.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { InterpretationRequest } from '../domain/interpret'
import { passportPlaybook } from '../playbooks/passportPlaybook'
import { MODEL_ID, QuotaError, buildPrompt, geminiProvider } from './geminiInterpreter'

// Every test needs a truthy VITE_GEMINI_API_KEY or the adapter throws before
// ever calling fetch (its own early guard, tested on its own further down) —
// stubbed once, here, rather than in every single test body below. The one
// test that specifically exercises the missing-key path unstubs it itself.
beforeEach(() => {
  vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key-not-real')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const REQ: InterpretationRequest = {
  service: 'Passport',
  questions: [
    { questionId: 'q1', optionValues: ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'] },
    { questionId: 'q2', optionValues: ['no_followup', 'informal', 'formal_grievance'] },
  ],
  text: 'Police came to my house in June but nothing moved since. I called the PSK twice.',
}

/** Builds a minimal fetch-`Response`-shaped mock carrying `inner` as the
 *  model's generated JSON text, wrapped in Gemini's real REST envelope
 *  (`candidates[0].content.parts[0].text`). */
function geminiResponse(status: number, inner: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(inner) }] } }] }),
  }
}

function stubFetch(impl: (...args: unknown[]) => unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

// ---------------------------------------------------------------------------
// Identity (D3)

describe('geminiProvider — identity', () => {
  it("id is 'gemini' and minSpanTokens is 3 (D3) — the one line distinguishing this provider's safety posture from the simulator's minSpanTokens: 1", () => {
    expect(geminiProvider.id).toBe('gemini')
    expect(geminiProvider.minSpanTokens).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// 1. Well-formed response parses

describe('geminiProvider.interpret — a well-formed response', () => {
  it('parses into a valid RawInterpretation, matching the model output exactly', async () => {
    const inner = {
      mappings: [
        { questionId: 'q1', value: 'contacted_incomplete', span: 'Police came' },
        { questionId: 'q2', value: 'informal', span: 'called' },
      ],
      facts: [{ value: 'BN1068334517807' }],
    }
    stubFetch(async () => geminiResponse(200, inner))
    const result = await geminiProvider.interpret(REQ)
    expect(result).toEqual(inner)
  })
})

// ---------------------------------------------------------------------------
// 2. Non-JSON response body throws

describe('geminiProvider.interpret — a non-JSON response body', () => {
  it('throws (propagating res.json() rejecting, exactly what a real fetch does for an invalid body)', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0')
      },
    }))
    await expect(geminiProvider.interpret(REQ)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 3. Valid JSON, wrong shape, throws

describe('geminiProvider.interpret — valid JSON but the wrong shape', () => {
  it('mappings not an array throws', async () => {
    stubFetch(async () => geminiResponse(200, { mappings: 'not-an-array', facts: [] }))
    await expect(geminiProvider.interpret(REQ)).rejects.toThrow(/mappings\/facts/)
  })

  it('facts missing entirely throws', async () => {
    stubFetch(async () => geminiResponse(200, { mappings: [] }))
    await expect(geminiProvider.interpret(REQ)).rejects.toThrow(/mappings\/facts/)
  })

  it('a generated-text field that is not valid JSON at all throws', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json{{{' }] } }] }),
    }))
    await expect(geminiProvider.interpret(REQ)).rejects.toThrow(/not valid JSON/)
  })
})

// ---------------------------------------------------------------------------
// 4. Non-200 status throws

describe('geminiProvider.interpret — a non-200 HTTP status', () => {
  it('a 500 throws', async () => {
    stubFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    await expect(geminiProvider.interpret(REQ)).rejects.toThrow(/HTTP 500/)
  })

  it('a 400 throws', async () => {
    stubFetch(async () => ({ ok: false, status: 400, json: async () => ({}) }))
    await expect(geminiProvider.interpret(REQ)).rejects.toThrow(/HTTP 400/)
  })
})

// ---------------------------------------------------------------------------
// 429 -> QuotaError specifically (design note 8)

describe('geminiProvider.interpret — a 429 status', () => {
  it('throws QuotaError specifically, not a plain Error — this is the ONE typed distinction runInterpretation relies on to map to reason: \'quota\'', async () => {
    stubFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }))
    await expect(geminiProvider.interpret(REQ)).rejects.toThrow(QuotaError)
  })

  it('a 429 body is never even parsed as JSON — the quota check runs before res.json() is called', async () => {
    const jsonSpy = vi.fn(async () => {
      throw new Error('res.json() should never be called for a 429')
    })
    stubFetch(async () => ({ ok: false, status: 429, json: jsonSpy }))
    await expect(geminiProvider.interpret(REQ)).rejects.toThrow(QuotaError)
    expect(jsonSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 5. An extra field (e.g. confidence) is silently dropped

describe('geminiProvider.interpret — an extra field like confidence', () => {
  it('is dropped: the returned object has ONLY mappings/facts, and each item has ONLY its known fields', async () => {
    const inner = {
      mappings: [{ questionId: 'q1', value: 'adverse', span: 'adverse report', confidence: 0.93 }],
      facts: [{ value: 'BN1068334517807', confidence: 0.5, label: 'File Number' }],
      confidence: 0.88,
      modelNotes: 'looks fairly clear',
    }
    stubFetch(async () => geminiResponse(200, inner))
    const result = await geminiProvider.interpret(REQ)
    expect(Object.keys(result).sort()).toEqual(['facts', 'mappings'])
    expect(result.mappings).toEqual([{ questionId: 'q1', value: 'adverse', span: 'adverse report' }])
    expect(Object.keys(result.mappings[0]).sort()).toEqual(['questionId', 'span', 'value'])
    expect(result.facts).toEqual([{ value: 'BN1068334517807' }])
    expect(Object.keys(result.facts[0])).toEqual(['value'])
  })
})

// ---------------------------------------------------------------------------
// 6. The prompt: option values + text present, no playbook rule content

describe('geminiProvider.interpret — the prompt sent to Gemini (scope exclusion 4)', () => {
  it('contains the offered option values and the citizen\'s text, and contains NO playbook rule text', async () => {
    const fetchMock = stubFetch(async () => geminiResponse(200, { mappings: [], facts: [] }))
    await geminiProvider.interpret(REQ)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string)
    const prompt = sentBody.contents[0].parts[0].text as string

    for (const q of REQ.questions) {
      expect(prompt).toContain(q.questionId)
      for (const v of q.optionValues) expect(prompt).toContain(v)
    }
    expect(prompt).toContain(REQ.text)

    for (const rule of passportPlaybook.rules) {
      expect(prompt).not.toContain(rule.explanation)
      expect(prompt).not.toContain(rule.whatToDo)
    }
    expect(prompt).not.toContain(passportPlaybook.fallback.explanation)
  })

  it('buildPrompt(req), called directly (pure, no fetch), has the same property — real strings from passportPlaybook never appear', () => {
    const prompt = buildPrompt(REQ)
    expect(prompt).toContain(REQ.text)
    expect(prompt).toContain('adverse')
    for (const rule of passportPlaybook.rules) {
      expect(prompt).not.toContain(rule.explanation)
      expect(prompt).not.toContain(rule.whatToDo)
      expect(prompt).not.toContain(rule.whatShort)
    }
  })
})

// ---------------------------------------------------------------------------
// Request construction: strict-JSON generation config, correct endpoint

describe('geminiProvider.interpret — the request itself', () => {
  it('POSTs to the generateContent endpoint for MODEL_ID with responseMimeType: application/json', async () => {
    const fetchMock = stubFetch(async () => geminiResponse(200, { mappings: [], facts: [] }))
    await geminiProvider.interpret(REQ)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`models/${MODEL_ID}:generateContent`)
    expect(init.method).toBe('POST')
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.generationConfig.responseMimeType).toBe('application/json')
  })
})

// ---------------------------------------------------------------------------
// Missing API key fails closed before any network call

describe('geminiProvider.interpret — no VITE_GEMINI_API_KEY configured', () => {
  it('throws before calling fetch at all', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', undefined)
    const fetchMock = stubFetch(async () => geminiResponse(200, { mappings: [], facts: [] }))
    await expect(geminiProvider.interpret(REQ)).rejects.toThrow(/VITE_GEMINI_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
