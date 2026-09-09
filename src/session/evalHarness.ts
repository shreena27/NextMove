// The eval-harness SHAPE (Task 18, design note 6). FR-AI-02 makes "a
// published maximum Change-rate per question against real Gemini output"
// the production launch bar; spec §7 asks for "fixed real phrasings per
// service with expected mappings, run on every prompt/model change." This
// module ships the harness itself — a fixture-row type and a runner that
// reports per-question agreement. The SEED rows built from the example
// stories already shown to citizens (`screenCopy.ts`'s `UI.describe.examples`)
// live in `evalHarness.test.ts` (`SEED_EVAL_ROWS`), not here — whole-branch
// review (2026-09-09 fix wave), Finding 4: building them needs `UI` from
// `../screens/screenCopy`, and `session/` code must never import from
// `screens/` (this codebase's Global Constraints, docs/superpowers/plans/
// 2026-09-08-c8-describe-it.md); nothing at runtime reads `SEED_EVAL_ROWS`,
// only the test file that proves the harness runs end to end.
//
// What this module deliberately does NOT ship (scope exclusion 8, and the
// task brief's own instruction): a corpus of REAL phrasings gathered against
// a live Gemini, and a published agreement threshold. `SEED_EVAL_ROWS` is
// checked against `simProvider` only — the simulator agreeing with its own
// (empirically observed) output proves the HARNESS runs correctly; it is
// not, and cannot be, a passed launch bar. See this task's own report for
// that stated plainly.
import type { DescribeEntryScreenId, InterpreterProvider } from '../domain/interpret'
import { DESCRIBE_CHAINS } from '../domain/interpret'
import { resolveOptionValues } from '../domain/interpretGates'

/** One eval fixture: a citizen-shaped story, the entry screen it was typed
 *  on, and the mapping(s) a correct read of it should produce. Exactly the
 *  shape design note 6 specifies. `service`/`entryScreen` are carried
 *  separately (rather than deriving `service` from `entryScreen` at eval
 *  time) so a row is a self-contained, inspectable fixture on its own —
 *  matching `screenCopy.ts`'s existing README-style expectation for how
 *  example stories are keyed. */
export interface EvalFixtureRow {
  service: string
  entryScreen: string
  text: string
  expected: { questionId: string; value: string }[]
}

/** Per-question tally: how many rows expected an answer for this question
 *  (`total`), and how many of those the provider's RAW proposed mapping
 *  matched exactly on `value` (`agreed`). Deliberately compares the
 *  provider's RAW `interpret()` output, not a fully gated
 *  `GatedInterpretation` — Change-rate is a measure of the MODEL's read,
 *  and running every row through the enum/span gates as well would
 *  conflate "the model proposed the wrong value" with "the model proposed
 *  the right value but the app-side gate rejected it for an unrelated
 *  reason (a short span, an unreached branch)". A future pass MAY want a
 *  gated variant too; this harness's job (design note 6) is the shape, not
 *  every possible cut of the metric. */
export interface EvalQuestionStat {
  questionId: string
  total: number
  agreed: number
}

export interface EvalReport {
  rows: number
  perQuestion: EvalQuestionStat[]
}

/** Runs every row in `rows` through `provider.interpret()` (RAW, ungated —
 *  see `EvalQuestionStat`'s doc comment) and tallies, per question id, how
 *  often the provider's proposed value matched the row's `expected` value
 *  exactly. Each row is evaluated against `knownAnswers: {}` — a fresh entry
 *  into its chain, matching how every example story is actually offered to
 *  a citizen (`DescribeBlock`, Task 11) — never a pre-filled answer set,
 *  which fixture rows have no field for anyway.
 *
 *  A row whose `entryScreen` is not a real `DescribeEntryScreenId` degrades
 *  to an empty question list (fails closed to "nothing offered", the same
 *  posture `runInterpretation`'s own `no-chain` branch takes for an unknown
 *  screen) rather than throwing — a single malformed fixture row should not
 *  abort a report over every other row. */
export async function runEval(rows: readonly EvalFixtureRow[], provider: InterpreterProvider): Promise<EvalReport> {
  const totals = new Map<string, { total: number; agreed: number }>()

  for (const row of rows) {
    const chain = DESCRIBE_CHAINS[row.entryScreen as DescribeEntryScreenId]?.chain ?? []
    const questions = chain.map(q => ({ questionId: q.questionId, optionValues: resolveOptionValues(q, {}) }))
    const raw = await provider.interpret({ service: row.service, questions, text: row.text })

    for (const exp of row.expected) {
      const stat = totals.get(exp.questionId) ?? { total: 0, agreed: 0 }
      stat.total += 1
      const actual = raw.mappings.find(m => m.questionId === exp.questionId)
      if (actual && actual.value === exp.value) stat.agreed += 1
      totals.set(exp.questionId, stat)
    }
  }

  const perQuestion = [...totals.entries()]
    .map(([questionId, s]) => ({ questionId, total: s.total, agreed: s.agreed }))
    .sort((a, b) => a.questionId.localeCompare(b.questionId))

  return { rows: rows.length, perQuestion }
}

// Whole-branch review (2026-09-09 fix wave), Finding 4: `EXPECTED_BY_SCREEN_KEY`
// and `SEED_EVAL_ROWS` used to live here, but they exist ONLY to build the
// seed fixture rows `evalHarness.test.ts` runs through `runEval` above — no
// runtime (non-test) code ever reads either — and building them required
// importing `UI` from `../screens/screenCopy`, a `session/` -> `screens/`
// import this codebase's Global Constraints forbid (docs/superpowers/plans/
// 2026-09-08-c8-describe-it.md): "session/ code never imports from
// screens/". `runEval` itself (above) needs no such import; the seed data
// now lives in `evalHarness.test.ts`, the only place it was ever consumed.
