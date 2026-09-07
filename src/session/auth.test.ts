import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createSupabaseMock } from '../test/supabaseMock'
import { getClient } from './supabase'
import {
  toAppUser, normalisePhone, isValidEmail, maskId, firstName,
  startPhoneOtp, startEmailOtp, verifyPhoneOtp, verifyEmailOtp,
  signInWithGoogle, setDisplayName, signOut, getCurrentUser, onAuthChange,
} from './auth'
import type { AppUser } from './auth'

// `vi.hoisted` guarantees this runs before every import (including the
// `import { getClient } from './supabase'` below, which is what actually
// triggers `@supabase/supabase-js` to be resolved) — a plain top-level
// `const`, even "mock"-prefixed, is NOT hoisted above imports, only above
// other statements, so it is not safe to reference here. `mockCreateClient`
// starts as a bare `vi.fn()` and is pointed at the real shared fake
// (src/test/supabaseMock.ts) just below, once imports have resolved.
const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

const mockClient = createSupabaseMock()
mockCreateClient.mockReturnValue(mockClient)

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateClient.mockReturnValue(mockClient)
})

function makeUser(overrides: Partial<SupabaseUser> = {}): SupabaseUser {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as SupabaseUser
}

// ---------------------------------------------------------------------------
// This MUST be the first describe/it in the file: `getClient()`'s singleton
// (`supabase.ts`'s module-scope `client` variable) is never reset between
// tests, so "createClient was not called yet" is only provable before any
// other test has had a chance to call `getClient()` (directly, or
// indirectly through any `auth.ts` function). Vitest runs tests within one
// file sequentially in declaration order (no `.concurrent` here), so this
// ordering is reliable.
// ---------------------------------------------------------------------------
describe('supabase.ts: lazy singleton client', () => {
  it('creates no client at import time; getClient() creates it once and memoizes it', () => {
    // The module has already been imported (top of this file) by the time
    // this test body runs — if that import alone had constructed a
    // client, this assertion would already be failing.
    expect(mockCreateClient).not.toHaveBeenCalled()

    const a = getClient()
    const b = getClient()

    expect(mockCreateClient).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })
})

describe('normalisePhone', () => {
  it('strips spaces', () => {
    expect(normalisePhone('98765 43210')).toBe('+919876543210')
  })

  it('takes the LAST 10 digits — a leading 91 is not double-counted', () => {
    expect(normalisePhone('+91 98765-43210')).toBe('+919876543210')
  })

  it('fewer than 10 digits -> null', () => {
    expect(normalisePhone('98765')).toBeNull()
  })

  it('empty string -> null', () => {
    expect(normalisePhone('')).toBeNull()
  })
})

describe('isValidEmail', () => {
  it("'a@b.c' -> true", () => {
    expect(isValidEmail('a@b.c')).toBe(true)
  })

  it("'ab.c' -> false (no @)", () => {
    expect(isValidEmail('ab.c')).toBe(false)
  })

  it("'a@bc' -> false (no .)", () => {
    expect(isValidEmail('a@bc')).toBe(false)
  })

  it("'a@b.' -> true — the prototype's own test is this loose; this pins the looseness as intentional, not a bug to fix", () => {
    expect(isValidEmail('a@b.')).toBe(true)
  })
})

describe('toAppUser', () => {
  it('D7: a phone user whose `id` is a UUID still resolves AppUser.id from `phone`, never `id` — masking the UUID would produce a plausible-looking, entirely wrong id', () => {
    const u = makeUser({ id: '8f14e45f-ceea-467a-9b1c-2fa0f0d9c1a3', phone: '919876543210' })
    expect(toAppUser(u)!.id).toBe('919876543210')
  })

  it("method: app_metadata.provider === 'google' wins even when an email is present", () => {
    const u = makeUser({ app_metadata: { provider: 'google' }, email: 'ananya@gmail.com' })
    expect(toAppUser(u)!.method).toBe('google')
  })

  it('method: phone-only -> phone', () => {
    const u = makeUser({ phone: '919876543210' })
    expect(toAppUser(u)!.method).toBe('phone')
  })

  it('method: email-only -> email', () => {
    const u = makeUser({ email: 'ananya@gmail.com' })
    expect(toAppUser(u)!.method).toBe('email')
  })

  it('null in -> null out', () => {
    expect(toAppUser(null)).toBeNull()
  })

  it('D9: display_name present wins over full_name', () => {
    const u = makeUser({ email: 'a@b.c', user_metadata: { display_name: 'Ananya', full_name: 'Ananya Sharma' } })
    expect(toAppUser(u)!.name).toBe('Ananya')
  })

  it('D9: only full_name present -> it is used', () => {
    const u = makeUser({ email: 'a@b.c', user_metadata: { full_name: 'Ananya Sharma' } })
    expect(toAppUser(u)!.name).toBe('Ananya Sharma')
  })

  it('D9: neither present -> null', () => {
    const u = makeUser({ email: 'a@b.c', user_metadata: {} })
    expect(toAppUser(u)!.name).toBeNull()
  })
})

describe('maskId', () => {
  it("phone '+919876543210' -> '+91 •••••• 210'", () => {
    const u: AppUser = { method: 'phone', id: '+919876543210', name: null }
    expect(maskId(u)).toBe('+91 •••••• 210')
  })

  it("email 'shreena@gmail.com' -> 's•••@gmail.com'", () => {
    const u: AppUser = { method: 'email', id: 'shreena@gmail.com', name: null }
    expect(maskId(u)).toBe('s•••@gmail.com')
  })
})

describe('firstName', () => {
  it("'Ananya Sharma' -> 'Ananya'", () => {
    const u: AppUser = { method: 'email', id: 'ananya@gmail.com', name: 'Ananya Sharma' }
    expect(firstName(u)).toBe('Ananya')
  })

  it('name: null -> the masked id', () => {
    const u: AppUser = { method: 'phone', id: '+919876543210', name: null }
    expect(firstName(u)).toBe(maskId(u))
  })
})

describe('startPhoneOtp / startEmailOtp — exact argument shape', () => {
  it('startPhoneOtp calls signInWithOtp with exactly { phone } and nothing else', async () => {
    await startPhoneOtp('+919876543210')
    expect(mockClient.auth.signInWithOtp).toHaveBeenCalledWith({ phone: '+919876543210' })
  })

  it('startEmailOtp calls signInWithOtp with exactly { email } — no emailRedirectTo key', async () => {
    await startEmailOtp('shreena@gmail.com')
    const [args] = mockClient.auth.signInWithOtp.mock.calls.at(-1)!
    expect(args).toEqual({ email: 'shreena@gmail.com' })
    // passing emailRedirectTo makes GoTrue send the link template instead of the code
    expect('emailRedirectTo' in (args.options ?? {})).toBe(false)
  })
})

describe('verifyPhoneOtp / verifyEmailOtp — the type constant', () => {
  it("verifyPhoneOtp passes type: 'sms'", async () => {
    await verifyPhoneOtp('+919876543210', '123456')
    expect(mockClient.auth.verifyOtp).toHaveBeenCalledWith({ phone: '+919876543210', token: '123456', type: 'sms' })
  })

  it("verifyEmailOtp passes type: 'email'", async () => {
    await verifyEmailOtp('shreena@gmail.com', '123456')
    expect(mockClient.auth.verifyOtp).toHaveBeenCalledWith({ email: 'shreena@gmail.com', token: '123456', type: 'email' })
  })
})

describe('signInWithGoogle', () => {
  it("calls signInWithOAuth with provider: 'google' and options.redirectTo === window.location.origin", async () => {
    await signInWithGoogle(window.location.origin)
    expect(mockClient.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  })
})

describe('setDisplayName', () => {
  it("setDisplayName('Ananya') calls updateUser with { data: { display_name: 'Ananya' } }", async () => {
    await setDisplayName('Ananya')
    expect(mockClient.auth.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Ananya' } })
  })
})

describe('every network function fails soft: { ok: false, error } — never a thrown/rejected promise', () => {
  it('startPhoneOtp', async () => {
    expect.assertions(2)
    mockClient.auth.signInWithOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'boom' } })
    await expect(startPhoneOtp('+919876543210')).resolves.toEqual({ ok: false, error: 'boom' })
    expect(mockClient.auth.signInWithOtp).toHaveBeenCalled()
  })

  it('startEmailOtp', async () => {
    expect.assertions(2)
    mockClient.auth.signInWithOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'boom' } })
    await expect(startEmailOtp('shreena@gmail.com')).resolves.toEqual({ ok: false, error: 'boom' })
    expect(mockClient.auth.signInWithOtp).toHaveBeenCalled()
  })

  it('verifyPhoneOtp', async () => {
    expect.assertions(2)
    mockClient.auth.verifyOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'boom' } })
    await expect(verifyPhoneOtp('+919876543210', '123456')).resolves.toEqual({ ok: false, error: 'boom' })
    expect(mockClient.auth.verifyOtp).toHaveBeenCalled()
  })

  it('verifyEmailOtp', async () => {
    expect.assertions(2)
    mockClient.auth.verifyOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'boom' } })
    await expect(verifyEmailOtp('shreena@gmail.com', '123456')).resolves.toEqual({ ok: false, error: 'boom' })
    expect(mockClient.auth.verifyOtp).toHaveBeenCalled()
  })

  it('signInWithGoogle', async () => {
    expect.assertions(2)
    mockClient.auth.signInWithOAuth.mockResolvedValueOnce({ data: { provider: 'google', url: null }, error: { message: 'boom' } })
    await expect(signInWithGoogle(window.location.origin)).resolves.toEqual({ ok: false, error: 'boom' })
    expect(mockClient.auth.signInWithOAuth).toHaveBeenCalled()
  })

  it('setDisplayName', async () => {
    expect.assertions(2)
    mockClient.auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'boom' } })
    await expect(setDisplayName('Ananya')).resolves.toEqual({ ok: false, error: 'boom' })
    expect(mockClient.auth.updateUser).toHaveBeenCalled()
  })

  it('signOut', async () => {
    expect.assertions(2)
    mockClient.auth.signOut.mockResolvedValueOnce({ error: { message: 'boom' } })
    await expect(signOut()).resolves.toEqual({ ok: false, error: 'boom' })
    expect(mockClient.auth.signOut).toHaveBeenCalled()
  })

  it('getCurrentUser', async () => {
    expect.assertions(2)
    mockClient.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'boom' } })
    await expect(getCurrentUser()).resolves.toEqual({ ok: false, error: 'boom' })
    expect(mockClient.auth.getSession).toHaveBeenCalled()
  })
})

describe('onAuthChange', () => {
  it('receives the normalised AppUser for each emitted event, and stops after unsubscribing', () => {
    const seen: (AppUser | null)[] = []
    const unsubscribe = onAuthChange(u => seen.push(u))

    mockClient.emitAuthEvent('SIGNED_IN', { user: makeUser({ email: 'ananya@gmail.com' }) })
    expect(seen).toEqual([{ method: 'email', id: 'ananya@gmail.com', name: null }])

    unsubscribe()
    mockClient.emitAuthEvent('SIGNED_OUT', null)
    // unchanged — the listener was removed, so the SIGNED_OUT emit above
    // must not have reached it.
    expect(seen).toEqual([{ method: 'email', id: 'ananya@gmail.com', name: null }])
  })
})
