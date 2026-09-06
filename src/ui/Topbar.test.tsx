import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Topbar } from './Topbar'

describe('restart confirmation (PRD §15, AC-9)', () => {
  it('with answers, Restart arms an inline confirm instead of clearing', async () => {
    const dispatch = vi.fn()
    render(<Topbar showBack showRestart hasAnswers restartConfirm={false} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART_REQUEST' })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'RESTART' })
  })

  it('the armed confirm reads exactly "Clear your answers?" with Yes / Cancel', () => {
    render(<Topbar showBack showRestart hasAnswers restartConfirm dispatch={vi.fn()} />)
    expect(screen.getByText('Clear your answers?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveClass('yes')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('no')
  })

  it('Cancel dispatches RESTART_CANCEL, Yes dispatches RESTART', async () => {
    const dispatch = vi.fn()
    render(<Topbar showBack showRestart hasAnswers restartConfirm dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART_CANCEL' })
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
  })

  it('with no answers, Restart restarts immediately (nothing to lose)', async () => {
    const dispatch = vi.fn()
    render(<Topbar showBack showRestart hasAnswers={false} restartConfirm={false} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
  })

  it('Home hides both Back and Restart', () => {
    render(<Topbar showBack={false} showRestart={false} hasAnswers={false} restartConfirm={false} dispatch={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '← Back' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull()
  })
})
