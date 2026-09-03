import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DiagnosisScreen } from './DiagnosisScreen'
import type { Diagnosis } from '../domain/types'

const diagnosis: Diagnosis = {
  state: '1',
  dependency: 'Police verification process',
  recommendation: 'WAIT',
  explanation: 'This is the expected current stage. Nothing is overdue.',
  matchedAnswers: [{ questionId: 'q1', value: 'no_contact' }],
  matchedRuleId: 'state-1',
  sources: [],
}

describe('DiagnosisScreen', () => {
  it('creates the "we found where it is waiting" moment', () => {
    render(
      <DiagnosisScreen
        diagnosis={diagnosis}
        stateLabel="Waiting for police verification to begin"
        onSeeNextMove={() => {}}
      />,
    )
    expect(screen.getByText(/we found where your application is waiting/i)).toBeInTheDocument()
  })

  it('shows the recommendation, explanation, and dependency together', () => {
    render(
      <DiagnosisScreen
        diagnosis={diagnosis}
        stateLabel="Waiting for police verification to begin"
        onSeeNextMove={() => {}}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Wait')
    expect(screen.getByText(diagnosis.explanation)).toBeInTheDocument()
    expect(screen.getByText('Police verification process')).toBeInTheDocument()
  })

  it('shows the process timeline positioned at the given step', () => {
    render(
      <DiagnosisScreen
        diagnosis={diagnosis}
        stateLabel="Waiting for police verification to begin"
        onSeeNextMove={() => {}}
      />,
    )
    expect(screen.getByText('Police verification').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
  })

  it('has the primary CTA to see the next move', () => {
    render(
      <DiagnosisScreen
        diagnosis={diagnosis}
        stateLabel="Waiting for police verification to begin"
        onSeeNextMove={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /see my next move/i })).toBeInTheDocument()
  })

  it('renders the unclassified state without an overdue/waiting claim', () => {
    const unclassified: Diagnosis = {
      state: '6',
      dependency: 'Unknown — not enough was supplied to identify a stage',
      recommendation: 'UNCLASSIFIED',
      explanation: "NextMove doesn't have enough information to safely determine your case state.",
      matchedAnswers: [],
      matchedRuleId: null,
      sources: [],
    }
    render(
      <DiagnosisScreen diagnosis={unclassified} stateLabel="Status unclear" onSeeNextMove={() => {}} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Unclassified')
    expect(screen.queryByText(/we found where your application is waiting/i)).not.toBeInTheDocument()
  })
})
