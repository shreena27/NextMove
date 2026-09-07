// RED for Task 12 — SaveOtpScreen, the port of `renderSaveOtp` (design/
// nextmove-v1-prototype.html, 3846-3865, tag v1-design-lock-2): the OTP
// entry/verify screen, second of the sign-in flow, plus D2's resend
// cooldown.
//
// `verifyPhoneOtp`/`verifyEmailOtp`/`startPhoneOtp`/`startEmailOtp`/
// `onAuthChange` (session/auth.ts) and `runSignInMigration`
// (session/caseSync.ts) are mocked — this screen's own job is only to CALL
// the auth.ts wrapper (auth.test.ts already covers the real Supabase-facing
// behaviour); `onAuthChange`/`runSignInMigration` are mocked so the
// migration-guard test below (design note 3) can assemble a small harness
// that mirrors the RELEVANT slice of App.tsx's own auth-lifecycle machinery
// (Task 8) without pulling in App.tsx itself, which does not yet route to
// this screen (routing is a later task).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useReducer } from 'react'
import { SaveOtpScreen } from './SaveOtpScreen'
import { UI } from '../screens/screenCopy'
import { sessionReducer, initialSession, type SessionAction } from '../session/session'
import * as authModule from '../session/auth'
import { OTP_RESEND_COOLDOWN_MS, type AppUser } from '../session/auth'
import * as caseSyncModule from '../session/caseSync'
import type { Casefile } from '../domain/casefile'

vi.mock('../session/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('../session/auth')>()
  return {
    ...actual,
    verifyPhoneOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    startPhoneOtp: vi.fn(),
    startEmailOtp: vi.fn(),
    onAuthChange: vi.fn(),
  }
})
vi.mock('../session/caseSync', async importOriginal => {
  const actual = await importOriginal<typeof import('../session/caseSync')>()
  return { ...actual, runSignInMigration: vi.fn() }
})

const verifyPhoneOtp = vi.mocked(authModule.verifyPhoneOtp)
const verifyEmailOtp = vi.mocked(authModule.verifyEmailOtp)
const startPhoneOtp = vi.mocked(authModule.startPhoneOtp)
const startEmailOtp = vi.mocked(authModule.startEmailOtp)
const onAuthChange = vi.mocked(authModule.onAuthChange)
const runSignInMigration = vi.mocked(caseSyncModule.runSignInMigration)

// Same fixture timestamp SaveCaseScreen.test.tsx / session.test.ts already
// use — a single shared "now" across the C7 auth test files.
const NOW = 1_726_000_000_000

beforeEach(() => {
  vi.clearAllMocks()
  startPhoneOtp.mockResolvedValue({ ok: true })
  startEmailOtp.mockResolvedValue({ ok: true })
})

afterEach(() => {
  // Safety net for the fake-timer tests below — a no-op when real timers
  // are already active.
  vi.useRealTimers()
})

function makeCasefile(overrides: Partial<Casefile> = {}): Casefile {
  return {
    engineKey: 'passport',
    serviceLabel: 'Passport',
    returnScreen: 'passport-nextmove',
    answers: { q1: 'adverse', q2: 'informal' },
    prepChecks: { 0: true },
    savedAt: 1_700_000_000_000,
    stateLabel: 'Followed up informally, unresolved',
    rec: 'FOLLOW_UP',
    whatShort: 'Move to a formal Grievance / CPGRAMS filing',
    stepsTotal: 5,
    stepsDone: 1,
    sirPhaseId: null,
    id: 'c1700000000000',
    outcome: 'still_open',
    lastCheck: null,
    remindAt: null,
    log: [{ t: 1_700_000_000_000, kind: 'diagnosed', text: 'Followed up informally, unresolved' }],
    ...overrides,
  }
}

const verifyBtn = () => screen.getByRole('button', { name: new RegExp(UI.saveOtp.verify) })
// Queried by class, not accessible name: the resend control's label changes
// across every state this file tests (resendPrompt/resendSent/
// resendWaitOne/resendWaitMany-with-N) — a name-based query would be
// brittle against exactly the thing under test.
const resendBtn = () => document.querySelector('.auth-switch') as HTMLButtonElement

describe('SaveOtpScreen (port of renderSaveOtp, prototype 3846-3865)', () => {
  it('renders the crumb tail, headline, field label + placeholder, the verify button and the resend prompt — all from UI.saveOtp', () => {
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={vi.fn()}
      />,
    )
    expect(document.querySelector('.crumbs')).toHaveTextContent(UI.saveCase.crumb)
    expect(document.querySelector('.crumbs')).toHaveTextContent(UI.saveOtp.crumbTail)
    expect(document.querySelector('.crumb-sq')).toHaveClass('sq-butter')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(UI.saveOtp.headline)
    const input = screen.getByLabelText(UI.saveOtp.fieldLabel)
    expect(input).toHaveAttribute('placeholder', UI.saveOtp.placeholder)
    expect(input).toHaveAttribute('maxlength', '6')
    expect(verifyBtn()).toBeInTheDocument()
    expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendPrompt)
  })

  it(
    "D12: renders the phone destination as EXACTLY '+91 9876543210' from a stored authId of '+919876543210' — " +
    'a literal transcription of prototype 3847 (which assumes a bare 10-digit authId) would instead double the ' +
    "prefix into '+91 +919876543210', since this codebase's authId already carries the '+91' in E.164 form",
    () => {
      render(
        <SaveOtpScreen
          authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
          otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={vi.fn()}
        />,
      )
      const text = document.querySelector('.lede')!.textContent!
      expect(text).toBe(UI.saveOtp.lede.replace('{dest}', '+91 9876543210'))
      expect(text.match(/\+91/g), 'D12: exactly one +91 — a double prefix is the exact bug design note 1 names').toHaveLength(1)
      expect(text).not.toContain('+91 +91')
    },
  )

  it('renders the raw email address for the email method', () => {
    render(
      <SaveOtpScreen
        authMethod="email" authId="citizen@example.com" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={vi.fn()}
      />,
    )
    expect(document.querySelector('.lede')).toHaveTextContent(
      UI.saveOtp.lede.replace('{dest}', 'citizen@example.com'),
    )
  })

  it("D1: the prototype's demo hint never renders", () => {
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={vi.fn()}
      />,
    )
    expect(screen.queryByText('Design prototype: any 6 digits work here.')).toBeNull()
  })

  it('the error node has role="alert"; the field label is associated with the input', () => {
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={UI.saveOtp.errors.code} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(UI.saveOtp.errors.code)
    expect(screen.getByLabelText(UI.saveOtp.fieldLabel)).toBeInTheDocument()
  })

  it("otpResent renders 'Code sent again ✓' with no interaction needed (a controlled prop)", () => {
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent otpCooldownUntil={null} now={NOW} dispatch={vi.fn()}
      />,
    )
    expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendSent)
  })

  it(
    "otpResent wins over an active cooldown label — a successful resend arms BOTH in the same handler, so " +
    "checking cooldown first would mean 'Code sent again ✓' never shows at all",
    () => {
      // Fake timers so `otpCooldownUntil` (a fixed fixture timestamp) is
      // genuinely still in the future relative to `Date.now()` — otherwise
      // the real wall clock (long past NOW) would make `inCooldown` false
      // regardless of this test's own point.
      vi.useFakeTimers()
      vi.setSystemTime(NOW)
      render(
        <SaveOtpScreen
          authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
          otpResent otpCooldownUntil={NOW + OTP_RESEND_COOLDOWN_MS} now={NOW} dispatch={vi.fn()}
        />,
      )
      expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendSent)
      expect(resendBtn()).toBeDisabled() // still disabled — the cooldown is genuinely active either way
    },
  )

  it('a 5-digit code dispatches the code-length error and does not call verify', async () => {
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="12345" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    await userEvent.click(verifyBtn())
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_ERR', error: UI.saveOtp.errors.code })
    expect(verifyPhoneOtp).not.toHaveBeenCalled()
  })

  it('a non-numeric-padded 6-character value that strips to fewer than 6 digits still errors, matching the prototype\'s strip-then-count check', async () => {
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="12-345" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    await userEvent.click(verifyBtn())
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_ERR', error: UI.saveOtp.errors.code })
    expect(verifyPhoneOtp).not.toHaveBeenCalled()
  })

  it('a rejected code surfaces the error, does not dispatch SIGNED_IN, and clears authBusy', async () => {
    expect.assertions(3)
    verifyPhoneOtp.mockResolvedValueOnce({ ok: false, error: 'invalid code' })
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="123456" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    await userEvent.click(verifyBtn())
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_ERR', error: 'invalid code' })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SIGNED_IN' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_BUSY', value: false })
  })

  it('a valid code for the email method calls verifyEmailOtp, dispatches SIGNED_IN, and navigates to save-name', async () => {
    const user: AppUser = { method: 'email', id: 'citizen@example.com', name: null }
    verifyEmailOtp.mockResolvedValueOnce({ ok: true, user })
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="email" authId="citizen@example.com" otp="123456" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    await userEvent.click(verifyBtn())
    expect(verifyEmailOtp).toHaveBeenCalledWith('citizen@example.com', '123456')
    expect(verifyPhoneOtp).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'SIGNED_IN', user })
    expect(dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'save-name' })
  })

  it('Enter in the OTP field does the same as clicking verify', async () => {
    verifyPhoneOtp.mockResolvedValueOnce({ ok: true, user: { method: 'phone', id: '+919876543210', name: null } })
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="123456" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText(UI.saveOtp.fieldLabel), { key: 'Enter' })
    await waitFor(() => expect(verifyPhoneOtp).toHaveBeenCalledWith('+919876543210', '123456'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'save-name' })
  })

  it('a non-Enter key in the field does not submit', () => {
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="123456" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText(UI.saveOtp.fieldLabel), { key: 'a' })
    expect(verifyPhoneOtp).not.toHaveBeenCalled()
  })

  it(
    'Enter while authBusy is true does not submit — the in-handler guard, not just the disabled attribute on ' +
    'the button (the exact bug class Task 11\'s Fix Round 1 found and fixed there: only an Enter-based test ' +
    'exercises this, a click-based one never would)',
    () => {
      const dispatch = vi.fn()
      render(
        <SaveOtpScreen
          authMethod="phone" authId="+919876543210" otp="123456" authErr={null} authBusy
          otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
        />,
      )
      fireEvent.keyDown(screen.getByLabelText(UI.saveOtp.fieldLabel), { key: 'Enter' })
      expect(verifyPhoneOtp).not.toHaveBeenCalled()
      expect(dispatch).not.toHaveBeenCalled()
    },
  )

  it('with authBusy: true, verify and resend are both disabled and a click calls nothing', async () => {
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="123456" authErr={null} authBusy
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    expect(verifyBtn()).toBeDisabled()
    expect(resendBtn()).toBeDisabled()
    await userEvent.click(verifyBtn())
    await userEvent.click(resendBtn())
    expect(verifyPhoneOtp).not.toHaveBeenCalled()
    expect(startPhoneOtp).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('resend (D2, prototype 2145 for the flash timing)', () => {
  it('calls startPhoneOtp for the phone method, dispatches SET_OTP_RESENT, and clears authBusy on success', async () => {
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    await userEvent.click(resendBtn())
    expect(startPhoneOtp).toHaveBeenCalledWith('+919876543210')
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_BUSY', value: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_OTP_RESENT', value: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_OTP_COOLDOWN', until: NOW + OTP_RESEND_COOLDOWN_MS })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_BUSY', value: false })
  })

  it('calls startEmailOtp for the email method', async () => {
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="email" authId="citizen@example.com" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    await userEvent.click(resendBtn())
    expect(startEmailOtp).toHaveBeenCalledWith('citizen@example.com')
  })

  it('a rate-limited resend surfaces GoTrue\'s returned error AND still arms the cooldown — otherwise the citizen taps into the same rejection repeatedly', async () => {
    startPhoneOtp.mockResolvedValueOnce({ ok: false, error: 'rate limit exceeded' })
    const dispatch = vi.fn()
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    await userEvent.click(resendBtn())
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_ERR', error: 'rate limit exceeded' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_OTP_COOLDOWN', until: NOW + OTP_RESEND_COOLDOWN_MS })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_BUSY', value: false })
  })

  // user-event v14 awaits REAL timers by default and hangs forever under
  // fake ones without both this shim (mirroring PrepareScreen.test.tsx's
  // own installJestShimForFakeTimers, needed for the identical reason: RTL's
  // asyncWrapper hardcodes a `typeof jest !== 'undefined'` check) and
  // userEvent.setup's own `advanceTimers` option.
  const installJestShimForFakeTimers = () => {
    ;(globalThis as { jest?: { advanceTimersByTime: (ms: number) => void } }).jest = {
      advanceTimersByTime: (ms: number) => { vi.advanceTimersByTime(ms) },
    }
  }

  afterEach(() => {
    delete (globalThis as { jest?: unknown }).jest
  })

  it("shows 'Code sent again ✓' immediately, and the flash reverts after exactly 2000ms (prototype 2145) — fake timers", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    installJestShimForFakeTimers()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const dispatch = vi.fn()
    const { rerender } = render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    await user.click(resendBtn())
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_OTP_RESENT', value: true })

    // This screen is fully controlled — the parent/reducer owns otpResent;
    // reflect the dispatched value back in, the same way a real store would.
    rerender(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent otpCooldownUntil={NOW + OTP_RESEND_COOLDOWN_MS} now={NOW} dispatch={dispatch}
      />,
    )
    expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendSent)

    await act(async () => { vi.advanceTimersByTime(1999) })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SET_OTP_RESENT', value: false })
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_OTP_RESENT', value: false })
  })

  it('clears the flash timer on unmount — no dispatch on a dead component', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    installJestShimForFakeTimers()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const dispatch = vi.fn()
    const { unmount } = render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={NOW} dispatch={dispatch}
      />,
    )
    await user.click(resendBtn())
    // Positive proof a timer really is pending before unmount — otherwise
    // the assertions below could pass vacuously against a component that
    // never scheduled anything at all (the same reasoning PrepareScreen.
    // test.tsx's own equivalent test documents).
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    dispatch.mockClear()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SET_OTP_RESENT', value: false })
  })
})

describe('D2 cooldown — the resend control disables itself while otpCooldownUntil is in the future (fake timers throughout)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('(a) well in the future: disabled, shows resendWaitMany with the right count, and a real interval tick updates it live — not a static prop check', () => {
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={NOW + 47_000} now={NOW} dispatch={vi.fn()}
      />,
    )
    expect(resendBtn()).toBeDisabled()
    expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendWaitMany.replace('{n}', '47'))

    // The interval's own callback firing, not a re-render this test forced —
    // proof the countdown is genuinely live.
    act(() => { vi.advanceTimersByTime(1000) })
    expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendWaitMany.replace('{n}', '46'))

    act(() => { vi.advanceTimersByTime(5000) })
    expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendWaitMany.replace('{n}', '41'))
  })

  it(
    '(b) between 0 and 1000ms remaining shows resendWaitOne (the Math.ceil boundary) — and "Send again in 0 ' +
    'seconds" is unreachable, not merely a claim',
    () => {
      render(
        <SaveOtpScreen
          authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
          otpResent={false} otpCooldownUntil={NOW + 1000} now={NOW} dispatch={vi.fn()}
        />,
      )
      // Exactly 1000ms remaining: Math.ceil(1000/1000) === 1.
      expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendWaitOne)
      expect(resendBtn()).toBeDisabled()
      expect(screen.queryByText(/0 seconds/)).toBeNull()

      // 500ms remaining: still exactly one second by Math.ceil.
      act(() => { vi.advanceTimersByTime(500) })
      expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendWaitOne)
      expect(screen.queryByText(/0 seconds/)).toBeNull()

      // 1ms remaining: Math.ceil(1/1000) === 1 still — the boundary never
      // dips below "one second" while remainingMs stays > 0.
      act(() => { vi.advanceTimersByTime(499) })
      expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendWaitOne)
      expect(screen.queryByText(/0 seconds/)).toBeNull()
    },
  )

  it('(c) at expiry the control re-enables and reverts to "Didn\'t get it? Send again"', () => {
    render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={NOW + 1000} now={NOW} dispatch={vi.fn()}
      />,
    )
    expect(resendBtn()).toBeDisabled()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(resendBtn()).not.toBeDisabled()
    expect(resendBtn()).toHaveTextContent(UI.saveOtp.resendPrompt)
  })

  it('(d) the interval is cleared on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={NOW + 5000} now={NOW} dispatch={vi.fn()}
      />,
    )
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it(
    'the cooldown is already armed on arrival — a screen entered via AUTH_ID_SUBMITTED renders the resend ' +
    'control disabled, without any resend having been tapped ("GoTrue\'s rate-limit window starts at the ' +
    'first send on the previous screen; an unarmed control lets the citizen\'s first tap burn on a rejection")',
    () => {
      // otpCooldownUntil here stands in for exactly what AUTH_ID_SUBMITTED's
      // own reducer arm now sets (session.ts, Task 12, design note 6) —
      // session.test.ts and SaveCaseScreen.test.tsx separately cover THAT
      // dispatch; this proves SaveOtpScreen itself honours the resulting
      // state on a fresh mount, with zero interaction.
      render(
        <SaveOtpScreen
          authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
          otpResent={false} otpCooldownUntil={NOW + OTP_RESEND_COOLDOWN_MS} now={NOW} dispatch={vi.fn()}
        />,
      )
      expect(resendBtn()).toBeDisabled()
    },
  )
})

// design note 3 / prototype 2115-2117: the migration guard. Assembles a
// small harness mirroring the RELEVANT slice of App.tsx's own auth-lifecycle
// effects (Task 8) — the onAuthChange subscription and the migration-runner
// effect — around a real useReducer(sessionReducer, ...), since App.tsx
// itself does not yet route to this screen (routing is a later task) and
// this screen must NEVER call runSignInMigration directly (design note 3).
function MigrationHarness({ dispatchSpy }: { dispatchSpy: (a: SessionAction) => void }) {
  const [state, dispatchRaw] = useReducer(sessionReducer, {
    ...initialSession, authMethod: 'phone', authId: '+919876543210', otp: '123456',
  })
  const dispatch = (a: SessionAction) => { dispatchSpy(a); dispatchRaw(a) }

  // Mirrors App.tsx effect 3's SIGNED_IN case exactly (Task 8): the real
  // channel `verifyOtp` succeeding also notifies, independent of this
  // screen's own direct dispatch below.
  useEffect(() => {
    const unsubscribe = onAuthChange((event, user) => {
      if (event === 'SIGNED_IN' && user) {
        dispatch({ type: 'SIGNED_IN', user })
        dispatch({ type: 'MIGRATION_STARTED' })
      }
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirrors App.tsx effect 4 exactly (Task 8): the ONLY place that ever
  // calls runSignInMigration, keyed on state.migration so a same-value
  // MIGRATION_STARTED dispatch (the reducer's own guard) never re-fires it.
  useEffect(() => {
    if (state.migration !== 'running') return
    let cancelled = false
    void (async () => {
      const result = await runSignInMigration(NOW)
      if (cancelled) return
      if (result.ok) dispatch({ type: 'ADOPT_CASES', cases: result.cases })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.migration])

  return (
    <SaveOtpScreen
      authMethod={state.authMethod} authId={state.authId} otp={state.otp} authErr={state.authErr}
      authBusy={state.authBusy} otpResent={state.otpResent} otpCooldownUntil={state.otpCooldownUntil}
      now={NOW} dispatch={dispatch}
    />
  )
}

describe('a valid code — design note 3 (SIGNED_IN, migration exactly once via the App-level machinery, ADOPT_CASES, then save-name)', () => {
  it(
    "calls verifyPhoneOtp (the auth.ts wrapper that types the call 'sms'), dispatches SIGNED_IN itself, never " +
    'dispatches MIGRATION_STARTED itself, lets the onAuthChange + migration-runner machinery run the migration ' +
    "EXACTLY ONCE even though the fake ALSO emits its own SIGNED_IN on the auth channel, lands ADOPT_CASES with " +
    "the merged set, and navigates to 'save-name' — \"Signing in adopts whatever cases the account already has " +
    'in storage, BEFORE any save completes" (prototype 2115-2117)',
    async () => {
      const user: AppUser = { method: 'phone', id: '+919876543210', name: null }
      verifyPhoneOtp.mockResolvedValue({ ok: true, user })
      const merged = [makeCasefile({ id: 'merged-1' }), makeCasefile({ id: 'merged-2' })]
      runSignInMigration.mockResolvedValue({ ok: true, cases: merged })

      const dispatch = vi.fn()
      render(<MigrationHarness dispatchSpy={dispatch} />)

      await userEvent.click(verifyBtn())
      expect(verifyPhoneOtp).toHaveBeenCalledWith('+919876543210', '123456')

      // "The fake" — the real supabase-js client's own internal
      // onAuthStateChange notification, firing independently of this
      // screen's own direct SIGNED_IN dispatch above (design note 3).
      await waitFor(() => expect(onAuthChange).toHaveBeenCalled())
      const authChangeCb = onAuthChange.mock.calls[0][0]
      act(() => { authChangeCb('SIGNED_IN', user) })

      await waitFor(() => expect(runSignInMigration).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'ADOPT_CASES', cases: merged }))

      expect(dispatch).toHaveBeenCalledWith({ type: 'SIGNED_IN', user })
      expect(dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'save-name' })

      // This screen must never dispatch MIGRATION_STARTED itself — that is
      // App.tsx's onAuthChange subscription's job (design note 3); a
      // screen-side dispatch would be a THIRD trigger racing the mount
      // effect and the subscription, which is exactly the hazard Task 8's
      // reducer guard exists to prevent. Only the fake channel's own
      // dispatch (inside the harness above) may ever produce one.
      const migrationStartedCalls = dispatch.mock.calls.filter(([a]) => a.type === 'MIGRATION_STARTED')
      expect(
        migrationStartedCalls,
        'design note 3: SaveOtpScreen must never dispatch MIGRATION_STARTED itself',
      ).toHaveLength(1)

      // Give any further queued triggers a chance to fire, then confirm the
      // migration genuinely never ran a second time.
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(
        runSignInMigration,
        'prototype 2115-2117: signing in adopts the account\'s cases BEFORE any save completes — a second ' +
        'migration run would race that guarantee, not just waste a network call',
      ).toHaveBeenCalledTimes(1)

      // Order, across independent mocks — vitest's invocationCallOrder is a
      // single counter shared globally across every mock, so these are
      // directly comparable: verify resolves, THEN this screen's own
      // SIGNED_IN reaches the reducer, THEN the App-level machinery's
      // migration actually runs, THEN ADOPT_CASES lands.
      const signedInCallIdx = dispatch.mock.calls.findIndex(([a]) => a.type === 'SIGNED_IN')
      const adoptCasesCallIdx = dispatch.mock.calls.findIndex(([a]) => a.type === 'ADOPT_CASES')
      expect(signedInCallIdx).toBeGreaterThanOrEqual(0)
      expect(adoptCasesCallIdx).toBeGreaterThanOrEqual(0)
      expect(
        verifyPhoneOtp.mock.invocationCallOrder[0],
        'verifyPhoneOtp must resolve before this screen dispatches its own SIGNED_IN',
      ).toBeLessThan(dispatch.mock.invocationCallOrder[signedInCallIdx])
      expect(
        dispatch.mock.invocationCallOrder[signedInCallIdx],
        "design note 3: this screen's own SIGNED_IN must reach the reducer before the App-level machinery's " +
        'migration run starts',
      ).toBeLessThan(runSignInMigration.mock.invocationCallOrder[0])
      expect(
        runSignInMigration.mock.invocationCallOrder[0],
        'prototype 2115-2117: the migration must actually run before ADOPT_CASES lands the merged set',
      ).toBeLessThan(dispatch.mock.invocationCallOrder[adoptCasesCallIdx])
    },
  )
})
