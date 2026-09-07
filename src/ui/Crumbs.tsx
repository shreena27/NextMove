/** Ports the prototype's `crumbs()` and `phaseEyebrow()` (design/nextmove-
 *  v1-prototype.html, lines 2313-2321).
 *
 *  The `SERVICE_SQ` map (2310-2312) used to live here, but moved out to its
 *  own component-free `src/ui/serviceSquare.ts` (Task 8 design note 1):
 *  `CaseCard` needs the same map, and this file exports components, so
 *  exporting a plain data map alongside them would trip oxlint's
 *  react(only-export-components) Fast Refresh rule. See serviceSquare.ts's
 *  own header note for the full reasoning, including why this file's own
 *  `?? null` fallback below is deliberately DIFFERENT from CaseCard's
 *  `|| 'sq-butter'` — do not unify them. */
import { SERVICE_SQ } from './serviceSquare'

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

export function PhaseEyebrow({ service, phase }: { service: string; phase?: string }) {
  const sq = SERVICE_SQ[service.split(' · ')[0]] ?? null
  return <Crumbs parts={phase ? [service, phase] : [service]} sqClass={sq} />
}
