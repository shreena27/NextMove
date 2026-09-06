/** Ports the prototype's `renderOtherServices` (design/nextmove-v1-
 *  prototype.html, lines 3176-3199) — Home's "Other services" roadmap peek.
 *  Everything here is a signal, not a feature: these processes are OUT of
 *  V1 build scope, so the rows are inert Coming Soon markers rendered as
 *  `<div class="svc disabled">`, never `<button>`s — nothing here is
 *  tappable, and nothing may become tappable. */
import { Topbar } from '../ui/Topbar'
import { Split } from '../ui/Split'
import { Crumbs } from '../ui/Crumbs'
import { Button } from '../ui/Button'
import { ICONS } from '../ui/icons'
import type { ScreenProps } from './screenProps'
import { hasAnswers } from './screenProps'
import { UI } from './screenCopy'

function ComingSoonRow({ name }: { name: string }) {
  return (
    <div className="svc disabled">
      <span className="svc-icon ic-income">{ICONS.certificate}</span>
      <span className="svc-body"><div className="svc-title">{name}</div></span>
      <span className="svc-tag">{UI.otherServices.tag}</span>
    </div>
  )
}

export function OtherServices({ state, dispatch }: ScreenProps) {
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <Crumbs parts={[UI.otherServices.crumb]} sqClass="sq-butter" />
            <h1 className="headline">{UI.otherServices.headline}</h1>
            <p className="lede">{UI.otherServices.lede}</p>
          </>}
          right={<>
            <p className="list-lead">{UI.otherServices.listLead}</p>
            <div className="services">
              <ComingSoonRow name={UI.otherServices.cert.income} />
              <ComingSoonRow name={UI.otherServices.cert.caste} />
              <ComingSoonRow name={UI.otherServices.cert.ews} />
              <ComingSoonRow name={UI.otherServices.cert.domicile} />
            </div>
            <Button variant="secondary" style={{ marginTop: 26 }} onClick={() => dispatch({ type: 'RESTART' })}>
              {UI.common.backToHome}
            </Button>
          </>}
        />
      </div>
    </>
  )
}
