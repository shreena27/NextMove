/** SaveOtpScreen — port of the prototype's `renderSaveOtp` (design/
 *  nextmove-v1-prototype.html, lines 3846-3865, tag v1-design-lock-2): the
 *  OTP entry/verify screen, second of the four C7 auth screens (`save-case`
 *  -> `save-otp` -> `save-name` -> `save-done`).
 *
 *  Props are individual, fully-controlled fields, the SAME convention
 *  `SaveCaseScreen.tsx` (Task 11) already established, not a raw `state:
 *  SessionState` — this screen touches exactly `authMethod`/`authId`/`otp`/
 *  `authErr`/`authBusy`/`otpResent`/`otpCooldownUntil`, plus the D6 clock
 *  (`now`); threading the whole state object would let it read fields (e.g.
 *  `savedCases`) that mean nothing to it. `topbar`/`dispatch` mirror every
 *  other C7 template: `topbar` is rendered first, matching the prototype's
 *  own `topbar(true,false)` (3848); `dispatch` is optional for the same
 *  reason it is everywhere else in this codebase (a screen with no wired
 *  caller still mounts and renders).
 *
 *  DESIGN NOTE 1 (D12's destination fix — task brief design note 1). The
 *  prototype's `const dest = S.authMethod==='phone' ? ('+91 ' + S.authId) :
 *  S.authId` (3847) only works because ITS `authId` is bare ten digits.
 *  Task 3's `normalisePhone` stores E.164 WITH the `+`
 *  (`'+919876543210'`) — signInWithOtp requires it — so transcribing 3847
 *  literally would render `+91 +919876543210`, a two-character bug hiding
 *  in a faithful-looking line. The port strips the already-present `+91`
 *  prefix before re-adding the display space: `'+91 ' + authId.slice(3)`
 *  for phone, the raw address for email — reproducing the prototype's
 *  exact rendered string (`+91 9876543210`) from the new stored shape. Do
 *  not "simplify" this back to a bare concatenation.
 *
 *  `UI.saveOtp.lede` is registered as ONE template string with `{dest}`
 *  embedded mid-sentence (Task 10), and the prototype wraps only `dest` in
 *  `<b>` (3853) — so this renders it split around the placeholder
 *  (`lede.split('{dest}')`) rather than a plain `.replace()`, which would
 *  lose the bold styling. `container.textContent` is unaffected either way
 *  (DOM text content ignores the `<b>` tag), so this still satisfies the
 *  copy-coverage sweep's own `.replace('{dest}', ...)` check.
 *
 *  DESIGN NOTE 2 (the 6-digit check is the prototype's own, 2120-2121).
 *  Strip non-digits, require exactly 6, else the registered
 *  `UI.saveOtp.errors.code` string. Transcribed, not reimplemented.
 *
 *  DESIGN NOTE 3 (verify's success path — task brief design note 3). Calls
 *  `verifyPhoneOtp`/`verifyEmailOtp` per `authMethod`, then on success:
 *  `SIGNED_IN`, `SET_PENDING_NAME` (cleared, ''), then `NAVIGATE` to
 *  `'save-name'` — matching the prototype's own `S.pendingName='';
 *  nav('save-name');` (2126-2127; Fix Round 1, Finding 2: a name draft
 *  typed on save-name, abandoned via Back to save-otp, must not survive a
 *  re-verify). Deliberately does NOT call
 *  `runSignInMigration` (session/caseSync.ts) from this screen — Task 8's
 *  App.tsx is the single entry point for that (its `onAuthChange`
 *  subscription + migration-runner effect), and `verifyOtp` succeeding also
 *  emits `SIGNED_IN` on that channel; a direct call here would be a THIRD
 *  trigger racing the other two. The reducer's `MIGRATION_STARTED` guard
 *  (session.ts) makes whichever arrives second a no-op either way — this
 *  screen's own job is just to dispatch `SIGNED_IN` and trust that
 *  machinery, exactly the way the prototype's own comment describes:
 *  "Signing in adopts whatever cases the account already has in storage,
 *  BEFORE any save completes — so a save started while signed out can never
 *  clobber the stored set." (2115-2117). `SIGNED_IN`'s own reducer arm
 *  already clears `authBusy` (session.ts) — no extra dispatch needed on
 *  this path, unlike SaveCaseScreen's own Fix Round 1 (that fix was for a
 *  SUCCESS path with no SIGNED_IN-shaped arm to lean on; this one has one).
 *  The `!result.user` branch below is defensive only (GoTrue's verifyOtp
 *  always returns a user on `ok:true` in practice — `auth.test.ts`'s own
 *  contract — but the type is `AppUser | null`): treated as a failure, not
 *  silently dropped, so `authBusy` can never get stuck `true` here either
 *  (the exact bug class Task 11's own Fix Round 1 found and fixed).
 *
 *  DESIGN NOTE 4 (D2's cooldown — task brief design notes 5-7). Two
 *  independent timers:
 *   - The 2000ms `otpResent` flash (prototype 2145, `authResend`) — a
 *     `useRef`-tracked `setTimeout`, cleared on unmount, the SAME shape
 *     `PrepareScreen.tsx`'s own copy-flash timer already uses (design note
 *     2c there) — never session state, always local, always cleaned up.
 *   - The cooldown COUNTDOWN DISPLAY — a genuinely LIVE UI ticker, unlike
 *     every other `now`-bearing value in this codebase (D6: an injected
 *     clock stamps a single discrete EVENT). A static `now` prop cannot
 *     serve a countdown that must keep moving on its own while the citizen
 *     sits on the screen, so the remaining-time MATH reads `Date.now()`
 *     directly at render time; a `setInterval` (ref-tracked, cleared on
 *     unmount AND once the deadline passes) exists ONLY to force a
 *     re-render every second so that live math is re-evaluated. This is a
 *     different class of exception from `App.tsx`'s own single `Date.now()`
 *     call site (D6's "stamp an event" case) — a countdown timer's whole
 *     job is to keep reading the clock.
 *   `resendDisabled = inCooldown || authBusy`: the resend network call
 *  itself (`startPhoneOtp`/`startEmailOtp`) is awaited exactly like
 *  SaveCaseScreen's send/Google buttons, with the SAME belt-and-braces
 *  in-handler `authBusy` guard (Enter never applies here — this is a plain
 *  `<button>`, whose native `disabled` attribute already blocks pointer AND
 *  keyboard activation — kept anyway for symmetry with SaveCaseScreen's own
 *  `handleGoogle`).
 *
 *  `AUTH_ID_SUBMITTED` (session.ts, Task 12) now also arms
 *  `otpCooldownUntil` on the INITIAL send (design note 6: GoTrue's
 *  `max_frequency` clock starts there, not at the first resend) — so this
 *  screen may render already `disabled` on arrival, with no resend tapped
 *  yet. A rate-limited resend (design note 7) surfaces GoTrue's own
 *  returned error rather than a fabricated one, and still arms the local
 *  cooldown — otherwise the citizen taps into the same rejection
 *  repeatedly.
 *
 *  D1: no demo hint anywhere (prototype 3862's "Design prototype: any 6
 *  digits work here." is prototype-only scaffold, never ported). */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SessionAction, SessionState } from '../session/session'
import { verifyPhoneOtp, verifyEmailOtp, startPhoneOtp, startEmailOtp, OTP_RESEND_COOLDOWN_MS } from '../session/auth'
import { Split } from '../ui/Split'
import { Crumbs } from '../ui/Crumbs'
import { Button } from '../ui/Button'
import { UI } from '../screens/screenCopy'

const OTP_INPUT_ID = 'save-otp-code'
/** Prototype 2145's own timing — transcribed, not invented. */
const RESENT_FLASH_MS = 2000

export interface SaveOtpScreenProps {
  authMethod: SessionState['authMethod']
  authId: SessionState['authId']
  otp: SessionState['otp']
  authErr: SessionState['authErr']
  authBusy: SessionState['authBusy']
  otpResent: SessionState['otpResent']
  otpCooldownUntil: SessionState['otpCooldownUntil']
  /** D6: the clock for the resend's own `SET_OTP_COOLDOWN` dispatch — never
   *  an internal `Date.now()` call inside an event handler here, matching
   *  `SaveCaseScreen`'s own `now` prop (Task 12). The LIVE countdown
   *  display is a deliberate, separate exception — see design note 4. */
  now: number
  /** Rendered first, matching the prototype's own `topbar(true,false)` at
   *  the top of `renderSaveOtp`, line 3848. */
  topbar?: ReactNode
  dispatch?: (action: SessionAction) => void
}

export function SaveOtpScreen({
  authMethod, authId, otp, authErr, authBusy, otpResent, otpCooldownUntil, now, topbar, dispatch,
}: SaveOtpScreenProps) {
  const isPhone = authMethod === 'phone'
  // Design note 1 (D12): strip the already-present '+91' before re-adding
  // the display space — do NOT transcribe prototype 3847's bare
  // concatenation, which would double the prefix against this codebase's
  // E.164-with-'+' stored shape.
  const dest = isPhone ? '+91 ' + authId.slice(3) : authId
  const [ledeBefore, ledeAfter] = UI.saveOtp.lede.split('{dest}')

  // Forces a re-render every second while the cooldown is live — the
  // remaining-time MATH below always reads the live clock; this state only
  // exists to make React re-evaluate that math on a schedule (design note 4).
  const [, forceTick] = useState(0)
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => {
    if (otpCooldownUntil === null) return
    cooldownInterval.current = setInterval(() => {
      if (Date.now() >= otpCooldownUntil && cooldownInterval.current !== undefined) {
        clearInterval(cooldownInterval.current)
      }
      forceTick(t => t + 1)
    }, 1000)
    return () => {
      if (cooldownInterval.current !== undefined) clearInterval(cooldownInterval.current)
    }
  }, [otpCooldownUntil])

  // The 2000ms "Code sent again ✓" flash (prototype 2145) — a separate
  // timer from the cooldown above, ref-tracked and cleared on unmount, the
  // same shape PrepareScreen.tsx's own copy-flash timer uses.
  const resentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    return () => {
      if (resentTimer.current !== undefined) clearTimeout(resentTimer.current)
    }
  }, [])

  // Deliberate, and a DIFFERENT class of exception from App.tsx's own single
  // `Date.now()` call site (D6's "stamp one discrete event" case, disabled
  // there for the same rule): this is a genuinely LIVE countdown display,
  // whose whole job is to keep re-reading the clock — see design note 4.
  // oxlint-disable-next-line react/purity -- deliberate: a live countdown must re-read the clock; see design note 4
  const remainingMs = otpCooldownUntil !== null ? otpCooldownUntil - Date.now() : 0
  const inCooldown = otpCooldownUntil !== null && remainingMs > 0
  const resendDisabled = inCooldown || authBusy
  // `otpResent` wins over the cooldown label, not the other way round: a
  // successful resend dispatches BOTH `SET_OTP_RESENT: true` and
  // `SET_OTP_COOLDOWN` in the same handler (design note 4), so by the time
  // this renders the cooldown is already active too — checking cooldown
  // first would mean the "Code sent again ✓" confirmation NEVER shows at
  // all, since the very next render already has `inCooldown` true. The
  // control stays `disabled` either way (`resendDisabled` above does not
  // depend on this ordering); only which LABEL wins during the 2000ms
  // overlap is decided here.
  const resendLabel = otpResent
    ? UI.saveOtp.resendSent
    : inCooldown
      ? (Math.ceil(remainingMs / 1000) === 1
          ? UI.saveOtp.resendWaitOne
          : UI.saveOtp.resendWaitMany.replace('{n}', String(Math.ceil(remainingMs / 1000))))
      : UI.saveOtp.resendPrompt

  const handleVerify = async () => {
    // Second guard beyond the button's own `disabled` — see SaveCaseScreen
    // design note 3; Enter-to-submit goes through the input's own
    // `onKeyDown`, which the button's `disabled` attribute never touches.
    if (authBusy) return
    const code = otp.replace(/[^0-9]/g, '')
    if (code.length !== 6) {
      dispatch?.({ type: 'SET_AUTH_ERR', error: UI.saveOtp.errors.code })
      return
    }
    dispatch?.({ type: 'SET_AUTH_BUSY', value: true })
    const result = isPhone ? await verifyPhoneOtp(authId, code) : await verifyEmailOtp(authId, code)
    if (!result.ok) {
      dispatch?.({ type: 'SET_AUTH_ERR', error: result.error })
      dispatch?.({ type: 'SET_AUTH_BUSY', value: false })
      return
    }
    if (!result.user) {
      // Defensive/unreachable in practice — see design note 3's own comment
      // above. Treated as a failure so authBusy can never get stuck true.
      dispatch?.({ type: 'SET_AUTH_ERR', error: UI.saveOtp.errors.code })
      dispatch?.({ type: 'SET_AUTH_BUSY', value: false })
      return
    }
    // SIGNED_IN's own reducer arm clears authBusy/otp/authErr — no extra
    // clear dispatched here (design note 3).
    dispatch?.({ type: 'SIGNED_IN', user: result.user })
    // Fix Round 1, Finding 2: design note 3 is explicit — "navigate to
    // 'save-name' WITH pendingName cleared", matching the prototype's own
    // `S.pendingName=''; nav('save-name');` (2126-2127). Neither SIGNED_IN
    // nor NAVIGATE touches `pendingName` (only SET_PENDING_NAME does, per
    // Task 4's reducer) — without this, a name draft typed on save-name,
    // abandoned via Back to save-otp, would survive a re-verify.
    dispatch?.({ type: 'SET_PENDING_NAME', value: '' })
    dispatch?.({ type: 'NAVIGATE', screen: 'save-name' })
  }

  const handleResend = async () => {
    if (authBusy) return
    dispatch?.({ type: 'SET_AUTH_BUSY', value: true })
    const result = isPhone ? await startPhoneOtp(authId) : await startEmailOtp(authId)
    if (!result.ok) {
      // Design note 7: GoTrue's own returned error, not a fabricated one —
      // and the cooldown is armed regardless, or the citizen taps into the
      // same rejection repeatedly.
      dispatch?.({ type: 'SET_AUTH_ERR', error: result.error })
      dispatch?.({ type: 'SET_AUTH_BUSY', value: false })
      dispatch?.({ type: 'SET_OTP_COOLDOWN', until: now + OTP_RESEND_COOLDOWN_MS })
      return
    }
    dispatch?.({ type: 'SET_AUTH_BUSY', value: false })
    dispatch?.({ type: 'SET_OTP_RESENT', value: true })
    dispatch?.({ type: 'SET_OTP_COOLDOWN', until: now + OTP_RESEND_COOLDOWN_MS })
    if (resentTimer.current !== undefined) clearTimeout(resentTimer.current)
    resentTimer.current = setTimeout(() => dispatch?.({ type: 'SET_OTP_RESENT', value: false }), RESENT_FLASH_MS)
  }

  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              <Crumbs parts={[UI.saveCase.crumb, UI.saveOtp.crumbTail]} sqClass="sq-butter" />
              <h1 className="headline">{UI.saveOtp.headline}</h1>
              <p className="lede">
                {ledeBefore}
                <b>{dest}</b>
                {ledeAfter}
              </p>
            </>
          }
          right={
            <>
              <div className="auth-field">
                <label className="auth-label" htmlFor={OTP_INPUT_ID}>
                  {UI.saveOtp.fieldLabel}
                </label>
                <input
                  id={OTP_INPUT_ID}
                  className="auth-input otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={UI.saveOtp.placeholder}
                  value={otp}
                  onChange={e => dispatch?.({ type: 'SET_OTP', value: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleVerify()
                  }}
                />
                {authErr ? (
                  <div className="auth-err" role="alert">
                    {authErr}
                  </div>
                ) : null}
              </div>
              <Button block arrow style={{ marginTop: 0 }} onClick={() => void handleVerify()} disabled={authBusy}>
                {UI.saveOtp.verify}
              </Button>
              <button className="auth-switch" onClick={() => void handleResend()} disabled={resendDisabled}>
                {resendLabel}
              </button>
            </>
          }
        />
      </div>
    </>
  )
}
