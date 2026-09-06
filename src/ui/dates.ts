/** Ports the prototype's `fmtDay` (2731), `fmtRemind` (2735-2738) and
 *  `daysAgo` (2739) (design/nextmove-v1-prototype.html, tag
 *  v1-design-lock-2).
 *
 *  MANDATORY LOCATION (Task 8 design note 5), not one of two options: these
 *  three have THREE consumers (CaseCard, JourneyLog, and the future
 *  CasefileScreen), so they must be exported, and exporting them from any
 *  .tsx file that also exports a React component would trip oxlint's
 *  react(only-export-components) Fast Refresh rule and add a 5th warning
 *  beyond the 4 this project's baseline forbids — the exact failure mode
 *  serviceSquare.ts's own header note already guards against, same rule,
 *  same fix. This module is plain TypeScript, no JSX, no component.
 *
 *  They stay out of domain/ and session/ on purpose — they are
 *  presentation, and nothing in either of those layers formats a date.
 *
 *  `daysAgo` reads `Date.now()` internally in the prototype (2739). Under
 *  D6 (see src/session/cases.ts's own header note) the port takes `now` as
 *  an explicit second argument, so the function is deterministically
 *  testable with no fake-timer setup — the caller supplies it, exactly as
 *  the reducer actions do. */
import { UI } from '../screens/screenCopy'

/** `en-IN` locale, pinned deliberately — a different locale changes the
 *  rendered copy (e.g. US English would read "Sep 12"). */
export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** `remindAt` is stored as the date input's raw ISO value (it feeds the
 *  input back) but must never render as machine format — "12 Sep", not
 *  "2026-09-12". Falls back to the raw string if parsing ever fails, which
 *  is what keeps a corrupt stored value from rendering "Invalid Date". */
export function fmtRemind(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function daysAgo(t: number, now: number): string {
  const d = Math.floor((now - t) / 86400000)
  if (d <= 0) return UI.time.today
  if (d === 1) return UI.time.yesterday
  return UI.time.daysAgo.replace('{n}', String(d))
}
