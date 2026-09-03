interface ServiceCardProps {
  label: string
  description: string
  // available: functional, clickable (Passport).
  // visible_inactive: shown but has no workflow yet (Voter Services) — no
  //   "Coming Soon" badge, since that phrase is reserved for a service that
  //   isn't built at all (PRD §4 distinguishes these explicitly).
  // coming_soon: not implemented, explicit badge + demand-capture framing
  //   (Income Certificate).
  status: 'available' | 'visible_inactive' | 'coming_soon'
  onSelect?: () => void
}

// Reusable across services (Blueprint §F) — Voter Services renders the same
// card with status "available" once its workflow ships.
export function ServiceCard({ label, description, status, onSelect }: ServiceCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{label}</h3>
        {status === 'coming_soon' && (
          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-400">
            Coming Soon
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </>
  )

  if (status === 'available' && onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="w-full rounded-xl border border-slate-200 p-4 text-left hover:border-slate-400 hover:bg-slate-50"
      >
        {content}
      </button>
    )
  }

  return <div className="w-full rounded-xl border border-slate-100 bg-slate-50 p-4">{content}</div>
}
