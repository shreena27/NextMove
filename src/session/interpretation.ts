// runInterpretation — the orchestrator, and the ONLY non-test caller of
// gateInterpretation (Task 4). This is where the feature flag (Task 1), the
// interpretation contract (Task 2), the fact gate (Task 3), the mapping gate
// (Task 4) and a concrete provider (Task 5's own simInterpreter.ts) first
// connect end to end.
//
// Never-throws convention, following auth.ts's own established discipline
// (see that file's header comment): "a rejected promise crossing a React
// event handler is an unhandled rejection nobody sees." Every failure this
// function can hit resolves to a discriminated `{ ok: false, reason }`,
// never a rejected promise — the whole body below is wrapped in ONE
// try/catch, not just the provider call (see the comment above that
// try/catch for why the difference is a real crash, not style).
import type { AnswerRecord } from '../domain/types'
import type {
  DescribeEntryScreenId,
  GatedInterpretation,
  InterpretationRequest,
  InterpreterProvider,
  RawInterpretation,
} from '../domain/interpret'
import { DESCRIBE_CHAINS } from '../domain/interpret'
import { gateInterpretation } from '../domain/interpretGates'
import { simProvider } from '../domain/simInterpreter'
import type { InterpreterId } from './featureFlags'
import { describeItEnabled, interpreterId } from './featureFlags'

/** `'quota'` is declared NOW, inert, so Task 18 is a wire-up and not a
 *  re-opening of this task (design note 8, I7). Spec §2 requires quota
 *  exhaustion to hide the entry row, not break it — that needs a
 *  `quotaExhausted` session field, a reducer branch and a UI guard this task
 *  does not own. Nothing in this module (or, per this file's own
 *  grep-style test, anywhere else non-test under src/) ever produces this
 *  reason yet. Task 18 supplies the one thing this task genuinely cannot: a
 *  real Gemini 429 to map onto it. DO NOT remove this member as unused —
 *  it is load-bearing scaffolding with a named owner (see
 *  interpretation.test.ts's own pin). */
export type InterpretationFailure = 'disabled' | 'no-chain' | 'no-provider' | 'failed' | 'quota'

/** The spec's fail-closed list names timeout first (design note 6): a
 *  provider that never settles would leave `state.reading` true forever — a
 *  dead screen with no error, the worst failure mode in this chunk. Lives
 *  HERE, not in any adapter, so the guarantee is structural (every provider
 *  races this same clock) rather than something each adapter has to
 *  remember to implement for itself. The simulator resolves immediately, so
 *  this never fires through Task 17; it is exercised directly with a
 *  provider that never resolves, under fake timers. */
export const INTERPRETATION_TIMEOUT_MS = 15000

/** Design note 7: a plain object, one entry today. An unregistered id (or
 *  today's only other member, `'gemini'`, before Task 18 registers the real
 *  adapter) resolves to `null`, which `runInterpretation` turns into a
 *  fail-closed `'no-provider'` result rather than a crash. */
const PROVIDERS: Record<InterpreterId, InterpreterProvider | null> = {
  sim: simProvider,
  gemini: null,
}

/** D17: captured HERE, at interpretation time, and carried onto the gated
 *  result as `interp.provenance` — never re-derived later from whatever
 *  `interpreterId()` happens to say at save/render time (see
 *  interpretation.test.ts's own "captured at interpretation time" pin for
 *  why that distinction is real, not stylistic). Never called from a
 *  reducer, `caseSnapshot`, or any later save path (C3's fix) — this is the
 *  only place that reads a provider's `id` for provenance purposes. */
export function provenanceLabel(provider: InterpreterProvider): string {
  if (provider.id === 'sim') return 'simulated (local matcher)'
  // Task 18 wires the real `gemini:${MODEL_ID} prompt:${PROMPT_VERSION}`
  // label once the Gemini adapter (and its MODEL_ID/PROMPT_VERSION
  // constants) exist. Unreachable today: PROVIDERS above has no 'gemini'
  // entry yet, so runInterpretation never resolves a provider with this id
  // before Task 18 registers one.
  throw new Error(`provenanceLabel: unimplemented provider id "${provider.id}"`)
}

/** Shape-validates a provider's raw response BEFORE it is ever handed to the
 *  gate, rather than trusting the provider's own TypeScript type (design
 *  note 5): a real network adapter parsing JSON can hand back anything at
 *  runtime, and `RawInterpretation` is a compile-time promise the network
 *  cannot keep. Checked structurally, not just `typeof x === 'object'` —
 *  every mapping's three fields and every fact's one field must be the
 *  right primitive type, or the whole payload is rejected. */
function isRawInterpretation(x: unknown): x is RawInterpretation {
  if (!x || typeof x !== 'object') return false
  const obj = x as { mappings?: unknown; facts?: unknown }
  if (!Array.isArray(obj.mappings)) return false
  for (const m of obj.mappings) {
    if (!m || typeof m !== 'object') return false
    const mm = m as { questionId?: unknown; value?: unknown; span?: unknown }
    if (typeof mm.questionId !== 'string' || typeof mm.value !== 'string' || typeof mm.span !== 'string') return false
  }
  if (!Array.isArray(obj.facts)) return false
  for (const f of obj.facts) {
    if (!f || typeof f !== 'object') return false
    if (typeof (f as { value?: unknown }).value !== 'string') return false
  }
  return true
}

/** The orchestrator, and the ONLY non-test caller of `gateInterpretation`.
 *  Its whole body: refuse if the flag is off; resolve the chain; resolve
 *  the provider; build the request; race the provider against the timeout;
 *  shape-validate; gate; return. Never throws.
 *
 *  I2 / design note 4a: the try/catch below wraps the ENTIRE body, starting
 *  at the chain lookup, not just `await provider.interpret(req)`. Building
 *  the request is NOT safe to leave outside the try: `InterpretationRequest.
 *  questions` carries each question's resolved option values, and SIR's
 *  resolve through `optionsForPhase` (sirConfig.ts:24-36), which genuinely
 *  throws for an unsupported state or a phase missing from its options map
 *  — `interpretChains.test.ts`'s own `sirQ1OptionValues` is hardened to be
 *  TOTAL for the REAL production chain, but a chain entry's `optionValues`
 *  is still just a function this module calls, and nothing stops it from
 *  throwing (a hostile/broken chain fixture, or a future regression). If
 *  that throw happened above/outside this try, the async function's
 *  returned promise would REJECT instead of resolving to `{ ok: false }` —
 *  the caller's `await` (with no `.catch`, matching auth.ts's own
 *  discriminated-result convention throughout this codebase) becomes an
 *  unhandled rejection nobody sees, and `state.reading` stays `true`
 *  forever: a dead "Reading…" button with no error. One try, from the
 *  chain lookup through the return, closes that path structurally; Task 2's
 *  own TOTAL `sirQ1OptionValues` (design note 5a) is the belt to this
 *  brace, so the same input fails closed at the enum gate even without ever
 *  needing this catch. */
export async function runInterpretation(
  entryScreen: string,
  knownAnswers: AnswerRecord,
  text: string,
): Promise<{ ok: true; interp: GatedInterpretation } | { ok: false; reason: InterpretationFailure }> {
  try {
    if (!describeItEnabled()) return { ok: false, reason: 'disabled' }

    const describeChain = DESCRIBE_CHAINS[entryScreen as DescribeEntryScreenId]
    if (!describeChain) return { ok: false, reason: 'no-chain' }

    const provider = PROVIDERS[interpreterId()]
    if (!provider) return { ok: false, reason: 'no-provider' }

    // "No answers already given" (interpret.ts's own InterpretationRequest
    // doc comment): a question already in knownAnswers is never offered to
    // any provider, sim or otherwise (design note 3 — this is the layer
    // that keeps a provider from re-proposing an already-answered
    // question; the gate itself never checks this).
    //
    // Reachability is DELIBERATELY NOT filtered here, unlike "already
    // answered" above: q2's reachableIf can only become true once q1 is
    // resolved WITHIN this same interpretation (smart skip — see
    // simInterpreter.ts's own comment), which nothing at request-build time
    // can know yet, since no mapping exists until a provider proposes one.
    // Pre-filtering by reachability here would silently break smart skip
    // for every provider. `gateInterpretation` (called below) is the sole,
    // correct place reachability is enforced, for every provider alike.
    //
    // Side effect, real and user-visible, not a bug (Task 5 review round 1,
    // Important finding 3): because a live `reachableIf` closure cannot
    // cross this request boundary (scope exclusion 4), the simulator's OWN
    // reachability skip (`simInterpreter.ts`'s `simulateInterpretation`)
    // goes inert in the WIRED path below — `simProvider.interpret`
    // reconstructs its working chain from `req.questions` alone, which never
    // carries a `reachableIf` function, so nothing stops the simulator from
    // proposing a mapping for a question that is not reachable yet.
    // `gateInterpretation`'s branch gate (below) still correctly rejects
    // that mapping — but rejecting a proposed mapping is not the same as
    // never proposing it: the locked prototype's simulator gated ITSELF over
    // the real chain (live `reachableIf` closures included), so an
    // unreachable question's rules never even ran there, and its
    // `discarded` list stayed empty for this exact shape of input.
    // Concretely: `runInterpretation('passport-q1', {}, 'I already filed a
    // formal grievance about this matter.')` now yields `discarded:
    // [{ questionId: 'q2', reason: 'unreachable' }]`, where the prototype
    // yielded `[]` — q1 matches none of its own rules, q2 is unreachable
    // (q1 unanswered), but the text still incidentally matches q2's
    // formal_grievance rule, so the simulator proposes it and the gate
    // discards it after the fact. Nothing unsafe passes through either way
    // (the mapping is rejected, `unplaceable` is still true) but Task 14
    // renders `discarded` to the citizen, so the list itself is not
    // cosmetic. DECIDED, not a defect to fix away: pinned by
    // interpretation.test.ts's "Finding 3" test. Do not "fix" this by
    // trying to smuggle `reachableIf` across the request boundary — the
    // whole point of this comment's opening paragraph is that reachability
    // is enforced structurally, in one place, for every provider; this is
    // simply what enforcing it AFTER proposal (rather than before) looks
    // like from the citizen's side. See `simInterpreter.ts`'s matching
    // comment on `simulateInterpretation` for the provider-side half of
    // this trace.
    const questions = describeChain.chain
      .filter(q => !knownAnswers[q.questionId])
      .map(q => ({
        questionId: q.questionId,
        optionValues: typeof q.optionValues === 'function' ? q.optionValues(knownAnswers) : q.optionValues,
      }))
    const req: InterpretationRequest = { service: describeChain.service, questions, text }

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('interpretation timed out')), INTERPRETATION_TIMEOUT_MS)
    })
    let raw: unknown
    try {
      raw = await Promise.race([provider.interpret(req), timeout])
    } finally {
      clearTimeout(timer)
    }

    if (!isRawInterpretation(raw)) return { ok: false, reason: 'failed' }

    const interp = gateInterpretation(
      describeChain.chain,
      describeChain.engine,
      knownAnswers,
      text,
      raw,
      provider.minSpanTokens,
      provenanceLabel(provider),
    )
    return { ok: true, interp }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
