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
  | 'affiliation' | 'causal' | 'interval-hyphenated' | 'deadline-plural'

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
  // C2 extension (2026-09-06): plural form. The original `deadline` row
  // matches singular "deadline" but not "deadlines" (\b requires a word
  // boundary immediately after the word, and "deadlines" has no boundary
  // there) — this extension row closes that gap with the SAME reason text,
  // added the same way the hyphenated-interval row was added above.
  { id: 'deadline-plural', pattern: /\bdeadlines\b/i, reason: 'invented deadline' },
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
    reason: 'States a verified ABSENCE ("no numeric deadline is published"), the opposite of asserting one. Backed by the grievance page\'s "within a reasonable period of time" (manifest state-5b, repointed 2026-09-05 (C2 Task 1) to the grievance page\'s own DPG-paragraph quote).',
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
  {
    at: 'sir:s-final-absent.howLong',
    pattern: 'deadline-plural',
    reason: 'Refers to its OWN verified, sourced 15-day appeal window as "one of the few sourced numeric deadlines in this playbook" — the opposite of an invented deadline. The 15-day interval itself is separately validated by numericFindings against sourced_intervals; "deadlines" here is meta-commentary on how few of this playbook\'s claims are numeric deadlines at all, not an additional unsourced claim (manifest s-final-absent, CEO Delhi FAQ Q32).',
  },
  // C3 Task 9 review fix round 1 (Important): design note 5 names
  // LADDER_DEFS' titles/captions/rung-labels as an unconditional guardrail-
  // sweep input, so screenCopy.test.tsx now feeds LADDER_DEFS through this
  // scan for the first time since Task 8 shipped it — neither ladder.ts nor
  // ladder.test.ts ran it through contentSafety before. Both captions'
  // "as far as your case needs" trips the causal pattern the same way
  // sir:s-notice.whatToDo's "as your notice directs" does, above: it
  // describes how much of the ladder a citizen needs to climb, deferring to
  // their own situation, not asserting a cause for anything. LADDER_DEFS
  // itself is untouched (rewording locked Task 8 copy to dodge a scanner is
  // not the fix); this exemption is.
  {
    at: 'passport:LADDER_DEFS.passport.caption',
    pattern: 'causal',
    reason: 'Now mounted (C5, <EscalationLadder>): the caption is rendered citizen-facing text on the casefile screen for the first time. Same false positive as sir:s-notice.whatToDo: "...Used only as far as your case needs..." describes how much of the ladder applies to this citizen, not a cause. The reasoning holds unchanged once live — the pattern\'s problem was never the string\'s visibility, it is that the causal row\'s "as your" alternative over-fires on possessives.',
  },
  {
    at: 'voter:LADDER_DEFS.voter.caption',
    pattern: 'causal',
    reason: 'Now mounted (C5, <EscalationLadder>): the caption is rendered citizen-facing text on the casefile screen for the first time. Same false positive as passport:LADDER_DEFS.passport.caption and sir:s-notice.whatToDo: "...Used only as far as your case needs" describes how much of the ladder applies to this citizen, not a cause. The reasoning holds unchanged once live — the pattern\'s problem was never the string\'s visibility, it is that the causal row\'s "as your" alternative over-fires on possessives.',
  },
  // C4 Task 1 (prep copy port): three more causal-pattern false positives in
  // src/playbooks/prep.ts's PREP map, in two categories.
  //   1. Possessive "as your" — same shape as sir:s-notice.whatToDo above.
  //   2. Citizen-voiced draft letters where the clause after "because" is an
  //      UNFILLED [bracket] the citizen fills in themselves. That unfilled
  //      bracket is the load-bearing condition, NOT the first-person voice:
  //      first-person alone is a real loophole ("I was refused because the
  //      officer was biased" is first-person and still asserts a specific
  //      cause NextMove has no source for). First-person voice only supports
  //      the case — it establishes the finished sentence will be the
  //      citizen's own claim, never NextMove's — it is not the test on its
  //      own. Pinned executable by prep.test.ts's DRAFT_CAUSAL_EXEMPTIONS
  //      check, which fails if either bracket is ever filled in.
  {
    at: 'passport:PREP.state-4.steps[2]',
    pattern: 'causal',
    reason: 'Possessive, not causal — same false positive as sir:s-notice.whatToDo\'s "as your notice directs": "as your message or call script" names whose script it is, it does not assert a cause.',
  },
  {
    at: 'voter:PREP.v-3.draft',
    pattern: 'causal',
    reason: 'Citizen-voiced draft letter. The clause after `because` is an unfilled `[bracket]` the citizen supplies, so NextMove ships a sentence frame and asserts no cause. First-person voice supports this but is not the test — a first-person sentence naming a specific cause would still violate §7. Pinned by prep.test.ts\'s `DRAFT_CAUSAL_EXEMPTIONS` check, which fails if the bracket is ever filled in.',
  },
  {
    at: 'voter:PREP.v-5.draft',
    pattern: 'causal',
    reason: 'Citizen-voiced draft letter. The clause after `because` is an unfilled `[bracket]` the citizen supplies, so NextMove ships a sentence frame and asserts no cause. First-person voice supports this but is not the test — a first-person sentence naming a specific cause would still violate §7. Pinned by prep.test.ts\'s `DRAFT_CAUSAL_EXEMPTIONS` check, which fails if the bracket is ever filled in.',
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

/** Canonical accepted forms for a sourced date or day-count — the ONLY shapes
 *  `INTERVAL_RE` / `DATE_RE` recognize:
 *    - dates: "d Mon" or "d Mon yyyy" (e.g. "4 Nov", "4 November 2026")
 *    - intervals: "N unit" or "N-unit" (e.g. "15 days", "15-day")
 *  Everything else — "September 30, 2026", "30/09/2026", "30.09.2026",
 *  "30th September", "two weeks", "a fortnight", "48 hours" — used to slip
 *  past both this scanner and `bannedFindings` entirely, undetected, which
 *  contradicts §7's "any date or day-count outside the allowlist fails the
 *  build" (it was only true for the one canonical spelling). `CATCH_ALL_PATTERNS`
 *  below is a plan-review-recommended hardening (2026-09-06), not a plan
 *  violation: it fails closed on any alternate shape instead of silently
 *  passing it through. */
const INTERVAL_RE = /\b\d+[-\s]*(?:day|days|week|weeks|month|months|year|years)\b/gi
const DATE_RE = new RegExp(String.raw`\b\d{1,2}\s+(?:${MONTHS})[a-z]*\.?(?:\s+(\d{4}))?\b`, 'gi')

/** Fail-closed catch-all for numeric/date claims outside INTERVAL_RE/DATE_RE's
 *  canonical forms. Each pattern is scoped to a shape the two canonical
 *  regexes provably cannot match (digit forms only for the two date patterns,
 *  word-numbers only for the interval pattern), so a match here can never be
 *  a duplicate of a canonical-form match by construction. The per-string
 *  overlap check in `numericFindings` is a second, defensive layer only. */
const CATCH_ALL_PATTERNS: RegExp[] = [
  // "30/09/2026", "30.09.2026"
  /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g,
  // "30th September", "4th Nov"
  /\b\d{1,2}(?:st|nd|rd|th)\s+[A-Za-z]+\b/gi,
  // "two weeks", "a fortnight", "ten days" — word-number + unit. Cannot ever
  // match a digit form like "15 days", which INTERVAL_RE already handles.
  /\b(?:a|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:day|days|week|weeks|month|months|fortnight|year|years|hour|hours)\b/gi,
  // "fortnight" on its own (no preceding counted word)
  /\bfortnight\b/gi,
  // "48 hours", "1 hour" — INTERVAL_RE's unit list has no "hour"/"hours"
  /\b\d+\s*hours?\b/gi,
]

/** D5 (C8, docs/superpowers/plans/2026-09-08-c8-describe-it.md, Task 10) —
 *  the ONE mechanism this project has ever granted from the numeric scan.
 *  Shaped like `SAFETY_EXEMPTIONS` above, but scoped to one location AND
 *  one exact MATCHED STRING (never a whole location, never a pattern id —
 *  numeric findings are not matched against a named `BannedPatternId`, so
 *  there is no pattern to scope to). `staleNumericExemptionFindings` below
 *  is the same staleness discipline `staleExemptionFindings` already
 *  applies, keyed the same way.
 *
 *  Its one entry exists because `UI.describe.examples['passport-q1'].one`
 *  (screenCopy.ts, C8 Task 10) is a citizen-authored EXAMPLE STORY —
 *  tappable chip text the citizen may fill their own textarea with, not a
 *  NextMove claim about any timeline — and it happens to contain a date
 *  (`"applied 12 March 2026"`). Fabricating a `sources/manifest.json`
 *  `sourced_dates` entry for a fictional example date would corrupt the
 *  evidence base the manifest exists to protect (PRD §29); see the plan's
 *  D5 for the two rejected alternatives (rewrite the example / drop the
 *  date). Repo-owner sign-off: plan Open Question 1, RESOLVED 2026-09-08,
 *  "add the scoped NUMERIC_EXEMPTIONS mechanism." */
export const NUMERIC_EXEMPTIONS: { at: string; match: string; reason: string }[] = [
  {
    at: 'ui:describe.examples.passport-q1.one',
    match: '12 March 2026',
    reason:
      'Illustrative example of CITIZEN-authored input, rendered as a tappable chip that fills the textarea. Not a '
      + 'NextMove claim about any timeline and not attributable to NextMove — this scan exists to stop NextMove '
      + 'asserting an unsourced date, and no assertion is made here. Fabricating a sources/manifest.json entry for '
      + 'a fictional date would corrupt the evidence base PRD §29 built; see plan D5 for the two rejected '
      + 'alternatives.',
  },
]

const numericExemptKey = (at: string, match: string) => `${at} :: ${match}`
const numericExempt = new Set(NUMERIC_EXEMPTIONS.map(e => numericExemptKey(e.at, e.match)))

/** A NUMERIC_EXEMPTIONS entry whose exact matched string no longer appears
 *  at its `at` location is dead permission — the same discipline
 *  `staleExemptionFindings` already applies to `SAFETY_EXEMPTIONS`, keyed
 *  on the literal matched text instead of a pattern id, since numeric
 *  findings are not matched against a named `BannedPatternId`. */
export function staleNumericExemptionFindings(strings: CopyString[]): string[] {
  const byAt = new Map(strings.map(s => [s.at, s.text]))
  return NUMERIC_EXEMPTIONS
    .filter(e => {
      const text = byAt.get(e.at)
      return text === undefined || !text.includes(e.match)
    })
    .map(e => `NUMERIC_EXEMPTIONS["${e.at}" / "${e.match}"]: no longer matches that text at that location — remove it.`)
}

function matchRanges(re: RegExp, text: string): [number, number][] {
  return [...text.matchAll(re)].map(m => [m.index!, m.index! + m[0].length])
}

function overlapsAny(range: [number, number], ranges: [number, number][]): boolean {
  const [start, end] = range
  return ranges.some(([s, e]) => start < e && s < end)
}

/** §7's allowlist check: every numeric interval and calendar date in shipped
 *  copy must be a manifest-backed sourced value, allow-listed for exactly the
 *  location it appears in. bannedFindings defers to this verdict for the two
 *  day-count patterns — the two scanners compose, they do not duplicate. */
export function numericFindings(strings: CopyString[]): string[] {
  const manifest = loadManifest()
  const findings: string[] = []

  for (const { at, text } of strings) {
    const claimed: [number, number][] = [
      ...matchRanges(INTERVAL_RE, text),
      ...matchRanges(DATE_RE, text),
    ]

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
        // D5 — NUMERIC_EXEMPTIONS, scoped to this exact (at, matched text)
        // pair only. See its own doc comment above for why this is the one
        // case this scan is allowed to stay silent on.
        if (numericExempt.has(numericExemptKey(at, m[0]))) continue
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

    // Fail-closed catch-all: anything matching one of these alternate shapes
    // that was NOT already reported by the canonical INTERVAL_RE/DATE_RE pass
    // above is an unrecognised numeric/date claim, full stop — there is no
    // manifest lookup for it because these shapes are never how a sourced
    // value is allow-listed.
    for (const pattern of CATCH_ALL_PATTERNS) {
      for (const m of text.matchAll(pattern)) {
        const range: [number, number] = [m.index!, m.index! + m[0].length]
        if (overlapsAny(range, claimed)) continue
        findings.push(
          `${at}: "${m[0]}" is an unrecognised numeric/date claim — rewrite in "d Mon yyyy" or "N day(s)" form, or extend numericFindings to recognize this shape.`,
        )
        claimed.push(range)
      }
    }
  }
  return findings
}

/** §7's retired-action-noun scan, for the state's currently configured phase.
 *  `extra` carries non-rule citizen-facing copy (C4's prep steps, C5's
 *  check-in labels) through the SAME scan — this scan's own RETIRED_ACTIONS
 *  doc comment names both chunks as required to EXTEND it, not fork it. The
 *  `= []` default keeps every pre-existing call site behaviour-identical. */
export function retiredActionFindings(playbook: Playbook, currentPhaseId: string, extra: CopyString[] = []): string[] {
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
    for (const c of extra) {
      if (entry.action.test(c.text)) {
        findings.push(`${c.at}: instructs a retired action ("${entry.retiredNoun}"). ${entry.reason}`)
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
