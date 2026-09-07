/** The app router — a `useReducer` over the session plus a `switch` on
 *  `state.screen`, the direct analogue of the prototype's `render()`
 *  (design/nextmove-v1-prototype.html, 3902-3941). Screen ids are the
 *  prototype's own; C4 added the three `*-prepare` cases, and Task 13 adds
 *  the last four (`checkin`/`dead-end`/`case-closed`/`save-done`), which is
 *  what finally makes every `ScreenId` member a real case below.
 *
 *  Because `state.screen` is the `ScreenId` union (session.ts), the switch
 *  is exhaustiveness-checked: the `default` arm assigns `state.screen` to a
 *  `never`-typed binding, so a screen added to the union without a case
 *  becomes a compile error rather than a silent fallthrough — this is why
 *  `npm run build` goes fully clean only once this task's four cases exist.
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
import { sessionReducer, initialSession, type ScreenId, type SessionAction } from './session/session'
import { activeCase, newCaseId } from './session/cases'
import { loadCases, saveCases } from './session/caseStore'
import { hasAnswers } from './screens/screenProps'
import { Topbar } from './ui/Topbar'
import { Banner } from './ui/Banner'
import { Home } from './screens/Home'
import { OtherServices } from './screens/OtherServices'
import { PassportGuardrail, PassportOutOfScope, PassportQ1, PassportQ2 } from './screens/passport/PassportScreens'
import { PassportRecovery, PassportRecoveryPaste, PassportRecoveryShow } from './screens/passport/PassportRecovery'
import { VoterEntry, VoterQ1, VoterQ2 } from './screens/voter/VoterScreens'
import { SirState, SirUnsupported, SirReverifying, SirQ1 } from './screens/sir/SirScreens'
import { DiagnosisScreen } from './templates/DiagnosisScreen'
import { NextMoveScreen } from './templates/NextMoveScreen'
import { PrepareScreen } from './templates/PrepareScreen'
import { CasefileScreen } from './templates/CasefileScreen'
import { DeadEndScreen } from './templates/DeadEndScreen'
import { CaseClosedScreen } from './templates/CaseClosedScreen'
import { SaveDoneScreen } from './templates/SaveDoneScreen'
import { diagnose } from './domain/engine'
import { degradedFor, changedOnFor } from './domain/freshness'
import { passportEngine, voterEngine, sirEngine, ENGINES } from './playbooks/engines'
import { prepPlanFor } from './playbooks/prep'
import { SIR_STATES, SIR_Q1_OPTIONS_FOR } from './playbooks/sirPlaybook'
import { labelMap, PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS, VOTER_Q1_LABELS, VOTER_APPEAL_LABELS } from './screens/labels'
import { UI, PASSPORT_COPY, VOTER_COPY, SIR_COPY } from './screens/screenCopy'

/** DESIGN NOTE (Task 6 brief, design note 3): the honest port of the
 *  prototype's `if(!prep){ restart(); return renderHome(); }` guard
 *  (3749). `PrepareScreen`'s `prep` prop is required and non-nullable
 *  (Task 3), so a `*-prepare` screen id reached with a diagnosis that has
 *  no prep plan cannot be handed to it — unreachable through the UI (the
 *  "Prepare this for me" CTA only renders behind `hasPrepPlan`), but
 *  reachable via a direct NAVIGATE. This reproduces the prototype's
 *  behaviour: clear the working case and land on Home. RESTART is
 *  dispatched from an effect, never during render, and nothing is
 *  rendered — never `<Home>` with the stale answers that got it here
 *  (Home is a clean slate, always), and never a silent fall-through to
 *  `NextMoveScreen`. */
function RestartToHome({ dispatch }: { dispatch: (action: SessionAction) => void }) {
  useEffect(() => {
    dispatch({ type: 'RESTART' })
  }, [dispatch])
  return null
}

export default function App() {
  // Task 13, design note 6: the lazy `useReducer` initializer runs ONCE, at
  // mount, and is the ONLY place `nm_cases` is ever READ — mirroring the
  // `useEffect` below, the ONLY place it is ever WRITTEN. A corrupt
  // `nm_cases` value cannot prevent this from rendering: `loadCases()`
  // itself fails closed to `[]` (caseStore.ts's own contract), so this
  // initializer can only ever hand `sessionReducer` a real array, never
  // throw.
  const [state, dispatch] = useReducer(sessionReducer, initialSession, s => ({ ...s, savedCases: loadCases() }))
  useEffect(() => {
    saveCases(state.savedCases)
  }, [state.savedCases])

  // D6: the ONE clock this render pass hands to every D6-typed function and
  // prop below — CaseCard's own header note explains why a shared value
  // matters here specifically: two CaseCard instances rendered in the SAME
  // pass (Home's open-cases list) must never read two different `Date.now()`
  // values and disagree about "how long ago." Every other D6 function/
  // component in this chunk takes `now` as a REQUIRED prop/argument
  // specifically so it never has to call `Date.now()` itself (CaseCard.tsx's
  // own header note: oxlint's react(purity) rule correctly flags that as
  // impure) — this is the one deliberate exception: App.tsx is the actual
  // root of the tree, so SOMETHING has to call it for real, exactly once
  // per render pass, for every one of those props/arguments to share.
  // oxlint-disable-next-line react/purity -- deliberate, single call site; see comment above
  const now = Date.now()

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
      body = <Home state={state} dispatch={dispatch} now={now} />
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
      const freshDegraded = degradedFor(passportEngine.playbook.rules)
      const freshChangedOn = changedOnFor(passportEngine.playbook.rules)
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
          ciJustUpdated={state.ciJustUpdated}
          ciSnapshot={state.ciSnapshot}
          onUndo={() => dispatch({ type: 'CI_UNDO' })}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
              returnScreen: 'passport-nextmove', now,
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }
    case 'passport-nextmove': {
      const d = diagnose(passportEngine, state.answers)
      const prep = prepPlanFor(d)
      const freshDegraded = degradedFor(passportEngine.playbook.rules)
      const freshChangedOn = changedOnFor(passportEngine.playbook.rules)
      body = (
        <NextMoveScreen
          serviceLabel={UI.serviceLabel.passport}
          engineKey="passport"
          d={d}
          hasPrepPlan={Boolean(prep)}
          onPrepare={() => dispatch({ type: 'NAVIGATE', screen: 'passport-prepare' })}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
              returnScreen: 'passport-nextmove', now,
            })
          }
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
              returnScreen: 'passport-nextmove', now, newId: newCaseId(),
            })
          }
        />
      )
      break
    }
    case 'passport-prepare': {
      const d = diagnose(passportEngine, state.answers)
      const prep = prepPlanFor(d)
      if (!prep) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      const freshDegraded = degradedFor(passportEngine.playbook.rules)
      const freshChangedOn = changedOnFor(passportEngine.playbook.rules)
      body = (
        // `key={d.ruleId}` remounts PrepareScreen when the diagnosis changes
        // under it. Before Task 12 this also reset the screen's local
        // tick/draft `useState` — a clean slate per new plan. Now that
        // `prepChecks`/`prepDraft` live in the reducer (cleared by ANSWER
        // itself, not by this remount), the only state left for the
        // remount to discard is `copied`'s pending flash timer — still
        // worth doing (a stale "Copied ✓" flash from the OLD plan's draft
        // should not survive onto a new one), just for a narrower reason
        // than before. Kept for that reason, not dropped.
        <PrepareScreen
          key={d.ruleId}
          serviceLabel={UI.serviceLabel.passport}
          engineKey="passport"
          d={d}
          prep={prep}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          prepChecks={state.prepChecks}
          prepDraft={state.prepDraft}
          onTogglePrepStep={i => dispatch({ type: 'TOGGLE_PREP_STEP', index: i, now })}
          onSetPrepDraft={text => dispatch({ type: 'SET_PREP_DRAFT', text })}
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
              returnScreen: 'passport-prepare', now, newId: newCaseId(),
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
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
      const freshDegraded = degradedFor(voterEngine.playbook.rules)
      const freshChangedOn = changedOnFor(voterEngine.playbook.rules)
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
          ciJustUpdated={state.ciJustUpdated}
          ciSnapshot={state.ciSnapshot}
          onUndo={() => dispatch({ type: 'CI_UNDO' })}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'voter', serviceLabel: UI.serviceLabel.voterServices,
              returnScreen: 'voter-nextmove', now,
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }
    case 'voter-nextmove': {
      const d = diagnose(voterEngine, state.answers)
      const prep = prepPlanFor(d)
      const freshDegraded = degradedFor(voterEngine.playbook.rules)
      const freshChangedOn = changedOnFor(voterEngine.playbook.rules)
      body = (
        <NextMoveScreen
          serviceLabel={UI.serviceLabel.voterServices}
          engineKey="voter"
          d={d}
          hasPrepPlan={Boolean(prep)}
          onPrepare={() => dispatch({ type: 'NAVIGATE', screen: 'voter-prepare' })}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'voter', serviceLabel: UI.serviceLabel.voterServices,
              returnScreen: 'voter-nextmove', now,
            })
          }
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'voter', serviceLabel: UI.serviceLabel.voterServices,
              returnScreen: 'voter-nextmove', now, newId: newCaseId(),
            })
          }
        />
      )
      break
    }
    case 'voter-prepare': {
      const d = diagnose(voterEngine, state.answers)
      const prep = prepPlanFor(d)
      if (!prep) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      const freshDegraded = degradedFor(voterEngine.playbook.rules)
      const freshChangedOn = changedOnFor(voterEngine.playbook.rules)
      body = (
        // See the passport-prepare case's own comment on `key={d.ruleId}`.
        <PrepareScreen
          key={d.ruleId}
          serviceLabel={UI.serviceLabel.voterServices}
          engineKey="voter"
          d={d}
          prep={prep}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          prepChecks={state.prepChecks}
          prepDraft={state.prepDraft}
          onTogglePrepStep={i => dispatch({ type: 'TOGGLE_PREP_STEP', index: i, now })}
          onSetPrepDraft={text => dispatch({ type: 'SET_PREP_DRAFT', text })}
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'voter', serviceLabel: UI.serviceLabel.voterServices,
              returnScreen: 'voter-prepare', now, newId: newCaseId(),
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
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
    case 'sir-reverifying':
      body = <SirReverifying state={state} dispatch={dispatch} />
      break
    case 'sir-q1':
      body = <SirQ1 state={state} dispatch={dispatch} />
      break
    case 'sir-diagnosis': {
      const d = diagnose(sirEngine, state.answers)
      const freshDegraded = degradedFor(sirEngine.playbook.rules)
      const freshChangedOn = changedOnFor(sirEngine.playbook.rules)
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
          ciJustUpdated={state.ciJustUpdated}
          ciSnapshot={state.ciSnapshot}
          onUndo={() => dispatch({ type: 'CI_UNDO' })}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'sir', serviceLabel: UI.serviceLabel.sir,
              returnScreen: 'sir-nextmove', now,
            })
          }
          phaseDrift={state.phaseDrift}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }
    case 'sir-nextmove': {
      const d = diagnose(sirEngine, state.answers)
      const prep = prepPlanFor(d)
      const freshDegraded = degradedFor(sirEngine.playbook.rules)
      const freshChangedOn = changedOnFor(sirEngine.playbook.rules)
      body = (
        <NextMoveScreen
          serviceLabel={UI.serviceLabel.sir}
          engineKey="sir"
          d={d}
          hasPrepPlan={Boolean(prep)}
          onPrepare={() => dispatch({ type: 'NAVIGATE', screen: 'sir-prepare' })}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'sir', serviceLabel: UI.serviceLabel.sir,
              returnScreen: 'sir-nextmove', now,
            })
          }
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'sir', serviceLabel: UI.serviceLabel.sir,
              returnScreen: 'sir-nextmove', now, newId: newCaseId(),
            })
          }
        />
      )
      break
    }
    case 'sir-prepare': {
      const d = diagnose(sirEngine, state.answers)
      const prep = prepPlanFor(d)
      if (!prep) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      const freshDegraded = degradedFor(sirEngine.playbook.rules)
      const freshChangedOn = changedOnFor(sirEngine.playbook.rules)
      body = (
        // See the passport-prepare case's own comment on `key={d.ruleId}`.
        <PrepareScreen
          key={d.ruleId}
          serviceLabel={UI.serviceLabel.sir}
          engineKey="sir"
          d={d}
          prep={prep}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          prepChecks={state.prepChecks}
          prepDraft={state.prepDraft}
          onTogglePrepStep={i => dispatch({ type: 'TOGGLE_PREP_STEP', index: i, now })}
          onSetPrepDraft={text => dispatch({ type: 'SET_PREP_DRAFT', text })}
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'sir', serviceLabel: UI.serviceLabel.sir,
              returnScreen: 'sir-prepare', now, newId: newCaseId(),
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }

    case 'checkin': {
      const c = activeCase(state)
      if (!c) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      // FIX WAVE (2026-09-06, whole-branch final review, Critical finding 1):
      // this was `diagnose(ENGINES[c.engineKey], c.answers)` — the ACTIVE
      // CASE's own stored answers. But `session/cases.ts`'s `ciChoose` (the
      // reducer logic that runs when the citizen clicks one of the option
      // rows this screen renders) independently rebuilds ITS OWN diagnosis
      // from `state.answers` (the session's live answers), which can genuinely
      // differ from `c.answers` — the ANSWER action updates `state.answers`
      // but never touches the active case's stored `answers`, and a citizen
      // can reach the casefile screen with the two out of sync via Back
      // navigation after answering a question mid check-in. When they diverge,
      // `ciChoose` indexes into a freshly-built option list (from
      // `state.answers`) using the click index the citizen picked off THIS
      // screen's list (built from `c.answers`) — silently recording the wrong
      // option, or doing nothing at all if the new list is shorter. The fix:
      // derive `d` from `state.answers`, exactly like `ciChoose` does and
      // exactly like the locked prototype's own `currentDiagnosis()`
      // (S.answers) — so the screen's rendered diagnosis and the reducer's
      // diagnosis are the SAME computation over the SAME data, by
      // construction, and can never diverge again.
      const d = diagnose(ENGINES[c.engineKey], state.answers)
      const freshDegraded = degradedFor(ENGINES[c.engineKey].playbook.rules)
      const freshChangedOn = changedOnFor(ENGINES[c.engineKey].playbook.rules)
      body = (
        <CasefileScreen
          case={c}
          d={d}
          answers={state.answers}
          prepChecks={state.prepChecks}
          savedCases={state.savedCases}
          now={now}
          ciPending={state.ciPending}
          ciPendingIdx={state.ciPendingIdx}
          ciStage={state.ciStage}
          ciReassure={state.ciReassure}
          ciSnapshot={state.ciSnapshot}
          ciConsecutive={state.ciConsecutive}
          phaseDrift={state.phaseDrift}
          reminderCopied={state.reminderCopied}
          logOpen={state.logOpen}
          removeConfirm={state.removeConfirm}
          topbar={topbar(true, false)}
          dispatch={dispatch}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }
    case 'dead-end': {
      const c = activeCase(state)
      if (!c) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      body = (
        <DeadEndScreen case={c} logOpen={state.logOpen} now={now} topbar={topbar(true, false)} dispatch={dispatch} />
      )
      break
    }
    case 'case-closed': {
      // Mirrors the prototype's own lookup (CaseClosedScreen.tsx's header
      // note): a saved, deliverable_received case matching activeCaseId, or
      // whatever activeCase() otherwise resolves to (a working case closed
      // without ever having been saved). Nullable — the component's own
      // job, not RestartToHome's, to render sensibly for either.
      const c = state.savedCases.find(x => x.outcome === 'deliverable_received' && x.id === state.activeCaseId)
        ?? activeCase(state)
      body = <CaseClosedScreen case={c} logOpen={state.logOpen} topbar={topbar(false, false)} dispatch={dispatch} />
      break
    }
    case 'save-done':
      body = <SaveDoneScreen pendingSave={state.pendingSave} topbar={topbar(false, false)} dispatch={dispatch} />
      break

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
