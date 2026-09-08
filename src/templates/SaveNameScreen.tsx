/** SaveNameScreen — port of the prototype's `renderSaveName` (design/
 *  nextmove-v1-prototype.html, lines 3870-3886, tag v1-design-lock-2): the
 *  one optional, skippable name ask. Last of the four C7 auth screens
 *  (`save-case` -> `save-otp` -> `save-name` -> `save-done`).
 *
 *  DESIGN NOTE 1 (task-13-brief.md design note 1 — TWO genuinely different
 *  screens sharing one shell). `midSave = !!pendingSave` (prototype 3871).
 *  Mid-save (reached right after OTP verify, `SaveOtpScreen`'s own
 *  `NAVIGATE` to `'save-name'`): crumbs `[saveCase.crumb, crumbTailMidSave]`,
 *  lede tail `ledeClauseMidSave`, buttons `saveMidSave`/`switchMidSave`.
 *  Standalone (reached from the account popover's "Add your name" row,
 *  prototype 2255 — a screen that does not exist until Task 15, so this
 *  path is real but not yet reachable through the shipped UI): crumbs
 *  `[crumbStandalone]` alone (its own whole single-part array, no shared
 *  first segment), lede tail `ledeClauseStandalone`, buttons
 *  `saveStandalone`/`switchStandalone`. `headline`/`fieldLabel`/`placeholder`
 *  do not branch. `topbar(false,false)` on both — no Back, no Restart —
 *  matches every other C7 template: `topbar` is an opaque `ReactNode` prop,
 *  computed by the caller (App.tsx's own `topbar(showBack, showRestart)`
 *  closure), not by this component.
 *
 *  Props are individual, fully-controlled fields, the same convention every
 *  other C7 template already uses — `pendingSave`/`pendingName` are the
 *  only two `SessionState` fields this screen touches (plus D6's `now`,
 *  required for the same reason `SaveCaseScreen`/`SaveOtpScreen` already
 *  require it: a screen with no wired caller still needs a real clock value
 *  to compute a real BEGIN_SAVE dispatch from). `dispatch` stays optional
 *  for the same reason it does everywhere else in this codebase.
 *
 *  The lede is built as ONE string with a single space
 *  (`` `${ledeStem} ${clause}` ``), inside the same `.lede` text node — the
 *  prototype builds one string too (3877), the same join discipline
 *  `SaveDoneScreen`'s own `ledeTailPhone`/`ledeTailOther` restoration
 *  (Task 14) needs.
 *
 *  DESIGN NOTE 2 (`saveNameFinish(withName)`, prototype 2129-2136,
 *  transcribed — task brief design note 2). Trim `pendingName`; a name is
 *  only "typed" when `withName` is true AND the trimmed value is non-empty
 *  (this is what makes a whitespace-only draft behave exactly like skip,
 *  and what makes Enter — which always calls this with `withName=true`,
 *  prototype 3880 — safe to fire on an empty field). When a name IS typed:
 *  call `setDisplayName(n)` and dispatch **`SET_USER_NAME { name: n }`** —
 *  **never `SIGNED_IN`**. `SIGNED_IN` also clears `authErr`/`otp`/
 *  `authBusy` (session.ts's own arm) — harmless mid-save (an auth flow just
 *  finished and those fields are already clear), but a SILENT STATE WIPE on
 *  the standalone path, where there is no auth flow in progress at all.
 *  Task 8's `USER_UPDATED` handler (App.tsx) dispatches this SAME action
 *  with the server's own echo of the value, so this screen's optimistic
 *  dispatch and that later confirmation are idempotent by construction —
 *  this screen never needs to branch on `setDisplayName`'s own result to
 *  decide whether to write the name locally (design note 3 below is about
 *  *ordering* against the save, not about swallowing the network result).
 *
 *  Then: `pendingSave` present -> complete the pending save and land on
 *  `'save-done'`; absent -> navigate to `'home'`. **On the standalone path
 *  no case is EVER saved** — there is no `BEGIN_SAVE` dispatch anywhere on
 *  that branch, by construction. A stray save here would create a casefile
 *  the citizen never asked for, which is the exact harm C5's OQ3 ruling
 *  forbids (task brief RED item 5).
 *
 *  DESIGN NOTE 3 (ordering — task brief design note 3: "save first, name
 *  second"). The mid-save `BEGIN_SAVE` dispatch happens as the FIRST
 *  statement in `handleFinish`, unconditionally, before the `await
 *  setDisplayName(...)` below it ever runs — so even a failing
 *  `setDisplayName` call can never block, delay, or skip completing the
 *  save. Losing a citizen's case because a nickname failed to save would be
 *  a badly-ordered failure; this ordering is what prevents it. Skipping
 *  never calls `setDisplayName` at all (design note 2), so a network
 *  failure can never block skipping either.
 *
 *  DESIGN NOTE 4 (task brief design note 4 — "no second save path is
 *  written"). Mid-save completes the pending save by dispatching the SAME
 *  `BEGIN_SAVE` action C5's original save buttons dispatch (App.tsx's own
 *  `onSave` call sites), reusing `pendingSave`'s own `engineKey`/
 *  `serviceLabel`/`returnScreen` (set when `BEGIN_SAVE` first fired, before
 *  the auth detour) plus THIS render's `now` and a freshly minted
 *  `newCaseId()` — called inside the click/Enter handler, at interaction
 *  time, the same convention App.tsx's own `onSave={() => dispatch({...,
 *  newId: newCaseId()})}` call sites already use (never during render). The
 *  reducer's existing `BEGIN_SAVE` arm (`completeSave` -> `'save-done'`)
 *  runs exactly as it always does, so the signed-in persistence effect
 *  (Task 8) picks it up the same way it would any other save — no parallel
 *  save mechanism exists anywhere in this file. */
import type { ReactNode } from 'react'
import type { SessionAction, SessionState } from '../session/session'
import { newCaseId } from '../session/cases'
import { setDisplayName } from '../session/auth'
import { Crumbs } from '../ui/Crumbs'
import { Button } from '../ui/Button'
import { UI } from '../screens/screenCopy'

const SAVE_NAME_INPUT_ID = 'save-name-input'

export interface SaveNameScreenProps {
  pendingSave: SessionState['pendingSave']
  pendingName: SessionState['pendingName']
  /** D6: the clock for the mid-save `BEGIN_SAVE` dispatch's own `now` field
   *  — never an internal `Date.now()` call here, matching `SaveCaseScreen`/
   *  `SaveOtpScreen`'s own required `now` prop. */
  now: number
  /** Rendered first, matching the prototype's own `topbar(false,false)` at
   *  the top of `renderSaveName`, line 3872. */
  topbar?: ReactNode
  dispatch?: (action: SessionAction) => void
}

export function SaveNameScreen({ pendingSave, pendingName, now, topbar, dispatch }: SaveNameScreenProps) {
  const midSave = !!pendingSave
  const lede = `${UI.saveName.ledeStem} ${midSave ? UI.saveName.ledeClauseMidSave : UI.saveName.ledeClauseStandalone}`

  const handleFinish = async (withName: boolean) => {
    const trimmed = pendingName.trim()
    const hasName = withName && trimmed.length > 0

    // Design note 3: save first, name second — dispatched unconditionally
    // and synchronously (before any `await` below), so a failing
    // `setDisplayName` call can never block or delay reaching save-done.
    if (pendingSave) {
      dispatch?.({
        type: 'BEGIN_SAVE',
        engineKey: pendingSave.engineKey,
        serviceLabel: pendingSave.serviceLabel,
        returnScreen: pendingSave.returnScreen,
        now,
        newId: newCaseId(),
      })
    } else {
      // Design note: no BEGIN_SAVE anywhere on this branch — the
      // standalone path never saves a case (task brief RED item 5).
      dispatch?.({ type: 'NAVIGATE', screen: 'home' })
    }

    if (hasName) {
      await setDisplayName(trimmed)
      // Design note 2: SET_USER_NAME, never SIGNED_IN — regardless of
      // setDisplayName's own result (the later USER_UPDATED echo, Task 8,
      // reconciles it; this is the same optimistic-write shape every other
      // network-backed dispatch in this screen's sibling components uses).
      dispatch?.({ type: 'SET_USER_NAME', name: trimmed })
    }
  }

  return (
    <>
      {topbar}
      <div className="stage screen">
        <div className="narrow">
          <Crumbs
            parts={midSave ? [UI.saveCase.crumb, UI.saveName.crumbTailMidSave] : [UI.saveName.crumbStandalone]}
            sqClass="sq-butter"
          />
          <h2 className="headline">{UI.saveName.headline}</h2>
          <p className="lede">{lede}</p>
          <div className="auth-field">
            <label className="auth-label" htmlFor={SAVE_NAME_INPUT_ID}>
              {UI.saveName.fieldLabel}
            </label>
            <input
              id={SAVE_NAME_INPUT_ID}
              className="auth-input"
              type="text"
              placeholder={UI.saveName.placeholder}
              value={pendingName}
              onChange={e => dispatch?.({ type: 'SET_PENDING_NAME', value: e.target.value })}
              onKeyDown={e => {
                // Design note 5 / prototype 3880: Enter always submits WITH
                // a name — an empty/whitespace-only draft still degrades to
                // skip via handleFinish's own trim check, exactly as a
                // typed-then-cleared field would on a click.
                if (e.key === 'Enter') void handleFinish(true)
              }}
            />
          </div>
          <Button block arrow style={{ marginTop: 0 }} onClick={() => void handleFinish(true)}>
            {midSave ? UI.saveName.saveMidSave : UI.saveName.saveStandalone}
          </Button>
          <button className="auth-switch" onClick={() => void handleFinish(false)}>
            {midSave ? UI.saveName.switchMidSave : UI.saveName.switchStandalone}
          </button>
        </div>
      </div>
    </>
  )
}
