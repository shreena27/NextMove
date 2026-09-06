/** DeadEndScreen — port of the prototype's `renderDeadEnd` (design/
 *  nextmove-v1-prototype.html, lines 2971-2985, tag v1-design-lock-2): the
 *  screen shown once every verified step in a service's escalation ladder
 *  has been exhausted.
 *
 *  `case: Casefile` is required and non-nullable, the same reasoning
 *  `CasefileScreen`'s own header note gives: the prototype's own guard
 *  (`if(!c){ restart(); return renderHome(); }`, 2973) has no equivalent
 *  here because Task 13's router resolves the active case before
 *  construction, the same seam `CasefileScreen`/`PrepareScreen` already
 *  reuse.
 *
 *  THE PRODUCT'S MOST CAREFULLY-CONSIDERED HONESTY COMMITMENT: this screen
 *  must never offer a next action. The spec: "its own screen, not a
 *  diagnosis. Copy says plainly: you have used every step this playbook
 *  can verify — no invented next step, no false hope." So there is no
 *  `.case-links` block here at all (unlike `CasefileScreen`'s own tail) —
 *  only "keep it open" (a plain `RESTART`, prototype's own design note:
 *  nothing is written, the case stays exactly as its last check-in left
 *  it) and "close as unresolved" (`CLOSE_UNRESOLVED`). `DeadEndScreen.test.
 *  tsx` asserts this as a positive absence: no link to any `*-prepare`/
 *  `*-nextmove` screen, ever. */
import type { ReactNode } from 'react'
import type { Casefile } from '../domain/casefile'
import type { SessionAction } from '../session/session'
import { Crumbs } from '../ui/Crumbs'
import { Button } from '../ui/Button'
import { SERVICE_SQ } from '../ui/serviceSquare'
import { JourneyLog } from './JourneyLog'
import { UI } from '../screens/screenCopy'

export interface DeadEndScreenProps {
  /** Required and non-nullable — see the file header note. */
  case: Casefile
  logOpen: Record<string, boolean>
  /** D6: the injected clock CLOSE_UNRESOLVED's dispatch carries. */
  now: number
  /** Rendered first, matching the prototype's own `topbar(true,false)` at
   *  the top of `renderDeadEnd`, line 2974. */
  topbar?: ReactNode
  dispatch?: (action: SessionAction) => void
}

export function DeadEndScreen({ case: c, logOpen, now, topbar, dispatch }: DeadEndScreenProps) {
  return (
    <>
      {topbar}
      <div className="stage screen">
        <div className="narrow">
          <Crumbs parts={[c.serviceLabel, UI.deadEnd.crumbTail]} sqClass={SERVICE_SQ[c.serviceLabel] ?? null} />
          <h2 className="headline">{UI.deadEnd.headline}</h2>
          <p className="lede">{UI.deadEnd.lede}</p>
          <JourneyLog case={c} logOpen={logOpen} onShowAll={() => dispatch?.({ type: 'TOGGLE_LOG', caseId: c.id })} />
          <Button variant="secondary" block onClick={() => dispatch?.({ type: 'RESTART' })}>
            {UI.deadEnd.keepOpen}
          </Button>
          <button className="btn-ghost" onClick={() => dispatch?.({ type: 'CLOSE_UNRESOLVED', now })}>
            {UI.deadEnd.closeUnresolved}
          </button>
        </div>
      </div>
    </>
  )
}
