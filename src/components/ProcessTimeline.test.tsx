import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProcessTimeline } from './ProcessTimeline'

describe('ProcessTimeline', () => {
  const steps = ['Application', 'Appointment', 'Police verification', 'Processing']

  it('renders every step passed in, so the step list is a prop not a fixture', () => {
    render(<ProcessTimeline steps={steps} currentIndex={2} />)
    for (const step of steps) {
      expect(screen.getByText(step)).toBeInTheDocument()
    }
  })

  it('marks the current step distinctly from completed and upcoming steps', () => {
    render(<ProcessTimeline steps={steps} currentIndex={2} />)
    expect(screen.getByText('Police verification').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByText('Application').closest('li')).not.toHaveAttribute('aria-current')
  })
})
