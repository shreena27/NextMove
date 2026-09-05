import type { AnswerRecord, Diagnosis, Playbook } from './types'
import { evaluate } from './evaluate'

/** One service's diagnosis engine: its playbook plus service-specific
 *  composition (passport's stage·rung decorator; the explicit "I'm not
 *  sure" short-circuit). The three real engines are defined with the
 *  playbook data in C2 — this module never contains service content. */
export interface ServiceEngine {
  key: string
  playbook: Playbook
  /** Applied to matched diagnoses only (e.g. stage·rung composition). */
  decorate?: (d: Diagnosis) => Diagnosis
  /** Answer keys whose literal value 'unclassified' means the citizen chose
   *  "I'm not sure" at that point: ANY of them short-circuits to the
   *  fallback, beating any rule that stale outcome keys might otherwise
   *  match first. Voter carries two ('voterQ1', 'voterAppealed') — this
   *  resolves a live contradiction between the prototype's two
   *  implementations of the same check in favor of the safer one (see the
   *  plan's recorded-deviation note). */
  unclassifiedKeys?: string[]
}

/** Pure: diagnosis is always derived fresh from the current answers,
 *  never stored (implementation plan §5). */
export function diagnose(engine: ServiceEngine, answers: AnswerRecord): Diagnosis {
  if (engine.unclassifiedKeys?.some(k => answers[k] === 'unclassified')) {
    return { ...engine.playbook.fallback, ruleId: null, matchedAnswers: { ...answers } }
  }
  const d = evaluate(engine.playbook, answers)
  return engine.decorate ? engine.decorate(d) : d
}
