// Domain types for the NextMove diagnosis engine, v2 (keyed answer model).
// Source of truth: the locked design prototype (design/nextmove-v1-prototype.html,
// tag v1-design-lock-2) and NextMove_Implementation_Plan_FINAL.md §2-§3.

/** Answers are a keyed record, never an ordered array: Voter/SIR follow-up
 *  question keys only exist depending on earlier answers, and check-in
 *  outcome keys (e.g. fOutcome) are answers too. */
export type AnswerRecord = Record<string, string>

export type Recommendation = 'WAIT' | 'FOLLOW_UP' | 'ESCALATE'
export type Classification = Recommendation | 'UNCLASSIFIED'

export interface OfficialChannel {
  label: string
  url?: string
  phone?: string
}

export interface SourceReference {
  title: string
  url?: string
  quote?: string
}

/** The content fields shared by every rule and the fallback — everything a
 *  Diagnosis/Next Move screen renders. All copy lives in playbook data (C2),
 *  never in engine code. */
export interface RuleContent {
  /** User-facing state id, e.g. "5a", "V-3", "S-4·W". */
  state: string
  label: string
  dependency: string
  explanation: string
  whatShort: string
  whatToDo: string
  where: OfficialChannel
  /** Required: every one of the 31 locked content objects defines it, and the
   *  Next Move template renders it unguarded. */
  need: string
  /** Structured alternative for rules whose "what you'll need" is a list
   *  (currently SIR's notice rule, which the prototype ships as raw <ul>
   *  markup inside `need`). Renderers prefer this when present — C3 must
   *  never dangerouslySetInnerHTML a data field. */
  needList?: string[]
  howLong?: string
  expectNext?: string
  source: SourceReference
  /** What this rule's copy must never assert — enforced by content tests (C2). */
  mustNot?: string
  /** Escalation-ladder rung label; presence enables stage·rung decoration. */
  rungLabel?: string
}

export interface PlaybookRule extends RuleContent {
  id: string
  rec: Recommendation
  condition: (answers: AnswerRecord) => boolean
}

export interface FallbackDiagnosis extends RuleContent {
  rec: 'UNCLASSIFIED'
}

export interface Diagnosis extends RuleContent {
  rec: Classification
  /** The matched rule's id, or null when the fallback fired. */
  ruleId: string | null
  /** Snapshot of the answers this diagnosis was computed from. */
  matchedAnswers: AnswerRecord
}

export interface Playbook {
  /** Data identity of the rule set ('passport' | 'voter' | 'sir').
   *  Distinct on purpose from ServiceEngine.key, which is the routing/
   *  storage prefix (the prototype's engineKey) — the two happen to share
   *  values in V1 but serve different layers. */
  serviceId: string
  /** Ordered; evaluate() is first-match-wins. */
  rules: PlaybookRule[]
  fallback: FallbackDiagnosis
}
