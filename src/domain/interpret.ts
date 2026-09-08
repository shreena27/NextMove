// The "describe it in your own words" interpretation contract — D1's type
// split, the Fact shape, the provider contract, the describe chains
// (values-only port of the locked prototype's DESCRIBE_CTX,
// design/nextmove-v1-prototype.html 1751-1774), and the pure helpers that
// operate on a gated interpretation (D4, I10). No runtime interpretation
// behaviour lives here yet — this task ships types, data, and the helpers
// later tasks call. TRANSCRIBED where noted; everything else is new C8
// scaffolding.
import type { AnswerRecord } from './types'
import type { ServiceKey } from './casefile'
import type { SirStateConfig } from './sirConfig'
import { optionsForPhase } from './sirConfig'
import { SIR_STATES, SIR_Q1_OPTIONS_FOR } from '../playbooks/sirPlaybook'
import type { GatedBrand } from './interpretGates'

export type { GatedBrand } from './interpretGates'

/** What a provider returns. UNTRUSTED. No provider may return anything
 *  else — no confidence field, no `droppedSensitive` field.
 *
 *  Deliberately ABSENT: any confidence field. FR-AI-02 says model
 *  confidence "is a hint only" — a field nothing may act on is a field
 *  that must not exist, because its presence is an invitation.
 *
 *  Deliberately ABSENT: `droppedSensitive`. Same reason, and a sharper one
 *  (D18): a model that mislabels an Aadhaar number as an ARN would report
 *  `droppedSensitive: false`, and the refusal sentence would never render.
 *  The app computes it, app-side, from the citizen's own text — never
 *  trusting the provider's say-so. Task 18's adapter drops both fields at
 *  the parse boundary if Gemini emits them anyway. */
export interface RawInterpretation {
  mappings: { questionId: string; value: string; span: string }[]
  /** Candidate values ONLY. Every other field a provider puts here is
   *  discarded by gateFacts, which rebuilds each fact from REF_SHAPES
   *  (Task 3). */
  facts: { value: string }[]
}

/** One resolved mapping inside a `GatedInterpretation`, carried alongside
 *  the picked value and its provenance span so a later screen never has to
 *  re-derive the chain lookup to render it.
 *
 *  `optionValues` is a plain-data SNAPSHOT of the matched `ChainEntry`'s
 *  option values, resolved at gate time — never the live `ChainEntry`
 *  itself. The original shape (`entry: ChainEntry`) embedded live closures
 *  (every entry's `reachableIf`, and SIR's `optionValues` function), which
 *  made `GatedMapping` — and therefore the whole `GatedInterpretation` —
 *  non-cloneable and non-serializable (`structuredClone` throws
 *  `DataCloneError` on a function) and forced `repick`'s no-mutation test
 *  into a three-field projection instead of real deep-equality (Important
 *  review finding, Task 2 round 1). Reachability is not this field's job:
 *  callers that need `reachableIf` (e.g. `repick`) already take the whole
 *  `chain` as a separate argument. This snapshot exists purely so a confirm
 *  screen can render "what were the choices" without re-deriving the chain
 *  lookup or re-resolving SIR's phase-dependent function itself. */
export interface GatedMapping {
  questionId: string
  value: string
  span: string
  optionValues: readonly string[]
}

/** What `gateInterpretation` returns, and the ONLY shape the app renders.
 *
 *  `__gated` is a nominal brand (interpretGates.ts), not decoration: it is
 *  what makes it structurally impossible for anything outside that module
 *  to produce a value of this type by construction, however a provider
 *  types its own return. See interpretGates.ts for the full mechanism and
 *  what the brand does and does not guarantee. */
export interface GatedInterpretation {
  readonly __gated: GatedBrand
  mappings: GatedMapping[]
  discarded: { questionId: string; reason: 'unreachable' }[]
  /** Rebuilt app-side (D18) — a provider never supplies a `Fact` directly,
   *  only `{ value: string }` candidates; `gateFacts` (Task 3) builds these
   *  from `REF_SHAPES`. */
  facts: Fact[]
  /** Computed app-side (D18) — never trusted from the provider. */
  droppedSensitive: boolean
  unplaceable: boolean
  /** D17, set at interpretation time. */
  provenance: string
}

/** Transcribed from the spec's contract (§2) and the prototype's
 *  `extractFacts` output (design/nextmove-v1-prototype.html 1865, 1869,
 *  1876, 1883, 1886). `fills` is the prototype's own field (1835) — it is
 *  what makes FR-AI-04's "unrecognized numbers fill nothing" a DATA
 *  property, not a render-time condition.
 *
 *  `Fact` is a GATED-ONLY type. A provider never supplies one; it supplies
 *  `{ value: string }` candidates and `gateFacts` builds the `Fact` (D18).
 *  This field list looks like a wire format — it is not one; treat it as
 *  such and someone will eventually feed a provider's raw output straight
 *  through as if it were already a `Fact`.
 *
 *  `label` is data-shaped copy attached to a shape table (Task 3's
 *  `REF_SHAPES`), not registered here and not in `screenCopy.ts` — matching
 *  the precedent `prep.ts` and `casefile.ts` already set for their own
 *  data-shaped copy (`PREP`, `LOG_COPY`). */
export interface Fact {
  kind: 'reference_number' | 'date' | 'note'
  /** 'passport_file_no' | 'arn' | 'epic' | 'grievance_no' | 'voter_ref' |
   *  'date_applied' | 'date_other' | 'unknown' */
  refType: string
  /** 'File Number', 'ARN', 'A number you mentioned', … */
  label: string
  /** MUST be a verbatim substring of the citizen's text. */
  value: string
  /** The draft bracket it fills, e.g. '[File Number / ARN]', or null. */
  fills: string | null
  edited?: true
}

/** The whole of what any provider ever sees — scope exclusion 4 made
 *  structural. No diagnosis, no rule, no source, no `whatToDo`, no answers
 *  already given — only which questions are *offered*, which is the branch
 *  gate's output, not the playbook's content. Task 18 assembles the real
 *  prompt from exactly this object and nothing else. */
export interface InterpretationRequest {
  service: string
  questions: { questionId: string; optionValues: readonly string[] }[]
  text: string
}

/** The provider-agnostic contract (spec §2). */
export interface InterpreterProvider {
  id: 'sim' | 'gemini'
  /** D3: the span floor. Simulator 1, production 3. Passed to the gate. */
  minSpanTokens: number
  /** Raw only. Never gated. May reject; the orchestrator fails closed. */
  interpret(req: InterpretationRequest): Promise<RawInterpretation>
}

/** One question in a describe chain. Gates a question on earlier (known or
 *  mapped) answers — the branch-awareness that keeps smart skip sound, D1's
 *  values-only port of the prototype's `reachableIf` (1754, 1761, 1762,
 *  1766).
 *
 *  `optionValues` is USUALLY a constant array, transcribed verbatim from
 *  the real label maps in `src/screens/labels.ts` (never imported here —
 *  see `interpretChains.test.ts`'s cross-layer pin, which is the thing that
 *  keeps this transcription honest instead of a silent second source of
 *  truth). SIR's is the one exception: it is phase-dependent, so it is a
 *  function of the answers instead (design note 5). */
export interface ChainEntry {
  questionId: string
  optionValues: readonly string[] | ((a: AnswerRecord) => readonly string[])
  reachableIf?: (a: AnswerRecord) => boolean
}

export interface DescribeChain {
  engine: ServiceKey
  service: string
  chain: ChainEntry[]
}

// ---------------------------------------------------------------------------
// DESCRIBE_CHAINS — D1's values-only port of the locked prototype's
// DESCRIBE_CTX (design/nextmove-v1-prototype.html 1751-1774). Keyed by the
// entry screen id, the prototype's own keys.

const PASSPORT_Q1_VALUES = ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'] as const
const PASSPORT_Q2_VALUES = ['no_followup', 'informal', 'formal_grievance'] as const
const VOTER_ENTRY_VALUES = ['applied', 'sir'] as const
const VOTER_Q1_VALUES = ['no_word', 'blo_visited', 'decision'] as const
// Three, not four (prototype 1762/1766): 'notsure' is deliberately excluded
// — "I'm not sure" is never something a describe mapping should produce.
const VOTER_APPEAL_VALUES = ['none', 'pending', 'decided'] as const

/** TOTAL — never throws (D16, half of I2's fix; design note 5a).
 *
 *  `optionsForPhase` (sirConfig.ts:24-36) genuinely throws: "unsupported SIR
 *  state: …" when the state is unsupported or has no verified phase, and
 *  "no options configured for phase: …" when the phase id is missing from
 *  the options map. `SIR_STATES[answers.sirState]` can also be `undefined`
 *  whenever `sirState` is absent, which it is on any path that reaches an
 *  interpretation without a SIR state yet.
 *
 *  A throw inside the chain resolver is not a caught edge case here: it is
 *  what leaves `state.reading` stuck `true` forever (I2, Task 5 design note
 *  4a) — the describe flow never gets to render the confirm/unplaceable
 *  screen at all. So this resolver swallows every failure and returns `[]`
 *  instead. An empty option set makes the enum gate fail CLOSED — no value
 *  can be a member of it — so the SIR mapping is silently dropped and the
 *  citizen lands on the unplaceable panel and picks from the real list,
 *  which always works. */
export function sirQ1OptionValues(state: SirStateConfig | undefined): readonly string[] {
  if (!state) return []
  try {
    return Object.keys(optionsForPhase(state, SIR_Q1_OPTIONS_FOR))
  } catch {
    return []
  }
}

/** Transcribed from the prototype's own `DESCRIBE_MAX = 600`
 *  (design/nextmove-v1-prototype.html:2378) — the hard cap on the describe
 *  textarea's `maxLength`, and the denominator of its live character
 *  counter (`DescribeBlock`, Task 11). Lives here, not `screenCopy.ts`
 *  (that file's own `describe` doc comment already anticipates this): it is
 *  a number, not authored copy, and registering it as copy would put a
 *  bare digit into the content-safety scan for nothing. */
export const DESCRIBE_MAX = 600

export type DescribeEntryScreenId = 'passport-q1' | 'passport-q2' | 'voter-entry' | 'voter-q1' | 'voter-q2' | 'sir-q1'

export const DESCRIBE_CHAINS: Record<DescribeEntryScreenId, DescribeChain> = {
  'passport-q1': {
    engine: 'passport',
    service: 'Passport',
    chain: [
      { questionId: 'q1', optionValues: PASSPORT_Q1_VALUES },
      { questionId: 'q2', optionValues: PASSPORT_Q2_VALUES, reachableIf: a => !!a.q1 && a.q1 !== 'not_sure' },
    ],
  },
  'passport-q2': {
    engine: 'passport',
    service: 'Passport',
    chain: [{ questionId: 'q2', optionValues: PASSPORT_Q2_VALUES }],
  },
  'voter-entry': {
    engine: 'voter',
    service: 'Voter Services',
    chain: [
      { questionId: 'voterEntry', optionValues: VOTER_ENTRY_VALUES },
      { questionId: 'voterQ1', optionValues: VOTER_Q1_VALUES, reachableIf: a => a.voterEntry === 'applied' },
      { questionId: 'voterAppealedRaw', optionValues: VOTER_APPEAL_VALUES, reachableIf: a => a.voterQ1 === 'decision' },
    ],
  },
  'voter-q1': {
    engine: 'voter',
    service: 'Voter Services',
    chain: [
      { questionId: 'voterQ1', optionValues: VOTER_Q1_VALUES },
      { questionId: 'voterAppealedRaw', optionValues: VOTER_APPEAL_VALUES, reachableIf: a => a.voterQ1 === 'decision' },
    ],
  },
  'voter-q2': {
    engine: 'voter',
    service: 'Voter Services',
    chain: [{ questionId: 'voterAppealedRaw', optionValues: VOTER_APPEAL_VALUES }],
  },
  'sir-q1': {
    engine: 'sir',
    service: 'SIR',
    chain: [
      { questionId: 'sirQ1', optionValues: (a: AnswerRecord) => sirQ1OptionValues(SIR_STATES[a.sirState]) },
    ],
  },
}

// ---------------------------------------------------------------------------
// D4: repick / editFact / removeFact — pure, operate on GatedInterpretation
// / Fact[], declared here because Tasks 12/13 call them but they belong next
// to the types they operate on.

/** Re-derives reachability over the WHOLE mapping list after a changed pick
 *  (prototype 2437-2446) — a changed earlier pick can void a later mapping,
 *  which is the branch gate applied a second time, at correction time.
 *  Returns a new object; mutates neither `interp` nor its arrays.
 *
 *  Deliberately does not accept a `known`/answers argument: it re-derives
 *  reachability purely from the mapping list itself, in original (chain)
 *  order, feeding each kept mapping's value forward as the next entry's
 *  `mapped` context — exactly the scope the RED spec's own live assertion
 *  ("voter Q2 mapping must vanish if Q1 changes") exercises. */
export function repick(
  interp: GatedInterpretation,
  questionId: string,
  value: string,
  chain: readonly ChainEntry[],
): GatedInterpretation {
  const mapped: AnswerRecord = {}
  const kept: GatedMapping[] = []
  const discarded = [...interp.discarded]
  for (const m of interp.mappings) {
    const nextValue = m.questionId === questionId ? value : m.value
    const entry = chain.find(c => c.questionId === m.questionId)
    const reach = !entry?.reachableIf || entry.reachableIf(mapped)
    if (reach) {
      mapped[m.questionId] = nextValue
      kept.push({ ...m, value: nextValue })
    } else {
      discarded.push({ questionId: m.questionId, reason: 'unreachable' })
    }
  }
  return { ...interp, mappings: kept, discarded }
}

/** Sets `edited: true` and the new value on the fact at `index`. Returns a
 *  new array; does not mutate `facts` or any element of it. */
export function editFact(facts: readonly Fact[], index: number, value: string): Fact[] {
  return facts.map((f, i) => (i === index ? { ...f, value, edited: true } : f))
}

/** Removes exactly the fact at `index`. Returns a new array; does not
 *  mutate `facts`. */
export function removeFact(facts: readonly Fact[], index: number): Fact[] {
  return facts.filter((_, i) => i !== index)
}

// ---------------------------------------------------------------------------
// I10: unplaceablePickPlan — the single derivation of the six per-question
// routings a normal tap already performs in PassportScreens.tsx /
// VoterScreens.tsx / SirScreens.tsx (design note 8). The unplaceable panel
// passes only `(questionId, value)`; it never re-derives destinations or
// writes itself.

export interface UnplaceablePickPlan {
  writes: { service: ServiceKey; key: string; value: string }[]
  /** A `ScreenId` string, or `null` when the pick explains in place rather
   *  than navigating (the `voterEntry`/'notsure' arm). Typed as plain
   *  `string`, not session.ts's `ScreenId`, for the same layering reason
   *  `casefile.ts`'s `CaseSnapshot.returnScreen` documents: `domain/` must
   *  never import from `session/` (session.ts imports the other way, and
   *  Task 4+ has session.ts importing from this very file — an import back
   *  from here would be a real cycle, not a hypothetical one). Every real
   *  call site narrows it back to `ScreenId`, a subtype of `string`. */
  screen: string | null
  explain?: true
}

/** One pure derivation of what a normal tap on each of the six describable
 *  questions does — read directly from the shipped components, verbatim:
 *   - `q1` (PassportScreens.tsx:68-76): ANSWER passport q1 -> 'not_sure' goes
 *     to passport-recovery, anything else to passport-q2.
 *   - `q2` (PassportScreens.tsx:102-105): ANSWER passport q2 -> always
 *     passport-diagnosis.
 *   - `voterEntry` (VoterScreens.tsx:30-38): writes NO answer at all for
 *     'applied'/'sir' (D2) -> 'sir' goes to sir-state, anything else to
 *     voter-q1; 'notsure' explains in place and navigates nowhere.
 *   - `voterQ1` (VoterScreens.tsx:72-82): normalises 'notsure' ->
 *     'unclassified' before writing -> 'decision' goes to voter-q2,
 *     anything else to voter-diagnosis.
 *   - `voterAppealedRaw` (VoterScreens.tsx:107-113): a dual write in a
 *     required order — raw pick first, then normalised voterAppealed ->
 *     always voter-diagnosis. The component's own comment calls the
 *     ordering load-bearing; this preserves it.
 *   - `sirQ1` (SirScreens.tsx:145-148): normalises 'notsure' ->
 *     'unclassified' -> always sir-diagnosis.
 *
 *  This is a SECOND implementation of those six routings, on purpose (the
 *  rejected alternative — hoisting each component's onSelect into a shared
 *  exported helper, the prototype's own Q_HANDLER, 2382 — would restructure
 *  five shipped components and add six react(only-export-components) lint
 *  warnings against a count this plan pins at exactly 4). The drift that
 *  creates is closed by `interpretChains.test.ts`'s onSelect-parity test,
 *  not by care. */
export function unplaceablePickPlan(questionId: string, value: string): UnplaceablePickPlan {
  switch (questionId) {
    case 'q1':
      return {
        writes: [{ service: 'passport', key: 'q1', value }],
        screen: value === 'not_sure' ? 'passport-recovery' : 'passport-q2',
      }
    case 'q2':
      return {
        writes: [{ service: 'passport', key: 'q2', value }],
        screen: 'passport-diagnosis',
      }
    case 'voterEntry':
      if (value === 'notsure') {
        return { writes: [], screen: null, explain: true }
      }
      return {
        writes: [],
        screen: value === 'sir' ? 'sir-state' : 'voter-q1',
      }
    case 'voterQ1': {
      const normalized = value === 'notsure' ? 'unclassified' : value
      return {
        writes: [{ service: 'voter', key: 'voterQ1', value: normalized }],
        screen: value === 'decision' ? 'voter-q2' : 'voter-diagnosis',
      }
    }
    case 'voterAppealedRaw':
      return {
        writes: [
          { service: 'voter', key: 'voterAppealedRaw', value },
          { service: 'voter', key: 'voterAppealed', value: value === 'notsure' ? 'unclassified' : value },
        ],
        screen: 'voter-diagnosis',
      }
    case 'sirQ1':
      return {
        writes: [{ service: 'sir', key: 'sirQ1', value: value === 'notsure' ? 'unclassified' : value }],
        screen: 'sir-diagnosis',
      }
    default:
      throw new Error(`unplaceablePickPlan: unknown questionId "${questionId}"`)
  }
}
