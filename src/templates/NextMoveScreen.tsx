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
 *  structural: `d.needList` presence (does this rule's "what you'll need"
 *  ALSO carry a structured list alongside its plain-text lead-in?),
 *  `d.howLong`/`d.expectNext` presence (does this rule carry an optional
 *  field at all?), and `hasPrepPlan` (is there something to prepare?). None
 *  of these ask what a government process means; they only ask what shape
 *  the already-computed `Diagnosis` is in.
 *
 *  DESIGN NOTE 1 (need AND needList, both — fix round 1, Critical): the
 *  prototype ships `s-notice`'s "what you'll need" as raw `<ul>` markup
 *  stuffed inside `need`. C2 split that in two: `need` keeps a plain-text
 *  lead-in ("Any ONE of these:"), `needList` carries the items. Both render
 *  — `need` as plain text, then `needList` as a real `<ul>`/`<li>` list
 *  underneath it when present — because dropping the lead-in changes what
 *  the guidance MEANS: a bare 12-item bullet list reads as "bring all of
 *  these," the opposite of the actual "any ONE" requirement. This template
 *  must never `dangerouslySetInnerHTML` a data field; rendering both
 *  fields as plain text/real list elements is exactly how C2 intended the
 *  split to be consumed (see `sirPlaybook.ts`'s own comment on the split).
 *
 *  DESIGN NOTE 2 (the prepare seam — Open Question 2, RULED): `hasPrepPlan`
 *  defaults to `false`, rendering the prototype's own real no-prep branch —
 *  a secondary "Back to Home" button — exactly what every WAIT and
 *  UNCLASSIFIED state already shows in the locked design. No inert button
 *  ships either way: when `hasPrepPlan` is `true` the primary "Prepare this
 *  for me" CTA renders, wired to the optional `onPrepare` callback (fix
 *  round 1, Minor). The prototype's own `onclick` target for this button
 *  (`nav('${engineKey}-prepare')`, line 3661) is NOT reproduced as a
 *  navigation here — `-prepare` screens are not yet part of `ScreenId` (C4
 *  adds them, per this plan's C4 handoff notes), and wiring a click to a
 *  screen id that cannot exist yet would be a type-unsound shortcut this
 *  codebase otherwise goes out of its way to avoid (`ServiceKey`/`ScreenId`
 *  unions instead of `string`, exhaustive switches). `onPrepare` is the
 *  seam C4 calls into once the real prep flow exists.
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
 *  NO <TrustDisclosure> HERE (fix round 1, Important): an earlier draft of
 *  this file composed Task 6's `<TrustDisclosure>` here too, reasoning from
 *  this task's own brief text ("Consumes... TrustDisclosure — imported,
 *  not stubbed"). That was wrong: the literal prototype's `renderNextMove`
 *  (3654-3684) never calls `trustDisclosure()` anywhere — that call has
 *  exactly one site in the whole prototype, inside `renderDiagnosis` (line
 *  3608), already Task 6's. The PRD independently confirms the trust
 *  control is Diagnosis-only (FR-16). Composing it here would have (a)
 *  rendered `d.explanation` a second time under "What that means" whenever
 *  the panel was opened, and (b) shown "Not enough to safely place your
 *  case; see below." on a screen that had just told the citizen exactly
 *  what to do, since no caller had a reason to build a real
 *  `answerLabels` map for this screen. The plan file itself has since been
 *  corrected (Task 7's Interfaces + a new design note 0) so this doesn't
 *  resurface for Task 9.
 */
import type { ReactNode } from 'react'
import type { Diagnosis } from '../domain/types'
import type { ServiceKey, SessionAction } from '../session/session'
import { PhaseEyebrow } from '../ui/Crumbs'
import { Split } from '../ui/Split'
import { Button } from '../ui/Button'

export interface NextMoveScreenProps {
  serviceLabel: string
  /** The routing/storage prefix (ServiceEngine.key). Kept for the same
   *  `ServiceKey`-typed shape `DiagnosisScreen.engineKey` carries (and for
   *  the real prepare-navigation target C4 wires behind `hasPrepPlan`,
   *  prototype line 3661) — not read by this file today (see design note
   *  2). Never rendered as text. */
  engineKey: ServiceKey
  d: Diagnosis
  /** True once a real prep plan exists for this rule
   *  (`Boolean(PREP[d.ruleId])`, C4's job to compute and pass). Defaults to
   *  `false`: every C3 state renders the locked no-prep branch. */
  hasPrepPlan?: boolean
  /** Called when the primary "Prepare this for me" CTA is pressed
   *  (only rendered when `hasPrepPlan` is `true`) — the seam C4 wires to
   *  the real prep flow. */
  onPrepare?: () => void
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
  hasPrepPlan = false,
  onPrepare,
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
                    {/* Both render (design note 1): `need`'s lead-in text
                        stays plain text, `needList`'s items are a real
                        <ul>/<li> list underneath it — never markup-injected,
                        never dropping the lead-in that gives the list its
                        meaning (e.g. "Any ONE of these:"). */}
                    {d.need}
                    {d.needList ? (
                      <ul className="need-list">
                        {d.needList.map(item => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
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
                <Button block arrow onClick={onPrepare}>
                  Prepare this for me
                </Button>
              ) : (
                <Button variant="secondary" block onClick={() => dispatch?.({ type: 'RESTART' })}>
                  Back to Home
                </Button>
              )}
            </>
          }
        />
      </div>
    </>
  )
}
