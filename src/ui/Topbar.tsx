/** Ports the prototype's `topbar()` (design/nextmove-v1-prototype.html,
 *  lines 2262-2280) and `restartControl()` (2299-2307).
 *
 *  `showBack`/`showRestart` are props, not derived, because Home passes
 *  `topbar(false,false)` — a screen-level choice, not something Topbar can
 *  infer from state.
 *
 *  Task 15: `state: SessionState` is a REQUIRED prop, not the originally
 *  planned `account: ReactNode` slot (Open Question 1, RESOLVED — see
 *  task-15-brief.md design note 2 for the full reasoning). `Topbar` renders
 *  `<AccountChip state={state} dispatch={dispatch} />` itself, filling the
 *  slot this file's own header comment used to reserve as empty. Being
 *  required makes every one of this port's 25 `<Topbar>` mount sites a
 *  compile error until wired, the same fail-safe direction `ScreenId`'s
 *  exhaustive switch already uses — and unlike a `ReactNode` slot, it
 *  cannot be satisfied at the 8 test mounts with a value that compiles but
 *  renders nothing on purpose (`account={null}`): those mounts pass
 *  `state={initialSession}`, which is both correct AND genuinely renders no
 *  chip, because `initialSession.user` is `null` (AccountChip.tsx design
 *  note 3). `showBack`/`showRestart`/`hasAnswers`/`restartConfirm`/
 *  `dispatch` are all untouched — this is strictly additive, not a
 *  restructure (this file already imported `SessionAction` from
 *  `../session/session`, so `SessionState` is a type import from a module
 *  it already depends on).
 *
 *  Task 9's copy sweep: the brand wordmark, back/restart control labels and
 *  the restart-confirm prompt are service-agnostic chrome, so they live in
 *  `SCREEN_COPY.ui` (design note 6) rather than inline here. */
import type { SessionAction, SessionState } from '../session/session'
import { ICONS } from './icons'
import { UI } from '../screens/screenCopy'
import { AccountChip } from './AccountChip'

export interface TopbarProps {
  showBack: boolean
  showRestart: boolean
  hasAnswers: boolean
  restartConfirm: boolean
  state: SessionState
  dispatch: (action: SessionAction) => void
}

export function Topbar({ showBack, showRestart, hasAnswers, restartConfirm, state, dispatch }: TopbarProps) {
  return (
    <div className="topbar">
      <button className="brand" onClick={() => dispatch({ type: 'RESTART' })}>
        <span className="brand-mark">{ICONS.brandMark}</span>{UI.topbar.brand}
      </button>
      <div className="topctrls">
        <AccountChip state={state} dispatch={dispatch} />
        {showBack && (
          <button className="ctrl-link" onClick={() => dispatch({ type: 'BACK' })}>{UI.topbar.back}</button>
        )}
        {showRestart && (
          <RestartControl hasAnswers={hasAnswers} restartConfirm={restartConfirm} dispatch={dispatch} />
        )}
      </div>
    </div>
  )
}

function RestartControl({
  hasAnswers,
  restartConfirm,
  dispatch,
}: {
  hasAnswers: boolean
  restartConfirm: boolean
  dispatch: (action: SessionAction) => void
}) {
  if (restartConfirm) {
    return (
      <span className="restart-confirm">
        {UI.topbar.restartConfirm.prompt}
        <button className="yes" onClick={() => dispatch({ type: 'RESTART' })}>{UI.topbar.restartConfirm.yes}</button>
        <button className="no" onClick={() => dispatch({ type: 'RESTART_CANCEL' })}>{UI.topbar.restartConfirm.cancel}</button>
      </span>
    )
  }
  // When there are no answers, Restart restarts immediately — nothing to
  // lose, so the confirm step would only add friction (prototype: hasAnswers
  // ? arm : restart()).
  return (
    <button
      className="ctrl-link"
      onClick={() => dispatch(hasAnswers ? { type: 'RESTART_REQUEST' } : { type: 'RESTART' })}
    >
      {UI.topbar.restart}
    </button>
  )
}
