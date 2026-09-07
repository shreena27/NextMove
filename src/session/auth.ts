// The auth surface: OTP/OAuth calls and user-shape normalisation. This is
// the ONLY file in this codebase that calls a Supabase `auth.*` method
// directly — every screen goes through the functions exported here, never
// through `getClient().auth` itself.
// TRANSCRIBED, not authored (the shape-only pieces): design/nextmove-v1-
// prototype.html (git tag v1-design-lock-2) — S.user (2122, 2140),
// authSubmitId's phone branch (2106-2109) and email check (2111), maskId
// (2146-2151), firstName (2245). Everything that actually talks to
// Supabase (startPhoneOtp .. onAuthChange) is new: the prototype only ever
// faked auth by writing straight to `S.user`.
//
// Every network function below returns a discriminated result
// (`{ ok: true, ... } | { ok: false, error: string }`) rather than
// throwing — the screens render an error string, and a rejected promise
// crossing a React event handler is an unhandled rejection nobody sees.
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { getClient } from './supabase'

/** The prototype's own `S.user` shape (2122, 2140), kept verbatim so every
 *  downstream consumer transcribes rather than adapts. */
export type AppUser = { method: 'phone' | 'email' | 'google'; id: string; name: string | null }

/** Deviations D7 and D12 both live here and only here.
 *
 *  D7 — `id` is `u.phone` or `u.email`, NEVER `u.id` (a UUID). `maskId`
 *  hardcodes the `+91 ` prefix and reads only `id.slice(-3)`, so masking
 *  the UUID by mistake would produce a plausible-looking, entirely wrong
 *  id — and go unnoticed until something else read `id`.
 *
 *  D12 — `u.phone` comes back from GoTrue WITHOUT the leading `+`,
 *  verified against the running local stack (it stores `+919876543210` as
 *  `919876543210`). It therefore does NOT match `state.authId`'s E.164
 *  form; the two must never be compared or interchanged. */
export function toAppUser(u: SupabaseUser | null): AppUser | null {
  if (!u) return null
  const method: AppUser['method'] =
    u.app_metadata?.provider === 'google' ? 'google' : u.phone ? 'phone' : 'email'
  const id = u.phone || u.email || ''
  // D9 read order.
  const name: string | null =
    (u.user_metadata?.display_name as string | undefined) ??
    (u.user_metadata?.full_name as string | undefined) ??
    null
  return { method, id, name }
}

/** The prototype's `authSubmitId` phone branch (2106-2109): strip every
 *  non-digit; fewer than 10 digits -> `null` (the caller renders the
 *  locked error string); otherwise take the LAST 10 digits and return
 *  `'+91' + digits` — the `+91` default matches the destination display
 *  the locked `renderSaveOtp` already shows (3847). */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.length < 10) return null
  return '+91' + digits.slice(-10)
}

/** The prototype's own test (2111), transcribed exactly: contains `'@'`
 *  AND contains `'.'`. Deliberately loose — do not "improve" it into a
 *  regex, and do not add one. GoTrue is the real validator. */
export function isValidEmail(raw: string): boolean {
  return raw.includes('@') && raw.includes('.')
}

/** Transcribed from 2146-2151, operating on `AppUser.id`. */
export function maskId(u: AppUser): string {
  if (u.method === 'phone') return '+91 •••••• ' + u.id.slice(-3)
  const [name, domain] = u.id.split('@')
  return name.charAt(0) + '•••@' + (domain || '')
}

/** Transcribed from 2245. */
export function firstName(u: AppUser): string {
  return u.name ? u.name.split(' ')[0] : maskId(u)
}

export type AuthResult = { ok: true } | { ok: false; error: string }
export type AuthUserResult = { ok: true; user: AppUser | null } | { ok: false; error: string }

/** Every exported network function below runs through this: it converts
 *  BOTH failure channels a Supabase call can produce into the same
 *  `{ ok: false, error }` shape — a resolved `{ error }` (handled inline
 *  in each function already) AND a genuinely thrown/rejected promise
 *  (handled here). The second case is real, not hypothetical:
 *  `@supabase/auth-js`'s own internals re-throw anything that isn't
 *  itself an `AuthError` (a blocked/throwing storage adapter, a
 *  lock-acquisition failure, ...), so without this wrapper such a
 *  rejection propagates straight out of e.g. `startPhoneOtp` and becomes
 *  an unhandled rejection the moment it crosses a React event handler —
 *  exactly what the discriminated-result design exists to prevent. One
 *  shared wrapper here instead of nine near-identical try/catches. */
async function guardResult<R extends AuthResult | AuthUserResult>(fn: () => Promise<R>): Promise<R> {
  try {
    return await fn()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) } as R
  }
}

export async function startPhoneOtp(e164: string): Promise<AuthResult> {
  return guardResult(async () => {
    const { error } = await getClient().auth.signInWithOtp({ phone: e164 })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })
}

/** No `emailRedirectTo` — passing one makes GoTrue send the link template
 *  instead of the code. */
export async function startEmailOtp(email: string): Promise<AuthResult> {
  return guardResult(async () => {
    const { error } = await getClient().auth.signInWithOtp({ email })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })
}

export async function verifyPhoneOtp(e164: string, token: string): Promise<AuthUserResult> {
  return guardResult(async () => {
    const { data, error } = await getClient().auth.verifyOtp({ phone: e164, token, type: 'sms' })
    if (error) return { ok: false, error: error.message }
    return { ok: true, user: toAppUser(data.user) }
  })
}

export async function verifyEmailOtp(email: string, token: string): Promise<AuthUserResult> {
  return guardResult(async () => {
    const { data, error } = await getClient().auth.verifyOtp({ email, token, type: 'email' })
    if (error) return { ok: false, error: error.message }
    return { ok: true, user: toAppUser(data.user) }
  })
}

/** `redirectTo` is `window.location.origin` at the call site: this is a
 *  single-route SPA with no router and no file under `src/` that reads
 *  `window.location`, so the app is served at one origin and returns to
 *  it — no new `/auth/callback` route is invented here. */
export async function signInWithGoogle(redirectTo: string): Promise<AuthResult> {
  return guardResult(async () => {
    const { error } = await getClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })
}

export async function setDisplayName(name: string): Promise<AuthResult> {
  return guardResult(async () => {
    const { error } = await getClient().auth.updateUser({ data: { display_name: name } })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })
}

export async function signOut(): Promise<AuthResult> {
  return guardResult(async () => {
    const { error } = await getClient().auth.signOut()
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })
}

export async function getCurrentUser(): Promise<AuthUserResult> {
  return guardResult(async () => {
    const { data, error } = await getClient().auth.getSession()
    if (error) return { ok: false, error: error.message }
    return { ok: true, user: toAppUser(data.session?.user ?? null) }
  })
}

/** Subscribes to auth-state changes; returns an unsubscribe function.
 *  `onAuthStateChange` itself never reports an `error` (see supabase-js's
 *  own return type — `{ data: { subscription } }`, no `error` field), so
 *  this is the one function on this surface that is not a discriminated
 *  result.
 *
 *  `event` is passed through VERBATIM (GoTrue's own event name — e.g.
 *  `'SIGNED_IN'`, `'INITIAL_SESSION'`, `'SIGNED_OUT'`, `'USER_UPDATED'`,
 *  `'TOKEN_REFRESHED'`) rather than swallowed. Task 8's App.tsx dispatches
 *  differently per named event (design note 5) — `SIGNED_IN` starts the
 *  sign-in migration, `INITIAL_SESSION` is deliberately ignored (the mount
 *  effect already covers that case), `TOKEN_REFRESHED` must not re-run
 *  either — and none of that is distinguishable from `user` alone, since
 *  several of these events carry the identical session. (Flagged forward by
 *  Task 3's own review as work Task 8 would need; done here rather than
 *  pre-empted there, per that review's own note.) */
export function onAuthChange(cb: (event: string, user: AppUser | null) => void): () => void {
  const { data } = getClient().auth.onAuthStateChange((event, session) => {
    cb(event, toAppUser(session?.user ?? null))
  })
  return () => { data.subscription.unsubscribe() }
}
