import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Casefile } from '../domain/casefile'
import { loadCases, saveCases, clearLocalCases } from './caseStore'
import { diagnose } from '../domain/engine'
import { voterEngine } from '../playbooks/engines'
import type { Fact } from '../domain/interpret'

// Task 8: a real Fact, so the round-trip test below exercises caseFacts as a
// real payload, not an empty placeholder.
const FIXTURE_FACT: Fact = {
  kind: 'reference_number', refType: 'passport_file_no', label: 'File Number',
  value: 'AB1234567890123', fills: '[File Number / ARN]',
}

function makeCasefile(overrides: Partial<Casefile> = {}): Casefile {
  return {
    engineKey: 'passport',
    serviceLabel: 'Passport',
    returnScreen: 'passport-nextmove',
    answers: { q1: 'adverse', q2: 'informal' },
    prepChecks: { 0: true },
    savedAt: 1_700_000_000_000,
    stateLabel: 'Followed up informally, unresolved',
    rec: 'FOLLOW_UP',
    whatShort: 'Move to a formal Grievance / CPGRAMS filing',
    stepsTotal: 5,
    stepsDone: 1,
    sirPhaseId: null,
    // Task 8: real, non-empty defaults, so a caller that never overrides
    // them still exercises the localStorage round trip for real (RED item
    // 31) rather than round-tripping an empty/null placeholder every time.
    caseFacts: [FIXTURE_FACT],
    appliedText: 'they rejected my application',
    interpProvenance: 'simulated (local matcher)',
    id: 'c1700000000000',
    outcome: 'still_open',
    lastCheck: null,
    remindAt: null,
    log: [{ t: 1_700_000_000_000, kind: 'diagnosed', text: 'Followed up informally, unresolved' }],
    ...overrides,
  }
}

// jsdom's REAL localStorage, cleared before every test so cases from one
// test never leak into the next.
beforeEach(() => {
  localStorage.clear()
})

describe('loadCases / saveCases', () => {
  it('round-trips a case list', () => {
    const cases = [makeCasefile({ id: 'c1' }), makeCasefile({ id: 'c2', engineKey: 'voter' })]
    saveCases(cases)
    expect(loadCases()).toEqual(cases)
  })

  // Task 8, RED item 31: C7 scope exclusion 5 promised no migration for the
  // localStorage path — the schema-free serialise/parse round trip carries
  // caseFacts/appliedText/interpProvenance losslessly, same as C7's own
  // maximal-fixture proof for the server row (caseSync.test.ts).
  it('round-trips caseFacts / appliedText / interpProvenance losslessly', () => {
    const c = makeCasefile({ id: 'c1' })
    saveCases([c])
    const loaded = loadCases()
    expect(loaded[0].caseFacts).toEqual([FIXTURE_FACT])
    expect(loaded[0].appliedText).toBe('they rejected my application')
    expect(loaded[0].interpProvenance).toBe('simulated (local matcher)')
  })

  // Fix round 1, Finding 4: C7 (auth) is already deployed to production, so
  // a real citizen's `nm_cases` entry can genuinely predate Task 8's three
  // new fields — this is not a hypothetical shape. Before this fix,
  // `loadCases()` did a blind `raw as Casefile[]` cast with no per-record
  // normalization, so a record like this reached `loadCaseFragment`'s own
  // `c.caseFacts.slice()` (session/cases.ts) as `undefined` and crashed the
  // first time the case was opened — the same crash mechanism this file's
  // own `migrateLegacyCase` fix (above) already closed for `answers`/
  // `prepChecks` on the OLDER single-case format.
  it(
    'a legacy nm_cases entry from before Task 8 shipped, missing caseFacts/appliedText/interpProvenance ' +
    'entirely, loads without crashing and normalizes to []/null/null',
    () => {
      const full = makeCasefile({ id: 'c1' })
      const { caseFacts: _caseFacts, appliedText: _appliedText, interpProvenance: _interpProvenance, ...legacyShaped } = full
      localStorage.setItem('nm_cases', JSON.stringify([legacyShaped]))
      // guards the premise: the stored value really is missing the keys,
      // not merely holding them as null
      expect('caseFacts' in JSON.parse(localStorage.getItem('nm_cases')!)[0]).toBe(false)

      let loaded: Casefile[] | undefined
      expect(() => { loaded = loadCases() }).not.toThrow()

      expect(loaded).toHaveLength(1)
      expect(loaded![0].caseFacts).toEqual([])
      expect(loaded![0].appliedText).toBeNull()
      expect(loaded![0].interpProvenance).toBeNull()
      // everything else on the legacy record survives untouched
      expect(loaded![0].id).toBe('c1')
      expect(loaded![0].answers).toEqual(full.answers)
    },
  )

  it('returns [] on empty storage', () => {
    expect(loadCases()).toEqual([])
  })

  it('returns [] on malformed JSON', () => {
    localStorage.setItem('nm_cases', '{not valid json')
    expect(loadCases()).toEqual([])
  })

  it('returns [] when the stored value is not an array (corrupt storage, fails closed)', () => {
    localStorage.setItem('nm_cases', JSON.stringify({ not: 'an array' }))
    expect(loadCases()).toEqual([])
  })

  it('does not throw when localStorage.setItem throws (storage full/disabled)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveCases([makeCasefile()])).not.toThrow()
    spy.mockRestore()
  })

  it('does not throw, and fails soft to [], when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    let result: Casefile[] | undefined
    expect(() => { result = loadCases() }).not.toThrow()
    expect(result).toEqual([])
    spy.mockRestore()
  })
})

// Pulled forward from Task 8's own RED list (docs/superpowers/plans/
// 2026-09-07-c7-auth.md, Task 8 RED bullet 1) — see clearLocalCases()'s own
// doc comment in caseStore.ts for why Task 7 needs this function to exist
// before Task 8 is reached.
describe('clearLocalCases', () => {
  it('removes nm_cases', () => {
    saveCases([makeCasefile()])
    expect(localStorage.getItem('nm_cases')).not.toBeNull()

    clearLocalCases()

    expect(localStorage.getItem('nm_cases')).toBeNull()
  })

  it('does not throw when localStorage.removeItem throws (storage full/disabled)', () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => clearLocalCases()).not.toThrow()
    spy.mockRestore()
  })
})

describe('nm_case -> nm_cases migration', () => {
  it('wraps a minimal legacy case, writes nm_cases, and removes nm_case', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    localStorage.setItem('nm_case', JSON.stringify({ engineKey: 'voter' }))

    const cases = loadCases()

    expect(cases).toHaveLength(1)
    expect(cases[0].id).toBe('c1800000000000')
    expect(cases[0].outcome).toBe('still_open')
    expect(cases[0].returnScreen).toBe('voter-nextmove')
    expect(cases[0].log).toEqual([{ t: 1_800_000_000_000, kind: 'diagnosed', text: 'Case saved' }])
    expect(localStorage.getItem('nm_case')).toBeNull()
    expect(JSON.parse(localStorage.getItem('nm_cases')!)).toHaveLength(1)
    // FIX WAVE (2026-09-06, whole-branch final review, Critical finding 1,
    // symptom 2): the old single-case format never reliably stored
    // `answers`/`prepChecks` — this fixture's `{engineKey:'voter'}` legacy
    // value has neither. Normalized to `{}`, not left `undefined`.
    expect(cases[0].answers).toEqual({})
    expect(cases[0].prepChecks).toEqual({})
    // Task 8, RED item 31 / design note 5: the legacy `nm_case` shape
    // predates caseFacts/appliedText/interpProvenance entirely — migration
    // must produce [] / null / null, never `undefined` (a Casefile with
    // `undefined` where caseFacts is typed as an array crashes the first
    // `.map` a prepare-screen render does over it).
    expect(cases[0].caseFacts).toEqual([])
    expect(cases[0].appliedText).toBeNull()
    expect(cases[0].interpProvenance).toBeNull()

    nowSpy.mockRestore()
  })

  it('a migrated legacy case with no stored answers never crashes diagnose() — it resolves to the UNCLASSIFIED fallback, the same as an ordinary case opened with no answers', () => {
    localStorage.setItem('nm_case', JSON.stringify({ engineKey: 'voter' }))
    const cases = loadCases()
    // Pre-fix, `cases[0].answers` was `undefined` (transcribed straight
    // through from the legacy value, which never had the key) and this
    // call threw `TypeError: Cannot convert undefined or null to object`
    // (or similar) the first time `rule.condition(undefined)` ran — the
    // first time such a migrated card was ever opened.
    expect(() => diagnose(voterEngine, cases[0].answers)).not.toThrow()
    expect(diagnose(voterEngine, cases[0].answers).ruleId).toBeNull() // UNCLASSIFIED
  })

  it("prefers the legacy case's own savedAt / returnScreen / stateLabel when present — every || is a real fallback, not decoration", () => {
    localStorage.setItem('nm_case', JSON.stringify({
      engineKey: 'passport',
      savedAt: 1_650_000_000_000,
      returnScreen: 'passport-diagnosis',
      stateLabel: 'Followed up informally, unresolved',
    }))

    const cases = loadCases()

    expect(cases[0].id).toBe('c1650000000000')
    expect(cases[0].returnScreen).toBe('passport-diagnosis')
    expect(cases[0].log).toEqual([
      { t: 1_650_000_000_000, kind: 'diagnosed', text: 'Followed up informally, unresolved' },
    ])
  })

  it('a second loadCases() is a no-op — migration runs once', () => {
    localStorage.setItem('nm_case', JSON.stringify({ engineKey: 'sir', savedAt: 1_600_000_000_000 }))

    const first = loadCases()
    const storedAfterFirst = localStorage.getItem('nm_cases')

    const second = loadCases()

    expect(second).toEqual(first)
    expect(localStorage.getItem('nm_cases')).toBe(storedAfterFirst)
    expect(localStorage.getItem('nm_case')).toBeNull()
  })

  it('does not run when nm_cases is already non-empty, and leaves nm_case untouched', () => {
    const existing = [makeCasefile({ id: 'already-here' })]
    localStorage.setItem('nm_cases', JSON.stringify(existing))
    localStorage.setItem('nm_case', JSON.stringify({ engineKey: 'voter', savedAt: 1 }))

    const cases = loadCases()

    expect(cases).toEqual(existing)
    expect(localStorage.getItem('nm_case')).not.toBeNull()
  })

  it('does not run when nm_case is absent, even with no saved cases', () => {
    expect(loadCases()).toEqual([])
    expect(localStorage.getItem('nm_cases')).toBeNull()
  })
})
