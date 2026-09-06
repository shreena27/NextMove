/** Ports the prototype's `PASSPORT_STEPS_FOR` (design/nextmove-v1-
 *  prototype.html, lines 3366-3378) and `renderTimeline` (3612-3620).
 *
 *  The case trail is Passport-only (FR-V-10). `passportTrailFor` enforces
 *  that structurally, not by naming a service: Voter's and SIR's diagnoses
 *  carry state ids (e.g. 'V-1', 'S-4') and `matchedAnswers` keys (voterQ1,
 *  sirQ1 — never `q1`) that simply never intersect this file's maps, so
 *  calling it unconditionally on every diagnosis already returns `null` for
 *  them. DiagnosisScreen.tsx therefore never checks a service name to decide
 *  whether a trail exists.
 */
import type { Diagnosis } from '../domain/types'

export interface CaseTrailData {
  steps: string[]
  current: number
}

const STEPS = ['Application', 'Appointment', 'Police verification', 'Processing']

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
 *  has no entry for (every non-Passport diagnosis). */
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
            {isCurrent ? <span className="ct-here">You are here</span> : null}
          </div>
        )
      })}
    </div>
  )
}
