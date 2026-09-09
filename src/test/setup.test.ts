// Proves the two global test-safety guards registered in src/test/setup.ts
// (Task 18 fix round 1, CRITICAL) are genuinely load-bearing, not just
// present in the file. See setup.ts's own header comment for the full
// hazard these close: without them, ambient `.env.local` content (which the
// Task 18 brief's own manual-verification step tells the repo owner to set
// to VITE_INTERPRETER=gemini + a real key) can make the test suite send
// real, billed requests to Google the moment `npm test -- --run` runs,
// exactly as the brief's own Verification checklist instructs next.
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { interpreterId } from '../session/featureFlags'

describe("setup.ts Guard 1 — VITE_INTERPRETER defaults to 'sim' before every test, even with ambient gemini-shaped env state", () => {
  // Simulates the reviewer's own reproduction: VITE_INTERPRETER=gemini
  // already sitting in the environment BEFORE this describe block's own
  // tests run — the same shape ambient `.env.local` content takes (set once
  // by Vite/Vitest's own env loading, long before any individual test body
  // runs). Set in `beforeAll` — which runs once, BEFORE setup.ts's global
  // per-test `beforeEach` fires for the first test below — and restored in
  // `afterAll` so it can never leak into another test file.
  beforeAll(() => {
    vi.stubEnv('VITE_INTERPRETER', 'gemini')
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it("interpreterId() still resolves to 'sim' inside the test body, with NO vi.stubEnv call of its own — proving setup.ts's global beforeEach re-applies the safe default AFTER beforeAll's ambient value and BEFORE this test runs, exactly the sequence a leaked .env.local value would otherwise exploit", () => {
    expect(interpreterId()).toBe('sim')
  })

  it("an explicit vi.stubEnv('VITE_INTERPRETER', 'gemini') INSIDE a test body still wins over the default — the ~4 tests elsewhere in this suite that deliberately exercise the real gemini path (e.g. interpretation.test.ts's 'provider registry' describe block) keep working unchanged", () => {
    vi.stubEnv('VITE_INTERPRETER', 'gemini')
    expect(interpreterId()).toBe('gemini')
  })
})

describe('setup.ts Guard 2 — an unstubbed global fetch() throws a loud guard error instead of attempting a real request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calling fetch() with no explicit stub REJECTS with the guard error, not a real network attempt — this is the second, independent net: it would have caught the Critical hazard even if Guard 1 did not exist', async () => {
    await expect(fetch('https://example.invalid/should-never-be-requested')).rejects.toThrow(
      /unmocked fetch call in a test/,
    )
  })

  it('a test that explicitly stubs fetch overrides the guard for its own body — the established pattern already used throughout this suite (geminiInterpreter.test.ts, interpretation.test.ts) keeps working unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
    const res = await fetch('https://example.invalid/stubbed')
    expect(res.ok).toBe(true)
  })
})
