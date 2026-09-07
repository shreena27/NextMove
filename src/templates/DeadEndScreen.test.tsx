// RED for Task 10 — DeadEndScreen, the port of `renderDeadEnd` (design/
// nextmove-v1-prototype.html, 2971-2985, tag v1-design-lock-2). Real
// diagnoses (via `diagnose`) and real cases (via `caseSnapshot`), per the
// task brief. This screen's whole reason to exist is "no invented next
// step, no false hope" — the RED list's central assertion is therefore an
// ABSENCE: no link to any `*-prepare`/`*-nextmove` screen, ever.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeadEndScreen } from './DeadEndScreen'
import { caseSnapshot, type Casefile, type JourneyEntry } from '../domain/casefile'
import { diagnose } from '../domain/engine'
import { passportEngine } from '../playbooks/engines'
import { UI } from '../screens/screenCopy'

const NOW = 1_760_000_000_000

// A real passport snapshot (state-5a), with the log swapped for whatever a
// given test needs — same convention JourneyLog.test.tsx's own `makeCase`
// uses. Defaults to an empty log (3 or fewer entries) so JourneyLog's own
// "Show all N entries" button never appears — it would otherwise be a THIRD
// button on this screen, muddying the "exactly two controls" assertion
// below for a reason that has nothing to do with this screen's own
// contract.
function makeCase(log: JourneyEntry[] = [], overrides: Partial<Casefile> = {}): Casefile {
  const answers = { q1: 'adverse', q2: 'informal' }
  const snap = caseSnapshot(
    'passport', UI.serviceLabel.passport, 'passport-nextmove', diagnose(passportEngine, answers), answers, {}, NOW,
  )
  return { ...snap, id: 'dead-c1', outcome: 'still_open', lastCheck: null, remindAt: null, log, ...overrides }
}

describe('DeadEndScreen (port of renderDeadEnd, prototype 2971-2985)', () => {
  it('renders the exact crumbs (service label + "End of the verified ladder"), the headline, and the lede — a `.narrow` shell, not a Split', () => {
    const c = makeCase()
    render(<DeadEndScreen case={c} logOpen={{}} now={NOW} dispatch={vi.fn()} />)
    expect(document.querySelector('.narrow')).toBeInTheDocument()
    expect(document.querySelector('.split')).toBeNull()
    expect(document.querySelector('.crumbs')).toHaveTextContent(c.serviceLabel)
    expect(document.querySelector('.crumbs')).toHaveTextContent('End of the verified ladder')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      "You've used every step this playbook can verify.",
    )
    // Transcribed whole, word for word — per the task brief, "the most
    // carefully written copy in the product."
    expect(screen.getByText(UI.deadEnd.lede)).toBeInTheDocument()
  })

  it('renders the journey log', () => {
    const c = makeCase([{ t: NOW, kind: 'diagnosed', text: 'x' }])
    render(<DeadEndScreen case={c} logOpen={{}} now={NOW} dispatch={vi.fn()} />)
    expect(document.querySelector('.journey')).toBeInTheDocument()
  })

  it('offers exactly two controls — "Keep the case open" (secondary) and "Close it as unresolved" (ghost) — and no others', () => {
    const c = makeCase()
    render(<DeadEndScreen case={c} logOpen={{}} now={NOW} dispatch={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map(b => b.textContent)).toEqual([UI.deadEnd.keepOpen, UI.deadEnd.closeUnresolved])
    expect(buttons[0]).toHaveClass('btn-secondary')
    expect(buttons[1]).toHaveClass('btn-ghost')
  })

  it(
    'never offers a link to any *-prepare or *-nextmove screen — this is the product\'s most carefully-considered ' +
    'honesty commitment: no invented next step, no false hope',
    () => {
      const c = makeCase()
      render(<DeadEndScreen case={c} logOpen={{}} now={NOW} dispatch={vi.fn()} />)
      expect(document.querySelector('.case-link')).toBeNull()
      expect(screen.queryByText(UI.casefile.diagnosisLink)).toBeNull()
      expect(screen.queryByText(UI.casefile.prepareLink)).toBeNull()
    },
  )

  it('"Keep the case open" dispatches RESTART (design note: the case is left exactly as it is — nothing written)', async () => {
    const dispatch = vi.fn()
    const c = makeCase()
    render(<DeadEndScreen case={c} logOpen={{}} now={NOW} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: UI.deadEnd.keepOpen }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
  })

  it('"Close it as unresolved" dispatches CLOSE_UNRESOLVED with the injected clock (D6)', async () => {
    const dispatch = vi.fn()
    const c = makeCase()
    render(<DeadEndScreen case={c} logOpen={{}} now={NOW} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: UI.deadEnd.closeUnresolved }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLOSE_UNRESOLVED', now: NOW })
  })

  it('"Show all N entries" clicks TOGGLE_LOG for this case\'s id (JourneyLog\'s own onShowAll wiring)', async () => {
    const dispatch = vi.fn()
    const log: JourneyEntry[] = [
      { t: NOW, kind: 'diagnosed', text: 'A' },
      { t: NOW + 1, kind: 'reported', text: 'B' },
      { t: NOW + 2, kind: 'reported', text: 'C' },
      { t: NOW + 3, kind: 'reported', text: 'D' },
    ]
    const c = makeCase(log)
    render(<DeadEndScreen case={c} logOpen={{}} now={NOW} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: UI.log.showAll.replace('{n}', '4') }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_LOG', caseId: c.id })
  })
})
