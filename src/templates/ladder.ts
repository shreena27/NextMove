// Ports the prototype's `LADDER_DEFS` (design/nextmove-v1-prototype.html,
// lines 2746-2757), `ladderFor` (2760-2790), and `LADDER_TAG` (2791).
//
// Pure logic only: `ladderFor` reads answers and the diagnosis, never
// session or casefile state. `<EscalationLadder>` (the port of
// `renderLadder`, 2792-2803) and its CSS (801-826) are deferred to C5 —
// `renderLadder` has exactly one call site in the locked design
// (`renderCasefile`, 2920), and the casefile screen is C5's. This file
// exports data and one pure function; no JSX, no CSS, no component.
import type { AnswerRecord, Classification, Diagnosis } from '../domain/types'

/** The three service engines' routing key (mirrors session.ts's
 *  `ServiceKey`). Kept as a local literal type here, not imported: this
 *  file is domain/playbook-data-only and must not depend on session/. */
export type LadderEngineKey = 'passport' | 'voter' | 'sir'

export interface LadderDef {
  title: string
  caption: string
  rungs: string[]
}

/* ---- escalation ladder (2026-09-05, user request: "make a progress
   ladder") ---- Only REAL official ladders are drawn: the passport
   grievance ladder (Citizen's Charter / grievance page) and the voter
   two-tier appeal (Final-ER-FAQ Q34). SIR has no verified ladder, so it
   gets none. Shown only once the ladder is in play — a calm WAIT case
   is not nudged toward escalation by a roadmap it doesn't need. */
export const LADDER_DEFS = {
  passport: {
    title: 'Escalation ladder',
    caption:
      'The official grievance ladder for a stuck passport case. Used only as far as your case needs; the recommendation above always comes first.',
    rungs: ['Informal follow-up', 'Formal grievance (CPGRAMS)', 'DPG escalation'],
  },
  voter: {
    title: 'Appeal ladder',
    caption: 'The official two-tier appeal structure (ECI FAQ Q34). Used only as far as your case needs.',
    rungs: ['First appeal — DEO / DM', 'Second appeal — state CEO'],
  },
} satisfies Record<'passport' | 'voter', LadderDef>

export type RungStatus = 'done' | 'now' | 'next' | 'up'

export interface Ladder {
  def: LadderDef
  s: RungStatus[]
}

// Statuses per rung: 'done' (consumed), 'now' (filed, response pending),
// 'next' (the current recommendation points here), 'up' (not in play).
export function ladderFor(engineKey: LadderEngineKey, a: AnswerRecord, d: Diagnosis): Ladder | null {
  const def = (LADDER_DEFS as Partial<Record<LadderEngineKey, LadderDef>>)[engineKey]
  const rec: Classification = d.rec
  if (!def || rec === 'UNCLASSIFIED') return null
  let s: RungStatus[]
  if (engineKey === 'passport') {
    s = ['up', 'up', 'up']
    if (a.dpgFiled === 'yes') {
      s[0] = 'done'
      s[1] = 'done'
      s[2] = a.dpgOutcome === 'resolved' ? 'done' : 'now'
    } else if (a.q2 === 'formal_grievance') {
      s[0] = 'done'
      if (a.gOutcome === 'resolved') {
        s[1] = 'done'
      } else if (a.gOutcome === 'pending') {
        s[1] = 'now'
      } else {
        s[1] = 'done'
        s[2] = 'next' // 5b recommends the DPG
      }
    } else if (a.q2 === 'informal') {
      if (a.fOutcome === 'resolved') {
        s[0] = 'done'
      } else if (a.fOutcome === 'pending') {
        s[0] = 'now'
      } else {
        s[0] = 'done'
        s[1] = 'next' // 5a recommends going formal
      }
    } else if (['2', '3', '4'].includes(d.state)) {
      s[0] = 'next' // contact the office
    } else {
      return null // state-1 etc: ladder not in play
    }
  } else if (engineKey === 'voter') {
    if (a.voterOutcome === 'accepted_pending') return null
    if (a.voterQ1 !== 'decision' && a.ceoAppeal !== 'filed') return null
    s = ['up', 'up']
    if (a.ceoAppeal === 'filed') {
      s[0] = 'done'
      s[1] = 'now'
    } else if (a.voterAppealed === 'decided') {
      s[0] = 'done'
      s[1] = 'next'
    } else if (a.voterAppealed === 'pending') {
      s[0] = 'now'
    } else {
      s[0] = 'next' // v-3: appeal is the entry point
    }
  } else {
    return null
  }
  if (!s.some((x) => x !== 'up')) return null
  return { def, s }
}

export const LADDER_TAG: Record<RungStatus, string> = {
  done: 'Done',
  now: 'In progress',
  next: 'Recommended now',
  up: '',
}
