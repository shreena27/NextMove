/** Ports the prototype's Passport guardrail/out-of-scope/Q1/Q2 screens
 *  (design/nextmove-v1-prototype.html, lines 3202-3216, 3218-3228,
 *  3236-3259, 3340-3356). Recovery lives in ./PassportRecovery.tsx.
 *
 *  Government-process meaning never lives here: these components only ever
 *  decide which screen comes NEXT — structural branching on the value just
 *  picked — never what a value MEANS. That is diagnose()'s job (Task 6),
 *  not called from C3 yet.
 *
 *  `describeBlock` (prototype 3248, 3352) is mounted at the tail of both
 *  Q1 and Q2's own `.answers` list, inside the same `right` slot (C8, Task
 *  11) — unconditionally: every bit of gating (the flag, the chain lookup,
 *  quota exhaustion) lives inside `DescribeBlock` itself, never as a
 *  wrapping condition here. */
import { Topbar } from '../../ui/Topbar'
import { AnswerRow } from '../../ui/AnswerRow'
import { Split } from '../../ui/Split'
import { PhaseEyebrow } from '../../ui/Crumbs'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { DescribeBlock } from '../../templates/DescribeBlock'
import { PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS } from '../labels'
import type { ScreenProps } from '../screenProps'
import { hasAnswers } from '../screenProps'
import { UI, PASSPORT_COPY } from '../screenCopy'

export function PassportGuardrail({ state, dispatch }: ScreenProps) {
  const onSelect = (v: string) => {
    dispatch({ type: 'ANSWER', service: 'passport', key: 'guardrail', value: v })
    dispatch({ type: 'NAVIGATE', screen: v === 'yes' ? 'passport-outofscope' : 'passport-q1' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={UI.serviceLabel.passport} />
            <h1 className="headline">{PASSPORT_COPY.guardrail.headline}</h1>
            <p className="lede">{PASSPORT_COPY.guardrail.lede}</p>
          </>}
          right={
            <div className="answers">
              <AnswerRow value="no" label={PASSPORT_COPY.guardrail.no} selected={state.answers.guardrail === 'no'} onSelect={onSelect} />
              <AnswerRow value="yes" label={PASSPORT_COPY.guardrail.yes} selected={state.answers.guardrail === 'yes'} onSelect={onSelect} />
            </div>
          }
        />
      </div>
    </>
  )
}

export function PassportOutOfScope({ state, dispatch }: ScreenProps) {
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
      <div className="stage screen">
        <div className="narrow">
          <Banner>
            {PASSPORT_COPY.outOfScope.banner}
          </Banner>
          <Button variant="secondary" onClick={() => dispatch({ type: 'RESTART' })}>{UI.common.backToHome}</Button>
        </div>
      </div>
    </>
  )
}

export function PassportQ1({ state, dispatch }: ScreenProps) {
  const onSelect = (v: string) => {
    // Locked behavior (PRD FR-22/AC-8): a genuinely changed Q1 answer clears
    // the previously-given Q2 answer, so a stale follow-up answer belonging
    // to a different case-stage can never carry into a new diagnosis. That
    // clearing is applyCorrection + PASSPORT_DEPS (q1 -> [q2]), already
    // wired into the ANSWER action — nothing extra to do here.
    dispatch({ type: 'ANSWER', service: 'passport', key: 'q1', value: v })
    dispatch({ type: 'NAVIGATE', screen: v === 'not_sure' ? 'passport-recovery' : 'passport-q2' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={UI.serviceLabel.passport} phase={UI.phase.understandingYourCase} />
            <h1 className="headline">{PASSPORT_COPY.q1.headline}</h1>
            <p className="lede">{PASSPORT_COPY.q1.lede}</p>
          </>}
          right={
            <>
              <div className="answers">
                {Object.entries(PASSPORT_Q1_LABELS).map(([v, l]) => (
                  <AnswerRow key={v} value={v} label={l} selected={state.answers.q1 === v} onSelect={onSelect} />
                ))}
                <AnswerRow value="not_sure" label={PASSPORT_COPY.q1.notSure} sub={PASSPORT_COPY.q1.notSureSub} selected={state.answers.q1 === 'not_sure'} onSelect={onSelect} />
              </div>
              <DescribeBlock screenId="passport-q1" state={state} dispatch={dispatch} />
            </>
          }
        />
      </div>
    </>
  )
}

export function PassportQ2({ state, dispatch }: ScreenProps) {
  const onSelect = (v: string) => {
    dispatch({ type: 'ANSWER', service: 'passport', key: 'q2', value: v })
    dispatch({ type: 'NAVIGATE', screen: 'passport-diagnosis' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={UI.serviceLabel.passport} phase={UI.phase.lastQuestion} />
            <h1 className="headline">{PASSPORT_COPY.q2.headline}</h1>
          </>}
          right={
            <>
              <div className="answers">
                <AnswerRow value="no_followup" label={PASSPORT_Q2_LABELS.no_followup} sub={PASSPORT_COPY.q2.noFollowupSub} selected={state.answers.q2 === 'no_followup'} onSelect={onSelect} />
                <AnswerRow value="informal" label={PASSPORT_Q2_LABELS.informal} sub={PASSPORT_COPY.q2.informalSub} selected={state.answers.q2 === 'informal'} onSelect={onSelect} />
                <AnswerRow value="formal_grievance" label={PASSPORT_Q2_LABELS.formal_grievance} selected={state.answers.q2 === 'formal_grievance'} onSelect={onSelect} />
              </div>
              <DescribeBlock screenId="passport-q2" state={state} dispatch={dispatch} />
            </>
          }
        />
      </div>
    </>
  )
}
