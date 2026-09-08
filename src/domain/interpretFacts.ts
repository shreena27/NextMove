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

const APPLIED_DATE_RE = /(applied|submitted).{0,20}?((\d{1,2}\s)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s?\d{2,4})/i
const OTHER_DATE_RE = /\b(\d{1,2}\s)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s?\d{0,4}\b/i

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
function extractFactsInternal(engine: ServiceKey, text: string): { facts: Fact[]; droppedSensitive: boolean; taken: string[] } {
  const facts: Fact[] = []
  const taken: string[] = []
  let droppedSensitive = false

  // The shape loop (1855-1871). The taken check here is ONE-DIRECTIONAL
  // (1857) — `taken.some(t => t.includes(m[0]))` — deliberately different
  // from the unknown sweep's bidirectional check below (M5, design note 2).
  for (const shape of REF_SHAPES[engine] ?? []) {
    const m = text.match(shape.re)
    if (!m || taken.some(t => t.includes(m[0]))) continue
    const idx = m.index ?? 0
    if (shape.cueRequired) {
      if (aadhaarBefore(text, idx)) {
        // An explicitly-labelled Aadhaar number never becomes a chip, never
        // reaches state, never reaches storage.
        droppedSensitive = true
        taken.push(m[0])
        continue
      }
      if (!cueBefore(text, idx)) {
        // No labelled cue: a bare 12-digit number is Aadhaar-shaped and is
        // refused outright — Aadhaar and a passport ARN are both 12 digits,
        // inseparable in principle (FR-AI-02). Refused, not chipped. Any
        // OTHER bare numeric shape becomes an honest, fills-nothing chip.
        if (/^\d{12}$/.test(m[0])) {
          droppedSensitive = true
          taken.push(m[0])
          continue
        }
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
  const unk = text.match(UNKNOWN_REF) ?? []
  for (const u of unk) {
    if (!taken.some(t => t.includes(u) || u.includes(t))) {
      facts.push({ kind: 'reference_number', refType: 'unknown', label: UNKNOWN_LABEL, value: u, fills: null })
      taken.push(u)
      break // one is enough
    }
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

  return { facts, droppedSensitive, taken }
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
  for (const shape of REF_SHAPES[engine] ?? []) {
    if (!matchesWhole(shape.re, value)) continue
    if (shape.cueRequired) {
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
  return out
}
