import { describe, it, expect, vi, afterEach } from 'vitest'
import { describeItEnabled, interpreterId } from './featureFlags'

// vitest's `unstubEnvs` config defaults to false (see vite.config.ts -- not
// set there, and changing that is out of this task's scope), so
// `vi.stubEnv` calls are not auto-reverted between tests or files. Every
// assertion below stubs its own precondition immediately before checking
// it, so nothing in this file's own run depends on this -- but without an
// explicit revert, the file would finish with VITE_DESCRIBE_IT/
// VITE_INTERPRETER left at their last-stubbed values, leaking into any
// later test file that shares a worker and doesn't stub its own value.
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('describeItEnabled', () => {
  it('is false when VITE_DESCRIBE_IT is unset -- the feature ships OFF; an unset variable must never enable it', () => {
    vi.stubEnv('VITE_DESCRIBE_IT', undefined)
    expect(describeItEnabled()).toBe(false)
  })

  it("is true for exactly 'on'", () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    expect(describeItEnabled()).toBe(true)
  })

  it.each([
    ['true'], ['1'], ['ON'], [' on '], [''], ['off'], ['yes'],
  ])(
    "is false for %j -- 'on' is an allowlist of exactly one value, not a truthy check; every typo must fail closed",
    (value) => {
      vi.stubEnv('VITE_DESCRIBE_IT', value)
      expect(describeItEnabled()).toBe(false)
    },
  )
})

describe('interpreterId', () => {
  it("is 'sim' when VITE_INTERPRETER is unset", () => {
    vi.stubEnv('VITE_INTERPRETER', undefined)
    expect(interpreterId()).toBe('sim')
  })

  it.each([
    ['SIM'], [''], ['openai'],
  ])("is 'sim' for %j -- anything but exactly 'gemini' falls back to 'sim'", (value) => {
    vi.stubEnv('VITE_INTERPRETER', value)
    expect(interpreterId()).toBe('sim')
  })

  it("is 'gemini' for exactly 'gemini'", () => {
    vi.stubEnv('VITE_INTERPRETER', 'gemini')
    expect(interpreterId()).toBe('gemini')
  })
})

// ---------------------------------------------------------------------------
// The lazy-read pin. Mirrors auth.test.ts's "creates no client at import
// time" proof in shape (see src/session/auth.ts's `supabase.ts: lazy
// singleton client` describe block), adapted to this module's own
// mechanism: `featureFlags.ts` has no external dependency to mock the way
// `supabase.ts` has `createClient`, so there is nothing to spy on directly.
// What IS observable is `import.meta.env` itself: under vitest this
// resolves to the real Node `process.env` object (verified empirically --
// `import.meta.env === process.env` from two independently-loaded
// modules), and `process`'s own `env` property descriptor is a plain,
// configurable data property. Temporarily replacing it with an accessor
// lets us count every read of `process.env` (i.e. every `import.meta.env`
// access) from ANY module, including one loaded fresh via dynamic
// `import()` -- which is exactly what's needed to prove "importing
// featureFlags.ts alone touches it zero times; calling one of its
// functions touches it at least once."
//
// Fix verified by temporarily hoisting `import.meta.env.VITE_DESCRIBE_IT`
// to a module-scope `const` in featureFlags.ts: the "at import time"
// assertion below genuinely failed (count was 1, not 0) with that change
// in place, then passed again once reverted -- the same mutation-testing
// discipline auth.test.ts documents for its own version of this proof.
describe('featureFlags.ts: lazy env read (no module-scope import.meta.env access)', () => {
  it('importing the module reads import.meta.env zero times; the first function call reads it at least once', async () => {
    vi.resetModules()
    const realProcessEnv = process.env
    let accessCount = 0
    Object.defineProperty(process, 'env', {
      configurable: true,
      get() {
        accessCount++
        return realProcessEnv
      },
    })

    try {
      const fresh = await import('./featureFlags')
      // Captured immediately after import resolves, before either exported
      // function has been called -- this is the actual proof that
      // importing the module alone never reads import.meta.env.
      expect(accessCount).toBe(0)

      fresh.describeItEnabled()
      expect(accessCount).toBeGreaterThan(0)
    } finally {
      Object.defineProperty(process, 'env', {
        configurable: true,
        writable: true,
        enumerable: true,
        value: realProcessEnv,
      })
    }
  })
})
