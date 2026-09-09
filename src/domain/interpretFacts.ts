// Fact extraction, numeric cue-gating, the Aadhaar refusal, and the
// PROVIDER-AGNOSTIC fact gate — half of FR-AI-02, and the half with a named
// privacy guarantee attached (C8 Task 3; D18).
//
// THIS IS GATE CODE, NOT SIMULATOR CODE. The prototype could run these
// rules inside its simulator because it has exactly one interpreter and it
// is hardcoded; this build has two, so a rule that lives in the interpreter
// is a rule that does not run in production. `extractFacts` below is the
// app deriving facts from the citizen's own text — it is what every
// provider's baseline is seeded from. `gateFacts` is what `interpretGates.ts`
// (Task 4) calls for EVERY provider, unconditionally, and it is the only
// function that module imports from here. The rules that decide whether a
// number gets shown at all — the Aadhaar refusal, the cue-gating, the
// unknown-number honesty chip, the ambiguous-date suppression — are applied
// here, in code, regardless of what any model (or a hostile actor speaking
// through a model) claims about its own output.
//
// A number a citizen typed is the most sensitive thing this app ever
// touches. The rule is asymmetric on purpose: an unrecognised number is
// shown honestly and fills nothing; an Aadhaar-shaped one is refused
// outright and is never shown at all.
//
// REF_SHAPES, REF_CUE, AADHAAR_CUE, the 32-character cue window, the
// cue-gating branch order, the unknown-number sweep (with its one-hit
// `break`), and the date patterns are TRANSCRIBED VERBATIM from
// design/nextmove-v1-prototype.html 1833-1887 (git tag v1-design-lock-2).
// `Fact` (kind/refType/label/value/fills/edited) is Task 2's type
// (interpret.ts) — see that file's own doc comment: a provider never
// supplies a `Fact` directly, only `{ value: string }` candidates, and
// `gateFacts` is what builds the real thing.
import type { ServiceKey } from './casefile'
import type { Fact } from './interpret'

/** Local {at,text} — MUST NOT import CopyString from ../playbooks/guardrails/.
 *  `guardrails/isolation.test.ts` walks every non-test .ts file under src/
 *  (this one included) and fails the build on such an import, even
 *  `import type`. Same precedent `screenCopy.ts`'s own `CopyLocation` and
 *  `prep.ts`'s own `CopyLocation` already set — TypeScript's structural
 *  typing makes the three interchangeable wherever a test needs to hand one
 *  to the harness. */
export interface CopyLocation { at: string; text: string }

interface RefShape {
  re: RegExp
  refType: string
  label: string
  fills: string | null
  /** A purely numeric shape never fills a bracket on shape alone — see the
   *  module header. Absent on every letter-bearing shape (structurally
   *  non-Aadhaar, needs no cue). */
  cueRequired?: true
}

/** `label` here is DATA-SHAPED COPY (Task 2 design note 2), not
 *  `screenCopy.ts`-registered — swept by `interpretFactsCopyExtras()`
 *  below, the same way `prep.ts`'s `PREP` map is swept by its own
 *  `prepCopyExtras()`. The shape order is FIRST-MATCH-WINS and is NOT
 *  alphabetical — transcribed in prototype order (1833-1846). */
const REF_SHAPES: Record<ServiceKey, RefShape[]> = {
  passport: [
    { re: /\b[A-Z]{2}\d{13}\b/i, refType: 'passport_file_no', label: 'File Number', fills: '[File Number / ARN]' },
    { re: /\b\d{12}\b/, refType: 'arn', label: 'ARN', fills: '[File Number / ARN]', cueRequired: true },
    { re: /\b[A-Z]{5,8}\/\d{4}\/\d{4,8}\b/i, refType: 'grievance_no', label: 'Grievance number', fills: '[CPGRAMS grievance number]' },
  ],
  voter: [
    { re: /\b[A-Z]{3}\d{7}\b/i, refType: 'epic', label: 'EPIC number', fills: null },
    { re: /\b\d{9,13}\b/, refType: 'voter_ref', label: 'Reference number', fills: '[reference number]', cueRequired: true },
  ],
  sir: [
    { re: /\b[A-Z]{3}\d{7}\b/i, refType: 'epic', label: 'EPIC number', fills: null },
  ],
}

/** The honest, fills-nothing chip's label — used both when the shape loop's
 *  cueRequired branch falls through uncued (non-12-digit) and when the
 *  separate unknown-number sweep (below) fires. Same label either way: to a
 *  citizen, both are "a number you mentioned that NextMove doesn't
 *  recognise the shape or role of." */
const UNKNOWN_LABEL = 'A number you mentioned'
const DATE_APPLIED_LABEL = 'Applied'
const DATE_OTHER_LABEL = 'Date you mentioned'

// UNKNOWN_REF is deliberately NOT case-insensitive (no /i) — transcribed
// verbatim, 1847. It is a GLOBAL regex, used only via String#match (which
// resets its own lastIndex bookkeeping on every call), never #exec/#test,
// so no state leaks between calls.
const UNKNOWN_REF = /\b(?=[A-Z0-9]*\d)[A-Z0-9]{8,18}\b/g
// The `\-` inside `[:\-]` below is a no-op escape, but this line is
// transcribed byte-for-byte from the locked prototype (1848) per design
// note 3; simplifying it to `[:-]` would be behaviourally identical, but
// "verbatim" here means verbatim.
// oxlint-disable-next-line no-useless-escape -- see comment above
const REF_CUE = /\b(arn|file|application|ack(nowledg\w*)?|ref(erence)?|grievance)\s*(no|number|num|#|id)?\.?\s*[:\-]?\s*(is\s*)?$/i
const AADHAAR_CUE = /\b(aadha?ar|adhaar|uid)\b[^0-9]{0,20}$/i

/** The 32-character lookback window (1850-1851). This is what makes "a
 *  labeled cue immediately before the number" concrete: the cue has to be
 *  ADJACENT, not merely present somewhere earlier in the sentence. Widening
 *  this into a whole-sentence search would let an unrelated earlier mention
 *  of "ARN" license a fill for a later, Aadhaar-cued or bare-Aadhaar-shaped
 *  number — see interpretFacts.test.ts's window-edge test. */
function cueBefore(text: string, idx: number): boolean {
  return REF_CUE.test(text.slice(Math.max(0, idx - 32), idx))
}
function aadhaarBefore(text: string, idx: number): boolean {
  return AADHAAR_CUE.test(text.slice(Math.max(0, idx - 32), idx))
}

/** Whole-branch review (2026-09-09 fix wave), Finding 1, second entry point:
 *  expands outward from `text[index, index+length)` while the adjacent
 *  characters are digits, and reports whether the resulting MAXIMAL run of
 *  digits is exactly 12 long — i.e. whether the candidate sits inside (or
 *  is) a bare Aadhaar-shaped number, REGARDLESS of whether that number has a
 *  `\b` word boundary anywhere in the raw text.
 *
 *  Why this is needed at all: a citizen-typed "aadhaarno123456789012" (no
 *  separator between the cue word and the digits) has NO `\b` between the
 *  cue word's last letter and the first digit — both are `\w` characters —
 *  so neither the shape loop's `\b\d{12}\b` nor `UNKNOWN_REF`'s own
 *  `\b`-anchored sweep ever sees this run as a candidate AT ALL, and
 *  `taken`/`refused` (populated only from what those two DID see) have
 *  nothing in them to catch a provider-supplied FRAGMENT of it with. This
 *  function is what lets `refusesAsAadhaar` below see the real digits on
 *  either side of a fragment that the fragment's own boundary-anchored shape
 *  tests cannot.
 *
 *  Note this is a STRICT GENERALISATION of `/^\d{12}$/` for any candidate
 *  that already has non-digit neighbours (every `\b`-anchored shape match and
 *  every `UNKNOWN_REF` sweep candidate): there the maximal run IS the
 *  candidate, so the two tests agree exactly. It differs only for a candidate
 *  located INSIDE a longer digit run — which is precisely the fragment case
 *  it exists for. */
function isBareAadhaarDigitRun(text: string, index: number, length: number): boolean {
  let start = index
  while (start > 0 && /\d/.test(text[start - 1])) start--
  let end = index + length
  while (end < text.length && /\d/.test(text[end])) end++
  return /^\d{12}$/.test(text.slice(start, end))
}

/** THE AADHAAR REFUSAL RULE, in ONE place (2026-09-09 fix wave, round 2).
 *
 *  Round 1 of this fix wave bolted an Aadhaar check onto two individual code
 *  paths — the unknown-number sweep and `classifyValue`'s `UNKNOWN_REF`
 *  fallback branch. A scoped re-review found that this closed the gap for
 *  `passport` and `sir` and left it WIDE OPEN for `voter`, for a reason that
 *  had nothing to do with Aadhaar: `REF_SHAPES.voter`'s `\b\d{9,13}\b` is
 *  wide enough to claim a 10-digit Aadhaar FRAGMENT as a whole-value shape
 *  match, so `classifyValue`'s shape loop returned an honest "unknown" chip
 *  and RETURNED — the guard one branch further down never ran. A per-branch
 *  guard is only ever as good as the branches someone remembered to put it
 *  on, and any future engine whose `REF_SHAPES` admits a bare digit run
 *  re-opens the same hole silently.
 *
 *  So the rule lives here instead, and every path that can accept a numeric
 *  value asks THIS function first — `extractFactsInternal`'s shape loop, its
 *  unknown-number sweep, and `classifyValue` BEFORE its own shape loop even
 *  starts, so no engine's `REF_SHAPES` (present or future) can shadow it.
 *  The principle, stated once: any digit-only value that is structurally
 *  shaped like an Aadhaar number, or is explicitly cued as one, is refused —
 *  regardless of which service's shapes would otherwise have let it in.
 *
 *  The three clauses, in order, are exactly the cue-gating discipline the
 *  shape loop already used before this fix wave (that is deliberate — it is
 *  the same rule, not a stricter new one):
 *   1. NOT a digit-only value -> not an Aadhaar number, and never refused on
 *      Aadhaar grounds. A letter-bearing token like `XYZAB1234` cannot be an
 *      Aadhaar number no matter what words sit near it.
 *   2. An explicit Aadhaar cue immediately before it (the 32-char window) ->
 *      refused unconditionally. A citizen who labels the number themselves is
 *      the most reliable signal there is.
 *   3. Otherwise: a legitimate reference-number cue (`ARN`, `file no`,
 *      `reference number`) immediately before it LICENSES the number, exactly
 *      as it always has; with no such cue, a bare Aadhaar-length digit run is
 *      refused. Aadhaar and a passport ARN are both 12 digits, inseparable in
 *      principle (FR-AI-02) — the cue is the only thing that ever separated
 *      them, and this function does not change that. */
function refusesAsAadhaar(text: string, index: number, value: string): boolean {
  if (!/^\d+$/.test(value)) return false
  if (aadhaarBefore(text, index)) return true
  if (cueBefore(text, index)) return false
  return isBareAadhaarDigitRun(text, index, value.length)
}

const APPLIED_DATE_RE = /(applied|submitted).{0,20}?((\d{1,2}\s)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s?\d{2,4})/i
const OTHER_DATE_RE = /\b(\d{1,2}\s)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s?\d{0,4}\b/i

/** One refusal, with the offset in the citizen's own `text` it was refused
 *  at. The offset is what makes `redactRefusedNumbers` index-anchored (round
 *  2 of the 2026-09-09 fix wave) instead of a blind whole-string replace. */
interface RefusedSpan { value: string; index: number }

/** Internal counterpart to `extractFacts`, below, which additionally exposes
 *  the `taken` array built while deriving facts from the citizen's OWN text.
 *  `extractFacts` projects `taken` away for every EXTERNAL caller (Task 4's
 *  `interpretGates.ts` included); `gateFacts`, in THIS SAME module, needs
 *  the raw array, because `taken` here contains every value the shape loop
 *  touched, REFUSALS INCLUDED — a bare Aadhaar-shaped 12-digit number, or an
 *  explicitly Aadhaar-cued number, is pushed into `taken` at the exact
 *  moment it is refused (see the `taken.push(m[0])` inside both refusal
 *  branches below), even though a refusal produces no `Fact`.
 *
 *  THE C-1 FIX: `gateFacts`'s first cut reconstructed `taken` as
 *  `baseline.facts.map(f => f.value)` — since a refusal produces no fact,
 *  that reconstruction is BLIND to every refused value, which makes a
 *  refused Aadhaar number resurrectable through a provider-supplied
 *  substring (the independent review's Finding C-1: a hostile or merely
 *  mistaken provider echoes a 10-digit fragment of the number back as its
 *  own `{ value }`, and — because `taken` never saw the refusal — the
 *  fragment sails through gateFacts's own containment checks as an
 *  innocuous "unknown" chip). Seeding `gateFacts`'s `taken` from THIS
 *  function's own `taken`, not from `facts`, closes that gap: the refused
 *  digits are in `taken` whether or not they ever became a `Fact`. */
function extractFactsInternal(engine: ServiceKey, text: string): { facts: Fact[]; droppedSensitive: boolean; taken: string[]; refused: RefusedSpan[] } {
  const facts: Fact[] = []
  const taken: string[] = []
  // Whole-branch review (2026-09-09 fix wave), Finding 1: every value ever
  // REFUSED (as opposed to merely `taken` — accepted shape/chip values are
  // `taken` too, but must never be redacted from the citizen's own text).
  // `redactRefusedNumbers`, below, is the only reader of this array — it is
  // what lets that function scrub exactly the substrings this function
  // itself refused, and nothing else, out of `appliedText`.
  //
  // Round 2 of the same fix wave: each entry now carries the OFFSET the value
  // was refused AT, not just the value — see `RefusedSpan` and
  // `redactRefusedNumbers`'s own doc comment for why a bare value is not
  // enough to redact safely.
  const refused: RefusedSpan[] = []
  let droppedSensitive = false

  // The shape loop (1855-1871). The taken check here is ONE-DIRECTIONAL
  // (1857) — `taken.some(t => t.includes(m[0]))` — deliberately different
  // from the unknown sweep's bidirectional check below (M5, design note 2).
  for (const shape of REF_SHAPES[engine] ?? []) {
    const m = text.match(shape.re)
    if (!m || taken.some(t => t.includes(m[0]))) continue
    const idx = m.index ?? 0
    if (shape.cueRequired) {
      // Round 2 of the 2026-09-09 fix wave: this branch's two separate
      // refusal tests (an explicit Aadhaar cue; an uncued bare 12-digit run)
      // are now the SINGLE rule in `refusesAsAadhaar` — same three clauses,
      // same order, same outcomes, one definition instead of three copies
      // that can drift apart (they did drift apart, which is what left
      // `voter` open; see that function's doc comment).
      if (refusesAsAadhaar(text, idx, m[0])) {
        // An Aadhaar-shaped or Aadhaar-labelled number never becomes a chip,
        // never reaches state, never reaches storage.
        droppedSensitive = true
        taken.push(m[0])
        refused.push({ value: m[0], index: idx })
        continue
      }
      if (!cueBefore(text, idx)) {
        // No labelled cue, and not Aadhaar-shaped either: any OTHER bare
        // numeric shape becomes an honest, fills-nothing chip.
        facts.push({ kind: 'reference_number', refType: 'unknown', label: UNKNOWN_LABEL, value: m[0], fills: null })
        taken.push(m[0])
        continue
      }
    }
    facts.push({ kind: 'reference_number', refType: shape.refType, label: shape.label, value: m[0], fills: shape.fills })
    taken.push(m[0])
  }

  // The unknown-number sweep (1872-1879): shown honestly, never fills a
  // bracket, and takes AT MOST ONE (the `break` — "one is enough"; without
  // it a chatty story becomes a wall of meaningless chips). The taken check
  // here is BIDIRECTIONAL (1874) — `taken.some(t => t.includes(u) ||
  // u.includes(t))` — because UNKNOWN_REF matches 8-18 alphanumerics and can
  // therefore produce a candidate that CONTAINS an already-taken 12-digit
  // number, as well as one CONTAINED BY it. Dropping either half of this OR
  // resurrects a refused Aadhaar number as an "unknown" chip under an
  // innocent label — the exact harm the refusal above exists to prevent,
  // reintroduced one loop later.
  //
  // Whole-branch review (2026-09-09 fix wave), Finding 1: `matchAll`, not
  // the plain (non-global-result) `#match` this function's own shape loop
  // above uses via `text.match(shape.re)` — that call, per its own doc
  // comment, only ever returns the FIRST match of a given shape's regex. A
  // SECOND bare 12-digit number anywhere else in the same text (e.g. two
  // Aadhaar numbers in one story) never reaches the shape loop's own
  // Aadhaar-shape check above AT ALL and, pre-fix, fell straight into this
  // sweep and was chipped as an honest "unknown" fact with no Aadhaar-shape
  // check whatsoever — the exact bypass this fix closes. `matchAll` is what
  // gives this loop each candidate's own INDEX, needed to run the SAME
  // `aadhaarBefore` cue check the shape loop's own cueRequired branch
  // already runs; UNKNOWN_REF keeps its `g` flag, and `matchAll`, like
  // `#match`, takes its own internal copy of the regex to iterate, so no
  // state leaks between calls (see the field comment on UNKNOWN_REF above).
  const unk = [...text.matchAll(UNKNOWN_REF)]
  for (const m of unk) {
    const u = m[0]
    const idx = m.index ?? 0
    if (taken.some(t => t.includes(u) || u.includes(t))) continue
    // Round 2 of the 2026-09-09 fix wave, regression A: round 1 wrote this
    // test inline as `/^\d{12}$/.test(u) || aadhaarBefore(text, idx)`, which
    // is NOT the rule the shape loop above applies — it dropped the
    // cue-gating half. Two ways it over-fired on a citizen's own legitimate
    // reference number:
    //   - "my ARN is 123456789012 and the reference number is 987654321098"
    //     chipped the first as an ARN and REFUSED the second, even though
    //     "the reference number is" is exactly the labelled cue that licenses
    //     a 12-digit number everywhere else in this file. The citizen was
    //     then shown a false "we removed a sensitive number" disclosure about
    //     a number that was never sensitive.
    //   - "I lost my aadhaar and my token is XYZAB1234 too" erased XYZAB1234,
    //     which is not even a digit run — the 32-char lookback had caught an
    //     Aadhaar mention that plainly refers to a DIFFERENT number earlier in
    //     the same sentence.
    // `refusesAsAadhaar` fixes both by construction: clause 1 requires the
    // candidate itself to be digit-only (so the cue lookback can never, on its
    // own, refuse a letter-bearing token), and clause 3 restores the
    // cue-gating the shape loop has always had.
    if (refusesAsAadhaar(text, idx, u)) {
      // Same refusal mechanism as the shape loop's own cueRequired branch
      // above: dropped, pushed into `taken` (so a later provider-supplied
      // substring's containment check still catches it, C-1) AND into
      // `refused` (so `redactRefusedNumbers` still scrubs it), never
      // chipped.
      droppedSensitive = true
      taken.push(u)
      refused.push({ value: u, index: idx })
      continue
    }
    facts.push({ kind: 'reference_number', refType: 'unknown', label: UNKNOWN_LABEL, value: u, fills: null })
    taken.push(u)
    break // one is enough
  }

  // Dates (1880-1887): only an APPLIED date auto-fills — its role is
  // unambiguous. Any other date is a chip that fills nothing. Relative
  // dates ("last month", "3/4/25", "a few weeks ago") never match BECAUSE
  // THERE IS NO REGEX FOR THEM — that absence is the implementation of
  // FR-AI-02's "ambiguous dates never auto-fill." Adding a relative-date
  // pattern would create exactly the ambiguity this rule refuses.
  const applied = text.match(APPLIED_DATE_RE)
  if (applied) {
    facts.push({ kind: 'date', refType: 'date_applied', label: DATE_APPLIED_LABEL, value: applied[2], fills: '[date you applied]' })
  }
  const otherDate = text.match(OTHER_DATE_RE)
  if (otherDate && (!applied || otherDate[0] !== applied[2])) {
    facts.push({ kind: 'date', refType: 'date_other', label: DATE_OTHER_LABEL, value: otherDate[0].trim(), fills: null })
  }

  return { facts, droppedSensitive, taken, refused }
}

/** The app deriving facts from the citizen's OWN typed text — no provider
 *  input here at all. Pure: same `(engine, text)` always produces
 *  deep-equal output, and mutates neither `text` (strings are immutable
 *  anyway) nor any module-level table.
 *
 *  This is also the seed every provider's `gateFacts` baseline is built
 *  from (D18) — the facts and refusals a citizen sees are identical
 *  whichever interpreter ran, because they are computed here, not reported
 *  by whichever interpreter ran. Projects `extractFactsInternal`'s `taken`
 *  array away — every caller OUTSIDE this module gets `{facts,
 *  droppedSensitive}` only; `gateFacts`, in this same module, calls
 *  `extractFactsInternal` directly instead, precisely so it can see `taken`
 *  (see that function's own doc comment — the C-1 fix). */
export function extractFacts(engine: ServiceKey, text: string): { facts: Fact[]; droppedSensitive: boolean } {
  const { facts, droppedSensitive } = extractFactsInternal(engine, text)
  return { facts, droppedSensitive }
}

/** Whole-branch review (2026-09-09 fix wave), Finding 2: the placeholder a
 *  refused number is replaced with wherever the citizen's own text is
 *  persisted or displayed verbatim (`appliedText` — casefile ->
 *  localStorage/Supabase, and the "You wrote" row it feeds, TrustDisclosure.
 *  tsx/UnplaceablePanel.tsx). A bracketed placeholder, matching this
 *  module's own established convention for a value that stands in for
 *  something real but unshown (`fills`'s own `'[File Number / ARN]'`, `'[date
 *  you applied]'`) — not a new voice, the same one. Registered with
 *  `interpretFactsCopyExtras()` below, the same content-safety sweep this
 *  module's other data-shaped labels already go through. */
export const REDACTED_NUMBER_PLACEHOLDER = '[number removed]'

/** Whole-branch review (2026-09-09 fix wave), Finding 2: `appliedText` (the
 *  citizen's own text, persisted verbatim and shown as "You wrote" —
 *  TrustDisclosure.tsx, UnplaceablePanel.tsx) is composed from the SAME
 *  `text` this module's own refusal rules already run against for `facts` —
 *  but, pre-fix, from the RAW value, not the gated one. A real Aadhaar
 *  number the citizen typed was correctly refused from `facts` (never
 *  chipped) while surviving unredacted in `appliedText`, directly
 *  contradicting the shipped trust-disclosure copy's own promise ("NextMove
 *  never keeps Aadhaar numbers").
 *
 *  This function is the fix: called by every site that composes the `text`
 *  which becomes `interp.text` (and, eventually, `appliedText`) —
 *  `DescribeBlock.tsx`'s success path and `session.ts`'s
 *  `INTERPRETATION_FAILED` arm — AFTER `gateInterpretation`/`gateFacts` has
 *  already run against the UNREDACTED text (redacting first would blind the
 *  fact-extraction rules to the very shapes/cues they exist to catch). Reuses
 *  `extractFactsInternal`'s own `refused` array — exactly the substrings
 *  THIS SAME module already decided to refuse, never re-derived — so a
 *  citizen's typed text and the fact-chip refusal it produced can never
 *  disagree about which numbers were kept out. Deliberately does NOT consult
 *  `gateFacts`/provider facts: `appliedText` is the citizen's OWN words, and
 *  every value a provider could refuse is, by `gateFacts`'s own verbatim
 *  gate, already a literal substring of `text` — so the baseline's own
 *  refusals are exactly the set that can appear in this text to begin with.
 *  Pure — no `text` mutation (strings are immutable regardless), same
 *  `(engine, text)` in, same string out.
 *
 *  ROUND 2 OF THE SAME FIX WAVE, regression B — INDEX-ANCHORED, not a global
 *  `split(value).join(...)`. That first cut replaced EVERY textual occurrence
 *  of a refused value, which mangled an unrelated longer number that merely
 *  contained the refused digits:
 *
 *    'first 123456789012 then 1234567890123456 end'
 *      -> 'first [number removed] then [number removed]3456 end'
 *
 *  The second, 16-digit number is not Aadhaar-shaped, was never refused, and
 *  belongs to the citizen — it must survive intact, not be rewritten into a
 *  placeholder/digits hybrid that is both wrong and unreadable. Replacement
 *  now happens at validated SPANS: the offset the value was actually refused
 *  at, plus any other occurrence that is itself a maximal digit run (no digit
 *  on either side of it). That second part is deliberate and is not a
 *  loophole: it keeps the case where the citizen typed the SAME refused
 *  number twice (the shape loop refuses the first occurrence and the sweep's
 *  containment check then skips the second, so only ONE offset is ever
 *  recorded) fully scrubbed, while the digit-adjacency test is exactly what
 *  stops a span from ever landing inside a longer number. Spans are applied
 *  right-to-left so earlier offsets stay valid, and an overlapping span is
 *  skipped rather than double-substituted. */
export function redactRefusedNumbers(engine: ServiceKey, text: string): string {
  const { refused } = extractFactsInternal(engine, text)

  const spans: RefusedSpan[] = []
  const addSpan = (value: string, index: number) => {
    if (!spans.some(s => s.index === index && s.value === value)) spans.push({ value, index })
  }
  for (const { value, index } of refused) {
    addSpan(value, index)
    // Every OTHER occurrence of the same refused value that stands alone as
    // its own maximal digit run — never one embedded in a longer number.
    for (let at = text.indexOf(value); at !== -1; at = text.indexOf(value, at + 1)) {
      const before = at > 0 ? text[at - 1] : ''
      const after = at + value.length < text.length ? text[at + value.length] : ''
      if (!/\d/.test(before) && !/\d/.test(after)) addSpan(value, at)
    }
  }

  spans.sort((a, b) => b.index - a.index)
  let out = text
  let nextStart = text.length // leftmost boundary already consumed, right-to-left
  for (const { value, index } of spans) {
    if (index + value.length > nextStart) continue // overlaps a span already applied
    out = out.slice(0, index) + REDACTED_NUMBER_PLACEHOLDER + out.slice(index + value.length)
    nextStart = index
  }
  return out
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** `value` matches `re` across its ENTIRE length — used to classify a
 *  provider-supplied value "anchored to the whole value" (design note 8,
 *  step 5), rather than searching for the shape somewhere inside a larger
 *  string the way `extractFacts`'s own shape loop searches `text`. */
function matchesWhole(re: RegExp, value: string): boolean {
  const m = value.match(re)
  return !!m && m[0] === value
}

type Classified =
  | { fact: Fact; droppedSensitive: false; category: 'shape' | 'unknown' | 'date' }
  | { fact: null; droppedSensitive: true; category: 'shape' }
  | { fact: null; droppedSensitive: false; category: null }

/** Classifies ONE already-verbatim, already-located value using this
 *  module's OWN rules — never the provider's say-so. `REF_SHAPES[engine]`
 *  anchored to the whole value, then `cueBefore`/`aadhaarBefore` at that
 *  value's own index in `text`, then the date patterns, then `UNKNOWN_REF`.
 *  A value this cannot classify at all is reported as such (category:
 *  null) so the caller drops it — never chipped under a model-authored
 *  label. */
function classifyValue(engine: ServiceKey, text: string, value: string, index: number): Classified {
  // THE ROUND-2 FIX (2026-09-09 fix wave, scoped re-review). This runs BEFORE
  // the shape loop, and that placement is the whole point of it.
  //
  // Round 1 put the Aadhaar guard inside the `UNKNOWN_REF` branch at the
  // BOTTOM of this function — the branch reached only when NO shape matched.
  // On `passport` and `sir` that was enough, because neither engine has a
  // shape that a 10-digit Aadhaar fragment can satisfy, so such a fragment
  // always fell through to the bottom. `voter` does: `\b\d{9,13}\b` matches a
  // 9-to-13-digit whole value, so the shape loop below claimed the fragment,
  // returned an honest "unknown" chip, and RETURNED — the round-1 guard, two
  // dozen lines further down, never executed. A provider-supplied fragment of
  // a citizen-typed Aadhaar number was chipped and persisted on `voter` while
  // being correctly refused on `passport` and `sir`.
  //
  // Guarding one more engine, or one more branch, would have left exactly the
  // same trap set for the next shape anyone adds. Asking `refusesAsAadhaar`
  // first closes the CLASS instead: no engine's `REF_SHAPES`, present or
  // future, can shadow a rule that has already run before the loop starts.
  // See `refusesAsAadhaar`'s own doc comment for the rule itself, including
  // why a legitimately cued reference number is still licensed here.
  if (refusesAsAadhaar(text, index, value)) {
    return { fact: null, droppedSensitive: true, category: 'shape' }
  }

  for (const shape of REF_SHAPES[engine] ?? []) {
    if (!matchesWhole(shape.re, value)) continue
    if (shape.cueRequired) {
      // Both tests below are kept AFTER the round-2 guard above, deliberately,
      // and neither is redundant in the way it looks:
      //  - `aadhaarBefore` is belt-and-braces for a future `cueRequired` shape
      //    that is NOT purely numeric (every one today is, which is what makes
      //    the guard's digit-only clause 1 sufficient for them). A refusal is
      //    the wrong thing to delete on the strength of a table's current
      //    contents.
      //  - `/^\d{12}$/` is genuinely still load-bearing, and is NOT covered by
      //    the guard: the guard asks whether the value's MAXIMAL digit run is
      //    12 long, so a 12-digit value sitting inside a LONGER run (say the
      //    provider hands back the first 12 digits of a 16-digit number in the
      //    text) does not satisfy it — but such a value is still, in isolation,
      //    exactly Aadhaar-shaped, and this file has refused it since before
      //    the fix wave. Kept.
      if (aadhaarBefore(text, index)) {
        return { fact: null, droppedSensitive: true, category: 'shape' }
      }
      if (!cueBefore(text, index)) {
        if (/^\d{12}$/.test(value)) {
          return { fact: null, droppedSensitive: true, category: 'shape' }
        }
        return {
          fact: { kind: 'reference_number', refType: 'unknown', label: UNKNOWN_LABEL, value, fills: null },
          droppedSensitive: false,
          category: 'shape',
        }
      }
    }
    return {
      fact: { kind: 'reference_number', refType: shape.refType, label: shape.label, value, fills: shape.fills },
      droppedSensitive: false,
      category: 'shape',
    }
  }

  const applied = text.match(APPLIED_DATE_RE)
  if (applied && applied[2] === value) {
    return {
      fact: { kind: 'date', refType: 'date_applied', label: DATE_APPLIED_LABEL, value, fills: '[date you applied]' },
      droppedSensitive: false,
      category: 'date',
    }
  }
  const otherDate = text.match(OTHER_DATE_RE)
  if (otherDate && otherDate[0].trim() === value) {
    return {
      fact: { kind: 'date', refType: 'date_other', label: DATE_OTHER_LABEL, value, fills: null },
      droppedSensitive: false,
      category: 'date',
    }
  }

  // A fresh, non-global clone of UNKNOWN_REF's source: the module-level
  // UNKNOWN_REF constant carries the `g` flag for the sweep in
  // `extractFacts`, and reusing a global regex for a whole-value #match
  // test would risk `lastIndex` state bleeding across calls. Constructing a
  // one-off non-global regex per call sidesteps that entirely.
  if (matchesWhole(new RegExp(UNKNOWN_REF.source), value)) {
    // Whole-branch review (2026-09-09 fix wave), Finding 1, second entry
    // point: `matchesWhole` above tests `value` in ISOLATION (design note 8,
    // step 5) — a provider-supplied FRAGMENT of a citizen-typed Aadhaar
    // number (wrong length to match any REF_SHAPES pattern, and possibly
    // with no `\b` boundary anywhere in the raw text — see
    // `isBareAadhaarDigitRun`'s own doc comment) sails through that isolated
    // test with nothing to stop it.
    //
    // Round 2: the guard at the TOP of this function is now the primary
    // catch for that, and it fires whichever branch the value would have
    // reached. What is left reachable here is the one case the top guard
    // licenses and this branch does not: a digit run that DOES carry a
    // legitimate reference-number cue but is NOT a whole recognised shape —
    // i.e. a 9-to-11-digit prefix of a cued 12-digit run. The cue points at
    // the whole run, the whole run is Aadhaar-shaped, and a fragment of it is
    // still a partial leak, so it is refused here. Refused the same way every
    // other Aadhaar refusal in this file is: `fact: null, droppedSensitive:
    // true` — never chipped under an "unknown" label.
    if (/^\d+$/.test(value) && (isBareAadhaarDigitRun(text, index, value.length) || aadhaarBefore(text, index))) {
      return { fact: null, droppedSensitive: true, category: 'shape' }
    }
    return {
      fact: { kind: 'reference_number', refType: 'unknown', label: UNKNOWN_LABEL, value, fills: null },
      droppedSensitive: false,
      category: 'unknown',
    }
  }

  return { fact: null, droppedSensitive: false, category: null }
}

/** THE C1 FIX, and the reason this module is a gate and not a helper (D18).
 *  `extractFacts` above is the app deriving facts from the citizen's text.
 *  `gateFacts` is what the gate module (`interpretGates.ts`, Task 4) calls
 *  for EVERY provider, unconditionally, and it is the only function that
 *  module imports from here.
 *
 *  1. `extractFactsInternal(engine, text)` runs first — NOT the public
 *     `extractFacts`, because `gateFacts` also needs the internal `taken`
 *     array, refusals included (see that function's doc comment; this is
 *     the independent review's Finding C-1: seeding `taken` from
 *     `baseline.facts` alone is blind to every refused value, since a
 *     refusal produces no fact — which makes a refused Aadhaar number
 *     resurrectable through a provider-supplied substring). The baseline's
 *     facts, `droppedSensitive`, and `taken` — refusals included — seed
 *     every provider's dedup list; a boolean `unknownChipUsed`, seeded from
 *     whether the baseline already produced a `refType: 'unknown'` chip
 *     (Finding I-1), seeds the one-unknown budget. This is why the facts a
 *     citizen sees are identical whichever interpreter ran.
 *  2. For each `rawFacts` entry, only `value` is ever read. Every other key
 *     a provider sent — `label`, `fills`, `refType`, `kind`, `edited`, or
 *     anything invented — is never read and never copied. `label` is
 *     rendered VERBATIM to the citizen and `fills` chooses which bracket of
 *     a letter to a government office receives which substring; a
 *     `.filter()` passes both through by reference, which is precisely the
 *     shipped prototype's own gate and precisely the defect this function
 *     exists to close.
 *  3. The verbatim gate: the whitespace-normalised `text` must include the
 *     whitespace-normalised `value`, CASE-SENSITIVELY. A non-string, empty,
 *     whitespace-only, or non-substring `value` is dropped.
 *  4/5. The surviving value is CLASSIFIED using this module's own rules —
 *     never the provider's label/fills/refType — and de-duplicated against
 *     everything already taken (refusals included — the C-1 fix), using the
 *     SAME one-directional (shape) / bidirectional (unknown) split
 *     `extractFacts` itself uses (design note 2/M5). A classified value
 *     whose `refType` is `'unknown'` is additionally refused once the
 *     one-unknown budget is already spent, by the baseline OR by an earlier
 *     provider fact in this same call (the I-1 fix). A value this module
 *     cannot classify at all is dropped, never chipped under a
 *     model-authored label.
 *  6. `droppedSensitive` is the OR of every refusal across both the
 *     baseline and every provider fact. It is NEVER read from a provider —
 *     `RawInterpretation` does not even carry the field (Task 2 design note
 *     1): a model that mislabels an Aadhaar number as an ARN would report
 *     `droppedSensitive: false` if it were trusted, and the refusal
 *     sentence would never render. */
export function gateFacts(
  engine: ServiceKey,
  text: string,
  rawFacts: readonly { value: string }[],
): { facts: Fact[]; droppedSensitive: boolean } {
  const baseline = extractFactsInternal(engine, text)
  const facts: Fact[] = [...baseline.facts]
  const taken: string[] = [...baseline.taken]
  let droppedSensitive = baseline.droppedSensitive
  // THE I-1 FIX: the one-unknown-chip budget carries forward from the
  // baseline. `extractFacts`'s own sweep already enforces "at most one
  // unknown chip" WITHIN a single call (the `break` at design note 4); this
  // flag extends the SAME guarantee across a whole `gateFacts` call, so a
  // provider cannot add a second `refType: 'unknown'` chip beyond whatever
  // budget the baseline already spent — see Finding I-1. Without this, two
  // provider-supplied fragments that individually clear the containment
  // checks (Finding C-1) can each be chipped separately, amplifying a
  // partial leak into a full reconstruction.
  let unknownChipUsed = baseline.facts.some(f => f.refType === 'unknown')

  const normalizedText = normalizeWs(text)

  for (const raw of rawFacts) {
    const value = raw && typeof raw.value === 'string' ? raw.value : null
    if (value === null) continue
    if (value.trim() === '') continue
    if (!normalizedText.includes(normalizeWs(value))) continue
    // An exact-duplicate safety net, on top of the containment checks below
    // — covers dates too, which the containment split does not apply to
    // (extractFacts never pushes a date's value into `taken` either).
    if (facts.some(f => f.value === value)) continue

    const directIndex = text.indexOf(value)
    const index = directIndex !== -1 ? directIndex : normalizedText.indexOf(normalizeWs(value))
    const classified = classifyValue(engine, text, value, index)

    if (classified.droppedSensitive) {
      droppedSensitive = true
      taken.push(value)
      continue
    }
    if (!classified.fact) continue

    const alreadyTaken = classified.category === 'unknown'
      ? taken.some(t => t.includes(value) || value.includes(t))
      : taken.some(t => t.includes(value))
    if (alreadyTaken) continue

    // THE I-1 FIX, continued: an accepted candidate whose reconstructed
    // fact still carries `refType: 'unknown'` — whether classified via the
    // shape loop's own honest-chip fallback (category 'shape') or via
    // UNKNOWN_REF (category 'unknown') — is refused once the budget is
    // already spent, by the baseline or by an earlier provider fact in this
    // same loop.
    if (classified.fact.refType === 'unknown' && unknownChipUsed) continue

    facts.push(classified.fact)
    if (classified.category !== 'date') taken.push(value)
    if (classified.fact.refType === 'unknown') unknownChipUsed = true
  }

  return { facts, droppedSensitive }
}

/** Every `label` string `REF_SHAPES` (plus the unknown/date labels) ships,
 *  addressed for the content-safety scan the way `prep.ts`'s
 *  `prepCopyExtras()` sweeps `PREP`'s own data-shaped copy — same
 *  iterate-and-push shape, same `{at, text}` output, so this module's copy
 *  is swept by the same guardrail harness without being relocated into
 *  `screenCopy.ts` (which owns SCREEN-registered copy, not data-shaped
 *  copy attached to a lookup table — Task 2 design note 2). */
export function interpretFactsCopyExtras(): CopyLocation[] {
  const out: CopyLocation[] = []
  for (const [engine, shapes] of Object.entries(REF_SHAPES)) {
    shapes.forEach((shape, i) => {
      out.push({ at: `${engine}:REF_SHAPES[${i}].label`, text: shape.label })
    })
  }
  out.push({ at: 'interpretFacts:UNKNOWN_LABEL', text: UNKNOWN_LABEL })
  out.push({ at: 'interpretFacts:DATE_APPLIED_LABEL', text: DATE_APPLIED_LABEL })
  out.push({ at: 'interpretFacts:DATE_OTHER_LABEL', text: DATE_OTHER_LABEL })
  // Whole-branch review (2026-09-09 fix wave), Finding 2: `redactRefusedNumbers`'s
  // own placeholder is citizen-facing (it can appear inside the quoted "You
  // wrote" text) — swept the same as every other data-shaped label above.
  out.push({ at: 'interpretFacts:REDACTED_NUMBER_PLACEHOLDER', text: REDACTED_NUMBER_PLACEHOLDER })
  return out
}
