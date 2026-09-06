/** Ports the locked prototype's `ICONS` object (design/nextmove-v1-
 *  prototype.html, lines 2198-2219) as JSX. SVG path data is byte-identical
 *  to the prototype's inline SVG strings — only the attribute spelling
 *  changes (kebab-case -> camelCase, self-closing tags) to satisfy JSX.
 *
 *  `brandMark`, `check` and `stepCheck` carry hard-coded hexes in the
 *  prototype (#F5D848 / #3D241C / #FAF7EF). The hexes are kept, but wired
 *  through TOKENS rather than re-typed as string literals, so the palette
 *  the ΔE floor test (tokens.test.ts) scans stays the single source these
 *  icons draw from too. */
import { TOKENS } from './tokens'

export const ICONS = {
  passport: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M9.5 15.5c0-1.5 1-2.3 2.5-2.3s2.5.8 2.5 2.3" />
      <path d="M8 19h8" />
    </svg>
  ),
  voter: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path d="M12 3 4 7v2h16V7l-8-4Z" />
      <path d="M5 10v8M9 10v8M15 10v8M19 10v8" />
      <path d="M3 21h18" />
    </svg>
  ),
  certificate: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <rect x="3" y="4" width="18" height="13" rx="1.5" />
      <circle cx="9" cy="17.5" r="3" fill="none" />
      <path d="M7.5 19.5 6.5 22l2.5-1.3L11.5 22l-1-2.5" />
    </svg>
  ),
  check: (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={TOKENS.paper} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5 5 9l4.5-6" />
    </svg>
  ),
  stepCheck: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={TOKENS.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5 5 9l4.5-6" />
    </svg>
  ),
  bookmark: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-6-4.5L6 21V3Z" />
    </svg>
  ),
  pen: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  google: (
    <svg width="17" height="17" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.5 17.7 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6C44.1 38 46.5 31.8 46.5 24.5Z" />
      <path fill="#FBBC05" d="M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2Z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.6-2 15.6-5.8l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48Z" />
    </svg>
  ),
  chevron: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  grid: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </svg>
  ),
  arrow: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  ),
  // Brand mark — a four-point compass star, NextMove's own "which way
  // next" glyph, in the butter accent.
  brandMark: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2c.7 6 4 9.3 10 10-6 .7-9.3 4-10 10-.7-6-4-9.3-10-10 6-.7 9.3-4 10-10Z" fill={TOKENS.butter} stroke={TOKENS.ink} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  ),
  // Status glyphs — restrained, one idea each, never alarming even for
  // ESCALATE (a single steady upward arrow, not a warning triangle).
  statusWait: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </svg>
  ),
  statusFollow: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  ),
  statusEscalate: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V6M6 11l6-6 6 6" />
    </svg>
  ),
  statusUnclassified: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3.2" />
      <path d="M12 12.5v.01" />
    </svg>
  ),
}
