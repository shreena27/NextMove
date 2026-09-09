import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createSupabaseMock, type SupabaseMock } from './test/supabaseMock'
import type { Casefile } from './domain/casefile'

// Task 8: every test in this file mounts `<App/>`, which now (via the
// auth-lifecycle effects) calls `getSession()`/`onAuthStateChange()` at
// mount, whether or not the individual test cares about auth — so the
// shared fake client is wired up here, at the very top, before `./App`
// itself is ever imported (mirroring `caseSync.test.ts`'s own established
// convention for this exact reason: `vi.mock` calls are hoisted above
// every import regardless of source position, but the module under test
// must still be imported textually AFTER the mock is registered).
//
// `mockClient` is reassigned to a BRAND NEW `createSupabaseMock()` in the
// file-wide `beforeEach` below rather than reused across tests: this
// file's own `afterEach` calls `vi.restoreAllMocks()` (needed for the
// pre-existing `evaluate()` spy test further down), and `vi.fn(impl)`-
// style mocks — which is what every method on the shared fake is — have
// no "original" implementation to restore to, so a *reused* instance
// would be stripped to bare no-op stubs after the FIRST test, crashing
// every later test's mount (`onAuthStateChange` returning `undefined`
// instead of `{ data: { subscription } }`, destructured in `auth.ts`
// outside any try/catch). A fresh instance every test sidesteps this
// entirely: mocks created inside a `beforeEach` postdate the PREVIOUS
// test's `restoreAllMocks()` call, so they always start pristine.
let mockClient: SupabaseMock = createSupabaseMock()
vi.mock('./session/supabase', () => ({ getClient: () => mockClient }))

import App from './App'
import { diagnose } from './domain/engine'
import { passportEngine, voterEngine, sirEngine } from './playbooks/engines'
import { SIR_STATES } from './playbooks/sirPlaybook'
import * as evaluateModule from './domain/evaluate'
import * as caseSyncModule from './session/caseSync'
import * as caseStoreModule from './session/caseStore'
import * as freshnessModule from './domain/freshness'
import * as interpretationModule from './session/interpretation'
import { simProvider } from './domain/simInterpreter'
import { UI, PASSPORT_COPY, VOTER_COPY, SIR_COPY } from './screens/screenCopy'
import { PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS, VOTER_Q1_LABELS } from './screens/labels'
import { matchPasted, PASTE_MATCH_EXAMPLES } from './screens/passport/PassportRecovery'
import { PREP, prepPlanFor } from './playbooks/prep'
import type { ActiveInterpretation, ScreenId, SessionState, SessionAction } from './session/session'
import { PENDING_GOOGLE_SAVE_KEY } from './session/session'
import type { Fact, GatedInterpretation } from './domain/interpret'

// Design note 3's no-plan guard (design/nextmove-v1-prototype.html 3749,
// ported as App.tsx's `RestartToHome`) is reachable only via a direct
// NAVIGATE to a '*-prepare' screen id — never through the UI, since the
// CTA only renders behind `hasPrepPlan`. `<App/>` exposes no dispatch or
// initial-screen prop (by design — session.ts's own field list is pinned,
// and App.tsx's shape is transcribed exactly per the brief), so the one
// test below that exercises this seeds the FIRST render's screen id via a
// scoped module mock instead of adding test-only surface to App itself.
//
// Task 8 generalises this from a single `screen` seed to an ARBITRARY
// `Partial<SessionState>` seed (`seededState`, was `seededScreen`): the
// `TOKEN_REFRESHED`/`USER_UPDATED` tests need to seed `authErr`/`otp`/
// `authBusy`/`user`/`migration` directly, and no screen built by this
// point in the branch (`save-case`/`save-otp`/`save-name` are Tasks
// 11-13's) renders any of those fields, so there is no UI path to reach
// them yet. Same mechanism, wider payload — `sessionReducer`'s own
// `RESTART`/`BACK`-to-home arms are STILL untouched by this: they close
// over session.ts's OWN internal `initialSession` binding (same module, no
// import indirection), never the mocked export read here, so restarting
// still lands on the real, unmutated clean-slate state.
const seededState = vi.hoisted(() => ({ current: undefined as Partial<SessionState> | undefined }))
// Task 8 fix round 1, Finding 1: `<App/>` exposes no dispatch, and neither
// `authErr`/`otp`/`authBusy` nor `user.name` render on any screen built by
// this point in the branch — so the ONLY way to prove exactly which
// actions the `onAuthChange` handler dispatched (not just "a migration
// eventually ran or didn't", which the reducer's own `MIGRATION_STARTED`
// no-op guard can make ambiguous between "the bug fired first" and "only
// the later, correct trigger fired") is to record every action the real
// reducer actually receives. Wraps `sessionReducer` — delegates to the
// UNMODIFIED real implementation every time, purely an observation point.
const dispatchedActions = vi.hoisted(() => ({ current: [] as SessionAction[] }))
// C8 Task 17: the SAME observation point, one step further — every state
// the real reducer actually RETURNED, in order. Two things in this task
// genuinely need it and cannot get them any other way:
//   - Design note 5's "assert the smart skip on the RENDER HISTORY, not
//     just the endpoint". Every committed reducer result is a render (this
//     is a `useReducer` over `state.screen` and nothing else selects the
//     body), so `reducerStates.current.map(s => s.screen)` IS the sequence
//     of screens the router rendered. Proving `'passport-q2'` never appears
//     in it is strictly stronger than proving the final screen is
//     `'passport-diagnosis'`.
//   - Design note 4's AC-AI-1 assertion needs REFERENCE identity (`toBe`)
//     on `state.answers` across the interpretation, and `<App/>` exposes no
//     state. A DOM assertion cannot distinguish "the same object" from "an
//     equal copy", which is the entire point of that pin.
// Delegates to the UNMODIFIED real implementation, exactly like
// `dispatchedActions` above — purely an observation point, never a
// substitute reducer.
const reducerStates = vi.hoisted(() => ({ current: [] as SessionState[] }))
vi.mock('./session/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./session/session')>()
  return {
    ...actual,
    get initialSession() {
      return seededState.current ? { ...actual.initialSession, ...seededState.current } : actual.initialSession
    },
    sessionReducer: (s: SessionState, a: SessionAction) => {
      dispatchedActions.current.push(a)
      const next = actual.sessionReducer(s, a)
      reducerStates.current.push(next)
      return next
    },
  }
})

beforeEach(() => {
  mockClient = createSupabaseMock()
})

afterEach(() => {
  vi.restoreAllMocks()
  // C8 Task 17: the describe-it tests below stub `VITE_DESCRIBE_IT`
  // (the feature ships OFF by default, so an ON test must say so
  // explicitly). Unstubbed here so no stub — 'on' OR 'off' — can leak into
  // a later test in this file or, if suite ordering ever changes, another
  // file. Same discipline `featureFlags.test.ts` / `screenCopy.test.tsx`
  // already follow.
  vi.unstubAllEnvs()
  seededState.current = undefined
  dispatchedActions.current = []
  reducerStates.current = []
  // Task 13: App now genuinely reads/writes `nm_cases` via `localStorage`
  // (the lazy useReducer initializer / the persistence useEffect) — jsdom's
  // REAL localStorage is shared across every `it()` in this file, so a case
  // saved by one test would otherwise leak into the next `render(<App/>)`.
  localStorage.clear()
  // Task 19 fix: same reasoning as localStorage.clear() above — jsdom's
  // REAL sessionStorage is shared across every it() in this file, and a
  // pending-Google-save snapshot written by one test must not leak into
  // the next.
  sessionStorage.clear()
  // Task 8: a `?code=` test rewrites the address bar; every other test
  // expects to boot at the bare origin.
  window.history.replaceState(null, '', '/')
})

describe('Passport, end to end — the flow is real, not just unit-tested components', () => {
  it('Home -> guardrail -> Q1 -> Q2 -> Diagnosis -> Next Move', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    await userEvent.click(screen.getByRole('button', { name: /looks negative or confusing/ }))
    await userEvent.click(screen.getByRole('button', { name: /Yes, I filed a formal grievance/ }))

    const d = diagnose(passportEngine, { guardrail: 'no', q1: 'adverse', q2: 'formal_grievance' })
    expect(document.querySelector('.stamp')).toHaveTextContent('ESCALATE')
    expect(screen.getByText('Waiting on')).toBeInTheDocument()
    expect(screen.getByText(d.dependency)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Why am I seeing this\?/ }))
    expect(screen.getByText(/looks negative or confusing/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(d.whatShort)
  })

  it('AC-8 end to end: Back, change Q1, and the diagnosis follows the NEW answer', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    // Reach State 1 (no_contact + no_followup -> WAIT).
    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
    expect(document.querySelector('.stamp')).toHaveTextContent('WAIT')

    // Back twice: diagnosis -> Q2 -> Q1.
    await userEvent.click(screen.getByRole('button', { name: /← Back/ }))
    await userEvent.click(screen.getByRole('button', { name: /← Back/ }))
    expect(screen.getByRole('heading', { name: "What's happening with your application?" })).toBeInTheDocument()

    // Change Q1 to a genuinely different answer (adverse).
    await userEvent.click(screen.getByRole('button', { name: /looks negative or confusing/ }))
    // Q2 shows with NOTHING preselected — the stale q2 answer from State 1
    // must have been cleared by the changed Q1 (PASSPORT_DEPS).
    expect(screen.getByRole('heading', { name: 'Have you already tried to follow up on this?' })).toBeInTheDocument()
    for (const row of document.querySelectorAll('.answers .arow')) {
      expect(row).not.toHaveClass('selected')
    }

    // Answer again -> State 4, never a stale State 1.
    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
    const d4 = diagnose(passportEngine, { guardrail: 'no', q1: 'adverse', q2: 'no_followup' })
    expect(d4.state).toBe('4')
    expect(document.querySelector('.stamp')).toHaveTextContent('FOLLOW UP')
    expect(screen.getByText(d4.dependency)).toBeInTheDocument()
    // The stale State 1 dependency must never leak back in.
    expect(screen.queryByText('Police verification process')).toBeNull()
  })

  it('AC-9 end to end: Restart asks first, Cancel keeps everything, Yes returns Home empty', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    expect(screen.getByRole('heading', { name: "What's happening with your application?" })).toBeInTheDocument()

    // Restart asks first — it does not clear immediately.
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(screen.getByText('Clear your answers?')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "What's happening with your application?" })).toBeInTheDocument()

    // Cancel keeps everything — same screen, confirm gone.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Clear your answers?')).toBeNull()
    expect(screen.getByRole('heading', { name: "What's happening with your application?" })).toBeInTheDocument()

    // Yes returns Home, empty: no Back/Restart, no stale answers.
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByRole('button', { name: /← Back/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull()
  })
})

describe('Prepare (C4), end to end', () => {
  it('Passport ESCALATE -> Prepare -> tick every step -> Done, back to Home', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    await userEvent.click(screen.getByRole('button', { name: /looks negative or confusing/ }))
    await userEvent.click(screen.getByRole('button', { name: /Yes, I filed a formal grievance/ }))
    expect(document.querySelector('.stamp')).toHaveTextContent('ESCALATE')

    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    await userEvent.click(screen.getByRole('button', { name: UI.nextMove.prepare }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREP['state-5b'].title!)

    // (b) tick every step and see the done note.
    const ticks = Array.from(document.querySelectorAll('.pstep-tick'))
    expect(ticks).toHaveLength(PREP['state-5b'].steps.length)
    for (const t of ticks) await userEvent.click(t)
    expect(document.querySelector('.psteps-done')).toHaveTextContent(PREP['state-5b'].doneNote!)

    // (c) "Done, back to Home" lands on Home with answers cleared: Home's
    // hero is present, and returning into Passport Q1 shows no
    // pre-selected answer (same check AC-8's own test uses).
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.doneBackHome }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByRole('button', { name: /← Back/ })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    for (const row of document.querySelectorAll('.answers .arow')) {
      expect(row).not.toHaveClass('selected')
    }
  })

  it('a WAIT state shows "Back to Home" and no prepare CTA — the locked no-prep branch, unregressed by C4', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
    expect(document.querySelector('.stamp')).toHaveTextContent('WAIT')

    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    expect(screen.getByRole('button', { name: UI.common.backToHome })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.nextMove.prepare })).toBeNull()
  })

  it('a direct NAVIGATE to a *-prepare screen with no plan lands back on Home — the design note 3 guard', () => {
    seededState.current = { screen: 'sir-prepare' }
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByRole('button', { name: /← Back/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull()
  })
})

describe('Voter and SIR, end to end', () => {
  it("Voter: entry -> not sure -> explainer -> \"It's a regular application\" -> Q1 -> diagnosis", async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Voter Services/ }))
    await userEvent.click(screen.getByRole('button', { name: "I'm not sure" }))
    expect(screen.getByRole('button', { name: "It's a regular application" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: "It's a regular application" }))
    expect(screen.getByRole('heading', { name: "What's the situation with your application?" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything yet" }))
    const d = diagnose(voterEngine, { voterQ1: 'no_word' })
    expect(document.querySelector('.stamp')).toHaveTextContent(d.rec === 'FOLLOW_UP' ? 'FOLLOW UP' : d.rec)
    expect(screen.getByText(d.explanation)).toBeInTheDocument()
  })

  it('SIR Delhi: entry -> SIR -> Delhi -> Q1 -> diagnosis carries the phase banner', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Voter Services/ }))
    await userEvent.click(screen.getByRole('button', { name: /^This is about SIR/ }))
    expect(screen.getByRole('heading', { name: 'Which state is this for?' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Delhi' }))
    expect(screen.getByRole('heading', { name: "What's happening with your SIR situation?" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'I got a notice asking for documents' }))
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })
    expect(document.querySelector('.stamp')).toHaveTextContent('FOLLOW UP')
    expect(screen.getByText(d.explanation)).toBeInTheDocument()
    // The phase banner (preNote) — Delhi's currently configured phase note.
    expect(screen.getByText(SIR_STATES.delhi.phase!.note, { exact: false })).toBeInTheDocument()
  })

  it('AC-S-5: SIR Bihar -> the coverage screen, and no diagnosis screen is ever rendered', async () => {
    // Spy on the real evaluate() export, same pattern as sirFlow.test.tsx's
    // own AC-S-5 spy test — so the "the SIR playbook is never evaluated for
    // an unsupported state" guarantee holds through the real <App> router,
    // not just through the lower-level SirState/SirUnsupported screens.
    const spy = vi.spyOn(evaluateModule, 'evaluate')
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Voter Services/ }))
    await userEvent.click(screen.getByRole('button', { name: /^This is about SIR/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Bihar' }))

    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByText(/isn't available in NextMove yet/)).toBeInTheDocument()
    expect(document.querySelector('.stamp')).toBeNull()
    expect(screen.queryByRole('heading', { name: /SIR situation/ })).toBeNull()
  })
})

describe('Home v2', () => {
  it('shows exactly three service rows and no casefiles section (C5)', () => {
    render(<App />)
    expect(document.querySelectorAll('.services .svc').length).toBe(3)
    expect(document.querySelector('.home-cases')).toBeNull()
  })

  it('hides Back and Restart', () => {
    render(<App />)
    expect(screen.queryByRole('button', { name: /← Back/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull()
  })

  it('Other services shows four inert Coming Soon rows, none of them a button', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Other services/ }))
    const rows = document.querySelectorAll('.services .svc.disabled')
    expect(rows.length).toBe(4)
    for (const row of rows) expect(row.tagName).toBe('DIV')
    expect(screen.getAllByText('Coming Soon').length).toBe(4)
  })

  it('renders the site footer', () => {
    render(<App />)
    expect(screen.getByText('© 2026 NextMove. All rights reserved.')).toBeInTheDocument()
  })
})

describe('Task 13: the four C5 router cases', () => {
  it("'checkin' with no active case dispatches RESTART and lands on Home, rendering nothing of the casefile screen", () => {
    seededState.current = { screen: 'checkin' }
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByRole('button', { name: /← Back/ })).toBeNull()
    expect(document.querySelector('.update-mod')).toBeNull()
  })

  it("'dead-end' with no active case dispatches RESTART and lands on Home", () => {
    seededState.current = { screen: 'dead-end' }
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByText(UI.deadEnd.headline)).toBeNull()
  })

  it("'case-closed' renders (case is nullable — no RestartToHome guard needed)", () => {
    seededState.current = { screen: 'case-closed' }
    render(<App />)
    expect(screen.getByRole('button', { name: UI.caseClosed.backToHome })).toBeInTheDocument()
  })

  it("'save-done' renders (pendingSave is nullable — no RestartToHome guard needed)", () => {
    seededState.current = { screen: 'save-done' }
    render(<App />)
    expect(screen.getByRole('heading', { name: UI.saveDone.headline })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.saveDone.goHome })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.saveDone.backToCase })).toBeNull()
  })

  it(
    "'save-done' passes App's real state.user through to SaveDoneScreen (Task 14 wiring): a phone-method user " +
    "reaches the restored auth-coupled tail sentence in .lede's rendered output",
    () => {
      seededState.current = { screen: 'save-done', user: { method: 'phone', id: 'app-test-phone', name: null } }
      render(<App />)
      expect(document.querySelector('.lede')).toHaveTextContent(UI.saveDone.ledeTailPhone)
    },
  )

  // Task 17: the three router cases this task adds — 'save-case'/'save-otp'
  // get topbar(true,false) (Back visible, Restart absent), 'save-name' gets
  // topbar(false,false) (both absent), matching the prototype's own
  // renderSaveCase/renderSaveOtp/renderSaveName call sites exactly (task
  // brief design note 2).
  it("'save-case' routes to SaveCaseScreen with Back visible and Restart absent", () => {
    seededState.current = { screen: 'save-case' }
    render(<App />)
    expect(screen.getByRole('heading', { name: UI.saveCase.headline })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.topbar.back })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.topbar.restart })).toBeNull()
  })

  it("'save-otp' routes to SaveOtpScreen with Back visible and Restart absent", () => {
    seededState.current = { screen: 'save-otp' }
    render(<App />)
    expect(screen.getByRole('heading', { name: UI.saveOtp.headline })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.topbar.back })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.topbar.restart })).toBeNull()
  })

  it("'save-name' routes to SaveNameScreen with Back and Restart both absent", () => {
    seededState.current = { screen: 'save-name' }
    render(<App />)
    expect(screen.getByRole('heading', { name: UI.saveName.headline })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.topbar.back })).toBeNull()
    expect(screen.queryByRole('button', { name: UI.topbar.restart })).toBeNull()
  })
})

describe('Task 13: end to end — Add an update, confirm, and Undo', () => {
  it('Home -> Passport -> diagnosis -> "Add an update" -> the casefile screen -> pick an option -> confirm -> back on diagnosis with the update recorded -> Undo -> the case restored', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))

    const before = diagnose(passportEngine, { guardrail: 'no', q1: 'no_contact', q2: 'no_followup' })
    expect(document.querySelector('.stamp')).toHaveTextContent('WAIT')
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()

    // "Add an update" — BEGIN_WORKING_CHECKIN, landing on the casefile screen.
    await userEvent.click(screen.getByRole('button', { name: UI.updateEntry.label }))
    expect(document.querySelector('.update-mod')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(before.label)

    // Pick the first option ("Police contacted or visited me", state-1's own
    // CHECKIN_META entry) — opens the confirm panel (an 'event' kind).
    await userEvent.click(screen.getByRole('button', { name: 'Police contacted or visited me' }))
    expect(screen.getByText(UI.casefile.confirmQ)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: UI.casefile.confirmYes }))

    // Navigated to passport-diagnosis with the update recorded — a real
    // diagnosis CHANGE (state-1 WAIT -> state-2 FOLLOW_UP).
    const after = diagnose(passportEngine, { guardrail: 'no', q1: 'contacted_incomplete', q2: 'no_followup' })
    expect(after.ruleId).not.toBe(before.ruleId) // guards the fixture — a real change, not a no-op
    expect(document.querySelector('.stamp')).toHaveTextContent('FOLLOW UP')
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(screen.getByText(after.explanation)).toBeInTheDocument()
    expect(screen.getByText(UI.diagnosis.updateRecorded)).toBeInTheDocument()

    // Undo — the case (and the diagnosis it drives) is restored whole.
    await userEvent.click(screen.getByRole('button', { name: UI.diagnosis.undoUpdate }))
    expect(document.querySelector('.stamp')).toHaveTextContent('WAIT')
    expect(screen.getByText(before.explanation)).toBeInTheDocument()
    expect(screen.queryByText(UI.diagnosis.updateRecorded)).toBeNull()
  })
})

describe('FIX WAVE (2026-09-06, whole-branch final review, Critical finding 1): the casefile screen and CI_CHOOSE must resolve options from the SAME answer record', () => {
  it('changing an answer via "Something else happened", then Back to the casefile screen WITHOUT re-saving, shows the NEW diagnosis\'s own options — and clicking one records exactly that option, never a stale one read off the case\'s own stored answers', async () => {
    render(<App />)
    // Reach state-1 (WAIT) and start a working check-in on it. The working
    // case's OWN stored `answers` are frozen here — {guardrail:'no',
    // q1:'no_contact', q2:'no_followup'} — and, per the bug this fix wave
    // closes, the ANSWER action never touches them again.
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
    await userEvent.click(screen.getByRole('button', { name: UI.updateEntry.label }))
    expect(document.querySelector('.update-mod')).toBeInTheDocument()
    // Premise: state-1's own first option ("Police contacted...") is what's
    // on screen right now — the stale option a bug would leave behind.
    expect(screen.getByRole('button', { name: 'Police contacted or visited me' })).toBeInTheDocument()

    // "Something else happened" — the universal escape hatch — takes the
    // citizen to a real question screen. It writes only a log entry onto
    // the case; the case's own stored `answers` are still state-1's.
    await userEvent.click(screen.getByRole('button', { name: 'Something else happened' }))
    expect(screen.getByRole('heading', { name: "What's happening with your application?" })).toBeInTheDocument()

    // Answer BOTH questions with a genuinely different, complete answer set
    // — state-2, not a partial/unclassified one — landing on
    // passport-diagnosis. This is `state.answers` now; the working case's
    // own stored `answers` never moved off state-1's.
    await userEvent.click(screen.getByRole('button', { name: "Someone from the police contacted me, but it isn't finished" }))
    expect(screen.getByRole('heading', { name: 'Have you already tried to follow up on this?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
    const liveD = diagnose(passportEngine, { guardrail: 'no', q1: 'contacted_incomplete', q2: 'no_followup' })
    expect(liveD.ruleId).toBe('state-2') // guards the fixture: a genuinely different diagnosis than state-1

    // Back three times — diagnosis -> Q2 -> Q1 -> the casefile screen —
    // never through Home, so activeCaseId (still 'working') survives every
    // one of these, per App.tsx's own established Back behaviour.
    await userEvent.click(screen.getByRole('button', { name: /← Back/ }))
    await userEvent.click(screen.getByRole('button', { name: /← Back/ }))
    await userEvent.click(screen.getByRole('button', { name: /← Back/ }))
    expect(document.querySelector('.update-mod')).toBeInTheDocument() // back on the casefile screen

    // THE FIX: the screen's diagnosis is now derived from `state.answers`
    // (state-2), never the case's own stored `answers` (state-1) — so
    // state-1's own first option must be GONE, and state-2's own first
    // option is what's actually offered.
    expect(screen.queryByRole('button', { name: 'Police contacted or visited me' })).toBeNull()
    const stateTwoFirstOption = 'Verification finished, but nothing has moved since'
    expect(screen.getByRole('button', { name: stateTwoFirstOption })).toBeInTheDocument()

    // Click it. Pre-fix, CI_CHOOSE independently rebuilt its OWN option list
    // from `state.answers` (state-2's) and indexed into it with the click's
    // position in the list ABOVE (state-2's, post-fix — but state-1's,
    // pre-fix) — so a citizen clicking this exact row could have had a
    // DIFFERENT option recorded than the one they saw and clicked. The
    // confirm panel must echo back the SAME option.
    await userEvent.click(screen.getByRole('button', { name: stateTwoFirstOption }))
    expect(screen.getByText(UI.casefile.confirmQ)).toBeInTheDocument()
    expect(document.querySelector('.ci-panel')).toHaveTextContent(stateTwoFirstOption)

    // Confirming re-diagnoses from state-2 (never the stale state-1) —
    // closing the loop end to end.
    const afterD = diagnose(passportEngine, { guardrail: 'no', q1: 'verified_no_progress', q2: 'no_followup' })
    await userEvent.click(screen.getByRole('button', { name: UI.casefile.confirmYes }))
    expect(document.querySelector('.stamp')).toHaveTextContent(afterD.rec === 'FOLLOW_UP' ? 'FOLLOW UP' : afterD.rec)
    expect(screen.getByText(afterD.explanation)).toBeInTheDocument()
  })
})

describe('Task 13: end to end — save, save-done, Home, and back into the casefile', () => {
  it('Next Move -> Save this case -> save-done -> Go to Home -> the card is on Home -> tap the card -> the casefile screen', async () => {
    // C7 Task 16: BEGIN_SAVE now completes the save only while signed in —
    // a signed-out tap detours into the sign-in flow instead (whose route,
    // 'save-case', is wired in Task 17, not here). This test's own subject
    // (Save -> save-done -> Home -> reopen) is the SIGNED-IN branch, which
    // this task's design note pins as behaving exactly as it did before —
    // so a signed-in user is seeded to keep exercising that same path.
    seededState.current = { user: { method: 'phone', id: '+919876543210', name: 'Ananya' } }
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))

    await userEvent.click(screen.getByRole('button', { name: UI.saveControl.save }))
    expect(screen.getByRole('heading', { name: UI.saveDone.headline })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: UI.saveDone.goHome }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    const card = document.querySelector('.saved-card')
    expect(card).toBeInTheDocument()
    expect(card).toHaveTextContent(UI.serviceLabel.passport)

    await userEvent.click(card!)
    expect(document.querySelector('.update-mod')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.casefile.diagnosisLink })).toBeInTheDocument()
  })
})

describe('Task 13: the localStorage persistence effect (design note 6)', () => {
  it('nm_cases reflects a signed-out savedCases change, and is read back on a fresh mount', async () => {
    // C7 Task 16: BEGIN_SAVE no longer completes a save while signed out —
    // it detours into the sign-in flow instead (whose route, 'save-case',
    // is wired in Task 17, not here), so the click-through flow this test
    // used to create a NEW case (Home -> Passport -> ... -> Save) can no
    // longer reach a completed save while signed out. Design note 6's own
    // claim is broader than "after a save", though: ANY savedCases change
    // while signed out is written to storage and read back on a fresh
    // mount. This proves that same claim against a case that already
    // exists (seeded straight into localStorage, exactly like `loadCases`
    // itself reads it) via the one savedCases-mutating action still
    // reachable while signed out — removing a saved case.
    const existing: Casefile = {
      engineKey: 'passport', serviceLabel: UI.serviceLabel.passport, returnScreen: 'passport-nextmove',
      answers: { q1: 'adverse', q2: 'informal' }, prepChecks: {}, savedAt: 1_700_000_000_000,
      stateLabel: 'Followed up informally, unresolved', rec: 'FOLLOW_UP',
      whatShort: 'Move to a formal Grievance / CPGRAMS filing',
      stepsTotal: 5, stepsDone: 1, sirPhaseId: null,
      caseFacts: [], appliedText: null, interpProvenance: null,
      id: 'c1700000000000', outcome: 'still_open', lastCheck: null, remindAt: null,
      log: [{ t: 1_700_000_000_000, kind: 'diagnosed', text: 'Followed up informally, unresolved' }],
    }
    localStorage.setItem('nm_cases', JSON.stringify([existing]))

    const { unmount } = render(<App />)
    expect(document.querySelector('.saved-card')).toBeInTheDocument()

    await userEvent.click(document.querySelector('.saved-card') as HTMLButtonElement)
    await userEvent.click(screen.getByRole('button', { name: UI.casefile.removeButton }))
    await userEvent.click(screen.getByRole('button', { name: UI.casefile.removeYes }))

    const stored = localStorage.getItem('nm_cases')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toHaveLength(0)
    unmount()

    // A fresh mount reads it straight back — the lazy useReducer initializer.
    render(<App />)
    expect(document.querySelector('.saved-card')).toBeNull()
  })

  it('a corrupt nm_cases value does not prevent App rendering Home', () => {
    localStorage.setItem('nm_cases', '{not valid json')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(document.querySelector('.home-cases')).toBeNull()
  })
})

describe('the settled class: choreography plays on arrival, not on interaction', () => {
  it('is absent on a fresh navigation and present after a same-screen state change', async () => {
    render(<App />)
    const app = document.getElementById('app')!
    expect(app).toHaveClass('app')
    expect(app).not.toHaveClass('settled')

    // Walk to a screen that has a trust toggle: Home -> guardrail -> Q1 ->
    // Q2 -> Diagnosis. Every one of these is a genuine navigation, so the
    // choreography must be allowed to run on each.
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    expect(app).not.toHaveClass('settled')

    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    expect(app).not.toHaveClass('settled')

    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
    expect(app).not.toHaveClass('settled')

    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
    expect(app).not.toHaveClass('settled')

    // Same screen, state changed (TOGGLE_TRUST). The choreography must NOT
    // replay.
    await userEvent.click(screen.getByRole('button', { name: /Why am I seeing this\?/ }))
    expect(app).toHaveClass('settled')

    // And moving on clears it again.
    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    expect(app).not.toHaveClass('settled')
  })
})

// =============================================================================
// C7 Task 8: the auth lifecycle
// =============================================================================
describe('C7 Task 8: the auth lifecycle', () => {
  const SESSION_USER_ID = '11111111-1111-1111-1111-111111111111'

  function makeSupabaseUser(overrides: Record<string, unknown> = {}) {
    return {
      id: SESSION_USER_ID,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00.000Z',
      email: 'ananya@example.com',
      ...overrides,
    }
  }

  function withSession(overrides: Record<string, unknown> = {}) {
    const user = makeSupabaseUser(overrides)
    mockClient.auth.getSession.mockResolvedValue({ data: { session: { user } }, error: null })
    return user
  }

  function makeCasefile(overrides: Partial<Casefile> = {}): Casefile {
    return {
      engineKey: 'passport',
      serviceLabel: UI.serviceLabel.passport,
      returnScreen: 'passport-nextmove',
      answers: { q1: 'adverse', q2: 'informal' },
      prepChecks: {},
      savedAt: 1_700_000_000_000,
      stateLabel: 'Followed up informally, unresolved',
      rec: 'FOLLOW_UP',
      whatShort: 'Move to a formal Grievance / CPGRAMS filing',
      stepsTotal: 5,
      stepsDone: 1,
      sirPhaseId: null,
      caseFacts: [],
      appliedText: null,
      interpProvenance: null,
      id: 'c1700000000000',
      outcome: 'still_open',
      lastCheck: null,
      remindAt: null,
      log: [{ t: 1_700_000_000_000, kind: 'diagnosed', text: 'Followed up informally, unresolved' }],
      ...overrides,
    }
  }

  function remoteRowFor(c: Casefile, userId = SESSION_USER_ID) {
    return { user_id: userId, id: c.id, engine_key: c.engineKey, outcome: c.outcome, data: c, updated_at: 'x' }
  }

  /** Home -> Passport -> a full guardrail/Q1/Q2 flow -> Next Move -> Save.
   *  The one UI-reachable way, in this branch, to change `state.savedCases`
   *  after mount — `save-case`/`save-otp`/`save-name` (Tasks 11-13) don't
   *  exist yet, so this is reused across the push-effect-gate tests below
   *  as the "the citizen changed something" trigger. */
  async function saveAPassportCase() {
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    await userEvent.click(screen.getByRole('button', { name: UI.saveControl.save }))
  }

  let selectSpy: ReturnType<typeof vi.fn>
  let upsertSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const built = mockClient.from('probe')
    selectSpy = built.select
    upsertSpy = built.upsert
    mockClient.from.mockClear()
    selectSpy.mockResolvedValue({ data: [], error: null })
    upsertSpy.mockResolvedValue({ data: null, error: null })
  })

  describe('boot', () => {
    it('with no session: savedCases renders from localStorage, and no casefiles access happens at all', async () => {
      const cases = [makeCasefile({ id: 'local-1' })]
      localStorage.setItem('nm_cases', JSON.stringify(cases))

      render(<App />)

      expect(await screen.findByText('Followed up informally, unresolved')).toBeInTheDocument()
      expect(document.querySelectorAll('.saved-card')).toHaveLength(1)
      expect(selectSpy, 'fetchRemoteCases was never called').not.toHaveBeenCalled()
      expect(mockClient.from, 'no Supabase from() call was made at all').not.toHaveBeenCalled()
    })

    it('with a session: SIGNED_IN is dispatched, the migration runs, ADOPT_CASES lands merged, and Home renders it', async () => {
      withSession()
      const remoteCase = makeCasefile({ id: 'remote-1', stateLabel: 'Remote case', engineKey: 'passport' })
      selectSpy.mockResolvedValueOnce({ data: [remoteRowFor(remoteCase)], error: null })

      render(<App />)

      expect(await screen.findByText('Remote case')).toBeInTheDocument()
      expect(document.querySelectorAll('.saved-card')).toHaveLength(1)
      // The migration's own push (Task 7's own report, finding 1:
      // pushCases runs unconditionally, even for an empty toUpload).
      await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1))
    })

    it('a failing fetchRemoteCases leaves the app rendered, local cases visible, an error surfaced, and migration failed — not done', async () => {
      const localCases = [makeCasefile({ id: 'local-1', stateLabel: 'Still here locally' })]
      localStorage.setItem('nm_cases', JSON.stringify(localCases))
      withSession()
      selectSpy.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })

      render(<App />)

      // The migration genuinely ran (proves the mount effect actually
      // attempted it — not merely "nothing crashed", which an app with no
      // auth wiring at all would also satisfy).
      await waitFor(() => expect(selectSpy).toHaveBeenCalled())

      expect(await screen.findByText('Still here locally')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
      // migration:'done' would arm the signed-in push effect against a
      // server this app never successfully read — proven here by the
      // absence of any upsert at all (the push-effect-gate tests below pin
      // the 'failed' gate directly; this is boot's own instance of it).
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(upsertSpy, 'migration must be `failed`, not `done` — `done` would arm the push effect against an unread server').not.toHaveBeenCalled()
    })
  })

  describe('the double-fire test, in all three of its real shapes (design note 4)', () => {
    it('(a) INITIAL_SESSION then SIGNED_IN: runSignInMigration ran exactly once', async () => {
      const migrationSpy = vi.spyOn(caseSyncModule, 'runSignInMigration')
      // Boots signed OUT (default) so the mount effect itself contributes
      // no trigger — isolating this shape to the onAuthChange channel.
      render(<App />)
      await waitFor(() => expect(mockClient.auth.getSession).toHaveBeenCalled())

      const user = makeSupabaseUser()
      mockClient.emitAuthEvent('INITIAL_SESSION', { user })
      mockClient.emitAuthEvent('SIGNED_IN', { user })

      await waitFor(() => expect(migrationSpy).toHaveBeenCalledTimes(1))
      // Let any further microtasks settle, then confirm it never ran a
      // second time — "the second run reads nm_cases after the first
      // cleared it and produces a merged set missing everything this
      // device contributed."
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(
        migrationSpy,
        'the second run reads nm_cases after the first cleared it and produces a merged set missing everything this device contributed',
      ).toHaveBeenCalledTimes(1)
    })

    it('(b) SIGNED_IN emitted twice: the reducer guard still holds it to one', async () => {
      const migrationSpy = vi.spyOn(caseSyncModule, 'runSignInMigration')
      render(<App />)

      const user = makeSupabaseUser()
      mockClient.emitAuthEvent('SIGNED_IN', { user })
      mockClient.emitAuthEvent('SIGNED_IN', { user })

      await waitFor(() => expect(migrationSpy).toHaveBeenCalledTimes(1))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(
        migrationSpy,
        'the second run reads nm_cases after the first cleared it and produces a merged set missing everything this device contributed',
      ).toHaveBeenCalledTimes(1)
    })

    it('(c) the mount effect triggers the migration AND SIGNED_IN fires in the same tick: still exactly one run', async () => {
      const migrationSpy = vi.spyOn(caseSyncModule, 'runSignInMigration')
      const user = withSession()

      render(<App />)
      // Emitted synchronously, right after render — before the mount
      // effect's own getCurrentUser() promise has had a chance to settle.
      mockClient.emitAuthEvent('SIGNED_IN', { user })

      await waitFor(() => expect(migrationSpy).toHaveBeenCalledTimes(1))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(
        migrationSpy,
        'the second run reads nm_cases after the first cleared it and produces a merged set missing everything this device contributed',
      ).toHaveBeenCalledTimes(1)
    })

    it("(d) SIGNED_IN arrives again after migration:'done' (a real supabase-js shape — tab focus / cross-tab session recovery): still exactly one run", async () => {
      const migrationSpy = vi.spyOn(caseSyncModule, 'runSignInMigration')
      const user = withSession()
      selectSpy.mockResolvedValueOnce({ data: [], error: null })

      render(<App />)
      await waitFor(() => expect(migrationSpy).toHaveBeenCalledTimes(1))
      // Synchronise on `ADOPT_CASES` having actually reached the reducer —
      // proof the migration settled all the way to `'done'`, not merely
      // that `runSignInMigration` was called.
      await waitFor(() => {
        if (!dispatchedActions.current.some(a => a.type === 'ADOPT_CASES')) {
          throw new Error('migration has not settled to done yet')
        }
      })

      mockClient.emitAuthEvent('SIGNED_IN', { user })
      // Synchronise on the SECOND SIGNED_IN having genuinely reached the
      // reducer (a reliable positive signal this event was fully
      // processed) before checking that no second migration ran.
      await waitFor(() => {
        const signedInCount = dispatchedActions.current.filter(a => a.type === 'SIGNED_IN').length
        if (signedInCount < 2) throw new Error('the second SIGNED_IN has not been processed yet')
      })

      expect(
        migrationSpy,
        'a real supabase-js SIGNED_IN re-emission (tab focus / cross-tab session recovery) after the migration already completed must not re-run it',
      ).toHaveBeenCalledTimes(1)
    })
  })

  it("the first-sign-in visibility test — C7's headline scenario, asserted at the App level", async () => {
    const c1 = makeCasefile({ id: 'local-1', engineKey: 'passport', stateLabel: 'Local passport case' })
    const c2 = makeCasefile({ id: 'local-2', engineKey: 'voter', stateLabel: 'Local voter case' })
    localStorage.setItem('nm_cases', JSON.stringify([c1, c2]))
    withSession()
    selectSpy.mockResolvedValueOnce({ data: [], error: null }) // the account has nothing yet

    render(<App />)

    // Wait for the migration to genuinely SETTLE (nm_cases cleared, proving
    // this isn't just the pre-migration local render still on screen) —
    // this is what makes the test fail against a "dispatches `adopted`"
    // mutant instead of trivially passing off the untouched local set.
    await waitFor(() => {
      if (localStorage.getItem('nm_cases') !== null) throw new Error('migration has not cleared nm_cases yet')
    })

    expect(await screen.findByText('Local passport case')).toBeInTheDocument()
    expect(
      screen.getByText('Local voter case'),
      'ADOPT_CASES receives adopted ∪ toUpload; dispatching `adopted` alone empties Home for exactly the citizen this chunk was built for',
    ).toBeInTheDocument()
    expect(document.querySelectorAll('.saved-card')).toHaveLength(2)
  })

  it('the leak test (D6): adopted server cases never reach nm_cases', async () => {
    expect.assertions(1)
    withSession()
    const remote = [
      makeCasefile({ id: 'r1', engineKey: 'passport' }),
      makeCasefile({ id: 'r2', engineKey: 'voter' }),
      makeCasefile({ id: 'r3', engineKey: 'sir' }),
    ]
    selectSpy.mockResolvedValueOnce({ data: remote.map(c => remoteRowFor(c)), error: null })

    render(<App />)

    await waitFor(() => {
      if (document.querySelectorAll('.saved-card').length !== 3) throw new Error('not adopted yet')
    })

    const stored = localStorage.getItem('nm_cases')
    const parsed: unknown[] = stored ? JSON.parse(stored) : []
    expect(parsed, 'a different account signing in on this browser would migrate these onto itself').toEqual([])
  })

  it('the failed-migration sign-out test — the second half of the Global Constraint', async () => {
    expect.assertions(3)
    const original = [
      makeCasefile({ id: 'p1', engineKey: 'passport', stateLabel: 'Passport case' }),
      makeCasefile({ id: 'p2', engineKey: 'voter', stateLabel: 'Voter case' }),
      makeCasefile({ id: 'p3', engineKey: 'sir', stateLabel: 'SIR case' }),
    ]
    localStorage.setItem('nm_cases', JSON.stringify(original))
    withSession()
    upsertSpy.mockResolvedValueOnce({ data: null, error: { message: 'network dropped' } })
    const saveCasesSpy = vi.spyOn(caseStoreModule, 'saveCases')

    render(<App />)

    // The migration reports failure and nm_cases is intact — Task 7's own
    // guarantee, re-checked here at the App level, before we ever sign out.
    await waitFor(() => {
      const stored = localStorage.getItem('nm_cases')
      if (!stored || JSON.parse(stored).length !== 3) throw new Error('migration has not settled yet')
    })

    // Sign out. Synchronise on the signed-out persistence effect actually
    // having fired at least once MORE than it had before (rather than on
    // `.saved-card`'s count, which reads identically — 3 — both before the
    // dispatch has been processed at all AND after a CORRECT
    // implementation settles, so waiting on it alone would pass vacuously
    // without ever observing the sign-out's own effects apply).
    const saveCallsBeforeSignOut = saveCasesSpy.mock.calls.length
    mockClient.emitAuthEvent('SIGNED_OUT', null)

    await waitFor(() => {
      if (saveCasesSpy.mock.calls.length <= saveCallsBeforeSignOut) throw new Error('sign-out has not been processed yet')
    })

    const stored = JSON.parse(localStorage.getItem('nm_cases')!)
    expect(stored).toEqual(original)
    // `SIGN_OUT` implemented as `savedCases: []` (the pre-fix behaviour)
    // would have made the signed-out persistence effect call
    // `saveCases([])`, overwriting the very rows the failure path
    // protected — assert that never happened, across the whole
    // interaction, not just after.
    expect(saveCasesSpy.mock.calls.some(call => call[0].length === 0)).toBe(false)
    expect(document.querySelectorAll('.saved-card')).toHaveLength(3)
  })

  it('sign out after a successful migration: savedCases empties, nm_cases empties, and saveCases is never called with the server list', async () => {
    withSession()
    const remote = [makeCasefile({ id: 'r1', engineKey: 'passport', stateLabel: 'Remote only case' })]
    selectSpy.mockResolvedValueOnce({ data: remote.map(c => remoteRowFor(c)), error: null })
    const saveCasesSpy = vi.spyOn(caseStoreModule, 'saveCases')

    render(<App />)

    expect(await screen.findByText('Remote only case')).toBeInTheDocument()

    mockClient.emitAuthEvent('SIGNED_OUT', null)

    await waitFor(() => {
      if (document.querySelector('.saved-card') !== null) throw new Error('still rendering the server case')
    })

    expect(document.querySelectorAll('.saved-card')).toHaveLength(0)
    const storedAfter = localStorage.getItem('nm_cases')
    expect(storedAfter === null ? [] : JSON.parse(storedAfter)).toEqual([])
    // Spied across the WHOLE interaction (from mount), not just after the
    // sign-out — the payload fix must not resurrect cases that were
    // legitimately migrated away.
    for (const call of saveCasesSpy.mock.calls) {
      expect(call[0].some((c: Casefile) => c.id === 'r1')).toBe(false)
    }
  })

  it('sign out then sign in as a second user: the first users cases never appear', async () => {
    const user1 = withSession({ id: 'user-1', email: 'first@example.com' })
    const remote1 = [makeCasefile({ id: 'first-case', stateLabel: 'First users case', engineKey: 'passport' })]
    selectSpy.mockResolvedValueOnce({ data: remote1.map(c => remoteRowFor(c, 'user-1')), error: null })

    render(<App />)
    expect(await screen.findByText('First users case')).toBeInTheDocument()

    mockClient.emitAuthEvent('SIGNED_OUT', null)
    await waitFor(() => {
      if (document.querySelector('.saved-card') !== null) throw new Error('still showing the first user')
    })

    selectSpy.mockResolvedValueOnce({ data: [], error: null })
    const user2 = makeSupabaseUser({ id: 'user-2', email: 'second@example.com' })
    mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: user2 } }, error: null })
    void user1
    mockClient.emitAuthEvent('SIGNED_IN', { user: user2 })

    await waitFor(() => expect(selectSpy).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByText('First users case')).toBeNull()
    expect(document.querySelectorAll('.saved-card')).toHaveLength(0)
  })

  it('SIGNED_OUT from another tab: user -> null, Home renders whatever nm_cases holds, and auth.signOut() is never called locally; the event is idempotent', async () => {
    withSession()
    selectSpy.mockResolvedValueOnce({ data: [], error: null })

    render(<App />)
    await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1)) // migration has settled to 'done'

    // Another tab's own sign-out already wrote its post-sign-out local set.
    const anotherTabsLocalSet = [makeCasefile({ id: 'from-other-tab', stateLabel: 'From another tab' })]
    localStorage.setItem('nm_cases', JSON.stringify(anotherTabsLocalSet))

    mockClient.emitAuthEvent('SIGNED_OUT', null)

    expect(await screen.findByText('From another tab')).toBeInTheDocument()
    expect(mockClient.auth.signOut).not.toHaveBeenCalled()

    // Arriving a second time (our own sign-out's own SIGNED_OUT echo, or
    // another tab's own repeat) must be a no-op, not an error.
    mockClient.emitAuthEvent('SIGNED_OUT', null)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.getByText('From another tab')).toBeInTheDocument()
    expect(mockClient.auth.signOut).not.toHaveBeenCalled()
  })

  it("TOKEN_REFRESHED changes nothing: no migration re-run, no SIGNED_IN-shaped dispatch", async () => {
    // Task 8 fix round 1, Finding 1: `authErr`/`otp`/`authBusy` render on no
    // screen built by this point in the branch (`save-case`/`save-otp`/
    // `save-name` are Tasks 11-13's) — there is genuinely no DOM to assert
    // those three fields against yet. The original version of this test
    // asserted only "migration was not called" after a bare `setTimeout(
    // resolve, 0)` — the reviewer found BOTH of these were real gaps: (1) a
    // single macrotask tick is not reliably enough time for the
    // dispatch -> re-render -> effect-4 cycle to have run, so a mutated
    // TOKEN_REFRESHED handler that WRONGLY re-dispatches SIGNED_IN could
    // still read as "not called yet" at that checkpoint; (2) even with
    // enough time, "migration ran exactly once" cannot distinguish "only
    // the later, correct SIGNED_IN fired" from "the buggy TOKEN_REFRESHED
    // fired FIRST and the later SIGNED_IN's own MIGRATION_STARTED was
    // suppressed by the reducer's own (correct) no-op guard" — both produce
    // an identical migration-call-count of 1.
    //
    // The fix removes the timing dependency entirely rather than widening
    // it: `dispatchedActions` (this file's own reducer-wrapping mock,
    // above) records every action the REAL reducer receives, so instead of
    // inferring what happened from a side effect's call count, this reads
    // the dispatch log directly. `SIGNED_IN` is emitted as a positive
    // control (proving the channel is live) and its own effects are waited
    // on via a reliable positive signal (`migrationSpy` having run) — by
    // that point ANY earlier-queued TOKEN_REFRESHED-driven dispatch would
    // also have been processed (dispatches queued before a render are
    // applied by the reducer in order), so the log is complete.
    const migrationSpy = vi.spyOn(caseSyncModule, 'runSignInMigration')

    render(<App />)
    mockClient.emitAuthEvent('TOKEN_REFRESHED', { user: makeSupabaseUser() })
    // Positive control, emitted right after (not separately awaited first):
    // the subscription channel is genuinely live — a real SIGNED_IN on the
    // same channel does start a migration.
    mockClient.emitAuthEvent('SIGNED_IN', { user: makeSupabaseUser() })
    await waitFor(() => expect(migrationSpy).toHaveBeenCalledTimes(1))

    const signedInDispatches = dispatchedActions.current.filter(a => a.type === 'SIGNED_IN')
    expect(
      signedInDispatches,
      'TOKEN_REFRESHED must not re-dispatch SIGNED_IN — the reducer\'s own MIGRATION_STARTED guard makes a duplicate migration call count alone unable to catch this, since the guard suppresses the second run either way',
    ).toHaveLength(1) // exactly the one from the positive control
    const migrationStartedDispatches = dispatchedActions.current.filter(a => a.type === 'MIGRATION_STARTED')
    expect(migrationStartedDispatches).toHaveLength(1)
  })

  it('USER_UPDATED refreshes the name via SET_USER_NAME, not SIGNED_IN: no migration re-run', async () => {
    // Task 8 fix round 1, Finding 1: same fix as the TOKEN_REFRESHED test
    // above, plus a genuine gap the original version had regardless of
    // timing — its assertions never actually checked that `SET_USER_NAME`
    // was dispatched at all, so a USER_UPDATED handler mutated to a bare
    // no-op (dispatching nothing) passed the old assertions just as well as
    // a correct one; "no migration re-run" is satisfied by BOTH a correct
    // handler and a silently-broken one. The dispatch log closes this: it
    // asserts `SET_USER_NAME` was dispatched, with the right name, exactly
    // once, in addition to the no-extra-SIGNED_IN check.
    const migrationSpy = vi.spyOn(caseSyncModule, 'runSignInMigration')

    render(<App />) // boots signed out — the mount effect contributes nothing
    mockClient.emitAuthEvent('USER_UPDATED', {
      user: makeSupabaseUser({ user_metadata: { display_name: 'Ananya' } }),
    })
    // Positive control, same channel, right after.
    mockClient.emitAuthEvent('SIGNED_IN', { user: makeSupabaseUser() })
    await waitFor(() => expect(migrationSpy).toHaveBeenCalledTimes(1))

    const setUserNameDispatches = dispatchedActions.current.filter(a => a.type === 'SET_USER_NAME')
    expect(
      setUserNameDispatches,
      'USER_UPDATED must refresh the name via SET_USER_NAME — a handler that silently dispatches nothing is indistinguishable from a correct one by migration-call-count alone',
    ).toHaveLength(1)
    expect((setUserNameDispatches[0] as { name: string | null }).name).toBe('Ananya')
    const signedInDispatches = dispatchedActions.current.filter(a => a.type === 'SIGNED_IN')
    expect(
      signedInDispatches,
      'USER_UPDATED must not be handled as SIGNED_IN — that would also clear authErr/otp/authBusy, which Task 4\'s action list reserves for a real sign-in',
    ).toHaveLength(1) // exactly the one from the positive control
  })

  describe("the push effect's gate (design note 7)", () => {
    it("during 'running', a savedCases change triggers no upsert", async () => {
      withSession()
      // select() never resolves during this test — migration stays
      // 'running' for its whole duration.
      let releaseSelect: (v: unknown) => void = () => {}
      selectSpy.mockImplementationOnce(() => new Promise(resolve => { releaseSelect = resolve }))

      render(<App />)
      await waitFor(() => expect(selectSpy).toHaveBeenCalled())

      await saveAPassportCase()

      expect(
        upsertSpy,
        "this would race the migration's own upsert with the pre-migration local set",
      ).not.toHaveBeenCalled()

      // Release the hung promise so nothing leaks a pending update into a
      // later test.
      releaseSelect({ data: [], error: null })
      await waitFor(() => expect(upsertSpy).toHaveBeenCalled())
    })

    it("during 'failed', a savedCases change triggers no upsert", async () => {
      withSession()
      selectSpy.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })

      render(<App />)
      await waitFor(() => expect(selectSpy).toHaveBeenCalled())
      await new Promise(resolve => setTimeout(resolve, 0)) // let migration settle to 'failed'

      await saveAPassportCase()

      expect(upsertSpy).not.toHaveBeenCalled()
    })

    it("only with 'done' does a savedCases change push", async () => {
      withSession()
      selectSpy.mockResolvedValueOnce({ data: [], error: null })

      render(<App />)
      await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1)) // the migration's own (empty) push
      upsertSpy.mockClear() // isolate the signed-in push effect's own call

      await saveAPassportCase()

      await waitFor(() => expect(upsertSpy).toHaveBeenCalledTimes(1))
      const pushedRows = upsertSpy.mock.calls[0][0]
      expect(pushedRows).toHaveLength(1)
    })
  })

  describe('?code= stripping (design note 6)', () => {
    it('a successful exchange: ?code= is removed by history.replaceState and the pathname is preserved', async () => {
      window.history.pushState({}, '', '/?code=abc123')
      withSession()
      selectSpy.mockResolvedValueOnce({ data: [], error: null })

      render(<App />)

      await waitFor(() => {
        if (window.location.search.includes('code=')) throw new Error('code param not stripped yet')
      })
      expect(window.location.pathname).toBe('/')
      expect(window.location.search).toBe('')
    })

    it('a failed exchange: ?code= is STILL removed — gating the strip on success leaves a dead code to retry and fail again on every refresh', async () => {
      window.history.pushState({}, '', '/?code=abc123')
      mockClient.auth.getSession.mockRejectedValueOnce(new Error('exchange failed'))

      render(<App />)

      await waitFor(() => {
        if (window.location.search.includes('code=')) throw new Error('code param not stripped yet')
      })
      expect(
        window.location.pathname,
        'a dead ?code= that survives a failed exchange retries and fails again on every refresh, and the citizen cannot clear it',
      ).toBe('/')
      expect(window.location.search).toBe('')
    })
  })

  // Task 15: a spot-check, not exhaustive coverage — screenCopy.test.tsx's
  // own UiChrome() sweep and AccountChip.test.tsx already prove the chip's
  // OWN behaviour in full; this proves the 25-site WIRING actually reaches
  // real, rendered screens end to end, off a real signed-in App boot, so a
  // partially-wired rollout (a `<Topbar>` site missed, or a stray
  // `state={initialSession}` left on a production site) is caught here even
  // though it would compile clean everywhere else.
  describe('Task 15: the account chip renders on every screen (a spot-check)', () => {
    it('present on Home, on a question screen, and on the casefile screen, while signed in', async () => {
      withSession({ user_metadata: { display_name: 'Ananya' } })
      selectSpy.mockResolvedValueOnce({ data: [], error: null })

      render(<App />)

      // Home.
      await screen.findByRole('heading', { level: 1 })
      expect(document.querySelector('.acct-chip'), 'Home').toBeInTheDocument()

      // A question screen (Passport Q1).
      await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
      expect(document.querySelector('.acct-chip'), 'passport-guardrail').toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
      expect(document.querySelector('.acct-chip'), 'passport-q1').toBeInTheDocument()

      // Save the case, go Home, then open it — the casefile screen.
      await userEvent.click(screen.getByRole('button', { name: /looks negative or confusing/ }))
      await userEvent.click(screen.getByRole('button', { name: /Yes, I filed a formal grievance/ }))
      await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
      await userEvent.click(screen.getByRole('button', { name: UI.saveControl.save }))
      await waitFor(() => expect(upsertSpy).toHaveBeenCalled())
      await userEvent.click(screen.getByRole('button', { name: UI.saveDone.goHome }))
      await userEvent.click(document.querySelector('.saved-card') as HTMLButtonElement)
      // Sanity: genuinely on the casefile screen, not still on Home.
      expect(await screen.findByText(UI.casefile.yourCasefile)).toBeInTheDocument()
      expect(document.querySelector('.acct-chip'), 'the casefile screen').toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Task 17: router wiring finishes the ScreenId union — 'save-case'/
  // 'save-otp'/'save-name' now route (see App.test.tsx's own "Task 13: the
  // four C5 router cases" describe for the per-screen topbar-argument
  // checks). What's left is the whole-flow proof: four real flows through
  // the real router, all against the shared mock, all deterministic (task
  // brief design note 4), plus the SIR phase-drift confirmation (design
  // note 3) and the save detour Task 16 could only half-build (design note,
  // RED item 2).
  // ===========================================================================
  describe('Task 17: whole-flow integration — the real router, start to finish', () => {
    /** Home -> Passport -> a full guardrail/Q1/Q2 flow -> Next Move. Stops
     *  short of Save — every test below picks its own moment to save. */
    async function reachPassportNextMove() {
      await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
      await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
      await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
      await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
      await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    }

    it(
      'phone -> OTP -> name -> done: nothing is saved by the detour itself (Task 16), the case IS saved once the ' +
      'flow completes, the user is set, nm_cases is cleared, and "Back to my case" returns to pendingSave.returnScreen',
      async () => {
        render(<App />)
        await reachPassportNextMove()

        await userEvent.click(screen.getByRole('button', { name: UI.saveControl.save }))
        expect(screen.getByRole('heading', { name: UI.saveCase.headline })).toBeInTheDocument()
        // Fix round 1, Finding 1: a `.saved-card` DOM query here is vacuous
        // — `.saved-card` is only ever emitted by CaseCard, which only
        // Home mounts, and Home isn't mounted while `save-case` is (it's
        // reached via `history`, not a nested render) — so the query
        // returns null unconditionally, even against a mutant where
        // BEGIN_SAVE's signed-out arm calls completeSave and writes the
        // case. The real, discriminating check: while signed out, effect 1
        // (App.tsx:146-149) mirrors `state.savedCases` into `nm_cases` on
        // every render, so read THAT back instead of a DOM node the
        // current screen can't produce either way.
        expect(
          JSON.parse(localStorage.getItem('nm_cases') ?? '[]'),
          'the signed-out detour must not touch savedCases — BEGIN_SAVE\'s own signed-out arm writes no case',
        ).toHaveLength(0)

        await userEvent.type(screen.getByLabelText(UI.saveCase.fieldLabelMobile), '9876543210')
        await userEvent.click(screen.getByRole('button', { name: UI.saveCase.send }))
        expect(mockClient.auth.signInWithOtp).toHaveBeenCalledWith({ phone: '+919876543210' })
        expect(await screen.findByRole('heading', { name: UI.saveOtp.headline })).toBeInTheDocument()

        const supabaseUser = makeSupabaseUser({ id: 'flow-phone-1', phone: '919876543210' })
        mockClient.auth.verifyOtp.mockResolvedValueOnce({ data: { user: supabaseUser }, error: null })
        await userEvent.type(screen.getByLabelText(UI.saveOtp.fieldLabel), '123456')
        await userEvent.click(screen.getByRole('button', { name: UI.saveOtp.verify }))
        expect(await screen.findByRole('heading', { name: UI.saveName.headline })).toBeInTheDocument()

        // The real supabase-js client's own onAuthStateChange notification,
        // firing independently of SaveOtpScreen's own direct SIGNED_IN
        // dispatch above — SaveOtpScreen.test.tsx's own established
        // simulation for this exact reason (its design note 3). The
        // migration runner this notification kicks off calls
        // getSession() for real (fetchRemoteCases/pushCases), so the fake
        // session needs to be armed too, not just the event.
        mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: supabaseUser } }, error: null })
        mockClient.emitAuthEvent('SIGNED_IN', { user: supabaseUser })
        await waitFor(() => expect(dispatchedActions.current.some(a => a.type === 'ADOPT_CASES')).toBe(true))

        await userEvent.type(screen.getByLabelText(UI.saveName.fieldLabel), 'Ananya')
        await userEvent.click(screen.getByRole('button', { name: UI.saveName.saveMidSave }))
        expect(await screen.findByRole('heading', { name: UI.saveDone.headline })).toBeInTheDocument()

        expect(
          dispatchedActions.current.some(
            a => a.type === 'SIGNED_IN' && (a as unknown as { user: { method: string } }).user.method === 'phone',
          ),
        ).toBe(true)
        expect(localStorage.getItem('nm_cases')).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: UI.saveDone.backToCase }))
        expect(screen.getByText(UI.saveControl.savedNote)).toBeInTheDocument()
      },
    )

    it(
      'email -> OTP -> skip name -> done: a case in savedCases, the user set, nm_cases cleared, and save-done rendered',
      async () => {
        render(<App />)
        await reachPassportNextMove()

        await userEvent.click(screen.getByRole('button', { name: UI.saveControl.save }))
        await userEvent.click(screen.getByRole('button', { name: UI.saveCase.switchToEmail }))
        await userEvent.type(screen.getByLabelText(UI.saveCase.fieldLabelEmail), 'citizen@example.com')
        await userEvent.click(screen.getByRole('button', { name: UI.saveCase.send }))
        expect(mockClient.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'citizen@example.com' })
        expect(await screen.findByRole('heading', { name: UI.saveOtp.headline })).toBeInTheDocument()

        const supabaseUser = makeSupabaseUser({ id: 'flow-email-1', email: 'citizen@example.com' })
        mockClient.auth.verifyOtp.mockResolvedValueOnce({ data: { user: supabaseUser }, error: null })
        await userEvent.type(screen.getByLabelText(UI.saveOtp.fieldLabel), '654321')
        await userEvent.click(screen.getByRole('button', { name: UI.saveOtp.verify }))
        expect(await screen.findByRole('heading', { name: UI.saveName.headline })).toBeInTheDocument()

        // Same reasoning as the phone flow above: the migration this
        // notification kicks off calls getSession() for real.
        mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: supabaseUser } }, error: null })
        mockClient.emitAuthEvent('SIGNED_IN', { user: supabaseUser })
        await waitFor(() => expect(dispatchedActions.current.some(a => a.type === 'ADOPT_CASES')).toBe(true))

        // Skip — no name typed (UI.saveName.switchMidSave).
        await userEvent.click(screen.getByRole('button', { name: UI.saveName.switchMidSave }))
        expect(await screen.findByRole('heading', { name: UI.saveDone.headline })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: UI.saveDone.goHome }))
        expect(document.querySelectorAll('.saved-card')).toHaveLength(1)
        expect(localStorage.getItem('nm_cases')).toBeNull()
        expect(document.querySelector('.acct-chip')).toBeInTheDocument()
      },
    )

    it(
      "Google -> straight to done: a citizen already signed in via Google (its account already has a name — " +
      'prototype 2124-2125) never touches save-otp or save-name at all',
      async () => {
        withSession({ app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Ananya' } })
        selectSpy.mockResolvedValueOnce({ data: [], error: null })

        render(<App />)
        await waitFor(() => expect(dispatchedActions.current.some(a => a.type === 'ADOPT_CASES')).toBe(true))
        await reachPassportNextMove()

        await userEvent.click(screen.getByRole('button', { name: UI.saveControl.save }))

        expect(await screen.findByRole('heading', { name: UI.saveDone.headline })).toBeInTheDocument()
        // Asserted on the dispatch HISTORY, not just the endpoint screen —
        // save-otp/save-name's own interaction-only actions were never
        // produced at all, not merely "not currently rendered".
        expect(dispatchedActions.current.filter(a => a.type === 'AUTH_ID_SUBMITTED')).toHaveLength(0)
        expect(dispatchedActions.current.filter(a => a.type === 'SET_PENDING_NAME')).toHaveLength(0)
        expect(screen.queryByRole('heading', { name: UI.saveOtp.headline })).toBeNull()
        expect(screen.queryByRole('heading', { name: UI.saveName.headline })).toBeNull()
        // Fix round 1, Finding 2: `withSession({ app_metadata: { provider:
        // 'google' } })` above was set up but never checked — without this,
        // the test cannot tell "signed in via Google" apart from "any
        // already-signed-in citizen taps Save" (a different flow per the
        // brief). toAppUser (auth.ts:36-37) resolves `method` from
        // `app_metadata.provider`; pin it here the same way the phone/user-B
        // flows above already pin their own `method`/`id`.
        expect(
          dispatchedActions.current.some(
            a => a.type === 'SIGNED_IN' && (a as unknown as { user: { method: string } }).user.method === 'google',
          ),
        ).toBe(true)

        await userEvent.click(screen.getByRole('button', { name: UI.saveDone.goHome }))
        expect(document.querySelectorAll('.saved-card')).toHaveLength(1)
        expect(localStorage.getItem('nm_cases')).toBeNull()
      },
    )

    it(
      "sign out, then sign in as a different user: user A's case is gone and user B's own case is what savedCases now holds",
      async () => {
        withSession({ id: 'user-a', email: 'a@example.com' })
        const caseA = makeCasefile({ id: 'case-a', engineKey: 'passport', stateLabel: "User A's case" })
        selectSpy.mockResolvedValueOnce({ data: [remoteRowFor(caseA, 'user-a')], error: null })

        render(<App />)
        expect(await screen.findByText("User A's case")).toBeInTheDocument()

        mockClient.emitAuthEvent('SIGNED_OUT', null)
        await waitFor(() => expect(document.querySelector('.saved-card')).toBeNull())

        const userB = makeSupabaseUser({ id: 'user-b', email: 'b@example.com' })
        mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: userB } }, error: null })
        const caseB = makeCasefile({ id: 'case-b', engineKey: 'voter', stateLabel: "User B's case" })
        selectSpy.mockResolvedValueOnce({ data: [remoteRowFor(caseB, 'user-b')], error: null })

        mockClient.emitAuthEvent('SIGNED_IN', { user: userB })

        expect(await screen.findByText("User B's case")).toBeInTheDocument()
        expect(screen.queryByText("User A's case")).toBeNull()
        expect(document.querySelectorAll('.saved-card')).toHaveLength(1)
        expect(localStorage.getItem('nm_cases')).toBeNull()
        expect(
          // AppUser.id is u.phone||u.email (D7, auth.ts) — never the raw
          // Supabase UUID — so this checks the SAME identifier maskId/
          // AccountChip would render, not user_b's underlying row id.
          dispatchedActions.current.some(
            a => a.type === 'SIGNED_IN' && (a as unknown as { user: { id: string } }).user.id === 'b@example.com',
          ),
        ).toBe(true)
      },
    )

    it(
      'design note 3 — SIR phase-drift confirmation: adopting a server case whose sirPhaseId is stale still fires ' +
      'the drift interstitial when opened, proving OPEN_CHECKIN -> loadCaseFragment -> phaseDriftFor never cared ' +
      'where the case came from',
      async () => {
        withSession({ id: 'sir-user' })
        const staleCase = makeCasefile({
          id: 'sir-1', engineKey: 'sir', serviceLabel: UI.serviceLabel.sir, returnScreen: 'sir-nextmove',
          answers: { sirState: 'delhi', sirQ1: 'roll_present' }, stateLabel: 'SIR case', sirPhaseId: 'some_other_phase',
        })
        selectSpy.mockResolvedValueOnce({ data: [remoteRowFor(staleCase, 'sir-user')], error: null })

        render(<App />)
        expect(await screen.findByText('SIR case')).toBeInTheDocument()

        await userEvent.click(document.querySelector('.saved-card') as HTMLButtonElement)

        expect(screen.getByText(UI.casefile.phaseDriftKicker)).toBeInTheDocument()
        expect(screen.getByText(UI.casefile.phaseDriftTitle)).toBeInTheDocument()
      },
    )
  })

  // =============================================================================
  // Task 19 (post-Task-18 fix) — Google sign-in loses a pending save across
  // the REAL OAuth redirect. Confirmed live: signInWithGoogle performs a
  // genuine full-page navigation, resetting every in-memory value including
  // pendingSave/answers/prepChecks. The fix snapshots those to sessionStorage
  // (PENDING_GOOGLE_SAVE_KEY) right before the redirect and resumes them on
  // the next mount via a new RESUME_PENDING_SAVE action, once a signed-in
  // session actually comes back.
  // =============================================================================
  describe('Task 19 fix: Google sign-in resumes a pending save that survives the real OAuth redirect', () => {
    it(
      'reproduces the live bug and proves the fix: a sessionStorage snapshot written right before a Google ' +
      'redirect resumes into a real saved case once a signed-in Google session comes back on the next boot — ' +
      'without the fix, RESUME_PENDING_SAVE never dispatches and savedCases stays empty, exactly what was found ' +
      'live (localStorage.getItem(\'nm_cases\') === null, no case, "0 open")',
      async () => {
        sessionStorage.setItem(PENDING_GOOGLE_SAVE_KEY, JSON.stringify({
          engineKey: 'passport',
          serviceLabel: UI.serviceLabel.passport,
          returnScreen: 'passport-nextmove',
          answers: { q1: 'adverse', q2: 'informal' },
          prepChecks: {},
          // Whole-branch review (2026-09-09 fix wave), Finding 3: every real
          // snapshot handleGoogle writes now always carries these three
          // fields too — parsePendingGoogleSaveSnapshot rejects a snapshot
          // missing them (session.ts's own doc comment on that function).
          caseFacts: [],
          appliedText: null,
          interpProvenance: null,
        }))
        withSession({ app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Ananya' } })
        selectSpy.mockResolvedValueOnce({ data: [], error: null })

        render(<App />)

        // The discriminating assertion: without the fix this dispatch never
        // happens at all — no mock, no timing coincidence, the real action
        // this fix adds either fires or it doesn't. `waitFor` times out
        // (not merely returns false) against the unfixed code, which is
        // exactly the RED this task's TDD discipline requires.
        await waitFor(() => expect(dispatchedActions.current.some(a => a.type === 'RESUME_PENDING_SAVE')).toBe(true))
        expect(await screen.findByRole('heading', { name: UI.saveDone.headline })).toBeInTheDocument()
        // Cleared once the resume attempt fires — must not replay on a
        // later boot in the same tab.
        expect(sessionStorage.getItem(PENDING_GOOGLE_SAVE_KEY)).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: UI.saveDone.goHome }))
        expect(document.querySelectorAll('.saved-card')).toHaveLength(1)
        // Signed in: the case lives in savedCases/the server, never
        // nm_cases — same assertion shape the existing Google flow test
        // above uses.
        expect(localStorage.getItem('nm_cases')).toBeNull()
      },
    )

    it(
      'Task 19 regression pin — a normal boot with no pending-Google-save snapshot in sessionStorage dispatches ' +
      'no RESUME_PENDING_SAVE at all (additive-only: this fix must not change any existing boot behaviour)',
      async () => {
        withSession({ app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Ananya' } })
        selectSpy.mockResolvedValueOnce({ data: [], error: null })

        render(<App />)
        await waitFor(() => expect(dispatchedActions.current.some(a => a.type === 'ADOPT_CASES')).toBe(true))

        expect(dispatchedActions.current.some(a => a.type === 'RESUME_PENDING_SAVE')).toBe(false)
        expect(document.querySelectorAll('.saved-card')).toHaveLength(0)
      },
    )

    it(
      'a corrupt sessionStorage snapshot does not throw, resumes nothing, and is still cleared so it cannot ' +
      'replay on a later boot',
      async () => {
        sessionStorage.setItem(PENDING_GOOGLE_SAVE_KEY, '{not valid json')
        withSession({ app_metadata: { provider: 'google' } })
        selectSpy.mockResolvedValueOnce({ data: [], error: null })

        render(<App />)
        await waitFor(() => expect(dispatchedActions.current.some(a => a.type === 'ADOPT_CASES')).toBe(true))

        expect(dispatchedActions.current.some(a => a.type === 'RESUME_PENDING_SAVE')).toBe(false)
        expect(document.querySelectorAll('.saved-card')).toHaveLength(0)
        expect(sessionStorage.getItem(PENDING_GOOGLE_SAVE_KEY)).toBeNull()
        // Nothing crashed — Home is fully rendered, not stuck.
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
      },
    )

    it(
      'fix round 1, Finding 1: the migration genuinely SETTLES (ADOPT_CASES reaches the reducer) BEFORE the mount ' +
      'effect\'s own `getCurrentUser()` continuation ever runs — the real-browser-expected ordering the reviewer ' +
      'flagged (gotrue notifies onAuthStateChange subscribers as part of the SAME initialization getSession() ' +
      'awaits) — and the resumed save must still survive it: pre-fix, effect 5 fires once migration settles, ' +
      'reads a still-null pendingResumeRef, and never re-runs (keyed only on state.migration, which does not ' +
      'change value again) — the resumed save is silently lost, in a narrower window than the already-fixed ' +
      '(mount-effect-vs-onAuthChange) race',
      async () => {
        sessionStorage.setItem(PENDING_GOOGLE_SAVE_KEY, JSON.stringify({
          engineKey: 'passport',
          serviceLabel: UI.serviceLabel.passport,
          returnScreen: 'passport-nextmove',
          answers: { q1: 'adverse', q2: 'informal' },
          prepChecks: {},
          // Whole-branch review (2026-09-09 fix wave), Finding 3: every real
          // snapshot handleGoogle writes now always carries these three
          // fields too — parsePendingGoogleSaveSnapshot rejects a snapshot
          // missing them (session.ts's own doc comment on that function).
          caseFacts: [],
          appliedText: null,
          interpProvenance: null,
        }))
        const user = makeSupabaseUser({ app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Ananya' } })
        // Delay ONLY the mount effect's own getCurrentUser() call (the
        // FIRST getSession() invocation, made synchronously as soon as
        // effect 2 runs) — migration's own fetchRemoteCases/pushCases
        // (caseSync.ts) call getSession() too and must resolve normally, so
        // the migration can genuinely settle to 'done' WHILE the mount
        // effect's own continuation is still stuck, reproducing the exact
        // ordering the reviewer describes rather than merely hoping for it.
        let releaseMountGetSession: (v: unknown) => void = () => {}
        mockClient.auth.getSession.mockImplementationOnce(
          () => new Promise(resolve => { releaseMountGetSession = resolve }),
        )
        mockClient.auth.getSession.mockResolvedValue({ data: { session: { user } }, error: null })
        selectSpy.mockResolvedValueOnce({ data: [], error: null })

        render(<App />)
        // Fires synchronously via onAuthChange (effect 3) — independent of
        // the mount effect's own still-pending getCurrentUser() call above.
        // Same emission technique as the double-fire test (c) above (this
        // file's own established pattern), but here the mount effect's OWN
        // continuation is held open rather than merely racing it.
        mockClient.emitAuthEvent('SIGNED_IN', { user })

        // The migration genuinely settles — ADOPT_CASES reaches the
        // reducer — while the mount effect's own getCurrentUser() is still
        // unresolved.
        await waitFor(() => expect(dispatchedActions.current.some(a => a.type === 'ADOPT_CASES')).toBe(true))

        // Only now does the mount effect's own getSession() resolve.
        releaseMountGetSession({ data: { session: { user } }, error: null })

        await waitFor(() => expect(dispatchedActions.current.some(a => a.type === 'RESUME_PENDING_SAVE')).toBe(true))
        expect(await screen.findByRole('heading', { name: UI.saveDone.headline })).toBeInTheDocument()
        expect(sessionStorage.getItem(PENDING_GOOGLE_SAVE_KEY)).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: UI.saveDone.goHome }))
        expect(document.querySelectorAll('.saved-card')).toHaveLength(1)
        expect(localStorage.getItem('nm_cases')).toBeNull()
      },
    )

    it(
      'the phone save-flow is provably untouched by this fix — rerun (not just trusted) unmodified: phone -> OTP ' +
      '-> name -> done still lands the case in savedCases with no sessionStorage involvement at all',
      async () => {
        render(<App />)
        await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
        await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
        await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
        await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
        await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
        await userEvent.click(screen.getByRole('button', { name: UI.saveControl.save }))

        await userEvent.type(screen.getByLabelText(UI.saveCase.fieldLabelMobile), '9876543210')
        await userEvent.click(screen.getByRole('button', { name: UI.saveCase.send }))
        expect(mockClient.auth.signInWithOtp).toHaveBeenCalledWith({ phone: '+919876543210' })
        expect(await screen.findByRole('heading', { name: UI.saveOtp.headline })).toBeInTheDocument()

        // The Google-only mechanism this task adds never fires for phone.
        expect(sessionStorage.getItem(PENDING_GOOGLE_SAVE_KEY)).toBeNull()

        const supabaseUser = makeSupabaseUser({ id: 'task19-phone-1', phone: '919876543210' })
        mockClient.auth.verifyOtp.mockResolvedValueOnce({ data: { user: supabaseUser }, error: null })
        await userEvent.type(screen.getByLabelText(UI.saveOtp.fieldLabel), '123456')
        await userEvent.click(screen.getByRole('button', { name: UI.saveOtp.verify }))
        expect(await screen.findByRole('heading', { name: UI.saveName.headline })).toBeInTheDocument()

        mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: supabaseUser } }, error: null })
        mockClient.emitAuthEvent('SIGNED_IN', { user: supabaseUser })
        await waitFor(() => expect(dispatchedActions.current.some(a => a.type === 'ADOPT_CASES')).toBe(true))

        await userEvent.click(screen.getByRole('button', { name: UI.saveName.switchMidSave }))
        expect(await screen.findByRole('heading', { name: UI.saveDone.headline })).toBeInTheDocument()
        expect(dispatchedActions.current.some(a => a.type === 'RESUME_PENDING_SAVE')).toBe(false)
        expect(sessionStorage.getItem(PENDING_GOOGLE_SAVE_KEY)).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: UI.saveDone.goHome }))
        expect(document.querySelectorAll('.saved-card')).toHaveLength(1)
      },
    )
  })
})

// =============================================================================
// C8 Task 16: the "You wrote" row (FR-AI-04)
// =============================================================================
describe('C8 Task 16: appliedText/caseFacts reach the real Diagnosis screen (production site: App.tsx wiring)', () => {
  // DescribeScreen/InterpConfirmScreen aren't wired into App.tsx's router
  // yet (that's a later task's job — see grep -rln "InterpConfirmScreen|
  // DescribeScreen" src, which finds no App.tsx hit), so there is no
  // click-through path to a real appliedText/caseFacts yet. Seeding
  // straight into session state (the same seededState mechanism the
  // no-plan-guard and TOKEN_REFRESHED tests above already use) proves the
  // real wiring — App.tsx's three DiagnosisScreen mount sites passing
  // state.appliedText/state.caseFacts through — without waiting on that
  // later task.
  it('passport-diagnosis, seeded with real appliedText + a real fact, renders the "You wrote" row', () => {
    seededState.current = {
      screen: 'passport-diagnosis',
      answers: { q1: 'no_contact', q2: 'no_followup' },
      trustOpen: true,
      appliedText: 'Police came to my house in June, I called the office twice since',
      caseFacts: [
        { kind: 'reference_number', refType: 'passport_file_no', label: 'File Number', value: 'BN1068334517807', fills: '[File Number / ARN]' },
      ],
    }
    render(<App />)
    expect(screen.getByText(UI.interp.youWrote)).toBeInTheDocument()
    expect(screen.getByText(/Police came to my house in June, I called the office twice since/)).toBeInTheDocument()
    expect(screen.getByText(`${UI.trust.detailsKeptFrom} File Number BN1068334517807`)).toBeInTheDocument()
  })

  it('passport-diagnosis with the ordinary appliedText: null seed renders no "You wrote" row (regression: the default flow is unaffected)', () => {
    seededState.current = {
      screen: 'passport-diagnosis',
      answers: { q1: 'no_contact', q2: 'no_followup' },
      trustOpen: true,
    }
    render(<App />)
    expect(screen.queryByText(UI.interp.youWrote)).toBeNull()
  })
})

// =============================================================================
// C8 Task 17 — the router wiring, the flag's OFF state, the whole-flow
// integration tests, and the scope-exclusion regression pins.
//
// This is the task that closes the build window: 'interp-confirm' was the
// last `ScreenId` member without a router case, and App.tsx's own
// `const _never: never = state.screen` is what has been failing `tsc -b`
// since Task 6. Everything below drives the REAL router (`render(<App/>)`)
// rather than mounting a component directly — every requirement asserted
// here spans more than one module, and a direct mount would prove only that
// the module works in isolation, which its own task already proved.
//
// NO PROVIDER IS MOCKED anywhere in this section. Design note 5 is explicit
// that the six flows run "all against the simulator, all deterministic," and
// a mocked interpretation would prove nothing about the enum/span/verbatim
// gates it has to pass on the way through.
// =============================================================================

/** The feature ships OFF (featureFlags.ts: an allowlist of exactly `'on'`),
 *  so an ON test has to say so. Both are spelled out at every call site
 *  rather than hoisted into a `beforeEach`: which state the flag is in is
 *  the SUBJECT of half the tests below, never incidental setup.
 *  `afterEach`'s `vi.unstubAllEnvs()` (top of this file) stops either
 *  leaking. */
const flagOn = () => { vi.stubEnv('VITE_DESCRIBE_IT', 'on') }
const flagOff = () => { vi.stubEnv('VITE_DESCRIBE_IT', 'off') }

/** The sequence of screens the router ACTUALLY RENDERED, oldest first.
 *  `<App/>` is a `useReducer` whose body switches on `state.screen` and
 *  nothing else, so every committed reducer result is a render — which makes
 *  this a genuine render history, not a proxy for one. Design note 5's
 *  smart-skip flow asks for exactly this: "assert the skip on the render
 *  history, not just the endpoint." */
function renderedScreens(): ScreenId[] {
  const initial = (seededState.current?.screen ?? 'home') as ScreenId
  return [initial, ...reducerStates.current.map(s => s.screen)]
}

/** The most recent state the real reducer returned — the only way to read
 *  session state from outside `<App/>`, which deliberately exposes none. */
function latestState(): SessionState {
  const states = reducerStates.current
  // Throws rather than `expect`-ing: this helper is called from inside tests
  // that pin their own `expect.assertions(n)` count (the I11 pin below), and
  // an assertion hidden in a helper would inflate that count and silently
  // weaken the pin.
  if (states.length === 0) throw new Error('latestState(): no action has been dispatched yet — there is no state to read')
  return states[states.length - 1]
}

/** Open the describe box on whichever question screen is rendered. The row's
 *  accessible name is `rowLead` + `rowStrong` — two registered entries, one
 *  button (DescribeBlock design note 1). */
async function openDescribeBox() {
  await userEvent.click(screen.getByRole('button', { name: `${UI.describe.rowLead}${UI.describe.rowStrong}` }))
}

/** Fill the box from one of the REAL registered example stories (the chip's
 *  own `aria-label` carries the full text — DescribeBlock design note 8) and
 *  run the interpretation. */
async function runStoryChip(story: string) {
  await userEvent.click(screen.getByRole('button', { name: story }))
  await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
}

/** Same, for a story typed by hand rather than picked off a chip — used where
 *  a flow needs an input no registered example produces. The textarea is
 *  fully controlled off `state.describeText`, so this is one real
 *  `SET_DESCRIBE_TEXT` per keystroke, exactly like a citizen typing. */
async function runTypedStory(text: string) {
  await userEvent.type(screen.getByRole('textbox', { name: UI.describe.ariaLabel }), text)
  await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
}

/** Home -> Passport -> "No, still waiting on it" -> `passport-q1`. */
async function toPassportQ1() {
  await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
  await userEvent.click(screen.getByRole('button', { name: PASSPORT_COPY.guardrail.no }))
}

/** The ONE hand-built `ActiveInterpretation` in this file. Every other
 *  interpretation below is produced by the real simulator through the real
 *  router; this one exists solely for the flag-OFF redirect tests, which
 *  cannot produce one at all (with the flag off `runInterpretation` refuses
 *  and `DescribeBlock` renders nothing — that IS the test). The `__gated`
 *  brand is cast exactly the way `interactionGated.test.tsx` and
 *  `session.test.ts` already cast it: the brand's job is to stop PRODUCTION
 *  code forging a gated value, and a test fixture is not production code. */
function makeInterp(over: Partial<ActiveInterpretation> = {}): ActiveInterpretation {
  return {
    __gated: 'test-only' as unknown as GatedInterpretation['__gated'],
    mappings: [{
      questionId: 'q1', value: 'no_contact', span: 'nothing has moved',
      optionValues: ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'],
    }],
    discarded: [], facts: [], droppedSensitive: false, unplaceable: false,
    provenance: 'simulated (local matcher)',
    ctxScreen: 'passport-q1', engine: 'passport', service: UI.serviceLabel.passport,
    text: 'nothing has moved since I filed',
    ...over,
  }
}

/** The six describe-it entry screens — `DESCRIBE_CHAINS`' own key set
 *  (domain/interpret.ts's `DescribeEntryScreenId` union), never a hand-picked
 *  subset — with the minimum answers each needs to render at all, and the
 *  headline that proves it really did. */
const ENTRY_SCREENS: [ScreenId, Partial<SessionState>, string][] = [
  ['passport-q1', { answers: { guardrail: 'no' } }, PASSPORT_COPY.q1.headline],
  ['passport-q2', { answers: { guardrail: 'no', q1: 'no_contact' } }, PASSPORT_COPY.q2.headline],
  ['voter-entry', { answers: {} }, VOTER_COPY.entry.headline],
  ['voter-q1', { answers: {} }, VOTER_COPY.q1.headline],
  ['voter-q2', { answers: { voterQ1: 'decision' } }, VOTER_COPY.q2.headline],
  ['sir-q1', { answers: { sirState: 'delhi' } }, SIR_COPY.q1.headline],
]

describe("C8 Task 17: the 'interp-confirm' router case", () => {
  it('routes a MAPPED interpretation to the confirm screen with topbar(true, false) — Back visible, Restart absent (prototype 3089)', async () => {
    flagOn()
    render(<App />)
    await toPassportQ1()
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['passport-q1'].one)

    expect(await screen.findByRole('heading', { level: 1, name: UI.interp.headline })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.topbar.back })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.topbar.restart })).toBeNull()
    // The unplaceable sibling mounted alongside it rendered nothing.
    expect(screen.queryByText(UI.unplaceable.headline)).toBeNull()
  })

  it('routes an UNPLACEABLE interpretation to the panel with topbar(true, false) — the same arguments in BOTH branches (prototype 3047)', async () => {
    flagOn()
    render(<App />)
    await toPassportQ1()
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['passport-q1'].two)

    expect(await screen.findByRole('heading', { level: 1, name: UI.unplaceable.headline })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.topbar.back })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.topbar.restart })).toBeNull()
    // The mapped sibling rendered nothing: the two guards are exact
    // complements, so exactly one component ever produces output for any
    // given `state.interp` — which is what makes mounting both as siblings
    // a composition rather than a double render.
    expect(screen.queryByText(UI.interp.headline)).toBeNull()
  })

  it("guard 1: 'interp-confirm' reached with no interpretation renders Home", () => {
    flagOn()
    seededState.current = { screen: 'interp-confirm', interp: null }
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByText(UI.interp.headline)).toBeNull()
    expect(screen.queryByText(UI.unplaceable.headline)).toBeNull()
  })

  it(
    'I11 — the no-interpretation guard is NON-DESTRUCTIVE. The prototype\'s answer here is `restart()` (3039), which in ' +
    "this codebase wipes the citizen's whole working case. Arriving with no interpretation is a stale route, not a reason " +
    'to destroy their work — and a dispatch in a render-phase switch is not legal here anyway',
    async () => {
      expect.assertions(6)
      flagOn()
      // A citizen mid-journey: answers given, a prepare plan open, steps
      // ticked, a draft edited, a working case built. This is not a contrived
      // shape — `APPLY_INTERPRETATION` and `UNPLACEABLE_PICK` both push
      // 'interp-confirm' onto `history` in the SAME transition that nulls
      // `interp` (session.ts says so at both arms), so BACK genuinely lands
      // here in exactly this state on an ordinary, successful journey.
      const answers = { guardrail: 'no', q1: 'contacted_incomplete', q2: 'informal' }
      const prepChecks = { 0: true, 2: true }
      const prepDraft = 'my own edited draft, half written'
      const workingCase: Casefile = {
        engineKey: 'passport', serviceLabel: UI.serviceLabel.passport, returnScreen: 'passport-prepare',
        answers, prepChecks, savedAt: 1_700_000_000_000,
        stateLabel: 'Followed up informally, unresolved', rec: 'FOLLOW_UP',
        whatShort: 'Move to a formal Grievance / CPGRAMS filing',
        stepsTotal: 5, stepsDone: 2, sirPhaseId: null,
        caseFacts: [], appliedText: null, interpProvenance: null,
        id: 'working', outcome: 'still_open', lastCheck: null, remindAt: null, log: [],
      }
      seededState.current = {
        screen: 'interp-confirm', interp: null, answers, prepChecks, prepDraft, workingCase,
        activeCaseId: 'working',
      }
      render(<App />)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
      // Checked BEFORE anything else touches the reducer: the guard renders,
      // it does not dispatch. Under the prototype's `restart()` this is
      // `[{ type: 'RESTART' }]`.
      expect(dispatchedActions.current, 'the guard must dispatch NOTHING during the render').toEqual([])

      // Read the live state back through one action documented to touch none
      // of these four fields (NAVIGATE's own clear set is
      // trustOpen/restartConfirm/removeConfirm/authErr/acctOpen and nothing
      // else). Without this step the four assertions below would be
      // tautological — with zero dispatches there is no reducer result to
      // read, and comparing the seed to itself proves nothing.
      await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
      // Reference identity, not deep equality: `RESTART` replaces each of
      // these with `initialSession`'s own value, and a deep-equal check
      // could still pass against a rebuilt copy.
      expect(latestState().answers).toBe(answers)
      expect(latestState().prepChecks).toBe(prepChecks)
      expect(latestState().prepDraft).toBe(prepDraft)
      expect(latestState().workingCase).toBe(workingCase)
    },
  )
})

describe('C8 Task 17: the flag OFF, proven end to end (design note 3)', () => {
  it.each(ENTRY_SCREENS)(
    'with the flag OFF, %s renders its own question screen and NO describe row',
    (screenId, seed, headline) => {
      flagOff()
      seededState.current = { screen: screenId, ...seed }
      render(<App />)
      // The screen itself really did render — without this the absence
      // assertion below would pass for a screen that failed to render at all.
      expect(screen.getByRole('heading', { name: headline })).toBeInTheDocument()
      expect(document.querySelector('.describe-entry')).toBeNull()
      expect(screen.queryByRole('button', { name: `${UI.describe.rowLead}${UI.describe.rowStrong}` })).toBeNull()
    },
  )

  it.each(ENTRY_SCREENS)(
    'the positive control: with the flag ON, %s DOES render the describe row (so the OFF assertions above are not vacuous)',
    (screenId, seed, headline) => {
      flagOn()
      seededState.current = { screen: screenId, ...seed }
      render(<App />)
      expect(screen.getByRole('heading', { name: headline })).toBeInTheDocument()
      expect(document.querySelector('.describe-entry')).toBeInTheDocument()
    },
  )

  // Fix round 1 (reviewer finding): the mount/unmount loop below never
  // clicks anything, and `runInterpretation`'s only call site is
  // `DescribeBlock`'s "Read my situation" button handler — so the ORIGINAL
  // version of this test passed even with `describeItEnabled()` forced to
  // always return `true`, because nothing here was ever going to reach that
  // handler regardless of the flag. The loop still proves something real
  // (no MOUNT-TIME effect on any of the six entry screens calls it, flag
  // off) so it stays, but it is not "the" flag-driven proof this test's own
  // name claimed. The row being structurally absent when off is already the
  // OTHER off-state test above (`renders its own question screen and NO
  // describe row`), so there is no DOM path left here to click through —
  // the flag-driven proof has to be a DIRECT call to the orchestrator, flag
  // off, the same call the button handler would make if it could reach one.
  // `interpretation.test.ts` already pins this at the unit level; this pins
  // it again at the App-test-suite level, so the suite carries its own real
  // proof rather than relying on a comment pointing elsewhere.
  it("with the flag OFF, runInterpretation refuses with reason 'disabled' before ever calling the provider — and genuinely reaches it once the flag is ON", async () => {
    const spy = vi.spyOn(interpretationModule, 'runInterpretation')
    flagOff()

    // No mount-time effect on any of the six entry screens ever calls it.
    for (const [screenId, seed] of ENTRY_SCREENS) {
      seededState.current = { screen: screenId, ...seed }
      const { unmount } = render(<App />)
      unmount()
    }
    expect(spy).not.toHaveBeenCalled()

    // THE flag-driven proof: call the orchestrator directly, flag still
    // off — exactly what `DescribeBlock`'s click handler would call. Under
    // `describeItEnabled()` forced to always return `true` this would fall
    // through the disabled check and reach `simProvider.interpret`, so both
    // assertions below genuinely fail under that mutation.
    const providerSpy = vi.spyOn(simProvider, 'interpret')
    const result = await interpretationModule.runInterpretation('passport-q1', {}, 'nothing has moved since I filed')
    expect(result).toEqual({ ok: false, reason: 'disabled' })
    expect(providerSpy).not.toHaveBeenCalled()

    // The positive control, in the SAME test so the refusal above is
    // provably a fact about the flag and not about the spies: flip the flag
    // on, drive the one entry point that exists through the real router and
    // DOM, and watch it reach the orchestrator exactly once.
    spy.mockClear()
    seededState.current = undefined
    flagOn()
    render(<App />)
    await toPassportQ1()
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['passport-q1'].one)
    await screen.findByRole('heading', { level: 1, name: UI.interp.headline })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("with the flag OFF, 'interp-confirm' redirects Home — a route created while the flag was on can never serve a feature that is no longer there", () => {
    flagOff()
    seededState.current = { screen: 'interp-confirm', interp: makeInterp() }
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByText(UI.interp.headline)).toBeNull()
  })

  it("with the flag OFF, an UNPLACEABLE 'interp-confirm' redirects Home too — the guard is on the route, not on one branch of it", () => {
    flagOff()
    seededState.current = { screen: 'interp-confirm', interp: makeInterp({ unplaceable: true, mappings: [] }) }
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByText(UI.unplaceable.headline)).toBeNull()
  })
})

describe("C8 Task 17: AC-AI-1 at full-flow scale (design note 4 — Task 7's named hand-off)", () => {
  it('nothing reaches state.answers until "Use these answers" is clicked: the answers on the confirm screen are REFERENCE-identical to the ones before the interpretation ran', async () => {
    flagOn()
    render(<App />)
    await toPassportQ1()
    const answersBefore = latestState().answers
    expect(answersBefore).toEqual({ guardrail: 'no' })

    await openDescribeBox()
    await runStoryChip(UI.describe.examples['passport-q1'].one)
    await screen.findByRole('heading', { level: 1, name: UI.interp.headline })

    // The whole of AC-AI-1: typing, interpreting, gating and landing on the
    // confirm screen wrote nothing at all. `toBe`, not `toEqual` — an equal
    // COPY would mean something rebuilt the record, which is exactly the
    // class of write this assertion exists to forbid.
    expect(latestState().answers).toBe(answersBefore)

    // ...and the check is not vacuous: the click DOES write.
    await userEvent.click(screen.getByRole('button', { name: UI.interp.useTheseAnswers }))
    expect(latestState().answers).not.toBe(answersBefore)
    expect(latestState().answers).toEqual({ guardrail: 'no', q1: 'contacted_incomplete', q2: 'informal' })
  })
})

// -----------------------------------------------------------------------------
// Design note 5 — the six full-flow integration tests. Every one runs against
// the REAL simulator through the REAL router, and every claimed mapping below
// was verified by running `runInterpretation` against the registered story
// before the assertion was written, never assumed from the brief.
// -----------------------------------------------------------------------------

/** The confirm screen's card for one question, found by its own `.read-q`
 *  label rather than by index — a card list that changes length under a
 *  repick (flow 4) must not silently re-point an assertion at a different
 *  question. */
function interpCard(questionLabel: string): HTMLElement {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.read-card'))
  const found = cards.find(c => c.querySelector('.read-q')?.textContent === questionLabel)
  if (!found) throw new Error(`no confirm card for question "${questionLabel}"`)
  return found
}

describe('C8 Task 17, flow 1: passport, two questions from one story — FR-AI-03 smart skip', () => {
  it('the first passport story maps q1 AND q2, so "Use these answers" lands on the diagnosis and passport-q2 is NEVER rendered', async () => {
    flagOn()
    render(<App />)
    await toPassportQ1()
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['passport-q1'].one)
    await screen.findByRole('heading', { level: 1, name: UI.interp.headline })

    // Both questions really were read from the one story — verified against
    // the real simulator, not assumed: q1 'contacted_incomplete' (span
    // "Police came") and q2 'informal' (span "called").
    expect(document.querySelectorAll('.read-card')).toHaveLength(2)
    expect(interpCard(UI.interp.qLabel.q1)).toHaveTextContent(PASSPORT_Q1_LABELS.contacted_incomplete)
    expect(interpCard(UI.interp.qLabel.q2)).toHaveTextContent(PASSPORT_Q2_LABELS.informal)

    await userEvent.click(screen.getByRole('button', { name: UI.interp.useTheseAnswers }))

    const d = diagnose(passportEngine, { guardrail: 'no', q1: 'contacted_incomplete', q2: 'informal' })
    expect(screen.getByText(d.dependency)).toBeInTheDocument()
    expect(latestState().screen).toBe('passport-diagnosis')
    expect(latestState().answers).toEqual({ guardrail: 'no', q1: 'contacted_incomplete', q2: 'informal' })

    // THE SKIP, asserted on the render history rather than the endpoint: a
    // final screen of 'passport-diagnosis' is equally consistent with a
    // journey that DID render Q2 and moved on. This is not.
    expect(renderedScreens()).not.toContain('passport-q2')
    expect(renderedScreens()).toContain('interp-confirm')
    expect(screen.queryByRole('heading', { name: PASSPORT_COPY.q2.headline })).toBeNull()
  })
})

describe('C8 Task 17, flow 2: the wrong reading, caught — FR-AI-06', () => {
  it('the "someone from the passport office called me" story is read as the CITIZEN having called; correcting it on the confirm screen changes the diagnosis that actually renders', async () => {
    flagOn()
    render(<App />)
    await toPassportQ1()
    // Tap Q1 normally, so the describe box is entered from passport-q2 —
    // the entry screen this flow is about.
    await userEvent.click(screen.getByRole('button', { name: PASSPORT_Q1_LABELS.contacted_incomplete }))
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['passport-q2'].two)
    await screen.findByRole('heading', { level: 1, name: UI.interp.headline })

    // The deliberate flaw (simInterpreter.ts's own "DO NOT FIX THIS RULE"
    // note): "called me" is read as the CITIZEN having called.
    expect(interpCard(UI.interp.qLabel.q2)).toHaveTextContent(PASSPORT_Q2_LABELS.informal)

    // The two diagnoses genuinely differ — asserted before the correction,
    // so "the correction reached the diagnosis" cannot be satisfied by two
    // identical outcomes.
    const dWrong = diagnose(passportEngine, { guardrail: 'no', q1: 'contacted_incomplete', q2: 'informal' })
    const dRight = diagnose(passportEngine, { guardrail: 'no', q1: 'contacted_incomplete', q2: 'no_followup' })
    expect(dRight.ruleId).not.toBe(dWrong.ruleId)
    expect(dRight.dependency).not.toBe(dWrong.dependency)

    // q2 is the question the citizen just came from, so D12 collapses it to
    // a label plus a Change control (never a lone label with no way back).
    await userEvent.click(within(interpCard(UI.interp.qLabel.q2)).getByRole('button', { name: UI.interp.change }))
    await userEvent.click(
      within(interpCard(UI.interp.qLabel.q2)).getByRole('button', { name: PASSPORT_Q2_LABELS.no_followup }),
    )
    await userEvent.click(screen.getByRole('button', { name: UI.interp.useTheseAnswers }))

    expect(latestState().screen).toBe('passport-diagnosis')
    expect(latestState().answers.q2).toBe('no_followup')
    expect(screen.getByText(dRight.dependency)).toBeInTheDocument()
    expect(screen.queryByText(dWrong.dependency)).toBeNull()
  })
})

describe('C8 Task 17, flow 3: the hard story lands on the unplaceable panel — FR-AI-06', () => {
  it('the "my agent said he will handle everything" story maps nothing, keeps the text, and a direct pick routes exactly as a normal tap would', async () => {
    flagOn()
    render(<App />)
    await toPassportQ1()
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['passport-q1'].two)
    await screen.findByRole('heading', { level: 1, name: UI.unplaceable.headline })

    // Text preserved, verbatim, and no mapping was forced.
    expect(document.querySelector('.youwrote-text')).toHaveTextContent(UI.describe.examples['passport-q1'].two)
    expect(latestState().interp?.mappings).toEqual([])
    expect(latestState().interp?.unplaceable).toBe(true)

    // The offered question is the first UNANSWERED one in the chain — q1,
    // since only `guardrail` is answered — and picking from its real closed
    // list routes exactly where PassportQ1's own onSelect would.
    expect(document.querySelector('.unplace-panel .read-q')).toHaveTextContent(UI.interp.qLabel.q1)
    await userEvent.click(
      within(document.querySelector('.unplace-panel') as HTMLElement)
        .getByRole('button', { name: PASSPORT_Q1_LABELS.no_contact }),
    )

    expect(latestState().screen).toBe('passport-q2')
    expect(screen.getByRole('heading', { name: PASSPORT_COPY.q2.headline })).toBeInTheDocument()
    expect(latestState().answers.q1).toBe('no_contact')
    // The text and provenance carried across the pick (UNPLACEABLE_PICK
    // re-applies them AFTER the answer write, which would otherwise clear
    // them). This particular story yields no facts at all, which is why the
    // fact-bearing variant below exists rather than letting an empty
    // `caseFacts` stand in for "facts intact".
    expect(latestState().appliedText).toBe(UI.describe.examples['passport-q1'].two)
    expect(latestState().interpProvenance).toBe('simulated (local matcher)')
    expect(latestState().caseFacts).toEqual([])
  })

  it('facts intact, non-vacuously: the same unplaceable story WITH a file number in it carries that fact through the direct pick', async () => {
    flagOn()
    // The registered story plus the one detail a real citizen would most
    // likely add. It still maps nothing (no q1 rule matches "agent" or
    // "phone switched off"), so it still lands on the panel — but now the
    // app's own fact extraction has something to find.
    const story = UI.describe.examples['passport-q1'].two + '. File no BN1068334517807'
    const fileNumberFact: Fact = {
      kind: 'reference_number', refType: 'passport_file_no', label: 'File Number',
      value: 'BN1068334517807', fills: '[File Number / ARN]',
    }
    render(<App />)
    await toPassportQ1()
    await openDescribeBox()
    await runTypedStory(story)
    await screen.findByRole('heading', { level: 1, name: UI.unplaceable.headline })

    expect(latestState().interp?.unplaceable).toBe(true)
    expect(latestState().interp?.facts).toEqual([fileNumberFact])

    await userEvent.click(
      within(document.querySelector('.unplace-panel') as HTMLElement)
        .getByRole('button', { name: PASSPORT_Q1_LABELS.no_contact }),
    )
    expect(latestState().screen).toBe('passport-q2')
    expect(latestState().caseFacts).toEqual([fileNumberFact])
    expect(latestState().appliedText).toBe(story)
  })
})

describe('C8 Task 17, flow 4: voter branch pruning — AC-AI-3', () => {
  it('the voter story maps all three questions; repicking Q1 to "no word" drops the appeal card AND the applied answers carry no voterAppealedRaw', async () => {
    flagOn()
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Voter Services/ }))
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['voter-entry'].one)
    await screen.findByRole('heading', { level: 1, name: UI.interp.headline })

    // Three mappings — voterEntry 'applied', voterQ1 'decision',
    // voterAppealedRaw 'none' — the exact shape AC-AI-3 names.
    const cardsBefore = document.querySelectorAll('.read-card').length
    expect(cardsBefore).toBe(3)
    expect(interpCard(UI.interp.qLabel.voterAppealedRaw)).toBeInTheDocument()

    // Repick Q1 away from 'decision'. `voterAppealedRaw`'s own
    // `reachableIf` is `voterQ1 === 'decision'`, so the branch gate runs a
    // SECOND time, at correction time, and voids the now-unreachable
    // mapping.
    await userEvent.click(
      within(interpCard(UI.interp.qLabel.voterQ1)).getByRole('button', { name: VOTER_Q1_LABELS.no_word }),
    )
    expect(document.querySelectorAll('.read-card').length).toBe(2)
    expect(document.querySelectorAll('.read-card').length).toBeLessThan(cardsBefore)
    expect(() => interpCard(UI.interp.qLabel.voterAppealedRaw)).toThrow()

    await userEvent.click(screen.getByRole('button', { name: UI.interp.useTheseAnswers }))
    expect(latestState().screen).toBe('voter-diagnosis')
    expect(latestState().answers.voterQ1).toBe('no_word')
    // The named assertion: the dropped mapping was never written, in either
    // its raw or its normalised form.
    expect('voterAppealedRaw' in latestState().answers).toBe(false)
    expect('voterAppealed' in latestState().answers).toBe(false)
    // D2: voterEntry is routing, never an answer — the tap path writes
    // nothing for it either, so the describe path must not.
    expect('voterEntry' in latestState().answers).toBe(false)
  })
})

describe('C8 Task 17, flow 5: the file number reaches the prepared draft — FR-AI-04 / AC-AI-4', () => {
  it('the passport story File no fills [File Number / ARN], is named in the fill list, and — once the remaining blanks are gone — the hint is the unreviewed-fills state until the citizen ticks it', async () => {
    flagOn()
    render(<App />)
    await toPassportQ1()
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['passport-q1'].one)
    await screen.findByRole('heading', { level: 1, name: UI.interp.headline })
    await userEvent.click(screen.getByRole('button', { name: UI.interp.useTheseAnswers }))
    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    await userEvent.click(screen.getByRole('button', { name: UI.nextMove.prepare }))

    const d = diagnose(passportEngine, { guardrail: 'no', q1: 'contacted_incomplete', q2: 'informal' })
    const prep = prepPlanFor(d)!
    expect(prep.draft).toContain('[File Number / ARN]')
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    // Every occurrence, not just the first (fillDraft's split/join) — the
    // bracket appears twice in state-5a's own draft.
    expect(ta.value).not.toContain('[File Number / ARN]')
    expect(ta.value.match(/BN1068334517807/g)).toHaveLength(2)
    // The applied date is the story's OTHER fill; "in June" is a date the
    // app deliberately refuses to auto-place, so it fills nothing.
    expect(ta.value).not.toContain('[date you applied]')
    expect(ta.value).toContain('12 March 2026')

    const fillList = document.querySelector('.fill-list')
    expect(fillList).toBeInTheDocument()
    expect(fillList).toHaveTextContent(UI.prepare.fillListKey)
    expect(fillList).toHaveTextContent('File Number')
    expect(fillList).toHaveTextContent('BN1068334517807')
    expect(fillList).toHaveTextContent('Applied')

    // The three-branch hint, in order. While blanks remain it says nothing
    // about fills at all (D14) — the fill list is what keeps them visible.
    expect(document.querySelector('.prep-hint')).not.toHaveTextContent(UI.prepare.hintFilledUnreviewed)
    // Clear the citizen's own remaining blanks; now the MIDDLE state.
    fireEvent.change(ta, { target: { value: 'nothing left to fill, everything supplied' } })
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintFilledUnreviewed)
    expect(latestState().fillsReviewed).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.fillReviewLabel }))
    expect(latestState().fillsReviewed).toBe(true)
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintReady)
  })

  it('an UNRECOGNIZED-format number fills nothing: it is chipped honestly, named as unusable, and the draft own bracket is left standing', async () => {
    flagOn()
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Voter Services/ }))
    await openDescribeBox()
    // A story whose number matches NO voter reference shape (not an EPIC,
    // not a 9-13 digit cued reference) — so it falls through to the honest
    // unknown-number sweep, which always sets `fills: null`.
    await runTypedStory('I applied for a correction and it got rejected. I have not appealed yet. My case token is XY7788ZZ01')
    await screen.findByRole('heading', { level: 1, name: UI.interp.headline })

    expect(latestState().interp?.facts).toEqual([
      { kind: 'reference_number', refType: 'unknown', label: 'A number you mentioned', value: 'XY7788ZZ01', fills: null },
    ])
    expect(screen.getByText(UI.facts.unknownNumberNote)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: UI.interp.useTheseAnswers }))
    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    await userEvent.click(screen.getByRole('button', { name: UI.nextMove.prepare }))

    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    // The v-3 draft's own reference bracket is still a blank the citizen
    // must fill themselves — nothing was guessed into it.
    expect(ta.value).toContain('[reference number]')
    expect(ta.value).not.toContain('XY7788ZZ01')
    expect(document.querySelector('.fill-list')).toBeNull()
  })

  it('a correction to this task own brief, pinned: the voter example story Ref 123456789012 IS a recognized reference number and DOES fill [reference number]', async () => {
    // task-17-brief.md's flow 5 claims "the unknown-format number in the
    // voter story fills nothing." Verified against the real extractor: it is
    // a CUED 12-digit number, which `REF_SHAPES.voter`'s `voter_ref` shape
    // matches with `fills: '[reference number]'`, and the v-3 draft it
    // reaches genuinely contains that bracket. The brief's claim is wrong
    // about THIS story; the requirement it was reaching for (the spec's own
    // "unknown-format number fills nothing") is proven by the test directly
    // above, with a number that really is unrecognized. This test pins the
    // observed behaviour so a future reader diffing the brief against the
    // suite finds the answer here rather than "fixing" a passing test.
    flagOn()
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Voter Services/ }))
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['voter-entry'].one)
    await screen.findByRole('heading', { level: 1, name: UI.interp.headline })

    // The whole array, not just facts[0] (fix round 1: the story also
    // yields a SECOND fact — "May" as a date_other — which a facts[0]-only
    // check leaves silently unasserted; matches the other two flow-5 tests'
    // own whole-array style).
    expect(latestState().interp?.facts).toEqual([
      {
        kind: 'reference_number', refType: 'voter_ref', label: 'Reference number',
        value: '123456789012', fills: '[reference number]',
      },
      { kind: 'date', refType: 'date_other', label: 'Date you mentioned', value: 'May', fills: null },
    ])

    await userEvent.click(screen.getByRole('button', { name: UI.interp.useTheseAnswers }))
    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    await userEvent.click(screen.getByRole('button', { name: UI.nextMove.prepare }))
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    expect(ta.value).not.toContain('[reference number]')
    expect(ta.value).toContain('123456789012')
    expect(document.querySelector('.fill-list')).toHaveTextContent('Reference number')
  })
})

describe('C8 Task 17, flow 6: save, reload, restore (Task 8)', () => {
  it('the facts, the text and the provenance survive a real save and a real reload — the draft still fills, and fillsReviewed is back to false', async () => {
    flagOn()
    // Signed in, because BEGIN_SAVE only completes a save while signed in
    // (C7 Task 16) — the same seed the C5 save-flow test above already uses.
    seededState.current = { user: { method: 'phone', id: '+919876543210', name: 'Ananya' } }
    render(<App />)
    await toPassportQ1()
    await openDescribeBox()
    await runStoryChip(UI.describe.examples['passport-q1'].one)
    await screen.findByRole('heading', { level: 1, name: UI.interp.headline })
    await userEvent.click(screen.getByRole('button', { name: UI.interp.useTheseAnswers }))
    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    await userEvent.click(screen.getByRole('button', { name: UI.saveControl.save }))
    expect(screen.getByRole('heading', { name: UI.saveDone.headline })).toBeInTheDocument()

    // The case the app itself produced, through `caseSnapshot` — never a
    // hand-typed fixture (Task 15's own fix-round finding).
    const saved = latestState().savedCases
    expect(saved).toHaveLength(1)
    expect(saved[0].appliedText).toBe(UI.describe.examples['passport-q1'].one)
    expect(saved[0].interpProvenance).toBe('simulated (local matcher)')
    expect(saved[0].caseFacts.map(f => f.value)).toEqual(['BN1068334517807', '12 March 2026', 'June'])

    // THE RELOAD. A signed-in session pushes to the server rather than to
    // `nm_cases` (App.tsx effect 1's own `user === null` gate), so the
    // reload is staged the way a real second visit reaches it: the case the
    // app just built goes where `loadCases()` reads it, the tree is torn
    // down, and a fresh `<App/>` boots from storage with no session state
    // carried over at all.
    localStorage.setItem('nm_cases', JSON.stringify(saved))
    reducerStates.current = []
    dispatchedActions.current = []
    seededState.current = undefined
    cleanup()
    render(<App />)

    await userEvent.click(document.querySelector('.saved-card') as HTMLButtonElement)
    // OPEN_CHECKIN -> loadCaseFragment: facts, text and provenance restored;
    // the acknowledgment deliberately NOT (FR-AI-04 — the citizen is looking
    // at this draft fresh, possibly months later, possibly on another
    // device).
    expect(latestState().appliedText).toBe(UI.describe.examples['passport-q1'].one)
    expect(latestState().interpProvenance).toBe('simulated (local matcher)')
    expect(latestState().caseFacts.map(f => f.value)).toEqual(['BN1068334517807', '12 March 2026', 'June'])
    expect(latestState().fillsReviewed).toBe(false)

    // ...and the draft still fills from them.
    await userEvent.click(screen.getByRole('button', { name: UI.casefile.prepareLink }))
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    expect(ta.value).toContain('BN1068334517807')
    expect(ta.value).not.toContain('[File Number / ARN]')
    expect(document.querySelector('.fill-list')).toHaveTextContent('BN1068334517807')
  })
})

// -----------------------------------------------------------------------------
// Design note 6 — the scope-exclusion regression pins that need a real router.
// Each one corresponds to a promise C8 made about what it would NOT change.
// The repo-wide source-scan half of design note 6 lives in
// `src/screens/screenCopy.test.tsx`, where the file-walking helper the D1 pin
// already uses lives — one walker, not two.
// -----------------------------------------------------------------------------
describe('C8 Task 17: the scope-exclusion regression pins (design note 6)', () => {
  it.each([
    ['passport-recovery' as ScreenId, PASSPORT_COPY.recovery.headline],
    ['passport-recovery-paste' as ScreenId, PASSPORT_COPY.recoveryPaste.headline],
    ['passport-recovery-show' as ScreenId, PASSPORT_COPY.recoveryShow.headline],
  ])('exclusion 5: %s renders NO describe row, even with the flag on', (screenId, headline) => {
    flagOn()
    seededState.current = { screen: screenId, answers: { guardrail: 'no', q1: 'not_sure' } }
    render(<App />)
    expect(screen.getByRole('heading', { name: headline })).toBeInTheDocument()
    expect(document.querySelector('.describe-entry')).toBeNull()
  })

  it("exclusion 5, the other half: the pasted-status matcher's own behaviour is unchanged — exact match over normalised text only, never a substring", () => {
    // The pure decision, pinned directly (PassportRecovery.tsx's own
    // contract: "the retired bare-substring 'verif' match must never
    // reappear in any form").
    for (const example of PASTE_MATCH_EXAMPLES) {
      const result = matchPasted(`  ${example.text.toUpperCase()}  `)
      expect(result).toEqual('outOfScope' in example ? { outOfScope: true } : { q1: example.q1 })
    }
    expect(matchPasted('verif')).toBeNull()
    expect(matchPasted('the police verification report has been received today')).toBeNull()
    expect(matchPasted('')).toBeNull()
  })

  it('exclusion 5, through the real router: a matched paste still sets q1 and routes to Q2 with the flag ON', async () => {
    flagOn()
    seededState.current = { screen: 'passport-recovery-paste', answers: { guardrail: 'no', q1: 'not_sure' } }
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Police Verification Report Has Been Received' } })
    await userEvent.click(screen.getByRole('button', { name: PASSPORT_COPY.recoveryPaste.continue }))
    expect(screen.getByRole('heading', { name: PASSPORT_COPY.q2.headline })).toBeInTheDocument()
    expect(latestState().answers.q1).toBe('verified_no_progress')
  })

  it('FR-AI-06: "I\'m not sure" is unchanged — the row still renders with its sub-label, and picking it still routes to recovery with q1 not_sure (the behaviour passportFlow.test.tsx already pins)', async () => {
    flagOn()
    seededState.current = { screen: 'passport-q1', answers: { guardrail: 'no' } }
    render(<App />)
    // The row renders identically — same label, same sub-label — and the
    // describe entry is an ADDITION at the tail of the list, never a
    // replacement for it.
    expect(screen.getByRole('button', { name: new RegExp(PASSPORT_COPY.q1.notSure) })).toBeInTheDocument()
    expect(screen.getByText(PASSPORT_COPY.q1.notSureSub)).toBeInTheDocument()
    expect(document.querySelector('.describe-entry')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: new RegExp(PASSPORT_COPY.q1.notSure) }))
    expect(screen.getByRole('heading', { name: PASSPORT_COPY.recovery.headline })).toBeInTheDocument()
    expect(latestState().answers.q1).toBe('not_sure')
  })

  it('FR-AI-06: "I\'m not sure" still reaches the UNCLASSIFIED diagnosis, unchanged', async () => {
    flagOn()
    seededState.current = { screen: 'passport-recovery', answers: { guardrail: 'no', q1: 'not_sure' } }
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: PASSPORT_COPY.recovery.safest }))
    expect(latestState().screen).toBe('passport-diagnosis')
    expect(latestState().answers).toEqual({ guardrail: 'no', q1: 'not_sure', recoveryAskedSafest: 'yes' })
    expect(screen.getByRole('heading', { name: UI.diagnosis.headlineUnclassified })).toBeInTheDocument()
  })

  it('exclusion 14: the SIR phase-drift banner still renders on the diagnosis screen', () => {
    flagOn()
    seededState.current = {
      screen: 'sir-diagnosis', answers: { sirState: 'delhi', sirQ1: 'roll_absent' }, phaseDrift: true,
    }
    render(<App />)
    expect(screen.getByText(UI.diagnosis.phaseDriftLead)).toBeInTheDocument()
  })

  it('exclusion 14: the check-in loop still opens from the diagnosis screen and offers this state\'s own options', async () => {
    flagOn()
    render(<App />)
    await toPassportQ1()
    await userEvent.click(screen.getByRole('button', { name: PASSPORT_Q1_LABELS.no_contact }))
    // The Q2 rows carry a sub-label, so the accessible name is
    // "<label> <sub>" — anchored regex, not an exact match.
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${PASSPORT_Q2_LABELS.no_followup}`) }))
    await userEvent.click(screen.getByRole('button', { name: UI.updateEntry.label }))
    expect(document.querySelector('.update-mod')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Police contacted or visited me' })).toBeInTheDocument()
  })

  it('exclusion 14: the freshness banner still renders when a cited document is flagged changed', async () => {
    flagOn()
    // Real `sources/freshness.json` currently flags nothing as 'changed', so
    // the degraded branch is reached the same way sirFlow.test.tsx already
    // reaches it — by pinning `degradedFor`, never by editing the committed
    // freshness data.
    vi.spyOn(freshnessModule, 'degradedFor').mockReturnValue(true)
    vi.spyOn(freshnessModule, 'changedOnFor').mockReturnValue('5 Sep 2026')
    seededState.current = { screen: 'passport-diagnosis', answers: { guardrail: 'no', q1: 'no_contact', q2: 'no_followup' } }
    render(<App />)
    expect(screen.getByText(UI.freshness.reverifiedLead)).toBeInTheDocument()
    expect(document.querySelector('.banner')).toHaveTextContent(
      UI.freshness.reverifiedBody.replace('{date}', '5 Sep 2026'),
    )
  })

  it('exclusion 14: the escalation ladder still renders on the casefile screen', async () => {
    flagOn()
    render(<App />)
    await toPassportQ1()
    // state-5a, not state-1: `ladderFor` returns null for state-1 by design
    // ("ladder not in play"), so a state-1 mount would assert nothing.
    await userEvent.click(screen.getByRole('button', { name: PASSPORT_Q1_LABELS.contacted_incomplete }))
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${PASSPORT_Q2_LABELS.informal}`) }))
    await userEvent.click(screen.getByRole('button', { name: UI.updateEntry.label }))
    const ladder = document.querySelector('.ladder')
    expect(ladder).toBeInTheDocument()
    expect(ladder!.querySelectorAll('.lrung').length).toBeGreaterThan(0)
  })
})
