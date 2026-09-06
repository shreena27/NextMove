/** The app router — a `useReducer` over Task 2's session plus a `switch` on
 *  `state.screen`, the direct analogue of the prototype's `render()`
 *  (design/nextmove-v1-prototype.html, 3902-3941), carrying only C3's
 *  screens. Screen ids are the prototype's own, so C4/C5 extend the switch
 *  rather than renaming the graph.
 *
 *  Because `state.screen` is the `ScreenId` union (session.ts), the switch
 *  is exhaustiveness-checked: the `default` arm assigns `state.screen` to a
 *  `never`-typed binding, so a screen added to the union without a case
 *  becomes a compile error rather than a silent fallthrough.
 *
 *  The SIR route is gated in the SIR screens themselves (`SirState`'s
 *  `sirCoverage()` call), not here — this router never calls
 *  `optionsForPhase` or `diagnose` for an unsupported state; it only ever
 *  reaches `sir-diagnosis` once `sir-q1` has already been reached, which is
 *  only possible for a covered state.
 *
 *  `Diagnosis` is always derived fresh via `diagnose(engine, answers)` at
 *  render time (Global Constraint) — nothing here stores a computed
 *  diagnosis in session state.
 *
 *  THE `settled` CLASS (design note 7): the lifted `#app.settled` CSS rule
 *  (src/index.css) suppresses the entrance choreography on a same-screen
 *  re-render (trust toggle, selection) while still playing it on a genuine
 *  navigation. The prototype does this imperatively
 *  (`el.classList.toggle('settled', S.renderedScreen === S.screen)`,
 *  3907-3908); the React equivalent is a ref that remembers the screen last
 *  committed, compared against the screen being rendered THIS pass, updated
 *  in a no-dependency-array `useEffect` so it always reflects "the screen
 *  that was actually painted," not "the screen as of the last screen
 *  change." `renderedScreen` deliberately does NOT go into `SessionState` —
 *  it is render bookkeeping, not session state, and putting it in the
 *  reducer would make every re-render an action. `StrictMode`'s double-
 *  render is safe here: both passes read the same ref (no effect has run
 *  between them yet), so both compute the same `settled`. */
import { useReducer, useRef, useEffect, type ReactNode } from 'react'
import { sessionReducer, initialSession, type ScreenId } from './session/session'
import { hasAnswers } from './screens/screenProps'
import { Topbar } from './ui/Topbar'
import { Banner } from './ui/Banner'
import { Home } from './screens/Home'
import { OtherServices } from './screens/OtherServices'
import { PassportGuardrail, PassportOutOfScope, PassportQ1, PassportQ2 } from './screens/passport/PassportScreens'
import { PassportRecovery, PassportRecoveryPaste, PassportRecoveryShow } from './screens/passport/PassportRecovery'
import { VoterEntry, VoterQ1, VoterQ2 } from './screens/voter/VoterScreens'
import { SirState, SirUnsupported, SirQ1 } from './screens/sir/SirScreens'
import { DiagnosisScreen } from './templates/DiagnosisScreen'
import { NextMoveScreen } from './templates/NextMoveScreen'
import { diagnose } from './domain/engine'
import { passportEngine, voterEngine, sirEngine } from './playbooks/engines'
import { SIR_STATES, SIR_Q1_OPTIONS_FOR } from './playbooks/sirPlaybook'
import { labelMap, PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS, VOTER_Q1_LABELS, VOTER_APPEAL_LABELS } from './screens/labels'
import { UI, PASSPORT_COPY, VOTER_COPY, SIR_COPY } from './screens/screenCopy'

export default function App() {
  const [state, dispatch] = useReducer(sessionReducer, initialSession)

  const lastScreen = useRef<ScreenId | null>(null)
  // Deliberate ref-during-render read (see header comment): this is what
  // makes `settled` reflect "the screen that was actually painted," not
  // "the screen as of the last screen change." Safe because the effect
  // below has no dependency array, so it always runs after this read and
  // keeps `lastScreen.current` in sync; StrictMode's double-render reads
  // the same value on both passes (the effect hasn't run between them yet).
  // oxlint-disable-next-line react/refs
  const settled = lastScreen.current === state.screen
  useEffect(() => {
    lastScreen.current = state.screen
  })

  const topbar = (showBack: boolean, showRestart: boolean): ReactNode => (
    <Topbar
      showBack={showBack}
      showRestart={showRestart}
      hasAnswers={hasAnswers(state)}
      restartConfirm={state.restartConfirm}
      dispatch={dispatch}
    />
  )

  let body: ReactNode
  switch (state.screen) {
    case 'home':
      body = <Home state={state} dispatch={dispatch} />
      break
    case 'other-services':
      body = <OtherServices state={state} dispatch={dispatch} />
      break

    case 'passport-guardrail':
      body = <PassportGuardrail state={state} dispatch={dispatch} />
      break
    case 'passport-outofscope':
      body = <PassportOutOfScope state={state} dispatch={dispatch} />
      break
    case 'passport-q1':
      body = <PassportQ1 state={state} dispatch={dispatch} />
      break
    case 'passport-q2':
      body = <PassportQ2 state={state} dispatch={dispatch} />
      break
    case 'passport-recovery':
      body = <PassportRecovery state={state} dispatch={dispatch} />
      break
    case 'passport-recovery-paste':
      body = <PassportRecoveryPaste state={state} dispatch={dispatch} />
      break
    case 'passport-recovery-show':
      body = <PassportRecoveryShow state={state} dispatch={dispatch} />
      break
    case 'passport-diagnosis': {
      const d = diagnose(passportEngine, state.answers)
      const answerLabels = {
        ...labelMap('q1', { ...PASSPORT_Q1_LABELS, not_sure: PASSPORT_COPY.q1.notSure }),
        ...labelMap('q2', PASSPORT_Q2_LABELS),
      }
      // The recovery echoes (design note 10): a citizen who reached
      // Diagnosis via the "I'm not sure" recovery detour gets an extra
      // "You told us" row reflecting what they actually did there. Checked
      // in the same order the prototype writes them (recoveryPastedText
      // before recoveryAskedSafest can ever both be set — they're mutually
      // exclusive detour branches).
      const extraToldUs = state.answers.recoveryPastedText
        ? `${PASSPORT_COPY.recovery.extraToldUsPasted} "${state.answers.recoveryPastedText}"`
        : state.answers.recoveryAskedSafest === 'yes'
          ? PASSPORT_COPY.recovery.extraToldUsSafest
          : undefined
      body = (
        <DiagnosisScreen
          serviceLabel={UI.serviceLabel.passport}
          engineKey="passport"
          d={d}
          answerLabels={answerLabels}
          trustOpen={state.trustOpen}
          onToggleTrust={() => dispatch({ type: 'TOGGLE_TRUST' })}
          topbar={topbar(true, true)}
          extraToldUs={extraToldUs}
          onNavigate={screen => dispatch({ type: 'NAVIGATE', screen })}
        />
      )
      break
    }
    case 'passport-nextmove': {
      const d = diagnose(passportEngine, state.answers)
      body = (
        <NextMoveScreen
          serviceLabel={UI.serviceLabel.passport}
          engineKey="passport"
          d={d}
          topbar={topbar(true, true)}
          dispatch={dispatch}
        />
      )
      break
    }

    case 'voter-entry':
      body = <VoterEntry state={state} dispatch={dispatch} />
      break
    case 'voter-q1':
      body = <VoterQ1 state={state} dispatch={dispatch} />
      break
    case 'voter-q2':
      body = <VoterQ2 state={state} dispatch={dispatch} />
      break
    case 'voter-diagnosis': {
      const d = diagnose(voterEngine, state.answers)
      const answerLabels = {
        ...labelMap('voterQ1', { ...VOTER_Q1_LABELS, unclassified: VOTER_COPY.q1.notSure }),
        ...labelMap('voterAppealedRaw', VOTER_APPEAL_LABELS),
      }
      body = (
        <DiagnosisScreen
          serviceLabel={UI.serviceLabel.voterServices}
          engineKey="voter"
          d={d}
          answerLabels={answerLabels}
          trustOpen={state.trustOpen}
          onToggleTrust={() => dispatch({ type: 'TOGGLE_TRUST' })}
          topbar={topbar(true, true)}
          onNavigate={screen => dispatch({ type: 'NAVIGATE', screen })}
        />
      )
      break
    }
    case 'voter-nextmove': {
      const d = diagnose(voterEngine, state.answers)
      body = (
        <NextMoveScreen
          serviceLabel={UI.serviceLabel.voterServices}
          engineKey="voter"
          d={d}
          topbar={topbar(true, true)}
          dispatch={dispatch}
        />
      )
      break
    }

    case 'sir-state':
      body = <SirState state={state} dispatch={dispatch} />
      break
    case 'sir-unsupported':
      body = <SirUnsupported state={state} dispatch={dispatch} />
      break
    case 'sir-q1':
      body = <SirQ1 state={state} dispatch={dispatch} />
      break
    case 'sir-diagnosis': {
      const d = diagnose(sirEngine, state.answers)
      // Reachable only via sir-q1, which is itself only reachable for a
      // covered, phased state (SirState's sirCoverage() gate) — so
      // st.phase is always defined here.
      const st = SIR_STATES[state.answers.sirState]
      const answerLabels = labelMap('sirQ1', { ...SIR_Q1_OPTIONS_FOR[st.phase!.id], unclassified: SIR_COPY.q1.notSure })
      body = (
        <DiagnosisScreen
          serviceLabel={UI.serviceLabel.sir}
          engineKey="sir"
          d={d}
          answerLabels={answerLabels}
          trustOpen={state.trustOpen}
          onToggleTrust={() => dispatch({ type: 'TOGGLE_TRUST' })}
          topbar={topbar(true, true)}
          preNote={<Banner><b>{st.name} · {st.phase!.label}:</b> {st.phase!.note}</Banner>}
          onNavigate={screen => dispatch({ type: 'NAVIGATE', screen })}
        />
      )
      break
    }
    case 'sir-nextmove': {
      const d = diagnose(sirEngine, state.answers)
      body = (
        <NextMoveScreen
          serviceLabel={UI.serviceLabel.sir}
          engineKey="sir"
          d={d}
          topbar={topbar(true, true)}
          dispatch={dispatch}
        />
      )
      break
    }

    default: {
      const _never: never = state.screen
      throw new Error(`unhandled screen: ${String(_never)}`)
    }
  }

  return (
    <div id="app" className={settled ? 'app settled' : 'app'}>
      {body}
    </div>
  )
}
