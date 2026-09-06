// NOTE: the shared test-harness imports an earlier draft of this file's
// plan wanted pre-imported for Tasks 4/5 (`vi`, `beforeEach`, `afterEach`,
// `fireEvent`, `userEvent`, `VISIT_EXPECT`) are deliberately NOT imported
// here unused — this repo's tsconfig.app.json has noUnusedLocals/
// noUnusedParameters on, which is a real, correct compiler setting, not
// something to relax or route around. The two testing-library gotchas that
// pre-import was meant to flag (vi.useFakeTimers() + user-event v14 hang;
// vi.restoreAllMocks() not restoring navigator.clipboard) are documented in
// the plan's design notes instead, for whichever task first needs them.
// Add each import at the task that actually uses it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrepareScreen } from './PrepareScreen'
import { PREP } from '../playbooks/prep'
import { diagnose } from '../domain/engine'
import { passportEngine, sirEngine } from '../playbooks/engines'
import { UI } from '../screens/screenCopy'

// Real engines on purpose: this is an integration point, and a toy fixture
// would not exercise a real `where` shape.
const escalate = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })  // state-5b
const noticeD = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })           // s-notice
// state-5a: the ONE reachable rule whose where carries a phone (1800-258-1800).
const helplineD = diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })         // state-5a

describe('the prepare shell', () => {
  it('crumbs read "<service> · <matched state>" then "Prepare"', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByText(`Passport · ${escalate.label}`)).toBeInTheDocument()
    expect(screen.getByText(UI.phase.prepare)).toBeInTheDocument()
    expect(document.querySelector('.crumb-sq')).toHaveClass('sq-passport')
  })

  it('uses the plan title when there is one, and the fallback headline when there is not', () => {
    const { unmount } = render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREP['state-5b'].title!)
    unmount()
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(UI.prepare.headlineFallback)
  })

  it('the lede matches whether the plan carries a draft', () => {
    const { unmount } = render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByText(UI.prepare.ledeDraft)).toBeInTheDocument()
    unmount()
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(screen.getByText(UI.prepare.ledeSteps)).toBeInTheDocument()
  })

  it('always shows the trust line — NextMove never submits (locked Non-Goal)', () => {
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.prep-trust')).toHaveTextContent(UI.prepare.trust)
  })
})

describe('the official-channel card', () => {
  it("renders the rule's own where.label, phone and url — nothing re-derived", () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
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
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.channel-phone')).toBeNull()
    expect(screen.queryByRole('link', { name: UI.prepare.channelOpen })).toBeNull()
    expect(document.querySelector('.channel-v')).toHaveTextContent(noticeD.where.label)
  })

  it('renders the helpline with the phone interpolated into the registered template', () => {
    // REAL data, no synthetic spread: passportPlaybook.ts:161-165 gives
    // state-5a where.phone '1800-258-1800', and PREP['state-5a'] exists, so
    // this row ships to real citizens today. See design note 5.
    expect(helplineD.where.phone).toBe('1800-258-1800')   // guards the fixture itself
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={helplineD} prep={PREP['state-5a']} />)
    expect(document.querySelector('.channel-phone'))
      .toHaveTextContent(UI.prepare.channelPhone.replace('{phone}', helplineD.where.phone!))
  })
})

describe('scope exclusions are structural, not incidental', () => {
  it('ships no save/casefile control (C5) and no fills-review panel (C8)', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
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
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.prep-card')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('seeds the textarea with the RAW template — no caseFacts substitution (C8)', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
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
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
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
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
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
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
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
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })
    fireEvent.change(ta, { target: { value: 'all done' } })
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
    const flashed = await screen.findByRole('button', { name: UI.prepare.copied })
    expect(flashed).toHaveClass('copied')
    expect(flashed).not.toHaveClass('copied-warn')
  })

  it('keeps the count from the MOMENT OF COPYING even if the user edits during the flash', async () => {
    // Prototype captures S.copiedBrackets before the flash (design note 6).
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
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
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
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
      <PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />,
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
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
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
