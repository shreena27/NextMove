import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import App from './App'

async function startPassportInScope() {
  await userEvent.click(screen.getByRole('button', { name: /passport/i }))
  await userEvent.click(screen.getByRole('button', { name: /^no$/i })) // not yet received passport
}

describe('App — Passport Slice 1', () => {
  it('AC-1: no contact + no follow-up resolves to State 1, WAIT', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /haven.t heard/i }))
    await userEvent.click(screen.getByRole('button', { name: /^no, not yet/i }))

    expect(screen.getByRole('status')).toHaveTextContent('Wait')
    expect(screen.getByText('Police verification process')).toBeInTheDocument()
  })

  it('AC-2: informal follow-up overrides the stage to State 5a, FOLLOW UP, regardless of Q1', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /looks negative or confusing/i }))
    await userEvent.click(screen.getByRole('button', { name: /^yes, informally/i }))

    expect(screen.getByRole('status')).toHaveTextContent('Follow up')
    expect(screen.getByText(/formal grievance channel/i)).toBeInTheDocument()
  })

  it('AC-3: formal grievance overrides the stage to State 5b, ESCALATE, regardless of Q1', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /haven.t heard/i }))
    await userEvent.click(screen.getByRole('button', { name: /formal grievance/i }))

    expect(screen.getByRole('status')).toHaveTextContent('Escalate')
    expect(screen.getByText(/directorate of public grievances/i)).toBeInTheDocument()
  })

  it('AC-4: adverse status never states a cause', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /looks negative or confusing/i }))
    await userEvent.click(screen.getByRole('button', { name: /^no, not yet/i }))

    expect(screen.getByText(/contact the passport office to understand the specific reason/i)).toBeInTheDocument()
  })

  it('AC-5/AC-6: "I\'m not sure" -> unmatchable recovery text resolves to UNCLASSIFIED', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /i.m not sure/i }))
    await userEvent.click(screen.getByRole('button', { name: /tell me the safest thing/i }))

    expect(screen.getByRole('status')).toHaveTextContent('Unclassified')
  })

  it('AC-7: Back preserves the previously-given answer', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /haven.t heard/i }))
    await userEvent.click(screen.getByRole('button', { name: /^no, not yet/i }))
    // now on Diagnosis; go back twice to Q1 (Diagnosis -> Q2 -> Q1)
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    await userEvent.click(screen.getByRole('button', { name: /back/i }))

    expect(
      screen.getByRole('button', { name: /haven.t heard/i, pressed: true }),
    ).toBeInTheDocument()
  })

  it('AC-8 / additional decision: changing Q1 recomputes diagnosis and resets the Q2 answer', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /haven.t heard/i }))
    await userEvent.click(screen.getByRole('button', { name: /^yes, informally/i }))
    // Diagnosis now shows state 5a / FOLLOW UP. Go back to Q1 and change the answer.
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    await userEvent.click(screen.getByRole('button', { name: /looks negative or confusing/i }))

    // Q2 answer should have been cleared — no option shown as selected.
    expect(screen.queryByRole('button', { name: /yes, informally/i, pressed: true })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^no, not yet/i }))
    // Now resolves fresh to State 4 (adverse), not the stale State 5a.
    expect(screen.getByText(/contact the passport office to understand the specific reason/i)).toBeInTheDocument()
  })

  it('AC-9: Restart clears all answers and returns to Home', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /haven.t heard/i }))
    await userEvent.click(screen.getByRole('button', { name: /^no, not yet/i }))

    await userEvent.click(screen.getByRole('button', { name: /restart/i }))

    expect(screen.getByText(/what.s stuck/i)).toBeInTheDocument()
  })

  it('AC-11: Your Next Move renders all four fields with real content', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /haven.t heard/i }))
    await userEvent.click(screen.getByRole('button', { name: /^no, not yet/i }))
    await userEvent.click(screen.getByRole('button', { name: /^see my next move/i }))

    expect(screen.getByText('What')).toBeInTheDocument()
    expect(screen.getByText('Why')).toBeInTheDocument()
    expect(screen.getByText('Where')).toBeInTheDocument()
    expect(screen.getByText("What you'll need")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /prepare this for me/i })).toBeInTheDocument()
  })

  it('the "Prepare this for me" boundary does not generate an AI draft', async () => {
    render(<App />)
    await startPassportInScope()
    await userEvent.click(screen.getByRole('button', { name: /haven.t heard/i }))
    await userEvent.click(screen.getByRole('button', { name: /^no, not yet/i }))
    await userEvent.click(screen.getByRole('button', { name: /^see my next move/i }))
    await userEvent.click(screen.getByRole('button', { name: /prepare this for me/i }))

    expect(screen.getByText(/coming in a future slice/i)).toBeInTheDocument()
  })

  it('AC-14: answering "yes" to the scope guardrail does not proceed to Q1', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /passport/i }))
    await userEvent.click(screen.getByRole('button', { name: /^yes$/i }))

    expect(
      screen.getByText(/designed for applications where the passport hasn't been issued yet/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/what's happening with your application/i)).not.toBeInTheDocument()
  })

  it('FR-24: Income Certificate shows Coming Soon on Home and is not clickable', () => {
    render(<App />)
    expect(screen.getByText('Income Certificate')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /income certificate/i })).not.toBeInTheDocument()
  })
})
