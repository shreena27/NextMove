/** Ports the casefile screen's "Prepare steps" progress block (design/
 *  nextmove-v1-prototype.html, lines 2916-2919, tag v1-design-lock-2).
 *
 *  Renders only when the diagnosis has a prep plan (`prep` is non-null) —
 *  the prototype's own `${prep ? ... : ''}` gate. Markup: `.case-progress`
 *  > `.cp-head` (`.nm-k` "Prepare steps" + `.cp-count` "{done} of {total}
 *  done") > `.cp-bar` > `.cp-fill` with `style.width = pct + '%'`,
 *  `pct = steps.length ? Math.round(done/steps.length*100) : 0` — guarded
 *  against dividing by zero for a (currently hypothetical) empty plan. */
import type { PrepPlan } from '../playbooks/prep'
import { UI } from '../screens/screenCopy'

export interface CaseProgressProps {
  prep: PrepPlan | null
  prepChecks: Record<number, boolean>
}

export function CaseProgress({ prep, prepChecks }: CaseProgressProps) {
  if (!prep) return null
  const total = prep.steps.length
  const done = prep.steps.filter((_, i) => prepChecks[i]).length
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="case-progress">
      <div className="cp-head">
        <span className="nm-k" style={{ margin: 0 }}>{UI.casefile.prepareStepsK}</span>
        <span className="cp-count">
          {UI.casefile.prepareCount.replace('{done}', String(done)).replace('{total}', String(total))}
        </span>
      </div>
      <div className="cp-bar">
        <span className="cp-fill" style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}
