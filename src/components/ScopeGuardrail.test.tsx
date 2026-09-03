import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ScopeGuardrail } from './ScopeGuardrail'

describe('ScopeGuardrail', () => {
  it('asks whether the passport has already been received', () => {
    render(<ScopeGuardrail onInScope={() => {}} onOutOfScope={() => {}} />)
    expect(screen.getByText(/already received your passport/i)).toBeInTheDocument()
  })

  it('calls onOutOfScope and shows the guardrail message when the user answers yes', async () => {
    const onOutOfScope = vi.fn()
    render(<ScopeGuardrail onInScope={() => {}} onOutOfScope={onOutOfScope} />)

    await userEvent.click(screen.getByRole('button', { name: /^yes/i }))

    expect(onOutOfScope).toHaveBeenCalledOnce()
    expect(
      screen.getByText(/designed for applications where the passport hasn't been issued yet/i),
    ).toBeInTheDocument()
  })

  it('calls onInScope when the user answers no', async () => {
    const onInScope = vi.fn()
    render(<ScopeGuardrail onInScope={onInScope} onOutOfScope={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: /^no/i }))

    expect(onInScope).toHaveBeenCalledOnce()
  })
})
