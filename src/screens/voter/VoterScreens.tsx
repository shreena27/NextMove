/** Ports the prototype's Voter Services entry/Q1/Q2 screens (design/nextmove-
 *  v1-prototype.html, lines 3380-3470).
 *
 *  Government-process meaning never lives here: these components only ever
 *  decide which screen comes NEXT — structural branching on the value just
 *  picked — never what a value MEANS. That is diagnose()'s job (Task 6),
 *  not called from C3 yet.
 *
 *  The raw/normalized answer split (design notes, C3's own addition): the
 *  screen writes voterAppealedRaw with the literal pick (including
 *  'notsure') so the trust disclosure can echo it honestly, and
 *  voterAppealed/voterQ1 with 'notsure' normalized to 'unclassified', which
 *  is what the playbook actually reads. Two ANSWER dispatches, one
 *  correction: VOTER_DEPS maps voterQ1 -> [voterAppealed, voterAppealedRaw],
 *  and neither of those has its own dependents, so dispatch order between
 *  the raw and normalized writes is safe either way.
 *
 *  `describeBlock` is mounted at the tail of all three screens' own
 *  `.answers` list, inside the same `right` slot (C8, Task 11) —
 *  unconditionally, same convention as PassportScreens.tsx's own mounts. */
import { Topbar } from '../../ui/Topbar'
import { AnswerRow } from '../../ui/AnswerRow'
import { Split } from '../../ui/Split'
import { PhaseEyebrow } from '../../ui/Crumbs'
import { DescribeBlock } from '../../templates/DescribeBlock'
import type { ScreenProps } from '../screenProps'
import { hasAnswers } from '../screenProps'
import { VOTER_Q1_LABELS, VOTER_APPEAL_LABELS } from '../labels'
import { UI, VOTER_COPY } from '../screenCopy'

export function VoterEntry({ state, dispatch }: ScreenProps) {
  const onSelect = (v: string) => {
    // AC-V-2: "I'm not sure" explains in place. No navigation, no answer
    // written — the entry choice itself is never stored (the prototype's
    // voterEntryAnswer never calls setAns for 'applied'/'sir' either; only
    // the inline-explainer flag is state, and that lives on SessionState
    // directly, not in answers — see session.ts's voterEntryExplain note).
    if (v === 'notsure') { dispatch({ type: 'EXPLAIN_VOTER_ENTRY' }); return }
    dispatch({ type: 'NAVIGATE', screen: v === 'sir' ? 'sir-state' : 'voter-q1' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={UI.serviceLabel.voterServices} />
            <h1 className="headline">{VOTER_COPY.entry.headline}</h1>
          </>}
          right={
            <>
              <div className="answers">
                <AnswerRow value="applied" label={VOTER_COPY.entry.applied} sub={VOTER_COPY.entry.appliedSub} selected={false} onSelect={onSelect} />
                <AnswerRow value="sir" label={VOTER_COPY.entry.sir} sub={VOTER_COPY.entry.sirSub} selected={false} onSelect={onSelect} />
                <AnswerRow value="notsure" label={VOTER_COPY.entry.notSure} selected={false} onSelect={onSelect} />
              </div>
              <DescribeBlock screenId="voter-entry" state={state} dispatch={dispatch} />
            </>
          }
        />
        {state.voterEntryExplain && (
          <div className="inline-explain">
            <b>{VOTER_COPY.entry.explain.regularLabel}</b>{VOTER_COPY.entry.explain.regularText}<br /><br />
            <b>{VOTER_COPY.entry.explain.sirLabel}</b>{VOTER_COPY.entry.explain.sirText}
            <div className="inline-explain-actions">
              <button className="btn btn-secondary" onClick={() => onSelect('applied')}>{VOTER_COPY.entry.explain.regularCta}</button>
              <button className="btn btn-secondary" onClick={() => onSelect('sir')}>{VOTER_COPY.entry.explain.sirCta}</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export function VoterQ1({ state, dispatch }: ScreenProps) {
  const onSelect = (v: string) => {
    // A changed Q1 answer clears the (Q1-dependent) appeal follow-up answer
    // (VOTER_DEPS, applied generically by the ANSWER action) — same
    // principle as Passport's Q1->Q2 reset. Comparing happens on the
    // NORMALIZED value already stored, so repeatedly re-picking "not sure"
    // (or re-picking "decision" while already on "decision") is a no-op,
    // not a "change", and the appeal answer survives.
    const normalized = v === 'notsure' ? 'unclassified' : v
    dispatch({ type: 'ANSWER', service: 'voter', key: 'voterQ1', value: normalized })
    dispatch({ type: 'NAVIGATE', screen: v === 'decision' ? 'voter-q2' : 'voter-diagnosis' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={UI.serviceLabel.voterServices} phase={UI.phase.understandingYourCase} />
            <h1 className="headline">{VOTER_COPY.q1.headline}</h1>
          </>}
          right={
            <>
              <div className="answers">
                {Object.entries(VOTER_Q1_LABELS).map(([v, l]) => (
                  <AnswerRow key={v} value={v} label={l} selected={state.answers.voterQ1 === v} onSelect={onSelect} />
                ))}
                <AnswerRow value="notsure" label={VOTER_COPY.q1.notSure} selected={state.answers.voterQ1 === 'unclassified'} onSelect={onSelect} />
              </div>
              <DescribeBlock screenId="voter-q1" state={state} dispatch={dispatch} />
            </>
          }
        />
      </div>
    </>
  )
}

export function VoterQ2({ state, dispatch }: ScreenProps) {
  const onSelect = (v: string) => {
    // Written BEFORE the normalized value — load-bearing ordering (mirrors
    // PassportRecoveryPaste's recoveryPastedText-before-match note): the
    // raw pick is what the trust disclosure echoes.
    dispatch({ type: 'ANSWER', service: 'voter', key: 'voterAppealedRaw', value: v })
    dispatch({ type: 'ANSWER', service: 'voter', key: 'voterAppealed', value: v === 'notsure' ? 'unclassified' : v })
    dispatch({ type: 'NAVIGATE', screen: 'voter-diagnosis' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} state={state} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={UI.serviceLabel.voterServices} phase={UI.phase.lastQuestion} />
            <h1 className="headline">{VOTER_COPY.q2.headline}</h1>
          </>}
          right={
            <>
              <div className="answers">
                {Object.entries(VOTER_APPEAL_LABELS).map(([v, l]) => (
                  <AnswerRow key={v} value={v} label={l} selected={state.answers.voterAppealedRaw === v} onSelect={onSelect} />
                ))}
              </div>
              <DescribeBlock screenId="voter-q2" state={state} dispatch={dispatch} />
            </>
          }
        />
      </div>
    </>
  )
}
