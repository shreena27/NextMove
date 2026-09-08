/** Ports the prototype's account chip + popover (design/nextmove-v1-
 *  prototype.html, `acctPopover()` 2246-2261 and the `acct` fragment of
 *  `topbar()` 2262-2271, plus the Escape handler at 3949, tag
 *  v1-design-lock-2). Rendered by `Topbar` (this file's only caller),
 *  filling the slot `Topbar.tsx`'s own header comment reserved: "The
 *  account chip's slot renders as nothing here (C7 owns sign-in/save, not
 *  in scope until then)." Renders nothing at all when `state.user` is
 *  `null` (prototype 2264-2271: the whole `acct` fragment is `''` with no
 *  user) — so every one of Task 15's 25 `<Topbar>` sites is unconditional,
 *  and the visibility rule lives in exactly one place.
 *
 *  `firstName`/`maskId` are `session/auth.ts`'s (Task 3) — not
 *  re-implemented here. `loadCases()` is `session/caseStore.ts`'s.
 *
 *  TWO CONSIDERED A11Y DEVIATIONS FROM THE PROTOTYPE — both deliberate,
 *  neither an oversight, so both calls are recorded here in one place:
 *
 *  1. THE SCRIM STAYS A `<div onClick>` WITH `aria-hidden="true"`, NOT A
 *     `<button>`. The lifted CSS rule (`index.css`, `.acct-scrim{position:
 *     fixed; inset:0; z-index:19; background:transparent;}`) has no
 *     border-reset, so a `<button>` under it would render the browser's
 *     default button border as a visible frame around the ENTIRE viewport
 *     — fixing that means editing a rule inside Task 9's "transcribe, do
 *     not re-author" range, which is out of bounds. It would also be worse
 *     accessibility, not better: a full-viewport click-outside target is
 *     not a control a keyboard user should land on, and making it
 *     focusable inserts an invisible, unlabelled-in-context tab stop
 *     between the popover and everything behind it. And there is no gap to
 *     close — Escape already dismisses (design note 6 below), every row
 *     inside the popover is a real `<button>`, and the chip itself toggles.
 *     Mouse-only dismissal was never the situation. Do not "upgrade" this
 *     to a `<button>`; `AccountChip.test.tsx` pins the scrim as
 *     NOT focusable specifically so this cannot be silently reintroduced.
 *
 *  2. `role="menu"` IS DELIBERATELY NOT PORTED to `.acct-pop`, even though
 *     the prototype has it (2247/2249). The prototype's `role="menu"` has
 *     no `role="menuitem"` children anywhere — an incomplete ARIA contract
 *     that promises a screen reader user arrow-key roving focus and
 *     Home/End navigation neither the prototype nor this port implements.
 *     An incomplete promise is worse than no promise. This element stays a
 *     plain `<div aria-label="Account">` containing real `<button>`s —
 *     native tab order already gives reachability, activation and
 *     announcement for a five-row popover; implementing full `menu`/
 *     `menuitem` roving-focus semantics is real work this locked design
 *     does not ask for. `AccountChip.test.tsx` pins the absence of
 *     `role="menu"`. */
import { useEffect } from 'react'
import type { SessionAction, SessionState } from '../session/session'
import { firstName, maskId, signOut } from '../session/auth'
import { loadCases } from '../session/caseStore'
import { UI } from '../screens/screenCopy'

export interface AccountChipProps {
  state: SessionState
  dispatch: (action: SessionAction) => void
}

export function AccountChip({ state, dispatch }: AccountChipProps) {
  const { user } = state
  const acctOpen = !!user && state.acctOpen

  // Design note 6 (prototype 3949): `if(e.key==='Escape' && S.acctOpen){
  // S.acctOpen=false; S.signOutConfirm=false; render(); }`. A `keydown`
  // listener on `document`, added and removed by this effect, gated on
  // `acctOpen` — never a permanently-mounted global listener, and never
  // left attached past this popover closing or this component unmounting.
  useEffect(() => {
    if (!acctOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') dispatch({ type: 'CLOSE_ACCT' })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [acctOpen, dispatch])

  if (!user) return null

  const openN = state.savedCases.filter(c => c.outcome === 'still_open').length
  const casefilesLabel = (openN === 1 ? UI.account.casefilesOne : UI.account.casefilesMany)
    .replace('{n}', String(openN))

  const handleSignOutYes = async () => {
    await signOut()
    // Task 4: ONE of only two SIGN_OUT dispatch sites in the codebase (the
    // other is App.tsx's own onAuthChange 'SIGNED_OUT' handler). The
    // payload is what stops a failed migration's preserved local cases
    // being overwritten by a careless sign-out — `loadCases()`, never `[]`
    // and never `state.savedCases`.
    dispatch({ type: 'SIGN_OUT', localCases: loadCases() })
  }

  return (
    <span className="acct-wrap">
      <button
        className={'acct-chip' + (user.name ? '' : ' noname')}
        onClick={() => dispatch({ type: 'TOGGLE_ACCT' })}
        aria-haspopup="true"
        aria-expanded={acctOpen}
        title={UI.account.ariaLabel}
      >
        <span className="acct-av">{user.name ? user.name.trim()[0].toUpperCase() : '•'}</span>
        {firstName(user)}
      </button>
      {acctOpen && (
        <>
          {/* Considered decision 1 (header comment) — stays a div, not a button. */}
          <div className="acct-scrim" aria-hidden="true" onClick={() => dispatch({ type: 'CLOSE_ACCT' })} />
          {/* Considered decision 2 (header comment) — no role="menu". */}
          <div className="acct-pop" aria-label={UI.account.ariaLabel}>
            <div className="acct-pop-head">
              <div className="acct-pop-name">{user.name || maskId(user)}</div>
              {user.name && <div className="acct-pop-sub">{maskId(user)}</div>}
            </div>
            <button className="acct-pop-row" onClick={() => dispatch({ type: 'RESTART' })}>
              {/* Task 4 made RESTART preserve `user` — this row must not
                  sign the citizen out (AccountChip.test.tsx asserts it). */}
              {casefilesLabel}
              <span className="row-sub">{UI.account.casefilesSub}</span>
            </button>
            {!user.name && (
              <button
                className="acct-pop-row"
                onClick={() => {
                  dispatch({ type: 'SET_PENDING_NAME', value: '' })
                  dispatch({ type: 'NAVIGATE', screen: 'save-name' })
                }}
              >
                {UI.account.addName}
                <span className="row-sub">{UI.account.addNameSub}</span>
              </button>
            )}
            {state.signOutConfirm ? (
              <div className="acct-pop-confirm">
                {UI.account.signOutConfirm.prompt}
                <div>
                  <button className="yes" onClick={() => void handleSignOutYes()}>
                    {UI.account.signOutConfirm.yes}
                  </button>
                  <button className="no" onClick={() => dispatch({ type: 'SET_SIGN_OUT_CONFIRM', value: false })}>
                    {UI.account.signOutConfirm.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button className="acct-pop-row" onClick={() => dispatch({ type: 'SET_SIGN_OUT_CONFIRM', value: true })}>
                {UI.account.signOut}
              </button>
            )}
          </div>
        </>
      )}
    </span>
  )
}
