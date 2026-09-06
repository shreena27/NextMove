/** The shared Next Move template — port of the prototype's `renderNextMove`
 *  (design/nextmove-v1-prototype.html, lines 3654-3684), the second of the
 *  two templates all three services render through unmodified.
 *
 *  Deliberately NOT ported here (Out of Scope, later chunks): `freshBanner`
 *  (C6 — slots in as the first child of the right column, per this plan's
 *  C6 handoff notes), `updateEntry`'s "Add an update" button and
 *  `saveControl`'s "Save this case" control (both C5 — `updateEntry` slots
 *  back in immediately after the CTA below, `saveControl` last of all).
 *
 *  Government-process rules never live here — the only branching is
 *  structural: `d.needList` vs `d.need` (does this rule's "what you'll
 *  need" happen to be a list?), `d.howLong`/`d.expectNext` presence (does
 *  this rule carry an optional field at all?), and `hasPrepPlan` (is there
 *  something to prepare?). None of these ask what a government process
 *  means; they only ask what shape the already-computed `Diagnosis` is in.
 *
 *  DESIGN NOTE 1 (needList beats need — recorded deviation, C2's side):
 *  the prototype ships `s-notice`'s "what you'll need" as raw `<ul>` markup
 *  stuffed inside `need`. C2 already split that: a plain-text lead-in stays
 *  in `need`, the items move to `needList`. This template must never
 *  `dangerouslySetInnerHTML` a data field, so when `needList` is present it
 *  is the ENTIRE "what you'll need" content — `need` (the lead-in sentence)
 *  is not additionally rendered alongside it. That is the locked C2/C3
 *  deviation, not an omission introduced here.
 *
 *  DESIGN NOTE 2 (the prepare seam — Open Question 2, RULED): `hasPrepPlan`
 *  defaults to `false`, rendering the prototype's own real no-prep branch —
 *  a secondary "Back to Home" button — exactly what every WAIT and
 *  UNCLASSIFIED state already shows in the locked design. No inert button
 *  ships either way: when `hasPrepPlan` is `true` the primary "Prepare this
 *  for me" CTA renders (the render seam), but its `onclick` target
 *  (`nav('${engineKey}-prepare')`, prototype line 3661) is NOT wired here —
 *  `-prepare` screens are not yet part of `ScreenId` (C4 adds them, per
 *  this plan's C4 handoff notes) and `updateEntry`/`saveControl`, the two
 *  other prototype calls threading `engineKey` through this screen, are
 *  C5's. Wiring a click to a screen id that cannot exist yet would be a
 *  type-unsound shortcut this codebase otherwise goes out of its way to
 *  avoid (`ServiceKey`/`ScreenId` unions instead of `string`, exhaustive
 *  switches). C4 fills the seam in when it adds the real prep flow.
 *
 *  DESIGN NOTE 3 (RESTART, not NAVIGATE — Open Question 2's residual):
 *  "Back to Home" dispatches `RESTART` (prototype 3663's `restart()`), never
 *  a `NAVIGATE` to `'home'`. Home is a clean slate, always — the same rule
 *  `back()` encodes at prototype 2032-2035, and the same rule `session.ts`'s
 *  own `BACK` case already applies when the previous screen is `'home'`.
 *  Wiring this to a navigation instead would leave stale answers sitting in
 *  session state, exactly the bug that comment exists to prevent.
 *
 *  DESIGN NOTE 4 (the crumb carries the matched state — Open Question 4,
 *  RULED): `{serviceLabel} · {d.label}` then `Your next move` (prototype
 *  3667). For passport ladder states `d.label` is already the stage·rung
 *  composite C1's `decorateStageRung` built. This is where AC-10's "matched
 *  state" requirement is actually satisfied — the Diagnosis screen and its
 *  trust panel deliberately never name the state at all (Task 6's own
 *  "never leaks" test pins that as a positive assertion), by design, not by
 *  oversight. The residual this ruling records: a citizen who opens "Why am
 *  I seeing this?" on the Diagnosis screen does not see the matched state
 *  there — only after continuing on to Next Move. That gap is the locked
 *  prototype's own call, not an implementation shortfall.
 *
 *  <TrustDisclosure> COMPOSITION: the literal prototype's `renderNextMove`
 *  (3654-3684) never calls `trustDisclosure()` — that call exists only once
 *  in the whole file, inside `renderDiagnosis` (line 3608). This task's own
 *  build brief (Interfaces + Step 3) nonetheless names Task 6's
 *  `<TrustDisclosure>` as something this template "consumes... imported,
 *  not stubbed" and composes, so it renders here too, fully controlled via
 *  `trustOpen`/`onToggleTrust`, in the same slot `renderDiagnosis` gives it
 *  (last in the right column) — recorded here as a deliberate divergence
 *  from the literal ported markup, not a silent one, exactly as this plan's
 *  own "Recorded deviations" section documents its other departures.
 *  `trustOpen`/`onToggleTrust`/`answerLabels` are optional here (unlike
 *  `DiagnosisScreen`'s required versions of the same props) so a caller
 *  that only cares about the Next Move content itself — as every AC-11 /
 *  AC-10 test in this template's own suite does — never has to thread them
 *  through; Task 9's router supplies real ones exactly the way it does for
 *  `DiagnosisScreen`.
 */
import type { ReactNode } from 'react'
import type { Diagnosis } from '../domain/types'
import type { ServiceKey, SessionAction } from '../session/session'
import { PhaseEyebrow } from '../ui/Crumbs'
import { Split } from '../ui/Split'
import { Button } from '../ui/Button'
import { TrustDisclosure } from './TrustDisclosure'

export interface NextMoveScreenProps {
  serviceLabel: string
  /** The routing/storage prefix (ServiceEngine.key). Kept for the same
   *  `ServiceKey`-typed shape `DiagnosisScreen.engineKey` carries (and for
   *  the real prepare-navigation target C4 wires behind `hasPrepPlan`,
   *  prototype line 3661) — not read by this file today (see design note
   *  2). Never rendered as text. */
  engineKey: ServiceKey
  d: Diagnosis
  /** Composite "questionId:value" -> label map for TrustDisclosure; build
   *  with `labelMap()` (src/screens/labels.ts). Defaults to `{}` (the
   *  "You told us" row then falls back to its own honest not-enough-info
   *  copy) so a caller that never opens the trust panel need not build one. */
  answerLabels?: Record<string, string>
  trustOpen?: boolean
  onToggleTrust?: () => void
  /** The Passport recovery echoes (design note 10 elsewhere in this plan),
   *  forwarded to TrustDisclosure untouched. */
  extraToldUs?: string
  /** True once a real prep plan exists for this rule
   *  (`Boolean(PREP[d.ruleId])`, C4's job to compute and pass). Defaults to
   *  `false`: every C3 state renders the locked no-prep branch. */
  hasPrepPlan?: boolean
  /** Rendered first, matching the prototype's own `topbar(true,true)` at
   *  the top of `renderNextMove`, line 3664 — symmetric with
   *  `DiagnosisScreen`'s own `topbar` slot. */
  topbar?: ReactNode
  /** Dispatches session actions. "Back to Home" sends `{ type: 'RESTART' }`
   *  (design note 3) — never a navigation. */
  dispatch?: (action: SessionAction) => void
}

export function NextMoveScreen({
  serviceLabel,
  engineKey: _engineKey,
  d,
  answerLabels = {},
  trustOpen = false,
  onToggleTrust = () => {},
  extraToldUs,
  hasPrepPlan = false,
  topbar,
  dispatch,
}: NextMoveScreenProps) {
  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              <PhaseEyebrow service={`${serviceLabel} · ${d.label}`} phase="Your next move" />
              <h1 className="nm-lead">{d.whatShort || d.whatToDo}</h1>
              {d.whatShort ? <p className="nm-lead-detail">{d.whatToDo}</p> : null}
            </>
          }
          right={
            <>
              <div className="nm-fields">
                <div className="nm-field">
                  <div className="nm-k">Why</div>
                  <div className="nm-v">{d.explanation}</div>
                </div>
                <div className="nm-field">
                  <div className="nm-k">Where</div>
                  <div className="nm-v">
                    {d.where.url ? (
                      <a href={d.where.url} target="_blank" rel="noopener">
                        {d.where.label}
                      </a>
                    ) : (
                      d.where.label
                    )}
                    {d.where.phone ? (
                      <>
                        {' · '}
                        <span className="phone">{d.where.phone}</span>
                      </>
                    ) : null}
                    <div className="handoff-note">
                      An official government channel. NextMove helps you understand and prepare; it
                      doesn't act on your behalf.
                    </div>
                  </div>
                </div>
                <div className="nm-field">
                  <div className="nm-k">What you'll need</div>
                  <div className="nm-v">
                    {/* needList beats need (design note 1) — never both. */}
                    {d.needList ? (
                      <ul className="need-list">
                        {d.needList.map(item => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      d.need
                    )}
                  </div>
                </div>
                {d.howLong ? (
                  <div className="nm-field">
                    <div className="nm-k">How long?</div>
                    <div className="nm-v">{d.howLong}</div>
                  </div>
                ) : null}
                {d.expectNext ? (
                  <div className="nm-field">
                    <div className="nm-k">What to expect</div>
                    <div className="nm-v">{d.expectNext}</div>
                  </div>
                ) : null}
              </div>
              {hasPrepPlan ? (
                // The seam C4 fills (design note 2): no onClick wired here —
                // its real target doesn't exist in ScreenId yet.
                <Button block arrow>
                  Prepare this for me
                </Button>
              ) : (
                <Button variant="secondary" block onClick={() => dispatch?.({ type: 'RESTART' })}>
                  Back to Home
                </Button>
              )}
              <TrustDisclosure
                d={d}
                answerLabels={answerLabels}
                extraToldUs={extraToldUs}
                open={trustOpen}
                onToggle={onToggleTrust}
              />
            </>
          }
        />
      </div>
    </>
  )
}
