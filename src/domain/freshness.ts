/** Client-safe consumer of sources/freshness.json (C6's freshness job,
 *  sources/check_freshness.py). Bundled at BUILD time via a plain JSON
 *  import — a citizen's browser never fetches this live; a freshness
 *  change only reaches them through the job's own commit -> rebuild ->
 *  redeploy cycle (issue #7's C6 handoff note; check_freshness.py's own
 *  docstring). Distinct from playbooks/guardrails/manifest.ts, which is
 *  TEST-ONLY (uses node:fs) and must never be imported from here.
 *
 *  Generic and parametrized on purpose, matching diagnose(engine, answers)'s
 *  own convention: this file never imports playbooks/engines.ts's ENGINES —
 *  callers (the App.tsx router) pass the concrete rules array for the
 *  engine they already have in hand, the same way they already pass a
 *  concrete engine into diagnose(). Keeps this module reusable for a
 *  future service without a new case here. Every function also takes an
 *  optional freshness-data override, purely for tests — the D6 injected-
 *  clock pattern applied to a second kind of "ambient truth", see
 *  session.ts's own now param for the precedent. */
import type { PlaybookRule } from './types'
import freshnessData from '../../sources/freshness.json'

export type FreshnessStatus = 'ok' | 'changed' | 'unreachable'

export interface FreshnessDocument {
  status: FreshnessStatus
  lastChecked?: string
  checkedFrom?: 'ci' | 'local'
  /** Only present when status is 'changed' — the first-detected date,
   *  sticky across runs (check_freshness.py's own contract). */
  changedOn?: string
  liveSha256?: string
}

export interface FreshnessFile {
  checkedAt: string
  documents: Record<string, FreshnessDocument>
}

// The JSON import's inferred type is a LITERAL snapshot of today's committed
// content (e.g. status narrowed to just "ok", since that's all that's in
// the file right now) — asserting the real, broader FreshnessFile shape is
// required, not cosmetic: without it, `doc.status === 'changed'` below
// would be a TypeScript error ("no overlap") the moment the committed data
// only ever says "ok".
const freshness = freshnessData as FreshnessFile

/** True only when a document check_freshness.py CONFIRMED changed (a real
 *  hash mismatch on a genuine PDF fetch) backs one of the given rules.
 *  'unreachable' never degrades anything — see check_freshness.py's own
 *  docstring for why a transient outage must not flip a citizen-facing
 *  banner. A rule with `source.docId === null` (the UNCLASSIFIED safety
 *  nets) can never be degraded — nothing to re-verify. */
export function degradedFor(rules: PlaybookRule[], data: FreshnessFile = freshness): boolean {
  return rules.some(rule => rule.source.docId !== null && data.documents[rule.source.docId]?.status === 'changed')
}

/** The earliest changedOn among this rule set's changed documents — the
 *  banner needs one date to show, not a per-rule list. Multiple
 *  simultaneous changes are rare enough that showing the earliest is the
 *  honest, non-alarming choice ("this has been known since X"), not a
 *  fabricated aggregate. Returns null when nothing is degraded (or, in the
 *  pathological case, a document is somehow marked 'changed' with no
 *  changedOn — never emitted by check_freshness.py, but this function does
 *  not assume its caller's data is well-formed). */
export function changedOnFor(rules: PlaybookRule[], data: FreshnessFile = freshness): string | null {
  const dates = rules
    .map(rule => (rule.source.docId !== null ? data.documents[rule.source.docId] : undefined))
    .filter((doc): doc is FreshnessDocument => doc?.status === 'changed' && Boolean(doc.changedOn))
    .map(doc => doc.changedOn as string)
    .sort()
  return dates[0] ?? null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "d Mon yyyy", matching TrustDisclosure's existing SOURCES_VERIFIED
 *  convention exactly (same format, same fixed-3-letter month table) so
 *  the two never visibly disagree in style where they appear side by side. */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** The freshness job's own live-verified date for this specific document
 *  (its lastChecked), formatted to match SOURCES_VERIFIED's convention — or
 *  null when this document isn't one check_freshness.py covers at all (the
 *  two web-page sources, and the superseded schedule PDF, all check:"manual"/
 *  "none" in manifest.json), in which case the caller falls back to
 *  SOURCES_VERIFIED's static human-captured date instead. Per-document, not
 *  a single blanket date standing in for every source regardless of which
 *  one a given Diagnosis actually cites. */
export function verifiedDateFor(docId: string | null, data: FreshnessFile = freshness): string | null {
  if (!docId) return null
  const doc = data.documents[docId]
  if (!doc?.lastChecked) return null
  return formatDate(doc.lastChecked)
}
