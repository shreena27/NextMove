// The casefiles section (Task 11; design note 5, prototype renderHome
// 3137-3142/3168) — mounted at Home's own already-marked insertion point.
// No dedicated Home.test.tsx existed before this task; App.test.tsx's own
// "Home v2" describe block already pins the no-cases/no-.home-cases
// behaviour through the real router (and stays valid: state.savedCases is
// always [] there), but the casefiles section itself needs its own
// component-level coverage, which lives here.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Home } from './Home'
import { initialSession, type SessionState } from '../session/session'
import { caseSnapshot, type Casefile } from '../domain/casefile'
import { diagnose } from '../domain/engine'
import { passportEngine } from '../playbooks/engines'
import { UI } from './screenCopy'

const NOW = 1_760_000_000_000
const answers = { q1: 'adverse', q2: 'informal' } // state-5a
const d = diagnose(passportEngine, answers)
const baseSnap = caseSnapshot('passport', UI.serviceLabel.passport, 'passport-nextmove', d, answers, {}, NOW)

function makeCase(id: string, overrides: Partial<Casefile> = {}): Casefile {
  return { ...baseSnap, id, outcome: 'still_open', lastCheck: null, remindAt: null, log: [], ...overrides }
}

function stateWith(savedCases: Casefile[]): SessionState {
  return { ...initialSession, savedCases }
}

describe("Home's casefiles section (design note 5)", () => {
  it('renders no .home-cases at all when there are no saved cases — not an empty wrapper', () => {
    const { container } = render(<Home state={stateWith([])} dispatch={vi.fn()} now={NOW} />)
    expect(container.querySelector('.home-cases')).toBeNull()
  })

  it('one open case: singular lead and one card', () => {
    const c = makeCase('c1')
    render(<Home state={stateWith([c])} dispatch={vi.fn()} now={NOW} />)
    expect(screen.getByText(UI.home.casefilesOne.replace('{n}', '1'))).toBeInTheDocument()
    expect(document.querySelectorAll('.saved-card')).toHaveLength(1)
  })

  it('two open cases: plural lead and two cards', () => {
    const c1 = makeCase('c1')
    const c2 = makeCase('c2')
    render(<Home state={stateWith([c1, c2])} dispatch={vi.fn()} now={NOW} />)
    expect(screen.getByText(UI.home.casefilesMany.replace('{n}', '2'))).toBeInTheDocument()
    expect(document.querySelectorAll('.saved-card')).toHaveLength(2)
  })

  it('an open case and a closed case: both sections render, open first, with the Closed lead between them', () => {
    const open = makeCase('c-open')
    const closed = makeCase('c-closed', { outcome: 'deliverable_received', closedAt: NOW })
    render(<Home state={stateWith([open, closed])} dispatch={vi.fn()} now={NOW} />)

    const homeCases = document.querySelector('.home-cases')!
    expect(homeCases).not.toBeNull()
    const leads = Array.from(homeCases.querySelectorAll('.list-lead')).map(el => el.textContent)
    expect(leads).toEqual([UI.home.casefilesOne.replace('{n}', '1'), UI.home.closedLead])

    const cards = Array.from(homeCases.querySelectorAll('.saved-card'))
    expect(cards).toHaveLength(2)
    // Open first, closed below — assert actual DOM position, not just
    // presence (the whole point of this test).
    expect(cards[0]).not.toHaveClass('closed')
    expect(cards[1]).toHaveClass('closed')

    // And the Closed lead sits strictly between the two cards.
    const leadEls = Array.from(homeCases.querySelectorAll('.list-lead'))
    const closedLeadEl = leadEls.find(el => el.textContent === UI.home.closedLead)!
    const allChildren = Array.from(homeCases.children)
    expect(allChildren.indexOf(cards[0])).toBeLessThan(allChildren.indexOf(closedLeadEl))
    expect(allChildren.indexOf(closedLeadEl)).toBeLessThan(allChildren.indexOf(cards[1]))
  })

  it('clicking anywhere on a card dispatches OPEN_CHECKIN with that card\'s id', () => {
    const c1 = makeCase('c1')
    const c2 = makeCase('c2')
    const dispatch = vi.fn()
    render(<Home state={stateWith([c1, c2])} dispatch={dispatch} now={NOW} />)
    const cards = document.querySelectorAll('.saved-card')
    ;(cards[1] as HTMLElement).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_CHECKIN', id: 'c2' })
  })

  it('the three service rows still render alongside a non-empty casefiles section', () => {
    render(<Home state={stateWith([makeCase('c1')])} dispatch={vi.fn()} now={NOW} />)
    expect(document.querySelectorAll('.services .svc')).toHaveLength(3)
  })
})
