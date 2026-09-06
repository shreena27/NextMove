# C4 — Prepare + Visit Cards + Official-Channel Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the locked prototype's "Prepare this for me" screen into the real codebase — the per-rule prep plan data, the official-channel card, the editable draft with its live blank-count and Copy control, the tick-off step checklist, and the in-person visit card — chunk C4 of `NextMove_Implementation_Plan_FINAL.md` ("Prepare + visit cards + official-channel cards").

**Architecture:** C4 is one new data module plus one new screen plus five lines of router wiring. It consumes C1's engine (`diagnose`) and `Diagnosis` type, C2's playbooks and guardrail harness, and C3's `NextMoveScreen` seam (`hasPrepPlan` / `onPrepare`), `Split`, `PhaseEyebrow`, `Button`, `ICONS`, `screenCopy.ts` and lifted CSS — all **unchanged**. No new engine logic, no new rule content, no `if` statement about a government or ECI process in a component. The design authority for every string, class name and markup structure is the locked prototype `design/nextmove-v1-prototype.html` at git tag `v1-design-lock-2` (commit `91ff7a1`). **Nothing in this chunk is authored: every step, draft, carry item, label and disclaimer is a transcription.** Extract it programmatically, never by eye:

```bash
git show 91ff7a1:design/nextmove-v1-prototype.html | sed -n '1518,1544p'   # PREP header comment + VISIT_EXPECT
git show 91ff7a1:design/nextmove-v1-prototype.html | sed -n '1546,1730p'   # the PREP map, all 10 entries
git show 91ff7a1:design/nextmove-v1-prototype.html | sed -n '3685,3745p'   # togglePrepStep / bracketCount / bracketHintText / copyDraft
git show 91ff7a1:design/nextmove-v1-prototype.html | sed -n '3746,3820p'   # renderPrepare — the screen composition
git show 91ff7a1:design/nextmove-v1-prototype.html | sed -n '533,561p'     # prepare CSS, part 1
git show 91ff7a1:design/nextmove-v1-prototype.html | sed -n '569,646p'     # prepare CSS, part 2 (562-568 is C5's)
```

Line numbers above were re-confirmed against the committed file at plan time (2026-09-06) and again at fix-pass time: the PREP header comment opens on **1518** (1516 is the previous object's `};`, 1517 is blank), `VISIT_EXPECT` at 1539-1544, `PREP` at 1546-1730 (closing `};` on 1730), `renderPrepare` at 3746-3820, prepare CSS at 533-646. Confirm again before citing them in a commit message; if they have drifted, `grep -n "const PREP = {"` and re-derive.

**Tech Stack:** React 19 + TypeScript (strict) + Vite, Vitest + jsdom + React Testing Library. No new dependencies.

**Baseline (measured at plan time, worktree `.worktrees/c4-prepare`, branch `c4-prepare` off `master` @ `03fdce2`):**
- `npm test -- --run` → **484 passing, 29 test files, 0 failing.**
- `npm run build` (`tsc -b && vite build`) → green, 50 modules, `dist/assets/index-*.css` 16.56 kB.
- `npm run lint` (oxlint) → exit 0, **4 pre-existing `react(only-export-components)` warnings** (`CaseTrail.tsx:58`, `PassportRecovery.tsx:33/39/49`). C4 must not add a fifth and must not "fix" these four — they are C3's recorded state.

---

## Global Constraints

Carried forward from C1, C2 and C3 (still binding), plus C4-specific additions.

- **Never invent copy or markup.** Every step string, draft template, carry item, label and disclaimer sentence is transcribed byte-for-byte from the locked prototype at the line ranges each task names. If a transcription looks wrong, stop and raise it — do not "improve" it. In particular: do not normalise the prototype's curly apostrophes, do not re-wrap its draft templates' blank lines, and do not "fix" `[bracket]` placeholder spellings — the bracket text is what the user is told to fill in.
- **A declared guardrail without an executable test is a defect** (standing project rule). Every guardrail this chunk claims ships with a test that fails when the guardrail is violated.
- **Government-process rules never live in components.** `PrepareScreen` receives a `Diagnosis` and a `PrepPlan` and renders them. The only permitted branching is *structural*: does this plan carry a `draft`? a `doneNote`? a `visit`? does this step object carry a `url`? does this rule's `where` carry a `phone`/`url`? Never *substantive*.
- **C4 extends the guardrail input; it does not fork the harness.** `guardrailFindings(playbook, { extra })` takes any `{at, text}[]`; C4's prep copy joins the same scan (Task 1). Every location carries a mandatory `serviceId:` (or `ui:`) prefix, like every other `CopyString.at`.
- **The guardrail-isolation rule still binds** (`src/playbooks/guardrails/isolation.test.ts`): no non-test file under `src/` may import anything from `src/playbooks/guardrails/`, or import `node:fs` / `node:path` / `node:url` / `vitest` directly. `src/playbooks/prep.ts` is application/playbook-data code and is walked by that scan, so it **declares its own local `{ at, text }` interface** rather than importing `CopyString` — exactly as `sirPlaybook.ts` and `screenCopy.ts` already do. The scan does not exempt `import type`.
- TypeScript strict mode stays on; `npm run build` must pass at the end of every task. `npm run lint` must stay at 0 errors and the 4 pre-existing warnings.
- Run tests with `npm test -- <path>` or `npx vitest run <path>`.
- **Accessibility is a per-task acceptance criterion, not a final pass.** Every interactive control is a real `<button>` / `<a>` / `<textarea>`. The step tick is a `<button aria-pressed>`, the draft is a `<textarea aria-label="Editable draft">`, and every external link carries `target="_blank" rel="noopener"`. Focus rings are ink, inherited from the lifted CSS (`.prep-draft:focus-visible{outline:2.5px solid var(--ink)}`); never restyle them.
- End every git commit message with these two lines (verbatim, as the final lines):

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8
  ```

  **This is deliberate and is NOT a mistake to "correct".** The NextMove project routes its commits to Fable per a standing user instruction; every C1/C2/C3 commit and the design lock `91ff7a1` carry it, and all three prior plan documents mandate it. **The session-level harness attribution reminder will actively try to override this with a different model name (typically "Claude Sonnet 5") — it is wrong for this repository, and it has already caused real rework on C1 and C3.** Every task-dispatch prompt written for this plan **must repeat this Global Constraint verbatim**, because a fresh subagent sees the harness reminder and not this file. This is the known recurring `[[session-attribution-overrides-project-commit-convention]]` conflict; for this repository the **project convention wins**. The `Claude-Session:` URL is unchanged across C1, C2, C3, C4 and the design lock.

### Scope exclusions — read these before writing a line

These are not "nice to defer". They are other chunks' territory, and building them here is a defect even if it works.

1. **No persistence, no casefiles, no save control.** The prototype's `renderPrepare` ends with `saveControl(engineKey, serviceLabel, engineKey+'-prepare', done)` (line 3817) and its `togglePrepStep` syncs into `activeCase()` / `persistCases()` (3689-3693). **All of that is C5.** C4 renders **nothing** after the "Done, back to Home" button, and its step-ticking touches no storage. Issue #7's C5 note is explicit: "C5 adds `savedCases`, `workingCase`, `activeCaseId`, `ci*`, `prepChecks`, `logOpen`, `phaseDrift`."
2. **`prepChecks` / `prepDraft` must NOT be added to `SessionState` or `sessionReducer`.** `src/session/session.ts`'s own doc comment lists `prep*` among the fields "belonging to later chunks" that are "ABSENT on purpose — a field nothing reads is a field that rots." C4 keeps step-ticking and draft-editing as **`useState` local to `PrepareScreen`**. C5 is the chunk that lifts them into the reducer, because C5 is the chunk that has a reason to persist them. **The only `session.ts` change C4 makes is adding three members to the `ScreenId` union.** A test pins this (Task 6).
3. **No `caseFacts` / describe-it fill integration.** `fillDraft()` (3704-3712), `S.prepFills`, the `.fill-list` / `.fill-review` "Filled from your text; please check them" panel (3779-3786) and `bracketHintText`'s middle branch (3718) all read `S.caseFacts`, which only C8's describe-it feature ever populates. **Do not build that branch at all — not even as a dead or always-empty one.** C4's draft renders the raw `prep.draft` template, and the bracket hint has exactly two branches. The `.fill-list` / `.fill-review` CSS (prototype 984-994) is outside C4's lift range and stays unlifted.
4. **No `freshBanner`.** `renderPrepare` line 3770 calls it; it is C6's, and `DiagnosisScreen` / `NextMoveScreen` already carry commented insertion points for the same reason.
5. **`hasPrepPlan` / `onPrepare` is already built and tested — extend it, do not restructure it.** `NextMoveScreen.tsx`'s design note 2 and its tests (`NextMoveScreen.test.tsx:131-164`, the whole `'the prepare CTA seam (C4)'` describe block — re-verified at fix-pass time) pin both branches. C4 changes **no line** of `NextMoveScreen.tsx`; it only starts passing the two props from `App.tsx`.
6. **"Done, back to Home" dispatches the existing `RESTART` action**, mirroring `NextMoveScreen`'s own "Back to Home" (design note 3) and the prototype's `onclick="restart()"` (3816). Never a `NAVIGATE` to `'home'` — that would leave stale answers in session state.
7. **`screenCopy.ts` is the single copy-definition site.** Every fixed UI string this screen renders is added there and imported; no citizen-facing literal is inlined in a component. Rule-sourced text (anything reached through `Diagnosis`) and prep-plan text (anything reached through `PrepPlan`) are **not** in `screenCopy.ts` — they are data, scanned at their own locations.

---

## File Structure

```
sources/
  manifest.json                     (MODIFY — Task 1: three sourced_dates allowed_in additions only)
src/
  index.css                         (APPEND — Task 2: prototype lines 533-561 + 569-646)
  ui/
    tokens.test.ts                  (MODIFY — Task 2: CSS-fidelity assertions for the appended block)
  playbooks/
    prep.ts                         (NEW — Task 1: PrepPlan/PrepStep types, PREP, VISIT_EXPECT,
                                     prepPlanFor(), prepCopyExtras(), visitExpectCopy().
                                     Plain playbook DATA — declares its own local {at,text}
                                     interface, imports nothing from guardrails/)
    prep.test.ts                    (NEW — Task 1: prep-scoped guardrail sweep + structural
                                     invariants. Does NOT re-run the whole-project stale-exemption
                                     sweep — that lives in engines.test.ts, see Task 1 design note 5a)
    engines.test.ts                 (MODIFY — Task 1: the ONE whole-project stale-exemption sweep
                                     at :175 gains prep + VISIT_EXPECT strings, or the three new
                                     exemption rows report as stale and it goes red)
    guardrails/
      contentSafety.ts              (MODIFY — Task 1: three new SAFETY_EXEMPTIONS rows, and
                                     retiredActionFindings() gains an `extra` parameter)
      suite.ts                      (MODIFY — Task 1: pass options.extra to retiredActionFindings)
  screens/
    screenCopy.ts                   (MODIFY — Tasks 3/4/5: UI.phase.prepare + the UI.prepare tree)
    screenCopy.test.tsx             (MODIFY — Task 6: PrepareScreen joins the `ui` coverage mount;
                                     CAPTION_TEMPLATES gains the six {n}/{phone}/{done} templates;
                                     a new INTERACTION_GATED set records the five entries a static
                                     mount cannot reach)
  templates/
    PrepareScreen.tsx               (NEW — Tasks 3/4/5: the whole screen. Lives beside
                                     DiagnosisScreen/NextMoveScreen — it is the third
                                     service-agnostic template all three services render through)
    PrepareScreen.test.tsx          (NEW — Tasks 3/4/5)
  session/
    session.ts                      (MODIFY — Task 6: three ScreenId members, nothing else)
  App.tsx                           (MODIFY — Task 6: three router cases + hasPrepPlan/onPrepare
                                     on the three existing *-nextmove cases + the no-plan guard)
  App.test.tsx                      (MODIFY — Task 6: end-to-end Next Move -> Prepare -> Home)
```

**Untouched by C4:** `src/domain/`, `src/playbooks/*Playbook.ts`, `src/playbooks/engines.ts`, `src/ui/` (except `tokens.test.ts`'s new assertions), and every existing file in `src/templates/` — C4 **adds** `PrepareScreen.tsx` / `PrepareScreen.test.tsx` there but edits no line of `DiagnosisScreen.tsx`, `NextMoveScreen.tsx`, `ladder.ts` or their tests. If a task appears to need a change beyond that, stop and raise it.

**Why `src/templates/` and not a new `src/screens/prepare/`.** `src/templates/` is where this codebase already keeps the service-agnostic screens all three services render through — `DiagnosisScreen` and `NextMoveScreen` both live there, both take `{ serviceLabel, engineKey, d, … }`, and `PrepareScreen` is the third member of exactly that family. `src/screens/` holds the service-*specific* screens and `screenCopy.ts`. Inventing a `src/screens/prepare/` directory for one service-agnostic component would split the family across two conventions for no gain. (This is separate from `prep.ts`'s own placement in `src/playbooks/`, which is about the *data* module and is settled in Task 1 design note 1.)

**`sources/manifest.json` IS touched, and that is unusual enough to call out.** C3's plan said `sources/` was untouched by C3; C4 must add five `allowed_in` entries across three `sourced_dates` keys. **No new date, source, interval or document is added** — only new *locations* for dates that are already sourced and already shipped elsewhere. See Task 1 design note 4.

---

### Task 1: `PrepPlan` type, the PREP data port, and the content-safety extension

**Files:**
- Create: `src/playbooks/prep.ts`, `src/playbooks/prep.test.ts`
- Modify: `src/playbooks/guardrails/contentSafety.ts` (three SAFETY_EXEMPTIONS rows + an `extra` parameter on `retiredActionFindings`), `src/playbooks/guardrails/suite.ts` (pass `options.extra` through), `src/playbooks/engines.test.ts` (the whole-project stale-exemption sweep), `sources/manifest.json` (allowed_in + one meaning amendment)

**Interfaces:**
- Consumes: `Diagnosis`, `Playbook` (`src/domain/types.ts`).
- Produces: `PrepStep`, `PrepPlan`, `PrepVisit`, `PREP`, `VISIT_EXPECT`, `prepPlanFor`, `prepCopyExtras`, `visitExpectCopy`.

**Design notes:**

1. **Where this lives, and why it is `src/playbooks/`, not `src/screens/`.** The PREP map is keyed by playbook rule id, its strings name official channels and verified requirements, and it must pass the same §7 content-safety scan as rule copy. That makes it **playbook data**, not screen chrome. `src/playbooks/sirPlaybook.ts` is the exact precedent: it is playbook data that ships a `CopyLocation` interface of its own and a `sirCopyExtras()` flattener consumed by a test. `prep.ts` copies that shape line for line. Putting it in `src/screens/` would have made `screenCopy.ts` (authored chrome) and prep content (rule-keyed process content) share a definition site, which is exactly the conflation issue #7's "single copy-definition site" note is guarding against.

2. **The shape, transcribed from the map's actual contents — not invented.** All 10 entries were read directly (prototype 1546-1730) and the union of their fields is:

   ```ts
   /** A step is either a bare instruction or an instruction with an official
    *  URL to open in a new tab. The prototype stores the bare form as a plain
    *  string (`typeof s === 'string' ? {text:s} : s`, line 3791); this port
    *  keeps that union rather than normalising, so the data file stays a
    *  byte-faithful transcription and a reviewer can diff it against the lock. */
   export type PrepStep = string | { text: string; url: string }

   export interface PrepVisit {
     /** Rule-SPECIFIC, verified carry items. Never merged with VISIT_EXPECT. */
     carry: string[]
     /** Optional "Then what?" line. */
     after?: string
   }

   export interface PrepPlan {
     /** Absent on the three SIR entries (`s-notice`, `s-roll-absent`,
      *  `s-roll-unchecked`) — the screen falls back to
      *  UI.prepare.headlineFallback, exactly as the prototype does (3766). */
     title?: string
     /** Absent on the same three SIR entries (`s-notice`, `s-roll-absent`,
      *  `s-roll-unchecked`): those plans are checklists with nothing to
      *  draft, and the lede changes to match (3767). Measured: the
      *  title-less set and the draft-less set are the same three. */
     draft?: string
     steps: PrepStep[]
     doneNote?: string
     visit?: PrepVisit
   }

   export const PREP: Record<string, PrepPlan> = { /* 10 entries, verbatim */ }
   ```

   **`Record<string, PrepPlan>`, not a closed union of rule ids.** A `Record<RuleId, ...>` would require exporting a rule-id union from the three playbooks, which C4 is not allowed to touch. The completeness invariant is enforced by test instead (design note 5), which is stronger anyway: it checks against the *shipped rules*, not against a hand-written list.

3. **Exactly 10 entries; the map is not sparse by accident.** `state-5a`, `state-5b`, `state-4`, `state-3`, `state-2`, `v-3`, `v-5`, `s-notice`, `s-roll-absent`, `s-roll-unchecked`. The prototype's own header comment (1532-1535) states the rule: *"Keyed by rule id; WAIT and UNCLASSIFIED states have no entry — there is nothing to prepare, so the CTA doesn't appear (fixes the old incoherence of 'Nothing to do right now' followed by 'Prepare this for me')."* Also transcribe the `// 's-duplicate' prep moved to sirDormantRules_enumeration (phase-retired).` comment at line 1710 — it records a real retirement decision and `s-duplicate` is correctly not a shipped rule.

4. **Five sourced dates in the SIR prep copy need `allowed_in` entries. This is the only `sources/manifest.json` change, and it adds no new sourced value.** Measured at plan time by running `numericFindings`' own `DATE_RE` over prototype lines 1539-1730:

   | prep location | date | already sourced as |
   |---|---|---|
   | `sir:PREP.s-notice.steps[3]` | `29 Oct 2026` | `sourced_dates["29 Oct"]` |
   | `sir:PREP.s-roll-absent.steps[2]` | `30 Sep 2026` | `sourced_dates["30 Sep"]` |
   | `sir:PREP.s-roll-absent.visit.after` | `4 Nov 2026` | `sourced_dates["4 Nov"]` |
   | `sir:PREP.s-roll-unchecked.steps[2]` | `4 Nov 2026` | `sourced_dates["4 Nov"]` |
   | `sir:PREP.s-roll-unchecked.steps[3]` | `30 Sep 2026` | `sourced_dates["30 Sep"]` |

   Append each `at` string to the matching entry's `allowed_in` array. Add **no** `sourced_dates` key, **no** `sourced_intervals` key, **no** `documents` entry, and change **no** `meaning`, `locator`, `source_form` or `year` — except the one documented `meaning` amendment below. No test pins `allowed_in` contents (checked: nothing outside `contentSafety.ts` reads the field), so these additions are safe, but they are also the reason this task must be reviewed by someone who reads the manifest's `meaning` text, not just the diff shape.

   **The `29 Oct` addition needs a recorded ruling, because the manifest forbids one reading of it.** `sourced_dates["29 Oct"].meaning` currently says: *"THE ERO'S disposal deadline, not the citizen's. May only describe the phase's own end; may never appear in an instruction to file."* The prep step in question is:

   > `"Act promptly: your notice's own instructions control the timing (Delhi's notice/disposal phase itself runs through 29 Oct 2026)."`

   That string **is** a step in a checklist, so it is an instruction — but the instruction it gives is *"act promptly, per your own notice"*, and the date appears only in a parenthetical describing the phase's own end. That is not a reading of the manifest; it is the exact form the manifest already sanctioned. Commit **`2958d37`** (*"Chunk 1: correct SIR filing deadlines, retire S-6, add freshness model"*) is the deliberate remediation that produced this step: it replaced an older *"submit before 29 Oct"* filing instruction with the current wording, and the manifest's own `s-notice` note records the outcome verbatim — *"Per grill A11: state the sourced facts (notice/disposal phase runs to 29.10; respond per your notice), drop the invented deadline instruction. RESOLVED 2026-09-05: prototype copy corrected (30 Sep filing deadline; s-notice instruction dropped) — commit 2958d37."* The prep step is that sanctioned target form, ported.

   **Ruling: allow it, and amend the `meaning` as a per-`at` allowlist entry — not as a class-level permission for "prep steps".** Append to `sourced_dates["29 Oct"].meaning`, verbatim:

   > *"One prep location is allow-listed — `sir:PREP.s-notice.steps[3]` — where the step's own instruction defers to the citizen's notice and the date names only the phase's own end. This is the form grill A11 sanctioned and commit `2958d37` applied. Any other prep location needs the same review."*

   Word it exactly that way. A blanket *"a prep step may cite it descriptively"* would hand every future prep step a standing permission that nobody re-reviews; naming the one `at` keeps the next author at the same gate this one passed through. Amending the `meaning` rather than quietly widening `allowed_in` is the same point one level up: the next person to read that entry sees the carve-out, not just a longer list.

   **`30 Sep` does not conflict.** Its `meaning` says *"Anything the citizen must file cites this, never 29 Oct."* That rule governs **claims and objections** — the things a citizen files on their own initiative. `s-notice` is a *response to a notice already served*, not a claim or objection, so its step cites neither date as a filing deadline and defers timing to the notice itself. No amendment to `30 Sep` is needed; record this sentence in the Task 1 commit message so the non-conflict is on the record rather than re-derived.

   **If a reviewer disagrees, the correct fix is to raise it as a design finding against the locked prototype — never to reword the locked step to dodge the scanner.**

5. **Three new `SAFETY_EXEMPTIONS` rows, all against the `causal` pattern, all real false positives.** Measured at plan time by running `BANNED_PATTERNS` over the same range: the causal row (`/\b(because|due to|caused by|the reason is|since your|as your)\b/i`) is the only pattern that fires anywhere in PREP, and it fires exactly three times.

   - `passport:PREP.state-4.steps[2]` — *"Use the draft above as your message or call script. Fill every [bracket] first."* **"as your" here is possessive, not causal** — identical in kind to the existing `sir:s-notice.whatToDo` exemption for "as your notice directs".
   - `voter:PREP.v-3.draft` — *"…which I wish to appeal because [why you disagree — what you believe is incorrect]."*
   - `voter:PREP.v-5.draft` — *"I remain aggrieved because [why the decision doesn't resolve your case]…"*

   The two draft exemptions are a **new category** and must be reasoned on the record, not lumped in with the possessive one. The causal pattern exists so that *NextMove* never asserts a cause for an adverse finding.

   **The load-bearing condition is the unfilled `[bracket]`, not the first-person voice.** Write each row's `reason` that way round. First-person voice alone is a real loophole: *"I was refused because the officer was biased"* is first-person and still asserts a specific cause NextMove has no source for. What makes these two safe is that the clause after `because` is an **empty bracket the citizen fills in** — NextMove ships a sentence *frame* and asserts nothing. First-person voice is a supporting observation (it establishes that the finished sentence will be the citizen's own claim, not NextMove's), never the justification on its own.

   Suggested `reason` shape for both draft rows, adapted per row: *"Citizen-voiced draft letter. The clause after `because` is an unfilled `[bracket]` the citizen supplies, so NextMove ships a sentence frame and asserts no cause. First-person voice supports this but is not the test — a first-person sentence naming a specific cause would still violate §7. Pinned by prep.test.ts's `DRAFT_CAUSAL_EXEMPTIONS` check, which fails if the bracket is ever filled in."*

   Keep `BANNED_PATTERNS` byte-faithful — the project's standing rule is that the pattern stays and the exemption is the recorded deviation. Do **not** reword the locked draft copy.

   `staleExemptionFindings()` will police these three: if a prep string is ever edited so its named pattern stops matching, the build fails and the dead permission must be removed. And because the exemptions' *reasoning* is now a stated criterion, Step 1's `DRAFT_CAUSAL_EXEMPTIONS` test makes that criterion executable — a declared guardrail without an executable test is a defect (Global Constraints).

5a. **Adding these three rows breaks an existing test, and the fix is in `engines.test.ts`, not a second sweep.** `staleExemptionFindings` reports a finding whenever an exemption's `at` is absent from the string set it is handed. `src/playbooks/engines.test.ts:175` (`'every safety exemption still earns its place across all three playbooks'`) is **the only call site that sees every exemption location** — it is the whole-project sweep, and it already concatenates `sirCopyExtras()` and `ladderDefStrings('passport'|'voter')` for exactly this reason. The moment Task 1 adds `passport:PREP.state-4.steps[2]`, `voter:PREP.v-3.draft` and `voter:PREP.v-5.draft`, those three `at`s are in no set that test knows about and it goes red.

   **Fix: extend that one sweep; do not duplicate it in `prep.test.ts`.** In `engines.test.ts`, the `all` array becomes:

   ```ts
   const all = ALL.flatMap(p => copyStrings(p))
     .concat(sirCopyExtras())
     .concat(ladderDefStrings('passport'))
     .concat(ladderDefStrings('voter'))
     .concat(ALL.flatMap(prepCopyExtras))
     .concat(visitExpectCopy('sir'))
   ```

   with `import { prepCopyExtras, visitExpectCopy } from './prep'` added at the top. A copy of this sweep inside `prep.test.ts` would be **wrong in the opposite direction**: `prep.test.ts` has no reason to import `ladderDefStrings`, so the two pre-existing `LADDER_DEFS.*.caption` exemptions would report as stale there. One project-wide sweep, one place. If a local canary in `prep.test.ts` is still wanted, it must filter to prep-owned `at`s the way `passportPlaybook.test.ts:160-165` filters to its own — not run unfiltered.

6. **Two structural guardrails worth having, both measured as already true, both cheap.** These are C4's own contribution to the harness input and each gets a named test:
   - **Every PREP step URL is a URL some shipped playbook rule already routes to.** Measured: PREP's step URLs are exactly `{https://www.passportindia.gov.in/psp/Grievance, https://dpg.gov.in, https://www.passportindia.gov.in, https://voters.eci.gov.in}`, and the union of every shipped `where.url` across the three playbooks is exactly the same four. A prep step is an instruction to *go somewhere*; this test makes it structurally impossible for a prep step to send a citizen to a destination no verified rule vouches for.
   - **Every phone number appearing in PREP text is a phone some shipped `where.phone` already carries.** Measured: PREP mentions `1800-258-1800` (4 times) and `1950` (once); the shipped `where.phone` values are `1800-258-1800` (`passport:state-5a` **and** the passport fallback) and `1950` (the voter and SIR fallbacks).

     **The extraction regex in the first draft of this plan never checked `1950` — the number it claims to check.** Re-measured over the real `JSON.stringify(PREP)`: `/\b\d[\d\s-]{6,}\d\b/g` requires at least 8 characters and returns **only** the four `1800-258-1800` matches. `1950` is silently unscanned, so the guardrail passes without ever looking at half the numbers it names. A naive widening to `\b\d{4}\b` then false-matches `2026` — which appears **five** times, once in each of the five sourced dates from design note 4.

     **Fix — extract with a shape that covers both forms, then subtract the date years:**

     ```ts
     const NOT_PHONES = new Set(['2026'])   // sourced YEARS, already cleared by numericFindings'
                                            // DATE_RE pass — see design note 4's table
     const found = [...JSON.stringify(PREP).matchAll(/\b\d[\d\s-]{6,}\d\b|\b\d{4}\b/g)]
       .map(m => m[0].trim())
       .filter(t => !NOT_PHONES.has(t))
     ```

     Then set-compare `found` against `shippedPhones`, and **assert `found` contains `'1950'`** so the test can never silently regress to finding only the long form. (Filtering tokens that overlap a `DATE_RE` match is the more general alternative and is equally acceptable; the explicit `NOT_PHONES` set with a comment is preferred here because there is exactly one such token and the reason it is exempt — it is a sourced year, and `numericFindings` already owns it — is worth stating in one line rather than reconstructing from an overlap computation.)

     **The shipped set must be built from `playbook.rules` AND `playbook.fallback` — not rules alone.** `passport:state-5a` carries `where.phone: '1800-258-1800'`, but the three fallbacks are where `1950` lives, and a rules-only `shippedPhones` would be missing it entirely. The same applies to `shippedUrls` for symmetry, though there it changes nothing — the four PREP step URLs are all covered by rule-level `where.url`s.

7. **Completeness, with two named, currently-unreachable exceptions.** The intended invariant is *"a rule the citizen can act on has a prep plan; a rule with nothing to do does not."* Computed at plan time over all 28 shipped rules (re-measured at fix-pass time):
   - Every `WAIT` and every `UNCLASSIFIED` fallback has **no** PREP entry. ✅ That is **19 rules**: 16 `WAIT` (passport 7, voter 5, sir 4) plus the 3 `UNCLASSIFIED` fallbacks. (28 total rules, 12 actionable, 10 PREP entries — those three figures were right; the earlier "18" sub-count was not.)
   - Every `FOLLOW_UP` / `ESCALATE` rule has a PREP entry — **except two**: `sir:s-final-absent` (ESCALATE) and `sir:s-final-unchecked` (FOLLOW_UP). 12 actionable − 2 = the 10 shipped plans.

   Those two are the `final_roll`-phase SIR rules. They are **unreachable today**: their conditions match `sirQ1 === 'final_absent' / 'final_unchecked'`, which only `SIR_Q1_OPTIONS_FOR.final_roll` offers, and the only supported state (`SIR_STATES.delhi`) is configured to `SIR_PHASES.claims_notice`. The locked prototype has no PREP entry for them either, so **C4 ports the gap faithfully and pins it, rather than inventing prep content for two dormant rules** (which would be authored copy — forbidden).

   **Be precise about which of the two tests a phase advance breaks — they are not symmetrical.**
   - `'every actionable rule has a prep plan, except the two recorded dormant ones'` computes purely from static rule/PREP data. A phase advance changes **neither**, so this test keeps passing. It guards the *list*, not the excuse.
   - `'the recorded exceptions are only reachable in a phase no supported state is in'` reads `SIR_STATES`' configured phase. **This is the one that goes red on a phase advance**, and it is the entire early-warning mechanism.

   Because `sirPlaybook.ts`'s own comment describes a phase advance as *"a one-line config change touching no engine code,"* someone will trip this without realising prep content is a prerequisite. Give that test an inline assertion message that names both rule ids and says so outright — see Step 1. Record it in the handoff notes too.

8. **Extend `retiredActionFindings` with the prep copy — `contentSafety.ts` names C4 as the chunk that must.** Its `RETIRED_ACTIONS` doc comment says verbatim: *"C4 (prepare steps) and C5 (check-in labels) EXTEND this scan's input; they must not fork the harness."* Today `retiredActionFindings(playbook, currentPhaseId)` takes no `extra`, and `suite.ts:25` calls it without `options.extra` — so C4's prep copy would get banned-pattern and numeric coverage but **zero retired-action coverage**, even though prep steps are literally instructions to act, which is the one thing that scan exists to police.

   The change is two lines plus a test:

   ```ts
   // contentSafety.ts
   export function retiredActionFindings(
     playbook: Playbook, currentPhaseId: string, extra: CopyString[] = [],
   ): string[] { /* …existing rule/ACTION_FIELDS loop, then the same test over `extra` */ }

   // suite.ts:25
   ...retiredActionFindings(playbook, options.currentPhaseId ?? 'none', options.extra ?? []),
   ```

   Scan each `extra` entry's `text` with the same `entry.action` regex and report at its own `at`. The default `[]` keeps every existing call site behaviour-identical, so this is additive, not a signature break. **Positive control required** (a guardrail with no failing case is not a guardrail): a synthetic `{ at: 'sir:PREP.toy.steps[0]', text: 'File the Enumeration Form.' }` scanned under `currentPhaseId: 'claims_notice'` must produce exactly one finding. Real PREP copy produces none — measured, no prep string mentions the Enumeration Form.

9. **The three SIR prep plans are the ones with no `title` and no `draft` — the same three, not two overlapping sets.** `s-notice`, `s-roll-absent`, `s-roll-unchecked`. Measured, not assumed — the headline-fallback branch and the `ledeSteps` branch are exercised by exactly this set, which is why the Task 3 tests use `s-notice` for both.

10. **`VISIT_EXPECT` is shared and must stay visibly shared.** Four general tips, transcribed with their header comment (1536-1538): *"General practical guidance for ANY government-office visit. Shown under an explicit 'general tips, not official rules' label so it can never be mistaken for verified process content."* It is exported as its own constant, never merged into any plan's `carry`, and the visit card renders it in its own column under its own heading with the `visitNote` disclaimer underneath (Task 5). The plan-time scan found no banned pattern and no numeric claim in it.

- [ ] **Step 1: Write the failing test** (`src/playbooks/prep.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import type { Playbook, PlaybookRule } from '../domain/types'
// A *.test.ts file, so guardrails/isolation.test.ts's scan does not walk it
// and it MAY import the harness. `prep.ts` itself may NOT.
import { guardrailFindings } from './guardrails/suite'
import { retiredActionFindings } from './guardrails/contentSafety'
import { diagnose } from '../domain/engine'
import { passportEngine } from './engines'
import { passportPlaybook } from './passportPlaybook'
import { voterPlaybook } from './voterPlaybook'
import { sirPlaybook, SIR_STATES } from './sirPlaybook'
import { PREP, VISIT_EXPECT, prepPlanFor, prepCopyExtras, visitExpectCopy } from './prep'

const PLAYBOOKS: Playbook[] = [passportPlaybook, voterPlaybook, sirPlaybook]
const allRules: PlaybookRule[] = PLAYBOOKS.flatMap(p => p.rules)

describe('prep copy passes the same content-safety scan as rule copy (§7)', () => {
  it.each(PLAYBOOKS.map(p => [p.serviceId, p] as const))('%s prep copy is clean', (_id, playbook) => {
    expect(guardrailFindings(playbook, {
      currentPhaseId: playbook.serviceId === 'sir' ? SIR_STATES.delhi.phase!.id : 'none',
      extra: [...prepCopyExtras(playbook), ...visitExpectCopy(playbook.serviceId)],
    })).toEqual([])
  })

  it('the sweep is not vacuous — every playbook contributes prep locations', () => {
    for (const p of PLAYBOOKS) expect(prepCopyExtras(p).length, p.serviceId).toBeGreaterThan(0)
    expect(visitExpectCopy('sir').length).toBe(VISIT_EXPECT.length)
  })

  // NOTE: the whole-project stale-exemption sweep is NOT duplicated here.
  // engines.test.ts:175 is the single call site that sees every exemption
  // location; a copy in this file would lack ladderDefStrings and would
  // report C3's two LADDER_DEFS exemptions as stale. See design note 5a.

  it('prep copy joins the retired-action scan, and the scan actually bites', () => {
    // contentSafety.ts's RETIRED_ACTIONS comment names C4 as a chunk that
    // EXTENDS this scan's input. Positive control first: a guardrail with no
    // demonstrated failing case is not a guardrail.
    const poison = [{ at: 'sir:PREP.toy.steps[0]', text: 'File the Enumeration Form.' }]
    expect(retiredActionFindings(sirPlaybook, 'claims_notice', poison)).toHaveLength(1)
    expect(retiredActionFindings(sirPlaybook, 'claims_notice', poison)[0]).toContain('sir:PREP.toy.steps[0]')
    // ...and the real prep copy is clean under the live phase.
    expect(retiredActionFindings(sirPlaybook, SIR_STATES.delhi.phase!.id, prepCopyExtras(sirPlaybook))).toEqual([])
  })

  // Design note 5 / OQ1: the two draft `because` exemptions are permitted
  // because the cause is an UNFILLED bracket the citizen supplies, not
  // because the sentence is first-person. That is a criterion, so it gets a
  // test — a declared guardrail without an executable test is a defect.
  const DRAFT_CAUSAL_EXEMPTIONS = ['voter:PREP.v-3.draft', 'voter:PREP.v-5.draft']

  it('each draft causal exemption still leaves the cause as an UNFILLED bracket', () => {
    const byAt = new Map(PLAYBOOKS.flatMap(prepCopyExtras).map(c => [c.at, c.text]))
    for (const at of DRAFT_CAUSAL_EXEMPTIONS) {
      expect(byAt.get(at), at).toMatch(/\bbecause\s+\[[^\]]*\]/)
    }
  })
})

describe('PREP completeness — the CTA appears exactly where there is something to prepare', () => {
  // The two final_roll-phase SIR rules are unreachable while Delhi sits in
  // claims_notice, and the locked prototype ships no prep plan for them.
  // Porting invented prep content for a dormant rule would be AUTHORED copy,
  // which this chunk forbids. When Delhi's phase advances, this list stops
  // being true and this test fails — which is the point. See design note 7.
  const ACTIONABLE_WITHOUT_PLAN = ['s-final-absent', 's-final-unchecked']

  it('every actionable rule has a prep plan, except the two recorded dormant ones', () => {
    const missing = allRules
      .filter(r => r.rec === 'FOLLOW_UP' || r.rec === 'ESCALATE')
      .filter(r => !PREP[r.id])
      .map(r => r.id)
    expect(missing.sort()).toEqual([...ACTIONABLE_WITHOUT_PLAN].sort())
  })

  it("the recorded exceptions are only reachable in a phase no supported state is in", () => {
    // THIS is the test a phase advance breaks — it reads the live config.
    // The completeness test above computes from static data and does NOT
    // change when a phase advances. See design note 7.
    const live = Object.values(SIR_STATES).filter(s => s.supported).map(s => s.phase!.id)
    expect(live.length).toBeGreaterThan(0)
    for (const id of live) {
      expect(
        id,
        `A supported state has advanced to final_roll, which makes s-final-absent and ` +
        `s-final-unchecked reachable. They ship with NO prep plan. Authoring their prep ` +
        `plans from sourced content is a PREREQUISITE for this phase advance — it is not ` +
        `"a one-line config change touching no engine code". Do not delete this assertion.`,
      ).not.toBe('final_roll')
    }
  })

  it('no WAIT or UNCLASSIFIED rule has a prep plan (prototype 1532-1535)', () => {
    const spurious = allRules.filter(r => r.rec === 'WAIT' && PREP[r.id]).map(r => r.id)
    expect(spurious).toEqual([])
    // The fallback path, exercised through a REAL UNCLASSIFIED diagnosis.
    // (`PREP['passport:fallback']` would be vacuous — PREP is keyed by bare
    // rule id, so that key could never exist whatever the code did.)
    expect(prepPlanFor(diagnose(passportEngine, { q1: 'not_sure' }))).toBeUndefined()
  })

  it('every PREP key is a shipped rule id (no orphan plan)', () => {
    const shipped = new Set(allRules.map(r => r.id))
    for (const id of Object.keys(PREP)) expect(shipped.has(id), id).toBe(true)
  })

  it('PREP has exactly the 10 entries the locked prototype ships', () => {
    expect(Object.keys(PREP).sort()).toEqual([
      's-notice', 's-roll-absent', 's-roll-unchecked',
      'state-2', 'state-3', 'state-4', 'state-5a', 'state-5b', 'v-3', 'v-5',
    ])
  })
})

describe('prep never routes a citizen anywhere a verified rule does not already route them', () => {
  // Rules AND fallbacks. `passport:state-5a` carries where.phone
  // '1800-258-1800', but 1950 lives ONLY on the voter and SIR fallbacks — a
  // rules-only shippedPhones misses it and this block goes red. See note 6.
  const allChannels = [...allRules.map(r => r.where), ...PLAYBOOKS.map(p => p.fallback.where)]
  const shippedUrls = new Set(allChannels.map(w => w.url).filter(Boolean) as string[])
  const shippedPhones = new Set(allChannels.map(w => w.phone).filter(Boolean) as string[])

  it('every prep step URL is a shipped where.url', () => {
    const stepUrls = Object.values(PREP)
      .flatMap(p => p.steps)
      .flatMap(s => (typeof s === 'string' ? [] : [s.url]))
    expect(stepUrls.length).toBeGreaterThan(0)
    for (const u of stepUrls) expect(shippedUrls, u).toContain(u)
  })

  it('every phone number in prep text is a shipped where.phone', () => {
    // Two shapes, deliberately. The long form `\b\d[\d\s-]{6,}\d\b` needs 8+
    // characters and finds ONLY the four 1800-258-1800 mentions; on its own
    // it never looks at 1950 at all. The `\b\d{4}\b` alternative catches
    // 1950 — and also 2026, which appears five times as the YEAR of the five
    // sourced dates in design note 4's table. Those years are numericFindings'
    // territory (DATE_RE already clears them), not this scan's.
    const NOT_PHONES = new Set(['2026'])
    const found = [...JSON.stringify(PREP).matchAll(/\b\d[\d\s-]{6,}\d\b|\b\d{4}\b/g)]
      .map(m => m[0].trim())
      .filter(t => !NOT_PHONES.has(t))
    expect(found.length).toBeGreaterThan(0)
    // Regression pin: without this, a future "simplification" back to the
    // long-form-only regex passes silently while checking nothing new.
    expect(found).toContain('1950')
    expect(found).toContain('1800-258-1800')
    for (const p of found) expect(shippedPhones, p).toContain(p)
  })
})

describe('prepPlanFor', () => {
  // No `as never` casts: the signature is Pick<Diagnosis,'ruleId'>, so an
  // object literal type-checks against the real seam. A cast here would
  // silence exactly the error this test should surface.
  it('returns the plan for a matched, actionable rule', () => {
    expect(prepPlanFor({ ruleId: 'state-5a' })).toBe(PREP['state-5a'])
  })
  it('returns undefined for a WAIT rule and for the fallback (ruleId null)', () => {
    expect(prepPlanFor({ ruleId: 'state-1' })).toBeUndefined()
    expect(prepPlanFor({ ruleId: null })).toBeUndefined()
  })
  it('accepts a real Diagnosis unchanged — the seam is structural, not nominal', () => {
    expect(prepPlanFor(diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })))
      .toBe(PREP['state-5a'])
  })
})

describe('prep.ts is playbook DATA — the isolation rule holds by construction', () => {
  // Belt-and-braces alongside guardrails/isolation.test.ts, named at the site
  // someone would be tempted to break it: prep.ts declares its own {at,text}
  // interface exactly as sirPlaybook.ts and screenCopy.ts do.
  it('exports a flattener whose entries all carry a serviceId prefix', () => {
    for (const p of PLAYBOOKS) {
      for (const c of prepCopyExtras(p)) expect(c.at).toMatch(new RegExp(`^${p.serviceId}:PREP\\.`))
    }
    for (const c of visitExpectCopy('sir')) expect(c.at).toMatch(/^sir:VISIT_EXPECT\[/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/playbooks/prep.test.ts`. Expected: module-not-found on `./prep`.

- [ ] **Step 3: Implement `src/playbooks/prep.ts`** — the types from design note 2, then `VISIT_EXPECT` (prototype 1536-1544, comment included) and `PREP` (1546-1730, including the `s-duplicate` comment at 1710), transcribed **by extracting the range with `sed`, not by retyping**. Then:

```ts
/** Local {at,text}. MUST NOT import CopyString from ../guardrails/ — this is
 *  application/playbook-data code and guardrails/isolation.test.ts walks it
 *  (its regex does not exempt `import type`). Same pattern as
 *  sirPlaybook.ts's own CopyLocation and screenCopy.ts's. */
export interface CopyLocation { at: string; text: string }

export function prepPlanFor(d: Pick<Diagnosis, 'ruleId'>): PrepPlan | undefined {
  return d.ruleId ? PREP[d.ruleId] : undefined
}

/** Every citizen-facing prep string this playbook ships, addressed
 *  serviceId-first — the shape guardrailFindings({ extra }) consumes.
 *  Driven off playbook.rules, NOT off Object.keys(PREP), so a plan for a
 *  rule the playbook does not ship can never be swept under that
 *  playbook's serviceId (and is caught by the orphan test instead). */
export function prepCopyExtras(playbook: Playbook): CopyLocation[] { /* ... */ }

/** VISIT_EXPECT is shared by every service, so it is swept under whichever
 *  bucket the caller is scanning — the same convention screenCopy.test.tsx's
 *  ladderTagCopy(bucket) already uses for LADDER_TAG. */
export function visitExpectCopy(bucket: string): CopyLocation[] { /* ... */ }
```

  `prepCopyExtras` emits, per rule with a plan: `<svc>:PREP.<id>.title`, `.draft`, `.steps[i]` (the `text` of either step form), `.doneNote`, `.visit.carry[i]`, `.visit.after` — skipping absent fields. Do **not** emit step `url`s as copy strings; a URL is not prose and the banned-pattern scan would produce noise. URLs are covered by design note 6's own test.

- [ ] **Step 4: Give `retiredActionFindings` its `extra` parameter and wire it through `suite.ts`** (design note 8).
  - In `src/playbooks/guardrails/contentSafety.ts`, change the signature to `retiredActionFindings(playbook: Playbook, currentPhaseId: string, extra: CopyString[] = [])`, and inside the `for (const entry of RETIRED_ACTIONS)` loop — after the existing rule/`ACTION_FIELDS`/`where.label` passes — add a pass over `extra` that applies the same `entry.action.test(c.text)` and pushes a finding addressed at `c.at`.
  - In `src/playbooks/guardrails/suite.ts:25`, change the call to `...retiredActionFindings(playbook, options.currentPhaseId ?? 'none', options.extra ?? [])`.
  - The `= []` default keeps every existing call site byte-identical in behaviour; `npx vitest run` must show no pre-existing test changing its result.

- [ ] **Step 5: Add the three `SAFETY_EXEMPTIONS` rows** to `src/playbooks/guardrails/contentSafety.ts`, each with the reasoning from design note 5 written out in `reason` — the **unfilled bracket** as the load-bearing condition, first-person voice as a supporting observation only. Add a leading comment block naming this as C4 Task 1 and stating the two-category split (possessive false positive vs. citizen-voiced draft frame), the way C3's own LADDER_DEFS block does.

- [ ] **Step 6: Extend the whole-project stale-exemption sweep** in `src/playbooks/engines.test.ts:175` (design note 5a). Add `import { prepCopyExtras, visitExpectCopy } from './prep'` and append `.concat(ALL.flatMap(prepCopyExtras)).concat(visitExpectCopy('sir'))` to the `all` array. **Do this in the same commit as Step 5** — between the two, that test is red, and it is the only place the three new exemption locations are visible. Confirm by running `npx vitest run src/playbooks/engines.test.ts` before and after: red on Step 5 alone, green after Step 6.

- [ ] **Step 7: Add the five `allowed_in` entries** to `sources/manifest.json`, plus the one `meaning` amendment on `29 Oct` from design note 4 (the per-`at` allowlist wording, quoted there verbatim — not a class-level permission). Diff-check that nothing else in the file changed: `git diff --stat sources/manifest.json` must show a small, allowlist-only change.

- [ ] **Step 8: Run tests to verify they pass** — `npx vitest run src/playbooks/prep.test.ts`, then `npx vitest run src/playbooks/engines.test.ts`, then `npx vitest run` (484 + new), then `npm run build`, then `npm run lint`.

**Acceptance criteria:**
- All 10 PREP entries and all 4 VISIT_EXPECT tips are byte-identical to `91ff7a1`'s. Verify by diffing an extract against the file, not by reading.
- All three playbooks' prep copy passes `guardrailFindings` with zero findings.
- `engines.test.ts`'s whole-project `staleExemptionFindings` sweep is green **and has been extended** — every new exemption still matches its named pattern, and C3's two `LADDER_DEFS` exemptions are still covered. No second copy of that sweep exists anywhere.
- `retiredActionFindings` takes `extra`, `suite.ts` passes it, and the synthetic "Enumeration Form" positive control produces exactly one finding.
- The `DRAFT_CAUSAL_EXEMPTIONS` test passes — both draft exemptions still leave the cause as an unfilled bracket.
- The phone-allowlist test finds `1950` as well as `1800-258-1800`, and `2026` is excluded with its reason recorded.
- The completeness test names exactly `s-final-absent` and `s-final-unchecked`, and the "unreachable phase" test backs that excuse with an assertion message naming the prerequisite.
- `sources/manifest.json`'s diff adds only `allowed_in` strings plus the one recorded `meaning` amendment.
- `prep.ts` imports nothing from `guardrails/`; `guardrails/isolation.test.ts` still passes.

- [ ] **Step 9: Commit** — `feat(c4): PrepPlan types + PREP/VISIT_EXPECT data port + content-safety extension`

---

### Task 2: Lift the prepare / channel / visit CSS

**Files:**
- Modify: `src/index.css` (append), `src/ui/tokens.test.ts` (new assertions)

**Design notes:**

1. **The lift range is 533-561 and 569-646 — two ranges, not one.** Issue #7 and C3's own handoff both warn about this: lines **562-568** inside the block are `.saved-next` / `.saved-next::before` / `.saved-steps` / `.saved-meta`, which are **C5's casefile styles**, not C4's. Appending 533-646 blindly ships three C5 classes early. Verified endpoints at plan time: 532 is blank, 533-536 is the `/* ---------- prepare: draft + guided submission ---------- */` comment, 561 closes `.psteps-done`, 562-568 is the C5 block, 569 is `.psteps{...}`, 646 closes `.visit-note`, 647 is blank, 648 begins the save/auth comment.

2. **Insert at the prototype's own position, not at the end of the file.** `src/index.css` currently ends with the `#app.settled` animation-suppression rule and the `@media (prefers-reduced-motion:reduce)` block — both lifted from prototype 996-1008, both of which sit *after* the prepare CSS in the source. Insert the new block immediately after `.inline-explain-actions button{...}` (the current tail of the lifted 145-531 range) and **before** the `#app.settled` comment, so `index.css` keeps the prototype's own ordering. This is not cosmetic: the reduced-motion block's `*{animation-duration:1ms !important}` and the `#app.settled` selector list are both meant to be read after everything they suppress.

3. **`.psteps-done` uses `animation:enter 260ms var(--ease)` and is deliberately absent from `#app.settled`'s selector list.** That matches the prototype exactly — the "all steps done" message is a reward for an action the citizen just took, so it *should* replay on a same-screen re-render (which is exactly when it appears). Do not add it to the settled list.

4. **The prototype's decision-recording comments come along**, per the standing rule: the prepare header comment (533-536), the channel comment (602-603), and the visit-card comment (627-629). The prepare header comment says *"Steps are a tick-off checklist (satisfying, visible progress; **not persisted** — it's a prototype)"* — in C4 that parenthetical is still literally true (scope exclusion 1/2), and it becomes false only when C5 lands. Leave it verbatim; C5 will update it when it makes it false.

5. **`.fill-list` / `.fill-review` CSS (prototype 984-994) is NOT lifted.** It styles the describe-it fills-review panel, which is C8's and which scope exclusion 3 forbids building. It sits far outside both ranges, so this is a note against accidental helpfulness, not a range hazard.

6. **`src/index.css`'s own provenance header becomes FALSE the moment this task lands, and must be amended in the same commit.** Lines **13-14** of that file currently read: *"Deliberately NOT lifted (later chunks own them): 532-650 (`.prep-*`, `.channel-*`, `.visit-*` -> C4), …"*. After Task 2 those classes **are** lifted, so a header that still disclaims them is worse than no header — it is a provenance record that lies. Two corrections, both required:
   - Add `533-561` and `569-646` to the header's **lifted** list (the sentence that currently reads *"105-144 …, 145-531 …, and 996-1008 …"*), so the file's own record of what it contains is complete.
   - Replace the `532-650` not-lifted entry with **`562-568` (`.saved-next` / `.saved-next::before` / `.saved-steps` / `.saved-meta` -> C5, physically interleaved into C4's prepare block)**. The `532-650` figure was loose in both directions anyway — 532 is a blank line and 647-650 is not C4's — and it must not survive as a range that now overlaps lifted content.

   Do not touch any other not-lifted entry (651-800, 801-826, 827-995 are still accurate). This is a comment edit, not a CSS edit; the ΔE and token tests are unaffected.

- [ ] **Step 1: Write the failing test** — append to `src/ui/tokens.test.ts`'s existing `'the stylesheet is the lifted prototype and nothing else'` describe block:

```ts
  it('carries the prepare/channel/visit component CSS (prototype 533-561, 569-646)', () => {
    for (const cls of [
      '.prep-card', '.prep-draft', '.prep-card-foot', '.prep-hint', '.prep-trust',
      // Braces matter here: `.copy-btn.copied` is a SUBSTRING of
      // `.copy-btn.copied-warn`, so asserting the bare selector would pass
      // even if only the -warn rule shipped. Assert the opening brace.
      '.copy-btn{', '.copy-btn.copied{', '.copy-btn.copied-warn{',
      '.psteps', '.psteps-count', '.psteps-done',
      '.pstep', '.pstep-tick', '.pstep-box', '.pstep-text', '.pstep-link',
      '.channel-card', '.channel-body', '.channel-k', '.channel-v', '.channel-phone', '.channel-open',
      '.visit-card', '.visit-title', '.visit-cols', '.visit-k', '.visit-list', '.visit-note',
    ]) expect(css, cls).toContain(cls)
  })

  it('does NOT ship C5 casefile styles that sit inside the same prototype range', () => {
    // Prototype 562-568 (.saved-next/.saved-steps/.saved-meta) is C5's, and
    // it is physically interleaved into C4's block — appending 533-646 in one
    // go is the exact mistake this pins. Issue #7 / C3 handoff.
    for (const cls of ['.saved-next', '.saved-steps', '.saved-meta']) {
      expect(css, cls).not.toContain(cls)
    }
  })

  it('does NOT ship the C8 describe-it fills-review styles', () => {
    for (const cls of ['.fill-list', '.fill-review']) expect(css, cls).not.toContain(cls)
  })

  it('keeps the prototype ordering: prepare CSS precedes the settled/reduced-motion tail', () => {
    expect(css.indexOf('.prep-card')).toBeGreaterThan(-1)
    expect(css.indexOf('.prep-card')).toBeLessThan(css.indexOf('#app.settled'))
    expect(css.indexOf('.visit-note')).toBeLessThan(css.indexOf('@media (prefers-reduced-motion:reduce)'))
  })

  it("the file's own provenance header no longer disclaims what it now ships", () => {
    // index.css:13-14 said "Deliberately NOT lifted ... 532-650 (.prep-*,
    // .channel-*, .visit-* -> C4)". After this task that sentence is false.
    // A provenance header that lies is worse than none. Design note 6.
    const header = css.slice(0, css.indexOf(':root{'))
    expect(header).not.toContain('532-650')
    expect(header).toContain('533-561')
    expect(header).toContain('569-646')
    expect(header).toContain('562-568')   // the C5 carve-out, still disclaimed
  })
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/ui/tokens.test.ts`.

- [ ] **Step 3: Append the two ranges** to `src/index.css` at the position design note 2 specifies, extracted with `sed`, verbatim.

- [ ] **Step 4: Amend `src/index.css`'s provenance header** (lines 13-14 today) per design note 6 — move `533-561` and `569-646` into the lifted list, and replace the `532-650 (.prep-*, .channel-*, .visit-* -> C4)` not-lifted entry with `562-568 (.saved-next / .saved-next::before / .saved-steps / .saved-meta -> C5, physically interleaved into C4's prepare block)`. Leave 651-800, 801-826 and 827-995 exactly as they are.

- [ ] **Step 5: Run tests to verify they pass**, then `npx vitest run` and `npm run build`. The built CSS should grow by roughly 3 kB.

**Acceptance criteria:** every class in the list above is present; `.saved-*`, `.fill-list`, `.fill-review` are absent; the provenance header names the two new lifted ranges and disclaims only `562-568` where it used to disclaim `532-650`; the token-fidelity and ΔE tests still pass unchanged (the appended block declares no new custom property — confirm: it references `var(--wait-bg)`, `var(--follow-bg)`, `var(--butter)` etc. but defines none, so `'index.css declares no colour custom property TOKENS does not know about'` stays green).

- [ ] **Step 6: Commit** — `feat(c4): lift prepare/channel/visit CSS from the locked prototype`

---

### Task 3: `PrepareScreen` shell — crumbs, headline, lede, trust line, official-channel card

**Files:**
- Create: `src/templates/PrepareScreen.tsx`, `src/templates/PrepareScreen.test.tsx`
- Modify: `src/screens/screenCopy.ts`

**Interfaces:**
- Consumes: `Diagnosis`, `PrepPlan`, C3's `Split`, `PhaseEyebrow`, `Button`, and `UI` from `screenCopy.ts`.
- Produces: `PrepareScreen`, `PrepareScreenProps`.

**Design notes:**

1. **Props mirror `NextMoveScreen`'s, deliberately.** `{ serviceLabel, engineKey, d, prep, topbar?, dispatch? }`. `prep: PrepPlan` is **required and non-nullable** — the "no plan" case is handled by the router (Task 6), so this component cannot be constructed in the state the prototype's `if(!prep){ restart(); ... }` guard exists for. That is the type-safe version of the same guard.

2. **The crumb is `{serviceLabel} · {d.label}` then `Prepare`** (prototype 3765), which is exactly `PhaseEyebrow`'s two-part shape. `PhaseEyebrow` already splits on `' · '` to find the service square, so it resolves correctly with no change. Add `UI.phase.prepare = 'Prepare'` to the existing phase tree rather than inventing a new copy bucket for one word.

3. **Headline and lede branch structurally on `prep.title` / `prep.draft` presence, never on service or rule.** Headline: `prep.title ?? UI.prepare.headlineFallback`. Lede: `prep.draft ? UI.prepare.ledeDraft : UI.prepare.ledeSteps` — both transcribed from 3766-3767. The three SIR plans are the ones that exercise the fallbacks.

4. **The trust line always renders**, `<p className="prep-trust">`, on the left column under the lede (3768). It is the screen's whole promise; there is no condition under which it is hidden.

5. **The official-channel card renders `d.where`, never re-derived.** `RuleContent.where: OfficialChannel` is already the ported type from C1/C2 — `label` always, `phone` and `url` conditionally (3754-3761). The "Open in new tab ↗" anchor is `target="_blank" rel="noopener"`, matching both the prototype and `NextMoveScreen`'s existing `where` link. `Helpline: {phone}` is a `{phone}` template in `screenCopy.ts` (see design note 6).

   **`.channel-phone` is LIVE today — exercise it with a real diagnosis, never a synthetic `where`.** `src/playbooks/passportPlaybook.ts:161-165` gives `state-5a` a full `where`:

   ```ts
   where: {
     label: 'CPGRAMS · passportindia.gov.in/psp/Grievance',
     url: 'https://www.passportindia.gov.in/psp/Grievance',
     phone: '1800-258-1800',
   },
   ```

   `state-5a` is `FOLLOW_UP`, it is reachable (`diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })` returns it — verified), and `PREP['state-5a']` exists. So a real citizen on a real path sees the helpline row today, and the whole "port a branch that cannot render" framing an earlier draft of this plan carried was simply wrong.

   **Consequence: the fixture for every helpline assertion is `diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })` with `PREP['state-5a']`.** No `{ ...d, where: { ...d.where, phone: … } }` spread anywhere — a synthetic `where` would test the component against data the playbook does not ship, which is exactly the class of test that passes while the feature is broken. The same rule applies to `screenCopy.test.tsx`'s coverage mount for `ui:prepare.channelPhone` (Task 6 design note 5). What **is** still true, and worth recording in the component header: the phone row is optional markup driven off an optional field, so it must stay branch-conditional and must not be "cleaned up" if a future data change removes the only phone-bearing rule.

6. **New copy, all in `screenCopy.ts` under a new `UI.prepare` tree.** Four entries carry placeholders and therefore never render verbatim; they follow the `ui:trust.verifiedOn` `{date}`-template precedent exactly (registered with the placeholder, interpolated at render, listed in `screenCopy.test.tsx`'s `CAPTION_TEMPLATES` carve-out in Task 6). The singular hint/copied forms use `{n}` too, uniformly, so all four are templates and none depends on a coverage mount happening to produce exactly one blank.

   ```ts
   prepare: {
     headlineFallback: "Here's how to get this done.",
     ledeDraft: 'Review the draft, make it yours, then walk the steps. You send it yourself, from your own hands, on the official channel.',
     ledeSteps: 'Walk the steps below, ticking them off as you go. Every one of them happens on the official channel, by you.',
     trust: "NextMove drafts and organizes; it never submits anything on your behalf. The final step is always yours. That's by design.",
     channelK: 'Official channel',
     channelPhone: 'Helpline: {phone}',            // TEMPLATE
     channelOpen: 'Open in new tab ↗',
     // Task 4 adds: draftK, draftAria, hintOne, hintMany, hintReady,
     //              copy, copied, copiedOne, copiedMany
     // Task 5 adds: stepsCount, stepOpen, doneNoteFallback, visitTitle,
     //              visitCarry, visitExpect, visitThen, visitNote, doneBackHome
   }
   ```

   Add `UI.phase.prepare = 'Prepare'` in the same commit. Every string above is transcribed from `renderPrepare`; none is authored.

**Shared test-harness setup — get this right once, in Task 3, or Tasks 4 and 5 inherit three real hazards.** The import block below is the one Tasks 4 and 5 append to, and it deliberately carries more than Task 3 itself needs:

- `vi`, `userEvent` and `fireEvent` are imported **now**. Task 4's clipboard stubs need `vi`, Task 5's dispatch assertions need `vi.fn()`, and Task 4's draft typing needs `fireEvent` (see Task 4 design note 8). Adding them later, mid-task, is how a subagent ends up with a half-broken import line.
- `VISIT_EXPECT` is imported now for the same reason — Task 5 asserts against it.
- **`vi.useFakeTimers()` and `user-event` v14 do not compose by default.** `userEvent`'s default setup awaits real timers, so any `userEvent.*` call under fake timers **hangs until the test times out**. Task 4's 2200 ms copy-flash test must use `const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` and call `user.click(...)`, not the bare `userEvent.click(...)` default instance.
- **`vi.restoreAllMocks()` does NOT restore `navigator.clipboard`.** `Object.defineProperty` is not a mock; `restoreAllMocks` only resets spies created by `vi.spyOn`. Task 4's `afterEach` must capture the original descriptor in `beforeEach` (`const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')`) and put it back explicitly, or delete the property when there was none. A design note claiming `afterEach` restores it is not the same as it restoring it.

- [ ] **Step 1: Write the failing test** (`src/templates/PrepareScreen.test.tsx`)

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrepareScreen } from './PrepareScreen'
import { PREP, VISIT_EXPECT } from '../playbooks/prep'
import { diagnose } from '../domain/engine'
import { passportEngine, sirEngine } from '../playbooks/engines'
import { UI } from '../screens/screenCopy'

// Real engines on purpose: this is an integration point, and a toy fixture
// would not exercise a real `where` shape.
const escalate = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })  // state-5b
const noticeD = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })           // s-notice
// state-5a: the ONE reachable rule whose where carries a phone (1800-258-1800).
const helplineD = diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })         // state-5a

describe('the prepare shell', () => {
  it('crumbs read "<service> · <matched state>" then "Prepare"', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByText(`Passport · ${escalate.label}`)).toBeInTheDocument()
    expect(screen.getByText(UI.phase.prepare)).toBeInTheDocument()
    expect(document.querySelector('.crumb-sq')).toHaveClass('sq-passport')
  })

  it('uses the plan title when there is one, and the fallback headline when there is not', () => {
    const { unmount } = render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREP['state-5b'].title!)
    unmount()
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(UI.prepare.headlineFallback)
  })

  it('the lede matches whether the plan carries a draft', () => {
    const { unmount } = render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByText(UI.prepare.ledeDraft)).toBeInTheDocument()
    unmount()
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(screen.getByText(UI.prepare.ledeSteps)).toBeInTheDocument()
  })

  it('always shows the trust line — NextMove never submits (locked Non-Goal)', () => {
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.prep-trust')).toHaveTextContent(UI.prepare.trust)
  })
})

describe('the official-channel card', () => {
  it("renders the rule's own where.label, phone and url — nothing re-derived", () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const card = document.querySelector('.channel-card')!
    expect(card).toHaveTextContent(UI.prepare.channelK)
    expect(card).toHaveTextContent(escalate.where.label)
    const link = screen.getByRole('link', { name: UI.prepare.channelOpen })
    expect(link).toHaveAttribute('href', escalate.where.url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
  })

  it('omits the helpline row and the link when the rule carries neither', () => {
    // s-notice's real where is { label: "Submit to your BLO / ERO per the
    // notice's instructions" } — no url, no phone. Both optional fields
    // absent, which is what makes it the right negative fixture.
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.channel-phone')).toBeNull()
    expect(screen.queryByRole('link', { name: UI.prepare.channelOpen })).toBeNull()
    expect(document.querySelector('.channel-v')).toHaveTextContent(noticeD.where.label)
  })

  it('renders the helpline with the phone interpolated into the registered template', () => {
    // REAL data, no synthetic spread: passportPlaybook.ts:161-165 gives
    // state-5a where.phone '1800-258-1800', and PREP['state-5a'] exists, so
    // this row ships to real citizens today. See design note 5.
    expect(helplineD.where.phone).toBe('1800-258-1800')   // guards the fixture itself
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={helplineD} prep={PREP['state-5a']} />)
    expect(document.querySelector('.channel-phone'))
      .toHaveTextContent(UI.prepare.channelPhone.replace('{phone}', helplineD.where.phone!))
  })
})

describe('scope exclusions are structural, not incidental', () => {
  it('ships no save/casefile control (C5) and no fills-review panel (C8)', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(document.querySelector('.btn-ghost')).toBeNull()
    expect(document.querySelector('.saved-note')).toBeNull()
    expect(document.querySelector('.fill-list')).toBeNull()
    expect(document.querySelector('.fill-review')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.**

- [ ] **Step 3: Add `UI.phase.prepare` and the `UI.prepare` tree** to `src/screens/screenCopy.ts` (the seven Task-3 entries; the rest arrive in Tasks 4/5). `SCREEN_COPY.ui` picks them up automatically via `flatten`.

- [ ] **Step 4: Implement `src/templates/PrepareScreen.tsx`** — `topbar`, then `<div className="stage screen">`, then `<Split left={crumbs + h1.headline + p.lede + p.prep-trust} right={channel card} />`, transcribing structure from 3762-3771 (`topbar(true,true)` is on 3762). The draft card, checklist and visit card land in Tasks 4 and 5.

  **Write the component's header comment in this step, carrying four recorded decisions in-code** — the same way `NextMoveScreen.tsx:5-9` carries its own C4 seam note rather than leaving it only in a plan file:
  1. **The C6 `freshBanner` insertion point.** `freshBanner(engineKey)` is prototype 3770 — the **first child of the right column**, before the channel card, the same position it takes on Diagnosis and Next Move. Write it as a comment at that exact spot, matching `NextMoveScreen.tsx`'s in-code note. A handoff section in a plan document is not discoverable from the file someone is editing.
  2. **The C8 `fillDraft` middle branch is deliberately unbuilt** (Task 4 design note 2) — not stubbed, not commented-out code, just a note that it was a decision.
  3. **The C5 `saveControl` tail is deliberately absent** (scope exclusion 1) — the screen ends at "Done, back to Home".
  4. **The `.channel-phone` row is optional-by-data, not dead.** `state-5a` supplies a real phone today; the branch stays conditional because the field is optional, not because it never renders.

- [ ] **Step 5: Run tests to verify they pass**, then `npx vitest run` and `npm run build`.

**Acceptance criteria:** the crumb carries the matched state (the same AC-10 satisfaction point `NextMoveScreen`'s design note 4 records); the headline/lede branch on plan shape only; the trust line is unconditional; the channel card renders `d.where` faithfully with both optional fields omitted when absent; no C5 or C8 element is present.

- [ ] **Step 6: Commit** — `feat(c4): prepare screen shell — crumbs, headline, trust line, official-channel card`

---

### Task 4: The draft card — editable textarea, live blank count, Copy control

**Files:**
- Modify: `src/templates/PrepareScreen.tsx`, `src/templates/PrepareScreen.test.tsx`, `src/screens/screenCopy.ts`

**Design notes:**

1. **Local state only — this is scope exclusion 2 in code.** `const [draft, setDraft] = useState(prep.draft ?? '')` and `const [copied, setCopied] = useState<number | null>(null)`. **Nothing goes into `SessionState`.** The prototype uses `S.prepDraft` and `S.copied` because it has one global object and no components; C4 has components, and C5 is the chunk with a reason (persistence) to lift this. A test in Task 6 asserts `session.ts` still declares no `prep*` field.

2. **The draft is the raw template. `fillDraft()` is not ported at all** (scope exclusion 3). `prep.draft` goes straight into the textarea's initial value; no `S.caseFacts` lookup, no `prepFills`, no `.fill-list` branch. The bracket hint therefore has **exactly two** branches, not three:

   ```ts
   const bracketCount = (t: string) => (t.match(/\[[^\]]*\]/g) ?? []).length   // prototype 3699, verbatim
   // n > 0  -> UI.prepare.hintOne / hintMany with {n} interpolated
   // n === 0 -> UI.prepare.hintReady
   ```

   The prototype's middle branch (`fills>0 && !S.fillsReviewed`) is C8's and is **not written, not commented out, not stubbed.** Record its absence in the component's header comment so a later reader knows it was a decision.

3. **The hint is live, driven by React state — not by `document.getElementById`.** The prototype's `updateBracketHint` (3721-3723) is a DOM patch because it has no re-render on input; React re-renders on `setDraft`, so the hint is simply computed from `draft` during render. Same behaviour, one fewer moving part. Record it as a mechanism deviation, not a behaviour one.

4. **The Copy button has three visual states, and copy always succeeds** (prototype 3737-3744 and its own comment: *"The copy always succeeds — remaining blanks are named, not policed."*). Do not disable the button, do not block on blanks, do not warn before copying.
   - idle → `UI.prepare.copy` ("Copy draft"), class `copy-btn`
   - copied with 0 blanks → `UI.prepare.copied` ("Copied ✓"), class `copy-btn copied`
   - copied with N blanks → `UI.prepare.copiedOne` / `copiedMany`, class `copy-btn copied-warn`

   The flash lasts **2200 ms** (prototype 3742), then reverts to idle. Use a `setTimeout` cleared in a `useEffect` cleanup so an unmount mid-flash does not set state on a dead component.

5. **Clipboard, and its jsdom reality.** `navigator.clipboard.writeText` is not implemented in jsdom, and `navigator.clipboard` may be `undefined` entirely. Port the prototype's own fallback: on rejection or throw, `textareaRef.current?.select()`. Tests stub `navigator.clipboard` via `Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })`. **`vi.restoreAllMocks()` does not undo that** — `defineProperty` is not a mock, and `restoreAllMocks` only touches `vi.spyOn` spies. The `afterEach` must capture and replace the original descriptor explicitly:

   ```ts
   let originalClipboard: PropertyDescriptor | undefined
   beforeEach(() => {
     originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
     Object.defineProperty(navigator, 'clipboard', {
       value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
     })
   })
   afterEach(() => {
     if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
     else delete (navigator as { clipboard?: unknown }).clipboard
     vi.useRealTimers()
     vi.restoreAllMocks()
   })
   ```

   **Test both paths** — the success flash and the rejection fallback — because the fallback is the path a real citizen on an insecure context actually hits.

6. **The blank count shown on the Copy button is the count at the moment of copying**, not the live count (prototype: `S.copiedBrackets = bracketCount(ta.value)` is captured *before* the flash). If the user edits during the 2200 ms flash, the button keeps saying what was true when they copied. Transcribe that; do not "improve" it to a live count.

7. **Set the draft with `fireEvent.change`, NEVER `userEvent.type` — `[` is a key descriptor in user-event v14.** Verified against the repo's actual `@testing-library/user-event@14.6.7` by running it: `await userEvent.type(ta, 'one [a] two [b]')` leaves the textarea holding `"one  two "`. `user-event` parses `[…]` as a keyboard *code* (the `{…}`/`[…]` descriptor syntax), so the brackets and everything inside them are consumed and never typed. `bracketCount` then sees **0**, and every hint assertion in this task quietly tests the wrong thing.

   `fireEvent.change(ta, { target: { value: 'one [a] two [b]' } })` sets the literal string — verified in the same run to produce exactly `"one [a] two [b]"`. Use it for all three hint cases and for the copy case. **Do not "simplify" this back to `userEvent.type` later**: this note exists because the substitution is invisible — the test still passes, it just stops measuring brackets. `userEvent` stays in use for *clicks* (the Copy button, the step ticks), where no bracket text is involved.

8. **The "Your draft" label reuses C3's `.nm-k`; there is no `.prep-k`.** Prototype 3773 is verbatim `<div class="nm-k" style="margin-bottom:10px;">Your draft</div>`. Render it as `<div className="nm-k" style={{ marginBottom: 10 }}>{UI.prepare.draftK}</div>` — the existing class plus the prototype's own inline margin. The lifted CSS (Task 2) defines no `.prep-k`; **do not invent one**, and do not move the margin into a new rule. That would be restyling a locked design, which is a new-lock decision, not an implementation choice — the same reasoning Task 5 design note 6 applies to the "Then what?" heading's inline margin.

9. **New copy** (Task 4's share of `UI.prepare`): `draftK: 'Your draft'`, `draftAria: 'Editable draft'`, `hintOne: '{n} blank in [brackets] left to fill; everything else is ready.'`, `hintMany: '{n} blanks in [brackets] left to fill; everything else is ready.'`, `hintReady: 'All blanks filled. Ready to copy and send.'`, `copy: 'Copy draft'`, `copied: 'Copied ✓'`, `copiedOne: 'Copied, {n} blank left'`, `copiedMany: 'Copied, {n} blanks left'`. The four `{n}` entries join `CAPTION_TEMPLATES` in Task 6; `hintReady`, `copied`, `copiedOne` and `copiedMany` **also** join Task 6's `INTERACTION_GATED` set, because no static mount can reach them (Task 6 design note 4a).

- [ ] **Step 1: Write the failing tests** — append to `PrepareScreen.test.tsx`. **Every `it` below carries real assertions before you move to Step 2.** An empty or `/* ... */` body passes green, which means Step 2 cannot show it as failing and TDD's RED phase never happens. At Step 2, read the failure list and confirm **every test name you just added appears in it**; a newly added test that passes at Step 2 is not a test.

```ts
describe('the draft card', () => {
  let originalClipboard: PropertyDescriptor | undefined

  beforeEach(() => {
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
    })
  })
  afterEach(() => {
    // defineProperty is not a mock — restoreAllMocks does NOT undo it.
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else delete (navigator as { clipboard?: unknown }).clipboard
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('is absent when the plan carries no draft (the three SIR plans)', () => {
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.prep-card')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('seeds the textarea with the RAW template — no caseFacts substitution (C8)', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })
    expect(ta).toHaveValue(PREP['state-5b'].draft)
    expect(ta).toHaveValue(expect.stringContaining('[CPGRAMS grievance number]'))
  })

  it('shows the right hint at FIRST RENDER, computed from the shipped draft', () => {
    // Not a hard-coded number: derived from the data, so this test tracks the
    // locked copy rather than a figure someone typed once. (state-5b ships 6
    // brackets today — assert the derivation, not the 6.)
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const n = (PREP['state-5b'].draft!.match(/\[[^\]]*\]/g) ?? []).length
    expect(n).toBeGreaterThan(1)
    expect(document.querySelector('.prep-hint'))
      .toHaveTextContent(UI.prepare.hintMany.replace('{n}', String(n)))
  })

  it('the blank-count hint is live and plural-correct as the user edits', () => {
    // fireEvent.change, NOT userEvent.type: user-event v14 reads `[...]` as a
    // KEY DESCRIPTOR and eats it — `userEvent.type(ta, 'one [a] two [b]')`
    // leaves the value "one  two " (verified against 14.6.7 in this repo), so
    // bracketCount would see 0 and this test would silently measure nothing.
    // Do not "simplify" this back to userEvent.type. See design note 7.
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })

    fireEvent.change(ta, { target: { value: 'one [a] two [b]' } })
    expect(ta).toHaveValue('one [a] two [b]')     // guards the harness itself
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintMany.replace('{n}', '2'))

    fireEvent.change(ta, { target: { value: 'only [a]' } })
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintOne.replace('{n}', '1'))

    fireEvent.change(ta, { target: { value: 'nothing left to fill' } })
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintReady)
  })

  it('copies the EDITED text, and names the blanks left instead of policing them', async () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })
    fireEvent.change(ta, { target: { value: 'ready [x] set' } })
    const btn = screen.getByRole('button', { name: UI.prepare.copy })
    expect(btn).toBeEnabled()                     // never blocked on blanks
    await userEvent.click(btn)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ready [x] set')
    const flashed = await screen.findByRole('button', { name: UI.prepare.copiedOne.replace('{n}', '1') })
    expect(flashed).toHaveClass('copied-warn')
    expect(flashed).not.toHaveClass('copied')
  })

  it('shows the clean "Copied ✓" state when nothing is left to fill', async () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })
    fireEvent.change(ta, { target: { value: 'all done' } })
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
    const flashed = await screen.findByRole('button', { name: UI.prepare.copied })
    expect(flashed).toHaveClass('copied')
    expect(flashed).not.toHaveClass('copied-warn')
  })

  it('keeps the count from the MOMENT OF COPYING even if the user edits during the flash', async () => {
    // Prototype captures S.copiedBrackets before the flash (design note 6).
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria })
    fireEvent.change(ta, { target: { value: 'a [x] b [y]' } })
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
    await screen.findByRole('button', { name: UI.prepare.copiedMany.replace('{n}', '2') })
    fireEvent.change(ta, { target: { value: 'no blanks now' } })
    // Still says 2 — the button reports what was true when they copied.
    expect(screen.getByRole('button', { name: UI.prepare.copiedMany.replace('{n}', '2') })).toBeInTheDocument()
    // ...while the live hint has already moved on.
    expect(document.querySelector('.prep-hint')).toHaveTextContent(UI.prepare.hintReady)
  })

  it('reverts to "Copy draft" after 2200ms (prototype 3742)', async () => {
    vi.useFakeTimers()
    // user-event v14 awaits REAL timers by default and hangs forever under
    // fake ones. Its own setup option is the fix; do not drop it.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    fireEvent.change(screen.getByRole('textbox', { name: UI.prepare.draftAria }), {
      target: { value: 'all done' },
    })
    await user.click(screen.getByRole('button', { name: UI.prepare.copy }))
    expect(screen.getByRole('button', { name: UI.prepare.copied })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(2199) })
    expect(screen.queryByRole('button', { name: UI.prepare.copy })).toBeNull()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('button', { name: UI.prepare.copy })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.prepare.copied })).toBeNull()
  })

  it('clears the flash timer on unmount — no setState on a dead component', async () => {
    vi.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(
      <PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />,
    )
    await user.click(screen.getByRole('button', { name: UI.prepare.copy }))
    unmount()
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('falls back to selecting the textarea when the clipboard rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true,
    })
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const ta = screen.getByRole('textbox', { name: UI.prepare.draftAria }) as HTMLTextAreaElement
    const selectSpy = vi.spyOn(ta, 'select')
    fireEvent.change(ta, { target: { value: 'all done' } })
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.copy }))
    // The rejection is handled: the textarea is selected so the citizen can
    // copy by hand, and the button NEVER claims a copy that did not happen.
    await waitFor(() => expect(selectSpy).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: UI.prepare.copy })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.prepare.copied })).toBeNull()
  })
})
```

  `act` and `waitFor` join the `@testing-library/react` import in this task; `fireEvent` and `vi` are already there from Task 3's shared import block.

- [ ] **Step 2: Run tests to verify they fail.** Read the failure list and tick off **every** test name added in Step 1 against it. If any newly added test is not in the failure list, its body is empty or its assertion is vacuous — go back and write it properly before implementing anything.

- [ ] **Step 3: Add the nine Task-4 strings** to `UI.prepare`.

- [ ] **Step 4: Implement the draft card** in `src/templates/PrepareScreen.tsx` — structure from 3772-3778, minus the `fd.fills` branch entirely. The label is `<div className="nm-k" style={{ marginBottom: 10 }}>` (design note 8), not a new `.prep-k`.

- [ ] **Step 5: Run tests to verify they pass**, then `npx vitest run` and `npm run build` and `npm run lint`.

**Acceptance criteria:** no `prep*` field appears in `session.ts`; the textarea holds the raw template; the hint has exactly two branches, is plural-correct, and is asserted at first render against a count derived from the shipped draft; the Copy button is never disabled and never blocks; all three visual states are reachable and class-correct; the copied count is frozen at copy time; the 2200 ms revert and the clipboard-rejection fallback are both tested; no timer fires after unmount; **no test in this task uses `userEvent.type` on the draft textarea**, and every `it` has a real body that failed at Step 2.

- [ ] **Step 6: Commit** — `feat(c4): prepare draft card — editable textarea, live blank count, copy control`

---

### Task 5: The step checklist, the done note, and the in-person visit card

**Files:**
- Modify: `src/templates/PrepareScreen.tsx`, `src/templates/PrepareScreen.test.tsx`, `src/screens/screenCopy.ts`

**Design notes:**

1. **Step ticks are local state — scope exclusion 1/2 again.** `const [checks, setChecks] = useState<boolean[]>(() => prep.steps.map(() => false))`. The prototype's `togglePrepStep` (3685-3695) does three things: flip the check, sync the active casefile, and re-render. **Port only the first.** The `activeCase()` / `caseSnapshot()` / `persistCases()` block is C5's, verbatim, and must not appear here in any form.

2. **Each step is `<button className="pstep-tick" aria-pressed={checked}>` wrapping `<span className="pstep-box">{ICONS.stepCheck}</span>` and `<span className="pstep-text">`** (3792-3796). The check icon is always in the DOM; `.pstep-box svg{opacity:0}` / `.pstep.done .pstep-box svg{opacity:1}` in the lifted CSS does the showing. Do not conditionally render the icon — that would break the CSS transition and diverge from the lock.

3. **A step's "Open ↗" link is a sibling of the tick button, not inside it** (3797). Nesting an `<a>` inside a `<button>` is invalid HTML and would make the link unreachable by keyboard within the button's activation. The prototype already gets this right; keep it right.

   **Measured, and it shapes the test:** every one of the 10 plans carries **exactly one** url-bearing step, the rest bare strings. There is therefore **no all-bare plan** to use as a negative fixture, so the "a bare step gets no link" test asserts per-**row** (each bare step's own `.pstep` contains no anchor) rather than per-plan. Do not go looking for an all-bare plan; there isn't one.

4. **`{done} of {total} done` sits above the list** (3788), and the `doneNote` renders only when `done === prep.steps.length` (3800), falling back to `UI.prepare.doneNoteFallback` when the plan carries none. Only `state-5a`, `state-5b` and `s-roll-unchecked` carry their own `doneNote`; the other seven exercise the fallback.

5. **The visit card renders only when `prep.visit` exists** (3801-3815). Counted at plan time: **six of the ten plans carry one** — `state-4`, `state-2`, `v-3`, `v-5`, `s-notice`, `s-roll-absent` — and all six carry an `after` line, so the "Then what?" branch is exercised by every visit-bearing plan (there is currently **no** plan with a `visit` but no `after`; test that branch with a synthetic `{ ...plan, visit: { carry: [...] } }`). Two columns: **Carry** from `prep.visit.carry` (rule-specific, verified) and **What to expect** from the shared `VISIT_EXPECT`. Then an optional **Then what?** heading + single-item list from `prep.visit.after`, then the fixed `visitNote` disclaimer. **The two lists must never be merged or reordered into one** — the whole reason `VISIT_EXPECT` is a separate constant with a separate heading and a disclaimer underneath is that general advice must never wear the verified-source costume (its own prototype comment, 1536-1538, and the visit-card CSS comment at 627-629). A test asserts the two lists are in distinct columns with distinct headings.

6. **The "Then what?" heading reuses `.visit-k` with an inline `margin-top:14px`** in the prototype (3813). Transcribe the inline style rather than inventing a new class — adding `.visit-k-then` would be restyling a locked design. (If a reviewer prefers a class, that is a design change needing a new lock, not an implementation choice.)

7. **"Done, back to Home" dispatches `RESTART`** (scope exclusion 6), `<Button variant="secondary" block>`, and is the **last thing on the screen** — `saveControl` (3817) does not exist in C4.

8. **New copy** (Task 5's share): `stepsCount: '{done} of {total} done'` (TEMPLATE), `stepOpen: 'Open ↗'`, `doneNoteFallback: "All steps done. You've completed everything this stage needs from you."`, `visitTitle: "If you're going in person"`, `visitCarry: 'Carry'`, `visitExpect: 'What to expect'`, `visitThen: 'Then what?'`, `visitNote: "The carry list combines this case's verified requirements with common-sense basics. The tips are general practical guidance for any government office, not official rules."`, `doneBackHome: 'Done, back to Home'`.

- [ ] **Step 1: Write the failing tests** — append to `PrepareScreen.test.tsx`. **The same rule as Task 4: every `it` carries real assertions before Step 2.** A `/* ... */` body passes green, so Step 2 cannot show it failing and the RED phase never happens. At Step 2, confirm every newly added test name appears in the failure list.

```ts
// state-4: q1 'adverse' + q2 'no_followup'. Carries a title, a draft AND a
// visit block, so it is the one fixture that exercises the whole screen.
const clarifyD = diagnose(passportEngine, { q1: 'adverse', q2: 'no_followup' })

// Small helper: tick every step on the currently rendered screen.
const tickAll = async (n: number) => {
  const ticks = screen.getAllByRole('button', { pressed: false })
    .filter(b => b.classList.contains('pstep-tick'))
  expect(ticks).toHaveLength(n)
  for (const t of ticks) await userEvent.click(t)
}

describe('the step checklist', () => {
  it('renders one tickable row per step, with the counter starting at 0 of N', () => {
    const plan = PREP['state-5b']
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan} />)
    expect(document.querySelectorAll('.pstep-tick')).toHaveLength(plan.steps.length)
    for (const b of document.querySelectorAll('.pstep-tick')) {
      expect(b.tagName).toBe('BUTTON')
      expect(b).toHaveAttribute('aria-pressed', 'false')
    }
    expect(document.querySelector('.psteps-count')).toHaveTextContent(
      UI.prepare.stepsCount.replace('{done}', '0').replace('{total}', String(plan.steps.length)),
    )
  })

  it('ticking a step flips aria-pressed and the .done class, and advances the counter', async () => {
    const plan = PREP['state-5b']
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan} />)
    const first = document.querySelectorAll('.pstep-tick')[0] as HTMLButtonElement
    await userEvent.click(first)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(first.closest('.pstep')).toHaveClass('done')
    // Interpolated from the registered template, never a hand-built string.
    expect(document.querySelector('.psteps-count')).toHaveTextContent(
      UI.prepare.stepsCount.replace('{done}', '1').replace('{total}', String(plan.steps.length)),
    )
    await userEvent.click(first)                       // and it un-ticks
    expect(first).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.psteps-count')).toHaveTextContent(
      UI.prepare.stepsCount.replace('{done}', '0').replace('{total}', String(plan.steps.length)),
    )
  })

  it('a step with a url gets an "Open ↗" link that is a SIBLING of the tick button', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const link = screen.getAllByRole('link', { name: UI.prepare.stepOpen })[0]
    expect(link.closest('button')).toBeNull()          // never nested in the button
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
    const urlStep = PREP['state-5b'].steps.find(s => typeof s !== 'string') as { url: string }
    expect(link).toHaveAttribute('href', urlStep.url)
  })

  it('a bare-string step gets no link', () => {
    // Measured: EVERY shipped plan has exactly one url-bearing step and the
    // rest bare, so there is no all-bare plan to use as a negative fixture.
    // Assert per-ROW instead of per-plan: the link count matches the url-step
    // count, and each bare step's own row carries no anchor.
    const plan = PREP['state-5b']
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan} />)
    const withUrl = plan.steps.filter(s => typeof s !== 'string').length
    expect(withUrl).toBe(1)
    expect(withUrl).toBeLessThan(plan.steps.length)    // there ARE bare steps to check
    expect(screen.getAllByRole('link', { name: UI.prepare.stepOpen })).toHaveLength(withUrl)
    const rows = document.querySelectorAll('.pstep')
    plan.steps.forEach((s, i) => {
      expect(rows[i].querySelectorAll('a').length, String(i)).toBe(typeof s === 'string' ? 0 : 1)
    })
  })

  it("the done note appears only when every step is ticked, and uses the plan's own text", async () => {
    const plan = PREP['state-5b']                      // carries its own doneNote
    const { unmount } = render(
      <PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={plan} />,
    )
    expect(document.querySelector('.psteps-done')).toBeNull()
    await tickAll(plan.steps.length)
    expect(document.querySelector('.psteps-done')).toHaveTextContent(plan.doneNote!)
    unmount()

    const noNote = PREP['state-4']                     // carries none -> fallback
    expect(noNote.doneNote).toBeUndefined()
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={noNote} />)
    await tickAll(noNote.steps.length)
    expect(document.querySelector('.psteps-done')).toHaveTextContent(UI.prepare.doneNoteFallback)
  })

  it('the check icon is always in the DOM — the lifted CSS does the showing', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(document.querySelectorAll('.pstep-box svg').length).toBe(PREP['state-5b'].steps.length)
  })
})

describe('the in-person visit card', () => {
  it('is absent for a plan with no visit block', () => {
    expect(PREP['state-5b'].visit).toBeUndefined()     // guards the fixture
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(document.querySelector('.visit-card')).toBeNull()
    expect(screen.queryByText(UI.prepare.visitTitle)).toBeNull()
  })

  it("keeps the rule's verified Carry list and the shared general tips in SEPARATE columns", () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={PREP['state-4']} />)
    const cols = document.querySelectorAll('.visit-cols > div')
    expect(cols).toHaveLength(2)
    expect(cols[0]).toHaveTextContent(UI.prepare.visitCarry)
    expect(cols[1]).toHaveTextContent(UI.prepare.visitExpect)
    for (const c of PREP['state-4'].visit!.carry) expect(cols[0]).toHaveTextContent(c)
    for (const e of VISIT_EXPECT) expect(cols[1]).toHaveTextContent(e)
    // The point of the separation: no verified carry item leaks into the
    // general-tips column and vice versa.
    for (const e of VISIT_EXPECT) expect(cols[0]).not.toHaveTextContent(e)
  })

  it('always shows the general-advice disclaimer under the card', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={PREP['state-4']} />)
    expect(document.querySelector('.visit-note')).toHaveTextContent(UI.prepare.visitNote)
  })

  it('shows "Then what?" only when the visit block carries an `after` line', () => {
    // All six shipped visit blocks carry `after`, so the positive case is
    // real data and the negative case must be synthetic — the branch is
    // locked markup and an `after`-less visit is a legal PrepVisit shape.
    const plan = PREP['state-4']
    const { unmount } = render(
      <PrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={plan} />,
    )
    expect(screen.getByText(UI.prepare.visitThen)).toBeInTheDocument()
    expect(document.querySelector('.visit-card')).toHaveTextContent(plan.visit!.after!)
    unmount()

    const noAfter = { ...plan, visit: { carry: plan.visit!.carry } }
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={noAfter} />)
    expect(document.querySelector('.visit-card')).toBeInTheDocument()   // card still shows
    expect(screen.queryByText(UI.prepare.visitThen)).toBeNull()         // heading does not
  })
})

describe('the closing control', () => {
  it('"Done, back to Home" dispatches RESTART — never a navigation (scope exclusion 6)', async () => {
    const dispatch = vi.fn()
    render(
      <PrepareScreen
        serviceLabel="Passport" engineKey="passport" d={escalate}
        prep={PREP['state-5b']} dispatch={dispatch}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: UI.prepare.doneBackHome }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'NAVIGATE' }))
  })

  it('is the last control on the screen — no save control follows it (C5)', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={clarifyD} prep={PREP['state-4']} />)
    const done = screen.getByRole('button', { name: UI.prepare.doneBackHome })
    const controls = Array.from(document.querySelectorAll('button, a[href]'))
    expect(controls[controls.length - 1]).toBe(done)
    // And the C5 markers specifically, by name rather than by position.
    expect(document.querySelector('.btn-ghost')).toBeNull()
    expect(document.querySelector('.saved-note')).toBeNull()
    expect(document.querySelector('.saved-next')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.** Tick every newly added test name off against the failure list before implementing. A newly added test that passes here has an empty or vacuous body — fix it first.

- [ ] **Step 3: Add the nine Task-5 strings** to `UI.prepare`.

- [ ] **Step 4: Implement the checklist, done note, visit card and closing button** in `src/templates/PrepareScreen.tsx` — structure from 3788-3816.

- [ ] **Step 5: Run tests to verify they pass**, then `npx vitest run`, `npm run build`, `npm run lint`.

**Acceptance criteria:** step state is component-local; the counter and done note track it, both interpolated from `UI.prepare.stepsCount`; every step link is a keyboard-reachable sibling anchor; the verified carry list and the general tips are provably separate with the disclaimer present; the "Then what?" heading is present with `after` and absent without it; "Done, back to Home" dispatches `RESTART` and is the last control in the DOM; nothing renders after it; every `it` in this task has a real body that failed at Step 2.

- [ ] **Step 6: Commit** — `feat(c4): prepare step checklist, done note, and in-person visit card`

---

### Task 6: Router wiring, the `ScreenId` additions, and the guardrail/coverage sweep

**Files:**
- Modify: `src/session/session.ts`, `src/App.tsx`, `src/App.test.tsx`, `src/screens/screenCopy.test.tsx`, `src/session/session.test.ts`

**Design notes:**

1. **Three new `ScreenId` members, and nothing else in `session.ts`.** `'passport-prepare' | 'voter-prepare' | 'sir-prepare'` — the prototype's own ids (its router, 3910-3944), placed next to each service's existing block so the union stays readable. The union's own comment already anticipates this ("so C4/C5 extend the union rather than renaming the graph"). **No new action, no new field, no reducer change.** `App.tsx`'s `default` arm assigns `state.screen` to a `never`, so adding a member without a case is a compile error — which is the point of adding them one commit at a time.

2. **`hasPrepPlan` / `onPrepare` on the three existing `*-nextmove` cases**, three identical two-line additions:

   ```tsx
   const prep = prepPlanFor(d)
   <NextMoveScreen … hasPrepPlan={Boolean(prep)} onPrepare={() => dispatch({ type: 'NAVIGATE', screen: 'passport-prepare' })} />
   ```

   `NextMoveScreen.tsx` itself is **not edited** — scope exclusion 5. The screen id is written as a literal per case rather than derived from `engineKey`; `` `${engineKey}-prepare` `` would type as `string`, not `ScreenId`, and this codebase deliberately pays the "write it twice" cost to keep the union checkable (the same reasoning `session.ts`'s `ServiceKey` comment records).

3. **The no-plan guard — the honest port of `if(!prep){ restart(); return renderHome(); }` (3749).** With `PrepareScreen`'s `prep` prop required, the router must decide what to do when someone reaches `*-prepare` with a diagnosis that has no plan. That is unreachable through the UI (the CTA only renders behind `hasPrepPlan`), but it is reachable through a direct `NAVIGATE` and it is what the prototype guards. **Ruling: render a tiny `RestartToHome` component that dispatches `RESTART` from a `useEffect` and renders `null`.** Rationale: it reproduces the prototype's behaviour exactly (clear the working case, land on Home), it is a real React idiom rather than a render-phase side effect, and it is directly testable. Do **not** dispatch during render, do **not** render `<Home>` with stale answers (that is a different behaviour — Home is a clean slate, always), and do **not** silently fall through to `NextMoveScreen`.

4. **`screenCopy.test.tsx`'s coverage mount gains `PrepareScreen`, and `CAPTION_TEMPLATES` gains six entries.** The coverage test's contract is "every `SCREEN_COPY` entry appears in real component output somewhere." Add `PrepareScreen` to `UiChrome()` twice — once with a draft-bearing plan and once with a visit-bearing, draft-less plan — and add to `CAPTION_TEMPLATES`: `ui:prepare.channelPhone`, `ui:prepare.hintOne`, `ui:prepare.hintMany`, `ui:prepare.copiedOne`, `ui:prepare.copiedMany`, `ui:prepare.stepsCount`. Each is a registered template whose rendered form interpolates a value and therefore can never equal the registered string — the same, and only, legitimate carve-out reason `ui:trust.verifiedOn` already uses. **Write the reason next to each addition**; the carve-out set is the one place this suite can be quietly hollowed out.

   Note `ui:prepare.copy` ("Copy draft") is **not** a carve-out — it renders verbatim at first paint, so the mount must actually produce it or the coverage test correctly fails.

   Pass `topbar={topbar(true, true)}` to both mounts, matching prototype 3762 and the two existing `*-nextmove` mounts already in `UiChrome()`.

4a. **Five entries are unreachable from a STATIC mount, and widening `CAPTION_TEMPLATES` to hide that would be exactly the hollowing-out design note 4 warns against.** `screenCopy.test.tsx`'s coverage test is `render(mount())` with **no interaction**, and `PrepareScreen`'s tick state has no prop seam to pre-tick steps (adding one purely for a test would be a production API existing for test convenience — the wrong trade). So:

   | entry | why a static mount cannot produce it |
   |---|---|
   | `ui:prepare.doneNoteFallback` | needs every step ticked |
   | `ui:prepare.copied` | needs a Copy click |
   | `ui:prepare.copiedOne` / `copiedMany` | need a Copy click (and are templates too) |
   | `ui:prepare.hintReady` | needs a zero-bracket draft; **all 7 shipped drafts have brackets** (measured: 4-8 each) |

   **Fix: a second, separately-named set with its own recorded reason, plus a real interaction test elsewhere.** In `screenCopy.test.tsx`:

   ```ts
   /** Entries no STATIC mount can produce: each needs a user interaction
    *  (a tick, a click) or a draft shape no shipped plan has. They are NOT
    *  caption templates and must not be folded into CAPTION_TEMPLATES —
    *  their coverage lives in PrepareScreen.test.tsx's interaction test,
    *  named below so the two can never drift apart silently. */
   const INTERACTION_GATED = new Set([
     'ui:prepare.copied',
     'ui:prepare.copiedOne',
     'ui:prepare.copiedMany',
     'ui:prepare.hintReady',
     'ui:prepare.doneNoteFallback',
   ])
   ```

   and skip it in the bucket sweep alongside `CAPTION_TEMPLATES`. Then add, in `PrepareScreen.test.tsx`, an explicit test that **drives the interactions and asserts each of the five actually renders** — tick every step on a `doneNote`-less plan for `doneNoteFallback`; set a zero-bracket draft for `hintReady`; copy a zero-bracket draft for `copied`; copy 1- and 2-bracket drafts for `copiedOne`/`copiedMany`. Tasks 4 and 5 already write four of those five assertions; this test is the one place that names all five together as *the coverage substitute*, so a future reader deleting one knows what it was carrying.

5. **`channelPhone` mounts with the REAL `state-5a` diagnosis.** `diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })` returns `state-5a`, whose `where.phone` is `1800-258-1800` (`passportPlaybook.ts:161-165`), and `PREP['state-5a']` exists — so the helpline row renders from shipped data. Use that for the draft-bearing mount. **No `{ ...d, where: { ...d.where, phone: … } }` spread** — an earlier draft of this plan called for one on the false premise that no rule carries a phone. The `CAPTION_TEMPLATES` carve-out is still needed (it is a `{phone}` template and the rendered form interpolates), but the mount underneath it must be real, or the carve-out would be covering a string nothing renders — the exact rot the coverage test exists to catch.

6. **The companion carve-out test must grow with the set, not stay pinned to one entry.** `screenCopy.test.tsx:362-372` (`'each carve-out entry still appears with its placeholder substituted'`) currently hard-codes `ui:trust.verifiedOn` and renders one `DiagnosisScreen`. Six new carve-outs land in this task and that test would not notice any of them. **Drive it off the set itself** so a future carve-out cannot be added without an assertion — a `CAPTION_SUBSTITUTIONS: Record<string, string>` keyed by the same `at`s, with a test that (a) asserts `Object.keys(CAPTION_SUBSTITUTIONS)` equals `[...CAPTION_TEMPLATES]` and (b) for each, asserts the substituted form appears in the relevant rendered output. Registering a carve-out then *forces* supplying its substituted expectation. Same treatment for `INTERACTION_GATED`: assert its members are exactly the set the `PrepareScreen` interaction test covers, so the two lists cannot drift.

7. **A test that scope exclusion 2 held.** In `session.test.ts`:

   ```ts
   it('C4 added no prep* field to SessionState — step ticks and drafts stay component-local', () => {
     expect(Object.keys(initialSession).sort()).toEqual([
       'answers', 'history', 'recoveryText', 'restartConfirm', 'screen', 'trustOpen', 'voterEntryExplain',
     ])
   })
   ```

   This is the cheapest possible guard against the most likely C4 mistake, and it is the field list C5 will deliberately change.

8. **End-to-end flows.** `App.test.tsx` gains: (a) Passport `adverse` + `formal_grievance` → ESCALATE → "See my next move" → **"Prepare this for me"** → the prepare screen renders `PREP['state-5b'].title`; (b) tick every step and see the done note; (c) "Done, back to Home" lands on Home with answers cleared (assert Home's hero is present and that returning into Passport Q1 shows no pre-selected answer); (d) a WAIT state (e.g. passport `no_contact` + `no_followup` → `state-1`) shows **"Back to Home"** and no prepare CTA — the locked no-prep branch, which C4 must not regress; (e) a direct `NAVIGATE` to `'sir-prepare'` with no answers lands back on Home (the design note 3 guard).

- [ ] **Step 1: Write the failing tests** — the additions to `session.test.ts`, `App.test.tsx` and `screenCopy.test.tsx` described above.

- [ ] **Step 2: Run tests to verify they fail.**

- [ ] **Step 3: Add the three `ScreenId` members** — `npm run build` should now fail with the `never` assignment error in `App.tsx`, which is the guard working.

- [ ] **Step 4: Add the three router cases, the three `hasPrepPlan`/`onPrepare` wirings, and `RestartToHome`** in `App.tsx`.

- [ ] **Step 5: Extend `screenCopy.test.tsx`** — mount `PrepareScreen` in `UiChrome()` twice (both with `topbar={topbar(true, true)}`; the draft-bearing one uses the real `state-5a` diagnosis so `.channel-phone` renders), add the six `CAPTION_TEMPLATES` entries with their reasons, add the `INTERACTION_GATED` set with its recorded reason, and convert `'each carve-out entry still appears with its placeholder substituted'` (currently `screenCopy.test.tsx:362-372`) to drive off the carve-out set rather than the single hard-coded `ui:trust.verifiedOn`.

- [ ] **Step 6: Add the interaction-coverage test** to `src/templates/PrepareScreen.test.tsx` — one test that drives the tick/copy/edit interactions and asserts all five `INTERACTION_GATED` strings actually render, and asserts the set it covers equals `INTERACTION_GATED` itself. This is the coverage substitute for the five entries the static mount skips; without it, skipping them in the bucket sweep is just deleting coverage.

- [ ] **Step 7: Run the full suite and build** — `npx vitest run`, `npm run build`, `npm run lint`. Confirm the total is 484 + the new tests, that no pre-existing test changed its expectation, and that lint still shows exactly the 4 known warnings.

**Acceptance criteria:** all three services reach a prepare screen from Next Move; WAIT/UNCLASSIFIED states still show the locked "Back to Home" branch; "Done, back to Home" restarts; a direct navigation with no plan lands on Home; `SessionState` is unchanged apart from the `ScreenId` union; and **every new `SCREEN_COPY` entry is one of exactly three things — (a) rendered verbatim in the static mount, (b) a recorded `CAPTION_TEMPLATES` carve-out with a substituted-render test, or (c) a recorded `INTERACTION_GATED` entry with an interaction test that renders it.** No entry is skipped without falling into (b) or (c), and both sets carry their reason in-code.

- [ ] **Step 8: Commit** — `feat(c4): router wiring for the prepare screens + screen-copy coverage sweep`

---

## Out of Scope for C4 (do not build these)

- `saveControl`, `updateEntry`, casefiles, `activeCase()` / `persistCases()`, and any persistence of prep checks or the edited draft — **C5**.
- `prepChecks` / `prepDraft` / `copied` on `SessionState` — **C5**.
- `fillDraft()`, `S.caseFacts`, `S.prepFills`, `S.fillsReviewed`, the `.fill-list` / `.fill-review` panel, and `bracketHintText`'s middle branch — **C8**.
- `freshBanner(engineKey)` at the top of the prepare screen's right column — **C6**.
- `copyReminder()` (prototype 3728-3735) — it belongs to the check-in reminder line, not the prepare screen — **C5**.
- Prep plans for `s-final-absent` / `s-final-unchecked` — authoring them requires sourced content and a phase advance; see Task 1 design note 7 and the handoff notes.
- `.saved-next` / `.saved-steps` / `.saved-meta` CSS (prototype 562-568) — **C5**, even though it sits inside C4's CSS range.

## Recorded deviations from the locked prototype (decided, not open)

1. **The bracket hint is computed during render, not patched into the DOM by id.** `updateBracketHint`'s `document.getElementById('bracket-hint')` exists only because the prototype does not re-render on input. Behaviour is identical.
2. **The draft/check state lives in `useState`, not a global `S`.** Behaviour identical within a visit to the screen; the difference (state is lost on navigating away) matches the prototype's own CSS comment, *"not persisted — it's a prototype,"* and is C5's to change.
3. **The no-plan guard is a `useEffect`-dispatching `RestartToHome` component**, not an inline `restart(); return renderHome();`. Same observable behaviour, no render-phase side effect.
4. **The singular blank-count strings carry a `{n}` placeholder** (`'{n} blank in [brackets]…'`) rather than a hard-coded `1`, so all four count strings are uniformly registered templates. The rendered text is byte-identical to the prototype's for n=1.
5. **`sources/manifest.json`'s `29 Oct` `meaning` gains one sentence** recording the per-`at` carve-out for `sir:PREP.s-notice.steps[3]` (Task 1 design note 4). No sourced value changes.
6. **`retiredActionFindings` gains an optional third parameter.** A harness signature change, additive and defaulted, made because `contentSafety.ts`'s own comment names C4 as the chunk that must extend that scan's input (Task 1 design note 8). Every existing call site is behaviour-identical.
7. **`PrepareScreen.tsx` lives in `src/templates/`, beside `DiagnosisScreen` and `NextMoveScreen`**, not in a new `src/screens/prepare/`. It is the third service-agnostic screen all three services render through, so it joins the family that already exists rather than starting a second convention. See the File Structure note.

## Open questions — RESOLVED by plan review (rulings, not open items)

All seven were ruled on in review. They are kept here with their resolutions rather than deleted, so the reasoning is on the record for C5-C8.

1. **The two `because` exemptions (Task 1 design note 5) — RESOLVED: exemptions stand, reasoning rebased.** The exemptions are correct, but *first-person voice* is not what makes them safe — that alone is a real loophole, since a first-person sentence can assert a specific cause (blaming a named official, say) and still violate §7's purpose. **The load-bearing condition is that the cause is an UNFILLED `[bracket]` the citizen supplies.** Each row's `reason` is written that way round, with first-person voice demoted to a supporting observation, and the criterion is made executable by `prep.test.ts`'s `DRAFT_CAUSAL_EXEMPTIONS` test (finding 10). The locked draft copy is not reworded.

2. **The `29 Oct` `allowed_in` addition — RESOLVED: allowed, with precise per-`at` wording.** The strongest evidence is commit **`2958d37`** (*"Chunk 1: correct SIR filing deadlines…"*), the deliberate remediation that replaced an old *"before 29 Oct"* filing instruction with the current form; the manifest's own `s-notice` note records that outcome and names it as the sanctioned target form. The `meaning` amendment is a **per-`at` allowlist entry, not a class-level permission for prep steps** — exact wording in Task 1 design note 4. Also recorded there: `30 Sep`'s *"anything the citizen must file cites this, never 29 Oct"* does **not** conflict, because 30 Sep governs claims and objections, and `s-notice` is a response to a notice already served.

3. **`s-final-absent` / `s-final-unchecked` shipping with no prep plan — RESOLVED: pin with a test; do not author content now.** Authoring prep plans for two dormant rules would be invented copy, which this chunk forbids. Both are verified unreachable today (`SIR_Q1_OPTIONS_FOR.final_roll` only, and Delhi — the only supported state — is on `claims_notice`). **Precision the review required, now folded into design note 7:** only **one** of the two tests actually breaks on a phase advance. The "recorded exceptions are only reachable in a phase no supported state is in" test reads live config and goes red; the completeness test computes from static data and does **not** change. The live test carries an inline assertion message naming both rule ids and stating that authoring their prep plans is a **prerequisite** for the phase advance — necessary because `sirPlaybook.ts`'s own comment calls a phase advance *"a one-line config change touching no engine code."*

4. **`prep.ts` in `src/playbooks/` — RESOLVED: correct as proposed, no change.** The `sirPlaybook.ts` `CopyLocation` / `sirCopyExtras()` precedent is exact, and PREP is rule-keyed citizen-facing content requiring the §7 scan — i.e. playbook data. This is independent of the component's location, which moved to `src/templates/` for a different reason (see deviation 7 above).

5. **The two new C4-invented guardrails (step-URL and phone provenance) — RESOLVED: keep both.** The URL guardrail is free and confirmed correct: PREP's four step URLs are exactly the union of shipped `where.url` values. The phone guardrail **had to be fixed before shipping** — as first written its regex never matched `1950`, the very number it claimed to check. Fixed in design note 6: a two-shape extraction, `2026` excluded as a sourced year with the reason recorded, and an explicit `expect(found).toContain('1950')` regression pin.

6. **"The helpline row cannot render with today's data" — RESOLVED: FALSE PREMISE, question withdrawn.** `passportPlaybook.ts:161-165` gives `state-5a` a `where.phone` of `1800-258-1800`; `state-5a` is `FOLLOW_UP`, reachable via `{ q1: 'adverse', q2: 'informal' }`, and `PREP['state-5a']` exists. The helpline row is live today. Every test and mount that touched this now uses the real `state-5a` diagnosis; **no synthetic `where` spread survives anywhere in the plan.** Task 3 design note 5, Task 1 design note 6 and Task 6 design note 5 were all corrected. (The related C2 observation — that some PREP steps name a phone in prose — is not a defect and needs no C2 finding: `state-5a` states it structurally as well.)

7. **Task 4 / Task 5 split — RESOLVED: keep the split.** The async/timer/clipboard state machine deserves its own reviewable diff. The review noted this is self-evidencing: the two most serious test-quality findings (the `userEvent` bracket bug and the empty test bodies) landed almost entirely inside Tasks 4 and 5, which is what a correct risk isolation looks like.

## Handoff notes for C5 (recorded now so they aren't rediscovered)

- **Prep step ticks and the edited draft are `useState` inside `src/templates/PrepareScreen.tsx`.** C5 lifts them into `SessionState` (`prepChecks`, `prepDraft`) and re-wires `togglePrepStep` to the `activeCase()` / `caseSnapshot()` / `persistCases()` sync at prototype 3689-3693. `session.test.ts` carries a field-list assertion that will fail when you do — update it deliberately, do not delete it.
- **Authoring prep plans for `s-final-absent` and `s-final-unchecked` is a PREREQUISITE for advancing any supported state to `final_roll`** — not a follow-up. `prep.test.ts`'s "recorded exceptions are only reachable in a phase no supported state is in" test goes red on that advance and says so in its assertion message. The completeness test does not; it computes from static data and will keep passing while the gap is live.
- **`saveControl(engineKey, serviceLabel, engineKey+'-prepare', done)` (prototype 3817) slots in as the last child of the prepare screen's right column**, after "Done, back to Home". Note it takes `done` (the tick count) as a fourth argument — that is the casefile snapshot's step progress, and it is the reason C5 needs the tick state in the reducer.
- **`.saved-next` / `.saved-steps` / `.saved-meta` CSS is prototype lines 562-568**, physically interleaved into C4's prepare CSS block and deliberately skipped. Lift it with the rest of C5's casefile styles.
- **`copyReminder()` (prototype 3728-3735)** is the check-in reminder line's clipboard helper. C4 ported only `copyDraft`'s shape; C5 can reuse the same try/reject/fallback structure.
- **The prepare screen's own CSS comment still says "not persisted — it's a prototype."** That becomes false the moment C5 persists tick state; update the comment in the same commit.

## Handoff notes for C6

- `freshBanner(engineKey)` mounts as the **first child of the prepare screen's right column** (prototype 3770), the same position it takes on Diagnosis and Next Move. **This note also exists in code**, as a comment at that exact spot in `src/templates/PrepareScreen.tsx` (Task 3 Step 4), matching how `NextMoveScreen.tsx:5-9` carries its own seam note — a handoff section in a plan file is not discoverable from the file someone is editing.
- Task 1 added five `allowed_in` entries and one `meaning` amendment to `sources/manifest.json`. C6's freshness job rewrites `captured` dates; it must not touch `sourced_dates`' `allowed_in` arrays, which are content-location allowlists, not freshness state.

## Handoff notes for C8 (describe-it)

- **`fillDraft()`, `S.prepFills`, `S.fillsReviewed` and the `.fill-list` / `.fill-review` panel are entirely unbuilt** — not stubbed, not commented out. C8 adds: the fill substitution over `prep.draft` before it seeds the textarea, the fills-review panel (prototype 3779-3786), the **third** branch of the bracket hint (`fills>0 && !fillsReviewed` → *"All blanks filled. Check the details filled from your text below."*, prototype 3718), and the `.fill-list` / `.fill-review` CSS (prototype 984-994, which C4 deliberately left unlifted).
- The `PrepareScreen` seam for this is the `useState` initialiser: today `useState(prep.draft ?? '')`, and C8 replaces it with the filled text plus a fills list. Everything downstream (hint, copy, bracket count) already operates on the edited value and needs no change.
- **When C8 lands, `ui:prepare.hintReady` may leave `INTERACTION_GATED`.** It is interaction-gated today only because all seven shipped drafts contain brackets, so a static mount can never render a zero-bracket draft. A filled draft can reach zero brackets, so a C8 mount could produce the string verbatim — check the set at that point rather than carrying a stale carve-out.
