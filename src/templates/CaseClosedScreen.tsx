/** CaseClosedScreen — port of the prototype's `renderCaseClosed` (design/
 *  nextmove-v1-prototype.html, lines 2986-3000, tag v1-design-lock-2): "the
 *  single calm celebratory beat" the spec allows, shown only when a case's
 *  outcome becomes `deliverable_received`.
 *
 *  `case` mirrors the prototype's own `c = S.savedCases.find(x=>x.outcome
 *  ==='deliverable_received' && x.id===S.activeCaseId) || activeCase()`
 *  (2987) — nullable, NOT required-and-non-nullable like `DeadEndScreen`'s/
 *  `CasefileScreen`'s own `case` prop, because the prototype's own template
 *  literal gates the journey log on it too (`${c ? renderLog(c) : ''}`,
 *  2996). App.tsx's `case-closed` router case (Task 13) resolves which case
 *  (if any) that lookup finds; this component only renders what it is
 *  handed.
 *
 *  DESIGN NOTE (Task 10 design note 2 — Open Question 3, RESOLVED; Finding
 *  13): the prototype's lede (2994) ends "...NextMove's part is done; the
 *  casefile and its journey stay under "Closed" on Home if you ever need
 *  the record." That closing clause is true for a SAVED case, but
 *  affirmatively FALSE for a working (unsaved) case: an unsaved case is
 *  never in `savedCases`, `RESTART` drops it, and nothing stays under
 *  "Closed" on Home. That path is reachable (the casefile screen offers
 *  the full check-in machinery, closure included, to a working case), so
 *  the fix is a GATE, not a rewrite: `UI.caseClosed.ledeLead` (everything
 *  through "NextMove's part is done") always renders; `UI.caseClosed.
 *  ledeSavedClause` (the closing clause) renders only when a case exists
 *  AND `!case.unsaved`. No replacement clause is authored for the unsaved
 *  branch — say nothing rather than something untrue — and the working
 *  case is never auto-saved at closure to make the sentence true, which
 *  would create a casefile the citizen never asked for and contradict the
 *  casefile screen's own informed-consent warning ("This casefile lives
 *  only in this tab until you save it"). */
import type { ReactNode } from 'react'
import type { Casefile } from '../domain/casefile'
import type { SessionAction } from '../session/session'
import { Crumbs } from '../ui/Crumbs'
import { Split } from '../ui/Split'
import { Button } from '../ui/Button'
import { Gems } from '../ui/Gems'
import { JourneyLog } from './JourneyLog'
import { UI } from '../screens/screenCopy'

export interface CaseClosedScreenProps {
  /** Nullable — see the file header note. */
  case: Casefile | null
  logOpen: Record<string, boolean>
  /** Rendered first, matching the prototype's own `topbar(false,false)` at
   *  the top of `renderCaseClosed`, line 2988. */
  topbar?: ReactNode
  dispatch?: (action: SessionAction) => void
}

export function CaseClosedScreen({ case: c, logOpen, topbar, dispatch }: CaseClosedScreenProps) {
  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              <Gems placement="reveal" />
              <Crumbs parts={[UI.caseClosed.crumb]} sqClass="sq-butter" />
              <h1 className="headline">
                {UI.caseClosed.headlineLead} <span className="mark">{UI.caseClosed.headlineMark}</span>.
              </h1>
              <p className="lede">
                {UI.caseClosed.ledeLead}
                {c && !c.unsaved ? UI.caseClosed.ledeSavedClause : null}
              </p>
            </>
          }
          right={
            <>
              {c ? (
                <JourneyLog
                  case={c}
                  logOpen={logOpen}
                  onShowAll={() => dispatch?.({ type: 'TOGGLE_LOG', caseId: c.id })}
                />
              ) : null}
              <Button block arrow onClick={() => dispatch?.({ type: 'RESTART' })}>
                {UI.caseClosed.backToHome}
              </Button>
            </>
          }
        />
      </div>
    </>
  )
}
