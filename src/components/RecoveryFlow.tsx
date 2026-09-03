import { useState } from 'react'
import { matchStatusText } from '../playbooks/matchStatusText'

interface RecoveryFlowProps {
  // undefined means "no confident match" -> caller routes to UNCLASSIFIED
  onResolved: (matchedStage: string | undefined) => void
  onShowMeWhere: () => void
}

// The approved recovery experience for "I'm not sure" (PRD FR-08–FR-12).
// Never forces a guess — see matchStatusText's own conservatism.
export function RecoveryFlow({ onResolved, onShowMeWhere }: RecoveryFlowProps) {
  const [mode, setMode] = useState<'choose' | 'paste'>('choose')
  const [text, setText] = useState('')

  if (mode === 'paste') {
    return (
      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Paste what your status page shows
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm"
            placeholder="Paste the status shown on Passport Seva..."
          />
        </label>
        <button
          type="button"
          onClick={() => onResolved(matchStatusText(text))}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
        >
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold text-slate-900">No problem — let's find out together.</h1>
      <button
        type="button"
        onClick={() => setMode('paste')}
        className="w-full rounded-xl border border-slate-200 p-4 text-left font-semibold hover:bg-slate-50"
      >
        Paste what your status page shows
      </button>
      <button
        type="button"
        onClick={onShowMeWhere}
        className="w-full rounded-xl border border-slate-200 p-4 text-left font-semibold hover:bg-slate-50"
      >
        Show me where to find my status
      </button>
      <button
        type="button"
        onClick={() => onResolved(undefined)}
        className="w-full rounded-xl border border-dashed border-slate-300 p-4 text-left font-semibold text-slate-500 hover:bg-slate-50"
      >
        Tell me the safest thing to do right now
      </button>
    </div>
  )
}
