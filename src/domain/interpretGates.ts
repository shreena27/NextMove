/** The nominal brand that makes a `GatedInterpretation` (interpret.ts)
 *  impossible to forge outside this module — design note 1a of Task 2's
 *  brief.
 *
 *  TypeScript is structural: a plain interface with the same field list as
 *  `GatedInterpretation` would let any module build an object that "looks"
 *  gated, and worse, a provider typed `interpret(): Promise<RawInterpretation>`
 *  could return an object that ALSO happens to satisfy `GatedInterpretation`'s
 *  shape — excess-property checks only fire on a fresh object literal
 *  assigned directly, never on a value that crosses a function-return
 *  boundary. A `unique symbol` brand closes both holes: `GATED` is declared
 *  (never given a runtime value — no JS is emitted for it) and this module
 *  is the only one whose scope contains it, so it is the only module that
 *  could ever legitimately hold something of type `GatedBrand`. No other
 *  module can produce a value of type `GatedBrand` without an explicit
 *  `as unknown as GatedBrand` escape hatch — loud, reviewable, and never
 *  produced by ordinary or accidental construction.
 *
 *  This module deliberately exports the TYPE only, never a value of it —
 *  `interpret.ts` re-exports the type so `GatedInterpretation` can be
 *  declared there, next to its sibling `RawInterpretation`.
 *
 *  Two separate guarantees, named separately on purpose so a later reader
 *  never collapses them into one over-claim:
 *   1. THIS brand stops a *forged* `GatedInterpretation` — an object built
 *      outside the real gate that nonetheless type-checks as gated.
 *   2. It does NOT force anyone to *call* the gate in the first place —
 *      a provider or screen could simply never invoke it and route raw,
 *      untrusted data around some other way. That is Task 17's job (a grep
 *      pinning the gate's single call site), a wholly different mechanism. */
declare const GATED: unique symbol
export type GatedBrand = typeof GATED

// ---------------------------------------------------------------------------
// gateInterpretation — the MAPPING gate (branch, enum, span), plus the
// unconditional call into Task 3's gateFacts (the verbatim-fact gate, the
// numeric-cue gate, the Aadhaar refusal, the ambiguous-date rule). FR-AI-02
// names six gates; all six are enforced from this module, three implemented
// here and three implemented by gateFacts and called from here — never the
// simulator's job, never optional (C1, D18).
//
// Honest framing, transcribed from the prototype's own comment
// (2026-09-05, grill A2 — chunk 5): the CONFIRM SCREEN is the sole safety
// gate. Every gate below is a real, cheap, in-code filter on any provider's
// output — none of them a safety guarantee on its own.
import type { AnswerRecord } from './types'
import type { ServiceKey } from './casefile'
import type { ChainEntry, GatedInterpretation, GatedMapping, RawInterpretation } from './interpret'
import { gateFacts } from './interpretFacts'

/** Transcribed verbatim, entry for entry, from
 *  design/nextmove-v1-prototype.html:1903. Pinned at exactly 38 entries in
 *  interpretGates.test.ts — a silently-shortened stopword list weakens the
 *  span gate invisibly. */
export const SPAN_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'my', 'i', 'me', 'it', 'its', 'is', 'was', 'are', 'were',
  'to', 'of', 'in', 'on', 'for', 'and', 'or', 'has', 'have', 'had', 'been',
  'be', 'with', 'at', 'so', 'but', 'this', 'that', 'there', 'here', 'not',
  'no', 'yes', 'do', 'did', 'does',
])

/** Transcribed from design/nextmove-v1-prototype.html 1904-1907, plus D3's
 *  `minSpanTokens` parameter (the prototype hardcodes MIN_SPAN_TOKENS=1,
 *  the simulator's own floor; production passes 3 here instead). An
 *  all-stopword span proves nothing — the citizen's own words have to carry
 *  some content beyond "it was the". Language-agnostic BY CONSTRUCTION:
 *  SPAN_STOPWORDS is an English word list used only to REJECT an
 *  all-stopword span, so non-English tokens are never penalised as
 *  stopwords — the safe direction (scope exclusion 7). A token that strips
 *  to nothing (e.g. punctuation, or a non-ASCII script with no digits)
 *  simply doesn't count towards the length floor.
 *
 *  KNOWN LIMITATION, recorded here durably (Task 4 round-1 review, Important
 *  finding 4) rather than left only in a review artifact: the `[^a-z0-9]`
 *  strip above counts ONLY ASCII alphanumerics towards `minSpanTokens` — a
 *  span made up entirely of non-Latin-script characters (pure Devanagari,
 *  Tamil, Bengali, etc., as opposed to romanized Hinglish) strips to zero
 *  surviving tokens and therefore fails the length floor regardless of
 *  content, before the stopword check ever runs. At production's real
 *  `minSpanTokens: 3`, natural non-Latin-script prose essentially never
 *  contains three bare ASCII-alphanumeric tokens (a citizen would have to
 *  quote three digits/Latin words in a row), so non-Latin-script input may
 *  not be able to produce ANY confirmed mapping in production today. This
 *  fails CLOSED — safe, not a fabrication risk — but it is a real,
 *  currently-accepted product-level limitation, transcribed from the locked
 *  prototype and not something this task is authorized to redesign. See
 *  interpretGates.test.ts's Devanagari fixture for the pinned test evidence
 *  behind this claim. */
export function spanMeaningful(span: string, minSpanTokens: number): boolean {
  const t = (span || '')
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
  if (t.length < minSpanTokens) return false
  return t.some(w => !SPAN_STOPWORDS.has(w))
}

/** Prototype's own `norm` (1910): whitespace-normalised AND lowercased —
 *  the span gate is provenance display, not a value that gets pasted into a
 *  letter, so case does not matter here. Contrast interpretFacts.ts's own
 *  `normalizeWs`, which never lowercases, because a fact's `value` IS
 *  pasted into a letter verbatim (see the fact-gate comment in
 *  gateInterpretation below). */
function normSpan(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Resolves one chain entry's option-value set against the KNOWN
 *  (confirmed) answers only — never the in-progress `mapped` set this gate
 *  accumulates. This mirrors the prototype's own `opts()` closures
 *  (1751-1774): every entry's `opts()` reads plain constants, and SIR's
 *  reads `S.answers.sirState` straight off the global — which, at the
 *  moment the gate loop runs (before any of THIS interpretation's own picks
 *  are ever written back to state), is identical to `knownAnswers`.
 *  `reachableIf` is different ON PURPOSE (prototype 1916): it explicitly
 *  composes `{...known, ...mapped}` so a branch gate CAN see an earlier
 *  pick from this same interpretation; `opts()` never does that in the
 *  prototype, so this port doesn't either.
 *
 *  Exported for `templates/UnplaceablePanel.tsx` (Task 14, "Gap 2" of that
 *  task's own brief): the unplaceable panel needs the FULL option list for
 *  whichever question it offers, which means the exact same "is this a
 *  function or a plain array, call it correctly if so" resolution this gate
 *  already performs — writing a second copy would be exactly the kind of
 *  drift-prone duplication this module exists to avoid. `templates/`
 *  importing from `domain/` is layering-legal (only the reverse direction
 *  is forbidden); adding `export` here changes nothing about this module's
 *  own call site below. */
export function resolveOptionValues(entry: ChainEntry, knownAnswers: AnswerRecord): readonly string[] {
  return typeof entry.optionValues === 'function' ? entry.optionValues(knownAnswers) : entry.optionValues
}

/** Produces the only runtime values of type `GatedBrand` this codebase ever
 *  makes. `GATED` (above) is declared, never defined — no JS is emitted for
 *  it — so there is no way, even in this module, to hold a genuine value of
 *  `typeof GATED`. This uses the exact `as unknown as GatedBrand` escape
 *  hatch the brand's own doc comment names as the only way anyone could
 *  ever produce one.
 *
 *  The runtime value is a plain string literal cast — `'gated' as unknown
 *  as GatedBrand` — deliberately NOT a fresh `Symbol()` (Task 4 round-1
 *  review, Important finding 3). A `Symbol` was tried first: it type-checks
 *  fine, but `structuredClone` throws `DataCloneError` on a `Symbol`
 *  property value, and `JSON.stringify` silently drops it — which makes the
 *  whole `GatedInterpretation` this function stamps non-cloneable and
 *  non-serializable again, regressing the EXACT property Task 2's own
 *  round-1 review fix deliberately established (see interpret.ts's
 *  `GatedMapping` doc comment, and this module's own re-export note above:
 *  "so `GatedInterpretation` is cloneable and serializable"). That
 *  regression would surface later, far from its cause — on a session
 *  snapshot or case-persistence path, not here.
 *
 *  The Symbol bought nothing at runtime: nothing in this codebase reads
 *  `__gated` (it exists purely as a compile-time brand — see the module
 *  header's guarantee #2), and a FRESH symbol per call could never support
 *  a runtime identity check anyway. Unforgeability comes entirely from the
 *  TYPE SYSTEM here — the `unique symbol` brand on `GatedBrand` itself,
 *  nameable only inside this module's scope — never from the runtime value
 *  being unguessable. A string literal is exactly as unforgeable as a
 *  `Symbol()` for that purpose: producing a `GatedBrand` outside this
 *  module still requires the identical `as unknown as GatedBrand` escape
 *  hatch either way, loud and reviewable. `structuredClone(result)` not
 *  throwing is pinned directly in interpretGates.test.ts, so the property
 *  is verified, not merely assumed. Kept as a function (not hoisted to a
 *  module-level constant) purely so every real `GatedInterpretation` is
 *  produced through one call site, matching the brand's "only this module
 *  constructs one" framing above. */
function stampGated(): GatedBrand {
  return 'gated' as unknown as GatedBrand
}

/** Ports gateInterpretation (design/nextmove-v1-prototype.html 1909-1928)
 *  exactly, with three argument changes this codebase forces: the prototype
 *  reads `S.answers` off the global (1912) and closes over `ctx.chain`;
 *  this port is pure, so `knownAnswers` is injected (the same discipline
 *  `caseSnapshot` and `migrateLocalCases` already follow) and `chain` is a
 *  parameter. `engine` is new — `gateFacts` needs it (D18). `minSpanTokens`
 *  is D3's per-provider floor (simulator 1, production 3). `provenance` is
 *  D17's capture-time string, carried through rather than derived later.
 *
 *  This module owns the `__gated` brand (design note 1a, above) and is the
 *  ONLY place a `GatedInterpretation` can be constructed.
 *
 *  THE GATE ORDER IS LOAD-BEARING AND IS THE PROTOTYPE'S OWN (1915-1925).
 *  Per chain entry, in chain order: reach -> mapping lookup -> branch gate
 *  -> enum gate -> span gate -> accept. Do not reorder this for
 *  readability. The one named exception is D16 (see the comment at the
 *  enum-gate step below) — a deliberate, already-decided timing deviation
 *  that changes WHEN the (possibly-throwing) option-set lookup happens,
 *  never the four gates' relative order and never any mapping's fate. */
export function gateInterpretation(
  chain: ChainEntry[],
  engine: ServiceKey,
  knownAnswers: AnswerRecord,
  text: string,
  raw: RawInterpretation,
  minSpanTokens: number,
  provenance: string,
): GatedInterpretation {
  const hay = normSpan(text)
  const known = { ...knownAnswers }
  const mapped: AnswerRecord = {}
  const mappings: GatedMapping[] = []
  const discarded: { questionId: string; reason: 'unreachable' }[] = []

  for (const q of chain) {
    // 1. reach — `mapped` accumulates as the loop runs (prototype 1916), so
    //    a later branch gate in THIS SAME chain can see an earlier pick
    //    from this same interpretation.
    const reach = !q.reachableIf || q.reachableIf({ ...known, ...mapped })
    // 2. mapping lookup — no mapping is not a discard: nothing was
    //    proposed for this question at all (prototype 1917-1918).
    const m = raw.mappings.find(x => x.questionId === q.questionId)
    if (!m) continue
    // 3. branch gate (prototype 1920) — checked BEFORE the enum and span
    //    checks, so an unreachable mapping that is ALSO malformed still
    //    records as discarded, matching the prototype and giving the
    //    citizen the honest "we also read something about X but set it
    //    aside" note (AC-AI-3).
    if (!reach) {
      discarded.push({ questionId: q.questionId, reason: 'unreachable' })
      continue
    }
    // 4. enum gate (prototype 1921).
    //
    // D16 — one deliberate, already-decided micro-deviation from the
    // prototype's own line order, recorded here because the Global
    // Constraints say elsewhere that gate order matches the prototype
    // exactly and this is the named exception. The prototype resolves
    // `const opts = q.opts()` UNCONDITIONALLY, on the line above its
    // reachability branch (1919, just above 1920) — for every chain entry
    // that has a raw mapping, whether or not that mapping is about to be
    // discarded. This port resolves the option set HERE instead: only for
    // a mapping that has already survived the branch gate above. The
    // reason is that this lookup CAN throw — SIR's option set resolves
    // through `optionsForPhase` (sirConfig.ts:24-36), which genuinely
    // throws for an unsupported state or a phase missing from its options
    // map. Eagerly resolving it (matching the prototype's literal line
    // order) for a question the branch gate is about to discard would
    // convert a discarded mapping into a crashed interpretation and a
    // permanently stuck `reading` flag (I2) — the flow never even reaches
    // the confirm/unplaceable screen. Task 2's TOTAL `sirQ1OptionValues`
    // (design note 5a) and Task 5's whole-body try/catch are the other two
    // halves of this same fix; all three ship, and this is Task 4's part.
    // The four gates' RELATIVE order is unchanged by this — no mapping's
    // fate changes, only WHEN the (possibly-throwing) lookup happens.
    const opts = resolveOptionValues(q, known)
    if (!opts.includes(m.value)) continue // silent drop, NOT a discard — design note 2 step 4: telling the citizen the model proposed a value that doesn't exist would report a model defect as if it were about their text
    // 5. span gate (prototype 1922) — provenance display plus a cheap
    //    anti-fabrication tripwire: it proves the model quoted the user,
    //    not that the quote supports the mapping (FR-AI-02). Silent drop.
    if (!m.span || !hay.includes(normSpan(m.span)) || !spanMeaningful(m.span, minSpanTokens)) continue
    // 6. accept.
    mapped[q.questionId] = m.value
    mappings.push({ questionId: q.questionId, value: m.value, span: m.span, optionValues: opts })
  }

  // The fact gate (Task 3's gateFacts) — called UNCONDITIONALLY, exactly
  // once, for every provider (C1, D18); not the simulator's job to call and
  // not optional. Note the asymmetry with the span gate above: the fact
  // gate is CASE-SENSITIVE (interpretFacts.ts's own `normalizeWs` never
  // lowercases) while the span gate above IS case-insensitive (`normSpan`
  // lowercases). This is deliberate, not a bug: a span is prose matched
  // only for PROVENANCE display, so 'Rejected' and 'rejected' are equally
  // good evidence; a fact's `value` gets pasted VERBATIM into a government
  // letter, where 'AB1234567' and 'ab1234567' are not interchangeable — a
  // citizen's real file number has one specific case, and silently
  // re-casing it (or accepting a differently-cased "match") would hand a
  // wrong reference number to a government office.
  const { facts, droppedSensitive } = gateFacts(engine, text, raw.facts)

  return {
    __gated: stampGated(),
    mappings,
    discarded,
    facts,
    droppedSensitive,
    unplaceable: mappings.length === 0,
    provenance,
  }
}
