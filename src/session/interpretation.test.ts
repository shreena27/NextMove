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
import type { InterpretationFailure } from './interpretation'
import { runInterpretation, provenanceLabel, INTERPRETATION_TIMEOUT_MS } from './interpretation'

afterEach(() => {
  vi.unstubAllEnvs()
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
// Design note 8: 'quota' is inert scaffolding, declared now, wired in Task 18

describe("runInterpretation — 'quota' is inert scaffolding (design note 8, I7): declared now, nothing produces it yet", () => {
  it('is a legal InterpretationFailure member (type-level)', () => {
    const failure: InterpretationFailure = 'quota'
    expect(failure).toBe('quota')
  })

  it("grep-style pin: no non-test source file under src/ contains reason: 'quota' yet — Task 18 supplies the ONLY real producer (the Gemini 429 -> quota mapping)", () => {
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
    expect(offenders).toEqual([])
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
// Fail-closed: provider registry (design note 7)

describe('runInterpretation — provider registry (design note 7)', () => {
  it("VITE_INTERPRETER=gemini before Task 18 -> { ok: false, reason: 'no-provider' }, no throw", async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    vi.stubEnv('VITE_INTERPRETER', 'gemini')
    await expect(runInterpretation('passport-q1', {}, PASSPORT_TEXT)).resolves.toEqual({ ok: false, reason: 'no-provider' })
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
