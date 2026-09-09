// The single source of truth for which SCREEN_COPY entries no STATIC mount
// can produce (interactionGated.ts's own header comment) needs one real
// place to drive real interactions and prove each one actually renders —
// this file is that place.
//
// RELOCATED HERE (Task 11's review of Task 10's original home,
// PrepareScreen.test.tsx): a test file about ONE component is an awkward
// home for a mechanism that already spans two component's copy
// (`ui:prepare.*` AND `ui:describe.*`, this task's own addition) and will
// span a third and fourth once Tasks 13/15 land (`ui:facts.*`,
// `ui:prepare.hintFilledUnreviewed`). `ControlledPrepareScreen`/`tickAll`
// below are RE-DECLARED, not imported from PrepareScreen.test.tsx — that
// file is not a shared-helper module (importing test helpers cross-file
// would make PrepareScreen.test.tsx a load-bearing dependency of this file,
// the reverse of the "own its own fixtures" convention this codebase's
// other test files already follow, e.g. session.test.ts's own
// independently-declared FIXTURE_INTERP alongside domain/interpret.test.ts's
// structurally-identical makeInterp()).
//
// Fix-round review finding (Task 10, preserved verbatim): a bare "assert
// this hand-typed list equals that hand-typed list" pin does not actually
// FORCE anything — a deleted assertion below it would leave the pin still
// green, and a new entry added to the shared set with no covering function
// here would go unnoticed too. So instead of a plain Set, `assertions`
// below is a Record<at, () => Promise<void>> keyed IDENTICALLY to
// `INTERACTION_GATED`, and `Object.keys(assertions)` is asserted to equal
// `[...INTERACTION_GATED]` — the same pattern screenCopy.test.tsx's own
// `CAPTION_SUBSTITUTIONS` uses for `CAPTION_TEMPLATES`.
//
// AT THE TIME OF THIS MOVE, three entries remained uncovered:
// `ui:facts.editLabel`/`ui:facts.saveLabel` (Task 13) and
// `ui:prepare.hintFilledUnreviewed` (Task 15). Task 11's own obligation here
// was exactly two entries — `ui:describe.err`/`ui:describe.reading`
// (pre-registered by Task 10, anticipating this task) — plus giving the
// mechanism a better home; NOT building Tasks 13/15's own components. The
// single strict-equality assertion at the bottom of the `it` below (fix
// round 1, Finding I-4) is what stayed genuinely red for those three names —
// not a separate `it.each` split — and the comment directly above that
// assertion named all three so a reader (or the next task) could see at a
// glance which keys were still owed and by whom, without re-deriving it
// from the failure alone.
//
// UPDATED (Task 13): `ui:facts.editLabel`/`ui:facts.saveLabel` are now
// closed (`ControlledFactChips` below).
//
// UPDATED (Task 15): `ui:prepare.hintFilledUnreviewed` is now ALSO closed
// (the `'ui:prepare.hintFilledUnreviewed'` entry above, via a synthetic
// one-bracket `PrepPlan` + a matching fact — see that entry's own comment
// for why no click is needed). Every entry `INTERACTION_GATED` names now has
// real covering interaction coverage; none remain gapped.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useReducer, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrepareScreen, type PrepareScreenProps } from '../templates/PrepareScreen'
import { DescribeBlock } from '../templates/DescribeBlock'
import { FactChips } from '../templates/FactChips'
import { PREP, type PrepPlan } from '../playbooks/prep'
import { diagnose } from '../domain/engine'
import { passportEngine } from '../playbooks/engines'
import { UI } from './screenCopy'
import { INTERACTION_GATED } from './interactionGated'
import {
  sessionReducer, initialSession, type SessionState, type ActiveInterpretation,
} from '../session/session'
import type { Fact, GatedInterpretation } from '../domain/interpret'
import * as interpretationModule from '../session/interpretation'

vi.mock('../session/interpretation', () => ({ runInterpretation: vi.fn() }))
const runInterpretation = vi.mocked(interpretationModule.runInterpretation)

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// Real engines on purpose, same reasoning PrepareScreen.test.tsx's own
// header gives: a toy fixture would not exercise a real `where` shape.
const escalate = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' }) // state-5b
const clarifyD = diagnose(passportEngine, { q1: 'adverse', q2: 'no_followup' }) // state-4

// UPDATED (Task 15): `caseFacts`/`fillsReviewed`/`onToggleFillsReviewed` are
// now ALSO required, fully-controlled props — same treatment
// PrepareScreen.test.tsx's own re-declared `ControlledPrepareScreen` gets:
// `fillsReviewed` internally toggleable (standing in for the reducer),
// `caseFacts` an optional pass-through defaulting to `[]` so every
// pre-existing call in THIS file (none of which touch the fills mechanism)
// stays unchanged.
function ControlledPrepareScreen(
  props: Omit<
    PrepareScreenProps,
    'prepChecks' | 'prepDraft' | 'onTogglePrepStep' | 'onSetPrepDraft' |
    'fillsReviewed' | 'onToggleFillsReviewed' | 'caseFacts'
  > & { caseFacts?: Fact[] },
) {
  const { caseFacts = [], ...rest } = props
  const [prepChecks, setPrepChecks] = useState<Record<number, boolean>>({})
  const [prepDraft, setPrepDraft] = useState<string | null>(null)
  const [fillsReviewed, setFillsReviewed] = useState(false)
  return (
    <PrepareScreen
      {...rest}
      caseFacts={caseFacts}
      prepChecks={prepChecks}
      prepDraft={prepDraft}
      onTogglePrepStep={i => setPrepChecks(prev => ({ ...prev, [i]: !prev[i] }))}
      onSetPrepDraft={setPrepDraft}
      fillsReviewed={fillsReviewed}
      onToggleFillsReviewed={() => setFillsReviewed(v => !v)}
    />
  )
}

const tickAll = async (n: number) => {
  const ticks = screen.getAllByRole('button', { pressed: false }).filter(b => b.classList.contains('pstep-tick'))
  expect(ticks).toHaveLength(n)
  for (const t of ticks) await userEvent.click(t)
}

// Task 15's own fixture — a synthetic plan whose ONLY bracket is fully
// covered by the one fact below, the shape `ui:prepare.hintFilledUnreviewed`
// needs and "no shipped PREP plan currently produces unassisted"
// (interactionGated.ts's own comment on this entry). Re-declared here, not
// imported from PrepareScreen.test.tsx (this file's own "own its own
// fixtures" convention, header comment above).
const FULLY_FILLABLE_PREP: PrepPlan = { draft: 'Reference number: [ARN]. Nothing else needed.', steps: ['Step A'] }
const FILLING_FACT: Fact = {
  kind: 'reference_number', refType: 'arn', label: 'ARN', value: 'AB123456789', fills: '[ARN]',
}

/** A real `useReducer(sessionReducer, ...)` harness, the SAME shape
 *  DescribeBlock.test.tsx's own `Harness` uses — needed because
 *  `ui:describe.err`/`ui:describe.reading` are both produced by a
 *  dispatch-then-re-render round trip (`SET_DESCRIBE_ERR`/
 *  `INTERPRETATION_STARTED`), not by a static prop. */
function ControlledDescribeBlock({ seed }: { seed?: Partial<SessionState> }) {
  const [state, dispatch] = useReducer(sessionReducer, { ...initialSession, ...seed })
  return <DescribeBlock screenId="passport-q1" state={state} dispatch={dispatch} />
}

/** Task 13's own fixture, re-declared here rather than imported from
 *  FactChips.test.tsx (this file's own "own its own fixtures" convention,
 *  header comment above). A minimal, valid `ActiveInterpretation` — the
 *  same test-only `__gated` brand escape hatch InterpConfirmScreen.test.tsx
 *  and FactChips.test.tsx's own `makeInterp` already establish. */
const GATED_FACT: Fact = {
  kind: 'reference_number', refType: 'passport_file_no', label: 'File Number', value: 'BN1068334517807', fills: null,
}
function makeGatedInterp(facts: Fact[]): ActiveInterpretation {
  return {
    __gated: 'test-only' as unknown as GatedInterpretation['__gated'],
    mappings: [], discarded: [], facts, droppedSensitive: false, unplaceable: false,
    provenance: 'simulated (local matcher)', ctxScreen: 'passport-q1', engine: 'passport',
    service: UI.serviceLabel.passport, text: 'default fixture text',
  }
}

/** A real `useReducer(sessionReducer, ...)` harness for `FactChips`, the
 *  SAME shape `ControlledDescribeBlock` above uses — `ui:facts.editLabel`/
 *  `ui:facts.saveLabel` are both reachable only after a real Edit click
 *  (`SET_FACT_EDIT`), never as a static prop, matching this whole module's
 *  own rule for what belongs in `INTERACTION_GATED` at all. */
function ControlledFactChips({ seed }: { seed?: Partial<SessionState> }) {
  const [state, dispatch] = useReducer(sessionReducer, { ...initialSession, ...seed })
  if (!state.interp) return null
  return (
    <FactChips
      facts={state.interp.facts}
      droppedSensitive={state.interp.droppedSensitive}
      factEditIdx={state.factEditIdx}
      factEditVal={state.factEditVal}
      dispatch={dispatch}
    />
  )
}

describe('INTERACTION_GATED coverage — the SCREEN_COPY strings no static mount can produce', () => {
  it('drives the real interactions that produce each one, and covers exactly INTERACTION_GATED', async () => {
    const assertions: Record<string, () => Promise<void>> = {
      'ui:prepare.doneNoteFallback': async () => {
        // Tick every step on a doneNote-less plan.
        const noNote = PREP['state-4']
        expect(noNote.doneNote).toBeUndefined()
        const { unmount } = render(
          <ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={noNote} />,
        )
        await tickAll(noNote.steps.length)
        expect(document.querySelector('.psteps-done')).toHaveTextContent(UI.prepare.doneNoteFallback)
        unmount()
      },
      'ui:prepare.hintReady': async () => {
        // A zero-bracket draft — a plain edit, not a click (design note 2b).
        const { unmount } = render(
          <ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />,
        )
        fireEvent.change(screen.getByRole('textbox', { name: UI.prepare.draftAria }), {
          target: { value: 'nothing left to fill' },
        })
        expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintReady)
        unmount()
      },
      'ui:prepare.copied': async () => {
        // A zero-bracket draft, then a Copy click.
        const { unmount } = render(
          <ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />,
        )
        fireEvent.change(screen.getByRole('textbox', { name: UI.prepare.draftAria }), {
          target: { value: 'nothing left to fill' },
        })
        await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
        expect(await screen.findByRole('button', { name: UI.prepare.copied })).toBeInTheDocument()
        unmount()
      },
      'ui:prepare.copiedOne': async () => {
        // A Copy click with exactly one blank left.
        const { unmount } = render(
          <ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />,
        )
        fireEvent.change(screen.getByRole('textbox', { name: UI.prepare.draftAria }), {
          target: { value: 'ready [x] set' },
        })
        await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
        expect(
          await screen.findByRole('button', { name: UI.prepare.copiedOne.replace('{n}', '1') }),
        ).toBeInTheDocument()
        unmount()
      },
      'ui:prepare.copiedMany': async () => {
        // A Copy click with two blanks left.
        const { unmount } = render(
          <ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />,
        )
        fireEvent.change(screen.getByRole('textbox', { name: UI.prepare.draftAria }), {
          target: { value: 'a [x] b [y]' },
        })
        await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
        expect(
          await screen.findByRole('button', { name: UI.prepare.copiedMany.replace('{n}', '2') }),
        ).toBeInTheDocument()
        unmount()
      },
      // C8 (Task 15) — closes the last entry this module's own header
      // comment names as owed. Gated for the reason interactionGated.ts's
      // own comment states: a draft whose blanks are ALL fact-filled is a
      // shape no shipped PREP plan produces unassisted, so a synthetic
      // one-bracket plan stands in. No CLICK is needed — `fillsReviewed`
      // starts `false` on a fresh mount (ControlledPrepareScreen's own
      // internal `useState`, standing in for the reducer's `initialSession`
      // default) — this is a data-shape gate, the same category
      // `ui:prepare.hintReady`'s own covering assertion above already is
      // ("a plain edit, not a click").
      'ui:prepare.hintFilledUnreviewed': async () => {
        const { unmount } = render(
          <ControlledPrepareScreen
            serviceLabel="Passport" engineKey="passport" d={escalate} prep={FULLY_FILLABLE_PREP}
            caseFacts={[FILLING_FACT]}
          />,
        )
        expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintFilledUnreviewed)
        unmount()
      },
      // C8 (Task 11) — the two entries Task 10 pre-registered anticipating
      // this task. Both need `VITE_DESCRIBE_IT` stubbed 'on' (the feature
      // ships off by default) and a REAL `sessionReducer` round trip, not a
      // static prop: `describeErr` and `reading` are both produced by a
      // dispatch, never passed in directly by any real caller.
      'ui:describe.err': async () => {
        vi.stubEnv('VITE_DESCRIBE_IT', 'on')
        const { unmount } = render(<ControlledDescribeBlock seed={{ describeOpen: true }} />)
        await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
        expect(await screen.findByRole('alert')).toHaveTextContent(UI.describe.err)
        unmount()
      },
      'ui:describe.reading': async () => {
        vi.stubEnv('VITE_DESCRIBE_IT', 'on')
        // A never-resolving promise: this assertion only needs the IN-FLIGHT
        // state (reading:true), never a settled result.
        runInterpretation.mockReturnValue(new Promise(() => {}))
        const { unmount } = render(
          <ControlledDescribeBlock seed={{ describeOpen: true, describeText: 'nothing moved since I filed' }} />,
        )
        await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
        expect(await screen.findByRole('button', { name: UI.describe.reading })).toBeInTheDocument()
        unmount()
      },
      // C8 (Task 13) — the two entries Task 10 pre-registered anticipating
      // this task, closing 2 of the 3 remaining red entries. Both are
      // FactChips's own edit-mode aria-labels: unreachable at a static
      // mount because `factEditIdx` starts `null` on every fresh session —
      // only a real `SET_FACT_EDIT` dispatch (a click on Edit) ever puts a
      // chip into its edit-mode branch at all. One real `ControlledFactChips`
      // round trip covers both labels, since both live on the SAME chip
      // once edit mode is open.
      'ui:facts.editLabel': async () => {
        const { unmount } = render(<ControlledFactChips seed={{ interp: makeGatedInterp([GATED_FACT]) }} />)
        await userEvent.click(
          screen.getByRole('button', { name: `${UI.facts.editValueAria.replace('{label}', GATED_FACT.label).replace('{value}', GATED_FACT.value)}` }),
        )
        expect(
          screen.getByLabelText(UI.facts.editLabel.replace('{label}', GATED_FACT.label)),
        ).toBeInTheDocument()
        unmount()
      },
      'ui:facts.saveLabel': async () => {
        const { unmount } = render(<ControlledFactChips seed={{ interp: makeGatedInterp([GATED_FACT]) }} />)
        await userEvent.click(
          screen.getByRole('button', { name: `${UI.facts.editValueAria.replace('{label}', GATED_FACT.label).replace('{value}', GATED_FACT.value)}` }),
        )
        expect(
          screen.getByRole('button', { name: UI.facts.saveLabel.replace('{label}', GATED_FACT.label) }),
        ).toBeInTheDocument()
        unmount()
      },
    }

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
    })
    try {
      for (const at of Object.keys(assertions)) await assertions[at]()
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
      else delete (navigator as { clipboard?: unknown }).clipboard
    }

    // The forcing function is STRICT equality, no exclusion filter — the
    // reviewer's ruling after mutation-testing both an earlier exclusion-
    // list version of this check and this strict one. The exclusion-list
    // version's real problem: it could be "discharged" by doing nothing —
    // an entry silently never gets a covering function here and nothing
    // ever fails, which is exactly what would have happened to
    // `ui:facts.editLabel`/`ui:facts.saveLabel` had Task 13 not closed them
    // (both are ALSO in `screenCopy.test.tsx`'s own `CAPTION_TEMPLATES`, so
    // they don't even re-enter that file's coverage sweep as a backstop). A
    // bare strict-equality pin can only be discharged by actually adding
    // covering interaction coverage — the same discipline Task 9
    // (`ui/tokens.test.ts`'s own `UI.interp.spanPrefix` pin) and Task 10
    // each already established for this exact "copy registered ahead of
    // its consuming code" situation.
    //
    // UPDATED (Task 13): `ui:facts.editLabel`/`ui:facts.saveLabel` are now
    // closed, via `ControlledFactChips` above — a real `SET_FACT_EDIT`
    // click, then both labels read off the same now-open chip.
    //
    // UPDATED (Task 15): `ui:prepare.hintFilledUnreviewed` is now ALSO
    // closed, via the `'ui:prepare.hintFilledUnreviewed'` entry above. Every
    // name `INTERACTION_GATED` lists now has a real covering function;
    // nothing remains gapped.
    //
    // Whole-branch review (2026-09-09 fix wave), Finding 8: this pin now
    // runs AFTER the loop above, not before it. Pinned here, it also proves
    // the loop actually ran to completion (every `assertions[at]()` awaited
    // without throwing) before declaring victory on the key-set shape — a
    // strict-equality check that runs first can only ever prove the object
    // literal's OWN shape, established at definition time regardless of
    // whether a single covering function inside it ever really executes;
    // moving it here establishes the loop's side effects FIRST, so this
    // assertion is the true last word on this test, not an early one a
    // later regression in the loop could slip past unnoticed.
    expect(Object.keys(assertions).sort()).toEqual([...INTERACTION_GATED].sort())
  })
})
