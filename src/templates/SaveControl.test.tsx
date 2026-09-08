// Built ahead of its own Task 11 slot (see SaveControl.tsx's own header
// note) because Task 9's casefile-screen tail already needs it. Minimal,
// focused coverage of the component's own two branches — Task 11 extends
// this file rather than replacing it when it wires the component into
// NextMoveScreen/PrepareScreen/Home.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SaveControl } from './SaveControl'
import { diagnose } from '../domain/engine'
import { passportEngine } from '../playbooks/engines'
import { caseSnapshot } from '../domain/casefile'
import type { Casefile } from '../domain/casefile'
import { UI } from '../screens/screenCopy'
import { initialSession, sessionReducer } from '../session/session'
import type { SessionState } from '../session/session'

const NOW = 1_760_000_000_000
const helplineAnswers = { q1: 'adverse', q2: 'informal' } // state-5a
const helplineD = diagnose(passportEngine, helplineAnswers)

function makeSavedCase(overrides: Partial<Casefile> = {}): Casefile {
  const snap = caseSnapshot('passport', UI.serviceLabel.passport, 'passport-nextmove', helplineD, helplineAnswers, {}, NOW)
  return { ...snap, id: 'c1', outcome: 'still_open', lastCheck: null, remindAt: null, log: [], ...overrides }
}

describe('SaveControl', () => {
  it('shows the no-steps label when nothing is saved yet and no step is ticked', () => {
    render(
      <SaveControl engineKey="passport" stepsDone={0} savedCases={[]} answers={helplineAnswers} onSave={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: UI.saveControl.save })).toBeInTheDocument()
    expect(document.querySelector('.saved-note')).toBeNull()
  })

  it('shows the ticked-steps label when stepsDone > 0', () => {
    render(
      <SaveControl engineKey="passport" stepsDone={3} savedCases={[]} answers={helplineAnswers} onSave={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: UI.saveControl.saveWithSteps })).toBeInTheDocument()
  })

  it('clicking the save button fires onSave', async () => {
    const onSave = vi.fn()
    render(
      <SaveControl engineKey="passport" stepsDone={0} savedCases={[]} answers={helplineAnswers} onSave={onSave} />,
    )
    screen.getByRole('button', { name: UI.saveControl.save }).click()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('shows the saved-note and no button when a matching still-open saved case already exists', () => {
    const saved = makeSavedCase()
    render(
      <SaveControl
        engineKey="passport" stepsDone={0} savedCases={[saved]} answers={helplineAnswers} onSave={vi.fn()}
      />,
    )
    expect(document.querySelector('.saved-note')).toHaveTextContent(UI.saveControl.savedNote)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('does not treat a match against a CLOSED case as already saved (caseIsSaved gates on still_open)', () => {
    const closed = makeSavedCase({ outcome: 'deliverable_received', closedAt: NOW })
    render(
      <SaveControl
        engineKey="passport" stepsDone={0} savedCases={[closed]} answers={helplineAnswers} onSave={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: UI.saveControl.save })).toBeInTheDocument()
    expect(document.querySelector('.saved-note')).toBeNull()
  })

  // C7 Task 16 regression pin. SaveControl.tsx itself is not touched by
  // Task 16 (its brief, design note 1) — the branching lives entirely in
  // the reducer's BEGIN_SAVE arm. This proves the two stay correctly wired
  // together anyway: real reducer output from the SIGNED-IN branch (the one
  // Task 16 pins as behaving exactly as it did before) still renders the
  // `.saved-note`, not the save button, when fed straight into SaveControl.
  it('still renders the .saved-note for a case saved via the reducer\'s signed-in BEGIN_SAVE branch (unchanged behaviour)', () => {
    const signedIn: SessionState = {
      ...initialSession,
      user: { method: 'phone', id: '+919876543210', name: 'Ananya' },
      answers: helplineAnswers,
    }
    const saved = sessionReducer(signedIn, {
      type: 'BEGIN_SAVE', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
      returnScreen: 'passport-nextmove', now: NOW, newId: 'saved-case-uuid',
    })
    // Sanity: this took the signed-in (complete-immediately) branch, not
    // the signed-out sign-in detour — otherwise the assertions below would
    // trivially pass against an empty savedCases for the wrong reason.
    expect(saved.screen).toBe('save-done')
    expect(saved.savedCases).toHaveLength(1)

    render(
      <SaveControl
        engineKey="passport" stepsDone={0} savedCases={saved.savedCases} answers={saved.answers} onSave={vi.fn()}
      />,
    )
    expect(document.querySelector('.saved-note')).toHaveTextContent(UI.saveControl.savedNote)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
