// NOTE (history): Task 3 deliberately deferred importing the test-harness
// utilities an earlier draft of this file's plan wanted pre-imported for
// Tasks 4/5 (`vi`, `beforeEach`, `afterEach`, `fireEvent`, `userEvent`,
// `VISIT_EXPECT`) — this repo's tsconfig.app.json has noUnusedLocals/
// noUnusedParameters on, a real, correct compiler setting, not something to
// relax or route around. The two testing-library gotchas that pre-import
// was meant to flag (vi.useFakeTimers() + user-event v14 hang;
// vi.restoreAllMocks() not restoring navigator.clipboard) were documented
// in the plan's design notes instead, for whichever task first needed them.
// Tasks 4 and 5 have since added each import below at the point it was
// actually needed — the record of that deliberate deferral is kept here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrepareScreen, type PrepareScreenProps } from './PrepareScreen'
import { PREP, VISIT_EXPECT, type PrepPlan } from '../playbooks/prep'
import { diagnose } from '../domain/engine'
import { passportEngine, sirEngine } from '../playbooks/engines'
import { caseSnapshot } from '../domain/casefile'
import type { Casefile } from '../domain/casefile'
import { fillDraft, type Fact } from '../domain/interpret'
import { loadCase } from '../session/cases'
import { UI } from '../screens/screenCopy'

// Real engines on purpose: this is an integration point, and a toy fixture
// would not exercise a real `where` shape.
const escalate = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })  // state-5b
const noticeD = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })           // s-notice
// state-5a: the ONE reachable rule whose where carries a phone (1800-258-1800).
const helplineD = diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })         // state-5a

// state-4: q1 'adverse' + q2 'no_followup'. Carries a title, a draft AND a
// visit block, so it is the one fixture that exercises the whole screen.
const clarifyD = diagnose(passportEngine, { q1: 'adverse', q2: 'no_followup' })

// ADDED REQUIREMENT (Task 13, surfaced in Task 12's review): `prepChecks`/
// `prepDraft`/`onTogglePrepStep`/`onSetPrepDraft` are now REQUIRED,
// fully-controlled props (PrepareScreen.tsx's own local-state fallback is
// gone) — App.tsx (Task 13) is the real owner in production. Every render
// call in this file that does not itself already supply real, working
// values for all four (the small handful of Task 12 tests below that
// exercise the controlled path directly, via their own outer variable/
// useState) needs SOME backing store for them, or a tick/draft interaction
// would be a no-op against a value nobody re-renders. `ControlledPrepareScreen`
// is that store: a small stateful wrapper holding `prepChecks`/`prepDraft`
// in real `useState` and passing them through as controlled props — the
// same shape this codebase already uses for testing a controlled component
// (this file's own pre-existing `it('ticking a step, navigating away and
// back...')`/`it('controlled draft: ...')` tests below thread an outer
// `liveChecks` variable / `onSetPrepDraft` spy through in exactly this
// spirit, just without a component wrapping it). Used everywhere in this
// file EXCEPT those pre-existing controlled-path tests, which already pass
// their own real values and stay direct `<PrepareScreen>` calls.
// UPDATED (Task 15): `caseFacts`/`fillsReviewed`/`onToggleFillsReviewed` are
// now ALSO required, fully-controlled props (design note in
// PrepareScreen.tsx's own header, alongside `prepChecks`/`prepDraft`).
// `fillsReviewed` gets the SAME internal-`useState` treatment as
// `prepChecks`/`prepDraft` above, standing in for the reducer. `caseFacts`
// is different: it is left as an OPTIONAL pass-through (defaulting to `[]`)
// rather than internally managed, because — unlike a tick or a draft edit —
// nothing in this wrapper ever needs to CHANGE it; it is data a caller
// supplies once, the same way `d`/`prep` already are. Defaulting to `[]`
// keeps every pre-Task-15 call site in this file (the vast majority, which
// have nothing to do with the fills mechanism) unchanged, while still
// satisfying the real component's own required-prop contract with a real
// value, never an internal fallback the production component itself would
// have to supply.
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

// ADDED REQUIREMENT, verification (c): a real test proving that navigating
// away from and back to PrepareScreen preserves ticks and draft text — at
// minimum through the reducer directly, since this file has no real
// `<App>` router to navigate through. `prepChecks`/`prepDraft` live in
// THIS wrapper's own `useState` (standing in for the session reducer, the
// same way Task 12's own `liveChecks`-closure test above stands in for
// one) — PrepareScreen itself unmounts and remounts underneath a toggle,
// exactly as it does in the real app when the router swaps which screen
// component is behind `state.screen`, while the state that must survive
// lives one level up, untouched by that unmount.
function PrepareBackAndForthHarness(
  props: Omit<
    PrepareScreenProps,
    'prepChecks' | 'prepDraft' | 'onTogglePrepStep' | 'onSetPrepDraft' |
    'fillsReviewed' | 'onToggleFillsReviewed' | 'caseFacts'
  > & { caseFacts?: Fact[] },
) {
  const { caseFacts = [], ...rest } = props
  const [mounted, setMounted] = useState(true)
  const [prepChecks, setPrepChecks] = useState<Record<number, boolean>>({})
  const [prepDraft, setPrepDraft] = useState<string | null>(null)
  const [fillsReviewed, setFillsReviewed] = useState(false)
  return (
    <>
      <button onClick={() => setMounted(m => !m)}>toggle away/back</button>
      {mounted ? (
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
      ) : (
        <div>elsewhere</div>
      )}
    </>
  )
}

describe('the prepare shell', () => {
  it('crumbs read "<service> · <matched state>" then "Prepare"', () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByText(`Passport · ${escalate.label}`)).toBeInTheDocument()
    expect(screen.getByText(UI.phase.prepare)).toBeInTheDocument()
    expect(document.querySelector('.crumb-sq')).toHaveClass('sq-passport')
  })

  it('uses the plan title when there is one, and the fallback headline when there is not', () => {
    const { unmount } = render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREP['state-5b'].title!)
    unmount()
    render(<ControlledPrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(UI.prepare.headlineFallback)
  })

  it('the lede matches whether the plan carries a draft', () => {
    const { unmount } = render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByText(UI.prepare.ledeDraft)).toBeInTheDocument()
    unmount()
    render(<ControlledPrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(screen.getByText(UI.prepare.ledeSteps)).toBeInTheDocument()
  })

  it('always shows the trust line — NextMove never submits (locked Non-Goal)', () => {
    render(<ControlledPrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.prep-trust')).toHaveTextContent(UI.prepare.trust)
  })
})

describe('the official-channel card', () => {
  it("renders the rule's own where.label, phone and url — nothing re-derived", () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const card = document.querySelector('.channel-card')!
    expect(card).toHaveTextContent(UI.prepare.channelK)
    expect(card).toHaveTextContent(escalate.where.label)
    const link = screen.getByRole('link', { name: UI.prepare.channelOpen })
    expect(link).toHaveAttribute('href', escalate.where.url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
  })

  it('omits the helpline row and the link when the rule carries neither', () => {
    // s-notice's real where is { label: "Submit to your BLO / ERO per the
    // notice's instructions" } — no url, no phone. Both optional fields
    // absent, which is what makes it the right negative fixture.
    render(<ControlledPrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.channel-phone')).toBeNull()
    expect(screen.queryByRole('link', { name: UI.prepare.channelOpen })).toBeNull()
    expect(document.querySelector('.channel-v')).toHaveTextContent(noticeD.where.label)
  })

  it('renders the helpline with the phone interpolated into the registered template', () => {
    // REAL data, no synthetic spread: passportPlaybook.ts:161-165 gives
    // state-5a where.phone '1800-258-1800', and PREP['state-5a'] exists, so
    // this row ships to real citizens today. See design note 5.
    expect(helplineD.where.phone).toBe('1800-258-1800')   // guards the fixture itself
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={helplineD} prep={PREP['state-5a']} />)
    expect(document.querySelector('.channel-phone'))
      .toHaveTextContent(UI.prepare.channelPhone.replace('{phone}', helplineD.where.phone!))
  })
})

describe('scope exclusions are structural, not incidental', () => {
  it('ships no save/casefile control (C5, no onSave wired) — and no fills-review panel here specifically because THIS fixture carries no caseFacts (Task 15 builds the mechanism; see "facts fill the draft" below for the positive case)', () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(document.querySelector('.btn-ghost')).toBeNull()
    expect(document.querySelector('.saved-note')).toBeNull()
    expect(document.querySelector('.fill-list')).toBeNull()
    expect(document.querySelector('.fill-review')).toBeNull()
  })
})

describe('the draft card', () => {
  let originalClipboard: PropertyDescriptor | undefined

  beforeEach(() => {
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
    })
  })
  afterEach(() => {
    // defineProperty is not a mock — restoreAllMocks does NOT undo it.
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else delete (navigator as { clipboard?: unknown }).clipboard
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete (globalThis as { jest?: unknown }).jest // see installJestShimForFakeTimers below
  })

  // A THIRD testing-library gotcha, beyond the two the brief already names
  // (userEvent.type eating brackets; restoreAllMocks not undoing
  // defineProperty): @testing-library/react's own `asyncWrapper` (the
  // implementation behind every userEvent await) drains pending microtasks
  // after each interaction by checking `typeof jest !== 'undefined'` and,
  // if so, calling `jest.advanceTimersByTime(0)` — hardcoded to Jest's
  // global, not Vitest's. Under `vi.useFakeTimers()` there is no global
  // `jest` in this repo's Vitest setup, so that check is always false, the
  // drain's own internal 0ms timer is never advanced, and `userEvent.click`
  // hangs forever — independent of the `advanceTimers` option passed to
  // `userEvent.setup()`, since the stall is inside @testing-library/react's
  // asyncWrapper, not inside user-event's own timer-wait logic. Verified by
  // isolating it down to a trivial button component with no clipboard/copy
  // logic at all. The minimal, targeted fix: a `jest` shim exposing only
  // `advanceTimersByTime`, delegated straight to `vi.advanceTimersByTime` —
  // enough for that one internal check to see fake timers as "enabled" and
  // actually drain. Scoped to the two tests below that turn fake timers on;
  // torn down in the shared afterEach above so it never leaks into other
  // test files.
  const installJestShimForFakeTimers = () => {
    ;(globalThis as { jest?: { advanceTimersByTime: (ms: number) => void } }).jest = {
      advanceTimersByTime: (ms: number) => { vi.advanceTimersByTime(ms) },
    }
  }

  it('is absent when the plan carries no draft (the three SIR plans)', () => {
    render(<ControlledPrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.prep-card')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('seeds the textarea with the RAW template — no caseFacts substitution (C8)', () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    expect(ta).toHaveValue(PREP['state-5b'].draft)
    // jest-dom@7's toHaveValue compares with `===` (compareAsSet's non-array
    // branch), not an asymmetric-matcher-aware `equals` — so
    // `expect.stringContaining(...)` silently never matches through it, in
    // this repo's actually-installed version. Assert the raw .value instead;
    // same intent (the raw, unfilled bracket survives verbatim).
    expect(ta.value).toContain('[CPGRAMS grievance number]')
  })

  it('shows the right hint at FIRST RENDER, computed from the shipped draft', () => {
    // Not a hard-coded number: derived from the data, so this test tracks the
    // locked copy rather than a figure someone typed once. (state-5b ships 6
    // brackets today — assert the derivation, not the 6.)
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const n = (PREP['state-5b'].draft!.match(/\[[^\]]*\]/g) ?? []).length
    expect(n).toBeGreaterThan(1)
    expect(document.querySelector('.prep-hint'))
      .toHaveTextContent(UI.prepare.hintMany.replace('{n}', String(n)))
  })

  it('the blank-count hint is live and plural-correct as the user edits', () => {
    // fireEvent.change, NOT userEvent.type: user-event v14 reads `[...]` as a
    // KEY DESCRIPTOR and eats it — `userEvent.type(ta, 'one [a] two [b]')`
    // leaves the value "one  two " (verified against 14.6.7 in this repo), so
    // bracketCount would see 0 and this test would silently measure nothing.
    // Do not "simplify" this back to userEvent.type. See design note 7.
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })

    fireEvent.change(ta, { target: { value: 'one [a] two [b]' } })
    expect(ta).toHaveValue('one [a] two [b]')     // guards the harness itself
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintMany.replace('{n}', '2'))

    fireEvent.change(ta, { target: { value: 'only [a]' } })
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintOne.replace('{n}', '1'))

    fireEvent.change(ta, { target: { value: 'nothing left to fill' } })
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintReady)
  })

  it('copies the EDITED text, and names the blanks left instead of policing them', async () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })
    fireEvent.change(ta, { target: { value: 'ready [x] set' } })
    const btn = screen.getByRole('button', { name: UI.prepare.copy })
    expect(btn).toBeEnabled()                     // never blocked on blanks
    await userEvent.click(btn)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ready [x] set')
    const flashed = await screen.findByRole('button', { name: UI.prepare.copiedOne.replace('{n}', '1') })
    expect(flashed).toHaveClass('copied-warn')
    expect(flashed).not.toHaveClass('copied')
  })

  it('shows the clean "Copied ✓" state when nothing is left to fill', async () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })
    fireEvent.change(ta, { target: { value: 'all done' } })
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
    const flashed = await screen.findByRole('button', { name: UI.prepare.copied })
    expect(flashed).toHaveClass('copied')
    expect(flashed).not.toHaveClass('copied-warn')
  })

  it('keeps the count from the MOMENT OF COPYING even if the user edits during the flash', async () => {
    // Prototype captures S.copiedBrackets before the flash (design note 6).
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })
    fireEvent.change(ta, { target: { value: 'a [x] b [y]' } })
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
    await screen.findByRole('button', { name: UI.prepare.copiedMany.replace('{n}', '2') })
    fireEvent.change(ta, { target: { value: 'no blanks now' } })
    // Still says 2 — the button reports what was true when they copied.
    expect(screen.getByRole('button', { name: UI.prepare.copiedMany.replace('{n}', '2') })).toBeInTheDocument()
    // ...while the live hint has already moved on.
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintReady)
  })

  it('reverts to "Copy draft" after 2200ms (prototype 3742)', async () => {
    vi.useFakeTimers()
    installJestShimForFakeTimers()
    // user-event v14 awaits REAL timers by default and hangs forever under
    // fake ones. Its own setup option is the fix; do not drop it.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    fireEvent.change(screen.getByRole('textbox', { name: UI.prepare.draftAria }), {
      target: { value: 'all done' },
    })
    await user.click(screen.getByRole('button', { name: UI.prepare.copy }))
    // Flush the mocked clipboard promise's microtask with a bare
    // `act(async () => {})`, NOT `findByRole`/`waitFor`: under the
    // installJestShimForFakeTimers shim, @testing-library/dom's `waitFor`
    // takes the "jest fake timers" branch and advances the shared fake
    // clock by its own 50ms `interval` on every poll it needs (wait-for.js:
    // `jest.advanceTimersByTime(interval)`) until the callback passes. That
    // clock time is not free here — it comes straight out of the 2200ms
    // budget this test is about to measure, so a findByRole here would
    // silently eat some of it before the test's own explicit advances even
    // start. Plain `act(async () => {})` drains the pending microtask (React
    // `act`'s own mechanism, unrelated to fake timers) without moving the
    // clock at all.
    await act(async () => {})
    expect(screen.getByRole('button', { name: UI.prepare.copied })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(2199) })
    expect(screen.queryByRole('button', { name: UI.prepare.copy })).toBeNull()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('button', { name: UI.prepare.copy })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.prepare.copied })).toBeNull()
  })

  it('clears the flash timer on unmount — no setState on a dead component', async () => {
    vi.useFakeTimers()
    installJestShimForFakeTimers()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(
      <ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />,
    )
    await user.click(screen.getByRole('button', { name: UI.prepare.copy }))
    unmount()
    // React 18 removed the "state update on an unmounted component" console
    // warning, and this repo is on React 19 — so `errorSpy` alone cannot
    // fail here even if the cleanup is deleted (a post-unmount setState is
    // just a silent no-op now, not a caught error). getTimerCount() is what
    // actually distinguishes "cleaned up" from "not cleaned up": it's 1
    // without the effect's clearTimeout, 0 with it.
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(errorSpy).not.toHaveBeenCalled() // cheap secondary check
  })

  it('falls back to selecting the textarea when the clipboard rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true,
    })
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    const selectSpy = vi.spyOn(ta, 'select')
    fireEvent.change(ta, { target: { value: 'all done' } })
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
    // The rejection is handled: the textarea is selected so the citizen can
    // copy by hand, and the button NEVER claims a copy that did not happen.
    await waitFor(() => expect(selectSpy).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: UI.prepare.copy })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.prepare.copied })).toBeNull()
  })
})

// Task 15 (FR-AI-04/AC-AI-4) — "the riskiest UI in the chunk, because it
// puts a value the citizen may not have checked into a letter they will
// send to a government office." A fact whose bracket IS in state-5b's real
// draft (`[File Number / ARN]`, alongside 5 other still-unfilled brackets —
// see the existing "shows the right hint at FIRST RENDER" test above for
// the 6-bracket count this fixture ships with today), so filling it still
// leaves blanks — the fixture this suite's "blanks remaining, fills
// present" cases need.
const arnFact = (over: Partial<Fact> = {}): Fact => ({
  kind: 'reference_number', refType: 'arn', label: 'ARN', value: '123456789012',
  fills: '[File Number / ARN]', ...over,
})

// A synthetic plan whose ONLY bracket is fully covered by `fillingFact` —
// the shape "no shipped PREP plan produces unassisted" (screenCopy.ts's own
// comment on `hintFilledUnreviewed`), needed to reach the middle/ready hint
// states without a live edit standing in for the citizen's own text.
const fullyFillablePrep: PrepPlan = { draft: 'Reference number: [ARN]. Nothing else needed.', steps: ['Step A'] }
const fillingFact: Fact = {
  kind: 'reference_number', refType: 'arn', label: 'ARN', value: 'AB123456789', fills: '[ARN]',
}

describe('facts fill the draft, visibly, behind a review acknowledgment (Task 15, FR-AI-04/AC-AI-4)', () => {
  it('a case with an ARN fact renders the draft with the bracket replaced, and the fill list showing "ARN: <value>"', () => {
    render(
      <ControlledPrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']}
        caseFacts={[arnFact()]}
      />,
    )
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    expect(ta.value).not.toContain('[File Number / ARN]')     // the bracket is gone
    expect(ta.value).toContain('123456789012')                // replaced with the fact's value
    expect(document.querySelector('.fill-list')).toHaveTextContent('ARN: 123456789012')
  })

  describe('the hint has three states, checked in this order (design note 4): blanks remaining, then unreviewed fills, then ready', () => {
    it(
      'blanks remaining WITH fills present shows the blank count, never "check the details" — checking ' +
      'fillsReviewed before the blank count would wrongly show the middle state over a draft that still has blanks',
      () => {
        render(
          <ControlledPrepareScreen
            serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']}
            caseFacts={[arnFact()]}
          />,
        )
        const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
        const n = (ta.value.match(/\[[^\]]*\]/g) ?? []).length
        expect(n).toBeGreaterThan(0)   // guards the fixture: blanks genuinely remain after the ARN fill
        expect(document.querySelector('.prep-hint'))
          .toHaveTextContent((n === 1 ? UI.prepare.hintOne : UI.prepare.hintMany).replace('{n}', String(n)))
        expect(document.querySelector('.prep-hint')).not.toHaveTextContent(UI.prepare.hintFilledUnreviewed)
      },
    )

    it('no blanks + unreviewed fills shows the new middle state', () => {
      render(
        <ControlledPrepareScreen
          serviceLabel="Passport" engineKey="passport" d={escalate} prep={fullyFillablePrep}
          caseFacts={[fillingFact]}
        />,
      )
      const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
      expect((ta.value.match(/\[[^\]]*\]/g) ?? []).length).toBe(0)   // guards the fixture: no blanks left
      expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintFilledUnreviewed)
    })

    it('no blanks + REVIEWED fills shows hintReady', async () => {
      render(
        <ControlledPrepareScreen
          serviceLabel="Passport" engineKey="passport" d={escalate} prep={fullyFillablePrep}
          caseFacts={[fillingFact]}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: UI.prepare.fillReviewLabel }))
      expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintReady)
    })

    it('no blanks + no fills shows hintReady — the pre-existing two-state behaviour, unchanged', () => {
      render(
        <ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />,
      )
      fireEvent.change(screen.getByRole('textbox', { name: UI.prepare.draftAria }), {
        target: { value: 'nothing left to fill' },
      })
      expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintReady)
    })
  })

  it(
    'D14: in the blanks-remaining state with fills present, the hint mentions nothing about fills — but the ' +
    '.fill-list still renders. The spec promises a dual-state sentence ("3 blanks · 2 filled from your text"); ' +
    'the prototype does not implement one and the prototype wins (D14) — composing a combined sentence would ' +
    'author a new citizen-facing string. AC-AI-4\'s actual requirement (every auto-filled value stays visible) ' +
    'holds anyway, because the fill list renders in both hint states.',
    () => {
      expect.assertions(2)
      render(
        <ControlledPrepareScreen
          serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']}
          caseFacts={[arnFact()]}
        />,
      )
      expect(document.querySelector('.prep-hint')?.textContent).not.toContain('filled from your text')
      expect(document.querySelector('.fill-list')).not.toBeNull()
    },
  )

  it('the review control is a real button with aria-pressed, and toggles both ways — a citizen who ticks it and spots a wrong value must be able to untick it', async () => {
    render(
      <ControlledPrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={fullyFillablePrep}
        caseFacts={[fillingFact]}
      />,
    )
    const btn = screen.getByRole('button', { name: UI.prepare.fillReviewLabel })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(btn)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(btn)                         // and it un-ticks
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  describe('AC-AI-4 as a property (design note 8): "every auto-filled draft value is visible in the fills list" — for ANY facts/draft combination, a text change from fillDraft implies a non-empty, rendered fill list', () => {
    it.each([
      ['a fact whose bracket is in the draft', PREP['state-5b'], [arnFact()]],
      ['a fact whose bracket is absent from THIS draft fills nothing', PREP['state-5b'], [arnFact({ fills: '[Not In This Draft]' })]],
      ['a fact with fills: null fills nothing', PREP['state-5b'], [arnFact({ fills: null })]],
      ['no facts at all', PREP['state-5b'], []],
      ['a fully-fillable synthetic plan', fullyFillablePrep, [fillingFact]],
      ['multiple facts, only one of which matches', PREP['state-5b'], [arnFact(), arnFact({ label: 'Other', fills: '[Nonexistent]', value: 'x' })]],
    ] as const)('%s', (_label, prep, caseFacts) => {
      const { text } = fillDraft(prep.draft ?? '', [...caseFacts])
      render(
        <ControlledPrepareScreen
          serviceLabel="Passport" engineKey="passport" d={escalate} prep={prep}
          caseFacts={[...caseFacts]}
        />,
      )
      if (text !== (prep.draft ?? '')) {
        expect(
          document.querySelector('.fill-list'),
          "AC-AI-4: every auto-filled draft value must be visible in the fills list",
        ).not.toBeNull()
      } else {
        expect(document.querySelector('.fill-list')).toBeNull()
      }
    })
  })

  describe('copy is never blocked by an unreviewed fill (FR-P-06 regression pin)', () => {
    let originalClipboard: PropertyDescriptor | undefined
    beforeEach(() => {
      originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
      })
    })
    afterEach(() => {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
      else delete (navigator as { clipboard?: unknown }).clipboard
      vi.restoreAllMocks()
    })

    it('with fills unreviewed, copy still works and still reports the blank count — the hint changes, never the button', async () => {
      render(
        <ControlledPrepareScreen
          serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']}
          caseFacts={[arnFact()]}
        />,
      )
      const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
      const n = (ta.value.match(/\[[^\]]*\]/g) ?? []).length
      expect(n).toBeGreaterThan(1)   // guards the fixture: state-5b's other blanks are still there
      const btn = screen.getByRole('button', { name: UI.prepare.copy })
      expect(btn).toBeEnabled()      // never blocked on an unreviewed fill
      await userEvent.click(btn)
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(ta.value)
      expect(
        await screen.findByRole('button', { name: UI.prepare.copiedMany.replace('{n}', String(n)) }),
      ).toBeInTheDocument()
    })
  })

  it(
    'prepDraft is NOT written with the filled text — after render, prepDraft stays null. Writing the fill into ' +
    'prepDraft would make it indistinguishable from the citizen\'s own edit and strand it after a correction ' +
    'clears the facts (design note 3)',
    () => {
      let capturedPrepDraft: string | null = 'UNSET'
      function Probe() {
        const [prepDraft, setPrepDraft] = useState<string | null>(null)
        // Captured in an effect, not during render — reassigning an
        // outer-scope variable mid-render is a real lint finding
        // (react(globals)), not just style; the effect still runs
        // synchronously within RTL's render() (wrapped in act()).
        useEffect(() => { capturedPrepDraft = prepDraft })
        return (
          <PrepareScreen
            serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']}
            prepChecks={{}} onTogglePrepStep={() => {}}
            prepDraft={prepDraft} onSetPrepDraft={setPrepDraft}
            caseFacts={[arnFact()]} fillsReviewed={false} onToggleFillsReviewed={() => {}}
          />
        )
      }
      render(<Probe />)
      // The draft textarea shows the FILLED text (the ARN bracket is gone)…
      const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
      expect(ta.value).not.toContain('[File Number / ARN]')
      // …but prepDraft itself, the reducer field a later ANSWER correction
      // would leave stranded, was never written to.
      expect(capturedPrepDraft).toBeNull()
    },
  )

  it(
    'a restored saved case with fills shows the middle hint state, not "ready to copy and send" (design note 7 — ' +
    'Task 8 already resets fillsReviewed on load at the reducer; this asserts it end-to-end through the screen, ' +
    'via a REAL loadCase() restore, not hand-typed props — fix round 1, Important finding: the previous version ' +
    'of this test hard-coded caseFacts/fillsReviewed directly as props, so it never actually exercised the ' +
    'restore path and stayed green even when a mutation made the restore stop resetting fillsReviewed)',
    () => {
      // A real Casefile whose caseFacts carry fullyFillablePrep's own
      // fillable fact — the SAME fixtures the "no blanks + unreviewed
      // fills" test above already establishes reach the middle hint state.
      // The diagnosis passed to caseSnapshot need not match fullyFillablePrep:
      // PrepareScreen's `d`/`prep` props are independent of whatever plan the
      // SAVED case's own diagnosis pointed at, and caseSnapshot only reads
      // `d` for its own label/rec/stepsTotal bookkeeping — it never
      // re-derives caseFacts from it.
      const snap = caseSnapshot(
        'passport', 'Passport', 'passport-nextmove', escalate,
        { q1: 'adverse', q2: 'formal_grievance' }, {},
        [fillingFact], null, null, 1_760_000_000_000,
      )
      const saved: Casefile = {
        ...snap, id: 'c-restore', outcome: 'still_open', lastCheck: null, remindAt: null, log: [],
      }

      // The real restore path (cases.ts's own loadCase() — the function both
      // the OPEN_CHECKIN and REOPEN_CASE reducer arms resolve through via
      // loadCaseFragment) — never hand-typed caseFacts/fillsReviewed props.
      const fragment = loadCase([saved], 'c-restore')
      expect(fragment).not.toBeNull()
      expect(fragment!.caseFacts).toEqual([fillingFact])  // guards the premise: the fact really did restore
      expect(fragment!.fillsReviewed).toBe(false)          // guards the premise: the restore really did reset it

      render(
        <PrepareScreen
          serviceLabel="Passport" engineKey="passport" d={escalate} prep={fullyFillablePrep}
          prepChecks={fragment!.prepChecks} onTogglePrepStep={() => {}}
          prepDraft={fragment!.prepDraft} onSetPrepDraft={() => {}}
          caseFacts={fragment!.caseFacts} fillsReviewed={fragment!.fillsReviewed} onToggleFillsReviewed={() => {}}
        />,
      )
      expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintFilledUnreviewed)
      expect(document.querySelector('.prep-hint')).not.toHaveTextContent(UI.prepare.hintReady)
    },
  )

  it('a case with NO facts renders no fill list and behaves exactly as it does today — full regression pin on the shipped C4/C5 prepare screen', () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    expect(ta).toHaveValue(PREP['state-5b'].draft)          // the RAW template, untouched
    expect(document.querySelector('.fill-list')).toBeNull()
    expect(document.querySelector('.fill-review')).toBeNull()
    const n = (PREP['state-5b'].draft!.match(/\[[^\]]*\]/g) ?? []).length
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintMany.replace('{n}', String(n)))
  })
})

// Small helper: tick every step on the currently rendered screen.
const tickAll = async (n: number) => {
  const ticks = screen.getAllByRole('button', { pressed: false })
    .filter(b => b.classList.contains('pstep-tick'))
  expect(ticks).toHaveLength(n)
  for (const t of ticks) await userEvent.click(t)
}

describe('the step checklist', () => {
  it('renders one tickable row per step, with the counter starting at 0 of N', () => {
    const plan = PREP['state-5b']
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan} />)
    expect(document.querySelectorAll('.pstep-tick')).toHaveLength(plan.steps.length)
    for (const b of document.querySelectorAll('.pstep-tick')) {
      expect(b.tagName).toBe('BUTTON')
      expect(b).toHaveAttribute('aria-pressed', 'false')
    }
    expect(document.querySelector('.psteps-count')).toHaveTextContent(
      UI.prepare.stepsCount.replace('{done}', '0').replace('{total}', String(plan.steps.length)),
    )
  })

  it('ticking a step flips aria-pressed and the .done class, and advances the counter', async () => {
    const plan = PREP['state-5b']
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan} />)
    const first = document.querySelectorAll('.pstep-tick')[0] as HTMLButtonElement
    await userEvent.click(first)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(first.closest('.pstep')).toHaveClass('done')
    // Interpolated from the registered template, never a hand-built string.
    expect(document.querySelector('.psteps-count')).toHaveTextContent(
      UI.prepare.stepsCount.replace('{done}', '1').replace('{total}', String(plan.steps.length)),
    )
    await userEvent.click(first)                       // and it un-ticks
    expect(first).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.psteps-count')).toHaveTextContent(
      UI.prepare.stepsCount.replace('{done}', '0').replace('{total}', String(plan.steps.length)),
    )
  })

  it('a step with a url gets an "Open ↗" link that is a SIBLING of the tick button', () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const link = screen.getAllByRole('link', { name: UI.prepare.stepOpen })[0]
    expect(link.closest('button')).toBeNull()          // never nested in the button
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
    const urlStep = PREP['state-5b'].steps.find(s => typeof s !== 'string') as { url: string }
    expect(link).toHaveAttribute('href', urlStep.url)
  })

  it('a bare-string step gets no link', () => {
    // Measured: EVERY shipped plan has exactly one url-bearing step and the
    // rest bare, so there is no all-bare plan to use as a negative fixture.
    // Assert per-ROW instead of per-plan: the link count matches the url-step
    // count, and each bare step's own row carries no anchor.
    const plan = PREP['state-5b']
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan} />)
    const withUrl = plan.steps.filter(s => typeof s !== 'string').length
    expect(withUrl).toBe(1)
    expect(withUrl).toBeLessThan(plan.steps.length)    // there ARE bare steps to check
    expect(screen.getAllByRole('link', { name: UI.prepare.stepOpen })).toHaveLength(withUrl)
    const rows = document.querySelectorAll('.pstep')
    plan.steps.forEach((s, i) => {
      expect(rows[i].querySelectorAll('a').length, String(i)).toBe(typeof s === 'string' ? 0 : 1)
    })
  })

  it("the done note appears only when every step is ticked, and uses the plan's own text", async () => {
    const plan = PREP['state-5b']                      // carries its own doneNote
    const { unmount } = render(
      <ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan} />,
    )
    expect(document.querySelector('.psteps-done')).toBeNull()
    await tickAll(plan.steps.length)
    expect(document.querySelector('.psteps-done')).toHaveTextContent(plan.doneNote!)
    unmount()

    const noNote = PREP['state-4']                     // carries none -> fallback
    expect(noNote.doneNote).toBeUndefined()
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={noNote} />)
    await tickAll(noNote.steps.length)
    expect(document.querySelector('.psteps-done')).toHaveTextContent(UI.prepare.doneNoteFallback)
  })

  it('the check icon is always in the DOM — the lifted CSS does the showing', () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(document.querySelectorAll('.pstep-box svg').length).toBe(PREP['state-5b'].steps.length)
  })
})

describe('the in-person visit card', () => {
  it('is absent for a plan with no visit block', () => {
    expect(PREP['state-5b'].visit).toBeUndefined()     // guards the fixture
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(document.querySelector('.visit-card')).toBeNull()
    expect(screen.queryByText(UI.prepare.visitTitle)).toBeNull()
  })

  it("keeps the rule's verified Carry list and the shared general tips in SEPARATE columns", () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={PREP['state-4']} />)
    const cols = document.querySelectorAll('.visit-cols > div')
    expect(cols).toHaveLength(2)
    expect(cols[0]).toHaveTextContent(UI.prepare.visitCarry)
    expect(cols[1]).toHaveTextContent(UI.prepare.visitExpect)
    for (const c of PREP['state-4'].visit!.carry) expect(cols[0]).toHaveTextContent(c)
    for (const e of VISIT_EXPECT) expect(cols[1]).toHaveTextContent(e)
    // The point of the separation: no verified carry item leaks into the
    // general-tips column and vice versa.
    for (const e of VISIT_EXPECT) expect(cols[0]).not.toHaveTextContent(e)
  })

  it('always shows the general-advice disclaimer under the card', () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={PREP['state-4']} />)
    expect(document.querySelector('.visit-note')).toHaveTextContent(UI.prepare.visitNote)
  })

  it('shows "Then what?" only when the visit block carries an `after` line', () => {
    // All six shipped visit blocks carry `after`, so the positive case is
    // real data and the negative case must be synthetic — the branch is
    // locked markup and an `after`-less visit is a legal PrepVisit shape.
    const plan = PREP['state-4']
    const { unmount } = render(
      <ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={plan} />,
    )
    expect(screen.getByText(UI.prepare.visitThen)).toBeInTheDocument()
    expect(document.querySelector('.visit-card')).toHaveTextContent(plan.visit!.after!)
    unmount()

    const noAfter = { ...plan, visit: { carry: plan.visit!.carry } }
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={noAfter} />)
    expect(document.querySelector('.visit-card')).toBeInTheDocument()   // card still shows
    expect(screen.queryByText(UI.prepare.visitThen)).toBeNull()         // heading does not
  })
})

describe('the closing control', () => {
  it('"Done, back to Home" dispatches RESTART — never a navigation (scope exclusion 6)', async () => {
    const dispatch = vi.fn()
    render(
      <ControlledPrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate}
        prep={PREP['state-5b']} dispatch={dispatch}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.doneBackHome }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'NAVIGATE' }))
  })

  it('is the last control on the screen — no save control follows it (C5)', () => {
    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={PREP['state-4']} />)
    const done = screen.getByRole('button', { name: UI.prepare.doneBackHome })
    const controls = Array.from(document.querySelectorAll('button, a[href]'))
    expect(controls[controls.length - 1]).toBe(done)
    // And the C5 markers specifically, by name rather than by position.
    expect(document.querySelector('.btn-ghost')).toBeNull()
    expect(document.querySelector('.saved-note')).toBeNull()
    expect(document.querySelector('.saved-next')).toBeNull()
  })
})

// The INTERACTION_GATED coverage sweep (the SCREEN_COPY strings no static
// mount can produce) used to live here. Task 11's review relocated it to
// src/screens/interactionGated.test.tsx: this file is about ONE component,
// and the gated set already spans PrepareScreen AND DescribeBlock (Task 13/
// 15 add a third and a fourth owner) — an awkward home for a mechanism that
// is not about this component specifically. `ControlledPrepareScreen` and
// `tickAll` above are still used by that relocated file's own
// `ui:prepare.*` assertions (re-declared there, not imported — see that
// file's own header comment for why).

// Task 12 lifted `prepChecks`/`prepDraft` into the reducer; Task 13 finished
// the job (design note 6) — PrepareScreen is now ALWAYS a controlled
// component (no local-state fallback left to fall back to). Every test
// above renders through `ControlledPrepareScreen`, this file's own stand-in
// for the reducer; these describe blocks instead wire the controlled props
// through directly, to pin the controlled behaviour itself.
describe('the "done" count is index-based, not Object.values-based (design note 3)', () => {
  it('a stale prepChecks index beyond the plan\'s own step count must not inflate the count', () => {
    // A synthetic 3-step plan (any content works — the point is the STEP
    // COUNT, not what the steps say) with a stale prepChecks index (3) that
    // has no matching step: index 3 "left over" from what would have been a
    // longer plan before a diagnosis change. `Object.values(prepChecks)
    // .filter(Boolean).length` would wrongly count BOTH index 0 and the
    // stale index 3 and render "2 of 3 done" — indexing through
    // `prep.steps.length` (===3) can only ever see indices 0-2, so the
    // stale tick is invisible to the count, and the correct answer is 1.
    const stalePlan: PrepPlan = { steps: ['Step A', 'Step B', 'Step C'] }
    render(
      <PrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={stalePlan}
        prepChecks={{ 0: true, 3: true }} prepDraft={null}
        onTogglePrepStep={() => {}} onSetPrepDraft={() => {}}
        caseFacts={[]} fillsReviewed={false} onToggleFillsReviewed={() => {}}
      />,
    )
    expect(document.querySelector('.psteps-count')).toHaveTextContent(
      UI.prepare.stepsCount.replace('{done}', '1').replace('{total}', '3'),
    )
    // Only 3 rows render — the stale index 3 has no step to render a row
    // for, the same way a sparse record never carries a meaningless
    // `false` for a step that does not exist (design note 2, Task 12).
    expect(document.querySelectorAll('.pstep-tick')).toHaveLength(3)
  })
})

describe('prepChecks/prepDraft — fully controlled (Task 12/13, design note 6)', () => {
  it('ticking a step, navigating away and back (unmount/remount with the SAME reducer-held prepChecks) preserves the ticks — the C4 behaviour gap, now closed', async () => {
    // Simulates a real dispatch -> reducer -> new-props cycle without a real
    // reducer: `onTogglePrepStep` mutates this outer, component-external
    // variable exactly the way a session reducer's committed state would
    // survive independently of any one PrepareScreen instance.
    let liveChecks: Record<number, boolean> = {}
    const onTogglePrepStep = (i: number) => {
      liveChecks = { ...liveChecks, [i]: !liveChecks[i] }
    }
    const plan = PREP['state-5b']
    const renderScreen = () => render(
      <PrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan}
        prepChecks={liveChecks} onTogglePrepStep={onTogglePrepStep}
        prepDraft={null} onSetPrepDraft={() => {}}
        caseFacts={[]} fillsReviewed={false} onToggleFillsReviewed={() => {}}
      />,
    )

    const first = renderScreen()
    await userEvent.click(document.querySelectorAll('.pstep-tick')[0])
    expect(liveChecks).toEqual({ 0: true }) // the callback fired and updated the OUTER state
    first.unmount() // simulates navigating away — throws away every local useState

    // Simulates navigating back: a FRESH mount, fed the SAME (now-updated)
    // `liveChecks` a real reducer would still be holding.
    renderScreen()
    expect(document.querySelectorAll('.pstep-tick')[0]).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.psteps-count')).toHaveTextContent(
      UI.prepare.stepsCount.replace('{done}', '1').replace('{total}', String(plan.steps.length)),
    )
  })

  it('controlled draft: typing calls onSetPrepDraft with the raw text, and prepDraft=null (post-ANSWER reset) shows the raw template', () => {
    const onSetPrepDraft = vi.fn()
    const plan = PREP['state-5b']
    const { rerender } = render(
      <PrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan}
        prepDraft="edited text" onSetPrepDraft={onSetPrepDraft}
        prepChecks={{}} onTogglePrepStep={() => {}}
        caseFacts={[]} fillsReviewed={false} onToggleFillsReviewed={() => {}}
      />,
    )
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    expect(ta).toHaveValue('edited text') // controlled — shows the prop, not the raw template

    fireEvent.change(ta, { target: { value: 'edited more' } })
    expect(onSetPrepDraft).toHaveBeenCalledWith('edited more')
    expect(ta).toHaveValue('edited text') // still controlled: unchanged until the prop itself moves

    // ANSWER resets prepDraft to null at the reducer (session.test.ts,
    // Task 4/12) — re-asserted HERE, through the screen: null means "shows
    // the raw template", not "shows an empty box".
    rerender(
      <PrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan}
        prepDraft={null} onSetPrepDraft={onSetPrepDraft}
        prepChecks={{}} onTogglePrepStep={() => {}}
        caseFacts={[]} fillsReviewed={false} onToggleFillsReviewed={() => {}}
      />,
    )
    expect(screen.getByRole('textbox', { name: UI.prepare.draftAria })).toHaveValue(plan.draft)
  })

  // ADDED REQUIREMENT verification (c): the actual state-loss-on-unmount bug
  // this whole effort exists to close, proven through a REAL component
  // unmount/remount — not an outer closure variable standing in for one
  // (the test above already does that, and is kept) — via
  // `PrepareBackAndForthHarness`, whose own `prepChecks`/`prepDraft`
  // `useState` sits ABOVE the toggled `<PrepareScreen>`, exactly where
  // App.tsx's session reducer sits relative to the real router's
  // `key={d.ruleId}`-remounted `*-prepare` screen case.
  it('a real unmount/remount (via PrepareBackAndForthHarness) preserves BOTH ticks and draft text', async () => {
    const plan = PREP['state-5b'] // carries a draft
    render(<PrepareBackAndForthHarness serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan} />)

    await userEvent.click(document.querySelectorAll('.pstep-tick')[0])
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })
    fireEvent.change(ta, { target: { value: 'my edited draft' } })
    expect(document.querySelectorAll('.pstep-tick')[0]).toHaveAttribute('aria-pressed', 'true')
    expect(ta).toHaveValue('my edited draft')

    // "Navigate away": PrepareScreen unmounts entirely (replaced by
    // "elsewhere" in the DOM) — every local useState it ever had is gone.
    await userEvent.click(screen.getByRole('button', { name: 'toggle away/back' }))
    expect(screen.queryByRole('textbox', { name: UI.prepare.draftAria })).toBeNull()
    expect(screen.getByText('elsewhere')).toBeInTheDocument()

    // "Navigate back": a FRESH PrepareScreen instance, fed the SAME
    // harness-held prepChecks/prepDraft — both survive.
    await userEvent.click(screen.getByRole('button', { name: 'toggle away/back' }))
    expect(document.querySelectorAll('.pstep-tick')[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: UI.prepare.draftAria })).toHaveValue('my edited draft')
  })
})

describe('the saveControl tail (Task 12, design note 6 / design note 3)', () => {
  it('renders <SaveControl> LAST, after "Done, back to Home", with stepsDone = the ticked-step count', () => {
    const onSave = vi.fn()
    const plan = PREP['state-5b']
    render(
      <PrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan}
        onSave={onSave} savedCases={[]} prepChecks={{ 0: true }}
        prepDraft={null} onTogglePrepStep={() => {}} onSetPrepDraft={() => {}}
        caseFacts={[]} fillsReviewed={false} onToggleFillsReviewed={() => {}}
      />,
    )
    const rightCol = document.querySelector('.split-r')!
    const children = Array.from(rightCol.children)
    const doneBtn = screen.getByRole('button', { name: UI.prepare.doneBackHome })
    const saveBtn = document.querySelector('.btn-ghost')!
    const doneIdx = children.indexOf(doneBtn)
    const saveIdx = children.indexOf(saveBtn as Element)
    expect(doneIdx).toBeGreaterThan(-1) // guard: direct child
    expect(saveIdx).toBeGreaterThan(-1) // guard: direct child
    expect(saveIdx).toBeGreaterThan(doneIdx)
    expect(saveIdx).toBe(children.length - 1) // the LAST child
    // One step ticked -> the "your ticked steps come with it" label.
    expect(saveBtn).toHaveTextContent(UI.saveControl.saveWithSteps)

    saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('shows the plain save label when nothing is ticked yet', () => {
    render(
      <ControlledPrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']}
        onSave={vi.fn()} savedCases={[]}
      />,
    )
    expect(document.querySelector('.btn-ghost')).toHaveTextContent(UI.saveControl.save)
  })

  it('shows the saved-note (no button) when a matching still-open saved case already exists', () => {
    const answers = { q1: 'adverse', q2: 'formal_grievance' }
    const snap = caseSnapshot('passport', 'Passport', 'passport-prepare', escalate, answers, {}, [], null, null, 1_760_000_000_000)
    const saved: Casefile = { ...snap, id: 'c1', outcome: 'still_open', lastCheck: null, remindAt: null, log: [] }
    render(
      <ControlledPrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']}
        onSave={vi.fn()} savedCases={[saved]}
      />,
    )
    expect(document.querySelector('.saved-note')).toHaveTextContent(UI.saveControl.savedNote)
    expect(screen.queryByRole('button', { name: UI.saveControl.save })).toBeNull()
  })
})

describe('C6: the freshBanner, first child of the right column, before the channel card (prototype 3770)', () => {
  it('renders it when freshDegraded is true, with the changedOn date interpolated', () => {
    render(
      <ControlledPrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']}
        freshDegraded freshChangedOn="3 Sep 2026"
      />,
    )
    expect(screen.getByText(UI.freshness.reverifiedLead)).toBeInTheDocument()
    expect(document.querySelector('.banner')).toHaveTextContent(
      UI.freshness.reverifiedBody.replace('{date}', '3 Sep 2026'),
    )
    const rightCol = document.querySelector('.split-r')!
    expect(rightCol.children[0]).toHaveClass('banner')
    expect(rightCol.children[1]).toHaveClass('channel-card')
  })

  it('omits it when freshDegraded is false or absent (pre-existing behaviour)', () => {
    const { unmount } = render(
      <ControlledPrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']}
        freshDegraded={false}
      />,
    )
    expect(screen.queryByText(UI.freshness.reverifiedLead)).toBeNull()
    unmount()

    render(<ControlledPrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.queryByText(UI.freshness.reverifiedLead)).toBeNull()
  })
})
