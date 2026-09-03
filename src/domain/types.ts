// Domain types for the NextMove diagnosis engine.
// See PASSPORT_SLICE1_IMPLEMENTATION_PLAN.md §2 for the source of truth.

export type Recommendation = 'WAIT' | 'FOLLOW_UP' | 'ESCALATE'
export type RecommendationOrUnclassified = Recommendation | 'UNCLASSIFIED'

export interface Service {
  id: string
  label: string
  status: 'available' | 'coming_soon'
}

export interface Answer {
  questionId: string
  value: string
}

export interface OfficialAction {
  label: string
  url?: string
  phone?: string
}

export interface SourceReference {
  title: string
  url: string
  quote?: string
}

export interface PlaybookRule {
  id: string
  condition: (answers: Answer[]) => boolean
  diagnosisState: string
  dependency: string
  recommendation: Recommendation
  explanation: string
  action: OfficialAction
  sources: SourceReference[]
  guardrails?: string[]
  whatToDo: string
  whatYoullNeed: string
}

export interface Diagnosis {
  state: string
  dependency: string
  recommendation: RecommendationOrUnclassified
  explanation: string
  matchedAnswers: Answer[]
  matchedRuleId: string | null
  action?: OfficialAction
  sources?: SourceReference[]
  whatToDo?: string
  whatYoullNeed?: string
}

export interface Playbook {
  serviceId: string
  rules: PlaybookRule[]
  fallback: Diagnosis
}

// The "Your Next Move" screen's content — distinct from the WAIT/FOLLOW_UP/
// ESCALATE classification type above.
export interface NextMoveRecommendation {
  what: string
  why: string
  where: OfficialAction
  whatYoullNeed: string
}
