import { describe, it, expect } from 'vitest'
import * as dates from './dates'
import { fmtDay, fmtRemind, daysAgo } from './dates'
import { UI } from '../screens/screenCopy'

describe('dates.ts is component-free (Task 8 design note 5 — mandatory location, same reasoning as serviceSquare.ts)', () => {
  it('exports exactly fmtDay, fmtRemind, daysAgo — no React component', () => {
    expect(Object.keys(dates).sort()).toEqual(['daysAgo', 'fmtDay', 'fmtRemind'])
    expect(typeof dates.fmtDay).toBe('function')
    expect(typeof dates.fmtRemind).toBe('function')
    expect(typeof dates.daysAgo).toBe('function')
  })
})

describe('fmtDay (prototype 2731) — pinned to en-IN locale', () => {
  it('formats "12 Oct", not a US-style "Oct 12" or an ISO string', () => {
    // October, not September: this environment's en-IN ICU data renders
    // September's short form as "Sept" (confirmed via a direct probe), so
    // September would make this test locale-data-fragile rather than a
    // clean day/month-order pin. October has no such ambiguity, and matches
    // the brief's own fmtRemind('2026-10-12') -> '12 Oct' example.
    const t = new Date(2026, 9, 12, 10, 0, 0).getTime() // local time, avoids TZ edge cases
    expect(fmtDay(t)).toBe('12 Oct')
  })
})

describe('fmtRemind (prototype 2735-2738)', () => {
  it("renders '12 Oct' for a stored ISO date, never the raw ISO string", () => {
    expect(fmtRemind('2026-10-12')).toBe('12 Oct')
  })

  it("falls back to the raw string for a corrupt value, never 'Invalid Date'", () => {
    expect(fmtRemind('garbage')).toBe('garbage')
    expect(fmtRemind('garbage')).not.toContain('Invalid')
  })
})

describe('daysAgo (prototype 2739) — D6: now is an explicit second argument, not an internal Date.now()', () => {
  const NOW = new Date(2026, 8, 10, 12, 0, 0).getTime()
  const DAY = 86400000

  it('"today" at t === now, and for a future t (d <= 0)', () => {
    expect(daysAgo(NOW, NOW)).toBe(UI.time.today)
    expect(daysAgo(NOW + DAY, NOW)).toBe(UI.time.today)
  })

  it('"yesterday" for exactly one day back', () => {
    expect(daysAgo(NOW - DAY, NOW)).toBe(UI.time.yesterday)
  })

  it('"{n} days ago" beyond one day', () => {
    expect(daysAgo(NOW - 3 * DAY, NOW)).toBe(UI.time.daysAgo.replace('{n}', '3'))
  })
})
