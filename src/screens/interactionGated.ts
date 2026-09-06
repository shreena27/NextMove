/** The single source of truth for which `SCREEN_COPY` entries no STATIC
 *  mount can produce (Task 6 design note 4a): each needs a real user
 *  interaction (a tick, a click) or a draft shape no shipped plan has.
 *  `screenCopy.test.tsx`'s coverage sweep is `render(mount())` with no
 *  interaction, and `PrepareScreen`'s tick/draft state has no prop seam to
 *  pre-seed for a test (adding one purely for a test would be a production
 *  API existing for test convenience — the wrong trade), so these five are
 *  skipped there and covered instead by a real interaction test in
 *  `PrepareScreen.test.tsx`.
 *
 *  Deliberately its own module, imported by BOTH `screenCopy.test.tsx` and
 *  `PrepareScreen.test.tsx`, rather than declared twice: two independently
 *  hand-typed copies can drift apart (a 6th entry added to one and not the
 *  other) with nothing to catch it. A single import makes that structurally
 *  impossible — there is only one place to edit. Deliberately importing
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
])
