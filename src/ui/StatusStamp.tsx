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
 *  Constraint that already covers `.gems`. */
import type { Classification } from '../domain/types'
import { ICONS } from './icons'

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

export function StatusStamp({ rec }: { rec: Classification }) {
  return (
    <span className={`stamp ${stampClass(rec)}`}>
      <span className="stamp-icon" aria-hidden="true">{stampIcon(rec)}</span>
      {stampLabel(rec)}
    </span>
  )
}
