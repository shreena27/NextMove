import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Home } from './Home'

describe('Home', () => {
  it('shows the product promise and prompt, nothing marketing-heavy', () => {
    render(<Home onSelectPassport={() => {}} />)
    expect(screen.getByText(/know what.s holding things up/i)).toBeInTheDocument()
    expect(screen.getByText(/what.s stuck/i)).toBeInTheDocument()
  })

  it('lists Passport as functional, Voter Services as visible-not-functional, Income Certificate as coming soon', () => {
    render(<Home onSelectPassport={() => {}} />)
    expect(screen.getByRole('button', { name: /passport/i })).toBeInTheDocument()
    expect(screen.getByText('Voter Services')).toBeInTheDocument()
    expect(screen.getByText('Income Certificate')).toBeInTheDocument()
    // Only Income Certificate gets the "Coming Soon" badge — Voter Services
    // is visible-but-inactive, a distinct status (PRD §4).
    expect(screen.getAllByText('Coming Soon')).toHaveLength(1)
  })

  it('selecting Passport calls onSelectPassport', async () => {
    const onSelectPassport = vi.fn()
    render(<Home onSelectPassport={onSelectPassport} />)

    await userEvent.click(screen.getByRole('button', { name: /passport/i }))

    expect(onSelectPassport).toHaveBeenCalledOnce()
  })

  it('Voter Services and Income Certificate are not clickable as functional flows', () => {
    render(<Home onSelectPassport={() => {}} />)
    expect(screen.queryByRole('button', { name: /voter services/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /income certificate/i })).not.toBeInTheDocument()
  })
})
