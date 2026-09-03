import { useState } from 'react'
import type { Diagnosis } from '../domain/types'

interface TrustDisclosureProps {
  diagnosis: Diagnosis
  stateLabel: string
  answerLabels?: Record<string, string>
}

function humanize(value: string) {
  return value.replaceAll('_', ' ')
}

// "Why am I seeing this?" — secondary but accessible (FR-16). Renders only
// human-facing content: the answers given, the matched state's plain-language
// label, the explanation, and the cited source. Internal rule ids never
// surface here.
export function TrustDisclosure({ diagnosis, stateLabel, answerLabels }: TrustDisclosureProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-4 text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
      >
        Why am I seeing this?
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Based on your answers
            </p>
            <ul className="mt-1 list-disc pl-5">
              {diagnosis.matchedAnswers.map((a) => (
                <li key={a.questionId}>{answerLabels?.[a.value] ?? humanize(a.value)}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Matched case state
            </p>
            <p>{stateLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Reasoning</p>
            <p>{diagnosis.explanation}</p>
          </div>
          {diagnosis.sources && diagnosis.sources.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Official source
              </p>
              <ul className="mt-1 space-y-1">
                {diagnosis.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
