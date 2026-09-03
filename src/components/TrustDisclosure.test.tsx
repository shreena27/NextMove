import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { TrustDisclosure } from './TrustDisclosure'
import type { Diagnosis } from '../domain/types'

const diagnosis: Diagnosis = {
  state: '2',
  dependency: 'Police verification process',
  recommendation: 'FOLLOW_UP',
  explanation: 'Police have contacted you, but verification does not appear complete yet.',
  matchedAnswers: [
    { questionId: 'q1', value: 'contacted_incomplete' },
    { questionId: 'q2', value: 'no_followup' },
  ],
  matchedRuleId: 'state-2',
  sources: [
    {
      title: 'Passport Seva — Police Verification FAQ',
      url: 'https://www.passportindia.gov.in/psp/FaqPoliceVerification',
    },
  ],
}

describe('TrustDisclosure', () => {
  it('is collapsed by default (secondary, not on the primary screen)', () => {
    render(<TrustDisclosure diagnosis={diagnosis} stateLabel="Verification in progress" />)
    expect(screen.queryByText(diagnosis.explanation)).not.toBeInTheDocument()
  })

  it('reveals the human-facing state, explanation, and source when opened — not the internal rule id', async () => {
    render(<TrustDisclosure diagnosis={diagnosis} stateLabel="Verification in progress" />)

    await userEvent.click(screen.getByRole('button', { name: /why am i seeing this/i }))

    expect(screen.getByText('Verification in progress')).toBeInTheDocument()
    expect(screen.getByText(diagnosis.explanation)).toBeInTheDocument()
    expect(screen.getByText('Passport Seva — Police Verification FAQ')).toBeInTheDocument()
    expect(screen.queryByText('state-2')).not.toBeInTheDocument()
  })
})
