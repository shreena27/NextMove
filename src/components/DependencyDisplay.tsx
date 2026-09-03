interface DependencyDisplayProps {
  dependency: string
}

export function DependencyDisplay({ dependency }: DependencyDisplayProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
      <span className="font-medium text-slate-400">Waiting on</span>
      {dependency}
    </span>
  )
}
