import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { VoterEntry, VoterQ1, VoterQ2 } from './VoterScreens'
import { sessionReducer, initialSession, type SessionState, type SessionAction, type ScreenId } from '../../session/session'
import type { AnswerRecord } from '../../domain/types'

// ---------------------------------------------------------------------------
// Rendered-flow tests: a real useReducer(sessionReducer, initialSession)
// harness drives the actual screens, matching the pattern locked by Task 4's
// passportFlow.test.tsx. `startScreen`/`seedAnswers` jump the harness past
// screens this task doesn't own (Home isn't built until Task 9, Diagnosis
// isn't built until Task 6); everything from there on is the real reducer.

function readDebug() {
  return JSON.parse(screen.getByTestId('debug').textContent!) as {
    screen: ScreenId
    answers: AnswerRecord
    history: ScreenId[]
  }
}

function Screen({ state, dispatch }: { state: SessionState; dispatch: (a: SessionAction) => void }) {
  switch (state.screen) {
    case 'voter-entry': return <VoterEntry state={state} dispatch={dispatch} />
    case 'voter-q1': return <VoterQ1 state={state} dispatch={dispatch} />
    case 'voter-q2': return <VoterQ2 state={state} dispatch={dispatch} />
    default: return <div data-testid="unbuilt-screen">{state.screen}</div>
  }
}

function Harness({ startScreen, seedAnswers }: { startScreen: ScreenId; seedAnswers?: AnswerRecord }) {
  const [state, dispatch] = useReducer(
    sessionReducer,
    { startScreen, seedAnswers },
    (seed) => ({ ...initialSession, screen: seed.startScreen, answers: { ...(seed.seedAnswers ?? {}) } }),
  )
  return (
    <div>
      <pre data-testid="debug">{JSON.stringify({ screen: state.screen, answers: state.answers, history: state.history })}</pre>
      <Screen state={state} dispatch={dispatch} />
    </div>
  )
}

describe('voter entry (FR-V-03, AC-V-1, AC-V-2)', () => {
  it('AC-V-1: "applied for something" routes to voter Q1; "this is about SIR" routes to state select', async () => {
    render(<Harness startScreen="voter-entry" />)
    await userEvent.click(screen.getByRole('button', { name: /I applied for something/ }))
    expect(readDebug().screen).toBe('voter-q1')
  })

  it('AC-V-1: "this is about SIR" routes to state select', async () => {
    render(<Harness startScreen="voter-entry" />)
    await userEvent.click(screen.getByRole('button', { name: /^This is about SIR/ }))
    expect(readDebug().screen).toBe('sir-state')
  })

  it('AC-V-2: "I\'m not sure" shows the inline explainer, navigates nowhere, and stores no answer', async () => {
    render(<Harness startScreen="voter-entry" />)
    await userEvent.click(screen.getByRole('button', { name: "I'm not sure" }))
    const d = readDebug()
    expect(d.screen).toBe('voter-entry')
    expect(d.answers).toEqual({})
    expect(screen.getByRole('button', { name: "It's a regular application" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "It's about SIR" })).toBeInTheDocument()
  })

  it("the explainer's two actions route into the real branches", async () => {
    render(<Harness startScreen="voter-entry" />)
    await userEvent.click(screen.getByRole('button', { name: "I'm not sure" }))
    await userEvent.click(screen.getByRole('button', { name: "It's a regular application" }))
    expect(readDebug().screen).toBe('voter-q1')
  })

  it("the explainer's SIR action routes to state select", async () => {
    render(<Harness startScreen="voter-entry" />)
    await userEvent.click(screen.getByRole('button', { name: "I'm not sure" }))
    await userEvent.click(screen.getByRole('button', { name: "It's about SIR" }))
    expect(readDebug().screen).toBe('sir-state')
  })
})

describe('voter Q1 -> Q2 (AC-V-3)', () => {
  it('writes the raw pick AND the normalized value', async () => {
    render(<Harness startScreen="voter-q1" />)
    await userEvent.click(screen.getByRole('button', { name: "I got a decision but don't understand it, or it wasn't what I expected" }))
    await userEvent.click(screen.getByRole('button', { name: "I'm not sure" }))
    const d = readDebug()
    expect(d.answers.voterAppealedRaw).toBe('notsure')
    expect(d.answers.voterAppealed).toBe('unclassified')
  })

  it('normalizes voterQ1 notsure -> unclassified', async () => {
    render(<Harness startScreen="voter-q1" />)
    await userEvent.click(screen.getByRole('button', { name: "I'm not sure" }))
    const d = readDebug()
    expect(d.answers.voterQ1).toBe('unclassified')
    expect(d.screen).toBe('voter-diagnosis')
  })

  it('only "decision" routes to the appeal follow-up; the others go straight to diagnosis', async () => {
    render(<Harness startScreen="voter-q1" />)
    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything yet" }))
    const d = readDebug()
    expect(d.answers.voterQ1).toBe('no_word')
    expect(d.screen).toBe('voter-diagnosis')
  })

  it('"decision" routes to Q2', async () => {
    render(<Harness startScreen="voter-q1" />)
    await userEvent.click(screen.getByRole('button', { name: "I got a decision but don't understand it, or it wasn't what I expected" }))
    const d = readDebug()
    expect(d.answers.voterQ1).toBe('decision')
    expect(d.screen).toBe('voter-q2')
  })

  it('a genuinely changed Q1 answer clears a previously stored appeal answer', async () => {
    render(<Harness startScreen="voter-q1" seedAnswers={{ voterQ1: 'decision', voterAppealed: 'pending', voterAppealedRaw: 'pending' }} />)
    await userEvent.click(screen.getByRole('button', { name: "A BLO visited or contacted me, but I still don't have a result" }))
    const d = readDebug()
    expect(d.answers.voterAppealed).toBeUndefined()
    expect(d.answers.voterAppealedRaw).toBeUndefined()
  })

  it('re-picking "decision" while already on "decision" leaves the appeal answer untouched', async () => {
    render(<Harness startScreen="voter-q1" seedAnswers={{ voterQ1: 'decision', voterAppealed: 'pending', voterAppealedRaw: 'pending' }} />)
    await userEvent.click(screen.getByRole('button', { name: "I got a decision but don't understand it, or it wasn't what I expected" }))
    const d = readDebug()
    expect(d.answers.voterAppealed).toBe('pending')
    expect(d.answers.voterAppealedRaw).toBe('pending')
  })
})
