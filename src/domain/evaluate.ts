import type { AnswerRecord, Diagnosis, Playbook } from './types'

/** First-match-wins over the playbook's ordered rules; exactly one fallback
 *  path (UNCLASSIFIED, ruleId null). Mirrors the locked prototype's
 *  evaluate() verbatim in behavior. */
export function evaluate(playbook: Playbook, answers: AnswerRecord): Diagnosis {
  for (const rule of playbook.rules) {
    if (rule.condition(answers)) {
      const { condition: _condition, id, ...content } = rule
      return { ...content, ruleId: id, matchedAnswers: { ...answers } }
    }
  }
  return { ...playbook.fallback, ruleId: null, matchedAnswers: { ...answers } }
}
