/** Ports the prototype's SIR state-select, unsupported-coverage, and Q1
 *  screens (design/nextmove-v1-prototype.html, lines 3483-3563).
 *  `renderSirReverifying` (3505-3523) is NOT ported — it is C6's freshness
 *  landing, layered on top of this same coverage boundary later without
 *  changing sirCoverage()'s signature.
 *
 *  LOAD-BEARING ORDERING (C2 handoff, stated as a MUST): the router calls
 *  sirCoverage() BEFORE anything else. sirEngine has no coverage gate of its
 *  own — diagnose(sirEngine, {sirState:'bihar', sirQ1:'roll_absent'}) would
 *  happily return a real diagnosis — and optionsForPhase() THROWS for an
 *  unsupported state. So SirState's onSelect below decides the next screen
 *  from sirCoverage() alone, and never calls optionsForPhase, diagnose, or
 *  evaluate: those only ever run once a state has already been routed to
 *  sir-q1, which is only reachable for a covered state. Pinned by
 *  sirFlow.test.tsx's spy test (AC-S-5, C2's deferred guardrail).
 *
 *  Government-process meaning never lives here — see VoterScreens.tsx's
 *  identical note. `describeBlock` is deliberately not ported, same reason
 *  as the other C3 screens. */
import { Topbar } from '../../ui/Topbar'
import { AnswerRow } from '../../ui/AnswerRow'
import { Split } from '../../ui/Split'
import { PhaseEyebrow } from '../../ui/Crumbs'
import { Button } from '../../ui/Button'
import type { ScreenProps } from '../screenProps'
import { hasAnswers } from '../screenProps'
import { SIR_STATES, SIR_Q1_OPTIONS_FOR } from '../../playbooks/sirPlaybook'
import { sirCoverage, optionsForPhase } from '../../domain/sirConfig'
import { UI, SIR_COPY } from '../screenCopy'

export function SirState({ state, dispatch }: ScreenProps) {
  const onSelect = (k: string) => {
    dispatch({ type: 'ANSWER', service: 'sir', key: 'sirState', value: k })
    // The coverage gate, called before anything else — see this file's
    // top-of-file note. Never a `.supported` check inlined here: sirCoverage
    // is the one place that decision is allowed to live.
    const coverage = sirCoverage(SIR_STATES[k])
    dispatch({ type: 'NAVIGATE', screen: coverage === 'covered' ? 'sir-q1' : 'sir-unsupported' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={UI.serviceLabel.voterServices} phase={UI.serviceLabel.sir} />
            <h1 className="headline">{SIR_COPY.state.headline}</h1>
            <p className="lede">{SIR_COPY.state.lede}</p>
          </>}
          right={
            <div className="answers">
              {Object.entries(SIR_STATES).map(([k, s]) => (
                <AnswerRow key={k} value={k} label={s.name} selected={state.answers.sirState === k} onSelect={onSelect} />
              ))}
            </div>
          }
        />
      </div>
    </>
  )
}

export function SirUnsupported({ state, dispatch }: ScreenProps) {
  const st = SIR_STATES[state.answers.sirState]
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <div className="narrow">
          <PhaseEyebrow service={UI.serviceLabel.voterServices} phase={`${UI.serviceLabel.sir} · ${st.name}`} />
          <h2 className="headline">{SIR_COPY.unsupported.headline}</h2>
          <p className="lede">{SIR_COPY.unsupported.lede}</p>
          <div className="nm-field" style={{ borderTop: 'none', paddingTop: 0 }}>
            <div className="nm-k">{SIR_COPY.unsupported.whereToCheck}</div>
            <div className="nm-v">
              <a href="https://voters.eci.gov.in" target="_blank" rel="noopener">{SIR_COPY.unsupported.portalLabel}</a> · <span className="phone">{SIR_COPY.unsupported.helpline}</span>
              <div className="handoff-note">{SIR_COPY.unsupported.handoffNoteLead} {st.name} {SIR_COPY.unsupported.handoffNoteTail}</div>
            </div>
          </div>
          <Button variant="secondary" block onClick={() => dispatch({ type: 'RESTART' })}>{UI.common.backToHome}</Button>
        </div>
      </div>
    </>
  )
}

export function SirQ1({ state, dispatch }: ScreenProps) {
  const st = SIR_STATES[state.answers.sirState]
  // Throws for an unsupported/misconfigured state (sirConfig.ts's own
  // contract) — safe here only because this screen is reachable exclusively
  // via SirState's sirCoverage() gate above, never directly.
  const options = optionsForPhase(st, SIR_Q1_OPTIONS_FOR)
  const onSelect = (v: string) => {
    dispatch({ type: 'ANSWER', service: 'sir', key: 'sirQ1', value: v === 'notsure' ? 'unclassified' : v })
    dispatch({ type: 'NAVIGATE', screen: 'sir-diagnosis' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={`${UI.serviceLabel.sir} · ${st.name}`} phase={UI.phase.justOneQuestion} />
            <h1 className="headline">{SIR_COPY.q1.headline}</h1>
            <p className="lede">{st.name} {SIR_COPY.q1.ledeConnective} {st.phase!.label}. {SIR_COPY.q1.ledeTail}</p>
          </>}
          right={
            <div className="answers">
              {Object.entries(options).map(([v, l]) => (
                <AnswerRow key={v} value={v} label={l} selected={state.answers.sirQ1 === v} onSelect={onSelect} />
              ))}
              {/* "I'm not sure" is appended OUTSIDE the phase option set, by
                 design (sirConfig.ts's own optionsForPhase docblock) — never
                 phase-gate the escape hatch. */}
              <AnswerRow value="notsure" label={SIR_COPY.q1.notSure} selected={state.answers.sirQ1 === 'unclassified'} onSelect={onSelect} />
            </div>
          }
        />
      </div>
    </>
  )
}
