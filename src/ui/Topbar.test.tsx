import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Topbar } from './Topbar'
import { initialSession, type SessionState } from '../session/session'
import type { AppUser } from '../session/auth'

describe('restart confirmation (PRD §15, AC-9)', () => {
  it('with answers, Restart arms an inline confirm instead of clearing', async () => {
    const dispatch = vi.fn()
    render(<Topbar showBack showRestart hasAnswers restartConfirm={false} state={initialSession} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART_REQUEST' })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'RESTART' })
  })

  it('the armed confirm reads exactly "Clear your answers?" with Yes / Cancel', () => {
    render(<Topbar showBack showRestart hasAnswers restartConfirm state={initialSession} dispatch={vi.fn()} />)
    expect(screen.getByText('Clear your answers?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveClass('yes')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('no')
  })

  it('Cancel dispatches RESTART_CANCEL, Yes dispatches RESTART', async () => {
    const dispatch = vi.fn()
    render(<Topbar showBack showRestart hasAnswers restartConfirm state={initialSession} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART_CANCEL' })
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
  })

  it('with no answers, Restart restarts immediately (nothing to lose)', async () => {
    const dispatch = vi.fn()
    render(<Topbar showBack showRestart hasAnswers={false} restartConfirm={false} state={initialSession} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
  })

  it('Home hides both Back and Restart', () => {
    render(<Topbar showBack={false} showRestart={false} hasAnswers={false} restartConfirm={false} state={initialSession} dispatch={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '← Back' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull()
  })
})

// Task 15 (design note 2 / Open Question 1, RESOLVED): `state` replaced the
// originally planned `account: ReactNode` slot precisely because it is a
// compile-level fail-safe a `ReactNode` prop cannot give — TypeScript lists
// every missing `<Topbar>` site as an error. Pinned here two ways: a
// positive render proof that `Topbar` itself renders the chip (not a
// caller-supplied node), and a negative compile-time pin that `state` is
// required at all, matching this project's existing `@ts-expect-error`
// negative-pin convention (e.g. session.test.ts's own action-shape pins).
describe('Task 15: Topbar renders AccountChip itself off the required `state` prop', () => {
  const signedInUser: AppUser = { method: 'phone', id: '+919876543210', name: 'Ananya Sharma' }
  const signedInState: SessionState = { ...initialSession, user: signedInUser }

  it('renders the chip given a state whose user is set', () => {
    render(<Topbar showBack showRestart hasAnswers restartConfirm={false} state={signedInState} dispatch={vi.fn()} />)
    expect(document.querySelector('.acct-chip')).toBeInTheDocument()
  })

  it('renders nothing account-wise for state={initialSession} — the SAME visibility rule AccountChip.tsx documents (design note 3)', () => {
    render(<Topbar showBack showRestart hasAnswers restartConfirm={false} state={initialSession} dispatch={vi.fn()} />)
    expect(document.querySelector('.acct-chip')).toBeNull()
  })

  it('a compile-level pin that `state` is required', () => {
    // Deliberately NOT rendered — `state` missing at runtime (types bypassed
    // by the JS that actually executes) would crash inside AccountChip's own
    // destructure, which is not what this test is pinning. `tsc -b` type-
    // checks JSX regardless of whether the element is ever mounted, so
    // constructing it is enough to exercise the `@ts-expect-error` below.
    // @ts-expect-error — `state` is a required TopbarProps field (Task 15);
    // omitting it must be a compile error, the same fail-safe direction as
    // every other required-prop pin in this codebase.
    const el = <Topbar showBack showRestart hasAnswers restartConfirm={false} dispatch={vi.fn()} />
    expect(el).toBeTruthy()
  })
})
