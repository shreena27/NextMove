// RED for Task 11 — DescribeBlock, port of the prototype's `describeBlock`
// (design/nextmove-v1-prototype.html, 3003-3024): the entry row + free-text
// box mounted at the tail of six question screens' own `.answers` list, and
// the ONLY place in `src/` that calls `runInterpretation` (I5).
//
// `runInterpretation` is mocked throughout — this file's own job is only to
// prove DescribeBlock CALLS it correctly and handles its result, not to
// re-exercise the orchestrator itself (interpretation.test.ts already does
// that exhaustively). `VITE_DESCRIBE_IT` is stubbed 'on' per-test, matching
// interpretation.test.ts's own established convention (vitest's
// `unstubEnvs` config defaults to false, so a global `afterEach` reverts it
// rather than a `beforeEach` stubbing it, avoiding an override footgun on
// the one test that needs it OFF).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useReducer } from 'react'
import { DescribeBlock } from './DescribeBlock'
import { UI } from '../screens/screenCopy'
import { DESCRIBE_MAX } from '../domain/interpret'
import type { GatedInterpretation, Fact } from '../domain/interpret'
import { sessionReducer, initialSession, type SessionState, type SessionAction } from '../session/session'
import * as interpretationModule from '../session/interpretation'
import { PassportQ1, PassportQ2 } from '../screens/passport/PassportScreens'
import { PassportRecovery, PassportRecoveryPaste, PassportRecoveryShow } from '../screens/passport/PassportRecovery'
import { VoterEntry, VoterQ1, VoterQ2 } from '../screens/voter/VoterScreens'
import { SirQ1 } from '../screens/sir/SirScreens'

vi.mock('../session/interpretation', () => ({ runInterpretation: vi.fn() }))
const runInterpretation = vi.mocked(interpretationModule.runInterpretation)

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const noop = () => {}

/** A deferred promise — resolve/reject are exposed so a test can control
 *  exactly when an in-flight `runInterpretation` call settles, the same
 *  shape the stale-resolve guard (I5) needs to exercise "unmount, THEN
 *  resolve" as two genuinely separate steps. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

const FIXTURE_FACT: Fact = {
  kind: 'reference_number', refType: 'passport_file_no', label: 'File Number',
  value: 'BN1068334517807', fills: '[File Number / ARN]',
}
// Same test-only escape hatch domain/interpret.test.ts's own `makeInterp()`
// and session.test.ts's own `FIXTURE_INTERP` already establish as the
// sanctioned way to build a GatedInterpretation-shaped fixture outside
// interpretGates.ts's sole real constructor — never used in production
// code, only here.
function fixtureGated(): GatedInterpretation {
  return {
    __gated: 'test-only' as unknown as GatedInterpretation['__gated'],
    mappings: [
      {
        questionId: 'q1', value: 'adverse', span: 'nothing moved',
        optionValues: ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'],
      },
    ],
    discarded: [],
    facts: [FIXTURE_FACT],
    droppedSensitive: false,
    unplaceable: false,
    provenance: 'simulated (local matcher)',
  }
}

/** A real `useReducer(sessionReducer, ...)` harness, needed only by the
 *  tests that must observe REAL state transitions (the stale-resolve guard,
 *  open/close focus management, and the two INTERACTION_GATED coverage
 *  interactions below) — every other test in this file uses a plain
 *  `vi.fn()` dispatch spy against static props, matching this codebase's
 *  own established convention (SaveCaseScreen.test.tsx's `Controlled` vs.
 *  its per-test `dispatch` spies).
 *
 *  `dispatchSpy` (optional) additionally records every dispatched action,
 *  for tests that need to assert exactly what fired without giving up the
 *  real reducer round trip. `onState` (optional) hands the latest state to
 *  the caller on every render — the only way to inspect `state.describeText`/
 *  `state.reading` AFTER `unmount()` removes the DOM this harness rendered. */
function Harness({
  seed, mounted = true, dispatchSpy, onState,
}: {
  seed?: Partial<SessionState>
  /** Toggled via `rerender`, NOT RTL's own `unmount()` — `unmount()` tears
   *  down this whole component (reducer included) in one pass, so a
   *  dispatch from DescribeBlock's own unmount cleanup never gets a chance
   *  to commit a new render the test could observe. Rendering `null` here
   *  instead unmounts ONLY the `DescribeBlock` subtree while this
   *  component (and its reducer) stays alive to receive and report that
   *  dispatch. */
  mounted?: boolean
  dispatchSpy?: (a: SessionAction) => void
  onState?: (s: SessionState) => void
}) {
  const [state, realDispatch] = useReducer(sessionReducer, { ...initialSession, ...seed })
  useEffect(() => {
    onState?.(state)
  })
  const dispatch = (a: SessionAction) => {
    dispatchSpy?.(a)
    realDispatch(a)
  }
  return mounted ? <DescribeBlock screenId="passport-q1" state={state} dispatch={dispatch} /> : null
}

// ---------------------------------------------------------------------------
// Design note 2 — the three guards. The container is structurally ABSENT
// for all three, never merely hidden.

describe('the flag/chain/quota gate (design note 2)', () => {
  it('with the flag OFF, renders null — the container is absent from the DOM, not hidden ("OFF means structurally absent; a display:none assertion tests nothing")', () => {
    // Deliberately no vi.stubEnv call here — the default, unstubbed value
    // (undefined) is what "flag off" means (featureFlags.ts's own
    // allowlist-of-one-value contract).
    render(<DescribeBlock screenId="passport-q1" state={initialSession} dispatch={noop} />)
    expect(document.querySelector('.describe-entry')).not.toBeInTheDocument()
  })

  it('with the flag on but an unconfigured screenId (scope exclusion 5 / spec §6), renders null', () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    render(<DescribeBlock screenId="passport-recovery-paste" state={initialSession} dispatch={noop} />)
    expect(document.querySelector('.describe-entry')).not.toBeInTheDocument()
  })

  it('with the flag on and a configured screen, quotaExhausted:true renders null — the container absent, not hidden (I7, spec §2\'s "the entry row is hidden, not broken"; inert until Task 18 wires a real 429 onto it)', () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    render(
      <DescribeBlock screenId="passport-q1" state={{ ...initialSession, quotaExhausted: true }} dispatch={noop} />,
    )
    expect(document.querySelector('.describe-entry')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Static structure — the collapsed row, then the open box.

describe('the collapsed row (flag on, configured screen)', () => {
  it('renders both registered label parts, the pen icon, and aria-expanded="false"; the box is absent', () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    render(<DescribeBlock screenId="passport-q1" state={initialSession} dispatch={noop} />)
    const row = document.querySelector('.describe-row')!
    expect(row).toHaveTextContent(UI.describe.rowLead + UI.describe.rowStrong)
    expect(row.querySelector('.dr-icon svg')).toBeInTheDocument()
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('.describe-box')).not.toBeInTheDocument()
  })
})

describe('opening/closing the row — focus management (design note 7, spec §7)', () => {
  it('clicking the row opens the box, flips aria-expanded to "true", and moves focus to the textarea; clicking again closes it and returns focus to the row button', async () => {
    expect.assertions(4)
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const user = userEvent.setup()
    render(<Harness />)
    const row = screen.getByRole('button', { name: new RegExp(UI.describe.rowStrong) })
    await user.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText(UI.describe.ariaLabel)).toHaveFocus()
    await user.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(row).toHaveFocus()
  })
})

// ---------------------------------------------------------------------------
// Design note 3 — describeText is reducer state, not component state.

describe('the textarea is fully controlled from state.describeText (design note 3, spec §1)', () => {
  it('typing dispatches SET_DESCRIBE_TEXT; the value comes from props, never a local copy', () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const dispatch = vi.fn()
    render(
      <DescribeBlock
        screenId="passport-q1"
        state={{ ...initialSession, describeOpen: true, describeText: 'so far' }}
        dispatch={dispatch}
      />,
    )
    const ta = screen.getByLabelText(UI.describe.ariaLabel) as HTMLTextAreaElement
    expect(ta.value).toBe('so far')
    fireEvent.change(ta, { target: { value: 'so far, more' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_DESCRIBE_TEXT', text: 'so far, more' })
  })

  it('unmounting and remounting with the SAME state preserves the text — the typed text survives Back, failure, and re-entry (spec §1)', () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const state: SessionState = { ...initialSession, describeOpen: true, describeText: 'my whole story' }
    const { unmount } = render(<DescribeBlock screenId="passport-q1" state={state} dispatch={noop} />)
    expect((screen.getByLabelText(UI.describe.ariaLabel) as HTMLTextAreaElement).value).toBe('my whole story')
    unmount()
    render(<DescribeBlock screenId="passport-q1" state={state} dispatch={noop} />)
    expect((screen.getByLabelText(UI.describe.ariaLabel) as HTMLTextAreaElement).value).toBe('my whole story')
  })
})

// ---------------------------------------------------------------------------
// Design note 4 — the hard cap and the live, polite counter.

describe('the character counter and cap (design note 4, spec §1)', () => {
  it('maxLength equals DESCRIBE_MAX; the counter renders "0 / 600" initially, updates with state, and its container is aria-live="polite", not assertive', () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const { rerender } = render(
      <DescribeBlock screenId="passport-q1" state={{ ...initialSession, describeOpen: true }} dispatch={noop} />,
    )
    const ta = screen.getByLabelText(UI.describe.ariaLabel)
    expect(ta).toHaveAttribute('maxlength', String(DESCRIBE_MAX))
    const counter = document.querySelector('.char-count')!
    expect(counter).toHaveTextContent(`0 / ${DESCRIBE_MAX}`)
    expect(counter).toHaveAttribute('aria-live', 'polite')
    expect(counter).not.toHaveAttribute('aria-live', 'assertive')
    rerender(
      <DescribeBlock
        screenId="passport-q1"
        state={{ ...initialSession, describeOpen: true, describeText: 'twelve chars' }}
        dispatch={noop}
      />,
    )
    expect(document.querySelector('.char-count')).toHaveTextContent(`12 / ${DESCRIBE_MAX}`)
  })
})

// ---------------------------------------------------------------------------
// Design note 5 — empty/whitespace-only input is blocked, never interpreted.

describe('empty/whitespace-only input (design note 5, FR-AI-05, prototype 2421-2422)', () => {
  it('empty input: clicking the action dispatches SET_DESCRIBE_ERR with the exact registered string and does not call runInterpretation', async () => {
    expect.assertions(2)
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const dispatch = vi.fn()
    render(
      <DescribeBlock screenId="passport-q1" state={{ ...initialSession, describeOpen: true }} dispatch={dispatch} />,
    )
    await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_DESCRIBE_ERR', error: UI.describe.err })
    expect(runInterpretation).not.toHaveBeenCalled()
  })

  it('whitespace-only input behaves exactly as empty (the .trim() at 2421)', async () => {
    expect.assertions(2)
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const dispatch = vi.fn()
    render(
      <DescribeBlock
        screenId="passport-q1"
        state={{ ...initialSession, describeOpen: true, describeText: '   \n\t  ' }}
        dispatch={dispatch}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_DESCRIBE_ERR', error: UI.describe.err })
    expect(runInterpretation).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Design note 6 / I5 — the interpretation call itself.

describe('a valid submit calls runInterpretation and dispatches the started/done/failed lifecycle', () => {
  it('calls runInterpretation(screenId, state.answers, trimmedText) and dispatches INTERPRETATION_STARTED BEFORE awaiting — order asserted via mock.invocationCallOrder', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    runInterpretation.mockResolvedValue({ ok: true, interp: fixtureGated() })
    const dispatch = vi.fn()
    render(
      <DescribeBlock
        screenId="passport-q1"
        state={{ ...initialSession, describeOpen: true, describeText: '  nothing moved since I filed  ', answers: { foo: 'bar' } }}
        dispatch={dispatch}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
    expect(runInterpretation).toHaveBeenCalledWith('passport-q1', { foo: 'bar' }, 'nothing moved since I filed')
    const startedCallIndex = dispatch.mock.calls.findIndex(c => (c[0] as SessionAction).type === 'INTERPRETATION_STARTED')
    expect(startedCallIndex).toBeGreaterThanOrEqual(0)
    const startedOrder = dispatch.mock.invocationCallOrder[startedCallIndex]
    expect(startedOrder).toBeLessThan(runInterpretation.mock.invocationCallOrder[0])
  })

  it('a resolved { ok: true } dispatches INTERPRETATION_DONE, composing ActiveInterpretation from the GatedInterpretation plus ctxScreen/engine/service/text (session.ts\'s own doc comment: "the party that calls runInterpretation composes this wrapper")', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const gated = fixtureGated()
    runInterpretation.mockResolvedValue({ ok: true, interp: gated })
    const dispatch = vi.fn()
    render(
      <DescribeBlock
        screenId="passport-q1"
        state={{ ...initialSession, describeOpen: true, describeText: 'nothing moved since I filed' }}
        dispatch={dispatch}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: 'INTERPRETATION_DONE',
        interp: {
          ...gated,
          ctxScreen: 'passport-q1', engine: 'passport', service: 'Passport', text: 'nothing moved since I filed',
        },
      }),
    )
  })

  it('a resolved { ok: false } dispatches INTERPRETATION_FAILED with the reason', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    runInterpretation.mockResolvedValue({ ok: false, reason: 'no-provider' })
    const dispatch = vi.fn()
    render(
      <DescribeBlock
        screenId="passport-q1"
        state={{ ...initialSession, describeOpen: true, describeText: 'nothing moved since I filed' }}
        dispatch={dispatch}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'INTERPRETATION_FAILED', reason: 'no-provider' }))
  })
})

describe('with reading:true, the action is disabled and a double-tap starts nothing ("a stuck busy flag is a dead screen; a double-tap that starts two interpretations is worse")', () => {
  it('the action is disabled, renders the registered "Reading…", and a click calls nothing', async () => {
    expect.assertions(3)
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const dispatch = vi.fn()
    render(
      <DescribeBlock
        screenId="passport-q1"
        state={{ ...initialSession, describeOpen: true, describeText: 'anything', reading: true }}
        dispatch={dispatch}
      />,
    )
    const btn = screen.getByRole('button', { name: UI.describe.reading })
    expect(btn).toBeDisabled()
    await userEvent.click(btn)
    expect(dispatch).not.toHaveBeenCalled()
    expect(runInterpretation).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// I5 — the stale-resolve guard. RED item 37: "the task's sharpest RED."

describe('I5 — the stale-resolve guard (design note 6, task brief RED item 37)', () => {
  it(
    '(a) unmount BEFORE the promise settles: nothing is dispatched from the resolve — "the component unmounts on ' +
    'Back; the promise does not. An ungated resolve navigates a citizen to the confirm screen from wherever they ' +
    'have since gone."',
    async () => {
      expect.assertions(2)
      vi.stubEnv('VITE_DESCRIBE_IT', 'on')
      const { promise, resolve } = deferred<{ ok: true; interp: GatedInterpretation }>()
      runInterpretation.mockReturnValue(promise)
      const dispatchSpy = vi.fn()
      const seed = { describeOpen: true, describeText: 'my story here' }
      const { rerender } = render(<Harness seed={seed} dispatchSpy={dispatchSpy} />)
      await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
      rerender(<Harness seed={seed} dispatchSpy={dispatchSpy} mounted={false} />)
      resolve({ ok: true, interp: fixtureGated() })
      await promise
      // A microtask flush: handleSubmit's continuation runs on the SAME
      // microtask queue the awaited `promise` resolves on, so awaiting the
      // promise itself is enough to let the guard's `if` run before this
      // assertion — no extra tick is needed.
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERPRETATION_DONE' }))
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERPRETATION_FAILED' }))
    },
  )

  it(
    '(b) unmount clears the busy flag: the unmount dispatches INTERPRETATION_ABANDONED, so state.reading is false ' +
    '— "nothing in the nav-clear set touches reading — deliberately — so if the cleanup does not clear it, ' +
    'nothing does."',
    async () => {
      vi.stubEnv('VITE_DESCRIBE_IT', 'on')
      const { promise } = deferred<{ ok: true; interp: GatedInterpretation }>()
      runInterpretation.mockReturnValue(promise)
      let latest: SessionState | undefined
      const seed = { describeOpen: true, describeText: 'my story here' }
      const onState = (s: SessionState) => {
        latest = s
      }
      const { rerender } = render(<Harness seed={seed} onState={onState} />)
      await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
      expect(latest?.reading).toBe(true)
      rerender(<Harness seed={seed} onState={onState} mounted={false} />)
      expect(latest?.reading).toBe(false)
    },
  )

  it('(c) a second submit supersedes the first: two clicks against two deferred promises, resolving the FIRST last, dispatches only the second\'s result', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const first = deferred<{ ok: true; interp: GatedInterpretation }>()
    const second = deferred<{ ok: false; reason: 'failed' }>()
    runInterpretation.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const dispatch = vi.fn()
    render(
      <DescribeBlock
        screenId="passport-q1"
        state={{ ...initialSession, describeOpen: true, describeText: 'nothing moved since I filed', reading: false }}
        dispatch={dispatch}
      />,
    )
    const btn = screen.getByRole('button', { name: UI.describe.read })
    await userEvent.click(btn)
    await userEvent.click(btn)
    expect(runInterpretation).toHaveBeenCalledTimes(2)

    second.resolve({ ok: false, reason: 'failed' })
    await second.promise
    first.resolve({ ok: true, interp: fixtureGated() })
    await first.promise

    expect(dispatch).toHaveBeenCalledWith({ type: 'INTERPRETATION_FAILED', reason: 'failed' })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERPRETATION_DONE' }))
  })

  it('the text survives both (a) and (b) — after unmount, state.describeText is unchanged (spec §1: "the typed text survives Back, failure, and re-entry")', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const { promise, resolve } = deferred<{ ok: true; interp: GatedInterpretation }>()
    runInterpretation.mockReturnValue(promise)
    let latest: SessionState | undefined
    const seed = { describeOpen: true, describeText: 'my story here' }
    const onState = (s: SessionState) => {
      latest = s
    }
    const { rerender } = render(<Harness seed={seed} onState={onState} />)
    await userEvent.click(screen.getByRole('button', { name: UI.describe.read }))
    rerender(<Harness seed={seed} onState={onState} mounted={false} />)
    resolve({ ok: true, interp: fixtureGated() })
    await promise
    expect(latest?.describeText).toBe('my story here')
  })
})

describe('mutation check — the guard and the cleanup are load-bearing, not decorative', () => {
  // These two are documentation of the mutation testing performed by hand
  // during development (task brief: "Verify RED by deleting the
  // active.current !== id check"/"Verify RED by removing the cleanup
  // dispatch"), not automated tests — deleting production code from inside
  // a test file is not a thing Vitest can express. See task-11-report.md
  // for the transcript of both RED confirmations.
  it('is documented in task-11-report.md, not asserted here (see this describe block\'s own comment)', () => {
    expect(true).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Design note 8 — example chips.

describe('example chips (design note 8)', () => {
  it('tapping one dispatches FILL_DESCRIBE_EXAMPLE with the FULL story; the visible label is truncated at 52 characters with "…" and the accessible name is the full text', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const full = UI.describe.examples['passport-q1'].one
    expect(full.length).toBeGreaterThan(52)
    const dispatch = vi.fn()
    render(
      <DescribeBlock screenId="passport-q1" state={{ ...initialSession, describeOpen: true }} dispatch={dispatch} />,
    )
    const chip = screen.getByRole('button', { name: full })
    expect(chip.textContent).toBe(`"${full.slice(0, 52)}…"`)
    await userEvent.click(chip)
    expect(dispatch).toHaveBeenCalledWith({ type: 'FILL_DESCRIBE_EXAMPLE', text: full })
  })
})

// ---------------------------------------------------------------------------
// The error node's role.

describe('the error node', () => {
  it('has role="alert"', () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    render(
      <DescribeBlock
        screenId="passport-q1"
        state={{ ...initialSession, describeOpen: true, describeErr: UI.describe.err }}
        dispatch={noop}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(UI.describe.err)
  })
})

// ---------------------------------------------------------------------------
// I5 — the repo-wide grep pin (mirrors Task 17's own, placed here too
// because THIS is the task that would break it): "the runner's location was
// specified in two contradictory places in an earlier draft; this pin is
// what keeps the answer to one."

describe('runInterpretation is called from this component and nowhere else (I5)', () => {
  const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..') // -> <repo>/src

  function nonTestTsFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        out.push(...nonTestTsFiles(full))
        continue
      }
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue
      out.push(full)
    }
    return out
  }

  /** Strips `//` line comments before searching — the prototype ALSO has a
   *  function literally named `runInterpretation` (design/nextmove-v1-
   *  prototype.html:2420), and session.ts's own `INTERPRETATION_STARTED`
   *  arm cites it BY NAME in a comment ("Prototype runInterpretation()
   *  (2424): ..."). That is prose about the prototype, not a call to this
   *  codebase's own function, and a bare substring search cannot tell the
   *  two apart — stripping comments first is what keeps this pin honest.
   *  Not a full parser (a `//` inside a string literal would fool it), but
   *  no real file under src/ does that today, and a guardrail that misses
   *  an exotic form is still strictly better than none (isolation.test.ts's
   *  own stated philosophy). */
  function codeOnly(source: string): string {
    // No `$` anchor: this codebase's files are CRLF-terminated, and JS's
    // `.` never matches a line terminator (`\r` included) — with a `$`
    // anchor (which, absent the `m` flag, matches only the true end of the
    // whole string) `.*$` could never bridge the trailing `\r` on any line
    // but the last, so the replace would silently match nothing at all.
    // Greedy `.*` alone already consumes everything up to the next `\r`/
    // `\n`, which is exactly "the rest of this line".
    return source
      .split('\n')
      .map(line => line.replace(/\/\/.*/, ''))
      .join('\n')
  }

  it('the substring "runInterpretation(" appears in exactly one non-test file\'s CODE (comments excluded): this one', () => {
    // session/interpretation.ts is the DECLARATION site (`export async
    // function runInterpretation(`), not a call site — excluded here the
    // same way a "call site" pin always excludes its own definition.
    const declarationFile = join(srcRoot, 'session', 'interpretation.ts')
    const hits = nonTestTsFiles(srcRoot)
      .filter(f => f !== declarationFile)
      .filter(f => codeOnly(readFileSync(f, 'utf8')).includes('runInterpretation('))
      .map(f => f.split(sep).join('/'))
    expect(hits).toEqual([join(srcRoot, 'templates', 'DescribeBlock.tsx').split(sep).join('/')])
  })
})

// ---------------------------------------------------------------------------
// All six mount sites, plus the one deliberate non-mount (scope exclusion 5).

describe('the six mount sites (task brief design note 3)', () => {
  const cases: [string, () => React.JSX.Element][] = [
    ['PassportQ1', () => <PassportQ1 state={initialSession} dispatch={noop} />],
    ['PassportQ2', () => <PassportQ2 state={initialSession} dispatch={noop} />],
    ['VoterEntry', () => <VoterEntry state={initialSession} dispatch={noop} />],
    ['VoterQ1', () => <VoterQ1 state={initialSession} dispatch={noop} />],
    ['VoterQ2', () => <VoterQ2 state={initialSession} dispatch={noop} />],
    ['SirQ1', () => <SirQ1 state={{ ...initialSession, answers: { sirState: 'delhi' } }} dispatch={noop} />],
  ]

  it.each(cases)('%s renders the describe block', (_name, render_) => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    render(render_())
    expect(document.querySelector('.describe-entry')).toBeInTheDocument()
  })
})

describe('PassportRecovery\'s screens render NO describe row (scope exclusion 5)', () => {
  const cases: [string, () => React.JSX.Element][] = [
    ['PassportRecovery', () => <PassportRecovery state={initialSession} dispatch={noop} />],
    ['PassportRecoveryPaste', () => <PassportRecoveryPaste state={initialSession} dispatch={noop} />],
    ['PassportRecoveryShow', () => <PassportRecoveryShow state={initialSession} dispatch={noop} />],
  ]

  it.each(cases)('%s — asserted at the component level, not just design note 2\'s chain guard', (_name, render_) => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    render(render_())
    expect(document.querySelector('.describe-entry')).not.toBeInTheDocument()
  })
})
