import { describe, it, expect } from 'vitest'
import { voterPlaybook, VOTER_DEPS, VOTER_UNCLASSIFIED_KEYS } from './voterPlaybook'
import { evaluate } from '../domain/evaluate'
import { applyCorrection } from '../domain/answers'
import { runGuardrailSuite } from './guardrails/suite'

const at = (answers: Record<string, string>) => evaluate(voterPlaybook, answers).ruleId

describe('voterPlaybook shape', () => {
  it('ships 7 rules in the prototype order', () => {
    expect(voterPlaybook.rules.map(r => r.id)).toEqual(['v-acc', 'v-5-p', 'v-5', 'v-4', 'v-3', 'v-2', 'v-1'])
  })

  it('is the voter service and carries an UNCLASSIFIED fallback', () => {
    expect(voterPlaybook.serviceId).toBe('voter')
    expect(voterPlaybook.fallback.rec).toBe('UNCLASSIFIED')
    expect(voterPlaybook.fallback.state).toBe('V-6')
  })

  it('every rule cites the ECI Electoral Roll FAQ (many rules, one source — the ERD degrade join)', () => {
    for (const r of voterPlaybook.rules) expect(r.source.docId, r.id).toBe('Final-ER-FAQ.pdf')
  })

  it('no rule carries a rungLabel — the voter ladder is rendered from answers, not decorated', () => {
    expect(voterPlaybook.rules.filter(r => r.rungLabel)).toEqual([])
  })
})

describe('branch tests — 3 base Q1 answers (Implementation Plan §8)', () => {
  it.each([
    ['no_word', 'v-1', 'WAIT'],
    ['blo_visited', 'v-2', 'WAIT'],
    ['decision', 'v-3', 'FOLLOW_UP'],
  ])('voterQ1 %s lands on %s (%s)', (voterQ1, ruleId, rec) => {
    const d = evaluate(voterPlaybook, { voterQ1 })
    expect(d.ruleId).toBe(ruleId)
    expect(d.rec).toBe(rec)
  })
})

describe("branch tests — 4 appeal follow-up outcomes on the 'decision' branch", () => {
  it.each([
    ['none', 'v-3', 'FOLLOW_UP'],
    ['pending', 'v-4', 'WAIT'],
    ['decided', 'v-5', 'ESCALATE'],
  ])('voterAppealed %s lands on %s (%s)', (voterAppealed, ruleId, rec) => {
    const d = evaluate(voterPlaybook, { voterQ1: 'decision', voterAppealed })
    expect(d.ruleId).toBe(ruleId)
    expect(d.rec).toBe(rec)
  })

  it("the fourth outcome ('I'm not sure') is handled by the engine, not by a rule", () => {
    // evaluate() knows nothing of unclassifiedKeys: this is v-3 here on purpose.
    // diagnose() turns it into the UNCLASSIFIED fallback — asserted in engines.test.ts.
    expect(at({ voterQ1: 'decision', voterAppealed: 'unclassified' })).toBe('v-3')
    expect(VOTER_UNCLASSIFIED_KEYS).toEqual(['voterQ1', 'voterAppealed'])
  })

  it('the appeal answer only bites on the decision branch', () => {
    expect(at({ voterQ1: 'no_word', voterAppealed: 'decided' })).toBe('v-1')
  })

  it('an unanswered case falls through to the fallback', () => {
    expect(at({})).toBeNull()
  })
})

describe('changing Q1 clears the appeal answer (both keys)', () => {
  it('clears voterAppealed and voterAppealedRaw together', () => {
    const r = applyCorrection(
      { voterQ1: 'decision', voterAppealed: 'pending', voterAppealedRaw: 'pending' },
      'voterQ1', 'no_word', VOTER_DEPS,
    )
    expect(r.answers).toEqual({ voterQ1: 'no_word' })
  })

  it('staying on the decision branch clears nothing (same value = no-op)', () => {
    const answers = { voterQ1: 'decision', voterAppealed: 'pending', voterAppealedRaw: 'pending' }
    expect(applyCorrection(answers, 'voterQ1', 'decision', VOTER_DEPS).answers).toBe(answers)
  })

  it('a Q1 correction never clears a voter outcome key', () => {
    const r = applyCorrection(
      { voterQ1: 'decision', voterAppealed: 'pending', voterOutcome: 'accepted_pending', ceoAppeal: 'filed' },
      'voterQ1', 'no_word', VOTER_DEPS,
    )
    expect(r.answers).toEqual({ voterQ1: 'no_word', voterOutcome: 'accepted_pending', ceoAppeal: 'filed' })
  })
})

describe('tracking-loop states', () => {
  it('a favourable decision with nothing delivered yet lands on v-acc, not back on "awaiting decision"', () => {
    expect(at({ voterQ1: 'decision', voterOutcome: 'accepted_pending' })).toBe('v-acc')
    expect(evaluate(voterPlaybook, { voterQ1: 'decision', voterOutcome: 'accepted_pending' }).rec).toBe('WAIT')
  })

  it('a filed second appeal lands on v-5-p, not back on the ESCALATE that prompted it', () => {
    expect(at({ voterQ1: 'decision', voterAppealed: 'decided', ceoAppeal: 'filed' })).toBe('v-5-p')
    expect(evaluate(voterPlaybook, { ceoAppeal: 'filed' }).rec).toBe('WAIT')
  })

  it('v-acc outranks v-5-p (rule order is load-bearing)', () => {
    expect(at({ voterOutcome: 'accepted_pending', ceoAppeal: 'filed' })).toBe('v-acc')
  })
})

describe('guardrails', () => {
  it('passes the full §7/§8 guardrail suite', () => {
    runGuardrailSuite(voterPlaybook)
  })
})
