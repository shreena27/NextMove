interface ProcessTimelineProps {
  steps: string[]
  currentIndex: number
}

// The structure is fixed and reusable; the step list is always a prop so
// Voter Services can pass its own sequence later (Blueprint §F).
export function ProcessTimeline({ steps, currentIndex }: ProcessTimelineProps) {
  return (
    <ol className="my-4 space-y-3 border-l-2 border-slate-200 pl-4">
      {steps.map((step, i) => {
        const done = i < currentIndex
        const current = i === currentIndex
        return (
          <li key={step} aria-current={current ? 'step' : undefined} className="relative">
            <span
              aria-hidden="true"
              className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 ${
                done
                  ? 'border-emerald-600 bg-emerald-600'
                  : current
                    ? 'border-slate-900 bg-slate-900'
                    : 'border-slate-300 bg-white'
              }`}
            />
            <span
              className={`text-sm ${current ? 'font-semibold text-slate-900' : done ? 'text-slate-500' : 'text-slate-400'}`}
            >
              {step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
