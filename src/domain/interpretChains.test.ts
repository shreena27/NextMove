// TEST-ONLY, and deliberately so: this is D1's cross-layer pin. It imports
// screens/labels.ts, screens/screenCopy.ts and playbooks/sirPlaybook.ts
// alongside domain/interpret.ts, which application (non-test) code under
// domain/ never does — interpret.ts itself hardcodes its option-value
// literals, transcribed from the prototype, precisely so it never needs a
// screens/ import. guardrails/isolation.test.ts's own doc comment confirms
// it walks non-test .ts/.tsx files only (and excludes *.test.ts/*.test.tsx
// by name), so this file breaks nothing there.
//
// A plain .ts file, per the task brief's own file list — not .tsx — so
// every render call below uses React.createElement rather than JSX syntax
// (esbuild's `.ts` loader does not parse JSX).
//
// Three things live here:
//  1. D1's pin (design note 6): every chain entry's optionValues matches
//     the real label map it is transcribed from, exactly.
//  2. D15's VoterEntry render-parity pin (design note 6a).
//  3. I10's onSelect-parity pin (design note 8): each of the six real
//     question components, rendered and clicked, must dispatch exactly
//     what unplaceablePickPlan predicts for the same (questionId, value).
import { describe, it, expect, vi } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnswerRecord } from './types'
import type { SessionState, SessionAction } from '../session/session'
import { initialSession } from '../session/session'
import type { UnplaceablePickPlan } from './interpret'
import { DESCRIBE_CHAINS, sirQ1OptionValues, unplaceablePickPlan } from './interpret'
import {
  PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS, VOTER_Q1_LABELS, VOTER_APPEAL_LABELS, VOTER_ENTRY_LABELS,
} from '../screens/labels'
import { PASSPORT_COPY, VOTER_COPY, SIR_COPY } from '../screens/screenCopy'
import { SIR_PHASES, SIR_Q1_OPTIONS_FOR } from '../playbooks/sirPlaybook'
import { PassportQ1, PassportQ2 } from '../screens/passport/PassportScreens'
import { VoterEntry, VoterQ1, VoterQ2 } from '../screens/voter/VoterScreens'
import { SirQ1 } from '../screens/sir/SirScreens'
import type { ScreenProps } from '../screens/screenProps'
import type { AnswerRowProps } from '../ui/AnswerRow'

vi.mock('../ui/AnswerRow', async importOriginal => {
  const actual = await importOriginal<typeof import('../ui/AnswerRow')>()
  return { ...actual, AnswerRow: vi.fn(actual.AnswerRow) }
})
import { AnswerRow } from '../ui/AnswerRow'

// ---------------------------------------------------------------------------
// 1. D1's cross-layer pin (design note 6)

const EXPECTED_VALUES: Record<string, readonly string[]> = {
  q1: [...Object.keys(PASSPORT_Q1_LABELS)].sort(),
  q2: [...Object.keys(PASSPORT_Q2_LABELS)].sort(),
  // Explicit lists, not `.filter(v => v !== 'notsure')` — so an accidental
  // ADDITION of 'notsure' to either chain entry also fails this test
  // (design note 6's own instruction).
  voterEntry: ['applied', 'sir'].sort(),
  voterQ1: [...Object.keys(VOTER_Q1_LABELS)].sort(),
  voterAppealedRaw: ['decided', 'none', 'pending'].sort(),
}

describe("D1's cross-layer pin: every non-SIR chain entry's optionValues matches the real label map, exactly", () => {
  const rows = Object.entries(DESCRIBE_CHAINS).flatMap(([screenId, describeChain]) =>
    describeChain.chain
      .filter(entry => typeof entry.optionValues !== 'function')
      .map(entry => [screenId, entry.questionId, entry.optionValues as readonly string[]] as const),
  )

  it('found chain entries to check (the check itself is not vacuous)', () => {
    expect(rows.length).toBeGreaterThan(0)
  })

  it.each(rows)(
    '%s -> %s: optionValues matches the real map exactly — the enum gate is only as good as this list; a label added to labels.ts without being added here is an option the citizen can pick by tapping but never by describing, and the reverse is a value the confirm screen cannot render a label for',
    (_screenId, questionId, values) => {
      expect([...values].sort()).toEqual(EXPECTED_VALUES[questionId])
    },
  )
})

describe("D1's cross-layer pin: SIR's two phases (design note 6) — a union across phases would let a mapping produce a value real for the OTHER phase, an enum-gate hole that looks like nothing", () => {
  it('claims_notice phase resolves to exactly SIR_Q1_OPTIONS_FOR.claims_notice', () => {
    const entry = DESCRIBE_CHAINS['sir-q1'].chain[0]
    const fn = entry.optionValues as (a: AnswerRecord) => readonly string[]
    expect([...fn({ sirState: 'delhi' })].sort()).toEqual([...Object.keys(SIR_Q1_OPTIONS_FOR.claims_notice)].sort())
  })

  it('final_roll phase resolves to exactly SIR_Q1_OPTIONS_FOR.final_roll (no real SIR_STATES entry is in this phase yet — Delhi is still claims_notice — so tested directly against the real phase data, same technique interpret.test.ts uses)', () => {
    const values = sirQ1OptionValues({ id: 'x', name: 'X', supported: true, phase: SIR_PHASES.final_roll })
    expect([...values].sort()).toEqual([...Object.keys(SIR_Q1_OPTIONS_FOR.final_roll)].sort())
  })
})

// ---------------------------------------------------------------------------
// 2. D15's VoterEntry render-parity pin (design note 6a)

describe("D15's VoterEntry render-parity pin (design note 6a): a literal edited in VoterScreens.tsx without the map fails; a map key edited without the component fails — this entry's option values are literals in a component, so the map is only honest if a rendered-parity test keeps it honest", () => {
  it('the three rendered AnswerRow value props are exactly Object.keys(VOTER_ENTRY_LABELS) and their labels exactly its values', () => {
    const mockedAnswerRow = vi.mocked(AnswerRow)
    mockedAnswerRow.mockClear()
    render(createElement(VoterEntry, { state: initialSession, dispatch: vi.fn() }))
    const props = mockedAnswerRow.mock.calls.map(call => call[0] as AnswerRowProps)
    expect(props.map(p => p.value)).toEqual(Object.keys(VOTER_ENTRY_LABELS))
    expect(props.map(p => p.label)).toEqual(Object.values(VOTER_ENTRY_LABELS))
  })
})

// ---------------------------------------------------------------------------
// 3. I10's onSelect-parity pin (design note 8): render each of the six real
// question components, click each offered option, capture the dispatched
// actions, and assert they deep-equal unplaceablePickPlan's output for the
// same (questionId, value).

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return { ...initialSession, ...overrides }
}

/** Reconstructs an UnplaceablePickPlan-shaped value from the raw dispatched
 *  actions a real component's onSelect produced, so it can be compared
 *  directly against unplaceablePickPlan's output. Order-preserving (the
 *  voterAppealedRaw dual write's "raw first" ordering matters). */
function actionsToPlan(actions: SessionAction[]): UnplaceablePickPlan {
  const writes = actions
    .filter((a): a is Extract<SessionAction, { type: 'ANSWER' }> => a.type === 'ANSWER')
    .map(a => ({ service: a.service, key: a.key, value: a.value }))
  const nav = actions.find((a): a is Extract<SessionAction, { type: 'NAVIGATE' }> => a.type === 'NAVIGATE')
  const explained = actions.some(a => a.type === 'EXPLAIN_VOTER_ENTRY')
  if (explained) return { writes, screen: null, explain: true }
  return { writes, screen: nav ? nav.screen : null }
}

/** Clicks the AnswerRow whose visible label text is exactly `label` —
 *  scoped to the `.arow-label` element (not the whole button's accessible
 *  name), so a row's optional `sub` text never interferes with the match. */
async function clickAnswerByLabel(label: string) {
  const labelEl = screen.getByText(label, { selector: '.arow-label' })
  const button = labelEl.closest('button')
  if (!button) throw new Error(`no button ancestor for label "${label}"`)
  await userEvent.click(button)
}

interface ParityCase {
  screenName: string
  questionId: string
  value: string
  label: string
  render: (dispatch: (a: SessionAction) => void) => void
}

function renderScreen(Component: ComponentType<ScreenProps>, state: SessionState, dispatch: (a: SessionAction) => void) {
  render(createElement(Component, { state, dispatch }))
}

const sirClaimsNoticeOptions = SIR_Q1_OPTIONS_FOR.claims_notice

const CASES: ParityCase[] = [
  // q1 (PassportScreens.tsx:68-76)
  ...Object.entries(PASSPORT_Q1_LABELS).map(([value, label]): ParityCase => ({
    screenName: 'PassportQ1', questionId: 'q1', value, label,
    render: dispatch => renderScreen(PassportQ1, makeState(), dispatch),
  })),
  {
    screenName: 'PassportQ1', questionId: 'q1', value: 'not_sure', label: PASSPORT_COPY.q1.notSure,
    render: dispatch => renderScreen(PassportQ1, makeState(), dispatch),
  },
  // q2 (PassportScreens.tsx:102-105)
  ...Object.entries(PASSPORT_Q2_LABELS).map(([value, label]): ParityCase => ({
    screenName: 'PassportQ2', questionId: 'q2', value, label,
    render: dispatch => renderScreen(PassportQ2, makeState(), dispatch),
  })),
  // voterEntry (VoterScreens.tsx:30-38)
  { screenName: 'VoterEntry', questionId: 'voterEntry', value: 'applied', label: VOTER_COPY.entry.applied, render: dispatch => renderScreen(VoterEntry, makeState(), dispatch) },
  { screenName: 'VoterEntry', questionId: 'voterEntry', value: 'sir', label: VOTER_COPY.entry.sir, render: dispatch => renderScreen(VoterEntry, makeState(), dispatch) },
  { screenName: 'VoterEntry', questionId: 'voterEntry', value: 'notsure', label: VOTER_COPY.entry.notSure, render: dispatch => renderScreen(VoterEntry, makeState(), dispatch) },
  // voterQ1 (VoterScreens.tsx:72-82)
  ...Object.entries(VOTER_Q1_LABELS).map(([value, label]): ParityCase => ({
    screenName: 'VoterQ1', questionId: 'voterQ1', value, label,
    render: dispatch => renderScreen(VoterQ1, makeState(), dispatch),
  })),
  {
    screenName: 'VoterQ1', questionId: 'voterQ1', value: 'notsure', label: VOTER_COPY.q1.notSure,
    render: dispatch => renderScreen(VoterQ1, makeState(), dispatch),
  },
  // voterAppealedRaw (VoterScreens.tsx:107-113)
  ...Object.entries(VOTER_APPEAL_LABELS).map(([value, label]): ParityCase => ({
    screenName: 'VoterQ2', questionId: 'voterAppealedRaw', value, label,
    render: dispatch => renderScreen(VoterQ2, makeState(), dispatch),
  })),
  // sirQ1 (SirScreens.tsx:145-148) — rendered with a real covered state
  // (Delhi, claims_notice) so optionsForPhase doesn't throw.
  ...Object.entries(sirClaimsNoticeOptions).map(([value, label]): ParityCase => ({
    screenName: 'SirQ1', questionId: 'sirQ1', value, label,
    render: dispatch => renderScreen(SirQ1, makeState({ answers: { sirState: 'delhi' } }), dispatch),
  })),
  {
    screenName: 'SirQ1', questionId: 'sirQ1', value: 'notsure', label: SIR_COPY.q1.notSure,
    render: dispatch => renderScreen(SirQ1, makeState({ answers: { sirState: 'delhi' } }), dispatch),
  },
]

describe('I10 onSelect-parity pin (design note 8): this is a second implementation of six shipped routings; without this test it is a second source of truth that will drift', () => {
  it('found parity cases covering every offered option on all six components (not vacuous)', () => {
    expect(CASES.length).toBe(5 + 3 + 3 + 4 + 4 + 5) // q1, q2, voterEntry, voterQ1, voterAppealedRaw, sirQ1
  })

  it.each(CASES.map(c => [c.screenName, c.questionId, c.value, c] as const))(
    '%s: clicking "%s"/%s dispatches exactly what unplaceablePickPlan predicts',
    async (_screenName, questionId, value, testCase) => {
      const dispatch = vi.fn<(a: SessionAction) => void>()
      testCase.render(dispatch)
      await clickAnswerByLabel(testCase.label)
      const actual = actionsToPlan(dispatch.mock.calls.map(call => call[0]))
      expect(actual).toEqual(unplaceablePickPlan(questionId, value))
    },
  )
})
