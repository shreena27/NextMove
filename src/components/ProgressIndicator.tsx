interface ProgressIndicatorProps {
  current: number
  total: number
}

// Understated text-only progress, no heavy bar — the question count is
// always a real prop per service, never hardcoded (see Blueprint problem #2).
export function ProgressIndicator({ current, total }: ProgressIndicatorProps) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-medium tracking-wide text-slate-400">
        Question {current} of {total}
      </p>
      <div className="h-0.5 w-full rounded-full bg-slate-100">
        <div
          className="h-0.5 rounded-full bg-slate-900 transition-all"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
    </div>
  )
}
