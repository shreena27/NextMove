/** Ports the prototype's `renderHome` (design/nextmove-v1-prototype.html,
 *  lines 3136-3171), including the `savedCard`/`home-cases` casefiles
 *  section (Task 11; design note 5). Home renders `topbar(false,false)`:
 *  no Back, no Restart — it is the app's clean-slate landing screen.
 *
 *  The casefiles section slots in at the seam this file always carried,
 *  immediately after the three service rows, inside the right column:
 *  `open`/`closed` split by `c.outcome`, open cases first (with a
 *  singular/plural `.list-lead`), closed cases below their own `Closed`
 *  lead. The whole `.home-cases` wrapper is omitted entirely when both
 *  lists are empty — never an empty wrapper div, which would add a stray
 *  layout gap on every citizen's Home screen who has no saved cases (the
 *  common case, pre-Task-11 and for a while after).
 *
 *  `now` (D6, `now?: number`, static `0` default): `CaseCard` needs the
 *  clock for `daysAgo` (see that file's own header note) and REQUIRES it
 *  — never a `Date.now()` default inside a component, which oxlint's
 *  react(purity) rule flags as impure. Optional here, with a plain
 *  constant fallback (never `Date.now()`), only because App.tsx's router
 *  wiring (Task 13) does not supply it yet — and `state.savedCases` is
 *  always `[]` through every currently-reachable path (no screen yet
 *  writes to it via the real UI, since none of BEGIN_SAVE, the check-in
 *  actions, or the casefile screen is routed in App.tsx's switch until
 *  Task 13), so this fallback is never actually exercised today. Task 13
 *  will pass the real clock the same way it already will for
 *  CasefileScreen. */
import { Topbar } from '../ui/Topbar'
import { Gems } from '../ui/Gems'
import { Split } from '../ui/Split'
import { ICONS } from '../ui/icons'
import { CaseCard } from '../templates/CaseCard'
import type { ScreenProps } from './screenProps'
import { hasAnswers } from './screenProps'
import { UI } from './screenCopy'

export interface HomeProps extends ScreenProps {
  now?: number
}

export function Home({ state, dispatch, now = 0 }: HomeProps) {
  const open = state.savedCases.filter(c => c.outcome === 'still_open')
  const closed = state.savedCases.filter(c => c.outcome !== 'still_open')
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
            {open.length || closed.length ? (
              <div className="home-cases">
                {open.length ? (
                  <>
                    <p className="list-lead">
                      {(open.length > 1 ? UI.home.casefilesMany : UI.home.casefilesOne).replace('{n}', String(open.length))}
                    </p>
                    {open.map(c => (
                      <CaseCard
                        key={c.id} case={c} now={now}
                        onOpen={() => dispatch({ type: 'OPEN_CHECKIN', id: c.id })}
                      />
                    ))}
                  </>
                ) : null}
                {closed.length ? (
                  <>
                    <p className="list-lead" style={{ color: 'var(--ink-soft)', fontSize: 16 }}>
                      {UI.home.closedLead}
                    </p>
                    {closed.map(c => (
                      <CaseCard
                        key={c.id} case={c} now={now}
                        onOpen={() => dispatch({ type: 'OPEN_CHECKIN', id: c.id })}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            ) : null}
          </>}
        />
      </div>
    </>
  )
}
