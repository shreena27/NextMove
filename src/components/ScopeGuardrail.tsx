import { useState } from 'react'

interface ScopeGuardrailProps {
  onInScope: () => void
  onOutOfScope: () => void
}

// PRD §6 — Passport Slice 1 only covers applications where the passport
// hasn't been issued yet. Answering "yes" exits with the guardrail message
// rather than proceeding into Q1 (FR-02 / AC-14).
export function ScopeGuardrail({ onInScope, onOutOfScope }: ScopeGuardrailProps) {
  const [answeredYes, setAnsweredYes] = useState(false)

  if (answeredYes) {
    return (
      <div className="space-y-3">
        <p className="text-lg font-semibold text-slate-900">
          This version of NextMove is designed for applications where the passport hasn't been
          issued yet.
        </p>
        <p className="text-slate-600">
          We can't help with your case here yet — check back as NextMove covers more situations.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">
        Already received your passport?
      </h1>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            setAnsweredYes(true)
            onOutOfScope()
          }}
          className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-semibold hover:bg-slate-50"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={onInScope}
          className="flex-1 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
        >
          No
        </button>
      </div>
    </div>
  )
}
