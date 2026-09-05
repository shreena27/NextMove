// TEST-ONLY. The content-safety scan
// (NextMove_Implementation_Plan_FINAL.md §7 and §8).
import type { Playbook, RuleContent } from '../../domain/types'
import { loadManifest, canonicalDate, canonicalInterval } from './manifest'

export interface CopyString {
  /** "<serviceId>:<ruleId>.<field>", or a non-rule location like
   *  "sir:SIR_PHASES.final_roll.note". The serviceId prefix is mandatory:
   *  without it all three playbooks' fallbacks collide on "fallback.explanation"
   *  and a cross-playbook sweep silently keeps only the last one. Matches the
   *  shape of the manifest allowlists' `allowed_in` entries. */
  at: string
  text: string
}

export type BannedPatternId =
  | 'interval' | 'deadline' | 'guarantee' | 'we-submitted' | 'we-filed'
  | 'affiliation' | 'causal' | 'interval-hyphenated'

/** LIFTED VERBATIM from commit 91ff7a1, src/playbooks/contentSafety.test.ts —
 *  the hand-authored table. Every `pattern` and `reason` in rows 1-7 is
 *  byte-for-byte the original. Row 8 is a documented C2 EXTENSION: the original
 *  interval row requires whitespace between the number and the unit, so
 *  "15-day" slips through it. Nothing here was loosened.
 *
 *  Two metadata fields are added to every row and change no pattern and no
 *  reason: `id`, so an exemption can name the ONE pattern it exempts, and
 *  `interval`, which marks the two day-count rows that compose with the
 *  manifest's sourced_intervals allowlist. */
export const BANNED_PATTERNS: {
  id: BannedPatternId
  pattern: RegExp
  reason: string
  interval?: true
}[] = [
  { id: 'interval', pattern: /\b\d+\s*(day|days|week|weeks|month|months)\b/i, reason: 'invented day/week/month threshold', interval: true },
  { id: 'deadline', pattern: /\bdeadline\b/i, reason: 'invented deadline' },
  { id: 'guarantee', pattern: /\bguarantee(d|s)?\b/i, reason: 'promised/guaranteed resolution' },
  { id: 'we-submitted', pattern: /\bwe (have )?submitted\b/i, reason: 'claims NextMove submitted something on the user\'s behalf' },
  { id: 'we-filed', pattern: /\bwe filed\b/i, reason: 'claims NextMove filed something on the user\'s behalf' },
  { id: 'affiliation', pattern: /\b(government of india|official government (app|service|portal)|we are (the|an?) (official|government))\b/i, reason: 'claims government affiliation' },
  {
    id: 'causal',
    pattern: /\b(because|due to|caused by|the reason is|since your|as your)\b/i,
    reason: 'uses causal language that risks stating/implying a cause for the adverse finding',
  },
  // C2 extension (2026-09-05): hyphenated interval form.
  { id: 'interval-hyphenated', pattern: /\b\d+-(day|days|week|weeks|month|months)\b/i, reason: 'invented day/week/month threshold (hyphenated form)', interval: true },
]

/** Reviewed, per-location, PER-PATTERN exemptions. Each is a real match of one
 *  named banned pattern that is NOT a violation, with the reason recorded.
 *  Scoped to one `at` AND one pattern id, never to a whole rule and never to a
 *  whole location: an exemption for the causal row at s-notice.whatToDo leaves
 *  every other pattern live at that same string. staleExemptionFindings()
 *  fails the build if one stops matching, so the list cannot rot into blanket
 *  permission after a copy edit. */
export const SAFETY_EXEMPTIONS: { at: string; pattern: BannedPatternId; reason: string }[] = [
  {
    at: 'passport:state-5b.howLong',
    pattern: 'deadline',
    reason: 'States a verified ABSENCE ("no numeric deadline is published"), the opposite of asserting one. Backed by the grievance page\'s "within a reasonable period of time" (manifest state-dpg-p).',
  },
  {
    at: 'passport:state-5b-p.howLong',
    pattern: 'deadline',
    reason: 'Same verified-absence statement as state-5b.howLong, for the pending rung.',
  },
  {
    at: 'voter:v-3.howLong',
    pattern: 'deadline',
    reason: 'States a verified absence: Final-ER-FAQ Q34 sets no deadline for a first appeal (manifest v-3 note, PRD §23 research question (b), closed 2026-09-05).',
  },
  {
    at: 'sir:s-notice.howLong',
    pattern: 'deadline',
    reason: 'States a verified absence: no elector-facing response deadline exists in any source, so the notice\'s own instructions govern (manifest s-notice note; grill A11).',
  },
  {
    at: 'sir:s-notice.whatToDo',
    pattern: 'causal',
    reason: 'The causal row over-fires on "as your notice directs" — that defers to the citizen\'s own notice, it does not assert a cause. Pattern kept byte-faithful to the lifted table; the exemption is the recorded deviation.',
  },
]

/** Action nouns belonging to an SIR phase that has already ended. Scanned
 *  over ACTION fields only — a past-tense mention in an explanation is
 *  honest history, not an instruction (see the plan's design notes).
 *  C4 (prepare steps) and C5 (check-in labels) EXTEND this scan's input;
 *  they must not fork the harness. */
export const RETIRED_ACTIONS: {
  action: RegExp
  retiredNoun: string
  retiredForPhases: string[]
  reason: string
}[] = [
  {
    action: /enumeration form/i,
    retiredNoun: 'Enumeration Form',
    retiredForPhases: ['claims_notice', 'final_roll'],
    reason: 'House-to-house enumeration closed 17.08.2026 (CEO Delhi FAQ Q4 row 1), so filing an Enumeration Form can no longer be done. Phase-gating applies ON TOP of sources: FAQ Q22 still states the remedy verbatim, and it is still impossible to follow (sources/VERIFICATION_NOTES.md §3).',
  },
]

/** §7: adverse/unclear/notice states may never assert a cause.
 *  `needsDisclaimer: false` on v-4 is a recorded deviation — see the plan. */
export const CAUSE_STATES: { ruleId: string; needsDisclaimer: boolean }[] = [
  { ruleId: 'state-4', needsDisclaimer: true },
  { ruleId: 'v-3', needsDisclaimer: true },
  { ruleId: 'v-4', needsDisclaimer: false },
  { ruleId: 's-roll-absent', needsDisclaimer: true },
  { ruleId: 's-notice', needsDisclaimer: true },
]

export const COPY_FIELDS = [
  'label', 'dependency', 'explanation', 'whatShort', 'whatToDo', 'need', 'howLong', 'expectNext', 'rungLabel',
] as const

const ACTION_FIELDS = ['whatShort', 'whatToDo'] as const

const DISCLAIMER = /nextmove can'?t (tell|verify)/i

export function extraCopy(at: string, text: string): CopyString {
  return { at, text }
}

function contentStrings(serviceId: string, id: string, c: RuleContent): CopyString[] {
  const out: CopyString[] = []
  const at = `${serviceId}:${id}`
  for (const field of COPY_FIELDS) {
    const text = c[field]
    if (typeof text === 'string') out.push({ at: `${at}.${field}`, text })
  }
  out.push({ at: `${at}.where.label`, text: c.where.label })
  c.needList?.forEach((item, i) => out.push({ at: `${at}.needList[${i}]`, text: item }))
  return out
}

/** Every citizen-facing string in a playbook, addressed serviceId-first.
 *  rungLabel IS scanned: decorateStageRung splices it verbatim into the
 *  rendered label, so it is citizen-facing text like any other COPY_FIELDS
 *  entry. Only mustNot, state and source are excluded on purpose (see the
 *  design notes). */
export function copyStrings(playbook: Playbook): CopyString[] {
  return [
    ...playbook.rules.flatMap(r => contentStrings(playbook.serviceId, r.id, r)),
    ...contentStrings(playbook.serviceId, 'fallback', playbook.fallback),
  ]
}

const exemptKey = (at: string, pattern: BannedPatternId) => `${at} :: ${pattern}`
const exempt = new Set(SAFETY_EXEMPTIONS.map(e => exemptKey(e.at, e.pattern)))

export function bannedFindings(strings: CopyString[]): string[] {
  const intervals = loadManifest().sourced_intervals
  const findings: string[] = []
  for (const { at, text } of strings) {
    for (const row of BANNED_PATTERNS) {
      const m = row.pattern.exec(text)
      if (!m) continue
      if (exempt.has(exemptKey(at, row.id))) continue
      // The two day-count rows compose with the manifest's sourced_intervals
      // allowlist instead of duplicating it: a day count that IS sourced AND
      // IS allow-listed for this exact location has already been cleared by
      // numericFindings, so re-flagging it here would force the real, sourced
      // copy onto a hand-maintained exemption list.
      if (row.interval) {
        const entry = intervals[canonicalInterval(m[0])]
        if (entry && entry.allowed_in.includes(at)) continue
      }
      findings.push(`${at}: banned pattern (${row.reason}) matched "${m[0]}" in: ${text}`)
    }
  }
  return findings
}

/** An exemption whose NAMED pattern no longer matches at its location is dead
 *  permission. Checked per-pattern, not "any pattern", so narrowing an
 *  exemption cannot silently keep it alive on a different match. */
export function staleExemptionFindings(strings: CopyString[]): string[] {
  const byAt = new Map(strings.map(s => [s.at, s.text]))
  return SAFETY_EXEMPTIONS
    .filter(e => {
      const text = byAt.get(e.at)
      const row = BANNED_PATTERNS.find(r => r.id === e.pattern)
      return text === undefined || !row || !row.pattern.test(text)
    })
    .map(e => `SAFETY_EXEMPTIONS["${e.at}" / ${e.pattern}]: no longer matches that banned pattern — remove it.`)
}

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
const INTERVAL_RE = /\b\d+[-\s]*(?:day|days|week|weeks|month|months|year|years)\b/gi
const DATE_RE = new RegExp(String.raw`\b\d{1,2}\s+(?:${MONTHS})[a-z]*\.?(?:\s+(\d{4}))?\b`, 'gi')

/** §7's allowlist check: every numeric interval and calendar date in shipped
 *  copy must be a manifest-backed sourced value, allow-listed for exactly the
 *  location it appears in. bannedFindings defers to this verdict for the two
 *  day-count patterns — the two scanners compose, they do not duplicate. */
export function numericFindings(strings: CopyString[]): string[] {
  const manifest = loadManifest()
  const findings: string[] = []

  for (const { at, text } of strings) {
    for (const m of text.matchAll(INTERVAL_RE)) {
      const key = canonicalInterval(m[0])
      const entry = manifest.sourced_intervals[key]
      if (!entry) {
        findings.push(`${at}: "${m[0]}" (canonical "${key}") has no sourced_intervals entry in sources/manifest.json.`)
      } else if (!entry.allowed_in.includes(at)) {
        findings.push(`${at}: "${m[0]}" (canonical "${key}") is sourced but not allowed in ${at}. ${entry.meaning}`)
      }
    }
    for (const m of text.matchAll(DATE_RE)) {
      const key = canonicalDate(m[0])
      const entry = manifest.sourced_dates[key]
      if (!entry) {
        findings.push(`${at}: "${m[0]}" (canonical "${key}") has no sourced_dates entry in sources/manifest.json.`)
        continue
      }
      if (!entry.allowed_in.includes(at)) {
        findings.push(`${at}: "${m[0]}" (canonical "${key}") is sourced but not allowed in ${at}. ${entry.meaning}`)
      }
      const year = m[1] ? Number(m[1]) : undefined
      if (year !== undefined && entry.year !== undefined && year !== entry.year) {
        findings.push(`${at}: "${m[0]}" states year ${year}; the sourced date is ${entry.year} (${entry.source_form}).`)
      }
    }
  }
  return findings
}

/** §7's retired-action-noun scan, for the state's currently configured phase. */
export function retiredActionFindings(playbook: Playbook, currentPhaseId: string): string[] {
  const findings: string[] = []
  for (const entry of RETIRED_ACTIONS) {
    if (!entry.retiredForPhases.includes(currentPhaseId)) continue
    for (const rule of playbook.rules) {
      for (const field of ACTION_FIELDS) {
        const text = rule[field]
        if (entry.action.test(text)) {
          findings.push(`${playbook.serviceId}:${rule.id}.${field}: instructs a retired action ("${entry.retiredNoun}"). ${entry.reason}`)
        }
      }
      if (entry.action.test(rule.where.label)) {
        findings.push(`${playbook.serviceId}:${rule.id}.where.label: routes to a retired action ("${entry.retiredNoun}"). ${entry.reason}`)
      }
    }
  }
  return findings
}

/** §7's per-state cause test. */
export function causeStateFindings(playbook: Playbook): string[] {
  const findings: string[] = []
  for (const spec of CAUSE_STATES) {
    const rule = playbook.rules.find(r => r.id === spec.ruleId)
    if (!rule) continue
    if (!rule.mustNot || rule.mustNot.trim() === '') {
      findings.push(`${playbook.serviceId}:${rule.id}: a cause state must declare mustNot — what its copy may never assert.`)
    }
    if (spec.needsDisclaimer && !DISCLAIMER.test(`${rule.explanation} ${rule.whatToDo}`)) {
      findings.push(`${playbook.serviceId}:${rule.id}: a cause state must carry an explicit "NextMove can't tell…" disclaimer in its explanation or whatToDo.`)
    }
  }
  return findings
}
