import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextMoveScreen } from './NextMoveScreen'
import { diagnose } from '../domain/engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import type { ServiceKey } from '../session/session'

// `engine.key` is typed `string` on `ServiceEngine` (Task 1's domain type,
// not narrowed there); `NextMoveScreen`'s `engineKey` prop is `ServiceKey`
// (matching `DiagnosisScreen`'s own convention, fix round 1 Minor #4) — the
// cast is safe because every engine used below (passportEngine/voterEngine/
// sirEngine) really does carry one of the three literal values. Same
// pattern DiagnosisScreen.test.tsx already uses.
const cases = [
  ['passport', passportEngine, { q1: 'adverse', q2: 'formal_grievance' }],
  ['voter', voterEngine, { voterQ1: 'decision', voterAppealed: 'decided' }],
  ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'roll_absent' }],
  ['passport-unclassified', passportEngine, { q1: 'not_sure' }],
] as const

describe("AC-11: What / Why / Where / What-you'll-need all populated, never blank", () => {
  it.each(cases)('%s', (_, engine, answers) => {
    const d = diagnose(engine, answers)
    render(<NextMoveScreen serviceLabel="X" engineKey={engine.key as ServiceKey} d={d} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(d.whatShort)
    expect(screen.getByText(d.whatToDo)).toBeInTheDocument()
    for (const k of ['Why', 'Where', "What you'll need"]) expect(screen.getByText(k)).toBeInTheDocument()
    expect(screen.getByText(d.explanation)).toBeInTheDocument()
    // Scoped to the "Where" field's own value, not a document-wide substring
    // search: state-5b's `where.label` ("Directorate of Public Grievances
    // (DPG)") is also a substring of its own `whatToDo`, so an unscoped
    // `getByText(..., { exact: false })` would find two elements. Same
    // sibling-lookup convention TrustDisclosure.test.tsx already uses for
    // "You told us".
    const whereValue = screen.getByText('Where').nextElementSibling!
    expect(whereValue.textContent).toContain(d.where.label)
  })
})

describe('optional fields appear only when the rule carries them', () => {
  it('renders "How long?" for a rule with howLong', () => {
    // sir roll_absent
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'roll_absent' })
    expect(d.howLong).toBeTruthy() // guard: the fixture really carries one
    render(<NextMoveScreen serviceLabel="SIR" engineKey="sir" d={d} />)
    expect(screen.getByText('How long?')).toBeInTheDocument()
    expect(screen.getByText(d.howLong!)).toBeInTheDocument()
  })

  it('omits "How long?" on the UNCLASSIFIED fallback (no howLong on any fallback)', () => {
    const d = diagnose(passportEngine, { q1: 'not_sure' })
    expect(d.rec).toBe('UNCLASSIFIED') // guard
    expect(d.howLong).toBeUndefined() // guard: no fallback carries howLong
    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} />)
    expect(screen.queryByText('How long?')).toBeNull()
  })

  it('renders "What to expect" only for rules with expectNext', () => {
    const withExpect = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(withExpect.expectNext).toBeTruthy() // guard
    const { unmount } = render(
      <NextMoveScreen serviceLabel="Passport" engineKey="passport" d={withExpect} />,
    )
    expect(screen.getByText('What to expect')).toBeInTheDocument()
    unmount()

    const withoutExpect = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })
    expect(withoutExpect.expectNext).toBeUndefined() // guard
    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={withoutExpect} />)
    expect(screen.queryByText('What to expect')).toBeNull()
  })
})

describe('needList beats need, and no data field is ever injected as markup', () => {
  it("s-notice's document list renders as real <li> elements", () => {
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })
    expect(d.needList).toBeDefined() // guard
    render(<NextMoveScreen serviceLabel="SIR" engineKey="sir" d={d} />)
    const items = document.querySelectorAll('.need-list li')
    expect(items.length).toBe(d.needList!.length)
    expect([...items].map(li => li.textContent)).toEqual(d.needList)
  })

  it('the list is a real <ul>, so the UA default markers apply (Task 1 note 1)', () => {
    // .need-list (prototype 487) sets margin/padding but NOT list-style —
    // the bullets come from the UA default, which is why Tailwind preflight
    // had to go. NOTE: jsdom does not load index.css, so a computed-style
    // assertion here would be vacuous; the stylesheet side of this is pinned
    // in Task 1's tokens.test.ts (which reads the file). All this test owes
    // is that the element really is a list.
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })
    render(<NextMoveScreen serviceLabel="SIR" engineKey="sir" d={d} />)
    expect(document.querySelector('.need-list')!.tagName).toBe('UL')
  })

  it('no rendered element carries raw markup from a data field', () => {
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })
    const { container } = render(<NextMoveScreen serviceLabel="SIR" engineKey="sir" d={d} />)
    expect(container.innerHTML).not.toContain('&lt;ul&gt;')
  })
})

describe('the official-channel handoff note is unconditional (Non-Goals: no acting on behalf)', () => {
  it.each(cases)('%s shows it', (_, engine, answers) => {
    const d = diagnose(engine, answers)
    render(<NextMoveScreen serviceLabel="X" engineKey={engine.key as ServiceKey} d={d} />)
    expect(
      screen.getByText(
        "An official government channel. NextMove helps you understand and prepare; it doesn't act on your behalf.",
      ),
    ).toBeInTheDocument()
  })

  it('an external channel link opens in a new tab with rel="noopener"', () => {
    // state-5b (passport, adverse/formal_grievance) has where.url set (DPG).
    const d = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })
    expect(d.where.url).toBeTruthy() // guard
    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} />)
    const link = screen.getByRole('link', { name: d.where.label })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
  })
})

describe('the prepare CTA seam (C4)', () => {
  it('without a prep plan, the CTA is the secondary "Back to Home" — never a dead button', () => {
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} />)
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveClass('btn-secondary')
    expect(screen.queryByText('Prepare this for me')).toBeNull()
  })

  it('"Back to Home" dispatches RESTART, not NAVIGATE home (prototype 3663 calls restart())', async () => {
    const dispatch = vi.fn()
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Back to Home' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'NAVIGATE' }))
  })

  it('with hasPrepPlan, the primary CTA appears (the seam C4 fills)', () => {
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} hasPrepPlan />)
    expect(screen.getByRole('button', { name: /Prepare this for me/ })).toHaveClass('btn-primary')
    expect(screen.queryByText('Back to Home')).toBeNull()
  })
})

describe('AC-10 (matched state): the Next Move crumb carries it', () => {
  it('AC-10 (matched state): the crumb shows the stage · rung composite C1 decorated — the trust panel deliberately does not', () => {
    const d = diagnose(passportEngine, { q1: 'verified_no_progress', q2: 'informal' })
    expect(d.label).toBe('Verified, processing quiet · informal follow-up unresolved')
    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} />)
    expect(screen.getByText(`Passport · ${d.label}`)).toBeInTheDocument()
  })

  it('AC-10 (matched state): every service surfaces its label on the crumb, not only passport', () => {
    for (const [label, engine, answers] of [
      ['Passport', passportEngine, { q1: 'adverse', q2: 'formal_grievance' }],
      ['Voter Services', voterEngine, { voterQ1: 'decision', voterAppealed: 'decided' }],
      ['Voter Services', sirEngine, { sirState: 'delhi', sirQ1: 'roll_absent' }],
    ] as const) {
      const d = diagnose(engine, answers)
      const { unmount } = render(
        <NextMoveScreen serviceLabel={label} engineKey={engine.key as ServiceKey} d={d} />,
      )
      expect(screen.getByText(`${label} · ${d.label}`)).toBeInTheDocument()
      unmount()
    }
  })
})
