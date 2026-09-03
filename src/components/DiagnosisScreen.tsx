import type { Diagnosis } from '../domain/types'
import { RecommendationStatus } from './RecommendationStatus'
import { DependencyDisplay } from './DependencyDisplay'
import { ProcessTimeline } from './ProcessTimeline'
import { TrustDisclosure } from './TrustDisclosure'

const PASSPORT_STEPS = ['Application', 'Appointment', 'Police verification', 'Processing']

// Maps the Q1 stage answer to an approximate position in the fixed Passport
// sequence. Deliberately coarse — "do not show unsupported precision".
const STEP_INDEX_BY_Q1: Record<string, number> = {
  no_contact: 2,
  contacted_incomplete: 2,
  adverse: 2,
  verified_no_progress: 3,
}

function stepIndexFor(diagnosis: Diagnosis): number | undefined {
  if (diagnosis.state === '6') return undefined // status unclear — nothing to show
  const q1 = diagnosis.matchedAnswers.find((a) => a.questionId === 'q1')?.value
  return q1 ? STEP_INDEX_BY_Q1[q1] : undefined
}

interface DiagnosisScreenProps {
  diagnosis: Diagnosis
  stateLabel: string
  answerLabels?: Record<string, string>
  onSeeNextMove: () => void
}

export function DiagnosisScreen({
  diagnosis,
  stateLabel,
  answerLabels,
  onSeeNextMove,
}: DiagnosisScreenProps) {
  const stepIndex = stepIndexFor(diagnosis)
  const isClassified = diagnosis.recommendation !== 'UNCLASSIFIED'

  return (
    <div>
      <h1 className="mb-3 text-2xl font-bold text-slate-900">
        {isClassified
          ? 'We found where your application is waiting.'
          : "We can't confidently place your case yet."}
      </h1>
      <div className="mb-3">
        <RecommendationStatus recommendation={diagnosis.recommendation} />
      </div>
      <p className="mb-4 text-slate-700">{diagnosis.explanation}</p>
      <div className="mb-2">
        <DependencyDisplay dependency={diagnosis.dependency} />
      </div>
      {stepIndex !== undefined && (
        <ProcessTimeline steps={PASSPORT_STEPS} currentIndex={stepIndex} />
      )}
      <button
        type="button"
        onClick={onSeeNextMove}
        className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white hover:bg-slate-800"
      >
        See my next move →
      </button>
      <TrustDisclosure diagnosis={diagnosis} stateLabel={stateLabel} answerLabels={answerLabels} />
    </div>
  )
}
