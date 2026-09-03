import type { RecommendationOrUnclassified } from '../domain/types'

const CONFIG: Record<
  RecommendationOrUnclassified,
  { label: string; dot: string; text: string; bg: string }
> = {
  WAIT: { label: 'Wait', dot: 'bg-emerald-600', text: 'text-emerald-800', bg: 'bg-emerald-50' },
  FOLLOW_UP: { label: 'Follow up', dot: 'bg-amber-600', text: 'text-amber-800', bg: 'bg-amber-50' },
  ESCALATE: { label: 'Escalate', dot: 'bg-rose-600', text: 'text-rose-800', bg: 'bg-rose-50' },
  UNCLASSIFIED: {
    label: 'Unclassified',
    dot: 'bg-slate-500',
    text: 'text-slate-700',
    bg: 'bg-slate-100',
  },
}

interface RecommendationStatusProps {
  recommendation: RecommendationOrUnclassified
}

// Color is supporting information only — the text label is always present
// so the classification never depends on color perception alone (FR-14).
export function RecommendationStatus({ recommendation }: RecommendationStatusProps) {
  const c = CONFIG[recommendation]
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${c.bg} ${c.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden="true" />
      {c.label}
    </span>
  )
}
