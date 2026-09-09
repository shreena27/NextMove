// The eval-harness SHAPE (Task 18, design note 6). FR-AI-02 makes "a
// published maximum Change-rate per question against real Gemini output"
// the production launch bar; spec §7 asks for "fixed real phrasings per
// service with expected mappings, run on every prompt/model change." This
// module ships the harness itself — a fixture-row type and a runner that
// reports per-question agreement — plus the example stories already shown
// to citizens (`screenCopy.ts`'s `UI.describe.examples`) as SEED rows.
//
// What this module deliberately does NOT ship (scope exclusion 8, and the
// task brief's own instruction): a corpus of REAL phrasings gathered against
// a live Gemini, and a published agreement threshold. `SEED_EVAL_ROWS`
// below is checked against `simProvider` only — the simulator agreeing with
// its own (empirically observed) output proves the HARNESS runs correctly;
// it is not, and cannot be, a passed launch bar. See this task's own report
// for that stated plainly.
import type { DescribeEntryScreenId, InterpreterProvider } from '../domain/interpret'
import { DESCRIBE_CHAINS } from '../domain/interpret'
import { resolveOptionValues } from '../domain/interpretGates'
import { UI } from '../screens/screenCopy'

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

/** The expected mapping for each of `UI.describe.examples`'s eight example
 *  stories, keyed the same way (`screenId` -> ordinal key `one`/`two`).
 *  These are NOT invented — they are the simulator's own empirically
 *  observed output for each story, determined by actually calling
 *  `simulateInterpretation` against them (design note 6: "the same way
 *  Task 17's own implementer verified simulator behavior empirically"), not
 *  read off `simInterpreter.ts`'s rule table by eye. `'passport-q2'.two` is
 *  the story that trips the simulator's OWN documented deliberate flaw
 *  (`simInterpreter.ts`'s "informal" agent/patient-confusion rule) — its
 *  expected value here is `'informal'`, the simulator's actual (flawed)
 *  read, NOT the honest human read of the sentence. That is deliberate: a
 *  seed row's `expected` records what a CORRECTLY FUNCTIONING copy of the
 *  fixture's own provider produces, so `SEED_EVAL_ROWS` run against
 *  `simProvider` proves the harness computes agreement correctly. It is not
 *  a claim about what Gemini should produce for that story — a real Gemini
 *  eval corpus (which this module does not ship) would need its OWN
 *  expected values, independently derived, most likely the honest read
 *  rather than the simulator's known flaw. */
const EXPECTED_BY_SCREEN_KEY: Record<string, Record<string, { questionId: string; value: string }[]>> = {
  'passport-q1': {
    one: [
      { questionId: 'q1', value: 'contacted_incomplete' },
      { questionId: 'q2', value: 'informal' },
    ],
    two: [],
  },
  'passport-q2': {
    one: [{ questionId: 'q2', value: 'informal' }],
    two: [{ questionId: 'q2', value: 'informal' }],
  },
  'voter-entry': {
    one: [
      { questionId: 'voterEntry', value: 'applied' },
      { questionId: 'voterQ1', value: 'decision' },
      { questionId: 'voterAppealedRaw', value: 'none' },
    ],
  },
  'voter-q1': {
    one: [{ questionId: 'voterQ1', value: 'no_word' }],
  },
  'voter-q2': {
    one: [{ questionId: 'voterAppealedRaw', value: 'pending' }],
  },
  'sir-q1': {
    one: [{ questionId: 'sirQ1', value: 'roll_absent' }],
  },
}

/** Seed rows (design note 6): the eight example stories already shown to
 *  citizens (`screenCopy.ts`'s `UI.describe.examples`), built by reading
 *  their TEXT live off that object (never duplicated as a second copy of
 *  the strings, so this module can never drift from what a citizen actually
 *  sees) and pairing each with its empirically-observed expected mapping
 *  above. Proves the harness runs end to end (`evalHarness.test.ts`); does
 *  NOT constitute a populated eval corpus or a passed launch bar — see this
 *  module's own header comment. */
export const SEED_EVAL_ROWS: EvalFixtureRow[] = Object.entries(UI.describe.examples).flatMap(([screenId, byKey]) =>
  Object.entries(byKey as Record<string, string>).map(([key, text]) => ({
    service: DESCRIBE_CHAINS[screenId as DescribeEntryScreenId].service,
    entryScreen: screenId,
    text,
    expected: EXPECTED_BY_SCREEN_KEY[screenId]?.[key] ?? [],
  })),
)
