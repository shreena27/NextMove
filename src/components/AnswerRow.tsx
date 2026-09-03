interface AnswerRowProps {
  label: string
  sublabel?: string
  onSelect: () => void
  selected?: boolean
  muted?: boolean
}

// Large, tappable answer option. A native <button> so keyboard activation
// (Enter/Space) and focus states come for free — no custom key handling.
export function AnswerRow({ label, sublabel, onSelect, selected, muted }: AnswerRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected ?? false}
      className={`w-full rounded-xl border p-4 text-left transition-colors ${
        selected
          ? 'border-slate-900 bg-slate-900 text-white'
          : muted
            ? 'border-dashed border-slate-300 text-slate-500 hover:bg-slate-50'
            : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
      }`}
    >
      <span className="block text-base font-semibold">{label}</span>
      {sublabel && (
        <span className={`mt-1 block text-sm ${selected ? 'text-slate-200' : 'text-slate-500'}`}>
          {sublabel}
        </span>
      )}
    </button>
  )
}
