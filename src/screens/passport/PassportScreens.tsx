/** Ports the prototype's Passport guardrail/out-of-scope/Q1/Q2 screens
 *  (design/nextmove-v1-prototype.html, lines 3202-3216, 3218-3228,
 *  3236-3259, 3340-3356). Recovery lives in ./PassportRecovery.tsx.
 *
 *  Government-process meaning never lives here: these components only ever
 *  decide which screen comes NEXT — structural branching on the value just
 *  picked — never what a value MEANS. That is diagnose()'s job (Task 6),
 *  not called from C3 yet.
 *
 *  `describeBlock` (prototype 3248, 3352) is deliberately not ported here —
 *  it belongs to the "describe it" feature, a later chunk (session.ts's own
 *  design note lists `describe*` among the fields ABSENT on purpose). */
import { Topbar } from '../../ui/Topbar'
import { AnswerRow } from '../../ui/AnswerRow'
import { Split } from '../../ui/Split'
import { PhaseEyebrow } from '../../ui/Crumbs'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS } from '../labels'
import type { ScreenProps } from '../screenProps'
import { hasAnswers } from '../screenProps'

export function PassportGuardrail({ state, dispatch }: ScreenProps) {
  const onSelect = (v: string) => {
    dispatch({ type: 'ANSWER', service: 'passport', key: 'guardrail', value: v })
    dispatch({ type: 'NAVIGATE', screen: v === 'yes' ? 'passport-outofscope' : 'passport-q1' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service="Passport" />
            <h1 className="headline">Already received your passport?</h1>
            <p className="lede">This version of NextMove is designed for applications where the passport hasn't been issued yet. Still waiting on yours? Two quick questions from here, or a few more if you're not sure. That's fine too.</p>
          </>}
          right={
            <div className="answers">
              <AnswerRow value="no" label="No, still waiting on it" selected={state.answers.guardrail === 'no'} onSelect={onSelect} />
              <AnswerRow value="yes" label="Yes, I already have it" selected={state.answers.guardrail === 'yes'} onSelect={onSelect} />
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
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <div className="narrow">
          <Banner>
            This version of NextMove is designed for applications where the passport hasn't been issued yet, and since yours has already arrived, there's nothing here for NextMove to diagnose.
          </Banner>
          <Button variant="secondary" onClick={() => dispatch({ type: 'RESTART' })}>Back to Home</Button>
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
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service="Passport" phase="Understanding your case" />
            <h1 className="headline">What's happening with your application?</h1>
            <p className="lede">Don't worry if you're not sure. Pick the closest option.</p>
          </>}
          right={
            <div className="answers">
              {Object.entries(PASSPORT_Q1_LABELS).map(([v, l]) => (
                <AnswerRow key={v} value={v} label={l} selected={state.answers.q1 === v} onSelect={onSelect} />
              ))}
              <AnswerRow value="not_sure" label="I'm not sure" sub="Show me how to find out" selected={state.answers.q1 === 'not_sure'} onSelect={onSelect} />
            </div>
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
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service="Passport" phase="Last question" />
            <h1 className="headline">Have you already tried to follow up on this?</h1>
          </>}
          right={
            <div className="answers">
              <AnswerRow value="no_followup" label={PASSPORT_Q2_LABELS.no_followup} sub="Most common answer" selected={state.answers.q2 === 'no_followup'} onSelect={onSelect} />
              <AnswerRow value="informal" label={PASSPORT_Q2_LABELS.informal} sub="Call, visit, or portal message" selected={state.answers.q2 === 'informal'} onSelect={onSelect} />
              <AnswerRow value="formal_grievance" label={PASSPORT_Q2_LABELS.formal_grievance} selected={state.answers.q2 === 'formal_grievance'} onSelect={onSelect} />
            </div>
          }
        />
      </div>
    </>
  )
}
