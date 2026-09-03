import { describe, it, expect } from 'vitest'
import { evaluate } from './playbook'
import type { Playbook, Answer, Diagnosis } from './types'

const fallback: Diagnosis = {
  state: 'unclassified',
  dependency: 'unknown',
  recommendation: 'UNCLASSIFIED',
  explanation: 'fallback explanation',
  matchedAnswers: [],
  matchedRuleId: null,
}

function makePlaybook(): Playbook {
  return {
    serviceId: 'test-service',
    fallback,
    rules: [
      {
        id: 'rule-a',
        condition: (answers) => answers.some((a) => a.value === 'x'),
        diagnosisState: 'state-a',
        dependency: 'dep-a',
        recommendation: 'WAIT',
        explanation: 'exp-a',
        action: { label: 'do it' },
        sources: [],
        whatToDo: 'do a',
        whatYoullNeed: 'nothing',
      },
      {
        id: 'rule-b',
        condition: (answers) => answers.some((a) => a.value === 'y'),
        diagnosisState: 'state-b',
        dependency: 'dep-b',
        recommendation: 'ESCALATE',
        explanation: 'exp-b',
        action: { label: 'escalate it' },
        sources: [],
        whatToDo: 'do b',
        whatYoullNeed: 'nothing',
      },
    ],
  }
}

describe('evaluate', () => {
  it('returns the diagnosis from the first matching rule', () => {
    const answers: Answer[] = [{ questionId: 'q1', value: 'x' }]

    const result = evaluate(makePlaybook(), answers)

    expect(result.state).toBe('state-a')
    expect(result.recommendation).toBe('WAIT')
    expect(result.matchedRuleId).toBe('rule-a')
    expect(result.matchedAnswers).toEqual(answers)
  })

  it('stops at the first matching rule and ignores later matches', () => {
    const answers: Answer[] = [
      { questionId: 'q1', value: 'x' },
      { questionId: 'q2', value: 'y' },
    ]

    const result = evaluate(makePlaybook(), answers)

    expect(result.matchedRuleId).toBe('rule-a')
  })

  it('returns the fallback diagnosis when no rule matches, carrying the real answers given', () => {
    const answers: Answer[] = [{ questionId: 'q1', value: 'z' }]

    const result = evaluate(makePlaybook(), answers)

    expect(result).toEqual({ ...fallback, matchedAnswers: answers })
  })
})
