import type { NextMoveRecommendation } from '../domain/types'

interface NextMoveCardProps {
  recommendation: NextMoveRecommendation
  onPrepare: () => void
}

export function NextMoveCard({ recommendation, onPrepare }: NextMoveCardProps) {
  return (
    <div className="space-y-4">
      <Field label="What" value={recommendation.what} />
      <Field label="Why" value={recommendation.why} />
      <Field
        label="Where"
        value={
          recommendation.where.url ? (
            <a
              href={recommendation.where.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {recommendation.where.label}
            </a>
          ) : (
            recommendation.where.label
          )
        }
      />
      <Field label="What you'll need" value={recommendation.whatYoullNeed} />
      <button
        type="button"
        onClick={onPrepare}
        className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white hover:bg-slate-800"
      >
        Prepare this for me →
      </button>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-slate-900">{value}</p>
    </div>
  )
}
