import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Casefile } from '../domain/casefile'
import { loadCases, saveCases } from './caseStore'

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

    nowSpy.mockRestore()
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
