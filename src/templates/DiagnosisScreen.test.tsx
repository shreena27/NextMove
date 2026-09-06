import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Banner } from '../ui/Banner'
import { DiagnosisScreen, type DiagnosisScreenProps } from './DiagnosisScreen'
import { diagnose, type ServiceEngine } from '../domain/engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { SIR_STATES } from '../playbooks/sirPlaybook'
import type { AnswerRecord } from '../domain/types'

// DiagnosisScreen composes <TrustDisclosure>, which is fully controlled
// (design note 7) — so the screen takes trustOpen/onToggleTrust and passes
// them straight through. Default closed, matching the prototype.
const renderFor = (engine: ServiceEngine, answers: AnswerRecord, extra: Partial<DiagnosisScreenProps> = {}) =>
  render(<DiagnosisScreen serviceLabel="Passport" engineKey={engine.key}
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

  it.each([['voter', voterEngine, { voterQ1: 'no_word' }],
           ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'roll_present' }]])(
    '%s never renders a trail — no official linear sequence exists to represent', (_, e, a) => {
      renderFor(e, a); expect(document.querySelector('.case-trail')).toBeNull()
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
