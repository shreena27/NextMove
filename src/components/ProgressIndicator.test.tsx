import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProgressIndicator } from './ProgressIndicator'

describe('ProgressIndicator', () => {
  it('reads the real question count as a prop, not a hardcoded total', () => {
    render(<ProgressIndicator current={2} total={3} />)
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument()
  })

  it('renders a different total when given one, proving it is not hardcoded', () => {
    render(<ProgressIndicator current={1} total={5} />)
    expect(screen.getByText('Question 1 of 5')).toBeInTheDocument()
  })
})
