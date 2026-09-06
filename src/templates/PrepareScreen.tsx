/** The "Prepare this for me" shell — port of the prototype's `renderPrepare`
 *  (design/nextmove-v1-prototype.html, lines 3746-3771ish, tag
 *  v1-design-lock-2): the crumb, headline, lede, trust line, and the
 *  official-channel card. The draft card, checklist and visit card are
 *  Task 4 and Task 5's — this file is the shell they compose into.
 *
 *  Props deliberately mirror `NextMoveScreen`'s shape (`{ serviceLabel,
 *  engineKey, d, ..., topbar?, dispatch? }`), with one difference: `prep:
 *  PrepPlan` is required and non-nullable. The prototype's own guard —
 *  `if(!prep){ restart(); return renderHome(); }` (3749) — exists because
 *  `renderPrepare` is called with only a `ruleId` and has to look the plan
 *  up itself. This component is never handed a ruleId; it is handed the
 *  plan already resolved, so "no plan for this rule" is a state the router
 *  (Task 6) filters out before construction, not a state this component
 *  can be in. Non-nullability is the type-safe form of the same guard.
 *
 *  DESIGN NOTE 1 (the C6 freshBanner seam): `freshBanner(engineKey)` is
 *  prototype line 3770 — the first child of the right column, before the
 *  channel card, the same position it takes on Diagnosis and Next Move.
 *  See the comment at that exact spot below.
 *
 *  DESIGN NOTE 2 (the C8 fillDraft middle branch is deliberately
 *  unbuilt, not stubbed): the prototype's `renderPrepare` composes a draft
 *  card with autofill-from-bracket parsing between the trust line and the
 *  checklist (3772 onward). That whole card — draft textarea, copy
 *  button, fill-review panel — is Task 4's. This file does not render it,
 *  does not stub an empty `<div>` for it, and carries no dead branch
 *  waiting to be filled in; its absence here is a scoping decision, not an
 *  oversight.
 *
 *  DESIGN NOTE 3 (the C5 saveControl tail is deliberately absent): the
 *  prototype's full `renderPrepare` ends with a "Save this case" control
 *  (C5 scope). This screen, once Task 5 lands the checklist and visit
 *  card, ends at "Done, back to Home" — there is no save/casefile element
 *  anywhere in this file, now or later in this chunk.
 *
 *  DESIGN NOTE 4 (`.channel-phone` is optional-by-data, not dead): the
 *  helpline row is conditional on `d.where.phone`, an optional field —
 *  not because it never renders (it does, today: `state-5a`'s real
 *  `where.phone` is `1800-258-1800`, a reachable FOLLOW_UP outcome), but
 *  because the field itself is optional. Do not "clean up" this branch if
 *  a future data change happens to leave phone-less rules as the only
 *  ones reachable — the branch is doing its job either way.
 */
import type { ReactNode } from 'react'
import type { Diagnosis } from '../domain/types'
import type { ServiceKey, SessionAction } from '../session/session'
import type { PrepPlan } from '../playbooks/prep'
import { PhaseEyebrow } from '../ui/Crumbs'
import { Split } from '../ui/Split'
import { UI } from '../screens/screenCopy'

export interface PrepareScreenProps {
  serviceLabel: string
  /** The routing/storage prefix (ServiceEngine.key). Kept for parity with
   *  `NextMoveScreen.engineKey` and for the real `freshBanner(engineKey)`
   *  call Task-C6 wires in at design note 1's seam — not read by this file
   *  today. Never rendered as text. */
  engineKey: ServiceKey
  d: Diagnosis
  /** The resolved prep plan for `d`'s matched rule. Required and
   *  non-nullable — see the file header note on why the prototype's
   *  `if(!prep)` guard has no equivalent here. */
  prep: PrepPlan
  /** Rendered first, matching the prototype's own `topbar(true,true)` at
   *  the top of `renderPrepare`, line 3762 — symmetric with
   *  `NextMoveScreen`'s and `DiagnosisScreen`'s own `topbar` slot. */
  topbar?: ReactNode
  /** Dispatches session actions. Unused by this shell (Task 3 has no
   *  button that dispatches); kept in the prop shape for parity with
   *  `NextMoveScreen` and for the checklist/"Done, back to Home" controls
   *  Task 5 adds. */
  dispatch?: (action: SessionAction) => void
}

export function PrepareScreen({
  serviceLabel,
  engineKey: _engineKey,
  d,
  prep,
  topbar,
  dispatch: _dispatch,
}: PrepareScreenProps) {
  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              <PhaseEyebrow service={`${serviceLabel} · ${d.label}`} phase={UI.phase.prepare} />
              <h1 className="headline">{prep.title ?? UI.prepare.headlineFallback}</h1>
              <p className="lede">{prep.draft ? UI.prepare.ledeDraft : UI.prepare.ledeSteps}</p>
              <p className="prep-trust">{UI.prepare.trust}</p>
            </>
          }
          right={
            <>
              {/* DESIGN NOTE 1: freshBanner(engineKey) (prototype 3770)
                  slots in here, first child of the right column, before
                  the channel card — Task C6's seam, same position it
                  takes on Diagnosis and Next Move. */}
              <div className="channel-card">
                <div className="channel-body">
                  <div className="channel-k">{UI.prepare.channelK}</div>
                  <div className="channel-v">{d.where.label}</div>
                  {d.where.phone ? (
                    <div className="channel-phone">
                      {UI.prepare.channelPhone.replace('{phone}', d.where.phone)}
                    </div>
                  ) : null}
                </div>
                {d.where.url ? (
                  <a className="channel-open" href={d.where.url} target="_blank" rel="noopener">
                    {UI.prepare.channelOpen}
                  </a>
                ) : null}
              </div>
              {/* DESIGN NOTE 2: the draft card (Task 4) slots in here. */}
              {/* The checklist and visit card (Task 5) slot in after it. */}
            </>
          }
        />
      </div>
    </>
  )
}
