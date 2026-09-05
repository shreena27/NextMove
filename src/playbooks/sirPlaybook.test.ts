import { describe, it, expect } from 'vitest'
import { sirPlaybook, SIR_PHASES, SIR_STATES, SIR_Q1_OPTIONS_FOR, sirCopyExtras } from './sirPlaybook'
import { evaluate } from '../domain/evaluate'
import { optionsForPhase, sirCoverage, type SirStateConfig } from '../domain/sirConfig'
import { runGuardrailSuite } from './guardrails/suite'

const at = (answers: Record<string, string>) => evaluate(sirPlaybook, answers).ruleId

/** The rules reachable from a phase's own Q1 options — structural, not filtered. */
const reachable = (phaseId: string) =>
  Object.keys(SIR_Q1_OPTIONS_FOR[phaseId]).map(v => at({ sirQ1: v })).sort()

describe('sirPlaybook shape', () => {
  it('ships 9 rules in the prototype order', () => {
    expect(sirPlaybook.rules.map(r => r.id)).toEqual([
      's-4-p', 's-3-p', 's-notice', 's-roll-absent', 's-roll-unchecked',
      's-final-absent', 's-final-present', 's-final-unchecked', 's-roll-present',
    ])
  })

  it('is the sir service and carries an UNCLASSIFIED fallback', () => {
    expect(sirPlaybook.serviceId).toBe('sir')
    expect(sirPlaybook.fallback.rec).toBe('UNCLASSIFIED')
    expect(sirPlaybook.fallback.state).toBe('S-7')
  })

  it('does not ship the phase-retired duplicate-registration rule', () => {
    expect(sirPlaybook.rules.find(r => r.id === 's-duplicate')).toBeUndefined()
    for (const opts of Object.values(SIR_Q1_OPTIONS_FOR)) {
      expect(Object.keys(opts)).not.toContain('duplicate')
    }
  })
})

describe("s-notice's need list (C1 handoff: <ul> markup -> needList)", () => {
  const notice = () => sirPlaybook.rules.find(r => r.id === 's-notice')!

  it('keeps a plain-text lead-in and carries no markup anywhere', () => {
    expect(notice().need).toBe('Any ONE of these:')
    expect(notice().need).not.toMatch(/[<>]/)
    for (const item of notice().needList!) expect(item).not.toMatch(/[<>]/)
  })

  it("holds the ECI's twelve prescribed documents, in the source's order", () => {
    expect(notice().needList).toEqual([
      'A government/PSU ID or pension order',
      'A pre-1987 government/bank/LIC/PSU-issued ID',
      'Birth certificate',
      'Passport',
      'Matriculation/educational certificate',
      'Permanent residence certificate',
      'Forest right certificate',
      'Caste certificate',
      'NRC (where it exists)',
      'Family register',
      'Land/house allotment certificate',
      'Aadhaar (per the specific 2025 ECI direction)',
    ])
  })

  it('is the only rule that needs a list', () => {
    expect(sirPlaybook.rules.filter(r => r.needList).map(r => r.id)).toEqual(['s-notice'])
  })
})

describe('SIR_STATES / coverage boundary', () => {
  it('materializes every map key into the record id (C1 handoff)', () => {
    for (const [key, state] of Object.entries(SIR_STATES)) expect(state.id).toBe(key)
  })

  it('covers Delhi alone in V1', () => {
    expect(sirCoverage(SIR_STATES.delhi)).toBe('covered')
    for (const key of ['bihar', 'maharashtra', 'up', 'other']) {
      expect(sirCoverage(SIR_STATES[key]), key).toBe('out-of-coverage')
    }
  })

  it('gives every unsupported state no phase at all — impossible options are structurally absent', () => {
    for (const key of ['bihar', 'maharashtra', 'up', 'other']) {
      expect(SIR_STATES[key].phase, key).toBeUndefined()
      expect(() => optionsForPhase(SIR_STATES[key], SIR_Q1_OPTIONS_FOR)).toThrow(/unsupported/i)
    }
  })
})

describe('branch tests — Delhi in its verified current phase (Implementation Plan §8)', () => {
  it('offers exactly the four claims-and-objections situations', () => {
    expect(Object.keys(optionsForPhase(SIR_STATES.delhi, SIR_Q1_OPTIONS_FOR)))
      .toEqual(['roll_present', 'roll_absent', 'roll_unchecked', 'notice'])
  })

  it.each([
    ['roll_present', 's-roll-present', 'WAIT'],
    ['roll_absent', 's-roll-absent', 'FOLLOW_UP'],
    ['roll_unchecked', 's-roll-unchecked', 'FOLLOW_UP'],
    ['notice', 's-notice', 'FOLLOW_UP'],
  ])('sirQ1 %s lands on %s (%s)', (sirQ1, ruleId, rec) => {
    const d = evaluate(sirPlaybook, { sirQ1 })
    expect(d.ruleId).toBe(ruleId)
    expect(d.rec).toBe(rec)
  })

  it("'I'm not sure' matches no rule and reaches the fallback (never a guessed phase)", () => {
    expect(at({ sirQ1: 'unclassified' })).toBeNull()
  })

  it('the final-phase states are unreachable from this phase, by construction', () => {
    const claims = reachable('claims_notice')
    for (const id of ['s-final-present', 's-final-absent', 's-final-unchecked']) {
      expect(claims, id).not.toContain(id)
    }
  })
})

describe('phase flip — the extensibility claim, with zero engine changes', () => {
  const advanced: SirStateConfig = { ...SIR_STATES.delhi, phase: SIR_PHASES.final_roll }

  it('one config field swaps the offered option set', () => {
    expect(Object.keys(optionsForPhase(advanced, SIR_Q1_OPTIONS_FOR)))
      .toEqual(['final_present', 'final_absent', 'final_unchecked'])
  })

  it.each([
    ['final_present', 's-final-present', 'WAIT'],
    ['final_absent', 's-final-absent', 'ESCALATE'],
    ['final_unchecked', 's-final-unchecked', 'FOLLOW_UP'],
  ])('sirQ1 %s lands on %s (%s)', (sirQ1, ruleId, rec) => {
    const d = evaluate(sirPlaybook, { sirQ1 })
    expect(d.ruleId).toBe(ruleId)
    expect(d.rec).toBe(rec)
  })

  it('makes EXACTLY the final-phase states reachable and retires the draft-phase ones', () => {
    expect(reachable('final_roll')).toEqual(['s-final-absent', 's-final-present', 's-final-unchecked'])
    expect(reachable('final_roll')).not.toContain('s-roll-unchecked')
  })

  it('the two phases share no reachable state', () => {
    const a = new Set(reachable('claims_notice'))
    expect(reachable('final_roll').some(id => a.has(id))).toBe(false)
  })

  it('needs no change to the playbook, the engine, or any rule condition', () => {
    // The only difference between the two runs above is delhi.phase.
    expect(SIR_STATES.delhi.phase).toBe(SIR_PHASES.claims_notice)
    expect(advanced.phase).toBe(SIR_PHASES.final_roll)
  })
})

describe('tracking-loop states', () => {
  it('a filed Form 6 lands on s-3-p, not back on "file Form 6"', () => {
    expect(at({ sirQ1: 'roll_absent', form6Filed: 'yes' })).toBe('s-3-p')
    expect(evaluate(sirPlaybook, { sirQ1: 'roll_absent', form6Filed: 'yes' }).rec).toBe('WAIT')
  })

  it('submitted notice documents land on s-4-p, not back on "submit the documents"', () => {
    expect(at({ sirQ1: 'notice', sirDocsFiled: 'yes' })).toBe('s-4-p')
    expect(evaluate(sirPlaybook, { sirQ1: 'notice', sirDocsFiled: 'yes' }).rec).toBe('WAIT')
  })

  it('s-4-p outranks s-3-p (rule order is load-bearing)', () => {
    expect(at({ sirDocsFiled: 'yes', form6Filed: 'yes' })).toBe('s-4-p')
  })
})

describe('guardrails', () => {
  it('passes the full §7/§8 guardrail suite, including SIR-only copy and the retired-action scan', () => {
    runGuardrailSuite(sirPlaybook, { extra: sirCopyExtras(), currentPhaseId: SIR_STATES.delhi.phase!.id })
  })

  it('stays clean under the final_roll phase too, before C6 ever flips it', () => {
    // The three final-phase rules are the ones carrying the sourced 15-day
    // interval, and the Enumeration Form stays retired in that phase too.
    // Proving them clean now closes the gap ahead of the flip.
    runGuardrailSuite(sirPlaybook, { extra: sirCopyExtras(), currentPhaseId: SIR_PHASES.final_roll.id })
  })

  it('no action field instructs the retired Enumeration Form filing', () => {
    for (const r of sirPlaybook.rules) {
      expect(`${r.whatShort} ${r.whatToDo} ${r.where.label}`, r.id).not.toMatch(/enumeration form/i)
    }
  })

  it("the citizen's filing deadline is 30 Sep, never the ERO's 29 Oct disposal date", () => {
    for (const id of ['s-roll-absent', 's-roll-unchecked']) {
      const r = sirPlaybook.rules.find(x => x.id === id)!
      expect(r.howLong, id).toMatch(/30 Sep 2026/)
      expect(`${r.whatToDo} ${r.howLong}`, id).not.toMatch(/29 Oct/)
    }
  })
})
