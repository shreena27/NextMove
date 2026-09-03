import { describe, it, expect } from 'vitest'
import { evaluate } from '../domain/playbook'
import { passportPlaybook } from './passportPlaybook'
import type { Answer } from '../domain/types'

function answers(q1: string, q2?: string): Answer[] {
  const a: Answer[] = [{ questionId: 'q1', value: q1 }]
  if (q2) a.push({ questionId: 'q2', value: q2 })
  return a
}

// The full Q1 x Q2 mapping table from NEXTMOVE_PRD.md §8.
describe('passportPlaybook — Q1 x Q2 mapping', () => {
  it.each([
    ['no_contact', 'no_followup', '1', 'WAIT'],
    ['no_contact', 'informal', '5a', 'FOLLOW_UP'],
    ['no_contact', 'formal_grievance', '5b', 'ESCALATE'],
    ['contacted_incomplete', 'no_followup', '2', 'FOLLOW_UP'],
    ['contacted_incomplete', 'informal', '5a', 'FOLLOW_UP'],
    ['contacted_incomplete', 'formal_grievance', '5b', 'ESCALATE'],
    ['verified_no_progress', 'no_followup', '3', 'FOLLOW_UP'],
    ['verified_no_progress', 'informal', '5a', 'FOLLOW_UP'],
    ['verified_no_progress', 'formal_grievance', '5b', 'ESCALATE'],
    ['adverse', 'no_followup', '4', 'FOLLOW_UP'],
    ['adverse', 'informal', '5a', 'FOLLOW_UP'],
    ['adverse', 'formal_grievance', '5b', 'ESCALATE'],
  ] as const)(
    'q1=%s, q2=%s -> state %s (%s)',
    (q1, q2, expectedState, expectedRecommendation) => {
      const result = evaluate(passportPlaybook, answers(q1, q2))

      expect(result.state).toBe(expectedState)
      expect(result.recommendation).toBe(expectedRecommendation)
    },
  )

  it('falls back to UNCLASSIFIED when Q1 is "not sure" with no further answer', () => {
    const result = evaluate(passportPlaybook, answers('not_sure'))

    expect(result.state).toBe('6')
    expect(result.recommendation).toBe('UNCLASSIFIED')
    expect(result.matchedRuleId).toBeNull()
  })

  it('falls back to UNCLASSIFIED when no answers are given at all', () => {
    const result = evaluate(passportPlaybook, [])

    expect(result.recommendation).toBe('UNCLASSIFIED')
  })
})

describe('passportPlaybook — content guardrails', () => {
  it('state 2 never claims the applicant owes an action (point 3 constraint)', () => {
    const result = evaluate(
      passportPlaybook,
      answers('contacted_incomplete', 'no_followup'),
    )

    expect(result.explanation.toLowerCase()).not.toMatch(
      /you (may|might) (owe|need to)|action (is|may be) required from you/,
    )
  })

  it('state 4 (adverse) never states or implies a cause', () => {
    const result = evaluate(passportPlaybook, answers('adverse', 'no_followup'))

    expect(result.explanation.toLowerCase()).not.toMatch(
      /because|due to|the reason is|caused by/,
    )
  })

  it('every rule with a WAIT/FOLLOW_UP/ESCALATE recommendation carries at least one source', () => {
    for (const rule of passportPlaybook.rules) {
      expect(rule.sources.length).toBeGreaterThan(0)
    }
  })

  it('every rule carries non-empty whatToDo and whatYoullNeed content for the Next Move screen', () => {
    for (const rule of passportPlaybook.rules) {
      expect(rule.whatToDo.length).toBeGreaterThan(0)
      expect(rule.whatYoullNeed.length).toBeGreaterThan(0)
    }
  })

  it('the fallback (state 6) carries no dependency or source claim', () => {
    expect(passportPlaybook.fallback.dependency.toLowerCase()).toContain('unknown')
    expect(passportPlaybook.fallback.sources ?? []).toHaveLength(0)
  })
})
