/** Ports the prototype's `splitCols()` (design/nextmove-v1-prototype.html,
 *  line 2324-2326) — the desktop editorial split: context (crumbs +
 *  headline + lede) left, action (answers / fields / CTA) right. Collapses
 *  to one column below 960px via the lifted `.split` CSS. */
import type { ReactNode } from 'react'

export function Split({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="split">
      <div className="split-l">{left}</div>
      <div className="split-r">{right}</div>
    </div>
  )
}
