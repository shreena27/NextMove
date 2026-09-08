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
import { useState } from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrepareScreen, type PrepareScreenProps } from './PrepareScreen'
import { PREP, VISIT_EXPECT, type PrepPlan } from '../playbooks/prep'
import { diagnose } from '../domain/engine'
import { passportEngine, sirEngine } from '../playbooks/engines'
import { caseSnapshot } from '../domain/casefile'
import type { Casefile } from '../domain/casefile'
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
  props: Omit<PrepareScreenProps, 'prepChecks' | 'prepDraft' | 'onTogglePrepStep' | 'onSetPrepDraft'>,
) {
  const [mounted, setMounted] = useState(true)
  const [prepChecks, setPrepChecks] = useState<Record<number, boolean>>({})
  const [prepDraft, setPrepDraft] = useState<string | null>(null)
  return (
    <>
      <button onClick={() => setMounted(m => !m)}>toggle away/back</button>
      {mounted ? (
        <PrepareScreen
          {...props}
          prepChecks={prepChecks}
          prepDraft={prepDraft}
          onTogglePrepStep={i => setPrepChecks(prev => ({ ...prev, [i]: !prev[i] }))}
          onSetPrepDraft={setPrepDraft}
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
  it('ships no save/casefile control (C5) and no fills-review panel (C8)', () => {
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
