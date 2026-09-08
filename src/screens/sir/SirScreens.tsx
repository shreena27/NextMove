/** Ports the prototype's SIR state-select, unsupported-coverage, and Q1
 *  screens (design/nextmove-v1-prototype.html, lines 3483-3563), plus
 *  (C6) `renderSirReverifying` (3505-3523) — the source-freshness landing
 *  layered on top of this same coverage boundary, without changing
 *  sirCoverage()'s own signature (its own header comment named this exact
 *  extension point).
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
 *  C6 EXTENDS this same onSelect, never a second gate elsewhere: a
 *  COVERED state additionally routes to 'sir-reverifying' instead of
 *  'sir-q1' when degradedFor(sirPlaybook.rules) is true (prototype's
 *  sirStateAnswer, 3497-3501, checks both in the same function) — an
 *  unsupported state still always routes to 'sir-unsupported' regardless
 *  of freshness, exactly as the prototype's own `if` ordering does
 *  (freshness is only ever checked for an already-supported state).
 *
 *  Government-process meaning never lives here — see VoterScreens.tsx's
 *  identical note. `describeBlock` is mounted at the tail of `SirQ1`'s own
 *  `.answers` list, inside the same `right` slot (C8, Task 11) —
 *  unconditionally, same convention as the other five mount sites. There
 *  is no `SirQ2` — SIR's chain has only one describable entry screen
 *  (`domain/interpret.ts`'s own `DESCRIBE_CHAINS['sir-q1']`). */
import { Topbar } from '../../ui/Topbar'
import { AnswerRow } from '../../ui/AnswerRow'
import { Split } from '../../ui/Split'
import { PhaseEyebrow } from '../../ui/Crumbs'
import { Button } from '../../ui/Button'
import { DescribeBlock } from '../../templates/DescribeBlock'
import type { ScreenProps } from '../screenProps'
import { hasAnswers } from '../screenProps'
import { SIR_STATES, SIR_Q1_OPTIONS_FOR, sirPlaybook } from '../../playbooks/sirPlaybook'
import { sirCoverage, optionsForPhase } from '../../domain/sirConfig'
import { degradedFor, changedOnFor } from '../../domain/freshness'
import { UI, SIR_COPY } from '../screenCopy'
import { SOURCES_VERIFIED } from '../../templates/TrustDisclosure'

export function SirState({ state, dispatch }: ScreenProps) {
  const onSelect = (k: string) => {
    dispatch({ type: 'ANSWER', service: 'sir', key: 'sirState', value: k })
    // The coverage gate, called before anything else — see this file's
    // top-of-file note. Never a `.supported` check inlined here: sirCoverage
    // is the one place that decision is allowed to live.
    const coverage = sirCoverage(SIR_STATES[k])
    const screen =
      coverage !== 'covered' ? 'sir-unsupported'
      : degradedFor(sirPlaybook.rules) ? 'sir-reverifying'
      : 'sir-q1'
    dispatch({ type: 'NAVIGATE', screen })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
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
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
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

/** C6: the freshness landing for an otherwise-covered state (prototype
 *  `renderSirReverifying`, 3505-3523) — reachable only via SirState's
 *  onSelect above, never directly, so `changedOnFor` always finds at least
 *  one changed document here (that's WHY onSelect routed here). Falls back
 *  to null only if this screen were somehow reached with a state answered
 *  differently since — a same-shape fallback to '' matches how the
 *  prototype's own template interpolation has no null-guard either. */
export function SirReverifying({ state, dispatch }: ScreenProps) {
  const st = SIR_STATES[state.answers.sirState]
  const changedOn = changedOnFor(sirPlaybook.rules) ?? ''
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
      <div className="stage screen">
        <div className="narrow">
          <PhaseEyebrow service={UI.serviceLabel.voterServices} phase={`${UI.serviceLabel.sir} · ${st.name}`} />
          <h2 className="headline">{SIR_COPY.reverifying.headline.replace('{state}', st.name)}</h2>
          <p className="lede">
            {SIR_COPY.reverifying.lede.replace('{state}', st.name).replace('{date}', changedOn)}
          </p>
          <div className="nm-field" style={{ borderTop: 'none', paddingTop: 0 }}>
            <div className="nm-k">{SIR_COPY.reverifying.whereToCheck}</div>
            <div className="nm-v">
              <a href="https://voters.eci.gov.in" target="_blank" rel="noopener">{SIR_COPY.reverifying.portalLabel}</a> · <span className="phone">{SIR_COPY.reverifying.helpline}</span>
              <div className="handoff-note">{SIR_COPY.reverifying.handoffNote}</div>
            </div>
          </div>
          <p className="small" style={{ marginTop: 14 }}>
            {SIR_COPY.reverifying.verifiedNote.replace('{date}', SOURCES_VERIFIED)}
          </p>
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
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={`${UI.serviceLabel.sir} · ${st.name}`} phase={UI.phase.justOneQuestion} />
            <h1 className="headline">{SIR_COPY.q1.headline}</h1>
            <p className="lede">{st.name} {SIR_COPY.q1.ledeConnective} {st.phase!.label}. {SIR_COPY.q1.ledeTail}</p>
          </>}
          right={
            <>
              <div className="answers">
                {Object.entries(options).map(([v, l]) => (
                  <AnswerRow key={v} value={v} label={l} selected={state.answers.sirQ1 === v} onSelect={onSelect} />
                ))}
                {/* "I'm not sure" is appended OUTSIDE the phase option set, by
                   design (sirConfig.ts's own optionsForPhase docblock) — never
                   phase-gate the escape hatch. */}
                <AnswerRow value="notsure" label={SIR_COPY.q1.notSure} selected={state.answers.sirQ1 === 'unclassified'} onSelect={onSelect} />
              </div>
              <DescribeBlock screenId="sir-q1" state={state} dispatch={dispatch} />
            </>
          }
        />
      </div>
    </>
  )
}
