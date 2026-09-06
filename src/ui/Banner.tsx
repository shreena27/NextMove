/** Ports the prototype's recurring `<div class="banner"><p class="small"
 *  style="margin:0;">...</p></div>` shape (design/nextmove-v1-prototype.html,
 *  e.g. lines 2024, 3575, 3597, 3599). Content differs per call site and
 *  belongs to later chunks (freshness, phase-drift, check-in notes); this is
 *  the shared shell those call sites wrap. */
import type { CSSProperties, ReactNode } from 'react'

export function Banner({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="banner" style={style}>
      <p className="small" style={{ margin: 0 }}>{children}</p>
    </div>
  )
}
