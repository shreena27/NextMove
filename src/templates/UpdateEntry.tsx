/** Ports the prototype's `updateEntry` (design/nextmove-v1-prototype.html,
 *  lines 2284-2289, tag v1-design-lock-2) — the tracking entry point shared
 *  by Diagnosis (Task 11's own DiagnosisScreen.tsx call site) and Next Move
 *  (NextMoveScreen.tsx). One `.btn-ghost` button, the pen icon plus one
 *  fixed label.
 *
 *  DELIBERATELY DUMB (design note 1 of the task brief): the prototype's own
 *  `updateEntry(engineKey, serviceLabel, returnScreen)` decides, INSIDE the
 *  function, whether to open a matching saved case or begin a working
 *  check-in (`S.savedCases.find(...)` against `JSON.stringify` equality).
 *  That routing decision does NOT belong in this component — it already
 *  lives in the reducer (`beginWorkingCheckin`, session/cases.ts, Task 5's
 *  "prefer the matching saved case" branch, built on the D3 key-sorted
 *  comparison, not `JSON.stringify`). A component that re-decided which
 *  case to open would be exactly the "government-process rule in a
 *  component" this project's Global Constraints forbid, and would silently
 *  duplicate — and could drift from — Task 5's already-tested logic. This
 *  component takes a single `onUpdate` callback and nothing else. */
import { ICONS } from '../ui/icons'
import { UI } from '../screens/screenCopy'

export interface UpdateEntryProps {
  onUpdate: () => void
}

export function UpdateEntry({ onUpdate }: UpdateEntryProps) {
  return (
    <button className="btn-ghost" onClick={onUpdate}>
      {ICONS.pen} {UI.updateEntry.label}
    </button>
  )
}
