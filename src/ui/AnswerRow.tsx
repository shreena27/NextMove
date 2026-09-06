/** Ports the prototype's `answerRow()` (design/nextmove-v1-prototype.html,
 *  lines 2327-2337).
 *
 *  PRD §15: "I'm not sure" gets the identical row treatment — same `.arow`
 *  markup, same list, no demotion. There is no special case for it here;
 *  a not-sure row is just a row whose value happens to be `not_sure`.
 *
 *  No ARIA state attribute. An earlier draft gave this `aria-pressed`;
 *  that is the wrong ARIA and is dropped. These buttons are not toggles —
 *  they navigate immediately and the screen changes underneath them, so a
 *  pressed state is never observable and would mis-describe the control.
 *  The `.selected` class already carries the returned-to-answer affordance
 *  visually (prototype 2328-2329), and the row's own label is its
 *  accessible name. */
import { ICONS } from './icons'

export interface AnswerRowProps {
  value: string
  label: string
  sub?: string
  selected: boolean
  onSelect: (value: string) => void
}

export function AnswerRow({ value, label, sub, selected, onSelect }: AnswerRowProps) {
  return (
    <button className={`arow ${selected ? 'selected' : ''}`} onClick={() => onSelect(value)}>
      <span className="arow-check">{ICONS.check}</span>
      <span className="arow-body">
        <div className="arow-label">{label}</div>
        {sub ? <div className="arow-sub">{sub}</div> : null}
      </span>
      <span className="arow-chevron">{ICONS.chevron}</span>
    </button>
  )
}
