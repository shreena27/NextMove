// runInterpretation — the orchestrator, and the ONLY non-test caller of
// gateInterpretation (design note 4). This is the first module where a
// concrete provider and the provider-agnostic gates actually meet.
//
// Fail-closed discipline (design note 5, 6): every failure mode this suite
// drives — disabled flag, unknown entry screen, no provider registered, a
// throwing provider, a malformed payload, a provider that never resolves —
// must resolve to a discriminated `{ ok: false, reason }`, NEVER a rejected
// promise. `expect.assertions(N)` pins that the intended branch genuinely
// ran, not just that nothing threw.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RawInterpretation } from '../domain/interpret'
import { DESCRIBE_CHAINS } from '../domain/interpret'
import { extractFacts } from '../domain/interpretFacts'
import { simProvider } from '../domain/simInterpreter'
import { passportPlaybook } from '../playbooks/passportPlaybook'
import { MODEL_ID, QuotaError } from './geminiInterpreter'
import type { InterpretationFailure } from './interpretation'
import { runInterpretation, provenanceLabel, INTERPRETATION_TIMEOUT_MS } from './interpretation'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const PASSPORT_TEXT = 'My application was rejected outright, ARN 123456789012.'

// ---------------------------------------------------------------------------
// Fail-closed: flag off

describe('runInterpretation — flag off', () => {
  it("returns { ok: false, reason: 'disabled' } and the provider's interpret is never called", async () => {
    expect.assertions(2)
    vi.stubEnv('VITE_DESCRIBE_IT', undefined)
    const spy = vi.spyOn(simProvider, 'interpret')
    const result = await runInterpretation('passport-q1', {}, PASSPORT_TEXT)
    expect(result).toEqual({ ok: false, reason: 'disabled' })
    expect(spy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// The shared-gate proof: a fake provider cannot bypass gateInterpretation

describe('runInterpretation — the shared-gate proof (design note 4)', () => {
  it('a fake provider returning an out-of-enum value: the result\'s mappings is empty — a provider cannot bypass the gate; the __gated brand makes a forged result unconstructible, and runInterpretation is the only caller of gateInterpretation', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.spyOn(simProvider, 'interpret').mockResolvedValue({
      mappings: [{ questionId: 'q1', value: 'totally_bogus_value', span: 'rejected outright' }],
      facts: [],
    })
    const result = await runInterpretation('passport-q1', {}, PASSPORT_TEXT)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.interp.mappings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// C1's orchestrator-level pin

describe("runInterpretation — C1's orchestrator-level pin: the fact rules run for a provider that is NOT the simulator", () => {
  it("a fake provider returning facts: [{ value: '123456789012' }] against text 'my aadhaar is 123456789012' yields interp.facts empty and interp.droppedSensitive true — this is the assertion that would have failed before C1's fix; the rules lived in simulateInterpretation and a real adapter never reached them", async () => {
    expect.assertions(2)
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.spyOn(simProvider, 'interpret').mockResolvedValue({
      mappings: [],
      facts: [{ value: '123456789012' }],
    })
    const result = await runInterpretation('passport-q1', {}, 'my aadhaar is 123456789012')
    if (result.ok) {
      expect(result.interp.facts).toEqual([])
      expect(result.interp.droppedSensitive).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// C2's orchestrator-level pin

describe("runInterpretation — C2's orchestrator-level pin: a provider's own label/fills never reach the citizen", () => {
  it("a fake provider fact {value:'BN1068334517807', label:'Aadhaar', fills:'[date you applied]'} (cast) yields a fact whose label is 'File Number' and whose fills is '[File Number / ARN]' — a .filter would have put the model's own label on the citizen's screen. The text carries a FIRST file-number-shaped value (claimed by the baseline's shape scan) and a short unrelated alphanumeric token (which spends the baseline's one-unknown-chip budget) BEFORE BN1068334517807, so neither the shape scan's non-global match NOR the unknown-number sweep's global scan already produces BN1068334517807 on its own — otherwise this would pass on a baseline fact alone and prove nothing about reconstruction (the same vacuous-fixture pitfall interpretFacts.test.ts's own C2 pin documents)", async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const text =
      'My old file number was AB1234567890123. I also saw a code XYZ12345 written somewhere. My current file number is BN1068334517807, noted on the case.'
    const baseline = extractFacts('passport', text)
    // sanity: the baseline really does NOT already contain BN1068334517807 —
    // not via the shape scan's first-match-only limit (claimed by
    // AB1234567890123 instead) and not via the unknown-number sweep's
    // one-chip budget (spent on XYZ12345 instead, which sorts earlier in
    // the text) — otherwise this fixture is exactly as vacuous as the one
    // it replaces.
    expect(baseline.facts.some(f => f.value === 'BN1068334517807')).toBe(false)
    const rawFacts = [
      { value: 'BN1068334517807', label: 'Aadhaar', fills: '[date you applied]' } as unknown as { value: string },
    ]
    vi.spyOn(simProvider, 'interpret').mockResolvedValue({ mappings: [], facts: rawFacts })
    const result = await runInterpretation('passport-q1', {}, text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const fact = result.interp.facts.find(f => f.value === 'BN1068334517807')
      expect(fact?.label).toBe('File Number')
      expect(fact?.fills).toBe('[File Number / ARN]')
    }
  })
})

// ---------------------------------------------------------------------------
// I2's whole-body try/catch pin — two independent tests

describe("runInterpretation — I2's whole-body pin: the try/catch wraps the ENTIRE body, not just the provider call (design note 4a)", () => {
  it('(a) a chain whose SIR resolver is stubbed to throw: runInterpretation RESOLVES to { ok: false, reason: \'failed\' } rather than rejecting — an unhandled rejection here leaves state.reading true forever, a dead "Reading…" button with no error', async () => {
    expect.assertions(2)
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const entry = DESCRIBE_CHAINS['sir-q1'].chain[0]
    const original = entry.optionValues
    entry.optionValues = () => {
      throw new Error('unsupported SIR state: none')
    }
    try {
      // sanity: the stub really does throw when called directly
      expect(() => (entry.optionValues as (a: Record<string, string>) => readonly string[])({})).toThrow()
      await expect(runInterpretation('sir-q1', {}, 'I got a notice about my SIR status.')).resolves.toEqual({
        ok: false,
        reason: 'failed',
      })
    } finally {
      entry.optionValues = original
    }
  })

  it('(b) with the real (total) resolver and answers: {}, runInterpretation resolves NORMALLY — the SIR mapping is dropped by the enum gate (empty option set), not a crash', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.spyOn(simProvider, 'interpret').mockResolvedValue({
      mappings: [{ questionId: 'sirQ1', value: 'roll_present', span: 'name is there' }],
      facts: [],
    })
    const result = await runInterpretation('sir-q1', {}, 'I checked and my name is there.')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.interp.mappings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// D17's provenance pin

describe("runInterpretation — D17's pin: provenance is captured at interpretation time (design note 4b)", () => {
  it("a successful result carries interp.provenance === 'simulated (local matcher)'", async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const result = await runInterpretation('passport-q1', {}, PASSPORT_TEXT)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.interp.provenance).toBe('simulated (local matcher)')
  })

  it('provenanceLabel(simProvider) returns the same string directly, as a pure function', () => {
    expect(provenanceLabel(simProvider)).toBe('simulated (local matcher)')
  })

  it('provenance is captured AT INTERPRETATION TIME, not derived later: changing VITE_INTERPRETER after the call does not change the already-returned result\'s provenance — deriving it later would stamp a case with whatever VITE_INTERPRETER happens to say at that later moment', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.stubEnv('VITE_INTERPRETER', undefined)
    const result = await runInterpretation('passport-q1', {}, PASSPORT_TEXT)
    expect(result.ok).toBe(true)
    vi.stubEnv('VITE_INTERPRETER', 'gemini')
    if (result.ok) expect(result.interp.provenance).toBe('simulated (local matcher)')
  })
})

// ---------------------------------------------------------------------------
// Design note 8: 'quota' was inert scaffolding through Task 17; Task 18 wires
// the one real producer.

describe("runInterpretation — 'quota' (design note 8, I7): declared in Task 5, wired in Task 18", () => {
  it('is a legal InterpretationFailure member (type-level)', () => {
    const failure: InterpretationFailure = 'quota'
    expect(failure).toBe('quota')
  })

  it("grep-style pin, UPDATED for Task 18: exactly ONE non-test source file under src/ contains reason: 'quota' — session/interpretation.ts itself, this module's own QuotaError -> 'quota' mapping just above. Through Task 17 this pin asserted the string appeared NOWHERE; Task 18 is the one task explicitly named (design note 8) as the sole real producer, so the pin now asserts there is exactly one producer, not zero — a second one appearing anywhere else would still be a regression this test catches", () => {
    const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..') // src/session/interpretation.test.ts -> src/
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.tsx?$/.test(entry.name)) continue
        if (/\.test\.tsx?$/.test(entry.name)) continue
        files.push(full)
      }
    }
    walk(srcRoot)
    expect(files.length).toBeGreaterThan(0) // sanity: the walk itself is not vacuous
    const offenders = files.filter(f => /reason:\s*'quota'/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([join(srcRoot, 'session', 'interpretation.ts')])
  })
})

// ---------------------------------------------------------------------------
// Task 18 design note 8's one wire-up: a Gemini 429 (QuotaError) maps to
// reason: 'quota' specifically, not the generic 'failed'. Tested against a
// mocked PROVIDER that throws QuotaError, never a real Gemini call or a real
// exhausted quota — the adapter's own 429 -> QuotaError mapping is pinned
// separately in geminiInterpreter.test.ts.

describe("runInterpretation — Task 18's 429 mapping: a thrown QuotaError maps to reason: 'quota'", () => {
  it("a provider that throws QuotaError -> { ok: false, reason: 'quota' }", async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.spyOn(simProvider, 'interpret').mockRejectedValue(new QuotaError('quota exceeded (test double)'))
    await expect(runInterpretation('passport-q1', {}, PASSPORT_TEXT)).resolves.toEqual({ ok: false, reason: 'quota' })
  })

  it('a DIFFERENT thrown error (same shape, not QuotaError) still maps to the generic \'failed\' — the mapping is type-specific, not "any throw during interpretation is now quota"', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.spyOn(simProvider, 'interpret').mockRejectedValue(new Error('quota exceeded (test double)'))
    await expect(runInterpretation('passport-q1', {}, PASSPORT_TEXT)).resolves.toEqual({ ok: false, reason: 'failed' })
  })
})

// ---------------------------------------------------------------------------
// Fail-closed: a throwing/rejecting provider

describe('runInterpretation — a provider that throws', () => {
  it("resolves to { ok: false, reason: 'failed' }, and does NOT reject", async () => {
    expect.assertions(2)
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const spy = vi.spyOn(simProvider, 'interpret').mockRejectedValue(new Error('boom'))
    await expect(runInterpretation('passport-q1', {}, PASSPORT_TEXT)).resolves.toEqual({ ok: false, reason: 'failed' })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Fail-closed: shape validation (isRawInterpretation)

describe('runInterpretation — malformed provider payloads all fail closed', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['empty object', {}],
    ['mappings not an array', { mappings: 'x' }],
    ['a mapping missing fields', { mappings: [{}] }],
    ['a mapping with a non-string value', { mappings: [{ questionId: 1, value: 'a', span: 'b' }] }],
    ['facts not an array', { mappings: [], facts: 'x' }],
  ])("%s -> { ok: false, reason: 'failed' }", async (_label, payload) => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.spyOn(simProvider, 'interpret').mockResolvedValue(payload as unknown as RawInterpretation)
    const result = await runInterpretation('passport-q1', {}, PASSPORT_TEXT)
    expect(result).toEqual({ ok: false, reason: 'failed' })
  })
})

// ---------------------------------------------------------------------------
// Fail-closed: timeout (design note 6)

describe('runInterpretation — timeout (design note 6)', () => {
  it("a provider that never resolves -> { ok: false, reason: 'failed' } after INTERPRETATION_TIMEOUT_MS — a provider that never settles leaves reading true forever, a dead screen with no error", async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.spyOn(simProvider, 'interpret').mockImplementation(() => new Promise(() => {}))
    const promise = runInterpretation('passport-q1', {}, PASSPORT_TEXT)
    await vi.advanceTimersByTimeAsync(INTERPRETATION_TIMEOUT_MS)
    await expect(promise).resolves.toEqual({ ok: false, reason: 'failed' })
  })
})

// ---------------------------------------------------------------------------
// Provider registry (design note 7) — UPDATED for Task 18. Through Task 17,
// VITE_INTERPRETER=gemini resolved to PROVIDERS.gemini === null, so this
// spot pinned the resulting { ok: false, reason: 'no-provider' }. Task 18
// registers the real geminiProvider, so that branch is no longer reachable
// through this id — this test now pins the OPPOSITE fact (the real adapter
// really is wired end to end), with a mocked fetch standing in for Gemini,
// never a real network call.

describe('runInterpretation — provider registry (design note 7): the real Gemini adapter is registered by Task 18', () => {
  it("VITE_INTERPRETER=gemini now resolves the REAL geminiProvider — a mocked fetch drives a normal successful result end to end, and the gated result's provenance is gemini:${MODEL_ID}, not 'no-provider'", async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.stubEnv('VITE_INTERPRETER', 'gemini')
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key-not-real')
    // Span is 3 tokens ('was'/'rejected'/'outright'), clearing the REAL
    // production floor (geminiProvider.minSpanTokens === 3, D3) — a
    // 2-token span like 'rejected outright' alone would clear the
    // simulator's floor (1) but NOT this one, which is exactly the
    // distinction D3 exists to enforce; picking a floor-clearing span here
    // keeps this test about registry wiring, not an accidental span-gate
    // rejection.
    const inner = {
      mappings: [{ questionId: 'q1', value: 'adverse', span: 'was rejected outright' }],
      facts: [],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(inner) }] } }] }),
      })),
    )
    const result = await runInterpretation('passport-q1', {}, PASSPORT_TEXT)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.interp.mappings).toEqual([
        { questionId: 'q1', value: 'adverse', span: 'was rejected outright', optionValues: expect.any(Array) },
      ])
      expect(result.interp.provenance).toBe(`gemini:${MODEL_ID}`)
    }
  })

  it('VITE_INTERPRETER=gemini with no VITE_GEMINI_API_KEY configured fails closed to { ok: false, reason: \'failed\' } (the adapter\'s own missing-key guard, caught by the whole-body try/catch), not a thrown/rejected promise', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.stubEnv('VITE_INTERPRETER', 'gemini')
    vi.stubEnv('VITE_GEMINI_API_KEY', undefined)
    await expect(runInterpretation('passport-q1', {}, PASSPORT_TEXT)).resolves.toEqual({ ok: false, reason: 'failed' })
  })
})

// ---------------------------------------------------------------------------
// Fail-closed: unknown entry screen

describe('runInterpretation — unknown entry screen', () => {
  it("returns { ok: false, reason: 'no-chain' }", async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const result = await runInterpretation('not-a-real-screen', {}, PASSPORT_TEXT)
    expect(result).toEqual({ ok: false, reason: 'no-chain' })
  })
})

// ---------------------------------------------------------------------------
// Finding 3 (Task 5 review round 1): unreachable questions now produce
// `discarded` entries the locked prototype never produced — a real,
// user-visible, now-documented consequence of enforcing reachability at the
// gate rather than in the simulator's own (request-boundary-crossing)
// reachability skip. See the comment above `req.questions` in
// `runInterpretation`, and the matching comment on `simulateInterpretation`
// in `simInterpreter.ts`, for the full trace.

describe("runInterpretation — Finding 3 pin: an unreachable follow-up question can surface as a 'discarded' entry", () => {
  it("entry question q1 matches none of its own rules, but the text incidentally matches q2's formal_grievance rule; q2 is not yet reachable (q1 unanswered), so the simulator proposes it anyway (its own reachability skip is inert across the request boundary) and gateInterpretation's branch gate discards it after the fact — discarded: [{questionId:'q2', reason:'unreachable'}], where the locked prototype (which gated itself over the real chain, before the gate ever ran) produced discarded: []", async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const result = await runInterpretation('passport-q1', {}, 'I already filed a formal grievance about this matter.')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.interp.mappings).toEqual([])
      expect(result.interp.discarded).toEqual([{ questionId: 'q2', reason: 'unreachable' }])
      expect(result.interp.unplaceable).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// The request contract: scope exclusion 4

describe('runInterpretation — the request handed to the provider (scope exclusion 4)', () => {
  it('contains only service, questions (ids + option values) and text — its exact key set, and no playbook rule content anywhere inside it', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const spy = vi.spyOn(simProvider, 'interpret').mockResolvedValue({ mappings: [], facts: [] })
    await runInterpretation('passport-q1', {}, PASSPORT_TEXT)
    expect(spy).toHaveBeenCalledTimes(1)
    const req = spy.mock.calls[0][0]
    expect(Object.keys(req).sort()).toEqual(['questions', 'service', 'text'])
    const serialized = JSON.stringify(req)
    for (const rule of passportPlaybook.rules) {
      expect(serialized).not.toContain(rule.explanation)
      expect(serialized).not.toContain(rule.whatToDo)
    }
    expect(serialized).not.toContain(passportPlaybook.fallback.explanation)
  })
})
