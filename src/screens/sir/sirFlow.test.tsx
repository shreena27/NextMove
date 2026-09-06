import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { SirState, SirUnsupported, SirQ1 } from './SirScreens'
import { sessionReducer, initialSession, type SessionState, type SessionAction, type ScreenId } from '../../session/session'
import type { AnswerRecord } from '../../domain/types'
import { SIR_STATES, SIR_PHASES } from '../../playbooks/sirPlaybook'
import * as evaluateModule from '../../domain/evaluate'

// ---------------------------------------------------------------------------
// Rendered-flow tests: same real-reducer harness pattern as passportFlow.test
// and voterFlow.test. Diagnosis ('sir-diagnosis') is Task 6's — it falls
// through to the unbuilt-screen default here, same as passport-diagnosis /
// voter-diagnosis do in the other two flow tests.

function readDebug() {
  return JSON.parse(screen.getByTestId('debug').textContent!) as {
    screen: ScreenId
    answers: AnswerRecord
    history: ScreenId[]
  }
}

function Screen({ state, dispatch }: { state: SessionState; dispatch: (a: SessionAction) => void }) {
  switch (state.screen) {
    case 'sir-state': return <SirState state={state} dispatch={dispatch} />
    case 'sir-unsupported': return <SirUnsupported state={state} dispatch={dispatch} />
    case 'sir-q1': return <SirQ1 state={state} dispatch={dispatch} />
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

afterEach(() => {
  vi.restoreAllMocks()
})

describe("SIR coverage boundary (AC-S-5) — C2's deferred spy test", () => {
  it.each(['bihar', 'maharashtra', 'up', 'other'])(
    'selecting %s renders the coverage screen and NEVER evaluates the SIR playbook',
    async (stateKey) => {
      const spy = vi.spyOn(evaluateModule, 'evaluate')
      render(<Harness startScreen="sir-state" />)
      await userEvent.click(screen.getByRole('button', { name: SIR_STATES[stateKey].name }))

      expect(spy).not.toHaveBeenCalled()
      expect(screen.getByText(/isn't available in NextMove yet/)).toBeInTheDocument()
      // No status stamp of any kind. Selected by the locked class, not by
      // role — the stamp deliberately carries no ARIA role (Task 3).
      expect(document.querySelector('.stamp')).toBeNull()
      expect(readDebug().screen).toBe('sir-unsupported')
    },
  )

  it('selecting Delhi reaches SIR Q1', async () => {
    const spy = vi.spyOn(evaluateModule, 'evaluate')
    render(<Harness startScreen="sir-state" />)
    await userEvent.click(screen.getByRole('button', { name: 'Delhi' }))
    expect(readDebug().screen).toBe('sir-q1')
    expect(spy).not.toHaveBeenCalled()
  })

  it('the coverage screen never renders a WAIT/FOLLOW UP/ESCALATE/UNCLASSIFIED stamp', () => {
    // The prose here legitimately names WAIT/FOLLOW UP/ESCALATE — explaining
    // what it WON'T say (verbatim from the prototype's handoff-note) — so
    // the guardrail is the absence of an actual .stamp element/variant, not
    // an absence of those words anywhere in the copy.
    render(<Harness startScreen="sir-unsupported" seedAnswers={{ sirState: 'bihar' }} />)
    expect(document.querySelector('.stamp')).toBeNull()
    expect(document.querySelector('.stamp.wait')).toBeNull()
    expect(document.querySelector('.stamp.follow')).toBeNull()
    expect(document.querySelector('.stamp.escalate')).toBeNull()
    expect(document.querySelector('.stamp.unclassified')).toBeNull()
  })
})

describe('SIR Q1 options are phase-gated (AC-S-2)', () => {
  it("offers exactly Delhi's claims_notice options plus \"I'm not sure\"", () => {
    const { container } = render(<Harness startScreen="sir-q1" seedAnswers={{ sirState: 'delhi' }} />)
    const labels = Array.from(container.querySelectorAll('.answers .arow-label')).map(el => el.textContent)
    expect(labels).toEqual([
      'I checked the Draft Roll and my name is there',
      "I checked the Draft Roll and my name isn't there",
      "I haven't checked the Draft Roll yet",
      'I got a notice asking for documents',
      "I'm not sure",
    ])
  })

  it('never renders a Final Roll option in the current phase', () => {
    render(<Harness startScreen="sir-q1" seedAnswers={{ sirState: 'delhi' }} />)
    expect(screen.queryByText(/Final Roll/)).toBeNull()
  })

  it('the extensibility claim: flipping the configured phase to final_roll changes the offered set with zero component changes', () => {
    const original = SIR_STATES.delhi.phase
    SIR_STATES.delhi.phase = SIR_PHASES.final_roll
    try {
      const { container } = render(<Harness startScreen="sir-q1" seedAnswers={{ sirState: 'delhi' }} />)
      const labels = Array.from(container.querySelectorAll('.answers .arow-label')).map(el => el.textContent)
      expect(labels).toEqual([
        'I checked the Final Roll and my name is there',
        "I checked the Final Roll and my name isn't there",
        "I haven't checked the Final Roll yet",
        "I'm not sure",
      ])
    } finally {
      SIR_STATES.delhi.phase = original
    }
  })
})
