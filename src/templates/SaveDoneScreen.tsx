/** SaveDoneScreen — port of the prototype's `renderSaveDone` (design/
 *  nextmove-v1-prototype.html, lines 3887-3899, tag v1-design-lock-2): the
 *  confirmation shown right after a case is saved.
 *
 *  DESIGN NOTE (Task 10 design note 3 — Open Question 1, RESOLVED, option
 *  (b)): the prototype's lede (3894) is two sentences — "It's waiting on
 *  the Home screen whenever you come back: your answers, your diagnosis,
 *  and any steps you've already ticked off. Nothing else happens with your
 *  ${S.user && S.user.method==='phone' ? 'number' : 'account'}." With no
 *  user the ternary evaluates to 'account'. C5 has no accounts at all
 *  (device-local only): keeping the second sentence would tell a reader
 *  they DO have an account, which is actively misleading in a product
 *  whose whole thesis is not saying things it cannot back. Only the first,
 *  true sentence is registered (`UI.saveDone.lede`) — this is a
 *  SUBTRACTION ("never invent copy" forbids authoring, not omitting a
 *  sentence that is untrue in this chunk), not an oversight. C7 (real
 *  auth) restores the full sentence with its original ternary — both
 *  branches are recorded in `screenCopy.ts`'s own comment on this entry so
 *  C7 re-derives it verbatim rather than reinventing it:
 *    - phone sign-in: "Nothing else happens with your number."
 *    - any other sign-in: "Nothing else happens with your account."
 *  Option (c) — dropping `save-done` entirely and flipping `saveControl` to
 *  `.saved-note` in place — was considered and rejected: it drops the
 *  "Back to my case" path for no gain and is the largest flow deviation of
 *  the three save-flow screens.
 *
 *  "Back to my case" (3895) navigates directly via `pendingSave.
 *  returnScreen` — a plain `NAVIGATE`, never `continueSaved`/
 *  `CONTINUE_SAVED`. Task 5 design note 7 verified `continueSaved` (prototype
 *  2172-2177) occurs exactly ONCE in the whole locked prototype — its own
 *  definition, zero call sites — and is correctly excluded from
 *  `SessionAction` entirely (see session.ts's own comment + its negative
 *  `@ts-expect-error` pin). RECORDING THAT NOTE HERE, as design note 7 asked:
 *  the compact-card spec's own sentence claiming `continueSaved` remains for
 *  this "Back to my case" path is itself STALE relative to what actually
 *  shipped into the lock — a later reader should not mistake that spec
 *  sentence for a missing feature here. Rendered only when `pendingSave`
 *  exists, matching the prototype's own `${p ? ... : ''}` (3895).
 *  `pendingSave`'s type is indexed off `SessionState` itself (rather than
 *  redeclared here) so it can never drift from the reducer's own field. */
import type { ReactNode } from 'react'
import type { SessionAction, SessionState } from '../session/session'
import { Crumbs } from '../ui/Crumbs'
import { Button } from '../ui/Button'
import { UI } from '../screens/screenCopy'

export interface SaveDoneScreenProps {
  pendingSave: SessionState['pendingSave']
  /** Rendered first, matching the prototype's own `topbar(false,false)` at
   *  the top of `renderSaveDone`, line 3889. */
  topbar?: ReactNode
  dispatch?: (action: SessionAction) => void
}

export function SaveDoneScreen({ pendingSave, topbar, dispatch }: SaveDoneScreenProps) {
  return (
    <>
      {topbar}
      <div className="stage screen">
        <div className="narrow">
          <Crumbs parts={[UI.saveDone.crumb]} sqClass="sq-butter" />
          <h2 className="headline">{UI.saveDone.headline}</h2>
          <p className="lede">{UI.saveDone.lede}</p>
          {pendingSave ? (
            <Button
              block
              arrow
              onClick={() => dispatch?.({ type: 'NAVIGATE', screen: pendingSave.returnScreen })}
            >
              {UI.saveDone.backToCase}
            </Button>
          ) : null}
          <Button variant="secondary" block onClick={() => dispatch?.({ type: 'RESTART' })}>
            {UI.saveDone.goHome}
          </Button>
        </div>
      </div>
    </>
  )
}
