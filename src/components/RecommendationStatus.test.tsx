import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RecommendationStatus } from './RecommendationStatus'

describe('RecommendationStatus', () => {
  it.each([
    ['WAIT', 'Wait'],
    ['FOLLOW_UP', 'Follow up'],
    ['ESCALATE', 'Escalate'],
    ['UNCLASSIFIED', 'Unclassified'],
  ] as const)('renders a visible text label for %s, not color alone', (value, label) => {
    render(<RecommendationStatus recommendation={value} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('exposes the classification to assistive tech via role=status', () => {
    render(<RecommendationStatus recommendation="FOLLOW_UP" />)

    expect(screen.getByRole('status')).toHaveTextContent('Follow up')
  })
})
