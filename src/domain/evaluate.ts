import type { AnswerRecord, Diagnosis, Playbook } from './types'

/** Build the UNCLASSIFIED fallback Diagnosis for a playbook: `ruleId: null`
 *  plus a snapshot of the answers it was computed from. The single place
 *  that constructs a fallback Diagnosis — used by evaluate()'s own
 *  no-rule-matched return and by engine.ts's unclassifiedKeys short-circuit,
 *  so both fallback paths stay identical by construction. */
export function fallbackDiagnosis(playbook: Playbook, answers: AnswerRecord): Diagnosis {
  return { ...playbook.fallback, ruleId: null, matchedAnswers: { ...answers } }
}

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
  return fallbackDiagnosis(playbook, answers)
}
