import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { Casefile } from '../domain/casefile'
import { caseSnapshot } from '../domain/casefile'
import { CLOSED_TITLE } from '../domain/checkinOptions'
import { diagnose } from '../domain/engine'
import { passportEngine } from '../playbooks/engines'
import { UI } from '../screens/screenCopy'
import { CaseCard } from './CaseCard'

const NOW = 1_725_000_000_000
const DAY = 86400000

// state-5a (FOLLOW_UP, "Followed up informally, unresolved") — a real
// passport diagnosis with a non-null whatShort and a real prep plan
// (PREP['state-5a']), so stepsTotal > 0 without hand-faking either field.
function baseCase(overrides: Partial<Casefile> = {}): Casefile {
  const answers = { q1: 'adverse', q2: 'informal' }
  const snap = caseSnapshot(
    'passport', 'Passport', 'passport-nextmove', diagnose(passportEngine, answers), answers, {}, [], null, null, NOW,
  )
  return { ...snap, id: 'c1', outcome: 'still_open', lastCheck: null, remindAt: null, log: [], ...overrides }
}

describe('CaseCard (port of caseCard, prototype 3117-3135) — the whole card is the tap target', () => {
  it('the whole card is a single <button> — exactly one button in the subtree', () => {
    const { getAllByRole } = render(<CaseCard case={baseCase()} onOpen={() => {}} now={NOW} />)
    expect(getAllByRole('button')).toHaveLength(1)
  })

  it('clicking anywhere in the card fires onOpen', () => {
    const onOpen = vi.fn()
    const { getByRole } = render(<CaseCard case={baseCase()} onOpen={onOpen} now={NOW} />)
    fireEvent.click(getByRole('button'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('an open card shows the Next line, steps chip, last-update chip and check-back chip when the data exists', () => {
    const c = baseCase({ lastCheck: NOW - 2 * DAY, remindAt: '2026-10-12' })
    expect(c.whatShort).not.toBeNull()
    expect(c.stepsTotal).toBeGreaterThan(0)
    const { container } = render(<CaseCard case={c} onOpen={() => {}} now={NOW} />)
    expect(container.querySelector('.saved-next')).toHaveTextContent(`Next: ${c.whatShort}`)
    const chips = Array.from(container.querySelectorAll('.saved-steps')).map(e => e.textContent ?? '')
    expect(chips.some(t => t.includes('steps done'))).toBe(true)
    expect(chips.some(t => t.includes('last update') && t.includes('2 days ago'))).toBe(true)
    expect(chips.some(t => t.includes('check back') && t.includes('12 Oct'))).toBe(true)
  })

  it('an open card with none of that data shows none of those chips', () => {
    const c = baseCase({ whatShort: null, stepsTotal: 0, lastCheck: null, remindAt: null })
    const { container } = render(<CaseCard case={c} onOpen={() => {}} now={NOW} />)
    expect(container.querySelector('.saved-next')).toBeNull()
    expect(container.querySelectorAll('.saved-steps')).toHaveLength(0)
  })

  it('a deliverable_received card shows CLOSED_TITLE[engineKey] as its title and the "Closed — got it" kicker', () => {
    const c = baseCase({ outcome: 'deliverable_received', closedAt: NOW })
    const { container } = render(<CaseCard case={c} onOpen={() => {}} now={NOW} />)
    expect(container.querySelector('.saved-title')).toHaveTextContent(CLOSED_TITLE.passport)
    expect(container.querySelector('.saved-kicker')).toHaveTextContent(UI.card.closedGotIt)
    expect(container.querySelector('.saved-card')).toHaveClass('closed')
  })

  it('a closed_unresolved card keeps stateLabel (not CLOSED_TITLE) and the "Closed — unresolved" kicker', () => {
    const c = baseCase({ outcome: 'closed_unresolved', closedAt: NOW })
    const { container } = render(<CaseCard case={c} onOpen={() => {}} now={NOW} />)
    expect(container.querySelector('.saved-title')).toHaveTextContent(c.stateLabel)
    expect(container.querySelector('.saved-kicker')).toHaveTextContent(UI.card.closedUnresolved)
  })

  it('a superseded card shows the "Closed — set aside" kicker, never "Closed — unresolved" (D3: a superseded case is not an unresolved one)', () => {
    const c = baseCase({ outcome: 'superseded', closedAt: NOW })
    const { container } = render(<CaseCard case={c} onOpen={() => {}} now={NOW} />)
    expect(
      container.querySelector('.saved-kicker'),
      'D3: a superseded case is not an unresolved one — it never went through the escalation ladder, so it must not fall into the closedUnresolved kicker',
    ).toHaveTextContent(UI.card.closedSuperseded)
    expect(container.querySelector('.saved-kicker')).not.toHaveTextContent(UI.card.closedUnresolved)
    expect(container.querySelector('.saved-card')).toHaveClass('closed')
  })

  it('no closed card renders a coloured status chip — only the CLOSED mark', () => {
    const c = baseCase({ outcome: 'closed_unresolved', closedAt: NOW })
    const { container } = render(<CaseCard case={c} onOpen={() => {}} now={NOW} />)
    const stamp = container.querySelector('.stamp')!
    expect(stamp).toHaveClass('closedmark')
    expect(stamp).not.toHaveClass('wait')
    expect(stamp).not.toHaveClass('follow')
    expect(stamp).not.toHaveClass('escalate')
    expect(stamp).not.toHaveClass('unclassified')
    expect(stamp).toHaveTextContent(UI.card.closedMark)
  })

  it('no card renders a journey log or an action button cluster — the compact-card spec\'s whole point', () => {
    const c = baseCase({ log: [{ t: NOW, kind: 'diagnosed', text: 'x' }] })
    const { container } = render(<CaseCard case={c} onOpen={() => {}} now={NOW} />)
    expect(container.querySelector('.journey')).toBeNull()
    expect(container.querySelector('.log-e')).toBeNull()
    expect(container.querySelector('.saved-actions')).toBeNull()
    expect(container.querySelector('.case-remove')).toBeNull()
    expect(container.querySelector('.case-link')).toBeNull()
  })

  it('an unrecognised serviceLabel still shows a coloured square (sq-butter fallback) — design note 1', () => {
    const c = baseCase({ serviceLabel: 'Something Unknown' })
    const { container } = render(<CaseCard case={c} onOpen={() => {}} now={NOW} />)
    expect(container.querySelector('.crumb-sq')).toHaveClass('sq-butter')
  })

  it('the open kicker is "Saved {date}"', () => {
    const { container } = render(<CaseCard case={baseCase()} onOpen={() => {}} now={NOW} />)
    expect(container.querySelector('.saved-kicker')).toHaveTextContent(/Saved \d{1,2} \w{3}/)
  })
})
