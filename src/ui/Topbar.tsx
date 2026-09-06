/** Ports the prototype's `topbar()` (design/nextmove-v1-prototype.html,
 *  lines 2262-2280) and `restartControl()` (2299-2307).
 *
 *  `showBack`/`showRestart` are props, not derived, because Home passes
 *  `topbar(false,false)` — a screen-level choice, not something Topbar can
 *  infer from state.
 *
 *  The account chip's slot renders as nothing here (C7 owns sign-in/save,
 *  not in scope until then).
 *
 *  Task 9's copy sweep: the brand wordmark, back/restart control labels and
 *  the restart-confirm prompt are service-agnostic chrome, so they live in
 *  `SCREEN_COPY.ui` (design note 6) rather than inline here. */
import type { SessionAction } from '../session/session'
import { ICONS } from './icons'
import { UI } from '../screens/screenCopy'

export interface TopbarProps {
  showBack: boolean
  showRestart: boolean
  hasAnswers: boolean
  restartConfirm: boolean
  dispatch: (action: SessionAction) => void
}

export function Topbar({ showBack, showRestart, hasAnswers, restartConfirm, dispatch }: TopbarProps) {
  return (
    <div className="topbar">
      <button className="brand" onClick={() => dispatch({ type: 'RESTART' })}>
        <span className="brand-mark">{ICONS.brandMark}</span>{UI.topbar.brand}
      </button>
      <div className="topctrls">
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
