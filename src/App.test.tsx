import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { diagnose } from './domain/engine'
import { passportEngine, voterEngine, sirEngine } from './playbooks/engines'
import { SIR_STATES } from './playbooks/sirPlaybook'
import * as evaluateModule from './domain/evaluate'
import { UI } from './screens/screenCopy'
import { PREP } from './playbooks/prep'
import type { ScreenId } from './session/session'

// Design note 3's no-plan guard (design/nextmove-v1-prototype.html 3749,
// ported as App.tsx's `RestartToHome`) is reachable only via a direct
// NAVIGATE to a '*-prepare' screen id — never through the UI, since the
// CTA only renders behind `hasPrepPlan`. `<App/>` exposes no dispatch or
// initial-screen prop (by design — session.ts's own field list is pinned,
// and App.tsx's shape is transcribed exactly per the brief), so the one
// test below that exercises this seeds the FIRST render's screen id via a
// scoped module mock instead of adding test-only surface to App itself.
// `sessionReducer`'s own `RESTART` case is untouched by this: it closes
// over session.ts's OWN internal `initialSession` binding (same module,
// no import indirection), never the mocked export read here, so restarting
// still lands on the real, unmutated clean-slate state — no infinite loop,
// no stale screen id surviving the restart.
const seededScreen = vi.hoisted(() => ({ current: undefined as string | undefined }))
vi.mock('./session/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./session/session')>()
  return {
    ...actual,
    get initialSession() {
      return seededScreen.current
        ? { ...actual.initialSession, screen: seededScreen.current as ScreenId }
        : actual.initialSession
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  seededScreen.current = undefined
  // Task 13: App now genuinely reads/writes `nm_cases` via `localStorage`
  // (the lazy useReducer initializer / the persistence useEffect) — jsdom's
  // REAL localStorage is shared across every `it()` in this file, so a case
  // saved by one test would otherwise leak into the next `render(<App/>)`.
  localStorage.clear()
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
    seededScreen.current = 'sir-prepare'
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
})

describe('Task 13: the four C5 router cases', () => {
  it("'checkin' with no active case dispatches RESTART and lands on Home, rendering nothing of the casefile screen", () => {
    seededScreen.current = 'checkin'
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByRole('button', { name: /← Back/ })).toBeNull()
    expect(document.querySelector('.update-mod')).toBeNull()
  })

  it("'dead-end' with no active case dispatches RESTART and lands on Home", () => {
    seededScreen.current = 'dead-end'
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Know what's")
    expect(screen.queryByText(UI.deadEnd.headline)).toBeNull()
  })

  it("'case-closed' renders (case is nullable — no RestartToHome guard needed)", () => {
    seededScreen.current = 'case-closed'
    render(<App />)
    expect(screen.getByRole('button', { name: UI.caseClosed.backToHome })).toBeInTheDocument()
  })

  it("'save-done' renders (pendingSave is nullable — no RestartToHome guard needed)", () => {
    seededScreen.current = 'save-done'
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
