import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Banner } from '../ui/Banner'
import { DiagnosisScreen, type DiagnosisScreenProps } from './DiagnosisScreen'
import { diagnose, type ServiceEngine } from '../domain/engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { SIR_STATES } from '../playbooks/sirPlaybook'
import type { AnswerRecord } from '../domain/types'
import type { ServiceKey } from '../session/session'
import type { CiSnapshot } from '../session/cases'
import { UI } from '../screens/screenCopy'

// DiagnosisScreen composes <TrustDisclosure>, which is fully controlled
// (design note 7) — so the screen takes trustOpen/onToggleTrust and passes
// them straight through. Default closed, matching the prototype.
//
// `engine.key` is typed `string` on `ServiceEngine` (Task 1's domain type,
// not narrowed here); DiagnosisScreen's `engineKey` prop is `ServiceKey`
// (fix round 1, Minor #4) — the cast is safe because every engine this
// helper is ever called with (passportEngine/voterEngine/sirEngine) really
// does carry one of the three literal values.
const renderFor = (engine: ServiceEngine, answers: AnswerRecord, extra: Partial<DiagnosisScreenProps> = {}) =>
  render(<DiagnosisScreen serviceLabel="Passport" engineKey={engine.key as ServiceKey}
           d={diagnose(engine, answers)} answerLabels={{}}
           trustOpen={false} onToggleTrust={vi.fn()} {...extra} />)

describe('the reveal headline', () => {
  it('a classified diagnosis reads "We found where this is waiting." with the marker swipe on "waiting"', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('We found where this is waiting.')
    expect(document.querySelector('.reveal-headline .mark')).toHaveTextContent('waiting')
  })

  it('UNCLASSIFIED reads the honest headline, with no swipe and no gems', () => {
    renderFor(passportEngine, { q1: 'not_sure' })
    expect(screen.getByRole('heading', { level: 2 }))
      .toHaveTextContent("We don't have enough information to call this safely.")
    expect(document.querySelector('.mark')).toBeNull()
    expect(document.querySelector('.gems')).toBeNull()
  })
})

describe('the "Waiting on" block — the product\'s core differentiator', () => {
  it('renders the dependency for a classified diagnosis', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(screen.getByText('Waiting on')).toBeInTheDocument()
    expect(document.querySelector('.dep-v')).toHaveTextContent(
      diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' }).dependency)
  })

  it.each([
    ['passport', passportEngine, { q1: 'not_sure' }],
    ['voter', voterEngine, { voterQ1: 'unclassified' }],
    ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'unclassified' }],
  ])('%s UNCLASSIFIED omits it entirely (dependency is "Unknown", never rendered)', (_, engine, answers) => {
    renderFor(engine, answers)
    expect(screen.queryByText('Waiting on')).toBeNull()
    expect(screen.queryByText('Unknown')).toBeNull()
  })
})

describe('the case trail — Passport only (FR-V-10)', () => {
  it('places state 1 at "Police verification" with the You-are-here marker', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    const current = document.querySelector('.ct-step.current')
    expect(current).toHaveTextContent('Police verification')
    expect(current).toHaveTextContent('You are here')
  })

  it('a ladder-rung state (5a) still places by its STAGE answer, keeping the stage visible', () => {
    renderFor(passportEngine, { q1: 'verified_no_progress', q2: 'informal' })
    expect(document.querySelector('.ct-step.current')).toHaveTextContent('Processing')
  })

  it('passport UNCLASSIFIED (state 6) renders no trail', () => {
    renderFor(passportEngine, { q1: 'not_sure' })
    expect(document.querySelector('.case-trail')).toBeNull()
  })

  it('a passport UNCLASSIFIED case whose stray q1 collides with STAGE_INDEX still renders no trail (fix round 1, Important #2 — pins CaseTrail\'s d.state===\'6\' guard, which no prior fixture actually exercised)', () => {
    // {q1:'adverse'} alone matches no rule (state-4 needs q2==='no_followup'
    // too), so this falls through to the UNCLASSIFIED fallback, state '6'.
    // 'adverse' IS a STAGE_INDEX entry (CaseTrail.tsx) — without the
    // state==='6' guard running first, this would incorrectly render a
    // trail on a "we don't know" screen.
    const d = diagnose(passportEngine, { q1: 'adverse' })
    expect(d.rec).toBe('UNCLASSIFIED')
    expect(d.state).toBe('6') // guard: this fixture really hits the branch under test
    renderFor(passportEngine, { q1: 'adverse' })
    expect(document.querySelector('.case-trail')).toBeNull()
  })

  it('a stray Passport q1 left over from earlier in the session never leaks a trail onto a Voter diagnosis (fix round 1, Important #1)', () => {
    // Simulates the real scenario: BACK/NAVIGATE never clear session
    // answers (only RESTART does — session.ts), so a citizen who touched
    // Passport's q1 earlier, then completed a real Voter diagnosis, ends up
    // with a Diagnosis.matchedAnswers that still carries the stale q1
    // alongside the real voterQ1. 'no_contact' IS a STAGE_INDEX entry
    // (CaseTrail.tsx) — without gating on engineKey, DiagnosisScreen would
    // render a Passport case trail on this Voter diagnosis.
    const d = diagnose(voterEngine, { voterQ1: 'no_word', q1: 'no_contact' })
    expect(d.matchedAnswers.q1).toBe('no_contact') // guard: the stale key really is present
    renderFor(voterEngine, { voterQ1: 'no_word', q1: 'no_contact' })
    expect(document.querySelector('.case-trail')).toBeNull()
  })

  it.each([['voter', voterEngine, { voterQ1: 'no_word' }],
           ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'roll_present' }]])(
    '%s never renders a trail — no official linear sequence exists to represent', (_, e, a) => {
      renderFor(e, a); expect(document.querySelector('.case-trail')).toBeNull()
    })
})

describe('the topbar slot (fix round 1, Important #3)', () => {
  it('renders the given topbar first, ahead of the diagnosis content', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' },
      { topbar: <div data-testid="fake-topbar">TOPBAR</div> })
    expect(screen.getByTestId('fake-topbar')).toBeInTheDocument()
  })

  it('renders nothing extra when omitted, so every pre-existing test (which never passes it) is unaffected', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(screen.queryByTestId('fake-topbar')).toBeNull()
  })
})

describe('PRE-CHANGE PIN (Task 11): extend, never restructure', () => {
  // NOT a RED test (see the task brief's own PRE-CHANGE PIN section):
  // toMatchSnapshot() writes its baseline on first run and passes green
  // immediately, so it cannot "fail first" the way a real RED test does.
  // This is run, and its generated snapshot committed, AGAINST THE
  // UNMODIFIED component — before Task 11 touches DiagnosisScreen.tsx at
  // all. After the Task 11 changes land, re-running this SAME test (still
  // passing none of the new ciJustUpdated/ciSnapshot/onUndo/onUpdate props)
  // must still match this baseline exactly — that is the guarantee that
  // Task 11 only ADDED behind new optional props and never restructured an
  // existing branch. A second, separate snapshot (below) pins the
  // WITH-new-props case once those props exist.
  it('renders byte-identical output when the Task 11 props are absent', () => {
    const { container } = renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(container.innerHTML).toMatchSnapshot()
  })
})

describe('the shared template renders every service unmodified (impl plan §1)', () => {
  it.each([
    ['passport', passportEngine, { q1: 'adverse', q2: 'no_followup' }, null],
    ['voter', voterEngine, { voterQ1: 'decision', voterAppealed: 'pending' }, null],
    ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'notice' }, 'phase banner'],
  ])('%s renders stamp + explanation + CTA from the same component', (_, engine, answers, preNote) => {
    const d = diagnose(engine, answers)
    renderFor(engine, answers, { preNote })
    expect(document.querySelector('.stamp')).toHaveTextContent(d.rec === 'FOLLOW_UP' ? 'FOLLOW UP' : d.rec)
    expect(screen.getByText(d.explanation)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /See my next move/ })).toBeInTheDocument()
  })

  it('SIR\'s phase banner arrives through the generic preNote slot', () => {
    const st = SIR_STATES.delhi
    renderFor(sirEngine, { sirState: 'delhi', sirQ1: 'roll_absent' },
      { preNote: <Banner><b>{st.name} · {st.phase!.label}:</b> {st.phase!.note}</Banner> })
    expect(screen.getByText(st.phase!.note, { exact: false })).toBeInTheDocument()
  })

  it('never leaks an internal rule id, state, screen id or answer key into rendered text (AC-10)', () => {
    // Asserting the LITERAL strings 'ruleId' / 'matchedAnswers' / 'engineKey'
    // would prove nothing — no renderer emits a field NAME. Assert the VALUES
    // that could actually leak.
    const answers = { q1: 'adverse', q2: 'formal_grievance' }
    const d = diagnose(passportEngine, answers)
    const { container } = renderFor(passportEngine, answers)
    const text = container.textContent!

    // Guards, so the test cannot pass by rendering nothing or by drifting
    // onto a fixture with nothing to leak.
    expect(d.ruleId).toBe('state-5b')
    expect(Object.keys(d.matchedAnswers).length).toBeGreaterThan(0)
    expect(text.length).toBeGreaterThan(100)

    expect(text).not.toContain(d.ruleId!)              // 'state-5b'
    expect(text).not.toContain('passport-nextmove')    // an engineKey-derived screen id
    for (const [k, v] of Object.entries(d.matchedAnswers)) {
      expect(text).not.toContain(`${k}:${v}`)          // composite answer keys
      expect(text).not.toContain(k)                    // raw answer KEYS ('q1', 'q2')
    }
    // The Diagnosis screen deliberately never names its own state — see the
    // Open Question 4 ruling. d.state is '5b' here, short enough to fall
    // inside an unrelated word by accident, so anchor it as a whole token.
    expect(new RegExp(`\\b${d.state}\\b`).test(text)).toBe(false)
  })
})

// A ciSnapshot fixture DiagnosisScreen only ever checks for PRESENCE
// (truthiness) — it never reads any of its fields — so an opaque stand-in
// is enough; no real Casefile needs constructing here.
const fakeCiSnapshot = { answers: {}, prepChecks: {}, casefile: {} } as unknown as CiSnapshot

describe('Task 11: the ciJustUpdated undo banner (design note 3.1)', () => {
  it('renders the banner and its Undo button, positioned before the dependency block, when ciJustUpdated and a snapshot both exist', () => {
    const onUndo = vi.fn()
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' }, {
      ciJustUpdated: true, ciSnapshot: fakeCiSnapshot, onUndo,
    })
    expect(screen.getByText(UI.diagnosis.updateRecorded)).toBeInTheDocument()
    const undoBtn = screen.getByRole('button', { name: UI.diagnosis.undoUpdate })
    undoBtn.click()
    expect(onUndo).toHaveBeenCalledTimes(1)

    const rightCol = document.querySelector('.split-r')!
    const children = Array.from(rightCol.children)
    const bannerIdx = children.findIndex(el => el.classList.contains('banner'))
    const depBlockIdx = children.findIndex(el => el.classList.contains('dep-block'))
    expect(bannerIdx).toBeGreaterThanOrEqual(0) // guard: the banner really rendered
    expect(depBlockIdx).toBeGreaterThan(-1) // guard: this fixture really has a dep-block
    expect(depBlockIdx).toBeGreaterThan(bannerIdx)
  })

  it('omits the banner when ciJustUpdated is true but there is no snapshot to undo', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' }, {
      ciJustUpdated: true, ciSnapshot: null,
    })
    expect(screen.queryByText(UI.diagnosis.updateRecorded)).toBeNull()
  })

  it('omits the banner entirely when the new props are absent (pre-existing behaviour)', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(screen.queryByText(UI.diagnosis.updateRecorded)).toBeNull()
  })
})

describe('Task 11: <UpdateEntry> between the CTA and the trust toggle (design note 3.5)', () => {
  it('renders it there — asserting DOM position, not just presence — and it fires onUpdate', () => {
    const onUpdate = vi.fn()
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' }, { onUpdate })
    const updateBtn = screen.getByRole('button', { name: UI.updateEntry.label })
    updateBtn.click()
    expect(onUpdate).toHaveBeenCalledTimes(1)

    const rightCol = document.querySelector('.split-r')!
    const children = Array.from(rightCol.children)
    const ctaIdx = children.findIndex(el => el.classList.contains('btn-primary'))
    const updateIdx = children.indexOf(updateBtn)
    const trustIdx = children.findIndex(el => el.classList.contains('trust-toggle'))
    expect(ctaIdx).toBeGreaterThanOrEqual(0) // guard
    expect(updateIdx).toBeGreaterThan(-1) // guard: it really is a direct child
    expect(trustIdx).toBeGreaterThan(-1) // guard
    expect(updateIdx).toBeGreaterThan(ctaIdx)
    expect(trustIdx).toBeGreaterThan(updateIdx)
  })

  it('omits it entirely when onUpdate is absent (pre-existing behaviour)', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(screen.queryByText(UI.updateEntry.label)).toBeNull()
  })
})
