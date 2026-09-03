import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DependencyDisplay } from './DependencyDisplay'

describe('DependencyDisplay', () => {
  it('renders the dependency it is given, not a fixed string', () => {
    render(<DependencyDisplay dependency="Police verification process" />)
    expect(screen.getByText('Police verification process')).toBeInTheDocument()
    expect(screen.getByText(/waiting on/i)).toBeInTheDocument()
  })
})
