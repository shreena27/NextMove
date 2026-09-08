import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SERVICE_KEYS } from './casefile'
import type { SirStateConfig } from './sirConfig'
import { optionsForPhase } from './sirConfig'
import { SIR_STATES, SIR_PHASES, SIR_Q1_OPTIONS_FOR } from '../playbooks/sirPlaybook'
import type { AnswerRecord } from './types'
import type { GatedInterpretation, Fact } from './interpret'
import {
  DESCRIBE_CHAINS,
  sirQ1OptionValues,
  repick,
  editFact,
  removeFact,
  unplaceablePickPlan,
} from './interpret'

describe('DESCRIBE_CHAINS', () => {
  it('has exactly the six prototype keys', () => {
    expect(Object.keys(DESCRIBE_CHAINS).sort()).toEqual(
      ['passport-q1', 'passport-q2', 'sir-q1', 'voter-entry', 'voter-q1', 'voter-q2'].sort(),
    )
  })

  it.each(Object.entries(DESCRIBE_CHAINS))('%s: engine is one of SERVICE_KEYS', (_key, entry) => {
    expect(SERVICE_KEYS).toContain(entry.engine)
  })
})

describe('reachableIf predicates (transcribed prototype 1754, 1761, 1762, 1766)', () => {
  it.each([
    [{ q1: 'no_contact' }, true],
    [{ q1: 'not_sure' }, false],
    [{}, false],
  ])('passport-q1 -> q2 reachable for %j is %s', (answers, expected) => {
    const entry = DESCRIBE_CHAINS['passport-q1'].chain.find(c => c.questionId === 'q2')!
    expect(entry.reachableIf!(answers)).toBe(expected)
  })

  it.each([
    [{ voterEntry: 'applied' }, true],
    [{ voterEntry: 'sir' }, false],
    [{}, false],
  ])('voter-entry -> voterQ1 reachable for %j is %s', (answers, expected) => {
    const entry = DESCRIBE_CHAINS['voter-entry'].chain.find(c => c.questionId === 'voterQ1')!
    expect(entry.reachableIf!(answers)).toBe(expected)
  })

  it.each([
    [{ voterQ1: 'decision' }, true],
    [{ voterQ1: 'no_word' }, false],
    [{}, false],
  ])('voter-entry -> voterAppealedRaw reachable for %j is %s', (answers, expected) => {
    const entry = DESCRIBE_CHAINS['voter-entry'].chain.find(c => c.questionId === 'voterAppealedRaw')!
    expect(entry.reachableIf!(answers)).toBe(expected)
  })
})

describe("SIR's optionValues is a function of the answers, not a constant", () => {
  it('is a function on the sir-q1 chain entry', () => {
    const entry = DESCRIBE_CHAINS['sir-q1'].chain[0]
    expect(typeof entry.optionValues).toBe('function')
  })

  it("returns the claims_notice set for a claims_notice-phase state", () => {
    const state: SirStateConfig = { id: 'x', name: 'X', supported: true, phase: SIR_PHASES.claims_notice }
    expect(sirQ1OptionValues(state).slice().sort()).toEqual(
      Object.keys(SIR_Q1_OPTIONS_FOR.claims_notice).sort(),
    )
  })

  it('returns the final_roll set for a final_roll-phase state', () => {
    const state: SirStateConfig = { id: 'x', name: 'X', supported: true, phase: SIR_PHASES.final_roll }
    expect(sirQ1OptionValues(state).slice().sort()).toEqual(
      Object.keys(SIR_Q1_OPTIONS_FOR.final_roll).sort(),
    )
  })

  it('the two phases are disjoint — a value real for one phase must never be a member of the other, an enum-gate hole that looks like nothing', () => {
    const claimsNotice = new Set(Object.keys(SIR_Q1_OPTIONS_FOR.claims_notice))
    const finalRoll = new Set(Object.keys(SIR_Q1_OPTIONS_FOR.final_roll))
    const intersection = [...claimsNotice].filter(v => finalRoll.has(v))
    expect(intersection).toEqual([])
  })
})

describe('SIR resolver is TOTAL (design note 5a, D16/I2)', () => {
  it.each([
    ['a state with an unsupported phase directly throws optionsForPhase', SIR_STATES.bihar],
    [
      'a state whose phase id is absent from SIR_Q1_OPTIONS_FOR directly throws optionsForPhase',
      { id: 'ghost', name: 'Ghost', supported: true, phase: { id: 'ghost_phase', label: '', note: '' } } as SirStateConfig,
    ],
  ])('%s (proves the underlying premise: optionsForPhase really does throw, sirConfig.ts:24-36)', (_label, state) => {
    expect(() => optionsForPhase(state, SIR_Q1_OPTIONS_FOR)).toThrow()
  })

  it.each([
    ['answers: {} (no sirState at all)', undefined],
    ['an unsupported sirState (bihar)', SIR_STATES.bihar],
    [
      'a supported sirState whose phase id is absent from SIR_Q1_OPTIONS_FOR',
      { id: 'ghost', name: 'Ghost', supported: true, phase: { id: 'ghost_phase', label: '', note: '' } } as SirStateConfig,
    ],
  ])(
    '%s returns [] and does not throw — a throw here is not a caught edge case, it is what leaves state.reading stuck true forever',
    (_label, state) => {
      expect(() => sirQ1OptionValues(state)).not.toThrow()
      expect(sirQ1OptionValues(state)).toEqual([])
    },
  )
})

describe("SIR resolver is TOTAL through the COMPOSED chain path (review finding 1, Task 2 round 1): the direct-call it.each above pins sirQ1OptionValues itself, but nothing called DESCRIBE_CHAINS['sir-q1'].chain[0].optionValues({...}) — the actual arrow function the gate will invoke — so the SIR_STATES[a.sirState] lookup step was unpinned", () => {
  // The chain entry's optionValues, invoked exactly the way Task 4's gate
  // calls it: with an AnswerRecord, not a SirStateConfig directly.
  const composedOptionValues = DESCRIBE_CHAINS['sir-q1'].chain[0].optionValues as (a: AnswerRecord) => readonly string[]

  // Real SIR_STATES has no entry that is BOTH supported AND has a phase id
  // missing from SIR_Q1_OPTIONS_FOR (only delhi is supported, and its phase
  // is claims_notice, which IS in the map) — so the third case cannot be
  // reached through the real SIR_STATES[a.sirState] lookup without a
  // fixture. Register one temporarily, purely so this case is exercised
  // through the true composed path rather than by calling sirQ1OptionValues
  // directly (which the block above already covers). SIR_STATES is a plain
  // mutable Record, and this file's module registry is isolated per test
  // file, so this cannot leak into other test files.
  const GHOST_KEY = '__test_ghost_phase_state__'
  beforeAll(() => {
    SIR_STATES[GHOST_KEY] = { id: GHOST_KEY, name: 'Ghost', supported: true, phase: { id: 'ghost_phase', label: '', note: '' } }
  })
  afterAll(() => {
    delete SIR_STATES[GHOST_KEY]
  })

  it.each([
    ['answers: {} (no sirState at all) -- SIR_STATES[a.sirState] produces undefined, the case the brief named verbatim', {} as AnswerRecord],
    ['an unsupported sirState (bihar)', { sirState: 'bihar' } as AnswerRecord],
    ['a supported sirState whose phase id is absent from SIR_Q1_OPTIONS_FOR', { sirState: GHOST_KEY } as AnswerRecord],
  ])(
    "%s -- DESCRIBE_CHAINS['sir-q1'].chain[0].optionValues(a) returns [] and does not throw",
    (_label, answers) => {
      expect(() => composedOptionValues(answers)).not.toThrow()
      expect(composedOptionValues(answers)).toEqual([])
    },
  )
})

describe('the nominal brand (design note 1a)', () => {
  it('a plain structural interface would NOT refuse this — excess-property checks do not fire across a function boundary — so the brand is what makes the guarantee real', () => {
    // @ts-expect-error — __gated cannot be produced outside interpretGates.ts
    // (it declares `GATED: unique symbol` and never exports a value of that
    // type), so this object literal — which otherwise satisfies every other
    // field a real GatedInterpretation needs — is refused by the type
    // checker. Verified RED first WITHOUT the brand (a plain structural
    // interface with the identical field list happily accepts this exact
    // literal, no error) so this line is proven load-bearing, not
    // decorative.
    const forged: GatedInterpretation = {
      mappings: [],
      discarded: [],
      facts: [],
      droppedSensitive: false,
      unplaceable: true,
      provenance: 'sim',
    }
    expect(forged.provenance).toBe('sim')
  })
})

describe('repick (D4, prototype 2437-2446)', () => {
  const entryQ1 = { questionId: 'voterQ1', optionValues: [] }
  const entryAppeal = { questionId: 'voterAppealedRaw', optionValues: [], reachableIf: (a: Record<string, string>) => a.voterQ1 === 'decision' }
  const chain = [entryQ1, entryAppeal]

  function makeInterp(): GatedInterpretation {
    return {
      __gated: 'test-only' as unknown as GatedInterpretation['__gated'],
      mappings: [
        { questionId: 'voterQ1', value: 'decision', span: 'a decision', optionValues: entryQ1.optionValues },
        { questionId: 'voterAppealedRaw', value: 'pending', span: 'appeal pending', optionValues: entryAppeal.optionValues },
      ],
      discarded: [],
      facts: [],
      droppedSensitive: false,
      unplaceable: false,
      provenance: 'sim',
    }
  }

  it('returns a new object and mutates neither the input interpretation nor its arrays', () => {
    expect.assertions(4)
    const interp = makeInterp()
    // Real deep-equality against a pre-call structuredClone — the brief's
    // originally specified assertion, restored now that GatedMapping.entry
    // (a live ChainEntry embedding reachableIf/optionValues closures) is
    // gone, replaced by a plain `optionValues: readonly string[]` snapshot
    // (review finding 2, Task 2 round 1). structuredClone throws
    // DataCloneError on a function, so this genuinely could not have been
    // written this way against the old shape — see interpret.ts's
    // GatedMapping doc comment.
    const before = structuredClone(interp)
    const result = repick(interp, 'voterQ1', 'no_word', chain)
    expect(result).not.toBe(interp)
    expect(result.mappings).not.toBe(interp.mappings)
    expect(interp).toEqual(before) // input untouched, real deep-equality
    expect(result.mappings.map(m => m.value)).not.toEqual(interp.mappings.map(m => m.value)) // genuinely different result
  })

  it("re-derives reachability: changing voterQ1 from 'decision' to 'no_word' drops the voterAppealedRaw mapping and discards it as unreachable (voter Q2 mapping must vanish if Q1 changes)", () => {
    const interp = makeInterp()
    const result = repick(interp, 'voterQ1', 'no_word', chain)
    expect(result.mappings.map(m => m.questionId)).toEqual(['voterQ1'])
    expect(result.mappings[0].value).toBe('no_word')
    expect(result.discarded).toContainEqual({ questionId: 'voterAppealedRaw', reason: 'unreachable' })
  })

  it('keeps a still-reachable later mapping when the earlier pick changes to another reachable value', () => {
    const interp = makeInterp()
    const result = repick(interp, 'voterQ1', 'decision', chain) // no-op change, still 'decision'
    expect(result.mappings.map(m => m.questionId)).toEqual(['voterQ1', 'voterAppealedRaw'])
  })
})

describe('editFact / removeFact (D4)', () => {
  const facts: Fact[] = [
    { kind: 'reference_number', refType: 'arn', label: 'ARN', value: '123456789012', fills: '[File Number / ARN]' },
    { kind: 'date', refType: 'date_applied', label: 'Applied', value: '12 March 2026', fills: '[date you applied]' },
  ]

  it('editFact sets edited: true and the new value, returning a new array', () => {
    const result = editFact(facts, 0, '987654321098')
    expect(result).not.toBe(facts)
    expect(result[0]).toEqual({ ...facts[0], value: '987654321098', edited: true })
    expect(result[1]).toEqual(facts[1])
    expect(facts[0].edited).toBeUndefined() // original untouched
  })

  it('removeFact removes exactly one by index, returning a new array', () => {
    const result = removeFact(facts, 0)
    expect(result).not.toBe(facts)
    expect(result).toEqual([facts[1]])
    expect(facts).toHaveLength(2) // original untouched
  })
})

describe('unplaceablePickPlan (I10, design note 8)', () => {
  it.each([
    ['q1', 'not_sure', { writes: [{ service: 'passport', key: 'q1', value: 'not_sure' }], screen: 'passport-recovery' }],
    ['q1', 'no_contact', { writes: [{ service: 'passport', key: 'q1', value: 'no_contact' }], screen: 'passport-q2' }],
    ['q2', 'informal', { writes: [{ service: 'passport', key: 'q2', value: 'informal' }], screen: 'passport-diagnosis' }],
    ['voterEntry', 'sir', { writes: [], screen: 'sir-state' }],
    ['voterEntry', 'applied', { writes: [], screen: 'voter-q1' }],
    ['voterEntry', 'notsure', { writes: [], screen: null, explain: true }],
    ['voterQ1', 'notsure', { writes: [{ service: 'voter', key: 'voterQ1', value: 'unclassified' }], screen: 'voter-diagnosis' }],
    ['voterQ1', 'decision', { writes: [{ service: 'voter', key: 'voterQ1', value: 'decision' }], screen: 'voter-q2' }],
    ['voterQ1', 'no_word', { writes: [{ service: 'voter', key: 'voterQ1', value: 'no_word' }], screen: 'voter-diagnosis' }],
    [
      'voterAppealedRaw', 'pending',
      {
        writes: [
          { service: 'voter', key: 'voterAppealedRaw', value: 'pending' },
          { service: 'voter', key: 'voterAppealed', value: 'pending' },
        ],
        screen: 'voter-diagnosis',
      },
    ],
    [
      'voterAppealedRaw', 'notsure',
      {
        writes: [
          { service: 'voter', key: 'voterAppealedRaw', value: 'notsure' },
          { service: 'voter', key: 'voterAppealed', value: 'unclassified' },
        ],
        screen: 'voter-diagnosis',
      },
    ],
    ['sirQ1', 'notsure', { writes: [{ service: 'sir', key: 'sirQ1', value: 'unclassified' }], screen: 'sir-diagnosis' }],
    ['sirQ1', 'roll_absent', { writes: [{ service: 'sir', key: 'sirQ1', value: 'roll_absent' }], screen: 'sir-diagnosis' }],
  ] as const)('%s / %s -- D2 quoted on the voterEntry rows: "the entry choice itself is never stored"', (questionId, value, expected) => {
    expect(unplaceablePickPlan(questionId, value)).toEqual(expected)
  })
})
