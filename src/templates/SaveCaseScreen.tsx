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
 *  FIX ROUND 1, FINDING 1 (corrects the original version of this note —
 *  left here as the record, not deleted, since the wrong reasoning is worth
 *  keeping visible). The original text argued `SET_AUTH_BUSY: false` should
 *  NOT be dispatched on the SUCCESS path, on the theory that
 *  `AUTH_ID_SUBMITTED`'s own reducer arm not clearing `authBusy` was
 *  established precedent. That reasoning does not hold: that reducer arm
 *  (session.ts, Task 4) predates any screen actually dispatching
 *  `SET_AUTH_BUSY` at all, so it cannot be evidence of intent either way —
 *  and its neighbor `SIGNED_IN` DOES clear `authBusy` on its own terminal
 *  transition, which is the real precedent. Concretely: leaving `authBusy`
 *  `true` after a successful send means a citizen who presses Back from
 *  `save-otp` (`BACK`, session.ts, which clears `trustOpen`/
 *  `restartConfirm`/`authErr`/`acctOpen` but NOT `authBusy`) returns to a
 *  `SaveCaseScreen` where both buttons render `disabled` AND the in-handler
 *  guards below block Enter too — with `showRestart={false}` on this
 *  screen's own topbar, there is no escape hatch. Reproduced directly in
 *  `SaveCaseScreen.test.tsx`'s `ControlledWithBack` test (Fix Round 1,
 *  Finding 1). Both success branches below now dispatch
 *  `SET_AUTH_BUSY: false` immediately before `AUTH_ID_SUBMITTED` — the
 *  request this flag names is genuinely finished by that point (this file's
 *  own header note above defines `authBusy` as "while a request is in
 *  flight"), so clearing it here is the flag's OWN documented meaning, not
 *  an exception to it. Google's success path still needs no such dispatch:
 *  the reviewer confirmed a real `signInWithOAuth` redirect navigates the
 *  whole page away, so there is no "after success" render of this screen
 *  left to unstick.
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
      // Fix Round 1, Finding 1: the request that started `authBusy` is done
      // (successfully) by this point — leaving the flag `true` here
      // produces a genuinely dead screen if the citizen presses Back from
      // 'save-otp' (see the file header's own updated note, and the
      // ControlledWithBack repro in SaveCaseScreen.test.tsx).
      dispatch?.({ type: 'SET_AUTH_BUSY', value: false })
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
      // Fix Round 1, Finding 1: same clear on the email success branch.
      dispatch?.({ type: 'SET_AUTH_BUSY', value: false })
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
