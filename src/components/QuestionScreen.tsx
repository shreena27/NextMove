import { AnswerRow } from './AnswerRow'
import { ProgressIndicator } from './ProgressIndicator'

interface Option {
  value: string
  label: string
  sublabel?: string
  muted?: boolean
}

interface QuestionScreenProps {
  questionNumber: number
  totalQuestions: number
  question: string
  subtext?: string
  options: Option[]
  selectedValue?: string
  onSelect: (value: string) => void
  onBack?: () => void
}

// One question per screen, large answer rows, restrained progress —
// the Guided Casefile intake pattern, reused for every Passport question.
export function QuestionScreen({
  questionNumber,
  totalQuestions,
  question,
  subtext,
  options,
  selectedValue,
  onSelect,
  onBack,
}: QuestionScreenProps) {
  return (
    <div>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back
        </button>
      )}
      <ProgressIndicator current={questionNumber} total={totalQuestions} />
      <h1 className="mb-1 text-xl font-semibold text-slate-900">{question}</h1>
      {subtext && <p className="mb-4 text-sm text-slate-500">{subtext}</p>}
      <div className="mt-4 space-y-2">
        {options.map((o) => (
          <AnswerRow
            key={o.value}
            label={o.label}
            sublabel={o.sublabel}
            muted={o.muted}
            selected={selectedValue === o.value}
            onSelect={() => onSelect(o.value)}
          />
        ))}
      </div>
    </div>
  )
}
