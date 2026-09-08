// RED for Task 12 — InterpConfirmScreen, port of the prototype's
// `renderInterpConfirm`'s MAPPED-cards path only (design/nextmove-v1-
// prototype.html, 3067-3105): the feature's actual safety gate (FR-AI-02 —
// "the confirm screen is the sole safety gate"). NOT YET WIRED into
// App.tsx's router (Task 17's job) — every test here renders the component
// directly, the same way DescribeBlock.test.tsx (Task 11) did before its own
// six mount sites existed in the router-reachable sense.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useReducer } from 'react'
import { InterpConfirmScreen } from './InterpConfirmScreen'
import { UI } from '../screens/screenCopy'
import type { GatedInterpretation, GatedMapping } from '../domain/interpret'
import {
  sessionReducer, initialSession, type SessionState, type SessionAction, type ActiveInterpretation,
} from '../session/session'
import { PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS, VOTER_Q1_LABELS, VOTER_APPEAL_LABELS } from '../screens/labels'
import { SIR_Q1_OPTIONS_FOR } from '../playbooks/sirPlaybook'

/** Same test-only escape hatch `domain/interpret.test.ts`'s own `makeInterp`
 *  and `DescribeBlock.test.tsx`'s own `fixtureGated` already establish as
 *  the sanctioned way to build a GatedInterpretation-shaped fixture outside
 *  `interpretGates.ts`'s sole real constructor — never used in production
 *  code, only here. Defaults describe a single, empty-ish mapped
 *  interpretation; every field is overridable. */
function makeInterp(overrides: Partial<ActiveInterpretation> = {}): ActiveInterpretation {
  return {
    __gated: 'test-only' as unknown as GatedInterpretation['__gated'],
    mappings: [],
    discarded: [],
    facts: [],
    droppedSensitive: false,
    unplaceable: false,
    provenance: 'simulated (local matcher)',
    ctxScreen: 'passport-q1',
    engine: 'passport',
    service: UI.serviceLabel.passport,
    text: 'default fixture text',
    ...overrides,
  }
}

/** The primary fixture: a two-question chain (`passport-q1`), one SEEN
 *  question (q1, the screen the citizen typed on — chain[0]) and one
 *  NEVER-SEEN question (q2) — covers both card variants from a single
 *  render. `optionValues` snapshots are built from the real label maps so
 *  every rendered option carries a real, non-fallback label. */
function fixtureA(): ActiveInterpretation {
  return makeInterp({
    ctxScreen: 'passport-q1', engine: 'passport', service: UI.serviceLabel.passport,
    text: 'Police came to my house but nothing has moved since. I called the office twice.',
    mappings: [
      { questionId: 'q1', value: 'adverse', span: 'nothing has moved since', optionValues: Object.keys(PASSPORT_Q1_LABELS) },
      { questionId: 'q2', value: 'informal', span: 'called the office twice', optionValues: Object.keys(PASSPORT_Q2_LABELS) },
    ],
  })
}

/** A real `useReducer(sessionReducer, ...)` harness — needed by every test
 *  that must observe a REAL state transition (INTERP_REPICK's branch
 *  pruning, TOGGLE_INTERP_CHANGE's focus management) rather than a plain
 *  `vi.fn()` dispatch spy against static props. Mirrors DescribeBlock.
 *  test.tsx's own `Harness` exactly, including its `dispatchSpy`/`onState`
 *  optional inspection hooks. */
function Harness({
  seed, dispatchSpy, onState, now = 1000,
}: {
  seed?: Partial<SessionState>
  dispatchSpy?: (a: SessionAction) => void
  onState?: (s: SessionState) => void
  now?: number
}) {
  const [state, realDispatch] = useReducer(sessionReducer, { ...initialSession, ...seed })
  useEffect(() => {
    onState?.(state)
  })
  const dispatch = (a: SessionAction) => {
    dispatchSpy?.(a)
    realDispatch(a)
  }
  return <InterpConfirmScreen state={state} dispatch={dispatch} now={now} />
}

// ---------------------------------------------------------------------------
// The MAPPED-only guard (file header note / task-12-brief.md's own
// "Everything else" override of design note 1's literal composition text).

describe('renders nothing outside the mapped path', () => {
  it('renders null with no active interpretation', () => {
    const { container } = render(<InterpConfirmScreen state={initialSession} dispatch={vi.fn()} now={1000} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders null when interp.unplaceable is true — Task 14\'s own file, not composed in here', () => {
    const interp = makeInterp({ unplaceable: true, mappings: [] })
    const { container } = render(<InterpConfirmScreen state={{ ...initialSession, interp }} dispatch={vi.fn()} now={1000} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// ---------------------------------------------------------------------------
// Static structure — crumbs, headline, framing paragraph, "You wrote",
// primary action, quiet exit, simulator label.

describe('static render, by registered string', () => {
  it('renders the crumbs, headline, framing paragraph, the full "You wrote" text, the primary action, the quiet exit and the simulator label', () => {
    const interp = fixtureA()
    render(<InterpConfirmScreen state={{ ...initialSession, interp }} dispatch={vi.fn()} now={1000} />)
    expect(screen.getByText(UI.interp.crumbTail)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: UI.interp.headline })).toBeInTheDocument()
    expect(screen.getByText(UI.interp.framingParagraph)).toBeInTheDocument()
    expect(screen.getByText(`"${interp.text}"`)).toBeInTheDocument() // NEVER truncated
    expect(screen.getByRole('button', { name: UI.interp.useTheseAnswers })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.interp.answerMyself })).toBeInTheDocument()
    expect(screen.getByText(UI.interp.simulatorNote)).toBeInTheDocument()
  })

  it('D8\'s semicolon: the rendered framing paragraph contains "; the verified playbook does that" (the prototype\'s semicolon, not the spec\'s/PRD\'s em-dash paraphrase)', () => {
    render(<InterpConfirmScreen state={{ ...initialSession, interp: fixtureA() }} dispatch={vi.fn()} now={1000} />)
    const para = screen.getByText(UI.interp.framingParagraph)
    expect(para.textContent, 'D8: the prototype\'s semicolon, not an em-dash paraphrase').toContain('; the verified playbook does that')
  })
})

// ---------------------------------------------------------------------------
// The two card variants (design note 3, D12's seen heuristic).

describe('card variants', () => {
  it('a seen question (q1, chain[0] — the screen the citizen typed on) with a closed reveal renders the resolved label (not the value), the span quote, and the Change control — and NOT the full option list', () => {
    const interp = fixtureA()
    const { container } = render(<InterpConfirmScreen state={{ ...initialSession, interp }} dispatch={vi.fn()} now={1000} />)
    const cards = [...container.querySelectorAll('.read-card')]
    const q1Card = cards.find(c => c.querySelector('.read-q')?.textContent === UI.interp.qLabel.q1)!
    expect(q1Card).toBeTruthy()
    const pick = q1Card.querySelector('.read-pick')!
    expect(pick.textContent).toBe(PASSPORT_Q1_LABELS.adverse) // the LABEL, not the raw value 'adverse'
    expect(q1Card.querySelector('.span-quote')).toBeInTheDocument()
    const change = q1Card.querySelector('.read-change')!
    expect(change).toHaveAttribute('aria-expanded', 'false')
    expect(q1Card.querySelector('.read-opts')).not.toBeInTheDocument()
  })

  it('a never-seen question (q2) renders the full option list with the AI\'s pick carrying .picked and aria-pressed="true", every other option aria-pressed="false", and NO lone .read-pick label (FR-AI-03: "no lone-label anchoring")', () => {
    const interp = fixtureA()
    const { container } = render(<InterpConfirmScreen state={{ ...initialSession, interp }} dispatch={vi.fn()} now={1000} />)
    const cards = [...container.querySelectorAll('.read-card')]
    const q2Card = cards.find(c => c.querySelector('.read-q')?.textContent === UI.interp.qLabel.q2)!
    expect(q2Card).toBeTruthy()
    expect(q2Card.querySelector('.read-pick'), 'FR-AI-03: no lone-label anchoring').not.toBeInTheDocument()
    const opts = [...q2Card.querySelectorAll('.ropt')]
    expect(opts).toHaveLength(Object.keys(PASSPORT_Q2_LABELS).length)
    const picked = q2Card.querySelector('.ropt.picked')!
    expect(picked).toHaveAttribute('aria-pressed', 'true')
    expect(picked.textContent).toContain(PASSPORT_Q2_LABELS.informal)
    const others = opts.filter(o => o !== picked)
    expect(others.length).toBeGreaterThan(0)
    for (const o of others) expect(o).toHaveAttribute('aria-pressed', 'false')
    // A never-seen question has no closed state to offer a way back into —
    // no Change control at all (design note 6 / D11's own scope).
    expect(q2Card.querySelector('.read-change')).not.toBeInTheDocument()
  })

  it('SIR label resolution passes the phase: a sirQ1 card in a claims_notice-phase case renders that phase\'s label, not the other\'s (design note 4\'s six-lookups hazard)', () => {
    const interp = makeInterp({
      ctxScreen: 'sir-q1', engine: 'sir', service: UI.serviceLabel.sir,
      text: "I checked the draft roll and my name isn't there",
      mappings: [
        { questionId: 'sirQ1', value: 'roll_absent', span: "my name isn't there", optionValues: Object.keys(SIR_Q1_OPTIONS_FOR.claims_notice) },
      ],
    })
    const { container } = render(
      <InterpConfirmScreen state={{ ...initialSession, interp, answers: { sirState: 'delhi' } }} dispatch={vi.fn()} now={1000} />,
    )
    expect(container.textContent).toContain(SIR_Q1_OPTIONS_FOR.claims_notice.roll_absent)
    expect(container.textContent).not.toContain(SIR_Q1_OPTIONS_FOR.final_roll.final_present)
  })
})

// ---------------------------------------------------------------------------
// D11: the persistent, live-aria-expanded Change control.

describe('D11: the accessible reveal control', () => {
  it(
    'the Change control is present in both states; aria-expanded is "false" closed and "true" open; opening moves focus ' +
    'to the first option; collapsing (via fireEvent.click, not userEvent.click — focus is already away from the control, ' +
    'on the first option, so a passing final assertion can only be explained by the component\'s own focus() call, the ' +
    'same discrimination Task 11 fix round 1 established) returns focus to the control',
    async () => {
      expect.assertions(4)
      const user = userEvent.setup()
      render(<Harness seed={{ interp: fixtureA() }} />)
      const closedChange = screen.getByRole('button', { name: UI.interp.change })
      expect(closedChange).toHaveAttribute('aria-expanded', 'false')
      await user.click(closedChange)
      const openChange = screen.getByRole('button', { name: UI.interp.change })
      expect(openChange).toHaveAttribute('aria-expanded', 'true')
      const firstOpt = document.querySelector('.read-opts .ropt') as HTMLElement
      expect(firstOpt).toHaveFocus()
      fireEvent.click(openChange)
      const closedAgain = screen.getByRole('button', { name: UI.interp.change })
      expect(closedAgain).toHaveFocus()
    },
  )
})

// ---------------------------------------------------------------------------
// The safeguard proving itself, and the branch-pruning live assertion.

describe('the wrong-reading correction, end to end (FR-AI-06)', () => {
  it('seeding the simulator\'s own deliberate flaw (Task 5: q2 "informal" from "Someone from the passport office called me yesterday"), opening Change and picking "no_followup" changes the mapping\'s value, sets changed:true, and removes the span quote — this is the interaction the whole feature\'s safety case rests on', async () => {
    expect.assertions(3)
    const user = userEvent.setup()
    const interp = makeInterp({
      ctxScreen: 'passport-q2', engine: 'passport', service: UI.serviceLabel.passport,
      text: UI.describe.examples['passport-q2'].two,
      mappings: [
        { questionId: 'q2', value: 'informal', span: 'someone from the passport office called me', optionValues: Object.keys(PASSPORT_Q2_LABELS) },
      ],
    })
    let latest: SessionState | undefined
    render(<Harness seed={{ interp }} onState={s => { latest = s }} />)
    // 'passport-q2' is a single-question chain: q2 is chain[0], seen, closed by default.
    await user.click(screen.getByRole('button', { name: UI.interp.change }))
    await user.click(screen.getByRole('button', { name: PASSPORT_Q2_LABELS.no_followup }))
    const q2 = latest!.interp!.mappings.find(m => m.questionId === 'q2') as GatedMapping
    expect(q2.value, "this is the interaction the whole feature's safety case rests on").toBe('no_followup')
    expect(q2.changed).toBe(true)
    expect(document.querySelector('.span-quote'), 'design note 5: the span no longer justifies a value the model never proposed').not.toBeInTheDocument()
  })
})

describe('branch pruning after a repick — AC-AI-3\'s own named live assertion', () => {
  it('an interpretation with voterQ1:decision and voterAppealedRaw:pending, repicked to voterQ1:no_word, renders one card and the discard note appears', async () => {
    const user = userEvent.setup()
    const interp = makeInterp({
      ctxScreen: 'voter-q1', engine: 'voter', service: UI.serviceLabel.voterServices,
      text: 'I got a decision and appealed, still waiting to hear back',
      mappings: [
        { questionId: 'voterQ1', value: 'decision', span: 'I got a decision', optionValues: Object.keys(VOTER_Q1_LABELS) },
        { questionId: 'voterAppealedRaw', value: 'pending', span: 'still waiting to hear back', optionValues: Object.keys(VOTER_APPEAL_LABELS) },
      ],
    })
    const { container } = render(<Harness seed={{ interp }} />)
    expect(container.querySelectorAll('.read-card')).toHaveLength(2)
    // voterQ1 is chain[0] for 'voter-q1' — seen, closed by default.
    await user.click(screen.getByRole('button', { name: UI.interp.change }))
    await user.click(screen.getByRole('button', { name: VOTER_Q1_LABELS.no_word }))
    expect(container.querySelectorAll('.read-card'), 'AC-AI-3: voter Q2 mapping must vanish when Q1 changes').toHaveLength(1)
    expect(container.textContent).toContain(
      UI.interp.discardNote.replace('{question}', UI.interp.qLabel.voterAppealedRaw.toLowerCase()),
    )
  })

  it('repick does not mutate the previous interp (the wiring — purity itself is Task 2\'s own repick test)', async () => {
    const user = userEvent.setup()
    const interp = makeInterp({
      ctxScreen: 'voter-q1', engine: 'voter', service: UI.serviceLabel.voterServices,
      text: 'I got a decision and appealed, still waiting to hear back',
      mappings: [
        { questionId: 'voterQ1', value: 'decision', span: 'I got a decision', optionValues: Object.keys(VOTER_Q1_LABELS) },
        { questionId: 'voterAppealedRaw', value: 'pending', span: 'still waiting to hear back', optionValues: Object.keys(VOTER_APPEAL_LABELS) },
      ],
    })
    const before = structuredClone(interp)
    render(<Harness seed={{ interp }} />)
    await user.click(screen.getByRole('button', { name: UI.interp.change }))
    await user.click(screen.getByRole('button', { name: VOTER_Q1_LABELS.no_word }))
    expect(interp, 'the fixture object handed in as the seed must be untouched by the dispatch\'s effect').toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// The discard note (design note 9): first item only, lowercased.

describe('the discard note', () => {
  it('renders the FIRST discarded item\'s label, lowercased, and renders nothing when discarded is empty', () => {
    const interp = makeInterp({
      ctxScreen: 'voter-q1', engine: 'voter', service: UI.serviceLabel.voterServices,
      text: 'text',
      mappings: [{ questionId: 'voterQ1', value: 'no_word', span: 'no word yet', optionValues: Object.keys(VOTER_Q1_LABELS) }],
      discarded: [
        { questionId: 'voterAppealedRaw', reason: 'unreachable' },
        { questionId: 'sirQ1', reason: 'unreachable' }, // deliberately irrelevant second entry — must NOT render
      ],
    })
    const { container, rerender } = render(<InterpConfirmScreen state={{ ...initialSession, interp }} dispatch={vi.fn()} now={1000} />)
    expect(container.textContent).toContain(
      UI.interp.discardNote.replace('{question}', UI.interp.qLabel.voterAppealedRaw.toLowerCase()),
    )
    expect(container.textContent, 'only the FIRST discarded item is ever named').not.toContain(UI.interp.qLabel.sirQ1.toLowerCase())

    const interpNoDiscard = makeInterp({ mappings: interp.mappings, discarded: [] })
    rerender(<InterpConfirmScreen state={{ ...initialSession, interp: interpNoDiscard }} dispatch={vi.fn()} now={1000} />)
    expect(container.querySelector('.small')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// A11y (design note 10, spec §7): focus-on-mount, the live-region summary,
// and the visually-hidden span prefix.

describe('a11y (design note 10, spec §7)', () => {
  it('focus is on the <h1> after mount; a visually-hidden live region exists with aria-live="polite" and contains the composed summary; the span prefix is present as text inside the span quote', () => {
    const interp = fixtureA() // 2 mappings, 0 facts, 0 discarded
    render(<InterpConfirmScreen state={{ ...initialSession, interp }} dispatch={vi.fn()} now={1000} />)
    expect(document.querySelector('h1')).toHaveFocus()
    const live = document.querySelector('.vh[aria-live="polite"]')
    expect(live).toBeInTheDocument()
    expect(live!.textContent).toContain(UI.interp.summary.matchedMany.replace('{matched}', '2'))
    expect(live!.textContent).toContain(UI.interp.summary.factsMany.replace('{facts}', '0'))
    const spanQuoteEl = document.querySelector('.span-quote')!
    const prefixSpan = spanQuoteEl.querySelector('.vh')!
    expect(prefixSpan.textContent).toBe(UI.interp.spanPrefix)
  })

  it('the summary uses the digit-free "One"/"one" literals at exactly n=1, and the discarded clause only when something was set aside', () => {
    const interp = makeInterp({
      ctxScreen: 'passport-q2', engine: 'passport', service: UI.serviceLabel.passport,
      text: 'text',
      mappings: [{ questionId: 'q2', value: 'informal', span: 'called the office twice', optionValues: Object.keys(PASSPORT_Q2_LABELS) }],
      facts: [{ kind: 'reference_number', refType: 'passport_file_no', label: 'File Number', value: 'BN1068334517807', fills: null }],
      discarded: [{ questionId: 'q1', reason: 'unreachable' }],
    })
    render(<InterpConfirmScreen state={{ ...initialSession, interp }} dispatch={vi.fn()} now={1000} />)
    const live = document.querySelector('.vh[aria-live="polite"]')!
    expect(live.textContent).toContain(UI.interp.summary.matchedOne)
    expect(live.textContent).toContain(UI.interp.summary.factsOne)
    expect(live.textContent).toContain(UI.interp.summary.discardedNote)
  })
})

// ---------------------------------------------------------------------------
// The primary action and the quiet exit.

describe('primary action and quiet exit', () => {
  it('"Use these answers" dispatches APPLY_INTERPRETATION with the injected clock', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    render(<InterpConfirmScreen state={{ ...initialSession, interp: fixtureA() }} dispatch={dispatch} now={54321} />)
    await user.click(screen.getByRole('button', { name: UI.interp.useTheseAnswers }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'APPLY_INTERPRETATION', now: 54321 })
  })

  it('the quiet exit dispatches BACK and dispatches nothing else — a stray answer write here would violate AC-AI-1', async () => {
    expect.assertions(2)
    const user = userEvent.setup()
    const dispatch = vi.fn()
    render(<InterpConfirmScreen state={{ ...initialSession, interp: fixtureA() }} dispatch={dispatch} now={1000} />)
    await user.click(screen.getByRole('button', { name: UI.interp.answerMyself }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'BACK' })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})
