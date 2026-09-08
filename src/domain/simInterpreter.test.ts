// simulateInterpretation / simProvider — the concrete simulator provider.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html — SIM_RULES
// (1784-1817), its own deliberate-flaw comment (1779-1783), and
// simulateInterpretation's skip/first-match/span-is-the-match shape
// (1930-1944), MINUS the extractFacts/gateInterpretation calls the prototype
// makes at 1941/1943 (design note 2, C1/D18: the simulator gates nothing and
// extracts nothing of its own).
//
// NOTE (self-review flag, not a blocker): the brief's own RED item 1 says
// "18 rules across six tables"; the real prototype SIM_RULES (1784-1817) has
// 20 (q1:4, q2:3, voterEntry:2, voterQ1:3, voterAppealedRaw:3, sirQ1:5). This
// file transcribes the REAL, verbatim rule count and tests all 20 — the brief
// undercounted in prose, but the transcription instruction itself ("SIM_RULES
// ... is transcribed verbatim") is unambiguous, and verbatim is what wins.
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ChainEntry } from './interpret'
import { DESCRIBE_CHAINS } from './interpret'
import { extractFacts } from './interpretFacts'
import { simulateInterpretation, simProvider } from './simInterpreter'
import { runInterpretation } from '../session/interpretation'

afterEach(() => {
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// Rule-table fidelity: one representative positive per rule (20 rules across
// six tables), asserted on {questionId, value} and on span being a substring
// of the input (the match IS the span — verbatim by construction).

interface RuleFixture {
  questionId: string
  phrase: string
  expectedValue: string
}

const RULE_FIXTURES: RuleFixture[] = [
  // q1 (4 rules)
  { questionId: 'q1', phrase: 'The report came back adverse.', expectedValue: 'adverse' },
  { questionId: 'q1', phrase: 'The verification is done now.', expectedValue: 'verified_no_progress' },
  { questionId: 'q1', phrase: 'The police came to my house last week.', expectedValue: 'contacted_incomplete' },
  { questionId: 'q1', phrase: 'Nothing has happened with the police yet.', expectedValue: 'no_contact' },
  // q2 (3 rules) — the flawed rule is covered separately below, deliberately
  { questionId: 'q2', phrase: 'I filed a formal grievance about it.', expectedValue: 'formal_grievance' },
  { questionId: 'q2', phrase: 'I wrote to them about the delay.', expectedValue: 'informal' },
  { questionId: 'q2', phrase: "I haven't managed to do anything about it yet.", expectedValue: 'no_followup' },
  // voterEntry (2 rules)
  { questionId: 'voterEntry', phrase: 'This is about the special intensive revision.', expectedValue: 'sir' },
  { questionId: 'voterEntry', phrase: 'I applied for a new voter card.', expectedValue: 'applied' },
  // voterQ1 (3 rules)
  { questionId: 'voterQ1', phrase: 'My application was rejected outright.', expectedValue: 'decision' },
  { questionId: 'voterQ1', phrase: 'The booth level officer came to verify.', expectedValue: 'blo_visited' },
  { questionId: 'voterQ1', phrase: 'I have not heard anything at all.', expectedValue: 'no_word' },
  // voterAppealedRaw (3 rules)
  { questionId: 'voterAppealedRaw', phrase: 'My appeal was decided last month.', expectedValue: 'decided' },
  { questionId: 'voterAppealedRaw', phrase: 'I filed an appeal and it is pending.', expectedValue: 'pending' },
  { questionId: 'voterAppealedRaw', phrase: 'I have not appealed at all.', expectedValue: 'none' },
  // sirQ1 (5 rules)
  { questionId: 'sirQ1', phrase: 'I got a notice asking for documents.', expectedValue: 'notice' },
  { questionId: 'sirQ1', phrase: 'I am registered in both places, it seems.', expectedValue: 'duplicate' },
  { questionId: 'sirQ1', phrase: 'My name is not on the roll.', expectedValue: 'roll_absent' },
  { questionId: 'sirQ1', phrase: 'I checked and my name is there.', expectedValue: 'roll_present' },
  { questionId: 'sirQ1', phrase: 'I have not checked the roll yet.', expectedValue: 'roll_unchecked' },
]

describe('simulateInterpretation — SIM_RULES rule-table fidelity (prototype 1784-1817), one representative positive per rule', () => {
  it('found all 20 rule fixtures (the check itself is not vacuous)', () => {
    expect(RULE_FIXTURES.length).toBe(20)
  })

  it.each(RULE_FIXTURES.map(f => [f.questionId, f.phrase, f.expectedValue] as const))(
    '%s: %j -> %s, with span a substring of the input',
    (questionId, phrase, expectedValue) => {
      const chain: ChainEntry[] = [{ questionId, optionValues: [expectedValue] }]
      const result = simulateInterpretation(chain, {}, phrase)
      expect(result.mappings).toEqual([{ questionId, value: expectedValue, span: expect.any(String) }])
      const span = result.mappings[0].span
      expect(phrase.includes(span)).toBe(true)
    },
  )
})

describe('simulateInterpretation — rule ORDER is load-bearing (prototype comment: "rules are ordered so more specific readings beat generic ones")', () => {
  it("'I filed a formal grievance after calling them' maps q2 to 'formal_grievance', not 'informal' — first-match-wins with the more specific rule first. If a future edit reorders SIM_RULES.q2 (or widens the informal rule to also catch grievance-shaped text), this is the test that catches it", () => {
    const chain: ChainEntry[] = [{ questionId: 'q2', optionValues: ['formal_grievance', 'informal', 'no_followup'] }]
    const result = simulateInterpretation(chain, {}, 'I filed a formal grievance after calling them')
    expect(result.mappings).toEqual([{ questionId: 'q2', value: 'formal_grievance', span: 'grievance' }])
  })
})

// ---------------------------------------------------------------------------
// The deliberate flaw (design note 1, FR-AI-06). DO NOT FIX THIS RULE.

describe('simulateInterpretation — THE DELIBERATE FLAW (prototype 1779-1783, FR-AI-06) — do not "fix" this test or the rule it pins', () => {
  it("'Someone from the passport office called me yesterday about my file' produces q2: 'informal' — THIS IS A DELIBERATE BUG (prototype 1779-1783, FR-AI-06). It exists so the confirm screen's Change control has something real to catch. Do not fix it.", () => {
    const chain = DESCRIBE_CHAINS['passport-q2'].chain
    const result = simulateInterpretation(chain, {}, 'Someone from the passport office called me yesterday about my file')
    expect(result.mappings).toEqual([{ questionId: 'q2', value: 'informal', span: 'called' }])
    // The honest reading is that the PASSPORT OFFICE called the citizen, not
    // the other way around — an agent/patient confusion exactly like a real
    // model makes. The simulator reads it backwards on purpose, verbatim from
    // the locked prototype. Task 12's Change control is what proves the
    // actual safeguard (human confirmation) catches this; this test only
    // proves the flaw is still there to catch.
  })
})

// ---------------------------------------------------------------------------
// knownAnswers-skip and reachability-skip (design note 3): not redundant with
// the gate — the gate never checks "already answered" at all, and the gate's
// own reachability recheck cannot see what the SIMULATOR chose not to
// propose in the first place. Both layers, both tested (this is the
// simulator's own layer).

describe('simulateInterpretation — proposes nothing for an already-answered question, and nothing for an unreachable one (design note 3)', () => {
  it('a question already present in knownAnswers is never proposed, even when the text would otherwise match one of its rules', () => {
    const chain = DESCRIBE_CHAINS['passport-q1'].chain // [q1, q2(reachableIf: a.q1 present)]
    const text = 'The report on my application came back adverse.'
    const result = simulateInterpretation(chain, { q1: 'adverse' }, text)
    expect(result.mappings.some(m => m.questionId === 'q1')).toBe(false)
    // sanity: q1's own rule really would have matched this text if it were offered
    const withoutKnown = simulateInterpretation(chain, {}, text)
    expect(withoutKnown.mappings.some(m => m.questionId === 'q1')).toBe(true)
  })

  it('an unreachable question is never proposed, even when the text would otherwise match one of its rules — q2 is unreachable until q1 is known or mapped within this same call', () => {
    const chain = DESCRIBE_CHAINS['passport-q1'].chain
    // Text matches q2's formal_grievance rule but says nothing q1's rules
    // would match, so q1 stays unmapped and q2's reachableIf never fires.
    const text = 'I already filed a formal grievance about this matter.'
    const result = simulateInterpretation(chain, {}, text)
    expect(result.mappings.some(m => m.questionId === 'q2')).toBe(false)
  })

  it('smart skip: q2 IS proposed when q1 gets mapped from the SAME text, within the same call, even though q1 is not in knownAnswers yet', () => {
    const chain = DESCRIBE_CHAINS['passport-q1'].chain
    const text = 'The report on my application came back adverse, and I already filed a formal grievance about it.'
    const result = simulateInterpretation(chain, {}, text)
    expect(result.mappings.map(m => m.questionId)).toEqual(['q1', 'q2'])
  })
})

// ---------------------------------------------------------------------------
// Shape: RAW only, never gated (design note 2 — this is what makes the
// Global Constraint structural rather than procedural).

describe('simulateInterpretation — return shape is RawInterpretation ONLY, never gated (design note 2)', () => {
  it('has no discarded/unplaceable/droppedSensitive/__gated key — RawInterpretation and GatedInterpretation are deliberately different types; the simulator returns the raw one and never calls the gate itself', () => {
    const chain = DESCRIBE_CHAINS['passport-q1'].chain
    const result = simulateInterpretation(chain, {}, 'My application was rejected outright.')
    expect(Object.keys(result).sort()).toEqual(['facts', 'mappings'])
  })
})

// ---------------------------------------------------------------------------
// facts: [] always (design note 2a, D18, C1's other half)

describe('simulateInterpretation — returns facts: [] always (design note 2a, D18)', () => {
  it("facts: [] even for a story dense with reference numbers and dates — facts are the gate's job for every provider; a simulator that extracts its own is the arrangement C1 removed", () => {
    const chain = DESCRIBE_CHAINS['passport-q1'].chain
    const story = 'My ARN is 123456789012, applied 12 March 2026. The police visited in June 2026 but nothing happened after, and my aadhaar is 987654321098.'
    const result = simulateInterpretation(chain, {}, story)
    expect(result.facts).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Fact parity (design note 2a): the strongest available proof of C1's fix —
// a full runInterpretation() run's gated facts must deep-equal
// extractFacts() called directly on the same story. If the simulator ever
// secretly extracted its own facts, this is the test that would catch it:
// gateFacts's baseline (seeded from extractFactsInternal) would then be
// double-counting or diverging from a provider-supplied fact stream, and the
// deep-equal below would fail.

describe('simulateInterpretation / runInterpretation — fact parity: the citizen sees identical facts whichever interpreter ran (design note 2a, C1 proof)', () => {
  const STORY =
    'Someone from the passport office called me yesterday about my file. My ARN is 123456789012, applied 12 March 2026. The police also visited in June 2026 but nothing happened after that.'

  it('a full runInterpretation() run over the story yields interp.facts deep-equal to extractFacts(engine, story).facts directly', async () => {
    vi.stubEnv('VITE_DESCRIBE_IT', 'on')
    const direct = extractFacts('passport', STORY)
    // sanity: the story really does produce non-empty facts — otherwise this
    // parity check would pass vacuously on two empty arrays and prove nothing
    expect(direct.facts.length).toBeGreaterThan(0)

    const result = await runInterpretation('passport-q1', {}, STORY)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.interp.facts).toEqual(direct.facts)
    }
  })

  it('simProvider.interpret() itself (not just the orchestrator) still returns facts: [] for the same dense story — the simulator contributes nothing; every fact above came from the gate, not the provider', async () => {
    const raw = await simProvider.interpret({ service: 'Passport', questions: [], text: STORY })
    expect(raw.facts).toEqual([])
  })
})
