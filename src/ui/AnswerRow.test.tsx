import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnswerRow } from './AnswerRow'

describe('AnswerRow (PRD §15 — equal-weight rows, prototype 2327-2337)', () => {
  it('PRD §15: "I\'m not sure" carries the SAME row treatment as every other option', () => {
    const { rerender } = render(<AnswerRow value="adverse" label="Something negative" selected={false} onSelect={vi.fn()} />)
    const normal = screen.getByRole('button').className
    rerender(<AnswerRow value="not_sure" label="I'm not sure" sub="Show me how to find out" selected={false} onSelect={vi.fn()} />)
    expect(screen.getByRole('button').className).toBe(normal)
  })

  it('a selected row gets .selected, and carries no ARIA state attribute', () => {
    const { container } = render(
      <AnswerRow value="adverse" label="Something negative" selected onSelect={vi.fn()} />)
    const btn = container.querySelector('button')!
    expect(btn).toHaveClass('arow', 'selected')
    expect(btn).not.toHaveAttribute('aria-pressed') // these navigate, they don't toggle
    expect(btn).not.toHaveAttribute('aria-current')
  })
})
