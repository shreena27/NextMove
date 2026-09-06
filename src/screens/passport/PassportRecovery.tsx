/** Ports the prototype's Passport recovery screens (design/nextmove-v1-
 *  prototype.html, lines 3260-3339) plus the paste-matching data/logic
 *  (3289-3328).
 *
 *  RECORDED DEVIATION: `matchPasted()` is an authored refactor. The
 *  prototype has no such function — it has `pasteMatch()` (3320-3328), an
 *  *action* that reads `S.recoveryText`, writes answers, and navigates, all
 *  in one impure step. C3 splits the pure decision —
 *  `matchPasted(input) -> {q1} | {outOfScope:true} | null` — out of those
 *  side effects, so the AC-5 regressions can be pinned without rendering
 *  anything. The matching logic itself — exact match over normalised text,
 *  NEVER a substring test — is transcribed unchanged. */
import { Topbar } from '../../ui/Topbar'
import { AnswerRow } from '../../ui/AnswerRow'
import { Split } from '../../ui/Split'
import { PhaseEyebrow } from '../../ui/Crumbs'
import { Button } from '../../ui/Button'
import type { ScreenProps } from '../screenProps'
import { hasAnswers } from '../screenProps'
import { UI, PASSPORT_COPY } from '../screenCopy'

// A very small, explicit, exact-match set of example status phrases —
// deliberately not loose keyword matching. Fixed 2026-09-04: the previous
// version matched on the bare substring "verif", which meant a status like
// "verification completed" and one like "verification incomplete" both hit
// the same branch — a real misclassification risk. Anything that isn't an
// exact match against one of these three examples resolves to UNCLASSIFIED
// (q1 stays 'not_sure') rather than guessing. "If we don't know, we don't
// guess" — matching more phrases "intelligently" is not a goal here.
// Transcribed verbatim from design/nextmove-v1-prototype.html, line 3297.
type PasteExample = { text: string; q1: string } | { text: string; outOfScope: true }

export const PASTE_MATCH_EXAMPLES: PasteExample[] = [
  { text: 'police verification report has been received', q1: 'verified_no_progress' },
  { text: 'passport has been dispatched', outOfScope: true },
  { text: 'application has adverse report', q1: 'adverse' },
]

export function normalizePasted(t: string): string {
  return (t || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** The pure decision the prototype's `pasteMatch()` (3320-3328) conflates
 *  with side effects (`setAns` + `nav`). Exact match over normalised text
 *  ONLY — never a substring test; the retired bare-substring `'verif'`
 *  match must never reappear in any form. Returns `null` when nothing
 *  matches; the caller decides what happens next (`recoveryPastedText` is
 *  always written first, matched or not — see `PassportRecoveryPaste`). */
export function matchPasted(raw: string): { q1: string } | { outOfScope: true } | null {
  const t = normalizePasted(raw)
  const found = PASTE_MATCH_EXAMPLES.find(e => e.text === t)
  if (!found) return null
  return 'outOfScope' in found ? { outOfScope: true } : { q1: found.q1 }
}

export function PassportRecovery({ state, dispatch }: ScreenProps) {
  const choose = (v: string) => {
    if (v === 'paste') { dispatch({ type: 'NAVIGATE', screen: 'passport-recovery-paste' }); return }
    if (v === 'show') { dispatch({ type: 'NAVIGATE', screen: 'passport-recovery-show' }); return }
    // "Tell me the safest thing to do now" — q1 is deliberately left as
    // 'not_sure' rather than overwritten with a sentinel. 'not_sure' matches
    // no passportPlaybook rule condition, so evaluate() already falls
    // through to the UNCLASSIFIED fallback on its own — no separate
    // "recovery_safest" value is needed, and the real given answer ("I'm
    // not sure") stays intact for the trust disclosure to show honestly.
    dispatch({ type: 'ANSWER', service: 'passport', key: 'recoveryAskedSafest', value: 'yes' })
    dispatch({ type: 'NAVIGATE', screen: 'passport-diagnosis' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={UI.serviceLabel.passport} />
            <h2 className="headline">{PASSPORT_COPY.recovery.headline}</h2>
          </>}
          right={
            <div className="answers">
              {/* `state.answers.recovery` is intentionally dead: nothing in
                  this file (or anywhere else) ever writes a 'recovery' key
                  to answers, so these `selected` checks never match. Kept
                  as a faithful transcription of the same dead check in the
                  locked prototype — not a bug to wire up. */}
              <AnswerRow value="paste" label={PASSPORT_COPY.recovery.paste} sub={PASSPORT_COPY.recovery.pasteSub} selected={state.answers.recovery === 'paste'} onSelect={choose} />
              <AnswerRow value="show" label={PASSPORT_COPY.recovery.show} selected={state.answers.recovery === 'show'} onSelect={choose} />
              <AnswerRow value="safest" label={PASSPORT_COPY.recovery.safest} selected={state.answers.recovery === 'safest'} onSelect={choose} />
            </div>
          }
        />
      </div>
    </>
  )
}

export function PassportRecoveryPaste({ state, dispatch }: ScreenProps) {
  const submit = () => {
    const raw = state.recoveryText
    // Written BEFORE the no-match early return — load-bearing ordering
    // (prototype 3323, before the no-match return on 3324). This is what
    // lets the trust panel echo what the citizen actually pasted on the
    // very path where NextMove could not place them.
    dispatch({ type: 'ANSWER', service: 'passport', key: 'recoveryPastedText', value: raw || '' })
    const match = matchPasted(raw)
    if (!match) { dispatch({ type: 'NAVIGATE', screen: 'passport-diagnosis' }); return } // no exact match -> stays 'not_sure' -> UNCLASSIFIED
    if ('outOfScope' in match) {
      dispatch({ type: 'ANSWER', service: 'passport', key: 'guardrail', value: 'yes' })
      dispatch({ type: 'NAVIGATE', screen: 'passport-outofscope' })
      return
    }
    dispatch({ type: 'ANSWER', service: 'passport', key: 'q1', value: match.q1 })
    dispatch({ type: 'NAVIGATE', screen: 'passport-q2' })
  }
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <Split
          left={<>
            <PhaseEyebrow service={UI.serviceLabel.passport} phase={UI.phase.recovery} />
            <h2 className="headline">{PASSPORT_COPY.recoveryPaste.headline}</h2>
            <p className="lede">{PASSPORT_COPY.recoveryPaste.lede}</p>
          </>}
          right={<>
            <div className="inline-explain-actions" style={{ margin: '0 0 16px' }}>
              {PASTE_MATCH_EXAMPLES.map(e => (
                <Button
                  key={e.text}
                  variant="secondary"
                  style={{ textTransform: 'capitalize' }}
                  onClick={() => dispatch({ type: 'SET_RECOVERY_TEXT', text: e.text })}
                >
                  "{e.text}"
                </Button>
              ))}
            </div>
            <textarea
              className="field-input"
              placeholder={PASSPORT_COPY.recoveryPaste.placeholder}
              value={state.recoveryText}
              onChange={(e) => dispatch({ type: 'SET_RECOVERY_TEXT', text: e.target.value })}
            />
            <Button block arrow onClick={submit}>{PASSPORT_COPY.recoveryPaste.continue}</Button>
          </>}
        />
      </div>
    </>
  )
}

export function PassportRecoveryShow({ state, dispatch }: ScreenProps) {
  return (
    <>
      <Topbar showBack showRestart hasAnswers={hasAnswers(state)} restartConfirm={state.restartConfirm} dispatch={dispatch} />
      <div className="stage screen">
        <div className="narrow">
          <PhaseEyebrow service={UI.serviceLabel.passport} phase={UI.phase.recovery} />
          <h2 className="headline">{PASSPORT_COPY.recoveryShow.headline}</h2>
          <p className="lede">{PASSPORT_COPY.recoveryShow.ledeLead} <b>{PASSPORT_COPY.recoveryShow.ledeBold}</b> {PASSPORT_COPY.recoveryShow.ledeTail}</p>
          {/* line 3336 (not 3339 — 3339 is renderPassportRecoveryShow's closing
             brace): the recovery detour must not stack in history. */}
          <Button block arrow onClick={() => dispatch({ type: 'NAVIGATE', screen: 'passport-q1', replace: true })}>
            {PASSPORT_COPY.recoveryShow.cta}
          </Button>
        </div>
      </div>
    </>
  )
}
