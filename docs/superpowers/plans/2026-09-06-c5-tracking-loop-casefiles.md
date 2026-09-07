# C5 — Device-Local Persistence + Casefiles + Tracking Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the locked prototype's tracking loop into the real codebase — the device-local casefile store, the working (pre-save) case, save/adopt with one-active-case-per-service, the casefile screen (case trail, escalation ladder, prepare progress, journey log, "add an update" module), the check-in interaction itself with its valence gate, undo, dead-end/closed/reopen states, SIR phase drift, and Home's multi-casefile section — chunk C5 of `NextMove_Implementation_Plan_FINAL.md` §10.5 and GitHub issue #8.

**Architecture:** C5 is the first chunk that gives `SessionState` a *persisted* slice. It consumes C1's engine (`diagnose`, `applyEvent`, `applyCorrection`), C1's already-transcribed `CHECKIN_PATCHES` (`src/domain/checkinPatches.ts`), C2's playbooks and guardrail harness, C3's `Split`/`Crumbs`/`Button`/`StatusStamp`/`Gems`/`ICONS`/`screenCopy.ts`/`ladder.ts`, and C4's `PrepareScreen` and `prep.ts` — extending them, never restructuring them. No new engine logic and no new government-process rule: every rung, patch, outcome value and state transition already exists as data.

The design authority is, in this precedence order:

1. **`design/nextmove-v1-prototype.html` at git tag `v1-design-lock-2` (commit `91ff7a1`)** — the shipped code. Every string, class name, option order and state transition is transcribed from it.
2. **`docs/superpowers/specs/2026-09-05-checkin-tracking-loop-design.md`** — the loop's own approved, Opus-reviewed design spec (state model, valence gating, dead-end/closure semantics, journey log, phase drift, the "no suggested interval" rule).
3. **`docs/superpowers/specs/2026-09-05-compact-card-casefile-screen-design.md`** — the casefile screen's own approved spec (compact Home card, whole-card tap target, the check-in screen promoted to be the case's home).

Where a spec and the prototype appear to disagree, the prototype's code is what shipped into the lock and wins — **except** where the prototype provably fails its own spec, which happens once (see **Recorded deviation D1**, the undo double-snapshot). Extract everything programmatically, never by eye:

```bash
git show 91ff7a1:design/nextmove-v1-prototype.html > /tmp/proto.html

sed -n '1947,1951p'  /tmp/proto.html   # the S state object (ci*, savedCases, workingCase, logOpen, phaseDrift)
sed -n '1953,1984p'  /tmp/proto.html   # store{}, nm_cases load, the nm_case migration, persistCases
sed -n '1985,2007p'  /tmp/proto.html   # activeCase (1990) / beginWorkingCheckin (1994)
sed -n '2027,2045p'  /tmp/proto.html   # nav (2027) / back (2035) / restart (2043) — the persisted-slice rule
sed -n '2048,2103p'  /tmp/proto.html   # beginSave (2048) / caseSnapshot (2053) / completeSave (2072) /
                                       # caseIsSaved (2092) / updateAns (2099)
sed -n '2160,2195p'  /tmp/proto.html   # loadCase (2160) / continueSaved (2172) / removeSaved (2178) /
                                       # reopenCase (2183) / setAns (2195)
sed -n '2284,2298p'  /tmp/proto.html   # updateEntry (2284) + saveControl (2292)
sed -n '2500,2596p'  /tmp/proto.html   # DELIVERABLE_LABEL / DELIVERABLE_Q (2500-2501) + the CHECKIN table
                                       # (2508-2596 — labels + kinds)
sed -n '2597,2616p'  /tmp/proto.html   # checkinOptions (state x prepare-step completion)
sed -n '2617,2724p'  /tmp/proto.html   # ciLog (2621) / ciPersistState (2628) / openCheckin (2633) /
                                       # ciChoose (2638) / ciSnapshotNow (2658) / ciApplyPatch (2662) /
                                       # ciConfirm (2676) / ciValence (2684) / ciClosureAnswer (2694) /
                                       # ciUndo (2713) / setRemind (2721)
sed -n '2725,2740p'  /tmp/proto.html   # closeUnresolved (2725) / fmtDay (2731) / fmtRemind (2735) / daysAgo (2739)
sed -n '2792,2829p'  /tmp/proto.html   # renderLadder (2792-2803) + renderLog (2807-2829)
sed -n '2830,2970p'  /tmp/proto.html   # renderCheckin — THE casefile screen (open + closed variants)
sed -n '2971,3000p'  /tmp/proto.html   # renderDeadEnd (2971) + renderCaseClosed (2986)
sed -n '3116,3135p'  /tmp/proto.html   # CLOSED_TITLE (3116) + caseCard (3117-3135)
sed -n '3136,3171p'  /tmp/proto.html   # renderHome (the home-cases section, 3137-3142 + 3168)
sed -n '3581,3610p'  /tmp/proto.html   # renderDiagnosis — ciJustUpdated banner (3597), phaseDrift banner
                                       # (3599), updateEntry (3607)
sed -n '3654,3684p'  /tmp/proto.html   # renderNextMove — updateEntry (3680) + saveControl (3681) tail
sed -n '3685,3695p'  /tmp/proto.html   # togglePrepStep (the casefile sync C4 deferred)
sed -n '3728,3736p'  /tmp/proto.html   # copyReminder
sed -n '3746,3820p'  /tmp/proto.html   # renderPrepare — the saveControl tail at 3817
sed -n '3887,3899p'  /tmp/proto.html   # renderSaveDone
sed -n '3902,3945p'  /tmp/proto.html   # the router switch

sed -n '562,568p'    /tmp/proto.html   # .saved-next / .saved-steps / .saved-meta (interleaved into C4's block)
sed -n '651,661p'    /tmp/proto.html   # .btn-ghost + .saved-note
sed -n '744,878p'    /tmp/proto.html   # .saved-card ... .log-note — the whole casefile/ladder/check-in/journey block
```

**On the line numbers.** Every citation above and in the tasks below was re-derived mechanically against the committed file during plan review (2026-09-06), *after* a first pass shipped a whole family of wrong ones. **The plan's original 2044-2200 and 2618-2745 citations were off by roughly 6-20 lines throughout, and its `sed -n '2734,2745p'` extraction silently missed `closeUnresolved` and `fmtDay` entirely.** The render-layer function-start citations (2792, 2807, 2830, 2971, 2986, 3116, 3117, 3136, 3685, 3887) and all three CSS ranges (562-568, 651-661, 744-878) were exact and are unchanged; the *sub-ranges inside* `renderCheckin` were not, and have been re-derived too. So: **do not treat any citation here as authoritative without re-deriving it.** `grep -n "^function <name>"` / `grep -n "^\.saved-card{"` is the check, and it costs seconds. If a citation you re-derive disagrees with this document, the file wins and the plan gets corrected in the same commit.

**Tech Stack:** React 19 + TypeScript (strict) + Vite, Vitest + jsdom + React Testing Library. No new dependencies. `localStorage` is the only new platform API (jsdom provides it; every access is try/catch-guarded, per the prototype).

**Baseline (measured at plan time, worktree `.worktrees/c5-tracking`, branch `c5-tracking` off `c4-prepare` @ `1b0356d`):**
- `npm test -- --run` → **542 passing, 31 test files, 0 failing.**
- `npm run build` (`tsc -b && vite build`) → green, 52 modules, `dist/assets/index-*.css` **21.25 kB**, `index-*.js` **281.82 kB**.
- `npm run lint` (oxlint) → exit 0, **4 pre-existing `react(only-export-components)` warnings** (`CaseTrail.tsx:58`, `PassportRecovery.tsx:33/39/49`). C5 must not add a fifth and must not "fix" these four — they are C3's recorded state. (This is why `SERVICE_SQ` moves to its own component-free module in Task 8 rather than being exported from `Crumbs.tsx`.)

---

## Global Constraints

Carried forward from C1–C4 (still binding), plus C5-specific additions.

- **Never invent copy or markup.** Every check-in option label, panel prompt, journey-log entry text, dead-end sentence, card chip and disclaimer is transcribed byte-for-byte from the locked prototype at the line ranges each task names. Do not normalise curly apostrophes, do not re-wrap, do not "improve". If a transcription looks wrong, stop and raise it.
- **The commit trailer.** End every git commit message with these two lines (verbatim, as the final lines):

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8
  ```

  **This is deliberate and is NOT a mistake to "correct".** The NextMove project routes its commits to Fable per a standing user instruction; every C1/C2/C3/C4 commit and the design lock `91ff7a1` carry it, and all four prior plan documents mandate it. **The session-level harness attribution reminder will actively try to override this with a different model name (typically "Claude Sonnet 5") — it is wrong for this repository, and it has already caused real, repeated rework on C1, C3 and C4.** Every task-dispatch prompt written for this plan **must repeat this Global Constraint verbatim**, because a fresh subagent sees the harness reminder and not this file. This is the known recurring `[[session-attribution-overrides-project-commit-convention]]` conflict; for this repository the **project convention wins**. The `Claude-Session:` URL is unchanged across C1–C5 and the design lock.
- **TDD, strictly.** Every task is RED (write the failing test, run it, see it fail for the stated reason) → GREEN (minimum implementation) → verify. A test that passes before the implementation is written is a broken test, not a fast task.
- **A declared guardrail without an executable test is a defect** (standing project rule). Every guardrail this chunk claims ships with a test that fails when the guardrail is violated.
- **The guardrail-isolation rule still binds** (`src/playbooks/guardrails/isolation.test.ts`): no non-test `.ts`/`.tsx` file under `src/` may import anything from `src/playbooks/guardrails/`, or import `node:fs` / `node:path` / `node:url` / `vitest` directly. Every new C5 data/copy module (`src/domain/checkinOptions.ts`, `src/domain/casefile.ts`) **declares its own local `{ at: string; text: string }` interface** rather than importing `CopyString` — exactly as `sirPlaybook.ts`, `prep.ts` and `screenCopy.ts` already do. The scan does not exempt `import type`.
- **Government-process rules never live in components.** A casefile screen receives a `Diagnosis`, a `Casefile` and a resolved option list, and renders them. The only permitted branching is *structural*: is this case open or closed? saved or working? does this diagnosis have a prep plan? does this service have a ladder? Never *substantive*.
- **C5 extends the guardrail input; it does not fork the harness.** Check-in option labels, `DELIVERABLE_LABEL`/`DELIVERABLE_Q`/`CLOSED_TITLE`, and all new `screenCopy.ts` entries join `guardrailFindings(playbook, { extra })` and `retiredActionFindings(playbook, phaseId, extra)` the same way C4's prep copy did. `contentSafety.ts`'s own `RETIRED_ACTIONS` doc comment names "C5 (check-in labels)" as a required extender — honour it.
- **`screenCopy.ts` is the single copy-definition site** for authored UI chrome. Data-shaped citizen-facing copy lives with its data under `src/domain/` and is scanned at its own locations, exactly as `prep.ts`'s `PREP` map is. No citizen-facing literal is inlined in a component.
  **The `domain/` half of that rule is wider than it first looked (plan-review ruling, Open Questions 8 and Finding 3), and the line is drawn by *layering*, not by feel:** `src/session/` currently imports **only** from `domain/` and `playbooks/` (verified: `session.ts`'s three imports are `domain/types`, `domain/answers`, `playbooks/engines`). Routing any string a `session/` module composes through `screens/screenCopy.ts` would invert that layering and invites a real import cycle the first time `screenCopy.ts` needs a type from `session/` — plausible, since several C5 copy maps want `ServiceKey`. So the following go in `domain/`, next to their data, **not** in `screenCopy.ts`:
  - the per-state check-in option labels, `DELIVERABLE_LABEL`, `DELIVERABLE_Q`, `CLOSED_TITLE` **and the four universal option labels** (`nothing` / `deliverable` / `else` / `notdone`) → `src/domain/checkinOptions.ts`, swept by `checkinCopyExtras(playbook)`;
  - every journey-log entry string the reducer writes (`'Checked in — no change reported'`, `' — rejected'`, `' — deliverable still pending'`, `'Case closed — deliverable received'`, `'Closed as unresolved, every verified step used'`, `'Case reopened: this came back'`, `'Reported something outside the listed options; re-diagnosing'`) → next to `JourneyEntry` in `src/domain/casefile.ts`, swept by `casefileCopyExtras()`, shaped exactly like `prepCopyExtras`.

  Journey-log text and option labels are **data-shaped copy attached to a persisted record**, not rendered UI chrome — the same class `prep.ts`'s `PREP` map already occupies. Rendered chrome that no `session/` module composes (headlines, ledes, panel prompts, button labels, card chips) still lives in `screenCopy.ts`.
- **The reducer is immutable; the prototype is not.** The prototype mutates casefiles in place everywhere (`Object.assign(existing, snap)`, `c.log.push(...)`, `c.outcome='...'`, `S.prepChecks[i]=!...`). Every one of those becomes an immutable reducer update in the port. This is a pervasive *mechanism* deviation with **no behaviour deviation**, and it does not need a per-site note; it needs one test per task proving the previous state object was not mutated.
- **Persistence is a side effect of the reducer's output, never a call inside the reducer.** `sessionReducer` stays a pure function. The prototype calls `persistCases()` inline; the port writes `state.savedCases` to `localStorage` from a single `useEffect` in `App.tsx` keyed on `state.savedCases`. A reducer that touches `localStorage` is untestable and violates React's own rules.
- **Accessibility is a per-task acceptance criterion, not a final pass.** Every interactive control is a real `<button>` / `<a>` / `<input>`. The check-back date field is `<input type="date" aria-label="Check-back date">`; the Home casefile card is a single `<button>` wrapping the whole card (the locked list-row pattern); every external link carries `target="_blank" rel="noopener"`. Focus rings are ink, inherited from the lifted CSS — never restyle them.
- TypeScript strict mode stays on; `npm run build` must pass at the end of every task. `npm run lint` must stay at 0 errors and exactly the 4 pre-existing warnings.
- Run tests with `npm test -- <path>` or `npx vitest run <path>`.

### Recorded deviations from the prototype (each is deliberate; each ships with a test)

- **D1 — the undo double-snapshot (a real prototype bug, fixed here).** `ciLog()` (2621-2627) calls `ciSnapshotNow()` on *every* log write. `ciApplyPatch()` (2662-2675) writes **two** log entries on a diagnosis-changing check-in: `ciLog('reported', …)` (snapshot #1 = correct pre-check-in state), then `updateAns(patch)`, then `S.prepChecks={}`, then `ciLog('diagnosed', …)` — whose snapshot **#2 overwrites #1** and captures the already-patched answers, the already-cleared `prepChecks`, and a log that already contains the `reported` entry. So "Undo that update" after any diagnosis-changing check-in does **not** roll back. This contradicts the check-in spec's own words ("**Undo** (true rollback + entry removal)", spec §"Check-in screen") and its own test list ("undo restores pre-check-in state exactly"). It is reachable on a very common path (`state-2` → "I asked the office what was pending" → `state-5a-p`). **The port takes exactly one snapshot per check-in interaction, before the first log write, and later writes within the same interaction do not re-snapshot.** Task 6 writes the RED test that fails under the prototype's behaviour.
  **Precision required by the plan review (independently traced and empirically verified there): the prototype's undo *partially* works.** Snapshot #2 is taken *before* the `diagnosed` entry is pushed, so restoring it **does** remove the `diagnosed` entry from the log. What it does **not** roll back is `answers` (already patched), `prepChecks` (already cleared) and the `reported` entry (already pushed). Task 6's RED test must say this in its comments, so that a run showing "the `diagnosed` entry went away" is not mistaken for the test being wrong or the deviation being imaginary. The assertion that fails first is the `answers` one, and it fails for that reason.
- **D2 — no auth gate on the case store.** The prototype gates loading on a signed-in user (`S.savedCases = S.user ? (store.get('nm_cases') || []) : []` at 1974, and `adoptStoredCases()` on sign-in). C5 is explicitly **device-local**: `NextMove_Implementation_Plan_FINAL.md` **§9 (Build Sequence)** says "device-local casefiles carry the loop end to end until C7", and issue #8's C7 line says "Local casefiles migrate on first sign-in." So C5 loads `nm_cases` unconditionally at startup and never reads `nm_user`. The account gate, `adoptStoredCases`, sign-out semantics and the migration-on-sign-in are **C7's**, and Task 2 leaves a named seam comment where the gate goes.
- **D3 — `caseIsSaved` / `beginWorkingCheckin` / `updateEntry` use a key-order-independent answer comparison.** Three sites compare answer records with `JSON.stringify(c.answers) === JSON.stringify(S.answers)` — `caseIsSaved` (2092-2095), `beginWorkingCheckin` (1995-1996) and `updateEntry` (2285-2286) — and `JSON.stringify` is **key-insertion-order sensitive**. Two records with identical entries in different insertion orders compare unequal.

  **Where the reorder actually comes from (corrected at plan review — the plan's first reading of this was wrong).** It is **not** the event path. Deleting a key with `applyEvent(a, { k: null })` and re-adding it restores the *original* insertion order whenever the deleted key was the record's **last** one, and every reachable null-patch in `CHECKIN_PATCHES` nulls a trailing key. Verified empirically against the real `applyEvent`: `applyEvent({q1,q2,fOutcome}, {fOutcome:null})` then `applyEvent(_, {fOutcome:'pending'})` produces a **byte-identical** `JSON.stringify`. The real reorder comes from the **correction** path, via `PASSPORT_DEPS = { q1: ['q2'] }`: correcting `q1` deletes `q2` — a **middle** key — and re-answering `q2` re-adds it at the end. Verified: `{q1,q2,fOutcome}` becomes `{q1,fOutcome,q2}`, whose `JSON.stringify` differs while a key-sorted comparison finds them equal.

  **What the mismatch actually costs, precisely.** It does **not** create a second casefile at `completeSave` — that function matches on **engine + `still_open` only** (2076), never on answers, so a stringify mismatch cannot fork a saved case there. The real harm is upstream, at the three comparison sites: `updateEntry` and `beginWorkingCheckin` fail to recognise the citizen's own already-saved case and spin up a **redundant working case with a fresh one-entry log** alongside it, and `saveControl` re-offers "Save this case, and NextMove keeps walking with you" for a case that is already saved (instead of the `.saved-note`). The port uses a key-sorted deep comparison at all three sites. Task 5 writes the RED test, using a reorder produced by the real **correction** path.
- **D4 — `sirCoverage()`, not `.supported`, gates the phase stamp.** `caseSnapshot` and `loadCase` read `SIR_STATES[S.answers.sirState].supported` and then `.phase.id` unguarded — a supported state with no phase config crashes, and an unknown `sirState` value crashes on the property access. `src/domain/sirConfig.ts`'s own doc comment records this as "deliberate hardening (the prototype crashes on it)". The port looks the state up defensively and gates on `sirCoverage(st) === 'covered'`. Task 13 pins it.
- **D5 — the check-back date works for a working (unsaved) case.** The prototype renders the check-back date input on the casefile screen for working cases too (2955), but `setRemind(id, val)` (2721-2724) searches `S.savedCases` only, so the control silently does nothing when `activeCaseId === 'working'`. A control that does nothing is a defect. The port routes the reducer's `SET_REMIND` through the active case (working or saved). Task 7 pins it. **Open Question 4 is RESOLVED in favour of this**: `completeSave` (2085) reads `working.remindAt`, which can only ever be non-null if the control worked — so hiding the control instead would make `completeSave`'s adopt branch permanently dead code. Make it work.
- **D6 — the `savedAt` / `id` / timestamp clock is injected, not `Date.now()` called inline.** Reducers must be deterministic to test. Every action that stamps a time carries the timestamp on the action payload (`{ type: 'CI_CONFIRM', now: number }`), supplied by the dispatching component. This is a mechanism deviation only.
- **D7 — a re-snapshot preserves the original `savedAt`, so the rendered "Saved {date}" stays true.** The prototype re-snapshots the active case in two places: `ciPersistState()` (2628-2632) after every diagnosis-changing check-in, and `togglePrepStep()` (3691) after every ticked prepare step. Both do `Object.assign(c, caseSnapshot(...))`, and `caseSnapshot` sets `savedAt: Date.now()` (2059). So **every check-in and every ticked step silently pushes the case's save date forward** — and that date is rendered in two places: Home's `.saved-kicker` (`'Saved ' + fmtDay(c.savedAt)`, 3123) and the casefile screen's `.case-meta-line` (`'Saved ' + fmtDay(c.savedAt)`, 2914). A citizen who saved a case in July and ticked a step today is told they saved it today. That is a false statement about the citizen's own record, in a product whose thesis is not saying things it cannot back — and under D6 (an injected clock) the port would have to *choose* a timestamp here anyway, so the choice is made deliberately rather than inherited.
  **The port spreads `savedAt` back over the snapshot on every re-snapshot:** `{ ...existing, ...caseSnapshot(...), savedAt: existing.savedAt }`. `completeSave`'s own `savedAt` reset is **unchanged** — that path really is a save, and its date really did move. Tasks 6 and 12 each carry a test.

---

## Scope exclusions — read these before writing a line

These are not "nice to defer". They are other chunks' territory, and building them here is a defect even if it works.

1. **No auth, no account, no sign-in screens.** `renderSaveCase` (3823), `renderSaveOtp` (3846), `renderSaveName` (3870), `authGoogle`, `authSubmitId`, `authVerifyOtp`, `saveNameFinish`, `signOut`, `maskId`, `adoptStoredCases`, the `nm_user` key, the account chip and the account popover (`.acct-*` CSS, prototype 662–743) are **all C7**. C5's `beginSave` equivalent completes the save immediately — the prototype's own `if(S.user){ completeSave(); nav('save-done'); }` branch, which is the only branch a device-local build can take. `src/index.css` must NOT lift 662–743.
2. **No `freshBanner`, no degrade mode.** `checkinOptions`'s two `degradedFor(engineKey)` guards (**2606** and **2611**) and `renderCheckin`'s `${freshBanner(c.engineKey)}` (**2924**) are **C6**. **Do not build those branches at all — not even as always-false ones.** Leave a comment seam at each of the three positions, exactly as `DiagnosisScreen`/`NextMoveScreen`/`PrepareScreen` already carry theirs. `renderSirReverifying` (3505) stays unported.
3. **No `caseFacts` / `appliedText` / `interpProvenance` / describe-it.** `caseSnapshot` (**2063-2064**) stores all three; **C5's snapshot omits them entirely.** `loadCase`'s `S.caseFacts` / `S.appliedText` / `S.fillsReviewed` restore line (**2164**) is C8's. The `.fill-list` / `.fill-review` CSS (984-994) and the `.describe-*` / `.read-*` / `.fchip` CSS (881-995) stay unlifted.
4. **No `interp-confirm` screen, no `unplaceablePick`, no `routeAfterApply`.** C8.
5. **No `.ics` download, no email/SMS reminder, no suggested check-back interval.** The spec is explicit: "**never a suggested interval** (a suggested cadence is an invented timeline through the back door)". C5 ships the user-picked date field plus the copyable reminder line, nothing more.
6. **No `playbook_version` stamping.** The check-in spec names it "Production requirement (PRD, not prototype)" — the prototype does not do it, so C5 does not either. SIR *phase* drift (which the prototype does implement) IS in scope; playbook-version drift is not.
7. **`ladder.ts` is finished logic — do not touch it.** C5 adds the `<EscalationLadder>` component and its CSS. `LADDER_DEFS`, `ladderFor` and `LADDER_TAG` change by not one character.
8. **`NextMoveScreen`'s `hasPrepPlan`/`onPrepare` seam and `DiagnosisScreen`'s composition are already built and tested — extend, do not restructure.** C5 adds new optional props (`updateEntry`/`saveControl` slots, the `ciJustUpdated` banner, the phase-drift banner); it changes no existing branch.

---

## File Structure

```
src/
  index.css                          (APPEND — T1: prototype 562-568, 651-661, 744-878)
  ui/
    tokens.test.ts                   (MODIFY — T1: CSS-fidelity + the --done-bg/--wait-bg re-affirmation)
    serviceSquare.ts                 (NEW — T8: SERVICE_SQ, moved out of Crumbs.tsx; component-free
                                      so oxlint's only-export-components rule cannot fire)
    dates.ts                         (NEW — T8, MANDATORY not optional: fmtDay/fmtRemind/daysAgo.
                                      Component-free for the same only-export-components reason —
                                      three consumers across CaseCard/JourneyLog/CasefileScreen)
    Crumbs.tsx                       (MODIFY — T8: imports SERVICE_SQ instead of declaring it)
    StatusStamp.tsx                  (MODIFY — T8: `mini` variant — icon-less, plus the `closedmark` case)
  domain/
    casefile.ts                      (NEW — T2: Casefile/JourneyEntry types, caseSnapshot,
                                      pure case helpers, LOG_COPY (every journey-log entry string
                                      the reducer writes) + casefileCopyExtras().
                                      Local {at,text} interface.)
    casefile.test.ts                 (NEW — T2)
    checkinOptions.ts                (NEW — T3: the CHECKIN table's label/kind/prepAware half,
                                      merged onto C1's CHECKIN_PATCHES; DELIVERABLE_LABEL,
                                      DELIVERABLE_Q, CLOSED_TITLE, the four universal option labels,
                                      checkinOptionsFor(), checkinCopyExtras(playbook).
                                      Local {at,text} interface.)
    checkinOptions.test.ts           (NEW — T3: option-shape invariants + the guardrail sweep)
  session/
    caseStore.ts                     (NEW — T2: localStorage read/write + the nm_case migration)
    caseStore.test.ts                (NEW — T2)
    cases.ts                         (NEW — T5/T6/T7: the pure case-mutation helpers the reducer
                                      delegates to — saveOrAdopt, appendLog, applyCheckin, undo)
    cases.test.ts                    (NEW — T5/T6/T7)
    session.ts                       (MODIFY — T4-T7, T12, T13: new fields, actions, reducer arms)
    session.test.ts                  (MODIFY — T4: the field-list pin; T5-T7 reducer arms)
  templates/
    EscalationLadder.tsx             (NEW — T8: port of renderLadder, 2792-2803)
    JourneyLog.tsx                   (NEW — T8: port of renderLog, 2807-2829)
    CaseProgress.tsx                 (NEW — T8: the .case-progress bar, 2926-2930)
    CaseCard.tsx                     (NEW — T8: port of caseCard, 3117-3134)
    CasefileScreen.tsx               (NEW — T9: port of renderCheckin, 2830-2970, both variants)
    DeadEndScreen.tsx                (NEW — T10: port of renderDeadEnd, 2971-2985)
    CaseClosedScreen.tsx             (NEW — T10: port of renderCaseClosed, 2986-3000)
    SaveDoneScreen.tsx               (NEW — T10: port of renderSaveDone, 3887-3901)
    SaveControl.tsx                  (NEW — T11: ports saveControl (2292-2298) + updateEntry (2283-2290))
    DiagnosisScreen.tsx              (MODIFY — T11: ciJustUpdated banner + updateEntry slot;
                                      T13: the phase-drift banner)
    NextMoveScreen.tsx               (MODIFY — T11: updateEntry + saveControl tail)
    PrepareScreen.tsx                (MODIFY — T12: reducer-backed prepChecks/prepDraft +
                                      the saveControl tail)
  screens/
    Home.tsx                         (MODIFY — T11: the home-cases section at its own marked seam)
    screenCopy.ts                    (MODIFY — every task that adds authored UI chrome)
    screenCopy.test.tsx              (MODIFY — T13: bucket mounts, CAPTION_TEMPLATES, coverage sweep)
    interactionGated.ts              (MODIFY — T13: C5's interaction-gated entries)
  App.tsx                            (MODIFY — T13: routes, the persistence effect, prop wiring)
  App.test.tsx                       (MODIFY — T13)
```

---

## Task 1 — Lift the casefile / ladder / check-in / journey CSS

**Files:** `src/index.css` (append), `src/ui/tokens.test.ts` (modify)

C5 lifts three physically separate ranges. **Range 662-743 (`.auth-*`, `.btn-google`, `.otp-input`, `.acct-*`, `.demo-hint`) sits between two of them and is C7's — skip it**, exactly the way C4 had to skip 562-568 out of the middle of its own range.

| Range | Contents | Why C5 |
| --- | --- | --- |
| 562-568 | `.saved-next`, `.saved-next::before`, `.saved-steps`, `.saved-meta` | The Home card's chips; interleaved into C4's prepare block and deliberately skipped there (C4 handoff note; `tokens.test.ts:151` currently *forbids* them) |
| 651-661 | `.btn-ghost`, `.btn-ghost:hover`, `.saved-note` | `updateEntry` and `saveControl` are the only `.btn-ghost` users in the whole app |
| 744-878 | `.saved-card` … `.log-note` — the card, `.home-cases`, `.case-meta-line`, `.case-links`/`.case-link`, `.case-remove`, `.case-h1` + its 960px media query, `.case-progress`/`.cp-*`, the ladder (`.ladder`, `.lrung`, `.lr-*`, `.ladder-note`), `.update-mod`/`.um-*`, `.saved-actions`, `.saved-continue`, `.saved-remove`, `.stamp.mini`, `.stamp.mini.closedmark`, `.saved-card.closed`, `.ci-panel`, `.remind-row`/`.remind-input`, `.journey`, `.log-*` | every C5 surface |

**Two things about this range that the provenance header must record, or a later reader will waste time on them.**

- **`.saved-actions` (763), `.saved-continue` (837-844) and `.saved-remove` (845-849) are DEAD CSS in the lock.** The compact-card spec removed the Home card's button cluster they styled, and no render function in the locked prototype emits any of those three class names (verified: they occur only in the stylesheet). Lifting them is still correct — 744-878 is a contiguous faithful transcription, and carving three rules out of the middle would make the range a judgment call instead of a copy. But the `index.css` provenance header **must say "lifted but currently unused (the compact-card spec removed the button cluster they styled)"** next to them, so nobody goes hunting for the missing components.
- **The insertion order 562-568 → 651-661 → 744-878 is load-bearing, not arbitrary.** `.saved-next` and `.saved-meta` are declared **twice**: once at 562/568 (the base chip rules) and again at **761-762** (`.saved-next{display:block;}`, `.saved-meta{font-size:12.5px; color:var(--ink-soft); margin-top:4px;}`) inside the compact-card block. The selectors have identical specificity, so **the later declaration is the one that wins, and only because it comes later**. Appending 744-878 before 562-568 would silently drop the compact card's own overrides. State this reason in the provenance header and keep the order.

**RED**
- [ ] Extend `tokens.test.ts`'s CSS-fidelity block with a C5 list mirroring C4's: assert `css` contains `.saved-card`, `.saved-next`, `.saved-steps`, `.saved-meta`, `.btn-ghost`, `.saved-note`, `.home-cases`, `.case-meta-line`, `.case-links`, `.case-link`, `.case-remove`, `.case-h1`, `.case-progress`, `.cp-head`, `.cp-count`, `.cp-bar`, `.cp-fill`, `.ladder`, `.lrung`, `.lr-dot`, `.lr-label`, `.lr-tag`, `.ladder-note`, `.update-mod`, `.um-head`, `.um-kicker`, `.um-title`, `.stamp.mini`, `.closedmark`, `.saved-card.closed`, `.ci-panel`, `.remind-row`, `.remind-input`, `.journey`, `.log-e`, `.log-mile`, `.log-d`, `.log-who`, `.log-note`.
- [ ] **Delete** the now-false `'does NOT ship C5 casefile styles that sit inside the same prototype range'` test (`tokens.test.ts:151`) and **replace it** with the inverse: a test that the body now contains `.saved-next`/`.saved-steps`/`.saved-meta`.
- [ ] Add a test that C5 did **not** lift C7's or C8's ranges: the CSS body must NOT contain `.auth-input`, `.btn-google`, `.otp-input`, `.acct-chip`, `.acct-pop`, `.demo-hint`, `.fill-list`, `.fill-review`, `.describe-ta`, `.fchip`.
- [ ] Add an ordering test in the existing style: `.saved-card` appears after `.visit-note` and before `#app.settled`.
- [ ] **Cascade-order pin (new, per the note above):** assert that the index of the *second* `.saved-next` declaration (`.saved-next{display:block;}`) is **greater than** the index of the first (`.saved-next{font-size:13.5px;`), and the same for `.saved-meta`. A future re-ordering of the appended blocks then fails a test instead of silently changing the Home card's layout.
- [ ] Update the provenance-header test: the header must now name `562-568`, `651-661` and `744-878` as **lifted**, must still disclaim `662-743` (C7) and `881-995` (C8), must state the cascade-order reason, and must name `.saved-actions` / `.saved-continue` / `.saved-remove` as lifted-but-unused.
- [ ] Run: every new assertion fails.

**GREEN**
- [ ] Append the three ranges to `src/index.css`, **in prototype order** (562-568 block, then 651-661, then 744-878), immediately before the `996-1008` settled/reduced-motion tail — i.e. the appended text goes *before* the existing `#app.settled` rule, so the file keeps prototype ordering. Every comment inside those ranges comes with them. **The order is not cosmetic** — see the cascade note above.
- [ ] Rewrite the file's provenance header to state exactly what is now lifted and what is still deliberately not, including the cascade-order reason and the three dead-but-lifted rules.
- [ ] Run `npm test -- src/ui/tokens.test.ts`, `npm run build`, `npm run lint`.

**Also in this task — re-affirm the two C3 exemptions now that the ladder is about to mount (issue #7):**
- [ ] **The `--done-bg` vs `--wait-bg` ΔE exemption. RESOLVED at plan review: the exemption clears, and Task 1 is not gated on a rendered re-measurement.** `tokens.test.ts:86-95` currently reads *"C3 mounts --done-bg on nothing (its only lifted use, `.lrung.done .lr-tag`, ships in C5 with the ladder component), so it is not a classification surface here."* That sentence becomes false the moment this task lifts `.lrung.done .lr-tag`. **Re-rule it, in writing, in the test's own comment.** The reasoning to record:
  - `--done-bg` now paints the ladder's "Done" rung tag; `--wait-bg` paints the WAIT status stamp. They are ΔE ≈ 2.8 apart, below the project's self-imposed 2.7-3.0 noticeable-difference floor.
  - **One factual correction the original exemption got wrong, and it must not be carried forward:** the old wording said they sit in "a different block", implying they do not co-occur. **They do co-occur** — a `state-5b-p` WAIT case renders the stamp *above* a ladder whose earlier rungs are marked `Done`, on the same screen and in the same column. The honest wording is **"same screen, never the same surface or size, each labelled"**, not "different block". Write it that way.
  - The exemption still holds because the ΔE floor is a **self-imposed project standard for classification surfaces**, not a WCAG requirement, and the binding accessibility rule (**1.4.1, colour is never the sole carrier**) is independently satisfied: the stamp reads `WAIT`, the rung tag reads `Done`, at different sizes and weights, and neither is decodable only by hue.
  Keep the exemption with that corrected reasoning, and keep the test's ΔE bounds so a future token change forces the ruling again. **If the implementer's own reading disagrees, stop and raise it rather than silently keeping or silently dropping the exemption.** (A one-screen visual confirmation of the co-occurrence is worth doing as a **Task 9 acceptance note**; it is explicitly *not* a gate on this task.)
- [ ] **The two `LADDER_DEFS` caption exemptions in `SAFETY_EXEMPTIONS`** (`passport:LADDER_DEFS.passport.caption`, `voter:LADDER_DEFS.voter.caption`, both `causal`). Re-affirm: the captions are now rendered citizen-facing text on the casefile screen for the first time. The match is `"…Used only as far as your case needs…"`, the same false positive as `sir:s-notice.whatToDo`'s `"as your notice directs"` — it describes *how much of the ladder applies to this citizen*, not a cause for anything. **The reasoning holds unchanged once live**, because the pattern's problem was never the string's visibility; it is that the `causal` row's `as your` alternative over-fires on possessives. Update the exemptions' `reason` text to say "now mounted (C5, `<EscalationLadder>`)" so the record is not stale, and leave `LADDER_DEFS` itself untouched.
- [ ] Run the full suite.

---

## Task 2 — The casefile model + the device-local store

**Files:** `src/domain/casefile.ts` (new), `src/domain/casefile.test.ts` (new), `src/session/caseStore.ts` (new), `src/session/caseStore.test.ts` (new)

**Design notes**

1. **The `Casefile` shape** is exactly what `caseSnapshot` (**2053-2067**) produces plus what `completeSave` (**2072-2091**) adds. Transcribe the field names; do not rename:
   - From the snapshot: `engineKey: ServiceKey`, `serviceLabel: string`, `returnScreen: ScreenId`, `answers: AnswerRecord`, `prepChecks: Record<number, boolean>`, `savedAt: number`, `stateLabel: string`, `rec: Classification`, `whatShort: string | null`, `stepsTotal: number`, `stepsDone: number`, `sirPhaseId: string | null`.
   - From `completeSave` / `beginWorkingCheckin`: `id: string`, `outcome: CaseOutcome`, `lastCheck: number | null`, `remindAt: string | null`, `log: JourneyEntry[]`, `closedAt?: number`, `unsaved?: true`.
   - **Omitted on purpose (scope exclusion 3):** `caseFacts`, `appliedText`, `interpProvenance`.
2. `type CaseOutcome = 'still_open' | 'deliverable_received' | 'closed_unresolved'` — the spec's own three values, verbatim.
3. `type JourneyEntryKind = 'diagnosed' | 'reported' | 'checked' | 'closed' | 'reopened'` — the five `kind` values the prototype writes. `JourneyEntry = { t: number; kind: JourneyEntryKind; text: string; noChange?: true }`. **`noChange` is a typed flag, never recovered by parsing the prose** (spec: "Entry semantics are TYPED … never recovered by parsing"). The prose fallback survives only for migrated legacy entries (Task 8).
   **`LOG_COPY` lives here too, next to `JourneyEntry`** (Global Constraints, the OQ8 ruling): the fixed journey-log entry strings the reducer composes — `checkedNoChange` (`'Checked in — no change reported'`), `elseReDiagnose` (`'Reported something outside the listed options; re-diagnosing'`), `rejectedSuffix` (`' — rejected'`), `pendingSuffix` (`' — deliverable still pending'`), `inHandSuffix` (`' — and the deliverable is in hand'`), `closedDeliverable` (`'Case closed — deliverable received'`), `closedUnresolved` (`'Closed as unresolved, every verified step used'`), `reopened` (`'Case reopened: this came back'`), and the migration seed `'Case saved'`. All transcribed from **2645, 2650, 2689/2692, 2709/2710, 2697, 2699, 2728, 2185 and 1980** respectively (re-derived, not carried over). `cases.ts` imports them from `domain/casefile`, so `session/` keeps importing only from `domain/` and `playbooks/` and no cycle with `screens/` is possible.
   **`casefileCopyExtras()`** flattens `LOG_COPY` into `{ at, text }[]` (`at` = `casefile:LOG_COPY.<key>`) for `guardrailFindings`, shaped exactly like `prepCopyExtras`. It takes no playbook because these strings are service-independent — unlike the check-in labels, whose per-service keying is what forces `checkinCopyExtras(playbook)` to take one (Task 3 design note 6).
   **The two bare suffixes (`' — rejected'`, `' — deliverable still pending'`) are registered as their own entries and scanned as their own strings.** Do not concatenate them into the option label before scanning: a scan of the joined string would attribute a finding to a locked prototype label that did not cause it.
4. **`caseSnapshot(engineKey, serviceLabel, returnScreen, d, answers, prepChecks, now)` is a pure function here**, taking everything the prototype reads off `S` plus the injected clock (D6). It must not import session state. `stepsTotal`/`stepsDone` come from `prepPlanFor(d)` — the same `prep.ts` function C4 built (`prep ? prep.steps.length : 0`, `prep ? prep.steps.filter((_, i) => prepChecks[i]).length : 0`).
5. `sirPhaseId` — **deviation D4**: `engineKey === 'sir'` and a defensive lookup (`SIR_STATES[answers.sirState]`, which can be `undefined`) and `sirCoverage(st) === 'covered'` before reading `st.phase!.id`; otherwise `null`.
6. **`caseStore.ts` owns every `localStorage` touch, and nothing else does.** Transcribe the prototype's `store` object (**1956-1960**): every `get`/`set`/`del` is try/catch-guarded and returns `null` / silently no-ops on throw. Storage can be absent, full, or throwing (Safari private mode); `App.tsx` must never crash on it.
7. **The `nm_case` → `nm_cases` migration** (**1975-1983**) runs once at load: if `nm_case` exists and `nm_cases` is empty, wrap it as a single case with `id: 'c' + (old.savedAt || now)`, `outcome: 'still_open'`, `returnScreen: old.returnScreen || (old.engineKey + '-nextmove')`, and a one-entry log `[{ t: old.savedAt || now, kind: 'diagnosed', text: old.stateLabel || 'Case saved' }]`; write `nm_cases`, delete `nm_case`. Transcribe the fallback chain exactly — every `||` in that expression is a real defence against an older stored shape.
8. **D2 seam.** `loadCases()` takes no user argument and never reads `nm_user`. Leave a named comment where C7's account gate goes: *"C7: account-scoping goes here — `nm_cases` becomes account-scoped server-side and this device-local set migrates on first sign-in (roadmap issue #8, C7)."*
9. The store must **fail closed on a non-array**: `store.get('nm_cases')` returning a string/object/number (corrupt storage) yields `[]`, not a crash downstream.

**RED**
- [ ] `casefile.test.ts`: `caseSnapshot` produces every listed field, from a real `diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })` — never a hand-built `Diagnosis`. Assert `stepsTotal`/`stepsDone` against the real `PREP['state-5a'].steps.length` and a `prepChecks` of `{0: true, 2: true}`.
- [ ] `caseSnapshot` never returns `caseFacts` / `appliedText` / `interpProvenance` (scope exclusion 3, mechanised).
- [ ] `sirPhaseId` is `SIR_PHASES.claims_notice.id` for `{ sirState: 'delhi', sirQ1: 'notice' }` under `sirEngine`; `null` for passport; `null` for `{ sirState: 'bihar' }`; `null` (not a throw) for `{ sirState: 'atlantis' }` and for `{}` — the D4 hardening.
- [ ] `caseStore.test.ts` (uses jsdom's real `localStorage`, cleared in `beforeEach`): round-trips a case list; returns `[]` on empty storage; returns `[]` on malformed JSON; returns `[]` when the stored value is not an array; does not throw when `localStorage.setItem` throws (stub it to throw).
- [ ] Migration: seeding `nm_case` with a minimal legacy object and no `nm_cases` produces one case with the derived id/outcome/returnScreen/log, writes `nm_cases`, and removes `nm_case`. A second `loadCases()` is a no-op (migration is once).
- [ ] Migration does **not** run when `nm_cases` is already non-empty.
- [ ] **`casefileCopyExtras()` guardrail sweep** (the shape `prep.test.ts` uses): `guardrailFindings(passportPlaybook, { extra: casefileCopyExtras() })` and the voter/SIR equivalents return `[]`, and `retiredActionFindings(sirPlaybook, SIR_STATES.delhi.phase!.id, casefileCopyExtras())` returns `[]`.
- [ ] **`LOG_COPY` completeness:** every string `cases.ts` will later compose is present as a key here, asserted by comparing `Object.keys(LOG_COPY)` against an expected sorted list — so a new entry string added in Task 6 or 7 cannot be inlined in `session/` and skip the scan.
- [ ] Run: all fail (modules do not exist).

**GREEN**
- [ ] Write both modules. `casefile.ts` imports `prepPlanFor` from `../playbooks/prep`, `SIR_STATES` from `../playbooks/sirPlaybook`, `sirCoverage` from `./sirConfig` — and nothing from `guardrails/` and nothing from `screens/`.
- [ ] Run `npm test -- src/domain/casefile.test.ts src/session/caseStore.test.ts src/playbooks/guardrails/isolation.test.ts`, then the full suite, build, lint.

---

## Task 3 — The check-in option table (labels, kinds, prepAware) + its guardrail scan

**Files:** `src/domain/checkinOptions.ts` (new), `src/domain/checkinOptions.test.ts` (new)
*(`screenCopy.ts` is deliberately **not** touched by this task — see design note 7 / the OQ8 ruling.)*

`src/domain/checkinPatches.ts` already carries the *payload* half of the prototype's `CHECKIN` table, transcribed by C1, with its own header comment naming exactly what it left to C5: *"every option's `label`, its `k` kind ('event' | 'action' | 'resolved-rung' | 'valence' | 'closureq' | 'deadend'), the `prepAware` flag, and the universal options the loop appends."* This task supplies precisely that, and no more.

**Design notes**

1. **Do not fork or re-transcribe `CHECKIN_PATCHES`.** `checkinOptions.ts` declares a parallel, index-aligned `CHECKIN_META: Record<string, { prepAware?: true; opts: { k: CheckinKind; label: string }[] }>` and **zips it** with `CHECKIN_PATCHES` at module load. (The alternative, merging the labels back into `checkinPatches.ts`, would rewrite a file C1 shipped and tested and would contradict that file's own shipped header contract, which explicitly reserves labels/kinds/`prepAware` for C5 — see Open Question 2, RESOLVED in favour of the split.)
   **The pairing test must be a full expected-pairs pin, NOT a key-set-plus-length check.** Key sets and per-key array lengths matching does *not* close the index-alignment risk this test exists to close: swapping indices 1 and 2 within a single key reorders the pairing while leaving both the key set and every length untouched. This is not hypothetical — `'state-5a-p'` (2526-2530) is `[resolved-rung, event, event]`, and swapping its two `event` rows in only one of the two hand-maintained tables would pair "They responded, but it did not help" with `{fOutcome:'no_response'}` and go undetected forever. `'state-1'` and every other multi-entry key have the same hole.
   **So:** transcribe **one** expected `label → patch` table, once, directly from the prototype's `CHECKIN` (2508-2596), into `checkinOptions.test.ts`, and assert it against the actual zipped output **for every key and every index** — label, kind and the whole patch object, position by position. That table is the pin; a reorder in either source table then fails a named assertion. Keep the key-set assertion too (it catches an added or dropped key cheaply), and drop the length check as redundant once the pairing pin exists.
2. **Key resolution order is load-bearing and must be preserved**: `CHECKIN[d.state] ?? CHECKIN[d.ruleId]`, gated on `d.ruleId` being non-null (the fallback/UNCLASSIFIED diagnosis has no config). Prototype **2599**. The mixed keying is deliberate — SIR entries key by user-facing `state` (`'S-1'`), Passport and Voter by rule id (`'state-1'`, `'v-1'`). `checkinPatches.test.ts` already pins that both key families resolve; extend it, do not duplicate it.
   **Voter is the one that survives on a thin margin, so test it explicitly.** A voter rule's `d.state` is **capitalised** (`'V-4'`, `voterPlaybook.ts:83`) while its `CHECKIN` key is **lowercase** (`'v-4'`, the rule id). `CHECKIN['V-4']` misses and the `?? CHECKIN[d.ruleId]` fallback catches it — the whole thing works because JS object keys are case-sensitive. That is exactly the kind of accident that a well-meaning `.toLowerCase()` "tidy-up" would break silently, so it gets its own assertion (see RED).
3. **`checkinOptionsFor(d, prepChecks)` builds the list in this exact order** (prototype **2597-2616**):
   1. `{ k: 'notdone', label: "I haven't done this yet; take me back to the steps" }` — **only** when the resolved config has `prepAware`, the diagnosis has a prep plan, and `done === 0`.
   2. the config's own options, in table order.
   3. `{ k: 'nothing', label: 'Nothing yet' }`
   4. `{ k: 'deliverable', label: DELIVERABLE_LABEL[engineKey] }`
   5. `{ k: 'else', label: 'Something else happened' }`
   The last three are **universal and unconditional** — the spec calls the escape hatch a "mandatory escape hatch on every list", and "Nothing yet" first-class. A diagnosis with **no** config at all (UNCLASSIFIED) still gets exactly those three, which is the spec's "UNCLASSIFIED check-in model: re-diagnose / 'I got it' / nothing yet — nothing else."
4. **C6 seam, not a branch.** The prototype guards items 1 and 2 with `!degradedFor(c.engineKey)` (**2606** and **2611**). Leave a comment at both positions naming C6; **do not add the parameter, the branch, or an always-false constant** (scope exclusion 2).
5. **New citizen-facing copy maps** (**2500-2501**, **3116**), transcribed:
   - `DELIVERABLE_LABEL = { passport: 'I got my passport!', voter: 'My name is on the roll / my card arrived!', sir: 'My name is on the roll. Sorted!' }`
   - `DELIVERABLE_Q = { passport: 'Did you get your passport?', voter: 'Is your name / card actually in place now?', sir: 'Is your name on the roll now?' }`
   - `CLOSED_TITLE = { passport: 'Passport received', voter: 'On the roll / card arrived', sir: 'Name on the roll' }`
6. **`checkinCopyExtras(playbook: Playbook): CopyLocation[]` — the signature is `prepCopyExtras`'s, deliberately, and the prefix is DERIVED, never declared.** The plan's first draft had this function hand-declare a `Record<string, ServiceKey>` prefix map (`'state-*' → passport`, `'v-*' → voter`, `'S-*' → sir`). That departs from `prepCopyExtras`'s own mechanism in exactly the way that function's doc comment says it was designed to prevent — *"Driven off playbook.rules, NOT off Object.keys(PREP), so a plan for a rule the playbook does not ship can never be swept under that playbook's serviceId."* A hand-typed prefix map re-opens precisely that hole, by hand, one chunk later.
   **So mirror `prepCopyExtras` exactly:**
   ```
   export function checkinCopyExtras(playbook: Playbook): CopyLocation[]
   ```
   walk `playbook.rules`, look each `rule.id` up in `CHECKIN_META`, and address the findings `${playbook.serviceId}:CHECKIN.${rule.id}.opts[i].label`. `DELIVERABLE_LABEL[serviceId]`, `DELIVERABLE_Q[serviceId]` and `CLOSED_TITLE[serviceId]` are swept under the same `playbook.serviceId`, addressed `${playbook.serviceId}:DELIVERABLE_LABEL` and so on — one entry each per call, not all three services on every call.
   **SIR needs one small explicit bridge, and it is derived too.** SIR's `CHECKIN_META` entries key by user-facing **state** (`'S-1'`…`'S-9'`), not by rule id, so `rule.id` alone will not find them. Build the state→rule bridge **from `sirPlaybook.rules` itself** (each rule carries its own `state`), not from a hand-typed table: for each rule, try `CHECKIN_META[rule.state] ?? CHECKIN_META[rule.id]` — the same resolution order design note 2 already requires at runtime, reused here so the scan and the renderer cannot disagree about which config a rule owns.
   **The completeness pin then becomes a real one:** assert that the union of `at` prefixes produced by the three `checkinCopyExtras(playbook)` calls covers **every** key in `CHECKIN_PATCHES`, with the assertion message naming any orphan key. An orphan means either a config for a rule no playbook ships (a C1 transcription bug worth surfacing) or a resolution mismatch — both are things to stop on, not to paper over with a prefix map.
7. **The four universal option labels are `domain/` data, NOT `screenCopy.ts` chrome** (plan-review ruling, Open Question 8 / Finding 3). They sit in `checkinOptions.ts` beside the per-state labels they are appended to, as `UNIVERSAL_LABELS = { nothing: 'Nothing yet', deliverable: <per-service, from DELIVERABLE_LABEL>, else: 'Something else happened', notDone: "I haven't done this yet; take me back to the steps" }`, and reach the guardrail scan through `checkinCopyExtras`, not through `SCREEN_COPY.ui`.
   **Why, precisely:** the first draft routed them through `screenCopy.ts` and would have introduced the codebase's **first `domain/ → screens/` import**. `src/session/` and `src/domain/` currently import only from `domain/` and `playbooks/` (verified). Inverting that for four strings buys nothing and risks a real cycle the moment `screenCopy.ts` needs a type from `domain/` or `session/` — plausible, since several C5 copy maps are service-keyed and want `ServiceKey`. These four labels are also not chrome by any honest reading: they are **rows in the same option list** as the per-state labels, appended to the same array, rendered by the same `.arow`, and one of them (`deliverable`) is already per-service data. `checkinOptionsFor` reads all four from this module. **Nothing check-in-option-shaped goes into `screenCopy.ts`.** (Rendered chrome around the list — panel prompts, button labels, the `.um-title` — still does.)

**RED**
- [ ] **The pairing pin (design note 1).** One expected `label → { k, patch… }` table, transcribed once from prototype 2508-2596, asserted against the zipped output **key by key and index by index**. Assert the key sets match too. Do **not** ship an array-length check in place of this — a length check cannot see a swap within a key, which is the failure the pin exists for (`'state-5a-p'` is the worked example: `[resolved-rung, event, event]`).
- [ ] Every `k` is one of the six kinds; a `valence` option's meta pairs with a patch entry carrying `rejectPatch`+`acceptPendingPatch` or `rejectDeadend`; a `deadend` option's patch entry is `{}` (the two `state-dpg-r`/`state-dpg-p` cases C1 already identified); a `resolved-rung` option's patch entry carries `pendingPatch`.
- [ ] Key resolution, **all three services**: for `diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })` the config resolves via `d.state` (`'S-4'`); for `diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })` via `d.ruleId` (`'state-1'`); and for a real **voter** diagnosis resolving to rule `'v-4'`, assert **both halves**: `d.state === 'V-4'`, `CHECKIN_META['V-4']` is `undefined`, and the resolved config is `CHECKIN_META['v-4']` — with an assertion message stating that this pair works only because JS keys are case-sensitive, so a `.toLowerCase()` normalisation of either side breaks it. Also: passport `d.state` values (`'1'`, `'5a·W'`, …) never collide with a SIR key.
- [ ] `checkinOptionsFor` ordering: with `prepChecks = {}` on a `prepAware` state with a prep plan (`state-3`), item 0 is `notdone` and the last three are `nothing`/`deliverable`/`else` in that order. With `prepChecks = { 0: true }` the `notdone` entry is **absent** and everything else is unchanged.
- [ ] A non-`prepAware` state never yields `notdone`, even with `prepChecks = {}` — **use `state-2`, not `state-1`.** `state-2` **has** a `PREP` entry and is **not** `prepAware`, so it isolates the flag. `state-1` is neither, so it would pass for two confounded reasons and prove nothing about the flag. (Keep a separate `state-1` case if you want the no-prep-plan path covered; just do not use it for this assertion.)
- [ ] An UNCLASSIFIED diagnosis (`diagnose(passportEngine, { q1: 'not_sure' })`, `ruleId === null`) yields **exactly three** options: `nothing`, `deliverable`, `else`.
- [ ] Every `DELIVERABLE_LABEL`/`DELIVERABLE_Q`/`CLOSED_TITLE` has a key for all three `ServiceKey` values, and no extra key.
- [ ] **Guardrail sweep** — the shape `prep.test.ts` already uses, `it.each` over `PLAYBOOKS`. Run `guardrailFindings(playbook, { extra: checkinCopyExtras(playbook) })` for each of the three, and `retiredActionFindings(sirPlaybook, SIR_STATES.delhi.phase!.id, checkinCopyExtras(sirPlaybook))`, and assert `[]`. Assert each call returns a non-empty list (`prep.test.ts:26`'s pattern — a flattener that silently returns `[]` passes every safety assertion vacuously).
- [ ] **Completeness pin (design note 6):** the union of `at` values across the three `checkinCopyExtras(playbook)` calls covers **every** key in `CHECKIN_PATCHES`, and every `at` carries a `passport:` / `voter:` / `sir:` prefix. Assertion message names any orphan key. This replaces the deleted hand-declared prefix map — there is no prefix map to test against any more.
- [ ] Run: all fail.

**GREEN**
- [ ] Transcribe `CHECKIN_META` from prototype **2508-2596**, option-for-option, in table order.
- [ ] Add `UNIVERSAL_LABELS` to `checkinOptions.ts` (design note 7) — `nothing`, `else`, `notDone` as literals, `deliverable` resolved per-service from `DELIVERABLE_LABEL`. **Add nothing to `screenCopy.ts` in this task**; no check-in option label is UI chrome.
- [ ] Write `checkinOptionsFor` and `checkinCopyExtras(playbook)`.
- [ ] Run the task's tests, then the full suite, build, lint.

**If the guardrail sweep produces findings:** do **not** reword a locked prototype label. Record a per-location, per-pattern `SAFETY_EXEMPTIONS` entry with the reasoning, exactly as C2/C3/C4 did, and note it in the task report. (Plan-time reading suggests the labels are clean — no `because`/`as your`/`deadline`/`guarantee`/`we filed`, no Enumeration Form, no bare digits + time unit — but **run it, do not assume**.)

---

## Task 4 — `SessionState` foundations: the persisted slice, `prep*`, `ci*`

**Files:** `src/session/session.ts` (modify), `src/session/session.test.ts` (modify)

This is the chunk `session.ts`'s own doc comment has been waiting for: *"Fields belonging to later chunks (savedCases, workingCase, user, ci\*, prep\*, describe\*, interp) are ABSENT on purpose."* C5 adds all of them **except** `user` (C7) and `describe*`/`interp` (C8) — and the comment must be rewritten to say so.

**Design notes**

1. **New `ScreenId` members** (the prototype's own ids, from the router switch 3903-3941): `'checkin'`, `'dead-end'`, `'case-closed'`, `'save-done'`. **Not** `'save-case'` / `'save-otp'` / `'save-name'` (C7), **not** `'sir-reverifying'` (C6), **not** `'interp-confirm'` (C8).
2. **New fields**, with the prototype's own names (1947-1951):
   - persisted: `savedCases: Casefile[]`
   - working/active: `workingCase: Casefile | null`, `activeCaseId: string | null`
   - prepare (lifted from `PrepareScreen`'s `useState` in Task 12): `prepChecks: Record<number, boolean>`, `prepDraft: string | null`
   - check-in: `ciPending: CheckinOption | null`, `ciPendingIdx: number | null`, `ciStage: 'confirm' | 'valence' | 'closureq' | null`, `ciReassure: boolean`, `ciSnapshot: CiSnapshot | null`, `ciJustUpdated: boolean`, `ciConsecutive: boolean`, `ciAccepted: boolean`
   - casefile UI: `logOpen: Record<string, boolean>`, `removeConfirm: string | null`, `reminderCopied: boolean`, `phaseDrift: boolean`
   - `pendingSave: { engineKey: ServiceKey; serviceLabel: string; returnScreen: ScreenId } | null`

   **Note for the implementer:** `ciPendingIdx`, `ciConsecutive`, `ciAccepted` and `reminderCopied` are **absent from the prototype's `S` literal** — it assigns them ad hoc at first use. They are real state and get declared, typed and initialised here.
3. **`RESTART` must preserve the persisted slice.** Issue #7 names this explicitly: *"`RESTART` currently returns `initialSession` outright; C5 must change it to preserve the persisted slice explicitly (and should pin that with a test)."* The prototype's `restart()` (**2043-2045**) clears everything **except** `S.savedCases` (and `S.user`, C7's). Implement as `{ ...initialSession, savedCases: s.savedCases }` — an explicit allowlist, so a *future* field is non-persisted by default (fail-safe direction).
4. **`BACK` to Home must do the same.** `sessionReducer`'s `BACK` arm returns `initialSession` when the previous screen is `'home'` ("Home is a clean slate, always", prototype `back()` **2035-2040**). It must now return the same preserved shape. This is the single most likely place to silently wipe a citizen's saved casefiles — pin it with its own test.
5. **`NAVIGATE` must clear `removeConfirm`.** The prototype's `nav()` (**2029**) sets `S.removeConfirm=false` on **every** navigation, alongside `trustOpen` and `restartConfirm`. The plan's first draft never said so, and the omission is not cosmetic: `removeConfirm` arms a **destructive** inline confirm ("Remove this case and its history? · Yes · Cancel"). Without the clear, a citizen who arms it, navigates away, and comes back to that case finds the confirm still armed — a live delete button one stray tap from firing, in a state they did not re-enter. Add it to the `NAVIGATE` arm and **pin it with a test**; it is a guardrail, and the Global Constraints say a guardrail without an executable test is a defect.
   Two siblings in the same family, both verified in the prototype, both currently unstated, both pinned in Task 6:
   - **`CI_CHOOSE` must clear `ciReassure` at the top, before branching** (**2640**: `S.ciPending=opt; S.ciPendingIdx=i; S.ciReassure=false;`). Every branch inherits the clear; the `nothing` branch then sets it back to `true` three lines later. Clearing it per-branch instead is a transcription that happens to work today and breaks the first time a branch is added.
   - **`OPEN_CHECKIN` and `BEGIN_WORKING_CHECKIN` must clear `ciSnapshot`.** The prototype clears `ciStage`/`ciPending`/`ciReassure`/`ciJustUpdated` at both sites (**2635** and **2005**) and leaves `ciSnapshot` **standing**. That is a latent cross-case corruption: open case A, check in, open case B, and B's Undo restores A's snapshot into B. It is unreachable today only by accident — `ciJustUpdated` is cleared, so the Diagnosis screen's Undo button hides, and the casefile's reassure-panel Undo needs `ciReassure`, also cleared. Both guards are incidental. **The port clears `ciSnapshot` at both sites**, and this is a *hardening*, recorded here rather than as a numbered deviation because no reachable behaviour changes.
6. **`ANSWER` must reset the derived prepare state.** The prototype's `setAns` (**2195**) does `S.prepChecks={}; S.prepDraft=null; S.copied=false;` on **every** correction-path write. `answers.ts`'s own doc comment already anticipates this: *"The session layer (C5) resets prepare/derived state on EVERY correction-path write regardless, and must not gate that reset on this flag."* Honour that: reset unconditionally, **not** `if (changed)`.
7. **`initialSession` must not read `localStorage`.** It stays a pure constant. `App.tsx` seeds the reducer with `loadCases()` via `useReducer`'s third (lazy-init) argument in Task 13. Keeping `initialSession` pure is what lets `session.test.ts` and every screen test stay deterministic.

**RED**
- [ ] Update the existing `'C4 added no prep* field to SessionState'` test — **do not delete it** (C4's handoff note says so explicitly). Rename it to a C5 field-list pin and assert the complete new sorted key list. It goes red the moment the fields land, which is the point: the list is now maintained deliberately.
- [ ] `RESTART` preserves `savedCases` and resets everything else to `initialSession`'s value, field by field.
- [ ] `BACK` from a screen whose history head is `'home'` preserves `savedCases`.
- [ ] **`NAVIGATE` clears `removeConfirm`** (design note 5): from a state with `removeConfirm: 'c123'`, any `NAVIGATE` yields `removeConfirm: null`. Assertion message states the harm — an armed destructive confirm surviving a navigation.
- [ ] `NAVIGATE` also still clears whatever the existing arm already clears; assert the pre-existing fields are unchanged in behaviour (this arm is being edited, so its current guarantees get a regression pin).
- [ ] `ANSWER` clears `prepChecks` and `prepDraft`, even when the value written is unchanged from the current one (the "not gated on `changed`" rule) — **and even then**, `state.answers` must be the same object reference (C1's strict no-op on answers is unchanged).
- [ ] The four new `ScreenId` members type-check in a `NAVIGATE`, and the C7/C6/C8 ids do not exist on the union (a negative test via `@ts-expect-error`).
- [ ] Run: all fail.

**GREEN**
- [ ] Add the fields, the `ScreenId` members, the three reducer-arm changes. Rewrite `session.ts`'s header doc comment: name `user` (C7) and `describe*`/`interp` (C8) as the fields still absent, and state that `savedCases` is the persisted slice `RESTART`/`BACK` preserve.
- [ ] Run the task's tests, then the full suite, build, lint.

---

## Task 5 — Working case, save/adopt, one-active-case-per-service

**Files:** `src/session/cases.ts` (new), `src/session/cases.test.ts` (new), `src/session/session.ts` (modify), `src/session/session.test.ts` (modify)

**Design notes**

1. **Pure helpers in `cases.ts`, thin arms in `session.ts`.** `cases.ts` exports pure functions over `(state, payload) → { savedCases, workingCase, activeCaseId, … }` fragments. `sessionReducer` calls them. This keeps `session.ts` readable and lets the hard logic be tested without constructing whole sessions.
2. **`activeCase(state)`** (**1990-1993**): returns `state.workingCase` when `activeCaseId === 'working'`, else `savedCases.find(c => c.id === activeCaseId) ?? null`. The literal string `'working'` is the prototype's own sentinel id — keep it.
3. **`beginWorkingCheckin`** (**1994-2007**) — *"tracking never requires an account"* (Product Principle #4). Order matters:
   1. If a still-open saved case for this engine has **the same answers**, open *that* case instead (`openCheckin(saved.id)`), do not create a working case.
   2. Otherwise, create/replace the working case **only if** there is none, or its `engineKey` differs, or its answers differ. (An unchanged re-entry must keep the existing working case and its log.)
   3. Set `activeCaseId = 'working'`, clear `ciStage`/`ciPending`/`ciReassure`/`ciJustUpdated` **and `ciSnapshot`** (Task 4 design note 5's third sibling — the prototype leaves a stale snapshot here), navigate to `'checkin'`.
   The working case is `{ ...caseSnapshot(...), id: 'working', unsaved: true, outcome: 'still_open', lastCheck: null, remindAt: null, log: [{ t: now, kind: 'diagnosed', text: d.label }] }`.
4. **`completeSave`** (**2072-2091**) — the one-active-case-per-service rule, formalised. Given the pending save's engine:
   - **Existing still-open case for this engine:** overwrite it with the new snapshot; if a working case for the same engine exists, append **its whole log except its `diagnosed` seed entry** (that entry belongs to a case that is now being merged, and the target already has its own); if the label changed, append a fresh `{ kind: 'diagnosed', text: snap.stateLabel }`; set `activeCaseId` to it. **The existing case's `id`, `log` head, `lastCheck` and `remindAt` survive** — `Object.assign(existing, snap)` in the prototype overwrites only snapshot fields, so the port must spread in the same direction (`{ ...existing, ...snap }`), never the reverse.
   - **No existing case:** create `{ ...snap, id: 'c' + now, outcome: 'still_open', lastCheck: working?.lastCheck ?? null, remindAt: working?.remindAt ?? null, log: working ? working.log : [{ t: now, kind: 'diagnosed', text: snap.stateLabel }] }` and `unshift` it (newest first — the prototype's own order, which Home renders directly).
   - Either way: `workingCase = null`.
   This is the spec's *"Saving ADOPTS its log wholesale, which is what makes 'save this case and keep this history' a true sentence."*
5. **`caseIsSaved(state, engineKey)`** (**2092-2095**) — **deviation D3**: key-order-independent comparison of `c.answers` against `state.answers`, over still-open cases of that engine. **The same comparison helper is used at all three D3 sites** — `caseIsSaved`, `beginWorkingCheckin` (1995-1996) and `updateEntry`'s routing decision (2285-2286) — because they are the same question asked three times, and a fix applied to one of three is a bug in the other two.
6. **`loadCase`** (**2160-2171**): sets `activeCaseId`, replaces `answers` with `{ ...c.answers }` and `prepChecks` with `{ ...c.prepChecks }`, clears `prepDraft`. The `caseFacts`/`appliedText`/`fillsReviewed` line (**2164**) is C8's and is **not** ported. The `phaseDrift` computation (**2168-2169**) is Task 13's; this task leaves `phaseDrift` untouched (i.e. `false`) and a comment naming Task 13.
7. **`continueSaved` (2172-2177) is DEAD CODE in the lock and is NOT ported.** Verified: `continueSaved` occurs exactly **once** in the whole locked prototype — its own definition. Zero call sites. `renderSaveDone`'s "Back to my case" button calls `nav('${p.returnScreen}')` directly (**3895**) and the Home card calls `openCheckin` (**3121**). **The compact-card spec's sentence saying `continueSaved` remains for the "Back to my case" path is itself stale relative to what actually shipped into the lock** — record that in a comment next to `SaveDoneScreen` so a later reader does not mistake the spec sentence for a missing feature. Porting it would add a reducer action nothing dispatches, against this project's own stated principle that *a field nothing reads is a field that rots*.
   **The `returnScreen ?? (engineKey + '-nextmove')` fallback is still kept — at the one place it is actually reachable:** the Task 2 migration (**1979**), which can emit a case whose `returnScreen` came from an older stored shape. `SaveDoneScreen` reads `pendingSave.returnScreen`, which this chunk always sets, so it needs no fallback of its own.
8. **New actions:** `BEGIN_WORKING_CHECKIN`, `OPEN_CHECKIN`, `BEGIN_SAVE`. (**No `CONTINUE_SAVED`** — design note 7.) Each carries `now: number` where it stamps a time (D6).
9. **`BEGIN_SAVE` completes the save immediately** — there is no auth detour in C5 (scope exclusion 1) — then navigates to `'save-done'`. `pendingSave` is still set first, because `SaveDoneScreen`'s "Back to my case" button reads its `returnScreen` (prototype **3895**).

**RED** (`cases.test.ts` unless noted)
- [ ] `activeCase` resolves the working sentinel, a saved id, and `null` for an unknown id.
- [ ] `beginWorkingCheckin` with an identical still-open saved case returns that case's id as `activeCaseId` and leaves `workingCase` `null`.
- [ ] `beginWorkingCheckin` twice with unchanged answers keeps the **same** working-case object identity and does not re-seed the log.
- [ ] `beginWorkingCheckin` after the answers changed replaces the working case and re-seeds a one-entry `diagnosed` log.
- [ ] The working case's seed entry text is the real `diagnose(...).label`, not a hand-typed string.
- [ ] `completeSave` with no existing case unshifts a new case with a `'c'`-prefixed id and `outcome: 'still_open'`.
- [ ] `completeSave` with an existing still-open case of the same engine **updates in place** — `savedCases.length` is unchanged, the id is unchanged, the log is the existing log **plus** the working case's non-`diagnosed` entries **plus** one `diagnosed` entry when the label changed, in that order.
- [ ] `completeSave` when the label did **not** change appends **no** `diagnosed` entry.
- [ ] `completeSave` adopts a working case's `lastCheck`/`remindAt` onto a newly created case.
- [ ] `completeSave` never mutates the input `savedCases` array or any case object in it (identity + deep-equality check against a pre-call clone).
- [ ] Two still-open cases for *different* engines both survive a save on one of them (SIR-alongside-passport is the spec's named expected co-occurrence).
- [ ] **D3 RED — build the reorder on the CORRECTION path, not the event path.** The plan's first draft used an `applyEvent` round trip (`{fOutcome:null}` then `{fOutcome:'pending'}`) and **that recipe does not reorder anything** — deleting the record's *last* key and re-adding it restores the identical insertion order, and every reachable null-patch in `CHECKIN_PATCHES` nulls a trailing key. Verified empirically against the real `applyEvent`: `JSON.stringify` came back byte-identical. Written that way the test is a **false GREEN with no RED at all** — it passes under a faithful `JSON.stringify` transcription.
  The reorder comes from `PASSPORT_DEPS = { q1: ['q2'] }` (`passportPlaybook.ts:281`), which deletes a **middle** key. Build the fixtures like this, with the real engine functions and the real deps map:
  ```ts
  const saved = applyEvent({ q1: 'contacted_incomplete' }, { q2: 'informal', fOutcome: 'pending' })
  //   insertion order: q1, q2, fOutcome
  let session = applyCorrection(saved, 'q1', 'adverse', PASSPORT_DEPS).answers        // q2 deleted
  session = applyCorrection(session, 'q1', 'contacted_incomplete', PASSPORT_DEPS).answers
  session = applyCorrection(session, 'q2', 'informal', PASSPORT_DEPS).answers         // q2 re-added, at the END
  //   insertion order: q1, fOutcome, q2 — same entries, different order
  ```
  Then **assert the RED premise; do not comment it.** A comment cannot fail:
  ```ts
  expect(JSON.stringify(saved)).not.toBe(JSON.stringify(session))   // the premise: a real reorder
  expect(caseIsSaved(stateWith(session), 'passport')).toBe(true)    // fails under JSON.stringify
  ```
  Both lines verified by execution at plan time: the stringify differs, and a key-sorted comparison finds the two equal.
- [ ] **D3 RED, the other two sites** (design note 5): with `saved` stored as a still-open passport case and `session` as the session's answers, `beginWorkingCheckin` opens **that saved case** (`activeCaseId === saved.id`, `workingCase === null`) rather than spinning up a redundant working case with a fresh log — assert `savedCases[0].log` is unchanged and `workingCase` is `null`. And `updateEntry`'s routing decision resolves to `OPEN_CHECKIN(saved.id)`, not `BEGIN_WORKING_CHECKIN`.
- [ ] `loadCase` copies (does not alias) `answers` and `prepChecks`, and clears `prepDraft`.
- [ ] `session.test.ts`: `BEGIN_SAVE` lands on `'save-done'` with the case saved, `activeCaseId` set, and `pendingSave.returnScreen` populated for `SaveDoneScreen` to read.
- [ ] **Negative pin for design note 7:** no `CONTINUE_SAVED` action exists on the action union (a `@ts-expect-error` dispatch, matching Task 4's pattern for the C6/C7/C8 screen ids). Assertion message names it as dead code in the lock, so a later reader adding it has to argue with a test.
- [ ] The Task 2 migration's `returnScreen` fallback still has its own test (Task 2) — it is the one live consumer of that expression.
- [ ] Run: all fail.

**GREEN**
- [ ] Implement, wire the **three** reducer arms (`BEGIN_WORKING_CHECKIN`, `OPEN_CHECKIN`, `BEGIN_SAVE`), run everything.

---

## Task 6 — The check-in state machine

**Files:** `src/session/cases.ts` (extend), `src/session/cases.test.ts` (extend), `src/session/session.ts` (modify), `src/session/session.test.ts` (modify)

This is the chunk's core. Prototype **2617-2724**. **Read the check-in spec's "Answer-model surgery" section before starting** — the *why* behind two write paths is the whole design.

**Design notes**

1. **Two write paths, already built in C1.** A correction (Back → change an answer) goes through `applyCorrection` and clears downstream state. A check-in event goes through **`applyEvent`** — pure merge, `null` deletes, keys outside the patch untouched. `updateAns` in the prototype (**2099-2103**) *is* `applyEvent`. Do not write a third.
2. **`CI_CHOOSE(index, now)`** (**2638-2657**) sets `ciPending`/`ciPendingIdx` and **clears `ciReassure` first, once, before any branching** (2640 — see Task 4 design note 5), then branches on the chosen option's kind, in this order:
   - `nothing` → set `ciConsecutive` from whether the case's **last log entry** is `kind: 'checked'`; append `{ kind: 'checked', text: 'Checked in — no change reported', noChange: true }`; set `ciReassure = true`; clear `ciPending`. **No navigation.**
   - `notdone` → navigate to `${engineKey}-prepare`. No log entry, no patch.
   - `else` → append `{ kind: 'checked', text: 'Reported something outside the listed options; re-diagnosing' }`, then navigate to the engine's first question: `{ passport: 'passport-q1', voter: 'voter-entry', sir: 'sir-q1' }`. Transcribe that map.
   - `valence` → `ciStage = 'valence'`.
   - `closureq` | `resolved-rung` | `deliverable` → `ciStage = 'closureq'`.
   - anything else (`event`, `action`, `deadend`) → `ciStage = 'confirm'`.
   Also set `ciPending` and `ciPendingIdx` in every branch that opens a panel.
3. **`applyCheckinPatch(state, opt, reportLabel, now)`** (**2662-2675**) — the shared tail:
   - capture `before = diagnose(engine, answers)`
   - append `{ kind: 'reported', text: reportLabel }`
   - `answers = applyEvent(answers, opt.patch ?? {})`
   - `after = diagnose(engine, answers)`
   - **if `before.ruleId !== after.ruleId || before.state !== after.state`**: clear `prepChecks` **and** append `{ kind: 'diagnosed', text: after.label }`. (The spec: *"prepare progress is cleared only when the resulting diagnosis id changes (the plan changed), and completed work is memorialized in the journey log before clearing"* — note the log entry ordering: `reported` is written **before** the patch, so the record reads in the order things happened.)
   - re-snapshot the case — **`{ ...case, ...caseSnapshot(...), savedAt: case.savedAt }`** (`ciPersistState`, **2628-2632**), so the Home card cannot drift **and the rendered "Saved {date}" stays true**. The `savedAt` spread-back is **deviation D7**: `caseSnapshot` stamps a fresh `savedAt` (2059), which would silently move the case's save date forward on every diagnosis-changing check-in, and that date renders in two places (`.saved-kicker` 3123, `.case-meta-line` 2914). Read D7 before writing this line.
   - `ciJustUpdated = true`, clear `ciStage`/`ciPending`/`ciPendingIdx`, navigate to `${engineKey}-diagnosis`
4. **Route every log append through one `appendLog` helper that sets `lastCheck = now`.** Precision, because the plan's first draft overstated this: `ciLog` (**2621-2627**) does set `c.lastCheck` on every write, but **not every log append goes through `ciLog`**. The `closed` entries (2699 in `ciClosureAnswer`, 2728 in `closeUnresolved`) and the `reopened` entry (2185 in `reopenCase`) are pushed with a bare `c.log.push(...)` and **do not touch `lastCheck`**. So "every log write sets `lastCheck`" is **not** what the prototype does.
   **The port unifies them anyway, deliberately:** one `appendLog(case, entry, now)` helper that appends and stamps `lastCheck`, used by every site. Three reasons — it removes a second, untested append path; `lastCheck` renders as "last update {ago}" on the Home card (3129), and a close or reopen genuinely *is* the last thing that happened to the case; and an open case's card is the only place the value shows, so a closed case's `lastCheck` moving is invisible. **Record it as a deliberate unification in `cases.ts`, not as a transcription** — and pin it: a test asserting `lastCheck` advances on a `closed` and a `reopened` append, with a comment naming this as a port decision the prototype does not make.
5. **DEVIATION D1 — the snapshot.** (`ciSnapshotNow` **2658-2661**, called from `ciLog` **2623**.) Take **one** `CiSnapshot` per check-in interaction, captured **before** the first log write of that interaction:
   `{ answers: { ...answers }, prepChecks: { ...prepChecks }, casefile: <the case object as it was> }`.
   Because the port is immutable, the snapshot can hold the case object itself — no `JSON.stringify` clone needed (the prototype needs one only because it mutates). A later log write **inside the same interaction must not re-snapshot**: implement `appendLog` as taking an explicit `snapshot: 'take' | 'keep'` (or equivalently, snapshot once at the top of each `CI_*` reducer arm and never inside the log helper). **Do not** paper over this by making `ciLog` idempotent-if-set — that would leave `nothing yet` un-snapshotted across two consecutive check-ins.
6. **`CI_CONFIRM(now)`** (**2676-2683**): a `deadend` option logs `{ kind: 'reported', text: opt.label }` and navigates to `'dead-end'` — **no patch, no diagnosis change**. Everything else goes through `applyCheckinPatch(state, opt, opt.label, now)`.
7. **`CI_VALENCE(accepted, now)`** (**2684-2693**) — the valence gate. The spec: *"Decision-class events are valence-asked … before any routing. … The celebratory beat can never land on a rejection."*
   - `accepted === true` → `ciAccepted = true`, `ciStage = 'closureq'`. **No patch, no log entry yet.**
   - `accepted === false` and `opt.rejectDeadend` → log `{ kind: 'reported', text: opt.label + ' — rejected' }`, navigate to `'dead-end'`.
   - `accepted === false` otherwise → `applyCheckinPatch(state, { ...opt, patch: opt.rejectPatch }, opt.label + ' — rejected', now)`.
8. **`CI_CLOSURE(gotIt, now)`** (**2694-2712**):
   - `gotIt === true` → log `{ kind: 'reported', text: opt.k === 'deliverable' ? opt.label : opt.label + ' — and the deliverable is in hand' }`; set `outcome = 'deliverable_received'`, `closedAt = now`; append `{ kind: 'closed', text: 'Case closed — deliverable received' }`; navigate to `'case-closed'`.
   - `gotIt === false` → `pp = (ciAccepted && opt.acceptPendingPatch) || opt.pendingPatch`; clear `ciAccepted`. If `pp`, `applyCheckinPatch(state, { ...opt, patch: pp }, opt.label + ' — deliverable still pending', now)`. Otherwise log `{ kind: 'reported', text: opt.label + ' — deliverable still pending' }`, set `ciReassure = true`, clear the panel, and **stay on the casefile screen**. (The prototype's own comment: *"The universal 'I got it!' option has no patch: reporting maybe-then-not changes nothing, honestly."*)
   This is the spec's **"retire, don't reset"**: a resolved rung is consumed via `pendingPatch`, never erased.
9. **`CI_UNDO`** (**2713-2720**): restore `answers`, `prepChecks` and the case (including its `log`) from `ciSnapshot`; clear `ciSnapshot`, `ciJustUpdated`, `ciReassure`. **A working case must be restored to `workingCase`, a saved case back into `savedCases` at its position** — the prototype's `Object.assign(c, restored)` handles both because it mutates the object in place; the port must branch on `activeCaseId === 'working'`.
10. **`CI_CANCEL`** — the `Cancel` buttons on the confirm (2846) and valence (2856) panels (`S.ciStage=null; S.ciPending=null; render();`). Clears `ciStage`, `ciPending`, `ciPendingIdx`. Does **not** touch the log, `answers`, `ciSnapshot` or `ciReassure`. **It ships with a test** (below) — the plan's first draft declared this arm and never tested it, which the Global Constraints call a defect outright. The `closureq` panel deliberately has **no** Cancel (2863-2866); assert that absence in Task 9, not here.
11. **Multi-event days** — the spec's *"after recording one update, 'Anything else change?' loops back."* The prototype implements this **structurally, not with a prompt**: `applyCheckinPatch` navigates to Diagnosis, whose `updateEntry` control is right there and returns to the same casefile. There is no "Anything else change?" string in the lock. **Do not author one.**

**RED** — this is the spec's own test list, mechanised. Each walk uses real `diagnose(...)` calls; never a hand-built `Diagnosis`.
- [ ] Passport walk: `state-1` → "Police contacted or visited me" → confirm → diagnosis becomes `state-2`, `q1` is `'contacted_incomplete'`, the log holds `reported` then `diagnosed` in that order, and **`q2` (a fact) survived**.
- [ ] Action attestation: `state-5a` → "I filed the formal grievance on CPGRAMS and have a number" → `state-5b-p` (grievance pending WAIT).
- [ ] `state-5b-p` → "They responded, but it did not help" → `state-5b` (the DPG is now recommended). The ladder never climbs itself: assert `ladderFor('passport', answers, d)` shows rung 2 `'done'` and rung 3 `'next'`, **not** `'now'`.
- [ ] `state-5b` → "I escalated to the DPG and have a reference number" → `state-dpg-p`.
- [ ] `state-dpg-p` → "The DPG responded, but it did not resolve anything" (a `deadend` option) → screen is `'dead-end'`, a `reported` entry was logged, and **the answers are unchanged**.
- [ ] Resolved rung: `state-5a-p` → "They responded and things are moving again" → closure question → **"Not yet"** → `pendingPatch { fOutcome: 'resolved' }` applied, the case is back on a WAIT, tracking continues, and a `reported … — deliverable still pending` entry exists.
- [ ] The same option → **"Yes, it's done"** → `outcome === 'deliverable_received'`, `closedAt` set, a `closed` entry appended, screen `'case-closed'`.
- [ ] Voter valence: `v-4` → "The appeal was decided" → `CI_VALENCE(false)` → `voterAppealed === 'decided'`, diagnosis is `v-5`, log entry text ends `' — rejected'`. → `v-5` "I filed the second appeal" → `v-5-p`. → `CI_VALENCE(false)` on `v-5-p` (`rejectDeadend`) → `'dead-end'`, **no patch applied**.
- [ ] Voter valence accepted: `v-4` → `CI_VALENCE(true)` → `ciStage === 'closureq'` and **no log entry and no patch yet** (the celebratory beat cannot land before the deliverable question).
- [ ] → then `CI_CLOSURE(false)` → `acceptPendingPatch` applied (`voterOutcome === 'accepted_pending'`), not `pendingPatch`.
- [ ] "Nothing yet": logs a `checked` entry with `noChange: true`, sets `ciReassure`, does **not** navigate, does **not** touch answers. A second consecutive one sets `ciConsecutive === true`; a `nothing yet` following a `reported` entry sets it `false`.
- [ ] "Something else happened" from a passport case logs a `checked` entry and navigates to `'passport-q1'`; from voter → `'voter-entry'`; from SIR → `'sir-q1'`.
- [ ] "I haven't done this yet" navigates to `${engineKey}-prepare` and writes **no** log entry.
- [ ] **D1 RED — the load-bearing one.** From `state-2`, choose "I asked the office what was pending" (which changes the diagnosis id to `state-5a-p`) with `prepChecks = { 0: true }` beforehand; confirm; then `CI_UNDO`. Assert `answers` deep-equals the pre-check-in answers (no `fOutcome`, `q2` back to its old value), `prepChecks` deep-equals `{ 0: true }`, and the case's log deep-equals the pre-check-in log (**both** the `reported` and the `diagnosed` entries removed).
  **Write an explicit comment in the test naming this as deviation D1, and state precisely what a faithful transcription does and does not break** (per the OQ5 ruling): snapshot #2 is taken *before* the `diagnosed` entry is pushed, so under the prototype's behaviour **the `diagnosed` entry IS correctly removed** — undo partially works. What fails is `answers` (already patched when #2 was taken), `prepChecks` (already cleared) and the surviving `reported` entry. Say so in the comment, so that a run where the log *shrank* is not misread as "the deviation isn't real" or "the test is wrong". **The `answers` assertion is the one that fails first, and it is the one that matters.**
- [ ] Undo of a `nothing yet` restores the log (the spec: *"every check-in (including nothing-yet, previously the one un-undoable kind) carries an Undo"*).
- [ ] Undo restores a **working** case as well as a saved one.
- [ ] Prep-step survival: a same-diagnosis-id check-in leaves `prepChecks` intact; an id-changing one clears it **and** memorialises the old plan with a `diagnosed` entry.
- [ ] **`CI_CANCEL` (design note 10, previously declared and untested).** From `ciStage: 'confirm'` with a `ciPending`/`ciPendingIdx` set: after `CI_CANCEL`, `ciStage`/`ciPending`/`ciPendingIdx` are all `null`, and `log`, `answers`, `ciSnapshot`, `ciReassure` and `savedCases` are **unchanged by identity**. Repeat from `ciStage: 'valence'`. A cancel that quietly wrote a log entry would be the worst kind of bug here — the citizen said "no".
- [ ] **The re-snapshot's actual purpose (design note 3, previously asserted only in prose).** After a diagnosis-changing check-in on a **saved** case, the stored case's `stateLabel`, `rec`, `whatShort`, `stepsTotal` and `stepsDone` all equal the values of a fresh `caseSnapshot` against the *new* diagnosis — asserted against real `diagnose(...)` output, not literals. This is the mechanism the whole Home casefile card depends on ("so the Home card cannot drift"), and nothing tested it.
- [ ] **D7 RED — `savedAt` survives the re-snapshot.** Seed a saved case with a fixed `savedAt` (say `1_700_000_000_000`), run a diagnosis-changing check-in with `now` far in the future, and assert `savedAt` is **unchanged**. Comment that a faithful transcription of `ciPersistState` (`Object.assign(c, caseSnapshot(...))`) overwrites it, making the rendered "Saved {date}" untrue. Assert alongside it that `lastCheck` **did** advance to `now` — the two clocks answer different questions and only one of them should move.
- [ ] **`ciSnapshot` does not leak across cases** (Task 4 design note 5's third sibling): check in on case A, then `OPEN_CHECKIN(B)`; assert `ciSnapshot` is `null`. Same for `BEGIN_WORKING_CHECKIN`. Comment that the prototype leaves A's snapshot standing here.
- [ ] **`ciReassure` is cleared by `CI_CHOOSE` on every branch:** set `ciReassure: true`, then `CI_CHOOSE` on an `event` option (which opens the confirm panel) — assert `ciReassure` is `false`. Then the `nothing` branch, which must end with it `true`.
- [ ] Immutability: none of the `CI_*` arms mutate the previous state's `savedCases`, any case object, `answers`, or `log`.
- [ ] Run: all fail.

**GREEN**
- [ ] Implement. Run the task's tests, the full suite, build, lint.

---

## Task 7 — Closure, dead end, reopen, remove, check-back date

**Files:** `src/session/cases.ts` (extend), `src/session/cases.test.ts` (extend), `src/session/session.ts` (modify)

**Design notes**

1. **`CLOSE_UNRESOLVED(now)`** (**2725-2730**): `outcome = 'closed_unresolved'`, `closedAt = now`, append `{ kind: 'closed', text: LOG_COPY.closedUnresolved }` via `appendLog` (Task 6 design note 4), then **`RESTART`** (which preserves `savedCases`). The spec: *"Choices: close as unresolved, or keep the case open."*
2. **Dead end's "Keep the case open"** is a plain `RESTART` — nothing is written. The case stays exactly as the `deadend` option's `reported` entry left it.
3. **`REOPEN_CASE(id, now)`** (**2183-2187**): `outcome = 'still_open'`, append `{ kind: 'reopened', text: LOG_COPY.reopened }`, then `loadCase(id)`, then navigate to `${engineKey}-diagnosis`. **`closedAt` is left in place** — the prototype does not clear it, and the log is the record either way. Do not "tidy" it.
4. **`REMOVE_SAVED(id)`** (**2178-2182**): filter it out; clear `activeCaseId` if it pointed there; clear `removeConfirm`. **Real deletion** — the spec: *"Deleting the case deletes the log (real deletion)."* The casefile screen's inline confirm sets `screen: 'home'`, `history: []` before removing (prototype **2881**), so the citizen is never left on a screen for a case that no longer exists.
5. **`SET_REMOVE_CONFIRM(id | null)`** — the inline confirm toggle.
6. **`SET_REMIND(value)`** — **deviation D5** (`setRemind` **2721-2724**): writes `remindAt = value || null` on **the active case**, working or saved, not on `savedCases` by id. The value is the date input's raw ISO string (`'2026-10-12'`); it is stored raw and **never rendered raw** (Task 8's `fmtRemind`).
7. **`TOGGLE_LOG(caseId)`** — `logOpen[caseId] = true` (the prototype only ever opens, **2825**; "Show all" has no counterpart "Show less"). Transcribe that asymmetry; do not add a collapse.
8. **`SET_REMINDER_COPIED(bool)`** — the copy-flash flag, mirroring C4's `copied` handling in `PrepareScreen`. **It ships with a test** (below); the plan's first draft declared it and never tested it, which the Global Constraints call a defect. Note the shape difference from C4 deliberately: C4's `copied` is component-local `useState`, this one is session state because the casefile screen's copy button lives inside a reducer-driven module — so it is `RESTART`-cleared, and the test asserts that.
9. **Design note on an unsaved case reaching closure.** `CLOSE_UNRESOLVED` / `CI_CLOSURE(true)` on a **working** case never persist: `workingCase` is not in `savedCases`, and `RESTART` drops it. So closing an unsaved case leaves no record. That is the prototype's behaviour and the honest consequence of "this casefile lives only in this tab until you save it" (the screen says exactly that). **Do not silently change it.** Record it as a design note in `cases.ts` and pin it with a test so a future reader sees it was a decision. **See Open Question 3** — a reviewer may want the working case auto-saved at closure.

**RED**
- [ ] `CLOSE_UNRESOLVED` sets the outcome, `closedAt`, and appends the exact `closed` entry text; the resulting state is Home with `savedCases` intact and everything else reset.
- [ ] `REOPEN_CASE` flips the outcome, appends the exact `reopened` entry, loads the case's answers into `answers`, and lands on `${engineKey}-diagnosis`. The log is intact (append, never replace) — the spec: *"restore to live, log intact."*
- [ ] A reopened case reappears in the still-open set and disappears from the closed set (assert against the same predicates Home uses).
- [ ] `REMOVE_SAVED` removes exactly one case, leaves the others, clears `activeCaseId` only when it matched, and never mutates the input array.
- [ ] **D5 RED:** `SET_REMIND` on a **working** case (`activeCaseId === 'working'`) writes `workingCase.remindAt`. Comment that a faithful transcription (searching `savedCases` by id) is a no-op here.
- [ ] `SET_REMIND('')` clears to `null` (the date input emits `''` when cleared).
- [ ] `TOGGLE_LOG` sets exactly one key and leaves other cases' flags alone.
- [ ] **`SET_REMINDER_COPIED` (design note 8):** `SET_REMINDER_COPIED(true)` sets the flag and touches nothing else (`savedCases`, `workingCase`, `answers` unchanged by identity); `SET_REMINDER_COPIED(false)` clears it; `RESTART` clears it (it is not in the preserved slice).
- [ ] Design-note pin: closing a working case leaves `savedCases` unchanged.
- [ ] Run: all fail.

**GREEN**
- [ ] Implement, run everything.

---

## Task 8 — The presentational parts: ladder, journey log, progress, card, mini stamp

**Files:** `src/ui/serviceSquare.ts` (new), `src/ui/dates.ts` (new), `src/ui/Crumbs.tsx` (modify), `src/ui/StatusStamp.tsx` (modify), `src/templates/EscalationLadder.tsx` (new), `src/templates/JourneyLog.tsx` (new), `src/templates/CaseProgress.tsx` (new), `src/templates/CaseCard.tsx` (new), + one test file each, `src/screens/screenCopy.ts` (modify)

**Design notes**

1. **`serviceSquare.ts`.** `Crumbs.tsx` currently declares `SERVICE_SQ` privately. `CaseCard` needs it too. **Do not export it from `Crumbs.tsx`** — that file exports components, so oxlint's `react(only-export-components)` would fire and add a 5th warning (the baseline forbids that). Move `SERVICE_SQ` into its own component-free `src/ui/serviceSquare.ts` (keyed off `UI.serviceLabel.*`, exactly as today, with the same "Voter Services and SIR share the pink square" comment) and have `Crumbs.tsx` import it. Assert in the test that the map is unchanged.
   **Two consumers, two DIFFERENT fallbacks, and that is deliberate — do not unify them.** `caseCard` uses `SERVICE_SQ[c.serviceLabel] || 'sq-butter'` (**3123**), because a card with no coloured square would read as a rendering bug on Home. `renderCheckin`'s crumbs use `SERVICE_SQ[c.serviceLabel] || null` (**2888**, **2911**), because `crumbs()` treats `null` as "no square at all", which is the correct render for an unrecognised label in a breadcrumb. Transcribe each at its own call site with its own fallback; a shared default parameter would silently change one of the two.
   **Handoff note for C7, written as a comment in `serviceSquare.ts`:** `CaseCard` looks this map up by a **persisted `serviceLabel` string read back out of `localStorage`**, not by a live value. If a service label is ever reworded, every already-stored casefile silently loses its colour square (falling through to `sq-butter`). Fixing that means keying the square off `engineKey` — which the casefile already stores — or migrating stored labels. **Out of C5's scope** (it is a faithful transcription of the prototype's own keying), but C7's migration code needs to know it exists.
2. **`StatusStamp` gains a `mini` variant.** The card renders `<span class="stamp mini {cls}">{LABEL}</span>` — **no icon** (**3127**) — and, for a closed case, `<span class="stamp mini closedmark">CLOSED</span>` (**3127**, the same ternary's else branch). Extend the existing component with `mini?: boolean` and a `closed?: boolean` (or a small sibling `MiniStamp`); either way the **icon must not render in the mini form**, and the existing full-size behaviour and its tests must be untouched. `'CLOSED'` goes in `screenCopy.ts`.
3. **`<EscalationLadder engineKey d answers />`** — the port of `renderLadder` (**2792-2803**). It calls `ladderFor(...)` and returns `null` when that returns `null`. Markup: `.ladder` > `.nm-k` (the def title, with the prototype's own inline `margin:0 0 8px`) > one `.lrung {status}` per rung containing `.lr-dot` (holding `ICONS.stepCheck` **only** when `done`), `.lr-label`, and `.lr-tag` **only** when `LADDER_TAG[status]` is non-empty > `.ladder-note` (the caption). No new copy: title, caption, rung labels and tags all come from `LADDER_DEFS`/`LADDER_TAG`.
4. **`<JourneyLog case logOpen onShowAll />`** — the port of `renderLog` (**2807-2829**). The collapse algorithm, transcribed:
   - walk `c.log` in order; an entry is *collapsible* when `kind === 'checked'` **and** (`noChange === true` **or** (`noChange === undefined` **and** `/no change/.test(text)`)). The prose test is a **legacy fallback for migrated entries only** — keep it, keep the prototype's own comment saying so.
   - consecutive collapsibles fold into one run `{ n, from, to }`; any non-collapsible flushes the run.
   - show all entries when `logOpen[c.id]`, else the **last 3**.
   - the "Show all {n} entries" button renders only when `entries.length > 3 && !logOpen[c.id]` — note it counts **collapsed** entries, not raw log rows.
   - **the button renders BEFORE the entries in DOM order** (**2825** precedes **2826**), which is not the position a reader would guess for a "show more" control. Transcribe the order and **assert it** — this plan asserts DOM order elsewhere (Task 11's `<UpdateEntry>` position) and this one is easier to get backwards.
   - a run renders as `Checked {n} time(s), {from}[ – {to}] — no change reported`, where the ` – {to}` half appears **only** when `n > 1`.
   - a normal entry renders `.log-e` with `.log-mile` when kind is `diagnosed`/`closed`/`reopened`, else `.log-check`; `.log-d` is `fmtDay(t)`; `.log-who` is `'You reported:'` for `reported`, `'NextMove:'` for `diagnosed`, **empty** for `closed`/`reopened`, `'—'` otherwise.
   - always ends with `.log-note` → `'Your journey record, not an official document.'`
5. **`fmtDay` (2731) / `fmtRemind` (2735-2738) / `daysAgo` (2739) go in `src/ui/dates.ts`, and that module is MANDATORY, not one of two options.** The plan's first draft offered "`src/templates/` alongside the components that use them, or a small `src/ui/dates.ts`" — the first half of that is not actually available. These three have **three** consumers (`CaseCard`, `JourneyLog`, `CasefileScreen`), so they must be exported; exporting them from any `.tsx` that also exports a component fires oxlint's `react(only-export-components)` and adds a 5th warning, which the baseline forbids. **That is the exact failure mode design note 1 already guards against for `SERVICE_SQ`** — same rule, same fix, and there is no reason to state it as a choice here. `src/ui/dates.ts` is component-free and holds all three.
   They stay out of `domain/` — they are presentation, and nothing in `domain/` or `session/` formats a date. Transcribe them exactly, `'en-IN'` locale and all, including `fmtRemind`'s `+'T00:00:00'` and its `isNaN` fallback to the raw string (which is what keeps a corrupt stored value from rendering `Invalid Date`). **Pin the locale with a test** — a different locale changes rendered copy.
   **`daysAgo` reads `Date.now()` internally** (2739). Under D6 the port takes `now` as a second argument (`daysAgo(t, now)`) so the test is deterministic and does not need fake timers; the caller supplies it, exactly as the reducer actions do.
6. **`<CaseProgress prep prepChecks />`** — **2916-2919**. `.case-progress` > `.cp-head` (`.nm-k` "Prepare steps" + `.cp-count` "{done} of {total} done") > `.cp-bar` > `.cp-fill` with `style={{ width: pct + '%' }}`, `pct = steps.length ? Math.round(done/steps.length*100) : 0`. Renders only when the diagnosis has a prep plan.
7. **`<CaseCard case onOpen />`** — **3117-3135**. **The whole card is one `<button className="saved-card{ closed}">`** (the compact-card spec's central decision: *"The **whole card** is the tap target (locked list-row pattern) → opens the casefile screen"*). Contents: `.saved-body` > `.saved-kicker` (`.crumb-sq {SERVICE_SQ}` + `{serviceLabel} · {kicker}`), `.saved-title`, `.saved-next` (open + `whatShort` only — the `→ ` prefix is the CSS `::before`, **not** part of the string), `.saved-meta` (the mini stamp, then, for open cases only: steps chip when `stepsTotal`, last-update chip when `lastCheck`, check-back chip when `remindAt`), then `.arow-chevron`.
   - Title: `gotIt ? (CLOSED_TITLE[engineKey] ?? stateLabel) : stateLabel` — the prototype's own comment explains why (*"'Application submitted, awaiting decision' on a closed case read as a contradiction"*).
   - Kicker: `open ? 'Saved ' + fmtDay(savedAt) : gotIt ? 'Closed — got it' : 'Closed — unresolved'`.
   - **Nothing else.** No journey log, no button cluster — the casefile-screen spec removed both.
8. **New `screenCopy.ts` entries** (all transcribed). **These DO belong in `screenCopy.ts`, and the OQ8 ruling does not move them** — the line it draws is between *entry text the reducer composes and persists* (→ `domain/casefile.ts`'s `LOG_COPY`) and *chrome the component renders around those entries* (→ here). `'You reported:'`, `'Show all {n} entries'`, the collapsed-run templates and `'Your journey record, not an official document.'` are all rendered by `<JourneyLog>` and composed by nothing in `session/`, so they are chrome. If you find yourself importing one of these from `cases.ts`, the classification was wrong — move it to `LOG_COPY` instead of adding a `session/ → screens/` import.
   The entries: `UI.casefile.prepareStepsK` `'Prepare steps'`, `UI.casefile.prepareCount` `'{done} of {total} done'` (TEMPLATE), `UI.card.savedPrefix` `'Saved {date}'` (TEMPLATE), `UI.card.closedGotIt` `'Closed — got it'`, `UI.card.closedUnresolved` `'Closed — unresolved'`, `UI.card.next` `'Next: {what}'` (TEMPLATE), `UI.card.steps` `'{done} of {total} steps done'` (TEMPLATE), `UI.card.lastUpdate` `'last update {ago}'` (TEMPLATE), `UI.card.checkBack` `'check back {date}'` (TEMPLATE), `UI.card.closedMark` `'CLOSED'`, `UI.log.showAll` `'Show all {n} entries'` (TEMPLATE), `UI.log.collapsedOne` / `UI.log.collapsedMany` (TEMPLATES), `UI.log.whoReported` `'You reported:'`, `UI.log.whoDiagnosed` `'NextMove:'`, `UI.log.whoOther` `'—'`, `UI.log.note` `'Your journey record, not an official document.'`, `UI.time.today` `'today'`, `UI.time.yesterday` `'yesterday'`, `UI.time.daysAgo` `'{n} days ago'` (TEMPLATE).
9. **A guardrail point the reviewer will ask about, so state it up front.** `UI.time.daysAgo` and `UI.log.collapsedMany` render, at runtime, strings containing a **day count** (`"3 days ago"`) and **calendar dates** (`"12 Sep"`). The static content-safety scan sees only the registered **template** (`'{n} days ago'`, `'Checked {n} times, {from} – {to} — no change reported'`), which contains no digits and therefore no `interval`/`DATE_RE` match. **This is correct, not a hole**: `numericFindings` exists to stop NextMove asserting an *unsourced claim about a government process*. These numbers are arithmetic over the citizen's own journey log — the same class of value as a clock. Register them as `CAPTION_TEMPLATES` carve-outs in Task 13 with exactly this reasoning written next to each, the same way `ui:trust.verifiedOn` already is. **Do not** add allowlist entries to `sources/manifest.json` for them — that allowlist is for government-sourced values, and diluting it is the thing C2 explicitly refused to do.

**RED**
- [ ] `serviceSquare.test.ts`: the map's three entries; `Crumbs.tsx` still renders the right square for each service (existing `Crumbs` tests keep passing untouched).
- [ ] **The two fallbacks stay distinct** (design note 1): a `CaseCard` whose `serviceLabel` is an unrecognised string renders `crumb-sq sq-butter`; the `CasefileScreen` crumbs for the same label render **no** square element at all. Assertion messages name each as the prototype's own deliberate choice, so a later "consistency" refactor has to argue with a test.
- [ ] **`dates.ts` is component-free** (design note 5): assert the module exports exactly `fmtDay`, `fmtRemind`, `daysAgo` and no React component — and that `npm run lint` still reports exactly the 4 baseline warnings after this task (recorded in the task report, per the baseline).
- [ ] `StatusStamp`: the mini variant renders no `.stamp-icon`; the full variant is unchanged; `closedmark` renders the literal `CLOSED`.
- [ ] `EscalationLadder`: renders nothing for SIR; renders nothing for a passport `state-1` (ladder not in play — `ladderFor` returns `null`); renders three rungs with the right status classes and tags for a real `state-5b` diagnosis; the `done` rung's dot contains the check icon and no other rung's does; the caption is `LADDER_DEFS.passport.caption` verbatim.
- [ ] `JourneyLog`: 5 mixed entries → the last 3 shown plus a "Show all 5 entries" button; clicking it calls `onShowAll`; with `logOpen` true, all 5 and no button.
- [ ] **DOM order:** the "Show all 5 entries" button precedes the first `.log-e` in document order (design note 4). Use `compareDocumentPosition` or index-into-`container.querySelectorAll('.journey > *')`, not just presence.
- [ ] Three consecutive `noChange` entries collapse into one line reading `Checked 3 times, {from} – {to} — no change reported`; a single one reads `Checked 1 time, {from} — no change reported` **with no dash-range half**.
- [ ] A legacy entry (`kind: 'checked'`, no `noChange`, text containing "no change") still collapses — the migration fallback.
- [ ] A `reported` entry between two `noChange` entries produces **two** separate runs, not one.
- [ ] `.log-mile` is applied to `diagnosed`/`closed`/`reopened` and not to `reported`/`checked`; `.log-who` is empty for `closed`/`reopened`.
- [ ] The `.log-note` line always renders, in every case.
- [ ] `fmtRemind('2026-10-12')` renders `'12 Oct'` and never the ISO string; `fmtRemind('garbage')` returns `'garbage'`, not `Invalid Date`. `daysAgo` returns `'today'` / `'yesterday'` / `'{n} days ago'` at the right boundaries.
- [ ] `CaseProgress`: `2 of 5 done` and a `40%` fill; `0 of 0` yields `0%` and does not divide by zero.
- [ ] `CaseCard`: the whole card is a single `<button>` (query by role, assert exactly one button in the subtree); clicking anywhere in it fires `onOpen`; an open card shows the "Next:" line, the steps chip, the last-update chip and the check-back chip only when the corresponding data exists; a `deliverable_received` card shows `CLOSED_TITLE[engineKey]` as its title and the `Closed — got it` kicker; a `closed_unresolved` card keeps `stateLabel` and the `Closed — unresolved` kicker; **no closed card renders a coloured status chip** and **no card renders a journey log or an action button cluster** (the compact-card spec's whole point — assert the absence).
- [ ] Run: all fail.

**GREEN**
- [ ] Implement, run everything.

---

## Task 9 — `CasefileScreen`

**Files:** `src/templates/CasefileScreen.tsx` (new), `src/templates/CasefileScreen.test.tsx` (new), `src/screens/screenCopy.ts` (modify)

The port of `renderCheckin` (**2830-2970**). Per the compact-card spec, **this is the case's home — there is no fifth surface**: *"No fifth surface: the check-in screen becomes the case's home."*

**Design notes**

1. **Two variants in one component**, branching on `case.outcome !== 'still_open'` (**2884**). Structural branching only.
2. **Closed variant** (**2884-2901**), `topbar(true, false)`:
   - left: crumbs `[serviceLabel + ' · ' + (gotIt ? (CLOSED_TITLE[engineKey] ?? stateLabel) : stateLabel), 'Your casefile']`; `<h1 class="case-h1">` = `gotIt ? 'Case closed: you got it.' : 'Case closed. The record stays.'`; the lede; `.case-meta-line` = `Saved {day}[ · closed {day}]`.
   - right: `.nm-k` `Journey · {n} entr(y|ies)`; `<JourneyLog>`; `.case-links` with one `.case-link` `'This came back; reopen it'` + trailing chevron; then the remove control.
   - **No check-in machinery at all.** Assert its absence in a test.
3. **Open variant** (**2902-2969**), `topbar(true, false)`:
   - **left**: crumbs `[serviceLabel, 'Your casefile']`; `<h1 class="case-h1">{d.label}</h1>`; `.stamp-row` with the full `<StatusStamp>`; `.case-meta-line` = `{unsaved ? 'Started' : 'Saved'} {day}[ · check back {remind}]`; `<CaseTrail>` **only for passport** (reuse C3's `passportTrailFor`, gated on `engineKey === 'passport'` for the same stale-`q1` reason `DiagnosisScreen` already documents); `<CaseProgress>` when a prep plan exists; `<EscalationLadder>`; the `Journey · N` heading; `<JourneyLog>`.
   - **right**: the C6 `freshBanner` comment seam; then **either** the phase-drift module (Task 13) **or** the `.update-mod`; then `.case-links`; then the save/remove tail.
4. **The `.update-mod`** (**2932-2959**): `.um-head` with `.dr-icon`(`ICONS.pen`) + `.um-kicker` `'Add an update'` + `.um-title` `"What's happened since?"`; the lede; the active panel (if any) in a `margin-top:14px` wrapper; then `.answers` (with the prototype's own conditional `margin-top` of `14px`/`8px`); then the remind row.
   - **Each option row is a `<button class="arow">`** with `.arow-check`, `.arow-body > .arow-label`, `.arow-chevron`. Two inline-style rules, transcribed with their comment: the **picked** row gets `background:var(--butter); border-color:var(--ink)` on its check and `font-weight:600` on its label; the **deliverable** row (when not picked) gets `border:2px solid var(--butter-deep)` — the prototype's comment explains the butter *ring* rather than a fill: *"its old solid fill read as an already-selected radio."*
   - `aria`: the option list is a list of buttons, not radios (each choice opens a panel rather than selecting a value) — do **not** add `role="radio"`/`aria-checked`. Give the picked row `aria-current="true"`, which is the honest description of "this is the row the open panel refers to".
5. **The four panels** (**2836-2876**), each `.ci-panel`, each led by the **`pickedEcho`** line — `You picked: <b>{opt.label}</b>` — which the prototype's own comment justifies (*"the confirm can appear above the fold of the clicked row, and 'this' with no referent fails exactly the glance-away-and-return moment (ADHD pass 3)"*). Do not drop it.
   - `confirm`: `'Record this?'` + `'It updates your casefile'` + `' and may change your diagnosis'` **only when** `opt.k` is `'action'` or `'event'` + `'.'`; buttons `Yes, record it` (primary) / `Cancel` (secondary).
   - `valence`: `'Which way did it go?'`; `In my favour` / `Against me / rejected` (both secondary) / `Cancel` (ghost).
   - `closureq`: `DELIVERABLE_Q[engineKey]`; `Yes, it's done` (primary) / `Not yet` (secondary). **No Cancel** — transcribe the absence.
   - `reassure` (`.ci-panel.reassure`): `'Nothing changing is not a bad sign here.'`, then **`d.howLong` and `d.expectNext` verbatim** when present (the spec: *"restates the case's own verified 'How long?' and 'What to expect' fields byte-identically"* — pass the `Diagnosis` fields straight through, never re-word), then the anti-compulsion line when `ciConsecutive`, then the `Undo this check-in` button when a snapshot exists.
6. **The remind row** (**2953-2956**, with the copyable-reminder line at **2957-2958**): `.remind-row` with the prompt text and `<input type="date" class="remind-input" aria-label="Check-back date" value={remindAt ?? ''} onChange={...}>`. When `remindAt` is set, a following `.small` line with the copyable reminder and a `.read-change` Copy/Copied button. `copyReminder`'s clipboard-then-fallback shape is **the same structure C4 already built for `copyDraft`** (C4 handoff note) — reuse the try / `.then(flash, fallback)` / `catch` shape and the 2200ms flash; the fallback differs (a temporary textarea rather than selecting a persistent field), and in jsdom it must not throw.
   - **The spec's hard rule applies here:** *"User-picked check-back date … **never a suggested interval**."* The input has no default, no placeholder date, no min, no suggested value.
7. **`.case-links`** (open variant **2960-2963**; closed variant **2895-2897**): `See my diagnosis` → `${engineKey}-diagnosis`; `Continue preparing` → `${engineKey}-prepare`, **only when the diagnosis has a prep plan** (the casefile spec: *"only when the state has a PREP entry"* / *"Prepare link absent on WAIT states"*).
8. **The tail** (**2964-2967**): a **working** case renders the `.small` note `'This casefile lives only in this tab until you save it.'` followed by `<SaveControl>` with `stepsDone = 0` (the prototype passes a literal `0` here — transcribe it, do not "improve" it to the real count). A **saved** case renders the remove control instead. The casefile spec is explicit that Remove moved here from Home: *"**Remove** — quiet, inline-confirmed, relocated from Home (deleting from the overview was too trigger-happy)."*
9. **The remove control** (**2879-2883**) is shared by both variants: either the inline `.restart-confirm` (`Remove this case and its history?` + `Yes` / `Cancel`) or the `.case-remove` button. Its `Yes` must send the citizen to Home **as part of the same action** (`screen: 'home'`, `history: []`, then remove — prototype **2881**) so they are never left on a dead case's screen.
10. **Guard.** `renderCheckin` opens with `if(!c){ restart(); return renderHome(); }` (**2832**). The React equivalent is the `RestartToHome` component `App.tsx` already carries for `PrepareScreen` — **reuse it in Task 13's router**, and make `CasefileScreen`'s `case` prop required and non-nullable so the state is unrepresentable here, exactly as `PrepareScreen`'s `prep` prop is.

**RED** (`CasefileScreen.test.tsx`, real diagnoses and real cases throughout)

> **Rule for every absence assertion in this file.** This task asserts several *absences* (no `.update-mod` on a closed case, no `.arow`, no `.remind-row`, no check-in machinery, no coloured chip). An absence assertion passes **vacuously** if the query string is subtly wrong — a typo'd class name is "absent" from every screen ever rendered. So: **each absence assertion must use the byte-identical query string as its own positive-control counterpart elsewhere in this same test file.** The positive controls already exist here (the open variant asserts each of these is present), so this costs nothing but a shared `const SEL = { updateMod: '.update-mod', optionRow: '.arow', remindRow: '.remind-row', … }` at the top of the file, used by both sides. An absence that no positive control in the same file confirms is not an assertion; it is a typo waiting to be believed.

- [ ] Open variant renders the headline, the stamp, the meta line, the update module, the option list, the remind row and both case links.
- [ ] `Started` vs `Saved` in the meta line, from `unsaved`.
- [ ] `Continue preparing` is absent for a WAIT state with no prep plan and present for `state-5a`.
- [ ] The case trail renders for passport and not for voter/SIR.
- [ ] `CaseProgress` renders only with a prep plan; `EscalationLadder` renders only when `ladderFor` is non-null.
- [ ] Choosing an option calls the handler with the right index; the picked row gets `aria-current` and the butter check style; the deliverable row carries the ring style when not picked.
- [ ] Each panel renders its exact strings for the right `ciStage`; the confirm panel's diagnosis clause appears for an `action`/`event` option and **not** for a `deadend` one.
- [ ] The reassure panel renders `d.howLong` and `d.expectNext` **byte-identically** to the `Diagnosis` fields (assert against `d.howLong`, not a literal).
- [ ] The anti-compulsion line appears only when `ciConsecutive`; the Undo button only when `ciSnapshot` is non-null.
- [ ] The check-back input is `type="date"`, has `aria-label="Check-back date"`, and has **no** default value when `remindAt` is null.
- [ ] The copyable reminder line and Copy button appear only when `remindAt` is set; clicking Copy does not throw in jsdom (clipboard absent) and fires the copied handler.
- [ ] A working case renders the "lives only in this tab" note and a save control; a saved case renders neither, and renders the remove control.
- [ ] The remove control's confirm state renders both buttons; `Yes` fires the remove handler.
- [ ] Closed variant: the two headline branches; the `closed` half of the meta line; the journey log; `This came back; reopen it`; the remove control; and **no** `.update-mod`, no `.arow` option rows, no `.remind-row` (assert absences).
- [ ] Closed-`deliverable_received` crumbs use `CLOSED_TITLE`; closed-`unresolved` crumbs use `stateLabel`.
- [ ] `Journey · 1 entry` vs `Journey · 3 entries`.
- [ ] Run: all fail.

**GREEN**
- [ ] Implement, adding every new string to `screenCopy.ts` under `UI.casefile.*`. (Check-in **option labels** and **journey-log entry text** are not among them — those are `domain/`, per the Global Constraints. What lands here is the screen's own chrome: headlines, ledes, panel prompts, button labels, the meta-line templates.) Run everything.

**Acceptance note (from the Open Question 7 ruling, not a gate):** while this screen is up in the browser for the first time, take one look at a `state-5b-p` case — a **WAIT** stamp rendered above a ladder whose earlier rungs are tagged **Done**. That is the `--wait-bg` / `--done-bg` pair co-occurring on one screen, which the C3 exemption's original comment wrongly denied. The ruling stands either way (each carries a distinct text label, so WCAG 1.4.1 is satisfied independent of ΔE), but confirming it by eye once, now that it is finally mountable, costs a minute and closes the only part of that exemption that was ever argued from tokens rather than from a render.

---

## Task 10 — `DeadEndScreen`, `CaseClosedScreen`, `SaveDoneScreen`

**Files:** `src/templates/DeadEndScreen.tsx`, `src/templates/CaseClosedScreen.tsx`, `src/templates/SaveDoneScreen.tsx` (+ tests), `src/screens/screenCopy.ts` (modify)

**Design notes**

1. **`DeadEndScreen`** (**2971-2985**), `topbar(true, false)`, `.narrow` (not a `Split`). Crumbs `[serviceLabel, 'End of the verified ladder']`; `<h2 class="headline">` `"You've used every step this playbook can verify."`; the lede (transcribe the whole paragraph — it is the most carefully written copy in the product); `<JourneyLog>`; `Keep the case open` (secondary, block) → `RESTART`; `Close it as unresolved` (ghost) → `CLOSE_UNRESOLVED`.
   The spec: *"its own screen, not a diagnosis. Copy says plainly: you have used every step this playbook can verify — no invented next step, no false hope."* **This screen must never offer a next action.** Add a test asserting it renders no link to any `*-prepare` or `*-nextmove` screen.
2. **`CaseClosedScreen`** (**2986-3000**), `topbar(false, false)`, a `Split`. Left: `<Gems placement="reveal" />`, crumbs `['Case closed']` with `sq-butter`, `<h1 class="headline">You <span class="mark">got it</span>.</h1>`, the lede. Right: `<JourneyLog>` when a case exists, then `Back to Home` (primary, arrow) → `RESTART`.
   - **This is "the single calm celebratory beat"** the spec allows, and only on `deliverable_received`. It is reduced-motion-safe already: `Gems` and every entrance animation are collapsed by the `@media (prefers-reduced-motion:reduce)` block C3 lifted. **Add a test that asserts `index.css` still collapses `.gem`'s animation under that media query**, so the guarantee is executable rather than assumed.
   - **The lede's final clause is FALSE for a working case, and gets gated. (Open Question 3, RESOLVED; Finding 13.)** The prototype's lede (**2994**) ends: *"…NextMove's part is done; the casefile and its journey stay under 'Closed' on Home if you ever need the record."* For a **saved** case that is true. For a **working (unsaved)** case it is affirmatively false — `workingCase` is not in `savedCases`, `RESTART` drops it, and nothing stays under "Closed" on Home. That path is reachable (the casefile screen offers the full check-in machinery to a working case, closure included), so the screen is telling some citizens their record is kept at the exact moment it is being discarded.
     **The fix is a gate, not an invention:** register the lede as two parts, and render the *"the casefile and its journey stay under 'Closed' on Home if you ever need the record"* clause **only when `!case.unsaved`**. Everything up to *"NextMove's part is done"* renders unconditionally. This is a **subtraction** on the same principle as the `SaveDoneScreen` ruling below — "never invent copy" forbids authoring, not omitting a sentence that is untrue on this branch. **Do not** author a replacement clause for the working case; say nothing rather than something.
     **And do NOT auto-save the working case at closure to make the sentence true** — that would create a casefile the citizen never asked for and contradict the casefile screen's own warning ("This casefile lives only in this tab until you save it"), which is informed consent working as designed. Task 7 design note 9's pin (closing a working case leaves `savedCases` unchanged) stays exactly as it is.
3. **`SaveDoneScreen`** (**3887-3899**), `topbar(false, false)`, `.narrow`. Crumbs `['Case saved']`; `<h2 class="headline">Your casefile is saved.</h2>`; the lede; `Back to my case` (primary, arrow) → `pendingSave.returnScreen` (**3895** — a direct `nav()`, **not** `continueSaved`, which is dead in the lock; see Task 5 design note 7), rendered **only when `pendingSave` exists**; `Go to Home` (secondary, block) → `RESTART`.
   - **The lede's second sentence is auth-coupled and is SUBTRACTED in C5. (Open Question 1, RESOLVED — option (b).)** The prototype's lede (**3894**) is two sentences: *"It's waiting on the Home screen whenever you come back: your answers, your diagnosis, and any steps you've already ticked off. Nothing else happens with your `${S.user && S.user.method==='phone' ? 'number' : 'account'}`."* With no user the ternary evaluates to `'account'`.
     **Register only the first sentence** as `UI.saveDone.lede` and ship the screen without the second. The reasoning: in a device-local C5 the sentence is not merely vacuous — a reader takes *"Nothing else happens with your account"* as **asserting they have an account**, which is affirmatively misleading in a product whose whole thesis is not saying things it cannot back. "Never invent copy" forbids **authoring**, not **subtracting**; this plan already subtracts freely and deliberately elsewhere (CSS ranges, snapshot fields, whole screens).
     Leave a comment at the omission naming C7 and recording **both** branches of the original tail (`'number'` for a phone sign-in, `'account'` otherwise), so C7 restores the sentence with its full ternary rather than re-deriving it. **Option (c) — skipping `save-done` entirely and flipping `saveControl` to `.saved-note` in place — is rejected:** it drops the "Back to my case" path for no gain and is the largest flow deviation of the three.
4. New `screenCopy.ts` sections: `UI.deadEnd.*`, `UI.caseClosed.*`, `UI.saveDone.*`.

**RED**
- [ ] Each screen renders its exact crumbs, headline and lede; each button fires its handler.
- [ ] `DeadEndScreen` renders the journey log and offers exactly two controls, neither of which is a next action.
- [ ] `CaseClosedScreen` renders the highlighter `.mark` span on `got it` and the `Gems`; the reduced-motion CSS assertion.
- [ ] **`CaseClosedScreen`'s lede gate (design note 2):** with a **saved** case, the rendered lede contains `"stay under “Closed” on Home"`; with a case carrying `unsaved: true`, that clause is **absent** while the first half (`"NextMove's part is done"`) is still present. Assertion message states the harm — telling a citizen their record is kept at the moment it is discarded. Use the same query string on both sides (Task 9's absence rule).
- [ ] `SaveDoneScreen` renders `Back to my case` only when a `pendingSave` is supplied.
- [ ] **`SaveDoneScreen`'s lede is the one true sentence and nothing more (design note 3):** it contains `"It's waiting on the Home screen whenever you come back"` and does **not** contain `"Nothing else happens with your"`. Assertion message names this as the OQ1(b) subtraction and points at C7 as the restorer, so a later reader does not "fix" it back in.
- [ ] Run: all fail.

**GREEN**
- [ ] Implement, run everything.

---

## Task 11 — Home's casefiles section + the save/update seams on Diagnosis, Next Move and Prepare

**Files:** `src/templates/SaveControl.tsx` (new + test), `src/screens/Home.tsx` (modify), `src/templates/DiagnosisScreen.tsx` (modify), `src/templates/NextMoveScreen.tsx` (modify), `src/screens/screenCopy.ts` (modify), the three screens' existing test files (modify)

**Design notes**

1. **`<UpdateEntry>`** (**2284-2289**) — one `.btn-ghost` button, `ICONS.pen` + `"Add an update: what's happened since?"`. Its **destination is data-dependent**: a still-open saved case whose answers match (**by the D3 key-sorted comparison, not `JSON.stringify`** — this is the third D3 site) opens *that* casefile; otherwise it begins a working check-in. The component takes a single `onUpdate` callback and the routing decision lives in `App.tsx`/the reducer (`BEGIN_WORKING_CHECKIN` already implements the "prefer the matching saved case" branch, Task 5) — **not** in the component. A component that decides which case to open would be exactly the "government-process rule in a component" the Global Constraints forbid, and it would duplicate Task 5's logic.
2. **`<SaveControl>`** (**2292-2298**) — the one save entry point, shared by Next Move and Prepare, **quiet by design** (*"it must never compete with the case's actual next action"*). When the case is already saved: `.saved-note` with `ICONS.bookmark` + `'Saved. Find it on Home whenever you come back'`. Otherwise a `.btn-ghost` whose label is `stepsDone > 0 ? 'Save this case (your ticked steps come with it)' : 'Save this case, and NextMove keeps walking with you'`.
   - The second label is the save prompt the check-in spec repositioned: *"The auth ask now sells tracking, not storage."* Keep it exactly.
3. **`DiagnosisScreen`** gains, in its right column, in this order (**3597-3607**):
   1. the **`ciJustUpdated` banner** — a `<Banner>` with the prototype's inline `border-color:var(--butter); background:var(--butter-soft)` style, text `'Update recorded. This is where it leaves your case.'` + a `.read-change` `'Undo that update'` button. Rendered only when `ciJustUpdated` and a snapshot exists.
   2. the existing C6 `freshBanner` comment seam (already there).
   3. the phase-drift banner seam — **Task 13's**; leave a comment.
   4. the existing `preNote`, `dep-block`, `CaseTrail`, CTA, `TrustDisclosure` — **unchanged**.
   5. `<UpdateEntry>` **between the CTA and `TrustDisclosure`** (3607). Not at the end.
   All of it behind **new optional props** with `undefined` defaults, so every existing `DiagnosisScreen` test keeps passing untouched. Do not restructure a single existing branch.
4. **`NextMoveScreen`** gains `<UpdateEntry>` then `<SaveControl>` **after** the existing CTA branch (**3680-3681**), both behind new optional props. `NextMoveScreen.tsx`'s design note 2 and its `'the prepare CTA seam (C4)'` describe block must keep passing unchanged.
5. **`Home`** gains the casefiles section at **its own already-marked seam** (`Home.tsx:7-9`: *"INSERTION POINT FOR C5: the casefiles section (`savedCard`/`home-cases`) slots in here, immediately after the three service rows, inside the right column"*). Structure (**3137-3142**, mounted at **3168**):
   - `open = savedCases.filter(c => c.outcome === 'still_open')`, `closed = savedCases.filter(c => c.outcome !== 'still_open')`.
   - render `.home-cases` only when either is non-empty.
   - open first: `.list-lead` `Your casefile{s} · {n}` then the open cards.
   - closed below: `.list-lead` with the prototype's inline `color:var(--ink-soft); font-size:16px`, text `Closed`, then the closed cards.
   - The spec: *"Home renders a card list; open cases first, closed collapsed below."*
   - Update `Home.tsx`'s header comment — the "Home ships without casefiles in C3" sentence becomes false in this commit.
6. New copy: `UI.updateEntry.label`, `UI.saveControl.savedNote`, `UI.saveControl.save`, `UI.saveControl.saveWithSteps`, `UI.home.casefilesOne` / `casefilesMany` (TEMPLATES) / `closedLead`, `UI.diagnosis.updateRecorded`, `UI.diagnosis.undoUpdate`.

**PRE-CHANGE PIN — do this step FIRST, before touching `DiagnosisScreen.tsx` or `NextMoveScreen.tsx`, and do NOT file it under RED.**

The "extend, don't restructure" guarantee for these two screens is a **regression pin**, not a RED test, and the plan's first draft filed it in the RED bullet list where it does not belong. `toMatchSnapshot()` **writes the snapshot on its first run and passes green immediately** — it cannot fail first. An implementer following "run: all fail" literally will conclude the test is broken and downgrade it to a "renders without crashing" assertion, which guarantees nothing. So state the mechanism as its own step:

- [ ] **Before editing either component:** add the byte-identity test to `DiagnosisScreen.test.tsx` and `NextMoveScreen.test.tsx` — mount each with today's props and `expect(container.innerHTML).toMatchSnapshot()` (or an inline expected-HTML const, which is more readable in a diff and needs no `--update` flag discipline).
- [ ] Run it against the **unmodified** components and **commit the generated snapshot / inline const**. This is the artefact the guarantee rests on; without a committed pre-change baseline the test proves nothing.
- [ ] Now make the Task 11 changes.
- [ ] Re-run. **With the new props absent, the snapshot must still match** — that is the guarantee. Then mount *with* the new props and confirm the snapshot correctly shows the added banner / update-entry / save-control, and update that second (separate) snapshot deliberately. If the props-absent snapshot moved, a supposedly additive change restructured something: stop and find out what.

**RED**
- [ ] `SaveControl`: both label branches; the saved-note branch renders no button.
- [ ] `UpdateEntry`: one button, fires `onUpdate`, carries the pen icon.
- [ ] `Home` with no cases renders no `.home-cases` (a real regression risk: an empty `<div class="home-cases">` would add a stray gap).
- [ ] `Home` with two open cases renders `Your casefiles · 2` and two cards; with one, the singular.
- [ ] `Home` with an open and a closed case renders both sections, **open first**, with the `Closed` lead between them.
- [ ] Clicking anywhere on a card calls the open handler with that card's id.
- [ ] `DiagnosisScreen` with `ciJustUpdated` renders the banner and its Undo button, positioned **before** the dependency block; `<UpdateEntry>` renders **between** the CTA and the trust toggle (assert DOM order, not just presence).
- [ ] `NextMoveScreen` with the new props: update-entry then save-control, both after the CTA.
- [ ] Run: all fail. *(The byte-identity pins are not in this list — they are the pre-change step above, and they pass from the moment they are written. That is what they are for.)*

**GREEN**
- [ ] Implement, run everything, confirm the lint warning count is still 4.

---

## Task 12 — Lift `PrepareScreen`'s tick/draft state into the reducer

**Files:** `src/templates/PrepareScreen.tsx` (modify), `src/templates/PrepareScreen.test.tsx` (modify), `src/session/session.ts` (modify)

C4's handoff note is the brief for this task; re-read it before starting.

**Design notes**

1. **`checks` becomes `state.prepChecks`, `draft` becomes `state.prepDraft`.** New actions: `TOGGLE_PREP_STEP(index, now)` and `SET_PREP_DRAFT(text)`. `copied` stays local `useState` — it is a 2200ms visual flash, not session state, and the prototype's own `S.copied` is cleared by `restart()` only because it has one global object.
2. **Shape change: `boolean[]` → `Record<number, boolean>`. (Open Question 6, RESOLVED — adopt the Record, but on CORRECTED reasoning.)** C4's local state is `boolean[]`; the prototype's `S.prepChecks` is a sparse `Record<number, boolean>` and the casefile stores it that way (`prepChecks: {...S.prepChecks}`, **2058**).
   **The plan's original justification was circular and must not be repeated:** it said the Record shape is required because "`caseSnapshot`, `checkinOptionsFor` and the stored casefile all already read it" and "Task 2 and Task 3 already assume it". Verified false as stated — **nothing in the current codebase reads `prepChecks` at all**; the only live consumer is `PrepareScreen`'s own local `checks: boolean[]`. Those three readers are being introduced **by this plan's own Tasks 2 and 3**, so citing them as a pre-existing constraint is the plan justifying itself. The conclusion is still right; these are the real reasons:
   - **(a) It is the persisted JSON wire format.** `prepChecks` is written into the casefile and out to `localStorage`, and a `boolean[]` serialises as `[true,false,true]` while a Record serialises as `{"0":true,"2":true}`. C7 migrates these records to the server. **C5 is the chunk that fixes this format once**, and it should land on the prototype's shape — the one any already-stored `nm_case`/`nm_cases` value on a real device is already in.
   - **(b) It decouples tick state from a specific plan's step count.** Clearing `prepChecks` when the diagnosis changes (Task 6) needs no knowledge of the *new* plan's length, and a sparse record never carries a meaningless `false` for a step that does not exist.
   - **(c) Every read site is shape-agnostic anyway** — `prep.steps.filter((_, i) => prepChecks[i])` indexes identically into both — so nothing downstream pays a real cost for the change.
   **Rejected alternative: normalising to a dense array at the storage boundary.** It would need `prep.steps.length` at a layer that must not import playbook data, and it would make the in-session and persisted shapes differ, for no benefit.
3. **`PrepareScreen`'s `done` count must be re-derived, not translated.** Today it is `checks.filter(Boolean).length` (`PrepareScreen.tsx:167`). It becomes **`prep.steps.filter((_, i) => prepChecks[i]).length`** — the prototype's own form (2604, 2907) — **not** `Object.values(prepChecks).filter(Boolean).length`. The difference is real: if a diagnosis change leaves a stale `{3: true}` behind and the new plan has three steps, the `Object.values` form counts a tick for a step that does not exist and can render "4 of 3 done". Indexing through `prep.steps` cannot. Same form in `caseSnapshot`'s `stepsDone` and in `checkinOptionsFor`'s `done`; use one helper if it reads better, but never the `Object.values` form.
4. **`prepDraft` is `string | null`**, where `null` means "the citizen has not edited it" and the textarea shows `prep.draft ?? ''`. This is the prototype's own encoding, and it is what makes the draft reset correctly on an answer change (`S.prepDraft=null`) without needing to know the current plan's template.
5. **The casefile sync** (**3687-3693**): after toggling, if there is an active case that is `still_open` **and whose `engineKey` matches the current screen's engine**, replace it with a fresh `caseSnapshot(engineKey, serviceLabel, S.screen, ...)` — note the prototype passes **`S.screen`** as the `returnScreen`, so ticking a step on the prepare screen makes the casefile return there. The engine-match guard is load-bearing: without it, ticking a passport step while a voter case is active would overwrite the voter case's snapshot with passport data.
   **Deviation D7 applies here too, and this is the more visible of its two sites:** the prototype's `Object.assign(c, caseSnapshot(...))` (**3691**) resets `savedAt` to now, so **every ticked checkbox** pushes the case's "Saved {date}" forward on Home and on the casefile screen. Write it as `{ ...existing, ...caseSnapshot(...), savedAt: existing.savedAt }` and pin it with the test below. (`lastCheck` is a different question and is not touched by a prep tick — the prototype does not stamp it here either.)
6. **The `saveControl` tail** (**3817**): `<SaveControl>` becomes the **last** child of the right column, after "Done, back to Home", with `stepsDone = done`. Delete `PrepareScreen.tsx`'s design note 3 ("the C5 saveControl tail is deliberately absent") — it becomes false in this commit.
7. **Two comments in `PrepareScreen.tsx` become false and must be fixed in the same commit** (C4 handoff): the `useState` block's "Nothing here goes into SessionState" comment and its "this local useState resets on unmount — so Back-then-return loses ticks/draft edits" note. That behaviour gap **closes** in this task: reducer state survives navigation, which is the prototype's actual behaviour. The `src/index.css` prepare-CSS comment saying "not persisted — it's a prototype" becomes false too — fix it.
8. **The `key={d.ruleId}` remount in `App.tsx`** (C4 handoff): with the state lifted, the remount no longer resets anything (there is no local state left to reset except `copied`). **Keep it** — it still correctly discards the copy-flash timer when the diagnosis changes under the screen — but update its comment to say what it is now for. Do not silently drop it.
9. **`session.test.ts`'s field-list assertion** (updated in Task 4) already covers `prepChecks`/`prepDraft`; no further change needed here.

**RED**
- [ ] `TOGGLE_PREP_STEP` flips one index and leaves the rest; toggling twice returns to the original; the previous `prepChecks` object is not mutated.
- [ ] `TOGGLE_PREP_STEP` on a screen whose engine matches the active still-open case re-snapshots that case (assert `stepsDone` on the stored case, and `returnScreen === 'passport-prepare'`).
- [ ] `TOGGLE_PREP_STEP` on a **mismatched** engine leaves the active case untouched.
- [ ] `TOGGLE_PREP_STEP` with no active case is a no-op on `savedCases`.
- [ ] **D7 RED (design note 5):** seed a saved case with a fixed `savedAt`, dispatch `TOGGLE_PREP_STEP` with a far-future `now`, assert `savedAt` is **unchanged** while `stepsDone` **did** update. Comment that a faithful transcription of `togglePrepStep` moves the date, making Home's "Saved {date}" untrue after any tick.
- [ ] **The `done` count is index-based (design note 3):** with `prep.steps.length === 3` and a stale `prepChecks` of `{ 0: true, 3: true }` (index 3 left over from a longer plan), the rendered count is **`1 of 3 done`**, not `2 of 3`. Assertion message names `Object.values(prepChecks).filter(Boolean).length` as the wrong form this test exists to forbid.
- [ ] `SET_PREP_DRAFT` stores the text; `ANSWER` resets it to `null` (already covered in Task 4 — re-assert here through the screen).
- [ ] `PrepareScreen`: ticking a step, navigating away and back (unmount/remount with the same reducer state) **preserves the ticks** — the behaviour gap C4 recorded, now closed. This test fails today.
- [ ] The `saveControl` tail renders after "Done, back to Home", with the ticked-steps label once `done > 0`.
- [ ] Every existing `PrepareScreen.test.tsx` assertion still passes (the file is large — run it whole, do not rewrite it).
- [ ] Run: the new ones fail.

**GREEN**
- [ ] Implement. `PrepareScreen` takes `prepChecks`, `prepDraft` and the two dispatch callbacks as props (keeping it a controlled component that never reaches into the session itself, matching every other template). Run everything.

---

## Task 13 — SIR phase drift, router wiring, persistence effect, coverage sweep

**Files:** `src/session/cases.ts` (extend), `src/templates/CasefileScreen.tsx` (modify), `src/templates/DiagnosisScreen.tsx` (modify), `src/App.tsx` (modify), `src/App.test.tsx` (modify), `src/screens/screenCopy.test.tsx` (modify), `src/screens/interactionGated.ts` (modify), `src/screens/screenCopy.ts` (modify)

### 13a — SIR phase drift

**Design notes**

1. **Where drift is detected:** in `loadCase` (**2168-2169**, under the comment at 2165-2167). A case is drifted when it carries a `sirPhaseId`, the session's `sirState` resolves to a state that is **`sirCoverage(...) === 'covered'`** (deviation D4 — not `.supported`, and guarded against an unknown key), and that state's current `phase.id` differs from the stamped one. The spec: *"A SIR case stamps its phase id at save. On continue/check-in, if the live phase config differs, an interstitial states … and re-diagnoses against the current phase before any options are offered."*
2. **The casefile interstitial** (**2925-2931**) **replaces the whole `.update-mod`** (2932-2959) when `phaseDrift` — this is what "before any options are offered" means mechanically. Same `.update-mod` shell with `border-color:var(--line-strong)`, `.um-kicker` `'Before any update'`, `.um-title` `'The SIR phase changed while this case was saved.'`, the body paragraph, and a primary block button `'Re-check my case against today's phase'` that clears `phaseDrift` and navigates to `'sir-q1'`.
3. **The Diagnosis banner** (**3599**): a plain `<Banner>` with `<b>The SIR phase changed while this case was saved.</b> NextMove re-checked your case against the current phase, so this diagnosis reflects today's rules, not the ones from when you saved.` — rendered when `phaseDrift`, at the seam Task 11 left.
4. **Options whose action window has closed are never offered** (the spec's own words) — this is already structurally true and needs no code: `SIR_Q1_OPTIONS_FOR` is phase-gated, the `'S-6'` check-in is absent from `CHECKIN_PATCHES` by C1's own transcription decision, and `retiredActionFindings` fails the build on a retired-action noun in any scanned copy. **Add a test asserting that the SIR check-in configs' keys are all reachable in the currently configured phase**, so advancing `SIR_STATES.delhi.phase` to `final_roll` makes this go red rather than silently offering a dead option. (Note: `prep.test.ts` already has a sibling assertion that goes red on the same advance; this is the check-in-side counterpart, and it is currently missing.)

**RED**
- [ ] `loadCase` sets `phaseDrift` when the stamped `sirPhaseId` differs from `SIR_STATES.delhi.phase.id`; leaves it `false` when equal; leaves it `false` for passport/voter cases; leaves it `false` (does not throw) for `sirState: 'atlantis'`, `sirState: 'bihar'`, and a missing `sirState`.
- [ ] `CasefileScreen` with `phaseDrift` renders the interstitial and renders **no** option rows and **no** remind row (assert absences — "before any options are offered").
- [ ] The interstitial's CTA clears `phaseDrift` and navigates to `'sir-q1'`.
- [ ] `DiagnosisScreen` with `phaseDrift` renders the banner.
- [ ] Every key in `CHECKIN_META` that belongs to SIR resolves to a rule reachable in `SIR_STATES.delhi.phase.id`, with an assertion message naming the `final_roll` advance as the thing that will break it.
- [ ] Run: all fail.

### 13b — Router, persistence, and the final sweep

**Design notes**

5. **Four new router cases**: `'checkin'` → `<CasefileScreen>` (with the `RestartToHome` guard when `activeCase(state)` is `null` — design note 10 of Task 9); `'dead-end'` → `<DeadEndScreen>` (same guard); `'case-closed'` → `<CaseClosedScreen>`; `'save-done'` → `<SaveDoneScreen>`. The exhaustiveness `default: never` arm makes a missing case a compile error, which is why the `ScreenId` additions landed in Task 4.
6. **The persistence effect.** `useReducer(sessionReducer, initialSession, s => ({ ...s, savedCases: loadCases() }))` for the lazy initial load, and one `useEffect(() => saveCases(state.savedCases), [state.savedCases])` for the write. That is the **only** place `localStorage` is written. Add a test that a save action results in a `nm_cases` write and that a corrupt store does not prevent the app rendering.
7. **`Home` and `CasefileScreen` need `openCheckin` wiring**, and `DiagnosisScreen`/`NextMoveScreen`/`PrepareScreen` need their `onUpdate`/`onSave` props supplied from `App.tsx`.
8. **The coverage sweep.** `screenCopy.test.tsx`'s per-bucket mounts must now include the C5 screens so every new `SCREEN_COPY` entry provably renders. **Note the changed boundary:** check-in option labels and journey-log entry strings are **not** in `SCREEN_COPY` at all (the OQ8 ruling — they live in `domain/` and are swept by `checkinCopyExtras(playbook)` / `casefileCopyExtras()` in Tasks 3 and 2). The mounts still render them, which is right, but the coverage sweep must not expect them among the `ui` bucket's keys. Add to the `ui` bucket mount: a `CasefileScreen` open-variant with a real working case, a `CasefileScreen` closed-`deliverable_received` variant, a `CasefileScreen` closed-`unresolved` variant (for the other headline), a `DeadEndScreen`, a `CaseClosedScreen`, a `SaveDoneScreen` with and without `pendingSave`, a `Home` with one open and one closed case, and a `DiagnosisScreen`/`NextMoveScreen` with the new props supplied.
9. **`CAPTION_TEMPLATES` additions** — every new registered string carrying a `{…}` placeholder: `ui:casefile.prepareCount`, `ui:card.savedPrefix`, `ui:card.next`, `ui:card.steps`, `ui:card.lastUpdate`, `ui:card.checkBack`, `ui:log.showAll`, `ui:log.collapsedOne`, `ui:log.collapsedMany`, `ui:time.daysAgo`, `ui:home.casefilesOne`, `ui:home.casefilesMany`, `ui:casefile.journeyOne`, `ui:casefile.journeyMany`, `ui:casefile.metaSaved`, `ui:casefile.metaStarted`, `ui:casefile.metaCheckBack`, `ui:casefile.metaClosed`, `ui:casefile.reminderLine`. **Each needs its own recorded reason written next to it**, per the set's own doc comment — and for `ui:time.daysAgo` / `ui:log.collapsed*` / the date templates, that reason is Task 8 design note 9 (runtime values computed from the citizen's own record, not sourced claims about a process).
10. **`INTERACTION_GATED` additions** — entries no static mount can produce: the four panel bodies (`confirm`/`valence`/`closureq`/`reassure` prompts and their buttons) are reachable only after a click, as are `ui:casefile.removeConfirm`, `ui:casefile.reminderCopied`, `ui:diagnosis.updateRecorded`/`undoUpdate` (reachable only after a check-in), and `ui:casefile.antiCompulsion`. **Follow the existing mechanism exactly**: `interactionGated.ts` is the single shared source, and each entry gets a matching per-entry assertion in a real interaction test (`CasefileScreen.test.tsx`), whose keys are asserted to equal `[...INTERACTION_GATED]` — the pattern C4 built and a fix round hardened. Do not hand-list the set twice.
11. **Final housekeeping**, all in this task's commit: rewrite `session.ts`'s "ABSENT on purpose" header (Task 4 did the fields; confirm the prose is current), `Home.tsx`'s "ships without casefiles in C3" header, `ladder.ts`'s "`<EscalationLadder>` … deferred to C5" header, `CaseTrail.tsx`'s header if its call sites changed, `src/index.css`'s provenance header (Task 1), `checkinPatches.ts`'s "Deliberately EXCLUDED and left to C5" header, and `PrepareScreen.tsx`'s design note 3 (Task 12). **A provenance comment that lies is worse than none** — `tokens.test.ts` already has a test making exactly that point, and C3/C4 both shipped fix waves for stale comments.

**RED**
- [ ] Router: each of the four new screen ids renders its screen; `'checkin'` and `'dead-end'` with `activeCaseId: null` dispatch `RESTART` and render nothing.
- [ ] A full end-to-end `App` walk: Home → Passport → diagnosis → "Add an update" → the casefile screen → pick an option → confirm → back on the diagnosis screen with the update recorded → Undo → the case restored.
- [ ] A second walk: Next Move → Save this case → save-done → Go to Home → the card is on Home → tap the card → the casefile screen.
- [ ] `nm_cases` is written after a save and read back on a fresh mount.
- [ ] A corrupt `nm_cases` value does not prevent `App` rendering Home.
- [ ] The coverage sweep passes for all four buckets with the new mounts.
- [ ] Run: all fail.

**GREEN**
- [ ] Implement. Then the final gate: `npm test -- --run`, `npm run build`, `npm run lint`, and record the new totals in the task report against the 542 / 52-module / 21.25 kB baseline.

---

## Out of Scope (other chunks' territory — building it here is a defect)

**C6 — Deploy + freshness.**
- `freshBanner(engineKey)` at its **four** seams: `DiagnosisScreen`, `NextMoveScreen`, `PrepareScreen` (all three already commented by C3/C4) and, new in C5, the casefile screen's right column (prototype 2941). C5 adds the fourth comment; it builds none of them.
- `degradedFor()` and the two degrade guards in `checkinOptions` (2606, 2609) — the branch where state-specific options pause and only the universal three remain.
- `renderSirReverifying` (3505) and the `'sir-reverifying'` screen id.
- `SOURCES_VERIFIED` becoming a live value rather than a constant pinned by a test.

**C7 — Auth.**
- `renderSaveCase` / `renderSaveOtp` / `renderSaveName`, `authGoogle` / `authSubmitId` / `authVerifyOtp` / `authResend` / `saveNameFinish` / `maskId` / `signOut`, and the `'save-case'` / `'save-otp'` / `'save-name'` screen ids.
- `S.user`, the `nm_user` store key, `adoptStoredCases()`, the account-scoping gate on `loadCases()` (deviation D2's seam), and the sign-in migration of device-local cases.
- The account chip and popover, `S.acctOpen` / `S.pendingName` / `S.signOutConfirm`, and the `.acct-*` / `.auth-*` / `.btn-google` / `.otp-input` / `.demo-hint` CSS (prototype 662-743).
- **`SaveDoneScreen`'s whole second lede sentence** — *"Nothing else happens with your `{number|account}`"* — both branches of its ternary, restored together when there is an account for it to be true about (the OQ1(b) ruling, Task 10 design note 3).
- **`CaseClosedScreen`'s "stays under 'Closed' on Home" clause for a working case** stays gated off in C5 (Task 10 design note 2); C7 does not change that — it is unsaved-case semantics, not auth.
- The `serviceSquare.ts` persisted-`serviceLabel` fragility (Task 8 design note 1): if a service label is ever reworded, stored casefiles lose their colour square. C7's migration owns the fix.

**Nothing's territory — dead in the lock, deliberately not ported.**
- **`continueSaved(id)` (prototype 2172-2177) and any `CONTINUE_SAVED` reducer action.** Zero call sites in the locked prototype — the only occurrence is its own definition. `renderSaveDone` navigates with `nav(p.returnScreen)` directly (3895) and `caseCard` uses `openCheckin` (3121). The compact-card spec's sentence about `continueSaved` surviving for the "Back to my case" path is **stale relative to what shipped into the lock**, and is not a missing feature. Task 5 design note 7 carries the full reasoning and a `@ts-expect-error` pin.
- **`.saved-actions` / `.saved-continue` / `.saved-remove` CSS** — lifted with the contiguous 744-878 range (Task 1) but styling a button cluster the compact-card spec removed. Lifted, unused, and labelled as such in the provenance header. Not a component to build.

**C8 — Describe-it.**
- `S.caseFacts`, `S.appliedText`, `interpProvenance` on the casefile snapshot; `loadCase`'s restore of them; `S.interp`, `S.fillsReviewed`, `fillDraft()`, `unplaceablePick`, `routeAfterApply`, `renderInterpConfirm` and the `'interp-confirm'` screen id.
- The `.describe-*` / `.read-*` / `.fchip` / `.fill-*` CSS (prototype 881-995).

**Neither this chunk nor any other, by design.**
- A suggested check-in interval, cadence, streak or nudge. The spec forbids it; the PRD §19.5 forbids it; it is the product's central honesty commitment.
- Auto-submission on the citizen's behalf.

---

## Open questions — RESOLVED by plan review (rulings, not open items)

Each question is kept verbatim; the ruling is appended. Nothing here is still open, and none of these needs re-litigating before implementation starts. Where a ruling changed the plan, the task text above already carries the change — these entries are the record of *why*.

**1. `SaveDoneScreen`'s auth-coupled lede tail.** `Nothing else happens with your account.` is what the prototype renders when no user is signed in (its ternary's else branch). In a device-local C5 there *is* no account, so the sentence is vacuous rather than false — but it is confusing, in a product whose thesis is not saying things it cannot back. Options: **(a)** transcribe it as-is with a C7 comment (the plan's default — "never invent copy" outranks "avoid an odd sentence", and C7 makes it true); **(b)** register only the first sentence of the lede and omit the second until C7 (a *subtraction*, not an invention, and arguably the more honest render); **(c)** skip `save-done` entirely in C5 and let `saveControl` flip to its `.saved-note` state in place. (c) is the largest flow deviation and drops the `Back to my case` path, so the plan does not recommend it.

> **RESOLVED — take option (b): subtract the second sentence.** The plan's default understated the harm. *"Nothing else happens with your account"* does not merely go vacuous in a device-local build — a reader takes it as **asserting they have an account**, which is affirmatively misleading, not just odd. And "never invent copy" forbids **authoring**, not **subtracting**: this plan already subtracts freely and deliberately (CSS ranges, snapshot fields, three whole screens). Register only the true first sentence as `UI.saveDone.lede`, and leave a comment naming C7 and recording **both** branches of the original tail (`number` / `account`) so C7 restores it whole. Option (c) is rejected as stated — it drops the "Back to my case" path for no gain. Folded into **Task 10 design note 3**, with a test asserting the omitted sentence is absent so a later reader cannot quietly restore it.

**2. The `CHECKIN_META` / `CHECKIN_PATCHES` zip (Task 3 design note 1).** The plan keeps C1's transcribed payload file untouched and adds a parallel meta table, pairing them by key and index with a structural test. The alternative is folding the labels back into `checkinPatches.ts` (one table, no pairing risk, but it rewrites a file C1 shipped and tested and blurs the "payloads only" line that file's own header draws). Reviewer should confirm the split is the right call — index-alignment between two hand-maintained arrays is a real (if tested) fragility.

> **RESOLVED — keep the split, but the test as originally specified did not close the risk.** Folding the labels into `checkinPatches.ts` would contradict **that file's own shipped header contract**, which explicitly reserves labels/kinds/`prepAware` for C5; rewriting a tested C1 file to undo its own stated boundary is the worse trade. **However**, the proposed structural test (identical key sets + identical per-key array lengths) does **not** catch the failure it exists for: a **reorder within a single key** leaves both key sets and every length untouched. Worked example, from the real table — `'state-5a-p'` (2526-2530) is `[resolved-rung, event, event]`; swapping its two `event` rows in one table only would pair "They responded, but it did not help" with `{fOutcome:'no_response'}`, silently and forever. The length check is replaced by a **full expected-pairs pin**: one `label → { k, patch }` table transcribed once from prototype 2508-2596 into `checkinOptions.test.ts` and asserted key-by-key **and index-by-index**. Folded into **Task 3 design note 1** and its RED list.

**3. Closing an *unsaved* working case leaves no record (Task 7 design note 9).** A citizen who tracks a case without saving, then reports the deliverable, sees the celebration and then has nothing on Home. The prototype does this; the screen does warn ("This casefile lives only in this tab until you save it"). Should C5 auto-save a working case at closure? That would be a real behaviour change (and would create a casefile the citizen never asked for). The plan's default is faithful transcription plus a design-note test.

> **RESOLVED — do not auto-save, but there IS a real fix required, and the plan missed it.** Auto-saving would create a casefile the citizen never asked for and contradict the screen's own "lives only in this tab" warning, which is **informed consent working as intended**. Task 7 design note 9's pin stands unchanged. **But the question was framed as a judgment call when part of it is a plain factual defect:** `CaseClosedScreen`'s lede (**2994**) tells the citizen *"the casefile and its journey stay under 'Closed' on Home if you ever need the record"* — and for a working case that is **affirmatively false**, on a confirmed-reachable path, at the exact moment the record is being dropped by `restart()`. The fix is a **gate, not an invention**, on the same principle as OQ1(b): render that clause only when `!case.unsaved`, and author no replacement. Folded into **Task 10 design note 2** (which previously transcribed the lede unconditionally) with a test on both branches.

**4. Deviation D5 (check-back date on a working case).** The plan makes the control work; the alternative is to hide the control for working cases. Both fix "a control that does nothing"; they differ in whether an unsaved case can carry a reminder that will be adopted on save (`completeSave` already adopts `remindAt` from the working case, which is evidence the prototype *intended* it to work). The plan follows that evidence.

> **RESOLVED — the plan's position is correct; evidence independently confirmed. Make it work; do not hide the control.** Verified in the lock: `setRemind` (2721-2724) searches `S.savedCases` only, so it is a genuine no-op for `activeCaseId === 'working'`; and `completeSave` (2085) reads `working.remindAt`, a value that **can only ever be non-null if the control worked**. Hiding the control would therefore make `completeSave`'s adopt branch permanently dead code — a second defect introduced to hide the first. Recorded on **D5** itself, and Task 7's RED list already carries the pin.

**5. Deviation D1's blast radius.** The plan asserts the prototype's undo is broken on diagnosis-changing check-ins and fixes it. **This is the single most important thing for a reviewer to verify independently** — re-read prototype 2618-2624 (`ciLog` → `ciSnapshotNow`) against 2646-2659 (`ciApplyPatch`'s two `ciLog` calls) and confirm the second snapshot overwrites the first. If the reading is wrong, Task 6's central RED test is wrong with it.

> **RESOLVED — CONFIRMED correct, in both mechanism and reachability, traced against the real code and verified empirically.** `ciLog` (**2621-2627**, not 2618-2624) calls `ciSnapshotNow` on every write; `ciApplyPatch` (**2662-2675**, not 2646-2659) calls it twice on a diagnosis-changing check-in; snapshot #2 overwrites #1. Task 6's central RED test stands as written. **One precision added:** undo *partially* works today — snapshot #2 is taken before the `diagnosed` entry is pushed, so restoring it **does** remove that entry. `answers`, `prepChecks` and the `reported` entry are what fail to roll back. Both **D1** and Task 6's RED bullet now state this, so a partially-passing run is not misread as the deviation being imaginary.

**6. `prepChecks` shape (`Record<number, boolean>` vs C4's `boolean[]`).** The plan adopts the prototype's sparse record because the stored casefile and three other modules already assume it. That means Task 12 changes a shape C4 shipped. Reviewer should confirm this is preferred over normalising the casefile to a dense array at the storage boundary.

> **RESOLVED — adopt `Record<number, boolean>`, but the stated justification was CIRCULAR and has been rewritten.** Verified: **nothing in the current codebase assumes the Record shape** — `prepChecks` appears in no non-test source file at all, and `PrepareScreen`'s local `checks` is a `boolean[]`. The "three other modules already assume it" the plan cited are being introduced **by this plan's own Tasks 2 and 3**. The conclusion survives on real reasons: **(a)** it is the **persisted JSON wire format** the casefile carries into C7's migration (`[true,false,true]` vs `{"0":true,"2":true}`), and C5 is the chunk that fixes that format once; **(b)** it decouples tick state from a specific plan's step count, so clearing on a diagnosis change needs no knowledge of the new plan's length; **(c)** every read site is shape-agnostic (`prep.steps.filter((_,i)=>prepChecks[i])`), so nothing downstream pays. Normalising to a dense array at the storage boundary is rejected: it needs `steps.length` at a layer that must not import playbook data, and makes persisted and in-session shapes differ for no benefit. **Also made explicit, because it is a live miscount risk:** `PrepareScreen`'s `done` becomes `prep.steps.filter((_, i) => prepChecks[i]).length`, **never** `Object.values(prepChecks).filter(Boolean).length` — the latter counts stale indices surviving a plan change and can render "4 of 3 done". All of it folded into **Task 12 design notes 2 and 3**, with a test.

**7. Does the ΔE re-affirmation (Task 1) actually clear?** The plan's ruling is that `--done-bg` and `--wait-bg` at ΔE ≈ 2.8 are acceptable because they never co-occur on a comparable surface and each carries a distinct text label. That is a judgment, made without seeing the two rendered together. If a reviewer wants it re-measured against the *rendered* casefile screen rather than argued from the token pair, say so — it is a one-screen visual check, and the current exemption was written for an unmounted component.

> **RESOLVED — the exemption clears; no rendered re-measurement gates Task 1.** The ΔE floor is a **self-imposed project standard for classification surfaces**, not a WCAG requirement, and the binding accessibility rule (**1.4.1 — colour is never the sole carrier**) is independently satisfied: the stamp reads `WAIT`, the rung tag reads `Done`. **One factual claim in the exemption's own comment is wrong and must be corrected rather than carried forward:** the two **do** co-occur, on the same screen and in the same column — a `state-5b-p` WAIT case renders the stamp above a ladder with earlier rungs marked `Done`. The honest wording is **"same screen, never the same surface or size, each labelled"**, not "different block". Folded into **Task 1**'s re-affirmation bullet; a one-screen visual confirmation is added as a **Task 9 acceptance note**, explicitly not a gate.

**8. Journey-log entry text is citizen-facing copy that the reducer writes.** Strings like `'Checked in — no change reported'`, `' — rejected'` and `' — deliverable still pending'` are composed in `cases.ts` (a `session/` module), not in `screenCopy.ts`. The plan puts them in `screenCopy.ts` under `UI.log.*` / `UI.casefile.*` and has `cases.ts` import them — which means a `session/` module importing from `screens/`. That is the correct direction for a single-copy-definition-site rule but is a new import direction in this codebase. Reviewer should confirm, or nominate a `domain/`-level copy module instead.

> **RESOLVED — put it in `domain/`, not `screenCopy.ts` — and the SAME ruling applies to Task 3's universal check-in labels.** Verified: `src/session/` currently imports **only** from `domain/` and `playbooks/` (`session.ts`'s three imports). Routing journey-log copy through `screens/` inverts that layering and risks a real import cycle the moment `screenCopy.ts` needs a type from `session/` — plausible, since several C5 copy maps are service-keyed and want `ServiceKey`. Journey-log text is **data-shaped copy attached to a persisted record**, not rendered chrome — the same class this plan's own Global Constraint already routes to `domain/`, matching `prep.ts`'s `PREP` map. Entry strings go next to `JourneyEntry` in **`src/domain/casefile.ts`** as `LOG_COPY`, swept by a `casefileCopyExtras()` shaped like `prepCopyExtras`. **The identical reasoning closes what Task 3 was about to do:** its design note 7 put the four universal option labels in `screenCopy.ts`, which would have been the codebase's **first `domain/ → screens/` import**, for four strings that are rows in the same option list as the per-state labels beside them. They move to `checkinOptions.ts`. Both folded into the **Global Constraints**, **Task 2 design note 3** and **Task 3 design note 7**.

---

### One further correction from the review, recorded here because it is not scoped to any single task

**Every line-number citation in the 2044-2200 and 2618-2745 ranges was wrong**, by roughly 6-20 lines, and the `sed -n '2734,2745p'` extraction silently missed `closeUnresolved` and `fmtDay`. Every citation in this document has since been re-derived mechanically against the committed file, including the `renderCheckin` sub-ranges the review's own spot-check did not cover (2836-2876, 2879-2883, 2884-2901, 2902-2969, 2916-2919, 2932-2959, 2953-2956, 2960-2963, 2964-2967). The blanket "re-confirmed at plan time" claim at the top of this plan has been softened to say so. **Re-derive before citing; the file wins.**
