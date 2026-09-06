/** Ports the prototype's `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-block`
 *  button family (design/nextmove-v1-prototype.html buttons throughout,
 *  e.g. lines 2845-2997) — the butter pill primary (Teak's own CTA) and the
 *  espresso secondary. `.btn-ghost` and friends are out of scope here (C5/
 *  C7 — see src/index.css's own "deliberately not lifted" note); this is
 *  only the family Task 1's CSS actually carries. A real `<button>`, so it
 *  is keyboard-reachable and gets the lifted ink focus ring for free. */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ICONS } from './icons'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  block?: boolean
  /** Trailing chevron-arrow, the prototype's `<span class="btn-arrow">`. */
  arrow?: boolean
  children: ReactNode
}

export function Button({ variant = 'primary', block = false, arrow = false, className, children, ...rest }: ButtonProps) {
  const classes = [
    'btn',
    variant === 'primary' ? 'btn-primary' : 'btn-secondary',
    block ? 'btn-block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={classes} {...rest}>
      {children}
      {arrow ? <span className="btn-arrow">{ICONS.arrow}</span> : null}
    </button>
  )
}
