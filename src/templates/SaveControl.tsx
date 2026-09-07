/** Ports the prototype's `saveControl` (design/nextmove-v1-prototype.html,
 *  lines 2292-2298, tag v1-design-lock-2) — the one save entry point, shared
 *  by Next Move, Prepare (both Task 11's own call sites) and the casefile
 *  screen's own unsaved-case tail (Task 9, prototype 2966). Quiet by
 *  design: "it must never compete with the case's actual next action."
 *
 *  BUILT AHEAD OF ITS OWN FILE-LIST ENTRY. The plan's File Structure table
 *  lists `SaveControl.tsx` under Task 11 ("Home's casefiles section + the
 *  save/update seams on Diagnosis, Next Move and Prepare"), but Task 9's own
 *  design note 8 requires `<SaveControl>` on the casefile screen's tail —
 *  the SAME shared component the prototype's single `saveControl()`
 *  function is, not a second copy. Rather than either inline a duplicate
 *  here or invent a different contract Task 11 would have to reconcile, this
 *  component is built now, to Task 11's own already-written design note 2
 *  (read in full while writing this task's brief), so Task 11 only wires it
 *  into its remaining call sites (NextMoveScreen, PrepareScreen, Home)
 *  rather than rebuilding it.
 *
 *  `caseIsSaved` is computed HERE, from `savedCases`/`answers`, mirroring the
 *  prototype's own encapsulation (`saveControl` reads `S.savedCases`/
 *  `S.answers` internally via `caseIsSaved(engineKey)` — it does not take a
 *  precomputed boolean). On the casefile screen's own tail this always
 *  evaluates false in practice (a working case only exists when
 *  `beginWorkingCheckin` found no matching saved case to open instead — see
 *  `session/cases.ts`'s own header note), but the prototype recomputes it
 *  unconditionally on every call, and this port does the same rather than
 *  hard-coding today's reachability into tomorrow's behaviour. */
import type { AnswerRecord } from '../domain/types'
import type { Casefile, ServiceKey } from '../domain/casefile'
import { caseIsSaved } from '../session/cases'
import { ICONS } from '../ui/icons'
import { UI } from '../screens/screenCopy'

export interface SaveControlProps {
  engineKey: ServiceKey
  /** The prototype passes a LITERAL `0` from the casefile screen's own tail
   *  (2966) and the real ticked-step count from Next Move/Prepare's tails
   *  (3681/3817) — see each call site's own comment. Never computed here. */
  stepsDone: number
  savedCases: Casefile[]
  answers: AnswerRecord
  onSave: () => void
}

export function SaveControl({ engineKey, stepsDone, savedCases, answers, onSave }: SaveControlProps) {
  if (caseIsSaved({ savedCases, answers }, engineKey)) {
    return (
      <div className="saved-note">
        {ICONS.bookmark} {UI.saveControl.savedNote}
      </div>
    )
  }
  const label = stepsDone > 0 ? UI.saveControl.saveWithSteps : UI.saveControl.save
  return (
    <button className="btn-ghost" onClick={onSave}>
      {ICONS.bookmark} {label}
    </button>
  )
}
