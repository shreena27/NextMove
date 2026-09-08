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
