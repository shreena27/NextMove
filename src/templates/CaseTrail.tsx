/** Ports the prototype's `PASSPORT_STEPS_FOR` (design/nextmove-v1-
 *  prototype.html, lines 3366-3378) and `renderTimeline` (3612-3620).
 *
 *  The case trail is Passport-only (FR-V-10). Voter's and SIR's diagnoses
 *  carry state ids (e.g. 'V-1', 'S-4') that never collide with `STATE_INDEX`
 *  below, so the direct-state lookup alone is safe for any service. The
 *  STAGE fallback (`d.matchedAnswers.q1`) is NOT safe on its own, though:
 *  `matchedAnswers` is a snapshot of the whole session answer record (see
 *  `evaluate.ts`), not just the current service's, and session answers are
 *  cleared only by RESTART — not BACK or NAVIGATE. A citizen who touches
 *  Passport's `q1` earlier in the same session, then completes a Voter or
 *  SIR diagnosis, produces a `matchedAnswers` that still carries that stale
 *  `q1`, which this file's own maps cannot tell apart from a real Passport
 *  answer. FIX ROUND 1 (Important #1): the caller (DiagnosisScreen.tsx)
 *  now gates the call to `passportTrailFor` on `engineKey === 'passport'`
 *  as the actual safeguard — structural branching the plan's Global
 *  Constraints already permit ("does this service have a case trail?"),
 *  not a new exception. `passportTrailFor` itself is written defensively
 *  (the state-id check is self-sufficient; the stage fallback is not) but
 *  must not be relied on alone to keep the trail off a non-Passport screen.
 *
 *  Task 9's copy sweep: the step labels and the "You are here" marker are
 *  authored, citizen-facing strings, so they live in
 *  `PASSPORT_COPY.caseTrail` (screenCopy.ts) rather than inline here.
 */
import type { Diagnosis } from '../domain/types'
import { PASSPORT_COPY } from '../screens/screenCopy'

export interface CaseTrailData {
  steps: string[]
  current: number
}

const STEPS = [
  PASSPORT_COPY.caseTrail.steps.application,
  PASSPORT_COPY.caseTrail.steps.appointment,
  PASSPORT_COPY.caseTrail.steps.policeVerification,
  PASSPORT_COPY.caseTrail.steps.processing,
]

// Base states place directly; ladder-rung states (5a/5b and their
// pending/resolved variants) place via the STAGE answer (q1) instead, so the
// trail keeps showing WHERE the case is stuck even after follow-ups begin —
// the stage dimension, kept visible (same rationale as decorateStageRung).
const STATE_INDEX: Record<string, number> = { '1': 2, '2': 2, '4': 2, '3': 3 }
const STAGE_INDEX: Record<string, number> = {
  no_contact: 2,
  contacted_incomplete: 2,
  adverse: 2,
  verified_no_progress: 3,
}

/** `null` -> no trail: the fallback state ('6'), or a state/stage this map
 *  has no entry for. Callers outside Passport must gate on `engineKey`
 *  themselves before calling this (see the file header) — the stage
 *  fallback here cannot distinguish a real Passport answer from a stale one
 *  left over from earlier in the same session. */
export function passportTrailFor(d: Diagnosis): CaseTrailData | null {
  if (d.state === '6') return null
  const byState = STATE_INDEX[d.state]
  const stage = d.matchedAnswers.q1
  const byStage = stage !== undefined ? STAGE_INDEX[stage] : undefined
  const idx = byState ?? byStage
  return idx === undefined ? null : { steps: STEPS, current: idx }
}

export function CaseTrail({ trail }: { trail: CaseTrailData }) {
  return (
    <div className="case-trail">
      {trail.steps.map((step, i) => {
        const isCurrent = i === trail.current
        const cls = i < trail.current ? 'done' : isCurrent ? 'current' : ''
        return (
          <div className={`ct-step ${cls}`} key={step}>
            <span className="ct-dot" />
            <span className="ct-label">{step}</span>
            {isCurrent ? <span className="ct-here">{PASSPORT_COPY.caseTrail.hereMarker}</span> : null}
          </div>
        )
      })}
    </div>
  )
}
