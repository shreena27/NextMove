// The concrete simulator provider — the first place a provider and the
// provider-agnostic gates (Tasks 3/4) actually meet. "The simulator is a
// provider like any other and gets no privileges" (task brief) is not a
// slogan here, it's structural: this module returns RAW only, never calls
// gateInterpretation itself, and ships zero fact-extraction logic of its
// own. That is what makes the Global Constraint (every provider is gated
// the same way, in one place, by code the provider cannot see or skip)
// structural rather than procedural — nothing about this file's shape
// depends on anyone remembering to call the gate; the gate is the ONLY
// place a GatedInterpretation can be produced at all (interpretGates.ts's
// `__gated` brand), and this module never even imports it.
//
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html (git tag
// v1-design-lock-2) — SIM_RULES (1784-1817), INCLUDING THE DELIBERATE FLAW
// documented at 1779-1783 (transcribed verbatim just below), and
// simulateInterpretation's skip/first-match-wins/span-is-the-match shape
// (1930-1944) — MINUS the prototype's own `extractFacts` and
// `gateInterpretation` calls at 1941/1943. The prototype's version ends
// `return gateInterpretation(...)`, which is convenient there (one
// interpreter, hardcoded) and wrong here: this build has two providers, and
// a provider that gates itself is a provider for which the gate is an
// OPTIONAL step every other provider (Gemini included) could omit. In this
// port the provider's contract is `Promise<RawInterpretation>` (Task 2) and
// the ORCHESTRATOR (`session/interpretation.ts`) gates — always, for every
// provider, in exactly one place.
import type { AnswerRecord } from './types'
import type { ChainEntry, InterpretationRequest, InterpreterProvider, RawInterpretation } from './interpret'

interface SimRule {
  re: RegExp
  v: string
}

// Simulator phrase tables. First matching rule per question wins; rules are
// ordered so more specific readings beat generic ones. The match itself is
// the span — verbatim by construction.
//
// DELIBERATE FLAW (kept on purpose, per spec FR-AI-06 / prototype comment
// 1779-1783): the `informal` rule below reads any "called me/was called" as
// the USER having called — an agent/patient confusion exactly like a real
// model makes. It exists so reviewers experience catching a wrong reading
// on the confirm screen, which is this feature's actual safeguard. DO NOT
// "FIX" THIS RULE — removing it is the defect, not the fix. See
// simInterpreter.test.ts's own "THE DELIBERATE FLAW" test, which asserts
// the wrong reading on purpose and exists specifically to stop a future
// reader from "correcting" this.
const SIM_RULES: Record<string, SimRule[]> = {
  q1: [
    { re: /adverse|negative report|objection|looks negative/i, v: 'adverse' },
    { re: /report (has been |was |is )?(received|submitted|done)|verification.{0,30}(done|complete|completed|finished|over)/i, v: 'verified_no_progress' },
    { re: /police.{0,50}(came|come|visited|contacted|met)/i, v: 'contacted_incomplete' },
    { re: /(no|not|never|haven'?t|havent|nothing).{0,40}(police|verification)|police.{0,40}(hasn'?t|hasnt|not|never|no).{0,25}(come|came|started|happened|contacted|visited)/i, v: 'no_contact' },
  ],
  q2: [
    { re: /grievance|cpgrams|formal complaint/i, v: 'formal_grievance' },
    { re: /\b(called|phoned|rang|visited|emailed|wrote to)\b/i, v: 'informal' },
    { re: /(haven'?t|havent|didn'?t|didnt|not yet).{0,30}(follow|contact|call|complain|do anything)/i, v: 'no_followup' },
  ],
  voterEntry: [
    { re: /\bsir\b|special intensive|enumeration form|draft roll/i, v: 'sir' },
    { re: /applied|correction|new (voter|registration)|replacement|epic|voter card|form 6|form 8/i, v: 'applied' },
  ],
  voterQ1: [
    { re: /rejected|refused|declined|not approved|got a decision|decision came/i, v: 'decision' },
    { re: /\bblo\b|booth level officer|officer (came|visited|called)/i, v: 'blo_visited' },
    { re: /(haven'?t|havent|no|nothing).{0,30}(heard|word|response|update|happened)/i, v: 'no_word' },
  ],
  voterAppealedRaw: [
    { re: /appeal.{0,50}(decided|rejected|dismissed|order came|was decided)/i, v: 'decided' },
    { re: /appeal.{0,50}(pending|waiting|no (response|decision|word))|(filed|made).{0,15}appeal/i, v: 'pending' },
    { re: /(haven'?t|havent|not|no).{0,20}appeal/i, v: 'none' },
  ],
  sirQ1: [
    { re: /notice|asking for documents/i, v: 'notice' },
    { re: /two places|duplicate|registered (in )?both/i, v: 'duplicate' },
    { re: /name.{0,40}(isn'?t|isnt|not|missing)|not (on|in) the.{0,15}roll/i, v: 'roll_absent' },
    { re: /(checked|found|saw).{0,40}name.{0,25}(is )?(there|on|in)|name is (there|on the roll)/i, v: 'roll_present' },
    { re: /(haven'?t|havent|not).{0,25}check/i, v: 'roll_unchecked' },
  ],
}

/** The core rule-matching loop, transcribed from the prototype's own
 *  `simulateInterpretation(ctx, text)` (1930-1944) — MINUS its
 *  `extractFacts`/`gateInterpretation` calls (design note 2, 2a): this
 *  returns RAW mappings and always `facts: []`, never gates itself.
 *
 *  `chain` and `knownAnswers` are explicit parameters here (the prototype
 *  closes over `ctx.chain` and the global `S.answers`) — this port is pure,
 *  the same discipline `gateInterpretation` (Task 4) already follows.
 *
 *  Design note 3: this function's own knownAnswers-skip and reachability-skip
 *  are NOT redundant with the gate. `gateInterpretation` never checks
 *  "already answered" at all (it isn't its job — the gate decides what
 *  SURVIVES a proposed mapping, not what gets proposed in the first place),
 *  so a simulator that proposed a mapping for an already-answered question
 *  would sail straight through the gate and produce a confirm screen
 *  re-asking a question FR-AI-03 says is never asked again. Reachability
 *  IS also re-checked by the gate (over the real chain, post-hoc, once every
 *  raw mapping is in) — genuinely redundant there — but this function still
 *  needs its own reachability skip to implement smart-skip correctly: q2
 *  only becomes reachable once q1 is resolved WITHIN this same call (the
 *  `mapped` accumulator below, escalating in chain order), which nothing
 *  outside this loop can know ahead of time. Both layers, both tested.
 *
 *  Production nuance (Task 5 review round 1, Important finding 3): "genuinely
 *  redundant" two sentences up is only true when this function runs with a
 *  REAL chain carrying live `reachableIf` closures — exactly how this file's
 *  own unit tests call it. In the WIRED production path (`simProvider`,
 *  below), the chain this function actually receives is reconstructed from
 *  `InterpretationRequest.questions` — question id and resolved option
 *  values only, no `reachableIf`, because a live function cannot cross that
 *  request boundary (scope exclusion 4). So THIS function's own
 *  reachability skip goes inert there: an unreachable question's rules
 *  still run, and a wrong-timing mapping can still get proposed.
 *  `gateInterpretation`'s branch gate is what actually stops it in
 *  production — but stopping an already-proposed mapping is observably
 *  different from never proposing it: the mapping now surfaces as a
 *  `discarded` entry the locked prototype's own self-gating simulator never
 *  produced for this shape of input, because there the reachability skip ran
 *  over the real chain before the gate ever saw anything. This is a decided
 *  consequence of the split, not a defect — see `session/interpretation.ts`'s
 *  matching comment for the full trace, the worked example, and the pinning
 *  test in `interpretation.test.ts`. */
export function simulateInterpretation(
  chain: readonly ChainEntry[],
  knownAnswers: AnswerRecord,
  text: string,
): RawInterpretation {
  const mappings: { questionId: string; value: string; span: string }[] = []
  const mapped: AnswerRecord = {}
  for (const q of chain) {
    if (knownAnswers[q.questionId]) continue
    if (q.reachableIf && !q.reachableIf({ ...knownAnswers, ...mapped })) continue
    const rules = SIM_RULES[q.questionId] ?? []
    for (const r of rules) {
      const m = text.match(r.re)
      if (m) {
        mappings.push({ questionId: q.questionId, value: r.v, span: m[0] })
        mapped[q.questionId] = r.v
        break
      }
    }
  }
  return { mappings, facts: [] }
}

/** The registered `InterpreterProvider` (design note 7's registry entry for
 *  `'sim'`). Uses ONLY `req` — `service`, `questions`, `text` — exactly what
 *  `InterpretationRequest` carries and nothing else, the same contract any
 *  future Gemini adapter gets. Reconstructs a minimal chain from
 *  `req.questions` (id + already-resolved option values, no `reachableIf`):
 *  by the time a question reaches `req.questions` it has already been
 *  filtered to "not already answered" by the orchestrator (`knownAnswers`
 *  never crosses this boundary at all — interpret.ts's own doc comment: "no
 *  answers already given"), and reachability is deliberately NOT
 *  pre-filtered there (see `session/interpretation.ts`'s own comment) so
 *  smart-skip still works — this provider simply proposes for whatever it
 *  is offered, in order, and leaves reachability entirely to the gate,
 *  exactly like any other provider would have to. */
export const simProvider: InterpreterProvider = {
  id: 'sim',
  minSpanTokens: 1,
  async interpret(req: InterpretationRequest): Promise<RawInterpretation> {
    const chain: ChainEntry[] = req.questions.map(q => ({ questionId: q.questionId, optionValues: q.optionValues }))
    return simulateInterpretation(chain, {}, req.text)
  },
}
