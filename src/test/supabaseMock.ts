// The ONE shared fake Supabase client used by every test that needs to
// drive Supabase without a real network call: session/auth.test.ts (Task
// 3) and every later chunk that touches auth or casefile sync (Tasks 7, 8,
// 11, 12, 13, 16, 17). Eight hand-rolled fakes would disagree about the
// client's shape within a week, and the disagreement would hide a real
// bug — this is the single source of truth for what "the Supabase client"
// looks like in a test.
//
// Every method is a plain `vi.fn()`, already given a default SUCCESS
// response, so a test that only cares what arguments a call was made with
// needs no setup at all. A test that DOES care about a specific result or
// a failure overrides that ONE call with `.mockResolvedValueOnce(...)` /
// `.mockRejectedValueOnce(...)` — use the `Once` variants, not a bare
// `.mockResolvedValue(...)`, since this fake is one long-lived object
// shared across every test in a file: a non-`Once` override changes the
// PERSISTENT default and leaks into every later test.
import { vi } from 'vitest'

type AuthChangeCallback = (event: string, session: unknown) => void

export interface SupabaseMock {
  auth: {
    signInWithOtp: ReturnType<typeof vi.fn>
    verifyOtp: ReturnType<typeof vi.fn>
    signInWithOAuth: ReturnType<typeof vi.fn>
    updateUser: ReturnType<typeof vi.fn>
    signOut: ReturnType<typeof vi.fn>
    getSession: ReturnType<typeof vi.fn>
    onAuthStateChange: ReturnType<typeof vi.fn>
  }
  from: ReturnType<typeof vi.fn>
  /** Fires `event`/`session` at every listener currently subscribed via
   *  `auth.onAuthStateChange` — this is what Task 8's INITIAL_SESSION-vs-
   *  SIGNED_IN test needs: register a listener, then emit each event in
   *  turn and assert on what the listener saw. */
  emitAuthEvent: (event: string, session: unknown) => void
  /** Removes every listener registered via `auth.onAuthStateChange`,
   *  regardless of whether each one's own `unsubscribe()` was ever called.
   *  The listener set lives in this closure, which `vi.clearAllMocks()` /
   *  `vi.resetAllMocks()` do NOT touch (it's plain state, not a mock's own
   *  call/implementation record) — so a test that registers a listener and
   *  forgets to unsubscribe it would otherwise leak that listener into
   *  every later test sharing this same `mockClient` instance within a
   *  file. Call this from a `beforeEach`/`afterEach` in any test file that
   *  exercises `onAuthChange` more than once, as cheap insurance. */
  clearAuthListeners: () => void
}

export function createSupabaseMock(): SupabaseMock {
  const listeners = new Set<AuthChangeCallback>()

  // Returns a REAL unsubscribe handle: calling it actually removes this
  // listener from the set emitAuthEvent iterates, matching the real
  // client's own contract rather than a no-op stand-in.
  const onAuthStateChange = vi.fn((cb: AuthChangeCallback) => {
    listeners.add(cb)
    return {
      data: {
        subscription: {
          id: 'mock-subscription',
          callback: cb,
          unsubscribe: vi.fn(() => {
            listeners.delete(cb)
          }),
        },
      },
    }
  })

  const select = vi.fn().mockResolvedValue({ data: [], error: null })
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const del = vi.fn().mockResolvedValue({ data: null, error: null })
  const from = vi.fn(() => ({ select, upsert, delete: del }))

  return {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signInWithOAuth: vi
        .fn()
        .mockResolvedValue({ data: { provider: 'google', url: 'https://example.test/auth' }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange,
    },
    from,
    emitAuthEvent: (event, session) => {
      for (const cb of listeners) cb(event, session)
    },
    clearAuthListeners: () => {
      listeners.clear()
    },
  }
}
