/** Ports the prototype's `gems()` (design/nextmove-v1-prototype.html, lines
 *  2220-2242) — Teak's floating confetti shapes, drawn once, reused at the
 *  two emotional peaks (Home hero, Diagnosis reveal). Pure decoration:
 *  `aria-hidden`, `pointer-events:none` (via the lifted `.gems` CSS),
 *  desktop only (hidden below 600px, also lifted CSS). */
import type { CSSProperties, ReactElement } from 'react'

const SHAPES: Record<string, ReactElement> = {
  diamondGreen: (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="3" y="3" width="10" height="10" rx="2" transform="rotate(45 8 8)" fill="#2FA866" />
    </svg>
  ),
  diamondPink: (
    <svg width="13" height="13" viewBox="0 0 16 16">
      <rect x="3" y="3" width="10" height="10" rx="2" transform="rotate(45 8 8)" fill="#F0679E" />
    </svg>
  ),
  dotButter: (
    <svg width="11" height="11" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="5" fill="#F5D848" stroke="#3D241C" strokeWidth={1} />
    </svg>
  ),
  ringBlue: (
    <svg width="14" height="14" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="#5FA8E8" strokeWidth={2.5} />
    </svg>
  ),
  star: (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <path
        d="M12 3c.5 4.2 2.8 6.5 7 7-4.2.5-6.5 2.8-7 7-.5-4.2-2.8-6.5-7-7 4.2-.5 6.5-2.8 7-7Z"
        fill="#F5D848"
        stroke="#3D241C"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  ),
}

export type GemsPlacement = 'hero' | 'reveal'

// Positioned in the cell's edges and ragged-right gaps, never over text.
const LAYOUTS: Record<GemsPlacement, [keyof typeof SHAPES, CSSProperties][]> = {
  hero: [
    ['star', { top: '1%', right: '2%' }],
    ['diamondPink', { top: '34%', right: 0 }],
    ['diamondGreen', { top: '68%', right: '5%' }],
    ['dotButter', { top: '92%', right: '16%' }],
  ],
  reveal: [
    ['diamondPink', { top: '2%', right: '3%' }],
    ['star', { top: '38%', right: 0 }],
    ['dotButter', { top: '74%', right: '9%' }],
  ],
}

export function Gems({ placement }: { placement: GemsPlacement }) {
  return (
    <div className="gems" aria-hidden="true">
      {LAYOUTS[placement].map(([shape, pos], i) => (
        <span className="gem" style={pos} key={i}>
          {SHAPES[shape]}
        </span>
      ))}
    </div>
  )
}
