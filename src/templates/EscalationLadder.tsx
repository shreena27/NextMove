/** Ports the prototype's `renderLadder` (design/nextmove-v1-prototype.html,
 *  lines 2792-2803, tag v1-design-lock-2) — the escalation/appeal ladder
 *  shown on the casefile screen once escalation is genuinely in play.
 *
 *  Pure presentation over `templates/ladder.ts`'s pure `ladderFor`: this
 *  component calls it and renders nothing (returns `null`) when it returns
 *  `null` — the same "not in play" cases `ladder.test.ts` already pins
 *  (SIR entirely, a calm passport state-1, an accepted-pending voter case).
 *
 *  Markup, transcribed: `.ladder` > `.nm-k` (the def title, with the
 *  prototype's own inline `margin:0 0 8px`) > one `.lrung {status}` per rung
 *  — `.lr-dot` (holding `ICONS.stepCheck` ONLY when `done`), `.lr-label`,
 *  and `.lr-tag` only when `LADDER_TAG[status]` is non-empty — then
 *  `.ladder-note` (the caption). No new copy anywhere in this file: the
 *  title, caption, rung labels and tags all come from `LADDER_DEFS`/
 *  `LADDER_TAG` (templates/ladder.ts), already content-safety-scanned via
 *  screenCopy.test.tsx's own `ladderDefCopy`/`ladderTagCopy` helpers. */
import type { AnswerRecord, Diagnosis } from '../domain/types'
import { ladderFor, LADDER_TAG, type LadderEngineKey } from './ladder'
import { ICONS } from '../ui/icons'

export interface EscalationLadderProps {
  engineKey: LadderEngineKey
  d: Diagnosis
  answers: AnswerRecord
}

export function EscalationLadder({ engineKey, d, answers }: EscalationLadderProps) {
  const l = ladderFor(engineKey, answers, d)
  if (!l) return null
  return (
    <div className="ladder">
      <div className="nm-k" style={{ margin: '0 0 8px' }}>{l.def.title}</div>
      {l.def.rungs.map((r, i) => {
        const st = l.s[i]
        return (
          <div className={`lrung ${st}`} key={r}>
            <span className="lr-dot">{st === 'done' ? ICONS.stepCheck : null}</span>
            <span className="lr-label">{r}</span>
            {LADDER_TAG[st] ? <span className="lr-tag">{LADDER_TAG[st]}</span> : null}
          </div>
        )
      })}
      <div className="ladder-note">{l.def.caption}</div>
    </div>
  )
}
