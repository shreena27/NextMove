/** Ports the prototype's `trustDisclosure()` (design/nextmove-v1-prototype.html,
 *  lines 2360-2375) IN FULL, including the `S.appliedText`/"You wrote" row
 *  (line 2371) — C8 Task 16 (FR-AI-04; spec §4: "Trust disclosure gains
 *  'You wrote' (full text) and the facts used."). That row sits between
 *  "You told us" and "What that means" (the prototype's own ordering),
 *  renders ONLY when `appliedText` is truthy, and — transcribed verbatim
 *  from that same prototype line — shows the quoted, italic text, then,
 *  only when `caseFacts` is non-empty, a `.small` "Details kept from it:
 *  {label} {value} · {label} {value}" line. `appliedText`/`caseFacts` are
 *  NOT routed through `extraToldUs`: that prop feeds the "You told us"
 *  list of ANSWERS, and free text is not an answer — rendering it there
 *  would misrepresent it as something the citizen picked from options.
 *
 *  `interpProvenance` (Task 8's casefile field — model id, prompt version,
 *  timestamp) is DELIBERATELY NOT a prop here and never rendered anywhere
 *  in this component. It is a record for the case owner's/a future
 *  export's benefit, not citizen-facing copy — a model id in a trust panel
 *  is noise that would displace the sentence that actually matters here.
 *  Spec §4 asks only that it be *persisted*, which `session.ts`/
 *  `casefile.ts` already do; this omission is decided, not missed.
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
import type { Fact } from '../domain/interpret'
import { verifiedDateFor } from '../domain/freshness'
import { UI } from '../screens/screenCopy'

/** Last human verification of `sources/manifest.json` (prototype line 2018).
 *  Project metadata, not a government-process claim; pinned against the
 *  manifest itself by TrustDisclosure.test.tsx. The static fallback for a
 *  document C6's freshness job doesn't cover (the two web-page sources,
 *  and the superseded schedule PDF — all check:"manual"/"none" in
 *  manifest.json) — see `verifiedDateFor` below, which now sources the
 *  date LIVE, per document, for everything the freshness job does cover. */
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
  /** C8 Task 16 (FR-AI-04) — the free text applied from "Describe it in
   *  your own words" and the facts extracted from it, both persisted with
   *  the saved casefile (`SessionState.appliedText`/`caseFacts`, D17).
   *  REQUIRED, not optional — the same fail-safe C7 used for `Topbar`'s
   *  `state` prop and Task 15's `PrepareScreen` `caseFacts`/
   *  `fillsReviewed`: a missed mount site is a compile error, not a
   *  silently-absent "You wrote" row. */
  appliedText: string | null
  caseFacts: Fact[]
  open: boolean
  onToggle: () => void
}

export function TrustDisclosure({
  d, answerLabels, extraToldUs, appliedText, caseFacts, open, onToggle,
}: TrustDisclosureProps) {
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
          {appliedText ? (
            <div className="trust-row">
              <div className="nm-k">{UI.interp.youWrote}</div>
              <div className="nm-v" style={{ fontStyle: 'italic' }}>"{appliedText}"</div>
              {caseFacts.length ? (
                <div className="small" style={{ marginTop: 6 }}>
                  {UI.trust.detailsKeptFrom} {caseFacts.map(f => `${f.label} ${f.value}`).join(' · ')}
                </div>
              ) : null}
            </div>
          ) : null}
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
                  {UI.trust.verifiedOn.replace(
                    '{date}',
                    verifiedDateFor(d.source.docId) ?? SOURCES_VERIFIED,
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
