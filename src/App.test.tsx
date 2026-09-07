import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
import { UI } from './screens/screenCopy'
import { PREP } from './playbooks/prep'
import type { SessionState, SessionAction } from './session/session'

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
vi.mock('./session/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./session/session')>()
  return {
    ...actual,
    get initialSession() {
      return seededState.current ? { ...actual.initialSession, ...seededState.current } : actual.initialSession
    },
    sessionReducer: (s: SessionState, a: SessionAction) => {
      dispatchedActions.current.push(a)
      return actual.sessionReducer(s, a)
    },
  }
})

beforeEach(() => {
  mockClient = createSupabaseMock()
})

afterEach(() => {
  vi.restoreAllMocks()
  seededState.current = undefined
  dispatchedActions.current = []
  // Task 13: App now genuinely reads/writes `nm_cases` via `localStorage`
  // (the lazy useReducer initializer / the persistence useEffect) — jsdom's
  // REAL localStorage is shared across every `it()` in this file, so a case
  // saved by one test would otherwise leak into the next `render(<App/>)`.
  localStorage.clear()
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
  it('nm_cases is written after a save, and read back on a fresh mount', async () => {
    expect(localStorage.getItem('nm_cases')).toBeNull()
    const { unmount } = render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    await userEvent.click(screen.getByRole('button', { name: "I haven't heard anything about police verification yet" }))
    await userEvent.click(screen.getByRole('button', { name: /^No, not yet/ }))
    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    await userEvent.click(screen.getByRole('button', { name: UI.saveControl.save }))

    const stored = localStorage.getItem('nm_cases')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toHaveLength(1)
    unmount()

    // A fresh mount reads it straight back — the lazy useReducer initializer.
    render(<App />)
    expect(document.querySelector('.saved-card')).toBeInTheDocument()
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
})
