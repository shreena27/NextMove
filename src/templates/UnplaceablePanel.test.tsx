// RED for Task 14 — UnplaceablePanel, port of the prototype's
// `renderInterpConfirm`'s UNPLACEABLE branch (design/nextmove-v1-
// prototype.html, 3044-3065): the screen a citizen sees when the AI
// interpretation fails or can't confidently place their text (FR-AI-05).
// NOT YET WIRED into App.tsx's router (Task 17's job) — every test here
// renders the component directly, the same way InterpConfirmScreen.test.tsx
// (Task 12) and FactChips.test.tsx (Task 13) did before their own mount
// sites existed in the router-reachable sense.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnplaceablePanel } from './UnplaceablePanel'
import { DescribeBlock } from './DescribeBlock'
import { UI } from '../screens/screenCopy'
import type { Fact, GatedInterpretation, DescribeEntryScreenId } from '../domain/interpret'
import type { InterpretationFailure } from '../session/interpretation'
import {
  sessionReducer, initialSession, type SessionState, type ActiveInterpretation,
} from '../session/session'
import { PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS, VOTER_ENTRY_LABELS } from '../screens/labels'

afterEach(() => {
  vi.unstubAllEnvs()
})

// Same test-only escape hatch InterpConfirmScreen.test.tsx's own `makeInterp`
// establishes as the sanctioned way to build a GatedInterpretation-shaped
// fixture outside interpretGates.ts's sole real constructor — re-declared
// here (this codebase's "own its own fixtures" convention, FactChips.test.
// tsx's own header note), never imported. Defaults describe an unplaceable
// interpretation with no mappings (unplaceable ⇒ mappings.length === 0 by
// construction, interpretGates.ts's own `gateInterpretation`) — every field
// is overridable.
function makeInterp(overrides: Partial<ActiveInterpretation> = {}): ActiveInterpretation {
  return {
    __gated: 'test-only' as unknown as GatedInterpretation['__gated'],
    mappings: [],
    discarded: [],
    facts: [],
    droppedSensitive: false,
    unplaceable: true,
    provenance: 'none — interpretation failed',
    ctxScreen: 'passport-q1',
    engine: 'passport',
    service: UI.serviceLabel.passport,
    text: 'default fixture text',
    ...overrides,
  }
}

const FILE_NUMBER_FACT: Fact = {
  kind: 'reference_number', refType: 'passport_file_no', label: 'File Number',
  value: 'BN1068334517807', fills: null,
}

/** Drives the REAL reducer arm this panel's data always comes from in
 *  production (`INTERPRETATION_FAILED`, session.ts) rather than hand-
 *  building an `ActiveInterpretation` for the "no technical reason leaks"
 *  and "non-blaming sentence" tests below — the most faithful way to prove
 *  the component never surfaces `reason`, since `reason` genuinely isn't
 *  part of `ActiveInterpretation` at all; the only way to check "for every
 *  reason that can produce one" is to actually produce one, per reason,
 *  the way the reducer does. */
function failedState(reason: InterpretationFailure, screen: DescribeEntryScreenId = 'passport-q1'): SessionState {
  return sessionReducer(
    { ...initialSession, screen, describeText: 'Police came to my house but nothing has moved since I filed' },
    { type: 'INTERPRETATION_FAILED', reason },
  )
}

// The three reasons that actually navigate here (session.ts's
// INTERPRETATION_FAILED: 'quota' does not navigate — I7, its own describe
// block below — and 'disabled' never reaches an interpretation attempt at
// all, DescribeBlock's own flag guard).
const NAVIGATING_REASONS = ['failed', 'no-provider', 'no-chain'] as const

// ---------------------------------------------------------------------------
// The mirror image of InterpConfirmScreen.test.tsx's own "MAPPED-only" guard
// — this component renders ONLY the unplaceable path.

describe('renders nothing outside the unplaceable path', () => {
  it('renders null with no active interpretation', () => {
    const { container } = render(<UnplaceablePanel state={initialSession} dispatch={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders null when interp.unplaceable is false — InterpConfirmScreen\'s own file, not composed in here', () => {
    const interp = makeInterp({
      unplaceable: false,
      mappings: [{ questionId: 'q1', value: 'adverse', span: 'nothing has moved', optionValues: Object.keys(PASSPORT_Q1_LABELS) }],
    })
    const { container } = render(<UnplaceablePanel state={{ ...initialSession, interp }} dispatch={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// ---------------------------------------------------------------------------
// Static structure — headline, lede, "You wrote", the full option list, the
// simulator label (design notes 1 and 7).

describe('static render, by registered string', () => {
  it('renders the headline, the full lede, "You wrote" with the citizen\'s text, the full option list and the simulator label', () => {
    const interp = makeInterp({
      ctxScreen: 'passport-q1',
      text: 'Police came to my house but nothing has moved since. I called the office twice.',
    })
    const { container } = render(<UnplaceablePanel state={{ ...initialSession, interp }} dispatch={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: UI.unplaceable.headline })).toBeInTheDocument()
    expect(screen.getByText(UI.unplaceable.lede)).toBeInTheDocument()
    expect(screen.getByText(UI.interp.youWrote)).toBeInTheDocument()
    expect(screen.getByText(`"${interp.text}"`)).toBeInTheDocument() // NEVER truncated
    const opts = [...container.querySelectorAll('.ropt')]
    expect(opts).toHaveLength(Object.keys(PASSPORT_Q1_LABELS).length)
    for (const label of Object.values(PASSPORT_Q1_LABELS)) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText(UI.interp.simulatorNote)).toBeInTheDocument()
  })

  it('renders no discard note when discarded is empty (the INTERPRETATION_FAILED-synthesised case, always empty)', () => {
    const interp = makeInterp({ discarded: [] })
    const { container } = render(<UnplaceablePanel state={{ ...initialSession, interp }} dispatch={vi.fn()} />)
    expect(container.querySelector('.small')).not.toBeInTheDocument()
  })

  it('renders the FIRST discarded item\'s label, lowercased, when a provider-proposed unplaceable interpretation carries discards (all its mappings dropped as unreachable, but the interpretation itself is still discard-bearing)', () => {
    const interp = makeInterp({
      discarded: [
        { questionId: 'voterAppealedRaw', reason: 'unreachable' },
        { questionId: 'sirQ1', reason: 'unreachable' }, // deliberately irrelevant second entry — must NOT render
      ],
    })
    const { container } = render(<UnplaceablePanel state={{ ...initialSession, interp }} dispatch={vi.fn()} />)
    expect(container.textContent).toContain(
      UI.interp.discardNote.replace('{question}', UI.interp.qLabel.voterAppealedRaw.toLowerCase()),
    )
    expect(container.textContent, 'only the FIRST discarded item is ever named').not.toContain(UI.interp.qLabel.sirQ1.toLowerCase())
  })
})

// ---------------------------------------------------------------------------
// Design note 2: which question is offered.

describe('the offered question (design note 2)', () => {
  it('is the first UNANSWERED question in the chain', () => {
    const interp = makeInterp({ ctxScreen: 'passport-q1' })
    const { container } = render(
      <UnplaceablePanel state={{ ...initialSession, interp, answers: { q1: 'adverse' } }} dispatch={vi.fn()} />,
    )
    expect(container.querySelector('.read-q')?.textContent).toBe(UI.interp.qLabel.q2)
    const opts = [...container.querySelectorAll('.ropt')].map(o => o.textContent ?? '')
    for (const label of Object.values(PASSPORT_Q2_LABELS)) expect(opts.some(o => o.includes(label))).toBe(true)
    for (const label of Object.values(PASSPORT_Q1_LABELS)) expect(opts.some(o => o.includes(label))).toBe(false)
  })

  it('falls back to chain[0] once every question in the chain is already answered — the crash guard: without the "?? chain[0]" fallback this would offer undefined and throw', () => {
    const interp = makeInterp({ ctxScreen: 'passport-q1' })
    const { container } = render(
      <UnplaceablePanel
        state={{ ...initialSession, interp, answers: { q1: 'adverse', q2: 'informal' } }}
        dispatch={vi.fn()}
      />,
    )
    expect(container.querySelector('.read-q')?.textContent).toBe(UI.interp.qLabel.q1)
  })

  it('D2\'s case: for the voter-entry chain with answers: {}, the offered question is voterEntry, not voterQ1 — voterEntry is never written into `answers`, even once a citizen has confirmed it (Task 7\'s unplaceablePickPlan, its own "writes: []" for this case), so a reader who forgets D2 and treats "the screen the citizen typed on" as already-answered will wrongly expect voterQ1 here', () => {
    const interp = makeInterp({ ctxScreen: 'voter-entry', engine: 'voter', service: UI.serviceLabel.voterServices })
    const { container } = render(
      <UnplaceablePanel state={{ ...initialSession, interp, answers: {} }} dispatch={vi.fn()} />,
    )
    expect(container.querySelector('.read-q')?.textContent).toBe(UI.interp.qLabel.voterEntry)
    const opts = [...container.querySelectorAll('.ropt')].map(o => o.textContent ?? '')
    // VOTER_ENTRY_LABELS carries a THIRD key, 'notsure' (VOTER_COPY.entry.
    // notSure), that the describe chain's own VOTER_ENTRY_VALUES deliberately
    // excludes (interpret.ts's own comment: "'notsure' is deliberately
    // excluded — 'I'm not sure' is never something a describe mapping should
    // produce") — so this checks only the two values genuinely offered, not
    // every label the map happens to carry.
    expect(opts).toHaveLength(2)
    expect(opts.some(o => o.includes(VOTER_ENTRY_LABELS.applied))).toBe(true)
    expect(opts.some(o => o.includes(VOTER_ENTRY_LABELS.sir))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Design note: picking an option — the second of AC-AI-1's two permitted
// paths.

describe('picking an option', () => {
  it('dispatches UNPLACEABLE_PICK carrying the facts and the text this panel is currently rendering, and nothing else', async () => {
    expect.assertions(2)
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const interp = makeInterp({
      ctxScreen: 'passport-q1',
      text: 'Police came to my house but nothing has moved since.',
      facts: [FILE_NUMBER_FACT],
      provenance: 'none — interpretation failed',
    })
    render(<UnplaceablePanel state={{ ...initialSession, interp }} dispatch={dispatch} />)
    await user.click(screen.getByRole('button', { name: PASSPORT_Q1_LABELS.adverse }))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UNPLACEABLE_PICK',
      questionId: 'q1',
      value: 'adverse',
      facts: interp.facts,
      text: interp.text,
      provenance: interp.provenance,
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Design note 4 / spec §1 / FR-AI-05 — the text is preserved, visibly and in
// state.

describe('the text survives (design note 4, spec §1, FR-AI-05)', () => {
  it('after INTERPRETATION_FAILED, state.describeText is unchanged, and pressing Back renders the describe box still populated with it — the second is the one a "clear the box on failure" instinct would break', () => {
    expect.assertions(2)
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const seed: SessionState = {
      ...initialSession, screen: 'passport-q1', describeText: 'nothing has moved since I filed', describeOpen: true,
    }
    const afterFailed = sessionReducer(seed, { type: 'INTERPRETATION_FAILED', reason: 'failed' })
    expect(
      afterFailed.describeText,
      'spec §1: describeText is untouched by INTERPRETATION_FAILED',
    ).toBe('nothing has moved since I filed')
    // BACK pops the pushed history entry ('passport-q1') back onto
    // `screen` — this test renders DescribeBlock DIRECTLY off the resulting
    // state (a pure sessionReducer computation, no live component tree
    // needed) to prove the box a citizen sees after pressing Back is still
    // populated, not the fact that some abstract state field survived.
    const afterBack = sessionReducer(afterFailed, { type: 'BACK' })
    render(<DescribeBlock screenId={afterBack.screen} state={afterBack} dispatch={vi.fn()} />)
    expect(
      screen.getByRole('textbox', { name: UI.describe.ariaLabel }),
      'FR-AI-05: pressing Back returns the citizen to their own words, not an empty box',
    ).toHaveValue('nothing has moved since I filed')
  })
})

// ---------------------------------------------------------------------------
// Design note 5 — every failure reason renders the SAME panel.

describe('every failure reason renders the SAME panel (design note 5)', () => {
  it.each(NAVIGATING_REASONS)(
    'no technical reason reaches the DOM for reason=%s — a citizen does not need the technical reason, and naming one would be both useless and a small provider-identity leak',
    reason => {
      const { container } = render(<UnplaceablePanel state={failedState(reason)} dispatch={vi.fn()} />)
      const text = (container.textContent ?? '').toLowerCase()
      for (const forbidden of ['failed', 'no-provider', 'no-chain', 'quota', 'json', 'timeout', 'error']) {
        expect(text, `must not leak the technical reason/word "${forbidden}"`).not.toContain(forbidden)
      }
    },
  )

  it.each(NAVIGATING_REASONS)(
    'the non-blaming first sentence renders, by the WHOLE registered lede string, for reason=%s (spec §7 / FR-AI-05: copy never blames the user for what they wrote)',
    reason => {
      render(<UnplaceablePanel state={failedState(reason)} dispatch={vi.fn()} />)
      expect(screen.getByText(UI.unplaceable.lede)).toBeInTheDocument()
    },
  )
})

// ---------------------------------------------------------------------------
// Design note 6 / I7 — 'quota' never reaches this panel at all.

describe("'quota' never reaches this panel (design note 6, I7)", () => {
  it(
    'dispatching INTERPRETATION_FAILED { reason: \'quota\' } through the real reducer leaves the screen unchanged and ' +
    'this component absent — spec §2: "the entry row is hidden, not broken"; a "we couldn\'t safely place this" panel ' +
    'here would be the wrong lie, because nothing was read at all',
    () => {
      const seed: SessionState = { ...initialSession, screen: 'passport-q1', describeText: 'nothing has moved since I filed' }
      const result = sessionReducer(seed, { type: 'INTERPRETATION_FAILED', reason: 'quota' })
      expect(result.screen, 'I7: the citizen stays on their own question screen, this arm does not navigate at all').toBe('passport-q1')
      expect(result.interp).toBeNull()
      const { container } = render(<UnplaceablePanel state={result} dispatch={vi.fn()} />)
      expect(container).toBeEmptyDOMElement()
    },
  )
})

// ---------------------------------------------------------------------------
// FactChips composition (Task 13's own file) — the unplaceable path still
// shows facts, since they passed the verbatim gate independently of any
// mapping (design note 8 of task-13-brief.md).

describe('fact chips — this panel\'s own composition (prototype 3062)', () => {
  it('facts present render one chip per fact, with the registered "What we picked up" heading', () => {
    const interp = makeInterp({ facts: [FILE_NUMBER_FACT] })
    render(<UnplaceablePanel state={{ ...initialSession, interp }} dispatch={vi.fn()} />)
    expect(screen.getByText(UI.facts.pickedUpKey)).toBeInTheDocument()
    expect(document.querySelectorAll('.fchip')).toHaveLength(1)
    expect(document.querySelector('.fchip')).toHaveTextContent('BN1068334517807')
  })

  it('the Aadhaar refusal renders when droppedSensitive is true, even with no facts at all (FactChips\' own state 2)', () => {
    const interp = makeInterp({ facts: [], droppedSensitive: true })
    render(<UnplaceablePanel state={{ ...initialSession, interp }} dispatch={vi.fn()} />)
    expect(screen.getByText(UI.facts.aadhaarRefused)).toBeInTheDocument()
  })

  it('no facts and droppedSensitive:false renders no fact-chips DOM at all', () => {
    const interp = makeInterp({ facts: [], droppedSensitive: false })
    render(<UnplaceablePanel state={{ ...initialSession, interp }} dispatch={vi.fn()} />)
    expect(document.querySelector('.fact-chips')).not.toBeInTheDocument()
    expect(screen.queryByText(UI.facts.pickedUpKey)).not.toBeInTheDocument()
  })
})
