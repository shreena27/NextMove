import type { Answer, Diagnosis, Playbook } from './types'

// Evaluates a Playbook's rules against the current answers in order,
// returning the first match's Diagnosis, or the playbook's fallback
// (UNCLASSIFIED) if none match. See PASSPORT_SLICE1_IMPLEMENTATION_PLAN.md §4.
export function evaluate(playbook: Playbook, answers: Answer[]): Diagnosis {
  for (const rule of playbook.rules) {
    if (rule.condition(answers)) {
      return {
        state: rule.diagnosisState,
        dependency: rule.dependency,
        recommendation: rule.recommendation,
        explanation: rule.explanation,
        matchedAnswers: answers,
        matchedRuleId: rule.id,
        action: rule.action,
        sources: rule.sources,
        whatToDo: rule.whatToDo,
        whatYoullNeed: rule.whatYoullNeed,
      }
    }
  }
  return { ...playbook.fallback, matchedAnswers: answers }
}
