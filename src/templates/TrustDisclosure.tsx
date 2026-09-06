/** Ports the prototype's `trustDisclosure()` (design/nextmove-v1-prototype.html,
 *  lines 2360-2375), minus the `S.appliedText`/"You wrote" row (line 2371 —
 *  C8's "you wrote"/`caseFacts`, out of scope here per this task's design
 *  note 11).
 *
 *  FULLY CONTROLLED — this component owns no state. `open` is a required
 *  prop and `onToggle` a required callback; there is no `useState` anywhere
 *  in this file. The prototype's own toggle (line 2366,
 *  `S.trustOpen=!S.trustOpen; render();`) writes to the SESSION, not to a
 *  local component — Task 2's `trustOpen`/`TOGGLE_TRUST` stay the single
 *  source of truth (this task's design note 7). Nav-clears-trust and
 *  restart-clears-trust are the session reducer's job, already covered by
 *  session.test.ts; nothing here duplicates that.
 *
 *  MUST NOT import anything under src/playbooks/guardrails/. NOTE (fix
 *  round 1, Minor #7): playbooks/guardrails/isolation.test.ts's scan is
 *  `.ts`-only by its own explicit design comment, so it does not actually
 *  cover this `.tsx` file mechanically — the rule still applies here, it is
 *  just verified by inspection rather than enforced by that test. Widening
 *  the scan to `.tsx` files is a broader, repo-wide guardrail change and is
 *  out of this file's scope. The SOURCES_VERIFIED-vs-manifest comparison
 *  (Open Question 3) lives in this component's own *.test.tsx file, which
 *  the existing scan does exempt regardless.
 *
 *  Task 9's copy sweep: the toggle label, row headings and the archived-copy
 *  caption template all live in `SCREEN_COPY.ui` (`screenCopy.ts`), which
 *  itself never imports the guardrail harness — so importing it here does
 *  not violate this file's own MUST-NOT-import-guardrails rule above. */
import type { Diagnosis } from '../domain/types'
import { UI } from '../screens/screenCopy'

/** Last human verification of `sources/manifest.json` (prototype line 2018).
 *  Project metadata, not a government-process claim — C6's freshness job is
 *  what will eventually keep this current (this task's design note 8);
 *  pinned against the manifest itself by TrustDisclosure.test.tsx. */
export const SOURCES_VERIFIED = '5 Sep 2026'

export interface TrustDisclosureProps {
  d: Diagnosis
  /** Composite "questionId:value" -> label map. Build with `labelMap()`
   *  (src/screens/labels.ts) — the only producer of this shape; a flat
   *  value-keyed map must never reach this component. */
  answerLabels: Record<string, string>
  /** The Passport recovery echoes (design note 10): "Pasted status text:
   *  ..." or "Asked for the safest thing to do now." */
  extraToldUs?: string
  open: boolean
  onToggle: () => void
}

export function TrustDisclosure({ d, answerLabels, extraToldUs, open, onToggle }: TrustDisclosureProps) {
  const answered = Object.entries(d.matchedAnswers)
    .filter(([k, v]) => answerLabels[`${k}:${v}`])
    .map(([k, v]) => answerLabels[`${k}:${v}`])
  if (extraToldUs) answered.push(extraToldUs)

  return (
    <>
      <button className="trust-toggle" aria-expanded={open} onClick={onToggle}>
        {open ? '▾' : '▸'} {UI.trust.toggle}
      </button>
      {open ? (
        <div className="trust-panel">
          <div className="trust-row">
            <div className="nm-k">{UI.trust.youToldUs}</div>
            <div className="nm-v">
              {answered.join(' · ') || UI.trust.notEnough}
            </div>
          </div>
          <div className="trust-row">
            <div className="nm-k">{UI.trust.whatThatMeans}</div>
            <div className="nm-v">{d.explanation}</div>
          </div>
          <div className="trust-row">
            <div className="nm-k">{UI.trust.basedOn}</div>
            <div className="nm-v">
              {d.source.title}
              {d.source.quote ? <div className="source-quote">"{d.source.quote}"</div> : null}
              {d.source.docId !== null ? (
                <div className="small" style={{ marginTop: 5, color: 'var(--ink-faint)' }}>
                  {UI.trust.verifiedOn.replace('{date}', SOURCES_VERIFIED)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
