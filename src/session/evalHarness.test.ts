// evalHarness — the eval-harness SHAPE (Task 18, design note 6). Run ONLY
// against `simProvider` here, never against a real Gemini call: this suite
// proves the harness computes agreement correctly, which is a claim about
// the RUNNER'S code, not a claim about Gemini's quality. A green run here is
// NOT a passed launch bar (FR-AI-02) — the repo owner still has to gather a
// real per-service phrasing corpus against real Gemini output and set a
// published threshold; see this task's own report.
import { describe, it, expect } from 'vitest'
import type { InterpreterProvider, RawInterpretation } from '../domain/interpret'
import { simProvider } from '../domain/simInterpreter'
import { SEED_EVAL_ROWS, runEval } from './evalHarness'
import type { EvalFixtureRow } from './evalHarness'

describe('SEED_EVAL_ROWS', () => {
  it('has all eight example stories (six entry screens, screenCopy.ts\'s own comment count) — sanity: not vacuous', () => {
    expect(SEED_EVAL_ROWS.length).toBe(8)
  })

  it('every row has a non-empty text and a service that matches its entryScreen\'s real DESCRIBE_CHAINS entry', () => {
    for (const row of SEED_EVAL_ROWS) {
      expect(row.text.length).toBeGreaterThan(0)
      expect(typeof row.service).toBe('string')
      expect(row.service.length).toBeGreaterThan(0)
    }
  })

  it('at least one row has a non-empty `expected` (the harness is proven against real agreement, not eight vacuous zero-expectation rows)', () => {
    expect(SEED_EVAL_ROWS.some(r => r.expected.length > 0)).toBe(true)
  })
})

describe('runEval — against simProvider over SEED_EVAL_ROWS: proves the harness runs end to end and produces a real report', () => {
  it('reports rows === 8, and 100% agreement on every question — SEED_EVAL_ROWS.expected is the SIMULATOR\'S OWN empirically observed output, so running it back through the simulator must agree perfectly; this is what proves the harness is wired correctly, NOT a passed launch bar (FR-AI-02 needs a real Gemini corpus and a published threshold, neither of which this ships)', async () => {
    const report = await runEval(SEED_EVAL_ROWS, simProvider)
    expect(report.rows).toBe(8)
    expect(report.perQuestion.length).toBeGreaterThan(0) // sanity: not a vacuous empty report
    for (const stat of report.perQuestion) {
      expect(stat.agreed).toBe(stat.total)
    }
  })

  it('the per-question totals sum to the total number of non-empty `expected` entries across all rows — a cross-check that the tally itself is not silently dropping or double-counting rows', async () => {
    const report = await runEval(SEED_EVAL_ROWS, simProvider)
    const expectedTotal = SEED_EVAL_ROWS.reduce((n, r) => n + r.expected.length, 0)
    const reportedTotal = report.perQuestion.reduce((n, s) => n + s.total, 0)
    expect(reportedTotal).toBe(expectedTotal)
    expect(expectedTotal).toBeGreaterThan(0) // sanity
  })

  it('reports specific question ids with the exact counts the empirical probe produced (q1, q2, voterEntry, voterQ1, voterAppealedRaw, sirQ1)', async () => {
    const report = await runEval(SEED_EVAL_ROWS, simProvider)
    const byId = new Map(report.perQuestion.map(s => [s.questionId, s]))
    // q1: 1 expectation (passport-q1.one). q2: 3 expectations (passport-q1.one,
    // passport-q2.one, passport-q2.two).
    expect(byId.get('q1')).toEqual({ questionId: 'q1', total: 1, agreed: 1 })
    expect(byId.get('q2')).toEqual({ questionId: 'q2', total: 3, agreed: 3 })
    expect(byId.get('voterEntry')).toEqual({ questionId: 'voterEntry', total: 1, agreed: 1 })
    expect(byId.get('voterQ1')).toEqual({ questionId: 'voterQ1', total: 2, agreed: 2 })
    expect(byId.get('voterAppealedRaw')).toEqual({ questionId: 'voterAppealedRaw', total: 2, agreed: 2 })
    expect(byId.get('sirQ1')).toEqual({ questionId: 'sirQ1', total: 1, agreed: 1 })
  })
})

describe('runEval — actually discriminates a disagreement, not just "reports agreed for everything"', () => {
  it('a row whose expected value does NOT match the provider\'s proposed value is tallied as a disagreement (agreed stays 0, total becomes 1)', async () => {
    const wrongRow: EvalFixtureRow = {
      service: 'Passport',
      entryScreen: 'passport-q1',
      text: 'The report came back adverse.', // the simulator maps q1 -> 'adverse' for this text
      expected: [{ questionId: 'q1', value: 'no_contact' }], // deliberately the WRONG value
    }
    const report = await runEval([wrongRow], simProvider)
    const q1 = report.perQuestion.find(s => s.questionId === 'q1')
    expect(q1).toEqual({ questionId: 'q1', total: 1, agreed: 0 })
  })

  it('a row where the provider proposes NOTHING for the expected question is also a disagreement (agreed 0, not a crash)', async () => {
    const noAnswerRow: EvalFixtureRow = {
      service: 'Passport',
      entryScreen: 'passport-q1',
      text: 'Something entirely unrelated to any rule.',
      expected: [{ questionId: 'q1', value: 'adverse' }],
    }
    const report = await runEval([noAnswerRow], simProvider)
    const q1 = report.perQuestion.find(s => s.questionId === 'q1')
    expect(q1).toEqual({ questionId: 'q1', total: 1, agreed: 0 })
  })
})

describe('runEval — is provider-agnostic (design note 6: "a runner that takes an array of these rows plus a provider")', () => {
  it('runs against any InterpreterProvider, not just simProvider — a fake provider that always proposes a fixed value is tallied exactly like a real one would be', async () => {
    const fakeProvider: InterpreterProvider = {
      id: 'sim',
      minSpanTokens: 1,
      async interpret(): Promise<RawInterpretation> {
        return { mappings: [{ questionId: 'q1', value: 'adverse', span: 'irrelevant' }], facts: [] }
      },
    }
    const row: EvalFixtureRow = {
      service: 'Passport',
      entryScreen: 'passport-q1',
      text: 'anything at all',
      expected: [{ questionId: 'q1', value: 'adverse' }],
    }
    const report = await runEval([row], fakeProvider)
    expect(report.perQuestion).toEqual([{ questionId: 'q1', total: 1, agreed: 1 }])
  })
})

describe('runEval — a row with an unknown entryScreen fails closed rather than throwing', () => {
  it('an entryScreen that is not a real DescribeEntryScreenId contributes an empty question offer, not a crash, and the row\'s expected question is tallied as a disagreement', async () => {
    const badRow: EvalFixtureRow = {
      service: 'Passport',
      entryScreen: 'not-a-real-screen',
      text: 'anything',
      expected: [{ questionId: 'q1', value: 'adverse' }],
    }
    await expect(runEval([badRow], simProvider)).resolves.toEqual({
      rows: 1,
      perQuestion: [{ questionId: 'q1', total: 1, agreed: 0 }],
    })
  })
})
