/** Ports the prototype's `renderHome` (design/nextmove-v1-prototype.html,
 *  lines 3136-3171), minus the `savedCard`/`home-cases` casefiles section —
 *  Home ships without casefiles in C3 (C5's own section; recorded deviation
 *  in the task brief). Home renders `topbar(false,false)`: no Back, no
 *  Restart — it is the app's clean-slate landing screen.
 *
 *  INSERTION POINT FOR C5: the casefiles section (`savedCard`/`home-cases`)
 *  slots in here, immediately after the three service rows, inside the
 *  right column. */
import { Topbar } from '../ui/Topbar'
import { Gems } from '../ui/Gems'
import { Split } from '../ui/Split'
import { ICONS } from '../ui/icons'
import type { ScreenProps } from './screenProps'
import { hasAnswers } from './screenProps'
import { UI } from './screenCopy'

export function Home({ state, dispatch }: ScreenProps) {
  return (
    <>
      <Topbar showBack={false} showRestart={false} hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <Gems placement="hero" />
            <h1 className="hero-h1">
              {UI.home.hero.lead} <span className="mark">{UI.home.hero.mark}</span>.<br />
              {UI.home.hero.line2}
            </h1>
            <p className="hero-promise">{UI.home.heroPromise}</p>
          </>}
          right={<>
            <p className="list-lead">{UI.home.listLead}</p>
            <div className="services">
              <button className="svc" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'passport-guardrail' })}>
                <span className="svc-icon ic-passport">{ICONS.passport}</span>
                <span className="svc-body">
                  <div className="svc-title">{UI.home.svc.passport.title}</div>
                  <div className="svc-sub">{UI.home.svc.passport.sub}</div>
                </span>
                <span className="svc-chevron">{ICONS.chevron}</span>
              </button>
              <button className="svc" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'voter-entry' })}>
                <span className="svc-icon ic-voter">{ICONS.voter}</span>
                <span className="svc-body">
                  <div className="svc-title">{UI.home.svc.voter.title}</div>
                  <div className="svc-sub">{UI.home.svc.voter.sub}</div>
                </span>
                <span className="svc-chevron">{ICONS.chevron}</span>
              </button>
              <button className="svc" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'other-services' })}>
                <span className="svc-icon ic-other">{ICONS.grid}</span>
                <span className="svc-body">
                  <div className="svc-title">{UI.home.svc.other.title}</div>
                  <div className="svc-sub">{UI.home.svc.other.sub}</div>
                </span>
                <span className="svc-chevron">{ICONS.chevron}</span>
              </button>
            </div>
          </>}
        />
      </div>
    </>
  )
}
