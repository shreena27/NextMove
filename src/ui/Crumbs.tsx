/** Ports the prototype's `crumbs()` and `phaseEyebrow()` (design/nextmove-
 *  v1-prototype.html, lines 2313-2321), plus the `SERVICE_SQ` map (2310-2312)
 *  — Teak's marker-square device: every crumb strip leads with the owning
 *  service's colored square, then dashed-soft chips for phase context.
 *
 *  Review fix round 1 (Minor): `SERVICE_SQ`'s keys are computed from
 *  `UI.serviceLabel.*` (screenCopy.ts) rather than re-typed as string
 *  literals — every caller now passes `UI.serviceLabel.passport`/
 *  `.voterServices`/`.sir` as the `service` prop, so a re-typed literal here
 *  could silently desync from screenCopy.ts with no test catching it
 *  (a renamed service label would just drop the crumb's coloured square).
 *  Keying off the same constants makes that impossible by construction. */
import { UI } from '../screens/screenCopy'

export interface CrumbsProps {
  parts: string[]
  sqClass?: string | null
}

export function Crumbs({ parts, sqClass }: CrumbsProps) {
  return (
    <div className="crumbs">
      {parts.map((p, i) => (
        <span key={i} className={`crumb ${i > 0 ? 'soft' : ''}`}>
          {i === 0 && sqClass ? <span className={`crumb-sq ${sqClass}`} /> : null}
          {p}
        </span>
      ))}
    </div>
  )
}

// Both Voter Services and SIR reuse the pink square (sq-voter) — the
// prototype never cut a separate square colour for SIR. Transcribed as-is.
const SERVICE_SQ: Record<string, string> = {
  [UI.serviceLabel.passport]: 'sq-passport',
  [UI.serviceLabel.voterServices]: 'sq-voter',
  [UI.serviceLabel.sir]: 'sq-voter',
}

export function PhaseEyebrow({ service, phase }: { service: string; phase?: string }) {
  const sq = SERVICE_SQ[service.split(' · ')[0]] ?? null
  return <Crumbs parts={phase ? [service, phase] : [service]} sqClass={sq} />
}
