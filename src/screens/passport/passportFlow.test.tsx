import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { normalizePasted, PASTE_MATCH_EXAMPLES, matchPasted, PassportRecovery, PassportRecoveryPaste, PassportRecoveryShow } from './PassportRecovery'
import { PassportGuardrail, PassportOutOfScope, PassportQ1, PassportQ2 } from './PassportScreens'
import { labelMap, PASSPORT_Q1_LABELS } from '../labels'
import { sessionReducer, initialSession, type SessionState, type SessionAction, type ScreenId } from '../../session/session'
import type { AnswerRecord } from '../../domain/types'

describe('labelMap (impl plan §7 — the composite-key fix)', () => {
  it('produces "questionId:value" keys, never bare values', () => {
    const m = labelMap('q1', PASSPORT_Q1_LABELS)
    expect(m['q1:no_contact']).toBe("I haven't heard anything about police verification yet")
    expect(m['no_contact']).toBeUndefined()
  })
})

describe('paste matching (PRD §8a, AC-5) — exact over normalised, never substring', () => {
  it.each([
    ['Police Verification Report Has Been Received', { q1: 'verified_no_progress' }],
    ['  passport has been dispatched ', { outOfScope: true }],
    ['application has adverse report', { q1: 'adverse' }],
  ])('%s matches', (input, expected) => {
    expect(matchPasted(input)).toMatchObject(expected)
  })

  it('AC-5 regression: "verification completed" is NOT a match', () => {
    expect(matchPasted('verification completed')).toBeNull()
  })

  it('AC-5 regression: "verification incomplete" is NOT a match either', () => {
    expect(matchPasted('verification incomplete')).toBeNull()
  })

  it('the retired bare-substring "verif" match is gone', () => {
    expect(matchPasted('verif')).toBeNull()
  })

  it('every example is already normalised (so a match is symmetric)', () => {
    for (const e of PASTE_MATCH_EXAMPLES) expect(normalizePasted(e.text)).toBe(e.text)
  })
})

// ---------------------------------------------------------------------------
// Rendered-flow tests: a real useReducer(sessionReducer, initialSession)
// harness drives the actual screens, not mocks. `startScreen`/`seedAnswers`
// jump the harness past screens this task doesn't own (Home isn't built
// until Task 9); everything from there on is the real reducer.

function readDebug() {
  return JSON.parse(screen.getByTestId('debug').textContent!) as {
    screen: ScreenId
    answers: AnswerRecord
    history: ScreenId[]
  }
}

function Screen({ state, dispatch }: { state: SessionState; dispatch: (a: SessionAction) => void }) {
  switch (state.screen) {
    case 'passport-guardrail': return <PassportGuardrail state={state} dispatch={dispatch} />
    case 'passport-outofscope': return <PassportOutOfScope state={state} dispatch={dispatch} />
    case 'passport-q1': return <PassportQ1 state={state} dispatch={dispatch} />
    case 'passport-q2': return <PassportQ2 state={state} dispatch={dispatch} />
    case 'passport-recovery': return <PassportRecovery state={state} dispatch={dispatch} />
    case 'passport-recovery-paste': return <PassportRecoveryPaste state={state} dispatch={dispatch} />
    case 'passport-recovery-show': return <PassportRecoveryShow state={state} dispatch={dispatch} />
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

describe('passport flow', () => {
  it('AC-14: "Yes, I already have it" shows the guardrail exit and never reaches Q1', async () => {
    render(<Harness startScreen="passport-guardrail" />)
    await userEvent.click(screen.getByRole('button', { name: 'Yes, I already have it' }))
    expect(screen.getByText(/there's nothing here for NextMove to diagnose/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /What's happening with your application\?/ })).toBeNull()
    expect(readDebug().screen).toBe('passport-outofscope')
  })

  it('"No, still waiting on it" routes to Q1', async () => {
    render(<Harness startScreen="passport-guardrail" />)
    await userEvent.click(screen.getByRole('button', { name: 'No, still waiting on it' }))
    expect(screen.getByRole('heading', { name: "What's happening with your application?" })).toBeInTheDocument()
    expect(readDebug().answers.guardrail).toBe('no')
  })

  it('Q1 "I\'m not sure" routes to recovery, and stores q1: not_sure', async () => {
    render(<Harness startScreen="passport-q1" seedAnswers={{ guardrail: 'no' }} />)
    await userEvent.click(screen.getByRole('button', { name: /I'm not sure/ }))
    expect(screen.getByRole('heading', { name: "Let's find your status a different way." })).toBeInTheDocument()
    expect(readDebug().answers.q1).toBe('not_sure')
  })

  it('AC-6: recovery "safest thing to do now" goes straight to diagnosis, q1 still not_sure', async () => {
    render(<Harness startScreen="passport-recovery" seedAnswers={{ guardrail: 'no', q1: 'not_sure' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tell me the safest thing to do now' }))
    const d = readDebug()
    expect(d.screen).toBe('passport-diagnosis')
    expect(d.answers).toEqual({ guardrail: 'no', q1: 'not_sure', recoveryAskedSafest: 'yes' })
  })

  it('recovery "show me where" returns to Q1 with replace (no history stack growth)', async () => {
    render(<Harness startScreen="passport-recovery" seedAnswers={{ guardrail: 'no', q1: 'not_sure' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show me where to find my status' }))
    expect(screen.getByRole('heading', { name: 'Where to find your status' })).toBeInTheDocument()
    expect(readDebug().history).toEqual(['passport-recovery'])

    await userEvent.click(screen.getByRole('button', { name: /Okay, back to the question/ }))
    expect(screen.getByRole('heading', { name: "What's happening with your application?" })).toBeInTheDocument()
    // replace: true — the detour must not have grown the stack.
    expect(readDebug().history).toEqual(['passport-recovery'])
  })

  it('a matched paste sets q1 and routes to Q2', async () => {
    render(<Harness startScreen="passport-recovery-paste" seedAnswers={{ guardrail: 'no', q1: 'not_sure' }} />)
    const textarea = screen.getByPlaceholderText(/Police verification report has been received/i)
    fireEvent.change(textarea, { target: { value: 'Police Verification Report Has Been Received' } })
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Have you already tried to follow up on this?' })).toBeInTheDocument()
    const d = readDebug()
    expect(d.answers.q1).toBe('verified_no_progress')
  })

  it('an out-of-scope paste sets guardrail: yes and routes to the guardrail exit', async () => {
    render(<Harness startScreen="passport-recovery-paste" seedAnswers={{ guardrail: 'no', q1: 'not_sure' }} />)
    const textarea = screen.getByPlaceholderText(/Police verification report has been received/i)
    fireEvent.change(textarea, { target: { value: 'passport has been dispatched' } })
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText(/there's nothing here for NextMove to diagnose/)).toBeInTheDocument()
    expect(readDebug().answers.guardrail).toBe('yes')
  })

  it('an unmatched paste routes to diagnosis with q1 still not_sure', async () => {
    render(<Harness startScreen="passport-recovery-paste" seedAnswers={{ guardrail: 'no', q1: 'not_sure' }} />)
    const textarea = screen.getByPlaceholderText(/Police verification report has been received/i)
    fireEvent.change(textarea, { target: { value: 'verification completed' } })
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const d = readDebug()
    expect(d.screen).toBe('passport-diagnosis')
    expect(d.answers.q1).toBe('not_sure')
  })

  it('an unmatched paste STILL stores recoveryPastedText, so the trust panel echoes it', async () => {
    render(<Harness startScreen="passport-recovery-paste" seedAnswers={{ guardrail: 'no', q1: 'not_sure' }} />)
    const textarea = screen.getByPlaceholderText(/Police verification report has been received/i)
    fireEvent.change(textarea, { target: { value: 'something the examples do not contain' } })
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const d = readDebug()
    expect(d.answers.recoveryPastedText).toBe('something the examples do not contain')
    expect(d.answers.q1).toBe('not_sure')
  })
})
