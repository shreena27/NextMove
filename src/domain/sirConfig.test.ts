import { describe, it, expect } from 'vitest'
import { optionsForPhase, sirCoverage, type SirStateConfig, type SirPhase } from './sirConfig'

const phaseA: SirPhase = { id: 'phase_a', label: 'Toy phase A', note: 'Toy note A.' }
const phaseB: SirPhase = { id: 'phase_b', label: 'Toy phase B', note: 'Toy note B.' }

const supported: SirStateConfig = { id: 'toyland', name: 'Toyland', supported: true, phase: phaseA }
const unsupported: SirStateConfig = { id: 'elsewhere', name: 'Elsewhere', supported: false }

const optionsByPhase = {
  phase_a: { opt1: 'Toy option 1', opt2: 'Toy option 2' },
  phase_b: { opt3: 'Toy option 3' },
}

describe('optionsForPhase', () => {
  it("returns exactly the current phase's option set", () => {
    expect(optionsForPhase(supported, optionsByPhase)).toEqual(optionsByPhase.phase_a)
  })

  it('flipping the configured phase swaps the option set with zero other changes', () => {
    const advanced: SirStateConfig = { ...supported, phase: phaseB }
    expect(optionsForPhase(advanced, optionsByPhase)).toEqual(optionsByPhase.phase_b)
  })

  it('throws for an unsupported state (options are structurally absent)', () => {
    expect(() => optionsForPhase(unsupported, optionsByPhase)).toThrow(/unsupported/i)
  })

  it('throws for a phase with no configured options', () => {
    const misconfigured: SirStateConfig = {
      ...supported,
      phase: { id: 'phase_missing', label: 'Toy', note: 'Toy.' },
    }
    expect(() => optionsForPhase(misconfigured, optionsByPhase)).toThrow(/phase_missing/)
  })
})

describe('sirCoverage (structural coverage verdict)', () => {
  it('a supported state with a verified phase is covered', () => {
    expect(sirCoverage(supported)).toBe('covered')
  })

  it('an unsupported state is out of coverage', () => {
    expect(sirCoverage(unsupported)).toBe('out-of-coverage')
  })

  it('a supported state missing its phase config is out of coverage, never diagnosed (hardening: the prototype crashes here)', () => {
    const broken: SirStateConfig = { id: 'broken', name: 'Broken', supported: true }
    expect(sirCoverage(broken)).toBe('out-of-coverage')
  })
})
