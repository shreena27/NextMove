import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from './Footer'

describe('Footer', () => {
  it('renders the copyright line', () => {
    render(<Footer />)
    expect(screen.getByText('© 2026 NextMove. All rights reserved.')).toBeInTheDocument()
  })

  it('renders as a <footer> element', () => {
    render(<Footer />)
    expect(document.querySelector('footer.footer')).not.toBeNull()
  })
})
