import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'

// -----------------------------------------------------------------------
// C8 Task 18 fix round 1 — CRITICAL. Two independent, global guards against
// this test suite ever making a real, billed network call.
//
// The hazard (found by the reviewer, via direct reproduction): Vitest loads
// `.env.local` into `import.meta.env`. Most tests in this codebase stub
// `VITE_DESCRIBE_IT` but do NOT stub `VITE_INTERPRETER` — so
// `interpreterId()` (called inside `runInterpretation`,
// `session/interpretation.ts`) reads whatever is actually sitting in
// `.env.local` at test-run time. The Task 18 brief's OWN manual-verification
// step tells the repo owner to put `VITE_DESCRIBE_IT=on`,
// `VITE_INTERPRETER=gemini` and a real `VITE_GEMINI_API_KEY` into
// `.env.local` — exactly the ambient state that would make the REAL Gemini
// adapter (`session/geminiInterpreter.ts`) run inside `App.test.tsx`'s
// story-driven flows and `interpretation.test.ts`'s `runInterpretation(`
// calls the moment the owner also runs `npm test -- --run`, which the same
// brief's own Verification checklist tells them to do next. Nothing caught
// this before Task 18 registered the real adapter (`PROVIDERS.gemini` was
// `null`), which is why it went unnoticed until now.
//
// Guard 1 closes the specific mechanism above. Guard 2 is a second,
// independent net catching ANY accidental real `fetch` in this suite, not
// just this one path — belt and braces, matching this codebase's own
// established double-guard pattern (see interpretation.ts's D16 comment on
// lazy resolution AND a total resolver).

/** Guard 1: force the test-run default interpreter id to `'sim'`, before
 *  EVERY test, unconditionally — so ambient `.env.local` content can never
 *  leak the real id into a test run. A test that deliberately wants to
 *  exercise the gemini path calls its OWN
 *  `vi.stubEnv('VITE_INTERPRETER', 'gemini')` inside the test body (there
 *  are already ~4 that do, e.g. `interpretation.test.ts`'s "provider
 *  registry" describe block) — that call runs INSIDE the test, after every
 *  `beforeEach` hook (including this one) has already run, so it correctly
 *  overrides this default for that one test. Whichever test-file `afterEach`
 *  calls `vi.unstubAllEnvs()` afterwards (the established pattern throughout
 *  this codebase) clears that override; this `beforeEach` re-applies the
 *  safe default before the NEXT test's body runs either way, so there is no
 *  gap in either direction. */
beforeEach(() => {
  vi.stubEnv('VITE_INTERPRETER', 'sim')
})

/** Guard 2: a default global `fetch` that throws a loud, unambiguous error
 *  instead of silently attempting a real network request. Independent of
 *  Guard 1 — this catches ANY accidental real `fetch` call in the suite, not
 *  only one reached via `VITE_INTERPRETER`. A test that deliberately drives
 *  a fetch-calling code path stubs `fetch` itself
 *  (`vi.stubGlobal('fetch', ...)`, the established pattern already used in
 *  `geminiInterpreter.test.ts` and `interpretation.test.ts`) — that stub
 *  runs inside the test body, after this `beforeEach`, and correctly
 *  overrides it for that test. Re-applied before every test the same way
 *  Guard 1 is, so a prior test's own stub (or its absence) never leaks
 *  forward.
 *
 *  Whole-branch review (2026-09-09 fix wave), Finding 5: scoped OFF when
 *  `NEXTMOVE_SUPABASE_LIVE` is set — `supabase/rls.live.test.ts`'s whole
 *  `describe` block is itself skipped unless that env var is set (so this
 *  gap was invisible under a normal `npm test` run), but when it IS set,
 *  that file makes REAL Supabase calls through the REAL global `fetch` —
 *  this guard, unconditionally applied, was stubbing that fetch out from
 *  under it and turning an opt-in live integration test into a silent no-op
 *  (or a confusing failure) instead of the real network exercise it is
 *  supposed to be. Guard 1 (`VITE_INTERPRETER`) is untouched — this scoping
 *  applies to Guard 2 only. */
function unmockedFetchGuard(): Promise<never> {
  return Promise.reject(
    new Error(
      "unmocked fetch call in a test — stub it explicitly with vi.stubGlobal('fetch', ...) before "
        + 'exercising code that calls fetch. This guard exists so an accidental real network call in the '
        + 'test suite fails loudly instead of silently going out over the wire.',
    ),
  )
}

beforeEach(() => {
  if (!process.env.NEXTMOVE_SUPABASE_LIVE) {
    vi.stubGlobal('fetch', unmockedFetchGuard)
  }
})
