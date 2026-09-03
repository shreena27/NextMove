import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NextMoveCard } from './NextMoveCard'
import type { NextMoveRecommendation } from '../domain/types'

const rec: NextMoveRecommendation = {
  what: 'Check whether anything further is needed from you.',
  why: 'Police have contacted you, but verification does not appear complete yet.',
  where: { label: 'Passport Office (PO) concerned' },
  whatYoullNeed: "Nothing required — a file number helps but isn't necessary.",
}

describe('NextMoveCard', () => {
  it('renders all four fields, none left blank', () => {
    render(<NextMoveCard recommendation={rec} onPrepare={() => {}} />)

    expect(screen.getByText(rec.what)).toBeInTheDocument()
    expect(screen.getByText(rec.why)).toBeInTheDocument()
    expect(screen.getByText(rec.where.label)).toBeInTheDocument()
    expect(screen.getByText(rec.whatYoullNeed)).toBeInTheDocument()
  })

  it('renders the Prepare this for me CTA as the Slice 2 boundary', () => {
    render(<NextMoveCard recommendation={rec} onPrepare={() => {}} />)
    expect(screen.getByRole('button', { name: /prepare this for me/i })).toBeInTheDocument()
  })
})
