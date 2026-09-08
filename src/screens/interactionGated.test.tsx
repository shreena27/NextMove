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
// STILL RED, same as it was in PrepareScreen.test.tsx before this move
// (Task 10's own commit message: "closed incrementally by Tasks 11-15") —
// three entries remain uncovered: `ui:facts.editLabel`/`ui:facts.saveLabel`
// (Task 13) and `ui:prepare.hintFilledUnreviewed` (Task 15). Task 11's own
// obligation here is exactly two entries — `ui:describe.err`/
// `ui:describe.reading` (pre-registered by Task 10, anticipating this
// task) — plus giving the mechanism a better home; NOT building Tasks
// 13/15's own components. The `it.each` split below keeps that boundary
// visible: PASSING vs. STILL_RED are two separate, named groups, so a
// reader (or the next task) sees at a glance which three keys are still
// owed and by whom, without re-deriving it from a single failing assertion.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useReducer, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrepareScreen, type PrepareScreenProps } from '../templates/PrepareScreen'
import { DescribeBlock } from '../templates/DescribeBlock'
import { PREP } from '../playbooks/prep'
import { diagnose } from '../domain/engine'
import { passportEngine } from '../playbooks/engines'
import { UI } from './screenCopy'
import { INTERACTION_GATED } from './interactionGated'
import { sessionReducer, initialSession, type SessionState } from '../session/session'
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

function ControlledPrepareScreen(
  props: Omit<PrepareScreenProps, 'prepChecks' | 'prepDraft' | 'onTogglePrepStep' | 'onSetPrepDraft'>,
) {
  const [prepChecks, setPrepChecks] = useState<Record<number, boolean>>({})
  const [prepDraft, setPrepDraft] = useState<string | null>(null)
  return (
    <PrepareScreen
      {...props}
      prepChecks={prepChecks}
      prepDraft={prepDraft}
      onTogglePrepStep={i => setPrepChecks(prev => ({ ...prev, [i]: !prev[i] }))}
      onSetPrepDraft={setPrepDraft}
    />
  )
}

const tickAll = async (n: number) => {
  const ticks = screen.getAllByRole('button', { pressed: false }).filter(b => b.classList.contains('pstep-tick'))
  expect(ticks).toHaveLength(n)
  for (const t of ticks) await userEvent.click(t)
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
    }

    // `ui:facts.editLabel`/`ui:facts.saveLabel` (Task 13) and
    // `ui:prepare.hintFilledUnreviewed` (Task 15) — not this task's
    // components to build. Named here, not just implied by the count
    // below, so a reader sees exactly what remains without re-deriving it.
    const stillOwedToFutureTasks = ['ui:facts.editLabel', 'ui:facts.saveLabel', 'ui:prepare.hintFilledUnreviewed']

    // The forcing function: a key mismatch in EITHER direction fails here
    // (missing coverage for a real entry, or a stale assertion for a
    // removed one) — except the three names above, which are EXPECTED
    // absent right now and will fail loudly on their own the moment a
    // fourth, truly-unanticipated entry ever also goes missing.
    expect(Object.keys(assertions).sort()).toEqual(
      [...INTERACTION_GATED].filter(at => !stillOwedToFutureTasks.includes(at)).sort(),
    )
    for (const at of stillOwedToFutureTasks) expect(INTERACTION_GATED.has(at)).toBe(true)

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
  })
})
