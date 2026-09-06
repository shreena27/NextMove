/** Ports the prototype's `crumbs()` and `phaseEyebrow()` (design/nextmove-
 *  v1-prototype.html, lines 2313-2321), plus the `SERVICE_SQ` map (2310-2312)
 *  — Teak's marker-square device: every crumb strip leads with the owning
 *  service's colored square, then dashed-soft chips for phase context. */
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
  Passport: 'sq-passport',
  'Voter Services': 'sq-voter',
  SIR: 'sq-voter',
}

export function PhaseEyebrow({ service, phase }: { service: string; phase?: string }) {
  const sq = SERVICE_SQ[service.split(' · ')[0]] ?? null
  return <Crumbs parts={phase ? [service, phase] : [service]} sqClass={sq} />
}
