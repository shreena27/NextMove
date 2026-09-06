import { describe, it, expect } from 'vitest'
import { passportPlaybook, PASSPORT_STAGE_SHORT, PASSPORT_DEPS } from './passportPlaybook'
import { evaluate } from '../domain/evaluate'
import { applyCorrection } from '../domain/answers'
import { runGuardrailSuite, staleExemptionFindings, copyStrings } from './guardrails/suite'
import { extraCopy } from './guardrails/contentSafety'

const stageShortExtras = Object.entries(PASSPORT_STAGE_SHORT).map(
  ([key, text]) => extraCopy(`passport:PASSPORT_STAGE_SHORT.${key}`, text),
)

const at = (answers: Record<string, string>) => evaluate(passportPlaybook, answers).ruleId

const STAGES = ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'] as const
const BASE_RULE: Record<string, string> = {
  no_contact: 'state-1',
  contacted_incomplete: 'state-2',
  verified_no_progress: 'state-3',
  adverse: 'state-4',
}

describe('passportPlaybook shape', () => {
  it('ships 12 rules with unique ids, in the prototype order', () => {
    expect(passportPlaybook.rules.map(r => r.id)).toEqual([
      'state-5a-r', 'state-5b-r', 'state-dpg-r',
      'state-dpg-p', 'state-5b-p', 'state-5a-p',
      'state-5b', 'state-5a',
      'state-4', 'state-3', 'state-2', 'state-1',
    ])
  })

  it('is the passport service and carries an UNCLASSIFIED fallback', () => {
    expect(passportPlaybook.serviceId).toBe('passport')
    expect(passportPlaybook.fallback.rec).toBe('UNCLASSIFIED')
    expect(passportPlaybook.fallback.state).toBe('6')
  })

  it('every rule carries a classification, a dependency and a mustNot', () => {
    for (const r of passportPlaybook.rules) {
      expect(['WAIT', 'FOLLOW_UP', 'ESCALATE'], r.id).toContain(r.rec)
      expect(r.dependency.length, r.id).toBeGreaterThan(0)
      expect(r.mustNot?.length ?? 0, r.id).toBeGreaterThan(0)
    }
  })

  it('only the ladder rungs carry a rungLabel', () => {
    const withRung = passportPlaybook.rules.filter(r => r.rungLabel).map(r => r.id)
    expect(withRung).toEqual([
      'state-5a-r', 'state-5b-r', 'state-dpg-r', 'state-dpg-p', 'state-5b-p', 'state-5a-p', 'state-5b', 'state-5a',
    ])
  })
})

describe('branch tests — 4 stages x 3 follow-up answers (Implementation Plan §8)', () => {
  it.each(STAGES)('%s + no_followup lands on its own base state', stage => {
    expect(at({ q1: stage, q2: 'no_followup' })).toBe(BASE_RULE[stage])
  })

  it.each(STAGES)('%s + informal lands on the informal rung (5a), whatever the stage', stage => {
    expect(at({ q1: stage, q2: 'informal' })).toBe('state-5a')
  })

  it.each(STAGES)('%s + formal_grievance lands on the grievance rung (5b), whatever the stage', stage => {
    expect(at({ q1: stage, q2: 'formal_grievance' })).toBe('state-5b')
  })

  it('the rungs escalate: informal is FOLLOW_UP, formal grievance is ESCALATE', () => {
    expect(evaluate(passportPlaybook, { q1: 'no_contact', q2: 'informal' }).rec).toBe('FOLLOW_UP')
    expect(evaluate(passportPlaybook, { q1: 'no_contact', q2: 'formal_grievance' }).rec).toBe('ESCALATE')
  })
})

describe('recovery flow (the diagnosis half; the screens are C3)', () => {
  it("'not sure' matches no condition and falls through to the fallback with no sentinel", () => {
    expect(at({ q1: 'not_sure' })).toBeNull()
    expect(at({ q1: 'not_sure', recoveryAskedSafest: 'yes' })).toBeNull()
  })

  it('a paste-matched stage diagnoses exactly as a tapped one would', () => {
    expect(at({ q1: 'verified_no_progress', q2: 'no_followup' })).toBe('state-3')
  })

  it('an unanswered case falls through to the fallback', () => {
    expect(at({})).toBeNull()
  })
})

describe('changing Q1 clears Q2 (PRD FR-22/AC-8, via C1 applyCorrection)', () => {
  it('a changed q1 clears q2', () => {
    const r = applyCorrection({ q1: 'no_contact', q2: 'informal' }, 'q1', 'adverse', PASSPORT_DEPS)
    expect(r.answers).toEqual({ q1: 'adverse' })
  })

  it('a same-value re-tap clears nothing', () => {
    const answers = { q1: 'no_contact', q2: 'informal' }
    expect(applyCorrection(answers, 'q1', 'no_contact', PASSPORT_DEPS).answers).toBe(answers)
  })

  it('a q1 correction never clears an outcome key — the ladder never descends itself', () => {
    const r = applyCorrection(
      { q1: 'no_contact', q2: 'informal', fOutcome: 'pending', dpgFiled: 'yes' },
      'q1', 'adverse', PASSPORT_DEPS,
    )
    expect(r.answers).toEqual({ q1: 'adverse', fOutcome: 'pending', dpgFiled: 'yes' })
  })
})

describe('tracking-loop states (rule order is load-bearing)', () => {
  it.each([
    [{ q2: 'informal', fOutcome: 'pending' }, 'state-5a-p'],
    [{ q2: 'formal_grievance', gOutcome: 'pending' }, 'state-5b-p'],
    [{ dpgFiled: 'yes' }, 'state-dpg-p'],
    [{ fOutcome: 'resolved' }, 'state-5a-r'],
    [{ gOutcome: 'resolved' }, 'state-5b-r'],
    [{ dpgOutcome: 'resolved' }, 'state-dpg-r'],
  ])('%o lands on %s', (answers, ruleId) => {
    expect(at({ q1: 'no_contact', ...answers })).toBe(ruleId)
  })

  it('a resolved outcome beats the pending rung it came from', () => {
    expect(at({ q1: 'no_contact', q2: 'informal', fOutcome: 'resolved' })).toBe('state-5a-r')
  })

  it('a filed DPG escalation beats the grievance rung below it', () => {
    expect(at({ q1: 'no_contact', q2: 'formal_grievance', dpgFiled: 'yes' })).toBe('state-dpg-p')
  })

  it('every pending/resolved state is a WAIT — none re-issues the action already taken', () => {
    for (const id of ['state-5a-p', 'state-5b-p', 'state-dpg-p', 'state-5a-r', 'state-5b-r', 'state-dpg-r']) {
      expect(passportPlaybook.rules.find(r => r.id === id)!.rec, id).toBe('WAIT')
    }
  })
})

describe('PASSPORT_STAGE_SHORT', () => {
  // These 4 short labels are citizen-facing text (spliced into the rendered
  // stage·rung diagnosis label), so they are NOT exempt from the content-
  // safety scan just because they live outside passportPlaybook's own rule
  // fields. They are fed through the guardrail suite's `extra` option below
  // (see the 'guardrails' describe block) rather than scanned here directly.
  it('labels exactly the four answerable stages', () => {
    expect(Object.keys(PASSPORT_STAGE_SHORT).sort()).toEqual([...STAGES].sort())
  })

  it("has no entry for 'not_sure' — an unknown stage never decorates a label", () => {
    expect(PASSPORT_STAGE_SHORT.not_sure).toBeUndefined()
  })
})

describe('guardrails', () => {
  it('passes the full §7/§8 guardrail suite', () => {
    // `extra` feeds PASSPORT_STAGE_SHORT's 4 stage-short strings through the
    // same scanner as every rule field: this map is citizen-facing text
    // (spliced into the rendered stage·rung label) and must not be a second,
    // unscanned copy input (Fable ruling, carried over from the rungLabel
    // finding earlier in this chunk).
    runGuardrailSuite(passportPlaybook, { extra: stageShortExtras })
  })

  it('leaves no stale safety exemption for this playbook', () => {
    const ats = new Set(copyStrings(passportPlaybook).map(s => s.at))
    const mine = staleExemptionFindings(copyStrings(passportPlaybook))
      .filter(f => [...ats].some(a => f.includes(`"${a}"`)))
    expect(mine).toEqual([])
  })
})
