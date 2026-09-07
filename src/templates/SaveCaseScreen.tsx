/** SaveCaseScreen — port of the prototype's `renderSaveCase` (design/
 *  nextmove-v1-prototype.html, lines 3823-3845, tag v1-design-lock-2): the
 *  phone/email entry point that starts the sign-in + save flow. First of
 *  the four new C7 auth screens (`save-case` -> `save-otp` -> `save-name`
 *  -> `save-done`); this task builds only this one.
 *
 *  Props are individual, fully-controlled fields (`authMethod`/`authId`/
 *  `authErr`/`authBusy`), the same convention `PrepareScreen`'s design
 *  note 6 and `CasefileScreen`'s own prop list already use, NOT a raw
 *  `state: SessionState` — this screen touches exactly four SessionState
 *  fields and threading the whole object would let it read fields (e.g.
 *  `savedCases`) that mean nothing to it. `topbar`/`dispatch` mirror every
 *  other C7 template (`SaveDoneScreen`, `PrepareScreen`): `topbar` is
 *  rendered first, matching the prototype's own `topbar(true,false)`
 *  (3824) via App.tsx's `topbar(showBack, showRestart)` closure; `dispatch`
 *  is optional for the same reason it is everywhere else in this codebase
 *  (a screen with no wired caller still mounts and renders).
 *
 *  DESIGN NOTE 1 (validation lives in auth.ts, not here). `handleSend`
 *  calls `normalisePhone`/`isValidEmail` (session/auth.ts, Task 3) and
 *  dispatches `SET_AUTH_ERR` with the REGISTERED string on failure, or
 *  `AUTH_ID_SUBMITTED` + `startPhoneOtp`/`startEmailOtp` on success. This
 *  component contains no validation logic of its own — Task 3 already
 *  tested normalisePhone/isValidEmail exhaustively without React, and
 *  duplicating that logic here would both violate DRY and untest the real
 *  thing.
 *
 *  DESIGN NOTE 2 (one input, not two — prototype 3836-3837). The field's
 *  label, `type` and placeholder all switch on `authMethod`; a typed value
 *  is cleared by `SET_AUTH_METHOD`'s own reducer arm (session.ts, "switching
 *  identifier type clears whatever was half-typed for the OTHER method"),
 *  never by unmounting/remounting a second `<input>`.
 *
 *  DESIGN NOTE 3 (authBusy — mechanism only, no copy, prototype has no
 *  equivalent). The prototype's own `authSubmitId`/`authGoogle` calls are
 *  synchronous simulations; the real ones are awaited network calls, and a
 *  citizen tapping "Send me a code" (or "Continue with Google") twice must
 *  not start two flows. `authBusy` disables BOTH buttons while a request is
 *  in flight (design note 5 in the task brief) and is also checked at the
 *  top of both handlers as a second guard — belt-and-braces, since the
 *  `disabled` attribute alone governs real pointer/keyboard activation of
 *  the BUTTONS, but Enter-to-submit fires through the `<input>`'s own
 *  `onKeyDown`, which the `disabled` attribute never touches.
 *
 *  On the SUCCESS path, `SET_AUTH_BUSY: false` is deliberately NOT
 *  dispatched alongside `AUTH_ID_SUBMITTED` — the reducer's own
 *  `AUTH_ID_SUBMITTED` arm (session.ts) does not clear `authBusy` either,
 *  and this component's brief asks only for the failure path to clear it
 *  ("a stuck busy flag is a dead screen" is explicitly about the FAILURE
 *  case). `authBusy` stays `true` across the navigation into `save-otp`;
 *  whether/how that next screen needs to reset it before its own network
 *  call is that screen's own concern, flagged forward rather than guessed
 *  at here. Google's success path is even more clearly out of scope for a
 *  local reset: a real `signInWithOAuth` redirect navigates the whole page
 *  away, so there is no "after success" render of this screen to unstick.
 *
 *  DESIGN NOTE 4 (a11y — mechanism improvement, no visual change). The
 *  prototype's own field label is a styled `<div class="auth-label">`
 *  (3835); this port upgrades it to a real `<label htmlFor>` tied to the
 *  input's `id` so a screen reader announces the field's purpose and a
 *  click on the label focuses the input — same CSS class, same text, same
 *  position, nothing rendered differently. `.auth-err` carries
 *  `role="alert"` (task brief design note 7) so a validation failure the
 *  citizen did not navigate to is announced, not just displayed. */
import type { ReactNode } from 'react'
import type { SessionAction, SessionState } from '../session/session'
import { normalisePhone, isValidEmail, startPhoneOtp, startEmailOtp, signInWithGoogle } from '../session/auth'
import { Split } from '../ui/Split'
import { Crumbs } from '../ui/Crumbs'
import { Button } from '../ui/Button'
import { ICONS } from '../ui/icons'
import { UI } from '../screens/screenCopy'

const AUTH_ID_INPUT_ID = 'save-case-auth-id'

export interface SaveCaseScreenProps {
  authMethod: SessionState['authMethod']
  authId: SessionState['authId']
  authErr: SessionState['authErr']
  authBusy: SessionState['authBusy']
  /** Rendered first, matching the prototype's own `topbar(true,false)` at
   *  the top of `renderSaveCase`, line 3824. */
  topbar?: ReactNode
  dispatch?: (action: SessionAction) => void
}

export function SaveCaseScreen({ authMethod, authId, authErr, authBusy, topbar, dispatch }: SaveCaseScreenProps) {
  const isPhone = authMethod === 'phone'

  const handleSend = async () => {
    // Second guard beyond the button's own `disabled` — see design note 3.
    if (authBusy) return
    if (isPhone) {
      const e164 = normalisePhone(authId)
      if (!e164) {
        dispatch?.({ type: 'SET_AUTH_ERR', error: UI.saveCase.errors.mobile })
        return
      }
      dispatch?.({ type: 'SET_AUTH_BUSY', value: true })
      const result = await startPhoneOtp(e164)
      if (!result.ok) {
        dispatch?.({ type: 'SET_AUTH_ERR', error: result.error })
        dispatch?.({ type: 'SET_AUTH_BUSY', value: false })
        return
      }
      dispatch?.({ type: 'AUTH_ID_SUBMITTED', authId: e164 })
    } else {
      if (!isValidEmail(authId)) {
        dispatch?.({ type: 'SET_AUTH_ERR', error: UI.saveCase.errors.email })
        return
      }
      dispatch?.({ type: 'SET_AUTH_BUSY', value: true })
      const result = await startEmailOtp(authId)
      if (!result.ok) {
        dispatch?.({ type: 'SET_AUTH_ERR', error: result.error })
        dispatch?.({ type: 'SET_AUTH_BUSY', value: false })
        return
      }
      dispatch?.({ type: 'AUTH_ID_SUBMITTED', authId })
    }
  }

  const handleGoogle = async () => {
    if (authBusy) return
    dispatch?.({ type: 'SET_AUTH_BUSY', value: true })
    const result = await signInWithGoogle(window.location.origin)
    if (!result.ok) {
      dispatch?.({ type: 'SET_AUTH_ERR', error: result.error })
      dispatch?.({ type: 'SET_AUTH_BUSY', value: false })
    }
    // Success: no further dispatch here (design note 3) — a real redirect
    // navigates the page away.
  }

  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              <Crumbs parts={[UI.saveCase.crumb]} sqClass="sq-butter" />
              <h1 className="headline">{UI.saveCase.headline}</h1>
              <p className="lede">{UI.saveCase.lede}</p>
              <p className="prep-trust">{UI.saveCase.trust}</p>
            </>
          }
          right={
            <>
              <button className="btn-google" onClick={() => void handleGoogle()} disabled={authBusy}>
                {ICONS.google} {UI.saveCase.google}
              </button>
              <div className="auth-divider">{UI.saveCase.divider}</div>
              <div className="auth-field">
                {/* DESIGN NOTE 4: a real <label htmlFor>, not the prototype's
                    styled <div> — same class, same text, a11y-only upgrade. */}
                <label className="auth-label" htmlFor={AUTH_ID_INPUT_ID}>
                  {isPhone ? UI.saveCase.fieldLabelMobile : UI.saveCase.fieldLabelEmail}
                </label>
                <input
                  id={AUTH_ID_INPUT_ID}
                  className="auth-input"
                  type={isPhone ? 'tel' : 'email'}
                  placeholder={isPhone ? UI.saveCase.placeholderMobile : UI.saveCase.placeholderEmail}
                  value={authId}
                  onChange={e => dispatch?.({ type: 'SET_AUTH_ID', value: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleSend()
                  }}
                />
                {authErr ? (
                  <div className="auth-err" role="alert">
                    {authErr}
                  </div>
                ) : null}
              </div>
              <Button block arrow style={{ marginTop: 0 }} onClick={() => void handleSend()} disabled={authBusy}>
                {UI.saveCase.send}
              </Button>
              <button
                className="auth-switch"
                onClick={() => dispatch?.({ type: 'SET_AUTH_METHOD', method: isPhone ? 'email' : 'phone' })}
              >
                {isPhone ? UI.saveCase.switchToEmail : UI.saveCase.switchToMobile}
              </button>
              <p className="auth-note">{UI.saveCase.authNote}</p>
            </>
          }
        />
      </div>
    </>
  )
}
