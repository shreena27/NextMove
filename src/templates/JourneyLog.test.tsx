import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { Casefile, JourneyEntry } from '../domain/casefile'
import { caseSnapshot, LOG_COPY } from '../domain/casefile'
import { diagnose } from '../domain/engine'
import { passportEngine } from '../playbooks/engines'
import { UI } from '../screens/screenCopy'
import { JourneyLog } from './JourneyLog'

const NOW = 1_725_000_000_000
const DAY = 86400000

// A real passport snapshot (state-5a), with the log swapped for whatever
// each test needs — the log is the only thing JourneyLog actually reads,
// but `case` is typed as the full Casefile (the shape a real casefile
// screen hands it), so the fixture stays a real one, not a narrowed stub.
function makeCase(log: JourneyEntry[], id = 'c1'): Casefile {
  const answers = { q1: 'adverse', q2: 'informal' }
  const snap = caseSnapshot(
    'passport', 'Passport', 'passport-nextmove', diagnose(passportEngine, answers), answers, {}, NOW,
  )
  return { ...snap, id, outcome: 'still_open', lastCheck: null, remindAt: null, log }
}

describe('JourneyLog (port of renderLog, prototype 2807-2829)', () => {
  it('shows the last 3 of 5 mixed entries plus a "Show all 5 entries" button; clicking it calls onShowAll', () => {
    const log: JourneyEntry[] = [
      { t: NOW, kind: 'diagnosed', text: 'A' },
      { t: NOW + DAY, kind: 'reported', text: 'B' },
      { t: NOW + 2 * DAY, kind: 'checked', text: 'C', noChange: true },
      { t: NOW + 3 * DAY, kind: 'reported', text: 'D' },
      { t: NOW + 4 * DAY, kind: 'closed', text: 'E' },
    ]
    const onShowAll = vi.fn()
    const { container, getByRole } = render(<JourneyLog case={makeCase(log)} logOpen={{}} onShowAll={onShowAll} />)
    expect(container.querySelectorAll('.log-e')).toHaveLength(3)
    const btn = getByRole('button', { name: UI.log.showAll.replace('{n}', '5') })
    fireEvent.click(btn)
    expect(onShowAll).toHaveBeenCalledTimes(1)
  })

  it('shows all 5 and no button when logOpen[c.id] is true', () => {
    const log: JourneyEntry[] = [
      { t: NOW, kind: 'diagnosed', text: 'A' },
      { t: NOW + DAY, kind: 'reported', text: 'B' },
      { t: NOW + 2 * DAY, kind: 'checked', text: 'C', noChange: true },
      { t: NOW + 3 * DAY, kind: 'reported', text: 'D' },
      { t: NOW + 4 * DAY, kind: 'closed', text: 'E' },
    ]
    const { container, queryByRole } = render(
      <JourneyLog case={makeCase(log)} logOpen={{ c1: true }} onShowAll={() => {}} />,
    )
    expect(container.querySelectorAll('.log-e')).toHaveLength(5)
    expect(queryByRole('button')).toBeNull()
  })

  it('DESIGN NOTE 4: the "Show all" button precedes the first .log-e entry in DOM order', () => {
    const log: JourneyEntry[] = [
      { t: NOW, kind: 'diagnosed', text: 'A' },
      { t: NOW + DAY, kind: 'reported', text: 'B' },
      { t: NOW + 2 * DAY, kind: 'reported', text: 'C' },
      { t: NOW + 3 * DAY, kind: 'reported', text: 'D' },
      { t: NOW + 4 * DAY, kind: 'reported', text: 'E' },
    ]
    const { container } = render(<JourneyLog case={makeCase(log)} logOpen={{}} onShowAll={() => {}} />)
    const kids = Array.from(container.querySelector('.journey')!.children)
    const btnIdx = kids.findIndex(k => k.classList.contains('read-change'))
    const firstEntryIdx = kids.findIndex(k => k.classList.contains('log-e'))
    expect(btnIdx).toBeGreaterThanOrEqual(0)
    expect(firstEntryIdx).toBeGreaterThan(btnIdx)
  })

  it('three consecutive noChange entries collapse into "Checked 3 times, {from} – {to} — no change reported"', () => {
    const log: JourneyEntry[] = [
      { t: NOW, kind: 'diagnosed', text: 'Start' },
      { t: NOW, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true },
      { t: NOW + DAY, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true },
      { t: NOW + 2 * DAY, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true },
    ]
    const { container } = render(<JourneyLog case={makeCase(log)} logOpen={{}} onShowAll={() => {}} />)
    const text = container.querySelector('.log-check')!.textContent!
    expect(text).toContain('Checked 3 times')
    expect(text).toContain('–')
    expect(text).toContain('no change reported')
  })

  it('a single noChange entry reads "Checked 1 time, {from} — no change reported" with no dash-range half', () => {
    const log: JourneyEntry[] = [{ t: NOW, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true }]
    const { container } = render(<JourneyLog case={makeCase(log)} logOpen={{}} onShowAll={() => {}} />)
    const text = container.querySelector('.log-check')!.textContent!
    expect(text).toContain('Checked 1 time,')
    expect(text).not.toContain('1 times')
    expect(text).not.toContain('–')
  })

  it('a legacy entry (kind checked, no noChange flag, text containing "no change") still collapses', () => {
    const log: JourneyEntry[] = [{ t: NOW, kind: 'checked', text: 'Migrated: no change since last visit' }]
    const { container } = render(<JourneyLog case={makeCase(log)} logOpen={{}} onShowAll={() => {}} />)
    expect(container.querySelectorAll('.log-e')).toHaveLength(1)
    expect(container.querySelector('.log-check')!.textContent).toContain('Checked 1 time')
  })

  it('a reported entry between two noChange entries produces two separate runs, not one', () => {
    const log: JourneyEntry[] = [
      { t: NOW, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true },
      { t: NOW + DAY, kind: 'reported', text: 'Something happened' },
      { t: NOW + 2 * DAY, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true },
    ]
    const { container } = render(<JourneyLog case={makeCase(log)} logOpen={{}} onShowAll={() => {}} />)
    const rows = container.querySelectorAll('.log-e')
    expect(rows).toHaveLength(3) // run(1), reported, run(1) — not one merged run
    expect(rows[1].textContent).toContain('Something happened')
  })

  it('.log-mile applies to diagnosed/closed/reopened, not reported/checked; .log-who reflects kind, empty for closed/reopened', () => {
    const log: JourneyEntry[] = [
      { t: NOW, kind: 'diagnosed', text: 'Diagnosed text' },
      { t: NOW + DAY, kind: 'reported', text: 'Reported text' },
      { t: NOW + 2 * DAY, kind: 'closed', text: 'Closed text' },
      { t: NOW + 3 * DAY, kind: 'reopened', text: 'Reopened text' },
      { t: NOW + 4 * DAY, kind: 'checked', text: LOG_COPY.elseReDiagnose },
    ]
    const { container } = render(<JourneyLog case={makeCase(log)} logOpen={{ c1: true }} onShowAll={() => {}} />)
    const rows = Array.from(container.querySelectorAll('.log-e'))
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveClass('log-mile') // diagnosed
    expect(rows[0].querySelector('.log-who')).toHaveTextContent(UI.log.whoDiagnosed)
    expect(rows[1]).not.toHaveClass('log-mile') // reported
    expect(rows[1].querySelector('.log-who')).toHaveTextContent(UI.log.whoReported)
    expect(rows[2]).toHaveClass('log-mile') // closed
    expect(rows[2].querySelector('.log-who')!.textContent).toBe('')
    expect(rows[3]).toHaveClass('log-mile') // reopened
    expect(rows[3].querySelector('.log-who')!.textContent).toBe('')
    expect(rows[4]).not.toHaveClass('log-mile') // checked, non-collapsing
    expect(rows[4].querySelector('.log-who')).toHaveTextContent(UI.log.whoOther)
  })

  it('.log-note always renders, even with zero entries', () => {
    const { container } = render(<JourneyLog case={makeCase([])} logOpen={{}} onShowAll={() => {}} />)
    expect(container.querySelector('.log-note')).toHaveTextContent(UI.log.note)
  })
})
