/** Ports the prototype's `CLOSED_TITLE` doc comment context (3116) and
 *  `caseCard` (3117-3135, tag v1-design-lock-2) — the compact, glanceable
 *  Home casefile card.
 *
 *  DESIGN NOTE 7 — the compact-card spec's central decision, transcribed:
 *  "The whole card is the tap target (locked list-row pattern) → opens the
 *  casefile screen." The entire card is ONE `<button className="saved-card
 *  {closed}">` — no journey log, no separate action buttons inside it; the
 *  casefile-screen redesign removed both from the card entirely. Everything
 *  deeper (journey log, check-ins, Remove) lives inside the casefile screen
 *  this card's `onOpen` navigates to.
 *
 *  Title: `gotIt ? (CLOSED_TITLE[engineKey] ?? stateLabel) : stateLabel` —
 *  the prototype's own comment explains why: closed-got-it cards headline
 *  the deliverable, not the stale diagnosis ("Application submitted,
 *  awaiting decision" on a closed case read as a contradiction);
 *  closed-unresolved keeps the last diagnosis as the honest record of where
 *  it ended.
 *
 *  Kicker: `open ? 'Saved ' + fmtDay(savedAt) : gotIt ? 'Closed — got it' :
 *  'Closed — unresolved'`.
 *
 *  `now` (D6): `daysAgo` needs the clock; the caller supplies it, exactly
 *  as the reducer actions do (src/session/cases.ts's own header note) —
 *  REQUIRED, not defaulted to `Date.now()` inside this component. A default
 *  parameter of `Date.now()` would call an impure function during render
 *  (oxlint's react(purity) rule correctly flags this: two renders of the
 *  same props could disagree), so the real call site (Task 9's router
 *  wiring) supplies it, the same way it will supply `now` to every other
 *  D6 function in this chunk. */
import type { Casefile } from '../domain/casefile'
import { CLOSED_TITLE } from '../domain/checkinOptions'
import { SERVICE_SQ } from '../ui/serviceSquare'
import { StatusStamp } from '../ui/StatusStamp'
import { ICONS } from '../ui/icons'
import { fmtDay, fmtRemind, daysAgo } from '../ui/dates'
import { UI } from '../screens/screenCopy'

export interface CaseCardProps {
  case: Casefile
  onOpen: () => void
  now: number
}

export function CaseCard({ case: c, onOpen, now }: CaseCardProps) {
  const open = c.outcome === 'still_open'
  const gotIt = c.outcome === 'deliverable_received'
  const title = gotIt ? (CLOSED_TITLE[c.engineKey] ?? c.stateLabel) : c.stateLabel
  const kicker = open
    ? UI.card.savedPrefix.replace('{date}', fmtDay(c.savedAt))
    : gotIt ? UI.card.closedGotIt : UI.card.closedUnresolved

  return (
    <button className={`saved-card ${open ? '' : 'closed'}`} onClick={onOpen}>
      <span className="saved-body">
        <span className="saved-kicker">
          <span className={`crumb-sq ${SERVICE_SQ[c.serviceLabel] || 'sq-butter'}`} />
          {c.serviceLabel} · {kicker}
        </span>
        <span className="saved-title">{title}</span>
        {open && c.whatShort ? (
          <span className="saved-next">{UI.card.next.replace('{what}', c.whatShort)}</span>
        ) : null}
        <span className="saved-meta">
          {open ? <StatusStamp rec={c.rec} mini /> : <StatusStamp rec={c.rec} closed />}
          {open && c.stepsTotal ? (
            <span className="saved-steps">
              {UI.card.steps.replace('{done}', String(c.stepsDone)).replace('{total}', String(c.stepsTotal))}
            </span>
          ) : null}
          {open && c.lastCheck ? (
            <span className="saved-steps">{UI.card.lastUpdate.replace('{ago}', daysAgo(c.lastCheck, now))}</span>
          ) : null}
          {open && c.remindAt ? (
            <span className="saved-steps">{UI.card.checkBack.replace('{date}', fmtRemind(c.remindAt))}</span>
          ) : null}
        </span>
      </span>
      <span className="arow-chevron">{ICONS.chevron}</span>
    </button>
  )
}
