import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextMoveScreen } from './NextMoveScreen'
import { diagnose } from '../domain/engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import type { ServiceKey } from '../session/session'
import { caseSnapshot, type Casefile } from '../domain/casefile'
import { UI } from '../screens/screenCopy'

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

describe('PRE-CHANGE PIN (Task 11): extend, never restructure', () => {
  // See DiagnosisScreen.test.tsx's own identically-named describe block for
  // the full mechanism note: this is a regression pin, not a RED test, run
  // and committed against the UNMODIFIED component before Task 11 touches
  // NextMoveScreen.tsx — the artefact the "extend, don't restructure"
  // guarantee rests on.
  it('renders byte-identical output when the Task 11 props are absent', () => {
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    const { container } = render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} />)
    expect(container.innerHTML).toMatchSnapshot()
  })
})

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

describe('need and needList render together, and no data field is ever injected as markup', () => {
  it("s-notice's document list renders as real <li> elements, alongside need's lead-in text", () => {
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })
    expect(d.needList).toBeDefined() // guard
    render(<NextMoveScreen serviceLabel="SIR" engineKey="sir" d={d} />)
    const items = document.querySelectorAll('.need-list li')
    expect(items.length).toBe(d.needList!.length)
    expect([...items].map(li => li.textContent)).toEqual(d.needList)
    // Fix round 1, Critical: dropping `need`'s lead-in ("Any ONE of
    // these:") would make a bare 12-item bullet list read as "bring all
    // of these" — the opposite of the actual any-ONE requirement. Both
    // fields must render.
    expect(screen.getByText(d.need)).toBeInTheDocument()
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

  it('clicking the "Prepare this for me" CTA calls onPrepare — no inert button ships (fix round 1, Minor)', async () => {
    const onPrepare = vi.fn()
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    render(
      <NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} hasPrepPlan onPrepare={onPrepare} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Prepare this for me/ }))
    expect(onPrepare).toHaveBeenCalledTimes(1)
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

describe('Task 11: <UpdateEntry> then <SaveControl>, after the CTA (design note 4)', () => {
  it('renders both, in that order, after the CTA, and each callback fires', () => {
    const onUpdate = vi.fn()
    const onSave = vi.fn()
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    render(
      <NextMoveScreen
        serviceLabel="Passport" engineKey="passport" d={d}
        onUpdate={onUpdate} onSave={onSave} savedCases={[]}
      />,
    )
    const updateBtn = screen.getByRole('button', { name: UI.updateEntry.label })
    updateBtn.click()
    expect(onUpdate).toHaveBeenCalledTimes(1)

    const saveBtn = screen.getByRole('button', { name: UI.saveControl.save })
    saveBtn.click()
    expect(onSave).toHaveBeenCalledTimes(1)

    const rightCol = document.querySelector('.split-r')!
    const children = Array.from(rightCol.children)
    // No prep plan for this fixture -> the CTA is the secondary "Back to
    // Home" button (.btn-secondary).
    const ctaIdx = children.findIndex(el => el.classList.contains('btn-secondary'))
    const updateIdx = children.indexOf(updateBtn)
    const saveIdx = children.indexOf(saveBtn)
    expect(ctaIdx).toBeGreaterThanOrEqual(0) // guard
    expect(updateIdx).toBeGreaterThan(-1) // guard: it really is a direct child
    expect(saveIdx).toBeGreaterThan(-1) // guard
    expect(updateIdx).toBeGreaterThan(ctaIdx)
    expect(saveIdx).toBeGreaterThan(updateIdx)
  })

  it('SaveControl shows the saved-note (no button) when a matching still-open saved case already exists', () => {
    const answers = { q1: 'no_contact', q2: 'no_followup' }
    const d = diagnose(passportEngine, answers)
    const snap = caseSnapshot('passport', 'Passport', 'passport-nextmove', d, answers, {}, [], null, null, 1_760_000_000_000)
    const saved: Casefile = { ...snap, id: 'c1', outcome: 'still_open', lastCheck: null, remindAt: null, log: [] }
    render(
      <NextMoveScreen
        serviceLabel="Passport" engineKey="passport" d={d} onSave={vi.fn()} savedCases={[saved]}
      />,
    )
    expect(document.querySelector('.saved-note')).toHaveTextContent(UI.saveControl.savedNote)
    expect(screen.queryByRole('button', { name: UI.saveControl.save })).toBeNull()
  })

  it('omits both when the new props are absent (pre-existing behaviour)', () => {
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} />)
    expect(screen.queryByText(UI.updateEntry.label)).toBeNull()
    expect(screen.queryByText(UI.saveControl.save)).toBeNull()
    expect(document.querySelector('.saved-note')).toBeNull()
  })
})

describe('C6: the freshBanner, first child of the right column (prototype 3671)', () => {
  it('renders it when freshDegraded is true, with the changedOn date interpolated', () => {
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    render(
      <NextMoveScreen
        serviceLabel="Passport" engineKey="passport" d={d}
        freshDegraded freshChangedOn="3 Sep 2026"
      />,
    )
    expect(screen.getByText(UI.freshness.reverifiedLead)).toBeInTheDocument()
    expect(document.querySelector('.banner')).toHaveTextContent(
      UI.freshness.reverifiedBody.replace('{date}', '3 Sep 2026'),
    )
    const rightCol = document.querySelector('.split-r')!
    expect(rightCol.children[0]).toHaveClass('banner') // first child, per the prototype's own position
  })

  it('omits it when freshDegraded is false or absent (pre-existing behaviour)', () => {
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    const { unmount } = render(
      <NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} freshDegraded={false} />,
    )
    expect(screen.queryByText(UI.freshness.reverifiedLead)).toBeNull()
    unmount()

    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} />)
    expect(screen.queryByText(UI.freshness.reverifiedLead)).toBeNull()
  })
})
