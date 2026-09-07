/** Ports the prototype's `stampClass`/`stampLabel`/`stampIcon` (design/
 *  nextmove-v1-prototype.html, lines 2338-2347) and the stamp markup itself
 *  (line 3594): `<span class="stamp {cls}"><span class="stamp-icon">{svg}
 *  </span>{label}</span>`.
 *
 *  No ARIA role. An earlier draft gave it `role="status"`; that is dropped.
 *  `role="status"` is an `aria-live="polite"` region — the label is already
 *  visible text, so it is announced by simply existing, and the live region
 *  would additionally re-announce on every same-screen re-render (every
 *  trust toggle, every selection), which is the noise the lifted
 *  `#app.settled` rule exists to suppress visually. The decorative glyph
 *  span gets `aria-hidden="true"` instead, consistent with the Global
 *  Constraint that already covers `.gems`.
 *
 *  Task 8 (design note 2) adds the compact Home card's MINI variant —
 *  `<span class="stamp mini {cls}">{LABEL}</span>`, NO icon (prototype
 *  3127) — and the CLOSED form, `<span class="stamp mini closedmark">
 *  CLOSED</span>` (same line, the ternary's else branch). `mini`/`closed`
 *  are both optional so the existing full-size call sites and their tests
 *  are untouched: neither prop is ever passed there. `closed` short-circuits
 *  entirely — the closedmark span never depends on `rec` at all, matching
 *  the prototype's own ternary, which does not consult stampClass/
 *  stampLabel/stampIcon on that branch. */
import type { Classification } from '../domain/types'
import { ICONS } from './icons'
import { UI } from '../screens/screenCopy'

function stampClass(rec: Classification): string {
  return rec === 'WAIT' ? 'wait' : rec === 'FOLLOW_UP' ? 'follow' : rec === 'ESCALATE' ? 'escalate' : 'unclassified'
}

function stampLabel(rec: Classification): string {
  return rec === 'FOLLOW_UP' ? 'FOLLOW UP' : rec
}

function stampIcon(rec: Classification) {
  return rec === 'WAIT'
    ? ICONS.statusWait
    : rec === 'FOLLOW_UP'
      ? ICONS.statusFollow
      : rec === 'ESCALATE'
        ? ICONS.statusEscalate
        : ICONS.statusUnclassified
}

export interface StatusStampProps {
  rec: Classification
  /** The compact Home card's small stamp — no icon (prototype 3127). */
  mini?: boolean
  /** The compact Home card's CLOSED form — ignores `rec` entirely. */
  closed?: boolean
}

export function StatusStamp({ rec, mini, closed }: StatusStampProps) {
  if (closed) {
    return <span className="stamp mini closedmark">{UI.card.closedMark}</span>
  }
  return (
    <span className={`stamp${mini ? ' mini' : ''} ${stampClass(rec)}`}>
      {!mini && <span className="stamp-icon" aria-hidden="true">{stampIcon(rec)}</span>}
      {stampLabel(rec)}
    </span>
  )
}
