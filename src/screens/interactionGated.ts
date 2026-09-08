/** The single source of truth for which `SCREEN_COPY` entries no STATIC
 *  mount can produce (Task 6 design note 4a): each needs a real user
 *  interaction (a tick, a click) or a draft shape no shipped plan has.
 *  `screenCopy.test.tsx`'s coverage sweep is `render(mount())` with no
 *  interaction, and `PrepareScreen`'s tick/draft state has no prop seam to
 *  pre-seed for a test (adding one purely for a test would be a production
 *  API existing for test convenience — the wrong trade), so these five are
 *  skipped there and covered instead by a real interaction test in
 *  `interactionGated.test.tsx` (relocated there by Task 11's own fix round
 *  1 — see that file's own header comment for why `PrepareScreen.test.tsx`
 *  was the wrong home).
 *
 *  Deliberately its own module, imported by BOTH `screenCopy.test.tsx` (to
 *  skip these entries in its static coverage sweep) and
 *  `interactionGated.test.tsx` (to pin real interaction coverage against
 *  it), rather than declared twice: two independently hand-typed copies can
 *  drift apart (a 6th entry added to one and not the other) with nothing to
 *  catch it. A single import makes that structurally impossible — there is
 *  only one place to edit. Deliberately importing
 *  nothing itself (not even a type), so `guardrails/isolation.test.ts`'s
 *  import-scan — which walks every non-test `.ts`/`.tsx` file under `src/`
 *  — has nothing here to flag, the same discipline `screenCopy.ts`'s own
 *  header note describes for its local `CopyLocation` interface. */
export const INTERACTION_GATED = new Set([
  'ui:prepare.copied',
  'ui:prepare.copiedOne',
  'ui:prepare.copiedMany',
  'ui:prepare.hintReady',
  'ui:prepare.doneNoteFallback',
  // C8 (docs/superpowers/plans/2026-09-08-c8-describe-it.md, Task 10 design
  // note 10) — likely candidates for entries a static mount genuinely cannot
  // produce. Each names its own covering task; per this module's own rule,
  // gating is for genuinely interaction-only copy, never for "fiddly to
  // mount", and each entry below is re-checked against that rule by the task
  // that builds its component — a false-positive gate is lifted there, not
  // left standing.
  'ui:describe.err', // needs a submit-with-empty-text interaction (Task 11)
  'ui:describe.reading', // needs an in-flight interpretation (Task 11)
  'ui:facts.editLabel', // edit-mode input aria-label; needs a click on Edit first (Task 13)
  'ui:facts.saveLabel', // edit-mode save-button aria-label; needs a click on Edit first (Task 13)
  'ui:prepare.hintFilledUnreviewed', // needs a draft whose blanks are fully fact-filled, a shape no shipped PREP plan produces unassisted (Task 15)
])
