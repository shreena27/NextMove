import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { AnswerRow } from './AnswerRow'

describe('AnswerRow', () => {
  it('renders the label and optional sublabel', () => {
    render(<AnswerRow label="No, not yet" sublabel="Most common answer" onSelect={() => {}} />)

    expect(screen.getByRole('button', { name: /No, not yet/ })).toBeInTheDocument()
    expect(screen.getByText('Most common answer')).toBeInTheDocument()
  })

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn()
    render(<AnswerRow label="Yes, informally" onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: /Yes, informally/ }))

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('is reachable and activatable by keyboard (Enter)', async () => {
    const onSelect = vi.fn()
    render(<AnswerRow label="I'm not sure" onSelect={onSelect} />)

    const row = screen.getByRole('button', { name: /I'm not sure/ })
    row.focus()
    await userEvent.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('shows a selected visual state when selected is true', () => {
    render(<AnswerRow label="No, not yet" onSelect={() => {}} selected />)

    expect(screen.getByRole('button', { name: /No, not yet/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
