# C3 — Shared Templates + Question Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build NextMove's first real UI layer — the v2 visual world, the session state machine, the question screens (Passport / Voter / SIR) with recovery and answer-reset semantics, and the two shared render templates (Diagnosis, Next Move) with trust disclosure and restart confirmation — chunk C3 of `NextMove_Implementation_Plan_FINAL.md` §9 ("Shared templates + question flows. The visual system, Diagnosis/Next Move templates, question screens, recovery, trust disclosure, restart confirm").

**Architecture:** C3 is presentation plus one session reducer. It consumes C1's engine (`diagnose`, `applyCorrection`, `decorateStageRung`, `sirCoverage`, `optionsForPhase`) and C2's data (`ENGINES`, `DEPS_FOR`, `SIR_STATES`, `SIR_Q1_OPTIONS_FOR`, `PASSPORT_STAGE_SHORT`) **unchanged**. No new rule content, no new engine logic, no `if` statement about a government or ECI process anywhere in a component (implementation plan §3/§4). The design authority for every token value, class name, markup structure and copy string is the locked prototype `design/nextmove-v1-prototype.html` at git tag `v1-design-lock-2` (commit `91ff7a1`). **Nothing in this chunk is authored: every token, class and citizen-facing string is a transcription.** Extract it programmatically, never by eye:

```bash
git show 91ff7a1:design/nextmove-v1-prototype.html | sed -n '105,143p'    # tokens
git show 91ff7a1:design/nextmove-v1-prototype.html | sed -n '145,531p'    # component CSS
git show 91ff7a1:design/nextmove-v1-prototype.html | sed -n '3581,3611p'  # renderDiagnosis
```

**Tech Stack:** React 19 + TypeScript (strict) + Vite, Vitest + jsdom + React Testing Library (`vite.config.ts` already configures `environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/test/setup.ts']`). No new dependencies.

**Baseline:** branch `c3-templates`, based on `c2-playbooks` tip `c3bf48c`. `npx vitest run` → **285/285 passing**. `npm run build` green.

---

## Global Constraints

Carried forward from C1 and C2 (still binding), plus C3-specific additions.

- **Never invent copy, tokens, or markup.** Every hex value, class name, headline, field key, button label and disclaimer sentence is transcribed byte-for-byte from the locked prototype at the line ranges each task names. If a transcription looks wrong, stop and raise it — do not "improve" it.
- **A declared guardrail without an executable test is a defect** (standing project rule). Every guardrail this chunk claims ships with a test that fails when the guardrail is violated. C3 inherits two guardrails C2 deferred here by name: the **token perceptual-distance (ΔE) floor** (Task 1) and the **SIR coverage spy test** (Task 5).
- **Government-process rules never live in components.** A component receives a `Diagnosis` and renders it. The only permitted service branching in a component is *structural* (does this service have a case trail? does this state have a dependency to show?), never *substantive* (what does this state mean?).
- `Diagnosis` is **always derived fresh** from the current answers via `diagnose(engine, answers)` at render time — never stored in session state, never memoised across an answer change (implementation plan §5).
- **Never `dangerouslySetInnerHTML` a data field.** `RuleContent.needList` exists precisely so `s-notice`'s list renders as JSX. Renderers prefer `needList` over `need` when present (C1 `types.ts`, line 49-53).
- **C3 extends the guardrail input, it does not fork the harness.** `runGuardrailSuite(playbook, { extra })` takes any `CopyString[]`; C3's screen copy joins the same scan (Task 9). Every screen-copy location carries a mandatory `serviceId:` (or `ui:`) prefix, like every other `CopyString.at`.
- **C1's "toy fixtures must be obviously fake" rule still binds** for unit tests of shared primitives. Integration tests (Tasks 4-5, 9) deliberately use the real engines — that is the point of them.
- TypeScript strict mode stays on; `npm run build` (`tsc -b && vite build`) must pass at the end of every task. `npm run lint` (oxlint) must stay clean.
- Run tests with `npm test -- <path>` or `npx vitest run <path>`.
- **Accessibility is a per-task acceptance criterion, not a final pass.** Every interactive control is a real `<button>`/`<a>`/`<textarea>`; focus rings are ink (`outline:2.5px solid var(--ink)`), never butter — the prototype's own comment records that butter-deep measured 1.58:1 on paper and WCAG needs 3:1. Every decorative element (`.gems`) is `aria-hidden`.
- **`prefers-reduced-motion` is honoured by the lifted CSS block (prototype lines 1005-1008) and must not be dropped.** The same lift range (996-1008) also carries the `#app.settled` animation-suppression rule (999-1002) — the rule that stops the Diagnosis choreography replaying on a same-screen re-render. Both are behaviour, not decoration; see Task 1 Step 5 and Task 9 design note 6.
- End every git commit message with these two lines (verbatim, as the final lines):

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8
  ```

  **This is deliberate and is NOT a mistake to "correct".** The NextMove project routes its commits to Fable per a standing user instruction; `git log c2-playbooks -3` shows `Claude Fable 5` on every C2 commit, `91ff7a1` (the design lock) carries it, and both the C1 and C2 plan documents mandate it in their own Global Constraints. A session whose harness attribution says a different model name must still write `Claude Fable 5` here — this is the known recurring `[[session-attribution-overrides-project-commit-convention]]` conflict, and for this repository the **project convention wins**. The `Claude-Session:` URL is unchanged across C1, C2, C3 and the design lock.

---

## File Structure

```
index.html                              (MODIFY — Google Fonts link, prototype line 103)
src/
  index.css                             (REWRITE — Task 1: lifted tokens + component CSS)
  ui/
    color.ts                            (NEW — Task 1: hex->Lab, deltaE, contrastRatio; TEST-ONLY math, app-safe)
    tokens.ts                           (NEW — Task 1: typed token map, single source of truth)
    tokens.test.ts                      (NEW — Task 1: fidelity + ΔE floor + AA contrast)
    icons.tsx                           (NEW — Task 3: ICONS as JSX components)
    Topbar.tsx                          (NEW — Task 3: brand, Back, Restart + restart-confirm)
    Topbar.test.tsx                     (NEW — Task 3)
    Crumbs.tsx                          (NEW — Task 3: crumbs / phaseEyebrow)
    Split.tsx                           (NEW — Task 3: splitCols + Stage + Narrow)
    AnswerRow.tsx                       (NEW — Task 3)
    AnswerRow.test.tsx                  (NEW — Task 3)
    Button.tsx                          (NEW — Task 3: btn-primary / btn-secondary / btn-block)
    StatusStamp.tsx                     (NEW — Task 3: stampClass/stampLabel/stampIcon)
    StatusStamp.test.tsx                (NEW — Task 3)
    Gems.tsx                            (NEW — Task 3: decorative, aria-hidden)
    Banner.tsx                          (NEW — Task 3)
  session/
    session.ts                          (NEW — Task 2: SessionState + sessionReducer)
    session.test.ts                     (NEW — Task 2)
  screens/
    labels.ts                           (NEW — Task 4/5: labelMap + all question label maps)
    Home.tsx                            (NEW — Task 9)
    OtherServices.tsx                   (NEW — Task 9)
    passport/
      PassportScreens.tsx               (NEW — Task 4: guardrail, out-of-scope, Q1, Q2)
      PassportRecovery.tsx              (NEW — Task 4: entry, paste, show-me + PASTE_MATCH_EXAMPLES)
      passportFlow.test.tsx             (NEW — Task 4)
    voter/
      VoterScreens.tsx                  (NEW — Task 5: entry + inline explainer, Q1, Q2)
      voterFlow.test.tsx                (NEW — Task 5)
    sir/
      SirScreens.tsx                    (NEW — Task 5: state select, unsupported, Q1)
      sirFlow.test.tsx                  (NEW — Task 5: includes the coverage SPY test)
    screenCopy.ts                       (NEW — Task 9: SCREEN_COPY, the SINGLE definition
                                         site for every authored C3 string. Plain data,
                                         local {at,text} type, NEVER imports guardrails/)
    screenCopy.test.ts                  (NEW — Task 9: screen copy through runGuardrailSuite)
  templates/
    CaseTrail.tsx                       (NEW — Task 6: passportTrailFor + <CaseTrail>)
    DiagnosisScreen.tsx                 (NEW — Task 6: the shared Diagnosis template)
    DiagnosisScreen.test.tsx            (NEW — Task 6)
    TrustDisclosure.tsx                 (NEW — Task 6: consumed by BOTH templates, so it is
                                         built with the first of them, not the second)
    TrustDisclosure.test.tsx            (NEW — Task 6)
    NextMoveScreen.tsx                  (NEW — Task 7: the shared Next Move template)
    NextMoveScreen.test.tsx             (NEW — Task 7)
    ladder.ts                           (NEW — Task 8: LADDER_DEFS + ladderFor + LADDER_TAG)
    ladder.test.ts                      (NEW — Task 8)
  App.tsx                               (REWRITE — Task 9: the router)
  App.test.tsx                          (NEW — Task 9: end-to-end flow tests)
```

**Deliberately NOT built in C3, though an earlier draft of this plan placed it here:** `src/templates/EscalationLadder.tsx` and its CSS (prototype lines 801-826). Both move to **C5**, which owns `renderCasefile` — the ladder's only mount point in the locked design (prototype line 2920). C3 ships the pure logic and its tests (`ladder.ts` / `ladder.test.ts`, Task 8). Rationale in Open Question 1's ruling.

**Untouched by C3:** everything under `src/domain/` and `src/playbooks/`, and `sources/`. If a task appears to need a change there, stop and raise it — that is a signal the port is wrong, not the data.

---

### Task 1: The v2 visual world — tokens, lifted CSS, and the ΔE floor guardrail

**Files:**
- Create: `src/ui/color.ts`, `src/ui/tokens.ts`, `src/ui/tokens.test.ts`
- Modify: `src/index.css` (rewrite), `index.html`

**Interfaces:**
- Consumes: nothing (this is the base layer).
- Produces: `TOKENS` (typed `Record<TokenName, string>`), `STATUS_FILLS`, and a stylesheet exposing every token as a CSS custom property plus the prototype's component classes.

**Design notes:**

1. **The CSS is lifted verbatim, not re-expressed as Tailwind utilities, and `@import "tailwindcss";` is dropped entirely.** *Recorded deviation from the plan docs' stated stack* (`NextMove_Implementation_Plan_FINAL.md` §1 names Tailwind). Rationale: the design lock is hand-authored CSS with load-bearing keyframes, `::after` marker strokes, `nth-child` stagger delays and a `prefers-reduced-motion` collapse. Re-expressing that as utility classes would be a *reinterpretation* of a locked design, and the project's standing rule is that nothing in a build chunk is authored.

   **The import goes too, and preflight is the reason.** The prototype ships its own complete reset (lines 145-163) and was authored against browser defaults, not against Tailwind preflight — so layering preflight underneath it changes rendering wherever the prototype relies on a UA default. **Verified instance:** prototype line 487 is `.need-list{margin:6px 0 0; padding:0 0 0 20px;}` with **no `list-style` declaration**; the bullets come from the UA default `list-style: disc`. Tailwind v4 preflight sets `ol, ul, menu { list-style: none; margin: 0; padding: 0; }`, so lifting the sheet under preflight would ship `s-notice`'s "what you'll need" document list **without markers** — a visible divergence from the locked design that Task 7's `.need-list li` count test would still pass straight through. Preflight is not neutral here; it is provably harmful, and this task's own acceptance criterion already says no Tailwind class is required for any prototype component to render. Nothing else in C3 uses a Tailwind utility.

   The risk is narrow, not broad — the other likely preflight collisions are already overridden by the prototype's own rules (`h1.headline` / `h2.headline` / `.hero-h1` / `.reveal-headline` all set their own `font-size`/`font-weight`; `.svc`, `.arow`, `.btn`, `.brand`, `.ctrl-link` each set their own `cursor` and borders) — but "narrow" is not "none", and a locked design does not get silently restyled by a reset it never saw.

   **Scope of the removal:** delete the `@import "tailwindcss";` line and every `@apply` directive from `src/index.css` (the rewrite removes them by construction, since the new file is a verbatim lift). **Leave `tailwindcss` / `@tailwindcss/vite` in `package.json` and the `tailwindcss()` plugin in `vite.config.ts`** — an unused plugin over a sheet with no Tailwind syntax is inert, and pulling a dependency is a bigger change than this task owns. Note that `src/App.tsx`'s current placeholder markup uses Tailwind utility classes and will render unstyled between Task 1 and Task 9; Task 9 rewrites that file, so no shipped screen is affected.
2. **`src/ui/tokens.ts` is the single source of truth, and the stylesheet is generated from it in the test, not by hand.** The fidelity test reads the committed `index.css` and asserts every `--name: value` pair matches `TOKENS`, so the two can never drift.
3. **The ΔE floor test is C2's explicitly-deferred guardrail** (`C2 plan → "Out of Scope for C2": "C3 owns it, and C3 must not consider its visual system done without it"`), and its scope is narrower than "every non-status token". The rule it exists to enforce is: **no decorative *fill* may sit close enough to a reserved status *fill* to be mistaken for one.** So `NON_STATUS_TOKENS` is **decorative fill/background tokens only** — `butter`, `butter-soft`, `sq-green`, `sq-pink`, `sq-blue` — and deliberately excludes:
   - **page grounds** (`paper`, `card`) and **hairlines** (`line`, `line-strong`): a 1px stroke or a backdrop is not a classification chip, and their closeness to `--unclassified-bg` (a warm off-white *by design*) is the palette working, not failing. Measured: `line` vs `unclassified-bg` = **2.13**, `paper` vs `unclassified-bg` = **2.89**. Including them makes the guardrail unimplementable at any useful floor.
   - **every ink token** (`ink`, `ink-soft`, `ink-faint`, `butter-deep`, `done-deep`, and the four status inks): comparing an ink against a fill is the *contrast* test's job, below.
   - **`done-bg`** — a deliberate, recorded exemption; see design note 4.

   **The floor is 4, pinned from a measured matrix, not guessed.** Full CIEDE2000 (CIELAB, D65) over the decorative fills — the five scanned tokens **plus `done-bg`, shown so the exempted pair is visible rather than hidden** — against all four status fills, recomputed from scratch at plan time:

   ```
    2.80  done-bg      vs WAIT          #D9F2DF     <- EXEMPT, see note 4
    5.21  butter-soft  vs UNCLASSIFIED  #EFEAE0     <- the real minimum of the scanned set
    5.76  butter-soft  vs FOLLOW_UP     #FBEFC9
   10.60  done-bg      vs UNCLASSIFIED  #EFEAE0
   11.41  butter-soft  vs WAIT          #D9F2DF
   13.80  done-bg      vs FOLLOW_UP     #FBEFC9
   13.88  butter-soft  vs ESCALATE      #FBDFD6
   17.52  butter       vs FOLLOW_UP     #FBEFC9   ... (all remaining pairs >= 17.52)
   MIN over the scanned set (done-bg excluded) = 5.21
   historical regression: retired butter-soft #FBF0C4 vs --follow-bg = 1.75
   ```

   That leaves a workable window of `(1.75, 5.21]`. **`FLOOR = 4`** sits in it with real margin in both directions — 1.21 of headroom below the shipped minimum, 2.25 above the regression it must catch — and is comfortably above the ~2.3 just-noticeable-difference, so passing it means something. **Assert both directions**, or the test proves nothing: `#FDF8E3` (shipped) passes; `#FBF0C4` (retired) fails.

   **Do not take these figures on faith.** Step 3 implements `deltaE2000` from scratch; before pinning the constant, print the matrix from the freshly-written implementation and confirm it reproduces the numbers above. If it does not, the implementation is wrong (check it against `deltaE2000('#000000','#FFFFFF') === 100` and `deltaE2000(x, x) === 0` first) — do not adjust the floor to fit a broken metric.
4. **`--done-bg` vs `--wait-bg` measures ΔE 2.80 — a real collision, exempted on the record rather than absorbed by a low floor.** The prototype's own comment (lines 126-128) asserts the completion green is "deliberately the marker-green family, NOT the reserved WAIT status pair". The numbers do not support that as a *perceptual* claim: `#DFF3E6` and `#D9F2DF` are 2.80 apart, the same class of proximity as the retired `butter-soft`/`follow-bg` pair (1.75).

   **The ruling: exempt `done-bg`, with the reason recorded in the test file, and do not lower the floor to hide it.** Grounds: (a) its only use in C3's lifted CSS is `.lrung.done .lr-tag` (prototype 825) — a completion tint on an escalation-ladder rung tag — and the ladder component does not ship in C3 at all (Open Question 1's ruling defers it to C5), so in C3 `done-bg` is mounted on no classification surface whatsoever; (b) a rung tag reading "Done" is not a `WAIT`/`FOLLOW UP`/`ESCALATE`/`UNCLASSIFIED` chip and never appears in a stamp row. What is *not* acceptable is silence: picking a floor below 2.80 would let this pair pass unremarked, which is exactly how the `butter-soft` defect survived two passes. **C5 inherits this**: the moment `<EscalationLadder>` mounts, re-open the question of whether `--done-bg` needs a new locked value. It is in C5's handoff notes.
5. **Literal status hexes inside the lifted component CSS are invisible to both tests — a known, accepted exception.** Prototype line 336 is `.svc-icon.ic-passport{background:#DFF3E6; color:#1F6B3D;}`: `--done-bg` and the `--wait` *status ink*, hard-coded on a decorative Home service icon. Task 1's fidelity regex only sees `--name:#RRGGBB` declarations and `NON_STATUS_TOKENS` only walks `TOKENS`, so neither test can see it. **This is locked design and must not be "fixed".** It is recorded here so a later pass does not rediscover it and try to enforce the reserved-colour rule against it — and so that anyone extending the fidelity regex to raw hexes knows to allow-list this one line.

- [ ] **Step 1: Write the failing test** (`src/ui/tokens.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOKENS, STATUS_FILLS, NON_STATUS_TOKENS } from './tokens'
import { deltaE2000, contrastRatio } from './color'

// Derive the path via node:path, NOT `new URL('../index.css', import.meta.url)`.
// Vite statically rewrites that literal form into an asset-import URL, which
// under vitest's jsdom environment resolves to http://localhost:3000/... — not
// a file: URL — and fileURLToPath then throws "The URL must be of scheme file".
// guardrails/manifest.ts and guardrails/isolation.test.ts hit this in C2 and
// carry the same workaround with the same comment.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'), 'utf8')

describe('token fidelity to the locked prototype', () => {
  // Values below are transcribed from 91ff7a1:design/nextmove-v1-prototype.html
  // lines 105-143. Any change here is a design change and needs a new lock.
  it.each([
    ['paper', '#FAF7EF'], ['card', '#FFFFFF'], ['ink', '#3D241C'],
    ['ink-soft', '#5C5044'], ['ink-faint', '#756D5F'],
    ['line', '#EAE4D6'], ['line-strong', '#DCD4C2'],
    ['butter', '#F5D848'], ['butter-deep', '#E8C51F'], ['butter-soft', '#FDF8E3'],
    ['sq-green', '#2FA866'], ['sq-pink', '#F0679E'], ['sq-blue', '#5FA8E8'],
    ['done', '#2FA866'], ['done-bg', '#DFF3E6'], ['done-deep', '#20714A'],
    ['wait', '#1F6B3D'], ['wait-bg', '#D9F2DF'],
    ['follow', '#8A5A0F'], ['follow-bg', '#FBEFC9'],
    ['escalate', '#9E2F1F'], ['escalate-bg', '#FBDFD6'],
    ['unclassified', '#6B6257'], ['unclassified-bg', '#EFEAE0'],
  ])('--%s is %s', (name, value) => {
    expect(TOKENS[name as keyof typeof TOKENS]).toBe(value)
  })

  it('every token in TOKENS is declared in index.css with the same value', () => {
    for (const [name, value] of Object.entries(TOKENS)) {
      expect(css, `--${name}`).toContain(`--${name}:${value}`)
    }
  })

  it('index.css declares no colour custom property TOKENS does not know about', () => {
    const declared = [...css.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => m[1])
    for (const name of declared) expect(Object.keys(TOKENS)).toContain(name)
  })
})

describe('reserved status colours — the ΔE perceptual floor (impl plan §7)', () => {
  // CIEDE2000 (CIELAB, D65), measured across NON_STATUS_TOKENS — the
  // DECORATIVE FILL tokens only — against all four status fills. The rule
  // being enforced is "no decorative FILL may sit close enough to a
  // reserved status FILL to be mistaken for one"; grounds, hairlines and
  // inks are excluded for the reasons recorded in tokens.ts.
  //
  // Measured minimum of the scanned set: 5.21 (butter-soft vs
  // --unclassified-bg #EFEAE0). Next: 5.76 (butter-soft vs --follow-bg).
  // Every remaining pair is >= 10.60.
  // Historical regression this exists to catch: the retired
  // --butter-soft #FBF0C4 vs --follow-bg #FBEFC9 = 1.75.
  //
  // FLOOR = 4 is pinned inside the (1.75, 5.21] window that measurement
  // leaves: 1.21 of headroom under the shipped palette, 2.25 over the
  // regression, and above the ~2.3 just-noticeable-difference so that
  // clearing it means something. Do not raise it to "look stricter" —
  // 5.22+ turns the shipped palette red. Do not lower it toward 2 —
  // below JND the test proves nothing.
  const FLOOR = 4

  it.each(NON_STATUS_TOKENS)('%s clears the floor against all four status fills', name => {
    for (const [status, fill] of Object.entries(STATUS_FILLS)) {
      const d = deltaE2000(TOKENS[name], fill)
      expect(d, `${name} vs ${status} (${fill}) = ${d.toFixed(2)}`).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('would have caught the retired butter-soft #FBF0C4 against --follow-bg', () => {
    expect(deltaE2000('#FBF0C4', TOKENS['follow-bg'])).toBeLessThan(FLOOR)
  })

  it('the shipped butter-soft #FDF8E3 clears the floor against --follow-bg', () => {
    // The other half of "assert both": the fix, not just the defect.
    expect(deltaE2000(TOKENS['butter-soft'], TOKENS['follow-bg'])).toBeGreaterThanOrEqual(FLOOR)
  })

  // --done-bg is EXEMPT from the sweep above and is pinned here instead, so
  // the collision is on the record rather than hidden by a low floor.
  // See tokens.ts and Task 1 design note 4: --done-bg #DFF3E6 sits 2.80 from
  // --wait-bg #D9F2DF. C3 mounts --done-bg on nothing (its only lifted use,
  // .lrung.done .lr-tag, ships in C5 with the ladder component), so it is
  // not a classification surface here. This test FAILS THE MOMENT the gap
  // widens or narrows, forcing a fresh ruling rather than silent drift.
  it('records the known --done-bg / --wait-bg proximity instead of hiding it', () => {
    const d = deltaE2000(TOKENS['done-bg'], TOKENS['wait-bg'])
    expect(d).toBeGreaterThan(2.7)
    expect(d).toBeLessThan(2.9)
    expect(NON_STATUS_TOKENS).not.toContain('done-bg')
  })
})

describe('contrast (PRD §16 — verified at the token level before building)', () => {
  it.each([
    ['ink', 'paper', 7], ['ink', 'card', 7],
    ['ink-soft', 'paper', 7], ['ink-soft', 'card', 7],
    ['ink-faint', 'paper', 4.5], ['ink-faint', 'card', 4.5],
    ['wait', 'wait-bg', 4.5], ['follow', 'follow-bg', 4.5],
    ['escalate', 'escalate-bg', 4.5], ['unclassified', 'unclassified-bg', 4.5],
  ])('%s on %s clears %s:1', (fg, bg, min) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(min as number)
  })

  it('the focus ring is ink, never butter (butter-deep measures 1.58:1 on paper)', () => {
    expect(contrastRatio(TOKENS['butter-deep'], TOKENS.paper)).toBeLessThan(3)
    expect(css).toContain('outline:2.5px solid var(--ink)')
  })
})

describe('the stylesheet is the lifted prototype and nothing else', () => {
  it('carries no Tailwind import and no @apply directive', () => {
    // Preflight is provably harmful here: it would zero .need-list's UA
    // bullets (prototype 487 declares no list-style). Design note 1.
    expect(css).not.toContain('tailwindcss')
    expect(css).not.toContain('@apply')
  })

  it('never resets list-style, so .need-list keeps its markers', () => {
    expect(css).not.toMatch(/list-style[^;]*:\s*none/)
  })

  it('lifts the #app.settled animation suppression (prototype 999-1002)', () => {
    // Behaviour, not decoration — Task 9 depends on it. Sits inside the
    // otherwise-excluded 827-1004 block, so it is easy to lose.
    expect(css).toContain('#app.settled')
    expect(css).toContain('@media (prefers-reduced-motion:reduce)')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/ui/tokens.test.ts`. Expected: module-not-found on `./tokens` and `./color`.

- [ ] **Step 3: Implement `src/ui/color.ts`** — pure sRGB → linear → XYZ (D65) → Lab, `deltaE2000(a, b)`, and `contrastRatio(a, b)` from the WCAG relative-luminance formula. No dependencies. Keep it ~80 lines and comment the CIEDE2000 term names; it is standard maths, not a NextMove decision.

- [ ] **Step 4: Implement `src/ui/tokens.ts`**

```ts
/** The v2 visual world's colour tokens, transcribed byte-for-byte from the
 *  locked prototype (91ff7a1:design/nextmove-v1-prototype.html, lines 105-143).
 *  index.css is asserted against this map, so the two cannot drift. */
export const TOKENS = { /* ...as asserted above... */ } as const

/** Structurally reserved: no decorative element may reuse these (PRD §16).
 *  This rule was broken twice by passes that believed they were honouring
 *  it, which is why it is enforced by the ΔE floor test, not by attention. */
export const STATUS_FILLS = {
  WAIT: TOKENS['wait-bg'],
  FOLLOW_UP: TOKENS['follow-bg'],
  ESCALATE: TOKENS['escalate-bg'],
  UNCLASSIFIED: TOKENS['unclassified-bg'],
} as const

/** The DECORATIVE FILL tokens — the only ones the ΔE floor scans.
 *
 *  Hand-listed on purpose. A derived "everything that is not a status
 *  token" set is wrong for this guardrail, and measurably so: it drags in
 *  page grounds and hairlines whose closeness to --unclassified-bg (a warm
 *  off-white BY DESIGN) is the palette working, not failing —
 *  --line vs --unclassified-bg is 2.13, --paper vs --unclassified-bg is
 *  2.89 — which bottoms the scanned set out below the just-noticeable
 *  difference and leaves no floor that both passes the locked palette and
 *  catches the historical #FBF0C4 regression (1.75).
 *
 *  The rule this guardrail enforces is narrower than "tokens differ":
 *  no decorative FILL may sit close enough to a reserved status FILL to be
 *  mistaken for one. So:
 *    - grounds (paper, card) and hairlines (line, line-strong) are OUT —
 *      a backdrop and a 1px stroke are not classification chips;
 *    - every ink (ink, ink-soft, ink-faint, butter-deep, done-deep, and the
 *      four status inks) is OUT — ink-on-fill is the contrast test's job;
 *    - done-bg is OUT by a recorded, reasoned exemption: it measures 2.80
 *      from --wait-bg, which is a real collision, pinned by its own test
 *      rather than absorbed by a low floor. C3 mounts it on no
 *      classification surface (its only lifted use, .lrung.done .lr-tag,
 *      ships with the ladder component in C5). C5 must re-open the
 *      question when that component mounts. */
export const NON_STATUS_TOKENS = [
  'butter', 'butter-soft', 'sq-green', 'sq-pink', 'sq-blue',
] as const satisfies readonly (keyof typeof TOKENS)[]
```

- [ ] **Step 5: Rewrite `src/index.css`** — **no `@import "tailwindcss";`, no `@apply`** (design note 1); the file is the prototype's CSS lifted verbatim and nothing else:
  - lines **105-143** (`:root` token block, comments included — they record the contrast measurements)
  - lines **145-531** (reset through `.inline-explain-actions button`)
  - lines **996-1008** — the `#app.settled` animation-suppression rule (999-1002) with its decision-recording comment (996-998), the blank line, then the reduced-motion comment (1004) and its media query (1005-1008)

  **Why the third range is 996-1008 and not 1005-1008.** `#app.settled` is *behaviour*, not decoration: it is the rule that stops the entrance choreography replaying on a same-screen re-render (trust toggle, selection highlight, inline explainer), and Task 9 makes it an acceptance criterion. It sits inside the otherwise-excluded 827-1004 block but is not a C5/C8 rule at all, so it is lifted explicitly. Its comment and the reduced-motion comment both record design decisions, so both come along (the plan's own "keep the prototype's own explanatory comments where they record a decision"). Verified endpoints: 995 is blank, 996-998 is the comment, 999-1002 is the rule, 1003 is blank, 1004 is the reduced-motion comment, 1005-1008 is the media query, 1009 is `</style>`.

  **Deliberately NOT lifted** (later chunks own them): 532-650 (`.prep-*`, `.channel-*`, `.visit-*` → C4 — **note that 562-568 inside this range is `.saved-next` / `.saved-steps` / `.saved-meta`, which are C5 casefile styles, not C4's; C4 must not append the range blindly**), 651-800 (`.btn-ghost`, auth, `.saved-*`, `.home-cases`, `.case-*`, `.cp-*` → C5/C7), **801-826** (the ladder comment plus `.ladder`, `.lrung`, `.lr-*`, `.ladder-note` → **C5**, which owns the only screen that mounts the ladder — see Open Question 1), and 827-995 (`.update-mod`, `.ci-*`, `.journey`, `.describe-*`, `.read-*`, `.fill-review` → C5/C8).

- [ ] **Step 6: Add the font link to `index.html`** — prototype line 103, verbatim:
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&family=Work+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap">`
  Add the two `preconnect` hints for `fonts.googleapis.com` / `fonts.gstatic.com` (crossorigin) — **authored markup, not in the prototype (line 103 is the stylesheet link alone), and therefore a recorded deviation.** Keep `<html lang="en">`, `<meta charset="UTF-8">`, the viewport meta and `<title>NextMove</title>`, all already present. The mount point stays `<div id="root">`; the `#app` element the lifted CSS selects on is rendered by `App.tsx` (Task 9 design note 6), not by `index.html`.

- [ ] **Step 7: Run tests to verify they pass** — `npx vitest run src/ui/tokens.test.ts`, then `npx vitest run` (285 + new), then `npm run build`.

**Acceptance criteria:**
- Every token value in `index.css` is byte-identical to the prototype's `:root`.
- The freshly-written `deltaE2000` reproduces the design-note-3 matrix, including `deltaE2000('#000000','#FFFFFF') === 100` and `deltaE2000(x, x) === 0`. If it does not, fix the implementation — never the floor.
- The ΔE floor test fails when `--butter-soft` is set back to `#FBF0C4`, and passes at `#FDF8E3`. Verify by temporarily editing and re-running before committing the real value.
- `--ink-soft` clears 7:1 on both paper and card; `--ink-faint` clears 4.5:1 on both.
- The `--done-bg` / `--wait-bg` proximity is pinned by its own named test, and `done-bg` is provably absent from `NON_STATUS_TOKENS`.
- `index.css` contains no `@import "tailwindcss"` and no `@apply`; `npm run build` succeeds, and no Tailwind class is required for any prototype component to render correctly.
- `.need-list` renders with visible bullets (the UA default the prototype relies on is no longer overridden by preflight). Task 7 pins this by test.

- [ ] **Step 8: Commit** — `feat(c3): v2 visual world — lifted tokens, component CSS, ΔE floor guardrail`

---

### Task 2: The session state machine — nav, back, restart-confirm, answer writes

**Files:**
- Create: `src/session/session.ts`, `src/session/session.test.ts`

**Interfaces:**
- Consumes: C1's `applyCorrection`, `AnswerRecord`; C2's `DEPS_FOR`.
- Produces: `SessionState`, `initialSession`, `sessionReducer`, `SessionAction`.

**Design notes — the prototype's `S` object, split along its real seam.** The prototype's `S` holds 30+ fields spanning eight design layers. C3 ports **only** the fields its own screens read: `screen`, `history`, `answers`, `restartConfirm`, `trustOpen`, `recoveryText`, `voterEntryExplain`. Everything else (`savedCases`, `workingCase`, `user`, `ci*`, `prep*`, `describe*`, `interp`, `phaseDrift`) belongs to C4/C5/C7/C8 and is **absent, not stubbed** — a field nothing reads is a field that silently rots.

Three behaviours are load-bearing and each gets its own test:

1. **`nav` clears transient UI state.** Prototype line 2027: every navigation resets `trustOpen` and `restartConfirm`. A trust panel left open across a screen change, or a half-confirmed restart surviving a navigation, are both real bugs.
2. **Back to Home is a full restart** (prototype `back()`, line 2035, with its own comment: "Arriving at Home via Back clears the working case… Home is a clean slate, always"). Do not implement Back-to-Home as a plain history pop.
3. **Answer writes go through C1's `applyCorrection` with the service's `DEPS_FOR` map** — never `{...answers, [k]: v}`. That is what makes AC-8 (changed Q1 clears Q2) and AC-V-7 (changed voterQ1 clears the appeal answer) structural rather than screen-by-screen.
4. **`screen` and `service` are unions, not `string`.** `DEPS_FOR` is declared `Record<string, DependentKeys>` in `playbooks/engines.ts`, so `service: keyof typeof DEPS_FOR` would collapse to `string` and buy no compile-time safety at all. Declare `ServiceKey = 'passport' | 'voter' | 'sir'` (in `session.ts`; do not modify `engines.ts` — `src/playbooks/` is untouched by C3) and a `ScreenId` union of the prototype's own screen ids. C3 pays a small cost now — every id is written twice — and Task 9 gets an exhaustiveness-checked `switch` plus a compile error instead of a silent `default` fallthrough on a typo'd `NAVIGATE 'passport-q2 '`. C4/C5 extend the union when they extend the router.
5. **`voterEntryExplain` is a top-level `SessionState` field, not an answer.** The prototype puts it inside `S.answers` (line 3405: `S.answers.voterEntryExplain=true`). C3 moves it out. This is a *recorded deviation*, listed in "Recorded deviations" — it is not a transcription slip, and Task 5's `expect(s.answers).toEqual({})` after the not-sure tap is correct as written. Rationale: it is UI state, not an answer; left in `answers` it would land in `Diagnosis.matchedAnswers` and travel into the trust panel's label lookup. Behaviour is identical — the prototype clears it only via `restart()`, and C3's `RESTART` returns `initialSession`.

- [ ] **Step 1: Write the failing test** (`src/session/session.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { initialSession, sessionReducer as r } from './session'

const seq = (...actions: Parameters<typeof r>[1][]) =>
  actions.reduce((s, a) => r(s, a), initialSession)

describe('navigation', () => {
  it('pushes history and lands on the new screen', () => {
    const s = seq({ type: 'NAVIGATE', screen: 'passport-guardrail' })
    expect(s.screen).toBe('passport-guardrail')
    expect(s.history).toEqual(['home'])
  })

  it('replace navigation does not push history (recovery "show me where")', () => {
    const s = seq(
      { type: 'NAVIGATE', screen: 'passport-q1' },
      { type: 'NAVIGATE', screen: 'passport-recovery' },
      { type: 'NAVIGATE', screen: 'passport-q1', replace: true },
    )
    expect(s.history).toEqual(['home', 'passport-q1'])
  })

  it('clears trustOpen and restartConfirm on every navigation', () => {
    const s = seq(
      { type: 'NAVIGATE', screen: 'passport-diagnosis' },
      { type: 'TOGGLE_TRUST' },
      { type: 'RESTART_REQUEST' },
      { type: 'NAVIGATE', screen: 'passport-nextmove' },
    )
    expect(s.trustOpen).toBe(false)
    expect(s.restartConfirm).toBe(false)
  })
})

describe('back — AC-7: back preserves prior answers', () => {
  it('pops history and keeps every stored answer', () => {
    const s = seq(
      { type: 'NAVIGATE', screen: 'passport-q1' },
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
      { type: 'NAVIGATE', screen: 'passport-q2' },
      { type: 'ANSWER', service: 'passport', key: 'q2', value: 'no_followup' },
      { type: 'NAVIGATE', screen: 'passport-diagnosis' },
      { type: 'BACK' },
    )
    expect(s.screen).toBe('passport-q2')
    expect(s.answers).toEqual({ q1: 'no_contact', q2: 'no_followup' })
  })

  it('back to Home is a full restart, not a history pop', () => {
    const s = seq(
      { type: 'NAVIGATE', screen: 'passport-guardrail' },
      { type: 'ANSWER', service: 'passport', key: 'guardrail', value: 'no' },
      { type: 'BACK' },
    )
    expect(s.screen).toBe('home')
    expect(s.answers).toEqual({})
    expect(s.history).toEqual([])
  })
})

describe('answer writes route through applyCorrection', () => {
  it('AC-8: a changed passport q1 clears q2', () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
      { type: 'ANSWER', service: 'passport', key: 'q2', value: 'no_followup' },
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
    )
    expect(s.answers).toEqual({ q1: 'adverse' })
  })

  it('AC-7: re-picking the SAME q1 does not clear q2', () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
      { type: 'ANSWER', service: 'passport', key: 'q2', value: 'informal' },
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
    )
    expect(s.answers).toEqual({ q1: 'no_contact', q2: 'informal' })
  })

  it('AC-V-7: a changed voterQ1 clears BOTH voterAppealed and voterAppealedRaw', () => {
    const s = seq(
      { type: 'ANSWER', service: 'voter', key: 'voterQ1', value: 'decision' },
      { type: 'ANSWER', service: 'voter', key: 'voterAppealedRaw', value: 'pending' },
      { type: 'ANSWER', service: 'voter', key: 'voterAppealed', value: 'pending' },
      { type: 'ANSWER', service: 'voter', key: 'voterQ1', value: 'no_word' },
    )
    expect(s.answers).toEqual({ voterQ1: 'no_word' })
  })
})

describe('restart — AC-9 + PRD §15 inline confirmation', () => {
  it('RESTART_REQUEST only arms the confirm; it clears nothing', () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
      { type: 'NAVIGATE', screen: 'passport-q2' },
      { type: 'RESTART_REQUEST' },
    )
    expect(s.restartConfirm).toBe(true)
    expect(s.answers).toEqual({ q1: 'adverse' })
    expect(s.screen).toBe('passport-q2')
  })

  it('RESTART_CANCEL leaves all state untouched', () => {
    const armed = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
      { type: 'NAVIGATE', screen: 'passport-q2' },
      { type: 'RESTART_REQUEST' },
    )
    const s = r(armed, { type: 'RESTART_CANCEL' })
    expect(s.restartConfirm).toBe(false)
    expect(s.answers).toEqual({ q1: 'adverse' })
    expect(s.screen).toBe('passport-q2')
  })

  it('RESTART clears answers, history and every transient flag, and returns Home', () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
      { type: 'NAVIGATE', screen: 'passport-diagnosis' },
      { type: 'TOGGLE_TRUST' },
      { type: 'SET_RECOVERY_TEXT', text: 'something' },
      { type: 'RESTART' },
    )
    expect(s).toEqual(initialSession)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.**

- [ ] **Step 3: Implement `src/session/session.ts`**

```ts
import type { AnswerRecord } from '../domain/types'
import { applyCorrection } from '../domain/answers'
import { DEPS_FOR } from '../playbooks/engines'

/** The three services C3 ships. Declared here rather than derived from
 *  DEPS_FOR, which is typed Record<string, DependentKeys> — `keyof` that is
 *  `string`, so it would type-check nothing. src/playbooks/ is untouched by
 *  C3, so this union does not move into engines.ts until a later chunk. */
export type ServiceKey = 'passport' | 'voter' | 'sir'

/** Every screen C3 routes to — the prototype's own ids (router, 3910-3944),
 *  so C4/C5 extend the union rather than renaming the graph. Typed as a
 *  union, not `string`, so Task 9's switch is exhaustiveness-checked and a
 *  typo'd id is a compile error instead of a silent `default`. */
export type ScreenId =
  | 'home' | 'other-services'
  | 'passport-guardrail' | 'passport-outofscope' | 'passport-q1' | 'passport-q2'
  | 'passport-recovery' | 'passport-recovery-paste' | 'passport-recovery-show'
  | 'passport-diagnosis' | 'passport-nextmove'
  | 'voter-entry' | 'voter-q1' | 'voter-q2' | 'voter-diagnosis' | 'voter-nextmove'
  | 'sir-state' | 'sir-unsupported' | 'sir-q1' | 'sir-diagnosis' | 'sir-nextmove'
// Transcribe the exact id list from the prototype's own switch (3910-3944),
// taking only C3's screens; do not invent or normalise a name.

/** C3's slice of the prototype's `S`. Fields belonging to later chunks
 *  (savedCases, workingCase, user, ci*, prep*, describe*, interp) are
 *  ABSENT on purpose — a field nothing reads is a field that rots. */
export interface SessionState {
  screen: ScreenId
  history: ScreenId[]
  answers: AnswerRecord
  restartConfirm: boolean
  trustOpen: boolean
  recoveryText: string
  /** The voter entry question's inline not-sure explainer (FR-V-03):
   *  "I'm not sure" EXPLAINS in place, it does not exit the flow (AC-V-2).
   *  RECORDED DEVIATION: the prototype stores this inside S.answers
   *  (line 3405). It is UI state, not an answer — in `answers` it would
   *  land in Diagnosis.matchedAnswers and reach the trust panel. Same
   *  behaviour: the prototype clears it only via restart(), and RESTART
   *  returns initialSession. */
  voterEntryExplain: boolean
}

export const initialSession: SessionState = {
  screen: 'home', history: [], answers: {},
  restartConfirm: false, trustOpen: false,
  recoveryText: '', voterEntryExplain: false,
}

export type SessionAction =
  | { type: 'NAVIGATE'; screen: ScreenId; replace?: boolean }
  | { type: 'BACK' }
  | { type: 'ANSWER'; service: ServiceKey; key: string; value: string }
  | { type: 'RESTART_REQUEST' } | { type: 'RESTART_CANCEL' } | { type: 'RESTART' }
  | { type: 'TOGGLE_TRUST' }
  | { type: 'SET_RECOVERY_TEXT'; text: string }
  | { type: 'EXPLAIN_VOTER_ENTRY' }

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'NAVIGATE':
      return {
        ...s,
        history: a.replace ? s.history : [...s.history, s.screen],
        screen: a.screen,
        trustOpen: false, restartConfirm: false,
      }
    case 'BACK': {
      if (s.history.length === 0) return s
      const history = s.history.slice(0, -1)
      const prev = s.history[s.history.length - 1]
      // Home is a clean slate, always (prototype back(), line 2035).
      if (prev === 'home') return initialSession
      return { ...s, screen: prev, history, trustOpen: false, restartConfirm: false }
    }
    case 'ANSWER': {
      const { answers } = applyCorrection(s.answers, a.key, a.value, DEPS_FOR[a.service])
      return answers === s.answers ? s : { ...s, answers }
    }
    case 'RESTART_REQUEST': return { ...s, restartConfirm: true }
    case 'RESTART_CANCEL': return { ...s, restartConfirm: false }
    case 'RESTART': return initialSession
    case 'TOGGLE_TRUST': return { ...s, trustOpen: !s.trustOpen }
    case 'SET_RECOVERY_TEXT': return { ...s, recoveryText: a.text }
    case 'EXPLAIN_VOTER_ENTRY': return { ...s, voterEntryExplain: true }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass.** Then `npx vitest run` and `npm run build`.

**Acceptance criteria:** AC-7, AC-8, AC-V-7, AC-9 are each pinned by a named test. `applyCorrection` is the only path that writes an answer. No later-chunk field appears in `SessionState`. `screen`/`history`/`service` are unions, not `string` — a bogus screen id or service name is a compile error.

- [ ] **Step 5: Commit** — `feat(c3): session state machine — nav/back/restart-confirm, answer writes via applyCorrection`

---

### Task 3: Shared chrome and primitives

**Files:**
- Create: `src/ui/icons.tsx`, `Topbar.tsx`, `Crumbs.tsx`, `Split.tsx`, `AnswerRow.tsx`, `Button.tsx`, `StatusStamp.tsx`, `Gems.tsx`, `Banner.tsx`, and `Topbar.test.tsx`, `AnswerRow.test.tsx`, `StatusStamp.test.tsx`

**Interfaces:**
- Consumes: Task 1's CSS classes, Task 2's `SessionState`/dispatch.
- Produces: the primitives every screen composes from.

**Design notes:**
- **`icons.tsx`** ports the prototype's `ICONS` object (lines **2198-2219** — 2220-2221 is the `gems` comment, not part of the object) as JSX components, SVG path data byte-identical. `brandMark`, `check` and `stepCheck` carry hard-coded hexes in the prototype (`#F5D848`/`#3D241C`/`#FAF7EF`) — keep them, but reference `TOKENS` so the ΔE test's palette stays exhaustive.
- **`Topbar`** ports lines **2262-2280** and `restartControl` (**2299-2307**). It renders the account chip's *slot* as nothing (C7). **`showBack`/`showRestart` are props**, because Home passes `topbar(false,false)`.
- **The restart confirm copy is exact:** the prompt is `Clear your answers?`, the affirmative button reads `Yes` and carries `.yes`, the negative reads `Cancel` and carries `.no`. The control before arming reads `Restart`; Back reads `← Back`. **When there are no answers, `Restart` restarts immediately with no confirmation** (prototype: `hasAnswers ? arm : restart()`) — that is deliberate, not a missed case.
- **`AnswerRow`** ports lines **2327-2337**. The critical requirement from PRD §15 is that **"I'm not sure" gets the identical row treatment** — same `.arow` markup, same list, no demotion. The test asserts the not-sure row's `className` equals a normal row's.
- **`AnswerRow` carries NO ARIA state attribute.** An earlier draft of this plan gave it `aria-pressed`; that is the wrong ARIA and is dropped. These buttons are not toggles — they navigate immediately and the screen changes underneath them, so a pressed state is never observable and would mis-describe the control. The `.selected` class already carries the returned-to-answer affordance visually (prototype 2328-2329), and the row's own label is its accessible name. No `aria-pressed`, no `aria-current`; the port stays a transcription with nothing authored. The second `AnswerRow` test asserts `.selected` on the class list, not an ARIA attribute.
- **`StatusStamp`** ports `stampClass`/`stampLabel`/`stampIcon` (**2338-2347** — 2348-2356 is the `labelMap` comment, which belongs with `labelMap` in Task 4). `FOLLOW_UP` renders as `FOLLOW UP` (space, not underscore). Markup is the prototype's exactly: `<span class="stamp {cls}"><span class="stamp-icon">{svg}</span>{label}</span>` (line 3594).
- **The stamp carries no ARIA role.** An earlier draft gave it `role="status"`; that is dropped, and this is now a *reduction* in authored markup rather than a deviation. `role="status"` is an `aria-live="polite"` region: the stamp's label is already visible text, so it is announced by simply existing, and the live region would additionally **re-announce on every same-screen re-render** — every trust toggle, every selection — which is precisely the noise the lifted `#app.settled` rule exists to suppress visually. Instead: the classification is plain text inside the stamp, and the decorative glyph span gets `aria-hidden="true"` (consistent with the Global Constraint that already covers `.gems`, not a new invention). **Tests select the stamp by its locked class: `document.querySelector('.stamp')`** — the same idiom the plan already uses for `.dep-v`, `.reveal-headline .mark` and `.ct-step.current`, and safe because `.stamp-icon` is a different class token. This decision is applied consistently in Tasks 5, 6, 7 and 9; **no test anywhere in C3 queries `getByRole('status')`.**
- **`Gems`** is decoration only: `aria-hidden="true"`, `pointer-events:none`, two layouts (`hero`, `reveal`), hidden below 600px by the lifted CSS.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/Topbar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Topbar } from './Topbar'

describe('restart confirmation (PRD §15, AC-9)', () => {
  it('with answers, Restart arms an inline confirm instead of clearing', async () => {
    const dispatch = vi.fn()
    render(<Topbar showBack showRestart hasAnswers restartConfirm={false} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART_REQUEST' })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'RESTART' })
  })

  it('the armed confirm reads exactly "Clear your answers?" with Yes / Cancel', () => {
    render(<Topbar showBack showRestart hasAnswers restartConfirm dispatch={vi.fn()} />)
    expect(screen.getByText('Clear your answers?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveClass('yes')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('no')
  })

  it('Cancel dispatches RESTART_CANCEL, Yes dispatches RESTART', async () => { /* ... */ })

  it('with no answers, Restart restarts immediately (nothing to lose)', async () => {
    const dispatch = vi.fn()
    render(<Topbar showBack showRestart hasAnswers={false} restartConfirm={false} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
  })

  it('Home hides both Back and Restart', () => {
    render(<Topbar showBack={false} showRestart={false} hasAnswers={false} restartConfirm={false} dispatch={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '← Back' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull()
  })
})
```

```tsx
// src/ui/StatusStamp.test.tsx
it.each([
  ['WAIT', 'WAIT', 'wait'],
  ['FOLLOW_UP', 'FOLLOW UP', 'follow'],
  ['ESCALATE', 'ESCALATE', 'escalate'],
  ['UNCLASSIFIED', 'UNCLASSIFIED', 'unclassified'],
])('%s renders label %s with class .stamp.%s', (rec, label, cls) => {
  const { container } = render(<StatusStamp rec={rec as Classification} />)
  const el = container.querySelector('.stamp')!
  expect(el).toHaveTextContent(label)
  expect(el).toHaveClass('stamp', cls)
})

it('carries no ARIA role — the label is visible text, not a live region', () => {
  const { container } = render(<StatusStamp rec="ESCALATE" />)
  expect(container.querySelector('.stamp')).not.toHaveAttribute('role')
  expect(container.querySelector('.stamp-icon')).toHaveAttribute('aria-hidden', 'true')
})
```

```tsx
// src/ui/AnswerRow.test.tsx
it('PRD §15: "I\'m not sure" carries the SAME row treatment as every other option', () => {
  const { rerender } = render(<AnswerRow value="adverse" label="Something negative" selected={false} onSelect={vi.fn()} />)
  const normal = screen.getByRole('button').className
  rerender(<AnswerRow value="not_sure" label="I'm not sure" sub="Show me how to find out" selected={false} onSelect={vi.fn()} />)
  expect(screen.getByRole('button').className).toBe(normal)
})

it('a selected row gets .selected, and carries no ARIA state attribute', () => {
  const { container } = render(
    <AnswerRow value="adverse" label="Something negative" selected onSelect={vi.fn()} />)
  const btn = container.querySelector('button')!
  expect(btn).toHaveClass('arow', 'selected')
  expect(btn).not.toHaveAttribute('aria-pressed')   // these navigate, they don't toggle
  expect(btn).not.toHaveAttribute('aria-current')
})
```

- [ ] **Step 2: Run tests to verify they fail.**
- [ ] **Step 3: Implement the primitives**, each a direct port of its prototype function. Keep the prototype's own explanatory comments where they record a decision (the focus-ring rationale, the "I'm not sure" equal-weight rule, the ESCALATE-glyph-is-not-a-warning-triangle note).
- [ ] **Step 4: Run tests to verify they pass**, then the full suite and the build.

**Acceptance criteria:** exact restart-confirm copy; `FOLLOW UP` label; not-sure row visually identical; every control is a real `<button>` reachable by keyboard with a visible ink focus ring; `Gems` is `aria-hidden`.

- [ ] **Step 5: Commit** — `feat(c3): shared chrome + primitives — topbar/restart-confirm, answer rows, status stamp, crumbs`

---

### Task 4: Passport question flow + the recovery flow

**Files:**
- Create: `src/screens/labels.ts`, `src/screens/passport/PassportScreens.tsx`, `src/screens/passport/PassportRecovery.tsx`, `src/screens/passport/passportFlow.test.tsx`

**Interfaces:**
- Consumes: Task 2's reducer, Task 3's primitives.
- Produces: `labelMap()`, `PASSPORT_Q1_LABELS`, `PASSPORT_Q2_LABELS`, `PASTE_MATCH_EXAMPLES`, `normalizePasted()`, and four screens.

**Design notes:**

1. **`labelMap` builds composite keys, always.** Prototype line 2357, and the implementation plan's §7 Trust Disclosure Labeling note: the label maps must be keyed `"questionId:value"`, and the *only* way to build them is through this helper, so a flat-keyed map can never reach the trust renderer again. Task 6's `TrustDisclosure` tests depend on this.
2. **The label maps are C3's, transcribed from the prototype at lines 3229-3235 (Passport) — C2 deliberately shipped none of them** except SIR's, where phase-gating made them structural.
3. **Recovery's "safest" branch writes `recoveryAskedSafest: 'yes'` and leaves `q1: 'not_sure'` untouched.** The prototype's comment (3275-3288) is explicit: `not_sure` matches no rule condition, so `evaluate()` reaches UNCLASSIFIED on its own; inventing a `recovery_safest` sentinel would destroy the honest answer the trust disclosure needs to show.
4. **Paste matching is exact over normalised text, never substring.** `PASTE_MATCH_EXAMPLES` (line 3297) is the authority; `normalizePasted` is `trim().toLowerCase().replace(/\s+/g,' ')`. AC-5's named regression is `"verification completed"` → UNCLASSIFIED. The retired `'verif'` substring match must not reappear in any form.

   **`matchPasted()` is an authored refactor, and a recorded deviation.** The prototype has no such function: it has `pasteMatch()` (lines 3320-3328), an *action* that reads `S.recoveryText`, writes answers and navigates. C3 splits the pure decision — `matchPasted(input) → { q1 } | { outOfScope: true } | null` — out of the side effects, so the AC-5 regressions can be pinned without rendering. The matching logic itself is transcribed unchanged. Listed in "Recorded deviations".
5. **`recoveryPastedText` is stored as an answer** so the trust disclosure can surface it (`extraToldUs`). It is not a rule input. **It is written even when the paste does not match** — prototype line 3323 runs `setAns('recoveryPastedText', S.recoveryText||'')` *before* the no-match early return on 3324. That ordering is load-bearing: it is what lets the trust panel echo what the citizen actually pasted on the very path where NextMove could not place them. Pin it with its own test; design note 5 of Task 6 relies on it for `extraToldUs`. Recorded as a deviation only in the sense that the plan now states it explicitly — the behaviour is the prototype's.
6. **Recovery's "show me where" navigates back with `replace: true`** (line **3336**, not 3339 — 3339 is the closing brace of `renderPassportRecoveryShow`) so the recovery detour does not stack in history.

- [ ] **Step 1: Write the failing tests** (`src/screens/passport/passportFlow.test.tsx`)

```tsx
import { describe, it, expect } from 'vitest'
import { normalizePasted, PASTE_MATCH_EXAMPLES, matchPasted } from './PassportRecovery'
import { labelMap, PASSPORT_Q1_LABELS } from '../labels'

describe('labelMap (impl plan §7 — the composite-key fix)', () => {
  it('produces "questionId:value" keys, never bare values', () => {
    const m = labelMap('q1', PASSPORT_Q1_LABELS)
    expect(m['q1:no_contact']).toBe("I haven't heard anything about police verification yet")
    expect(m['no_contact']).toBeUndefined()
  })
})

describe('paste matching (PRD §8a, AC-5) — exact over normalised, never substring', () => {
  it.each([
    ['Police Verification Report Has Been Received', { q1: 'verified_no_progress' }],
    ['  passport has been dispatched ', { outOfScope: true }],
    ['application has adverse report', { q1: 'adverse' }],
  ])('%s matches', (input, expected) => {
    expect(matchPasted(input)).toMatchObject(expected)
  })

  it('AC-5 regression: "verification completed" is NOT a match', () => {
    expect(matchPasted('verification completed')).toBeNull()
  })

  it('AC-5 regression: "verification incomplete" is NOT a match either', () => {
    expect(matchPasted('verification incomplete')).toBeNull()
  })

  it('the retired bare-substring "verif" match is gone', () => {
    expect(matchPasted('verif')).toBeNull()
  })

  it('every example is already normalised (so a match is symmetric)', () => {
    for (const e of PASTE_MATCH_EXAMPLES) expect(normalizePasted(e.text)).toBe(e.text)
  })
})
```

Plus rendered-flow tests driving the reducer through a test harness component:

```tsx
describe('passport flow', () => {
  it('AC-14: "Yes, I already have it" shows the guardrail exit and never reaches Q1', async () => { /* ... */ })
  it('"No, still waiting on it" routes to Q1', async () => { /* ... */ })
  it('Q1 "I\'m not sure" routes to recovery, and stores q1: not_sure', async () => { /* ... */ })
  it('AC-6: recovery "safest thing to do now" goes straight to diagnosis, q1 still not_sure', async () => {
    /* asserts answers === { guardrail:'no', q1:'not_sure', recoveryAskedSafest:'yes' } */
  })
  it('recovery "show me where" returns to Q1 with replace (no history stack growth)', async () => { /* ... */ })
  it('a matched paste sets q1 and routes to Q2', async () => { /* ... */ })
  it('an out-of-scope paste sets guardrail: yes and routes to the guardrail exit', async () => { /* ... */ })
  it('an unmatched paste routes to diagnosis with q1 still not_sure', async () => { /* ... */ })

  it('an unmatched paste STILL stores recoveryPastedText, so the trust panel echoes it', async () => {
    /* paste "something the examples do not contain", submit;
       asserts answers.recoveryPastedText === 'something the examples do not contain'
       and answers.q1 === 'not_sure'. Prototype 3323 writes it before the
       no-match return on 3324 — the echo matters MOST on the path where
       NextMove could not place the case. */
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.**
- [ ] **Step 3: Implement `src/screens/labels.ts`**

```ts
/** Every answerLabels map handed to TrustDisclosure MUST be built here, so
 *  its keys are the composite "questionId:value" form matchedAnswers is
 *  looked up by. (Fixed 2026-09-04: the per-service label objects were
 *  keyed by value alone, so "You told us" silently showed nothing for
 *  every real Passport/Voter/SIR answer.) */
export function labelMap(questionId: string, labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(labels).map(([v, l]) => [`${questionId}:${v}`, l]))
}
```
plus `PASSPORT_Q1_LABELS` / `PASSPORT_Q2_LABELS` transcribed from prototype lines 3229-3235.

- [ ] **Step 4: Implement the four Passport screens and the three recovery screens** — ports of prototype lines 3202-3357. Answer-row order is the prototype's order and is load-bearing (`.arow:nth-child(n)` drives the stagger).
- [ ] **Step 5: Run tests to verify they pass**, then the full suite and the build.

**Acceptance criteria:** AC-5, AC-6, AC-14 each pinned by name. No substring matching anywhere. `q1` is never overwritten with a sentinel on the safest path. `labelMap` is the only producer of label maps.

- [ ] **Step 6: Commit** — `feat(c3): passport question flow + recovery — exact paste matching, honest not_sure`

---

### Task 5: Voter and SIR question flows + the SIR coverage gate

**Files:**
- Create: `src/screens/voter/VoterScreens.tsx`, `src/screens/voter/voterFlow.test.tsx`, `src/screens/sir/SirScreens.tsx`, `src/screens/sir/sirFlow.test.tsx`
- Modify: `src/screens/labels.ts` (add `VOTER_Q1_LABELS`, `VOTER_APPEAL_LABELS`)

**Design notes:**

1. **The raw→normalized transform is C3's** (C2 handoff note). The screen writes **two** answers: `voterAppealedRaw` with the picked option (including `notsure`), and `voterAppealed` with `notsure` normalized to `unclassified`. The same `notsure → unclassified` normalization applies to `voterQ1` and `sirQ1`. The raw value exists so the trust disclosure can honestly echo `"I'm not sure"`; the normalized value is what the playbook reads.
2. **Two answer writes, one correction.** Writing `voterAppealedRaw` then `voterAppealed` is two `ANSWER` dispatches. `VOTER_DEPS` maps `voterQ1 → [voterAppealed, voterAppealedRaw]`, and neither of those has dependents, so the order is safe. Pin it with a test anyway.
3. **AC-V-2: the entry question's "I'm not sure" explains in place and does not exit.** It dispatches `EXPLAIN_VOTER_ENTRY`, renders the inline explainer with its two direct actions, and performs **no navigation**. It also writes **no answer** — the prototype returns before `setAns` (line 3404).
4. **`"I'm not sure"` is appended to SIR Q1 OUTSIDE the phase option set** — `optionsForPhase` returns only the phase's own options, by design (C2's `SIR_Q1_OPTIONS_FOR` docblock). Never phase-gate the escape hatch.
5. **The SIR router MUST call `sirCoverage()` before anything else** (C2 handoff, stated as a MUST): `sirEngine` has **no coverage gate of its own**, so `diagnose(sirEngine, { sirState: 'bihar', sirQ1: 'roll_absent' })` will happily return a real diagnosis. And `optionsForPhase` **throws** for unsupported states, so it must never be called before the gate either.
6. **This task owns C2's deferred coverage SPY test** — §8's "assert `evaluate` is not invoked on the unsupported path, via a spy, not just that the right screen text appears."

- [ ] **Step 1: Write the failing tests**

```tsx
// src/screens/voter/voterFlow.test.tsx
describe('voter entry (FR-V-03, AC-V-1, AC-V-2)', () => {
  it('AC-V-1: "applied for something" routes to voter Q1; "this is about SIR" routes to state select', async () => { /* ... */ })

  it('AC-V-2: "I\'m not sure" shows the inline explainer, navigates nowhere, and stores no answer', async () => {
    /* asserts screen unchanged, answers === {}, both explainer actions present */
  })

  it('the explainer\'s two actions route into the real branches', async () => { /* ... */ })
})

describe('voter Q1 -> Q2 (AC-V-3)', () => {
  it('writes the raw pick AND the normalized value', async () => {
    // pick "I'm not sure" at Q2
    expect(answers.voterAppealedRaw).toBe('notsure')
    expect(answers.voterAppealed).toBe('unclassified')
  })

  it('normalizes voterQ1 notsure -> unclassified', async () => { /* ... */ })

  it('only "decision" routes to the appeal follow-up; the others go straight to diagnosis', async () => { /* ... */ })
})
```

```tsx
// src/screens/sir/sirFlow.test.tsx
import { sirEngine } from '../../playbooks/engines'
import * as evaluateModule from '../../domain/evaluate'

describe('SIR coverage boundary (AC-S-5) — C2\'s deferred spy test', () => {
  it.each(['bihar', 'maharashtra', 'up', 'other'])(
    'selecting %s renders the coverage screen and NEVER evaluates the SIR playbook',
    async stateKey => {
      const spy = vi.spyOn(evaluateModule, 'evaluate')
      /* render, pick the state */
      expect(spy).not.toHaveBeenCalled()
      expect(screen.getByText(/isn't available in NextMove yet/)).toBeInTheDocument()
      // No status stamp of any kind. Selected by the locked class, not by
      // role — the stamp deliberately carries no ARIA role (Task 3).
      expect(document.querySelector('.stamp')).toBeNull()
    },
  )

  it('selecting Delhi reaches SIR Q1', async () => { /* ... */ })

  it('the coverage screen never renders a WAIT/FOLLOW UP/ESCALATE/UNCLASSIFIED stamp', () => { /* ... */ })
})

describe('SIR Q1 options are phase-gated (AC-S-2)', () => {
  it('offers exactly Delhi\'s claims_notice options plus "I\'m not sure"', async () => {
    expect(labels).toEqual([
      'I checked the Draft Roll and my name is there',
      "I checked the Draft Roll and my name isn't there",
      "I haven't checked the Draft Roll yet",
      'I got a notice asking for documents',
      "I'm not sure",
    ])
  })

  it('never renders a Final Roll option in the current phase', async () => {
    expect(screen.queryByText(/Final Roll/)).toBeNull()
  })

  it('the extensibility claim: flipping the configured phase to final_roll changes the offered set with zero component changes', async () => {
    /* render <SirQ1 state={{ ...SIR_STATES.delhi, phase: SIR_PHASES.final_roll }} /> */
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.**
- [ ] **Step 3: Implement the Voter screens** — ports of prototype lines 3380-3470 (entry + inline explainer + Q1 + Q2). Label maps transcribed from lines 3408-3412 and 3446-3451.
- [ ] **Step 4: Implement the SIR screens** — ports of lines 3483-3563 (state select, unsupported coverage, Q1). **`renderSirReverifying` (3505-3523) is NOT ported — it is C6's freshness landing.** The state-selection list is `Object.entries(SIR_STATES)` in its declared order, rendering `s.name`.
- [ ] **Step 5: Run tests to verify they pass**, then the full suite and the build.

**Acceptance criteria:** AC-V-1, AC-V-2, AC-V-3 routing, AC-S-1, AC-S-2, AC-S-5 (with the spy) each pinned by name. `optionsForPhase` is never reached for an unsupported state. `"I'm not sure"` is appended outside the gated set.

- [ ] **Step 6: Commit** — `feat(c3): voter + SIR question flows — raw/normalized answers, coverage gate with spy test`

---

### Task 6: The shared Diagnosis template + the trust disclosure

**Files:**
- Create: `src/templates/TrustDisclosure.tsx`, `src/templates/TrustDisclosure.test.tsx`, `src/templates/CaseTrail.tsx`, `src/templates/DiagnosisScreen.tsx`, `src/templates/DiagnosisScreen.test.tsx`

**Interfaces:**
- Consumes: `Diagnosis` (C1), Task 3's primitives, Task 4's `labelMap`.
- Produces: `<TrustDisclosure>` (consumed by both templates) and `<DiagnosisScreen>` — the one template all three services render through, unmodified (implementation plan §1's central architectural claim, now made executable).

**Why `TrustDisclosure` lives here and not in Task 7.** `DiagnosisScreen` is a port of prototype 3581-3611, and line 3608 is `${trustDisclosure(d, answerLabels, extraToldUs)}` — the Diagnosis screen *contains* the trust disclosure. An earlier draft of this plan put `TrustDisclosure` in Task 7 and said "implement the two in either order; the test double for the other is trivial." That is incompatible with the Global Constraint that `npm run build` (`tsc -b && vite build`) must pass **at the end of every task**: a `DiagnosisScreen` importing a module Task 7 has not written does not typecheck. It is also the wrong instinct — a stub that ships and then gets replaced is exactly the kind of seam that silently survives. So the component is built once, here, with its real tests, and Task 7 consumes it.

**Design notes — the field-name map from prototype to shipped types.** The prototype's `evaluate()` returns `id`; C1 ships `ruleId`. Everything else is a direct name match. Table for the porter:

| prototype | C1/C2 shipped | note |
|---|---|---|
| `d.id` | `d.ruleId` | `null` on the fallback |
| `d.rec`, `d.state`, `d.label`, `d.dependency`, `d.explanation`, `d.matchedAnswers`, `d.source` | identical | |
| `d.need` (raw `<ul>` for `s-notice`) | `d.need` + `d.needList` | Task 7: prefer `needList` |

1. **The headline is one of exactly two strings** (prototype 3585-3587), and the highlighter swipe is on `waiting` only:
   - UNCLASSIFIED: `We don't have enough information to call this safely.` (no `.mark`, no gems — "nothing was found, and the design shouldn't celebrate that")
   - otherwise: `We found where this is <span class="mark">waiting</span>.`
2. **The dependency block is gated on `d.dependency && d.dependency !== 'Unknown'`** (line **3601**; the block itself runs 3601-3604). All three C2 fallbacks carry `dependency: 'Unknown'`, so UNCLASSIFIED omits it structurally — no separate UNCLASSIFIED branch. Label is `Waiting on`.
3. **The case trail is Passport-only** (FR-V-10). `passportTrailFor(d)` is a direct port of `PASSPORT_STEPS_FOR` (3366-3378): returns `null` for state `'6'`; otherwise `{'1':2,'2':2,'4':2,'3':3}[d.state]`, falling back to the **stage answer** `{no_contact:2, contacted_incomplete:2, adverse:2, verified_no_progress:3}[d.matchedAnswers.q1]` so ladder-rung states still show *where* the case is stuck. `null` index → no trail. Steps are `['Application','Appointment','Police verification','Processing']`, current marker labelled `You are here`.
4. **`preNote` is a generic slot**, not an SIR branch. SIR passes the phase banner (`{name} · {phase.label}: {phase.note}`, line 3575); Passport and Voter pass nothing. The template must contain no `if (service === 'sir')`.
5. **Deliberately NOT ported here** (see Out of Scope): `freshBanner` (C6), the `ciJustUpdated` undo banner and `phaseDrift` banner (C5), `updateEntry`'s "Add an update" button (C5).
6. **The escalation ladder is not on this screen in the locked prototype** — `renderLadder` is called only from `renderCasefile` (line 2920), which is C5's. Neither the ladder logic nor its component appears anywhere in this template. See Open Question 1's ruling and Task 8.

**Design notes — `TrustDisclosure` (port of prototype 2360-2375).**

7. **`TrustDisclosure` is a FULLY CONTROLLED component. It owns no state.**

   ```tsx
   <TrustDisclosure d={d} answerLabels={labels} extraToldUs={...} open={state.trustOpen}
                    onToggle={() => dispatch({ type: 'TOGGLE_TRUST' })} />
   ```

   An earlier draft was contradictory: it gave Task 2's session `trustOpen` + `TOGGLE_TRUST` and pinned "nav clears it" / "restart clears it" by test, *and* asserted the component "reveals the panel on click" from a bare uncontrolled render. Both cannot be true. If the component owned the state, `TOGGLE_TRUST`, the nav-clears-trust test and the Global Constraint "a trust panel left open across a screen change […] is a real bug" would all be dead code. **Session state wins:** `open` is a required prop, `onToggle` is a required callback, and the component has no `useState` of any kind. The prototype agrees — line 2366 is `onclick="S.trustOpen=!S.trustOpen; render();"`, i.e. the toggle writes to the session, not to the component.

   The "reveals the panel on click" test therefore renders a **small harness** wiring `useReducer(sessionReducer, initialSession)` to the component — the same harness Task 4's rendered-flow tests already need — rather than a bare render. Every pure-render assertion keeps passing `open` directly.
8. **`SOURCES_VERIFIED = '5 Sep 2026'`** (prototype line 2018) is project metadata — the last human verification of `sources/manifest.json` — not a government-process claim. It lives as a named constant in `TrustDisclosure.tsx` with a comment pointing at C6 (the freshness job is what will eventually move it). Its interaction with the numeric guardrail scan is settled in **Open Question 3**, and this task owns the test that pins it to the manifest.
9. **The archived-copy caption is suppressed for the safety net.** The prototype tests `d.source.title.startsWith("NextMove's own")`. **Port this as a `docId === null` check instead** — C2 introduced `SourceReference.docId` as an explicit discriminator precisely so nothing string-matches the safety-net title (C2 plan, Task 1, design note 1). Same behaviour, structurally safer. *Recorded deviation.*
10. **`extraToldUs`** carries the Passport recovery echoes (`Pasted status text: "..."` / `Asked for the safest thing to do now`, prototype 3361-3363).
11. **"You wrote" / `caseFacts` are C8's** and are omitted — the prototype's `S.appliedText` row (line 2371) does not ship.
12. **The "Based on" row has three distinct states and each gets its own test.** Line 2373 is `${d.source.quote ? '<div class="source-quote">…' : ''}` layered on top of the always-rendered `d.source.title`, and the archived-copy caption is separately gated on `docId`. So: a sourced rule **with** a quote, a sourced rule **without** one, and the `docId === null` safety net. An earlier draft asserted only the caption, and did it against `s-notice` — whose source is `{ docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ, Q23, Q11' }`, carrying **no `quote` field at all**. That test's name promised three things and checked one, and the `.source-quote` branch shipped untested in both directions. **The with-quote fixture is `diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })`** — `state-5b`, `rec: 'ESCALATE'`, whose source carries `quote: '"...within a reasonable period of time" — no numeric deadline is stated.'` It is already Task 6's and Task 9's fixture, so nothing new is introduced. `s-notice` stays, correctly, as the sourced-but-unquoted case — which is genuinely distinct from the safety net and was previously conflated with it.

- [ ] **Step 1: Write the failing test** (`src/templates/DiagnosisScreen.test.tsx`)

```tsx
import { diagnose } from '../domain/engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { SIR_STATES } from '../playbooks/sirPlaybook'

// DiagnosisScreen composes <TrustDisclosure>, which is fully controlled
// (design note 7) — so the screen takes trustOpen/onToggleTrust and passes
// them straight through. Default closed, matching the prototype.
const renderFor = (engine, answers, extra = {}) =>
  render(<DiagnosisScreen serviceLabel="Passport" engineKey={engine.key}
           d={diagnose(engine, answers)} answerLabels={{}}
           trustOpen={false} onToggleTrust={vi.fn()} {...extra} />)

describe('the reveal headline', () => {
  it('a classified diagnosis reads "We found where this is waiting." with the marker swipe on "waiting"', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('We found where this is waiting.')
    expect(document.querySelector('.reveal-headline .mark')).toHaveTextContent('waiting')
  })

  it('UNCLASSIFIED reads the honest headline, with no swipe and no gems', () => {
    renderFor(passportEngine, { q1: 'not_sure' })
    expect(screen.getByRole('heading', { level: 2 }))
      .toHaveTextContent("We don't have enough information to call this safely.")
    expect(document.querySelector('.mark')).toBeNull()
    expect(document.querySelector('.gems')).toBeNull()
  })
})

describe('the "Waiting on" block — the product\'s core differentiator', () => {
  it('renders the dependency for a classified diagnosis', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(screen.getByText('Waiting on')).toBeInTheDocument()
    expect(document.querySelector('.dep-v')).toHaveTextContent(
      diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' }).dependency)
  })

  it.each([
    ['passport', passportEngine, { q1: 'not_sure' }],
    ['voter', voterEngine, { voterQ1: 'unclassified' }],
    ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'unclassified' }],
  ])('%s UNCLASSIFIED omits it entirely (dependency is "Unknown", never rendered)', (_, engine, answers) => {
    renderFor(engine, answers)
    expect(screen.queryByText('Waiting on')).toBeNull()
    expect(screen.queryByText('Unknown')).toBeNull()
  })
})

describe('the case trail — Passport only (FR-V-10)', () => {
  it('places state 1 at "Police verification" with the You-are-here marker', () => {
    renderFor(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    const current = document.querySelector('.ct-step.current')
    expect(current).toHaveTextContent('Police verification')
    expect(current).toHaveTextContent('You are here')
  })

  it('a ladder-rung state (5a) still places by its STAGE answer, keeping the stage visible', () => {
    renderFor(passportEngine, { q1: 'verified_no_progress', q2: 'informal' })
    expect(document.querySelector('.ct-step.current')).toHaveTextContent('Processing')
  })

  it('passport UNCLASSIFIED (state 6) renders no trail', () => {
    renderFor(passportEngine, { q1: 'not_sure' })
    expect(document.querySelector('.case-trail')).toBeNull()
  })

  it.each([['voter', voterEngine, { voterQ1: 'no_word' }],
           ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'roll_present' }]])(
    '%s never renders a trail — no official linear sequence exists to represent', (_, e, a) => {
      renderFor(e, a); expect(document.querySelector('.case-trail')).toBeNull()
    })
})

describe('the shared template renders every service unmodified (impl plan §1)', () => {
  it.each([
    ['passport', passportEngine, { q1: 'adverse', q2: 'no_followup' }, null],
    ['voter', voterEngine, { voterQ1: 'decision', voterAppealed: 'pending' }, null],
    ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'notice' }, 'phase banner'],
  ])('%s renders stamp + explanation + CTA from the same component', (_, engine, answers, preNote) => {
    const d = diagnose(engine, answers)
    renderFor(engine, answers, { preNote })
    expect(document.querySelector('.stamp')).toHaveTextContent(d.rec === 'FOLLOW_UP' ? 'FOLLOW UP' : d.rec)
    expect(screen.getByText(d.explanation)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /See my next move/ })).toBeInTheDocument()
  })

  it('SIR\'s phase banner arrives through the generic preNote slot', () => {
    const st = SIR_STATES.delhi
    renderFor(sirEngine, { sirState: 'delhi', sirQ1: 'roll_absent' },
      { preNote: <Banner><b>{st.name} · {st.phase!.label}:</b> {st.phase!.note}</Banner> })
    expect(screen.getByText(st.phase!.note, { exact: false })).toBeInTheDocument()
  })

  it('never leaks an internal rule id, state, screen id or answer key into rendered text (AC-10)', () => {
    // Asserting the LITERAL strings 'ruleId' / 'matchedAnswers' / 'engineKey'
    // would prove nothing — no renderer emits a field NAME. Assert the VALUES
    // that could actually leak.
    const answers = { q1: 'adverse', q2: 'formal_grievance' }
    const d = diagnose(passportEngine, answers)
    const { container } = renderFor(passportEngine, answers)
    const text = container.textContent!

    // Guards, so the test cannot pass by rendering nothing or by drifting
    // onto a fixture with nothing to leak.
    expect(d.ruleId).toBe('state-5b')
    expect(Object.keys(d.matchedAnswers).length).toBeGreaterThan(0)
    expect(text.length).toBeGreaterThan(100)

    expect(text).not.toContain(d.ruleId!)              // 'state-5b'
    expect(text).not.toContain('passport-nextmove')    // an engineKey-derived screen id
    for (const [k, v] of Object.entries(d.matchedAnswers)) {
      expect(text).not.toContain(`${k}:${v}`)          // composite answer keys
      expect(text).not.toContain(k)                    // raw answer KEYS ('q1', 'q2')
    }
    // The Diagnosis screen deliberately never names its own state — see the
    // Open Question 4 ruling. d.state is '5b' here, short enough to fall
    // inside an unrelated word by accident, so anchor it as a whole token.
    expect(new RegExp(`\\b${d.state}\\b`).test(text)).toBe(false)
  })
})
```

- [ ] **Step 1b: Write the failing `TrustDisclosure` tests** (`src/templates/TrustDisclosure.test.tsx`)

```tsx
describe('AC-10: "You told us" shows the real answers given', () => {
  it.each([
    ['passport', passportEngine, { q1: 'adverse', q2: 'no_followup' },
      { ...labelMap('q1', { ...PASSPORT_Q1_LABELS, not_sure: "I'm not sure" }),
        ...labelMap('q2', PASSPORT_Q2_LABELS) },
      ['I saw something on the portal that looks negative or confusing', 'No, not yet']],
    ['voter', voterEngine, { voterQ1: 'decision', voterAppealedRaw: 'pending', voterAppealed: 'pending' },
      { ...labelMap('voterQ1', { ...VOTER_Q1_LABELS, unclassified: "I'm not sure" }),
        ...labelMap('voterAppealedRaw', VOTER_APPEAL_LABELS) },
      ["I got a decision but don't understand it, or it wasn't what I expected",
       "Yes, and I'm still waiting to hear back"]],
    ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'notice' },
      labelMap('sirQ1', { ...SIR_Q1_OPTIONS_FOR.claims_notice, unclassified: "I'm not sure" }),
      ['I got a notice asking for documents']],
  ])('%s: the panel is non-empty and echoes each real answer', (_, engine, answers, labels, expected) => {
    render(<TrustDisclosure d={diagnose(engine, answers)} answerLabels={labels}
                            open onToggle={vi.fn()} />)
    const told = screen.getByText('You told us').nextElementSibling!
    for (const label of expected) expect(told.textContent).toContain(label)
    expect(told.textContent).not.toBe('')
  })

  it('a genuinely unplaceable case says so instead of showing an empty row', () => {
    render(<TrustDisclosure d={diagnose(passportEngine, {})} answerLabels={{}} open onToggle={vi.fn()} />)
    expect(screen.getByText('Not enough to safely place your case; see below.')).toBeInTheDocument()
  })

  it('extraToldUs appends the recovery echo', () => {
    render(<TrustDisclosure d={diagnose(passportEngine, { q1: 'not_sure' })} answerLabels={{}}
                            extraToldUs='Asked for the safest thing to do now' open onToggle={vi.fn()} />)
    expect(screen.getByText(/Asked for the safest thing to do now/)).toBeInTheDocument()
  })
})

describe('the panel is controlled by session state, closed by default (PRD §15)', () => {
  // The component owns NO state (design note 7). This harness is the same
  // useReducer wiring Task 4's rendered-flow tests use.
  function Harness() {
    const [s, dispatch] = useReducer(sessionReducer, initialSession)
    return <TrustDisclosure d={diagnose(passportEngine, { q1: 'adverse', q2: 'no_followup' })}
                            answerLabels={labelMap('q1', PASSPORT_Q1_LABELS)}
                            open={s.trustOpen} onToggle={() => dispatch({ type: 'TOGGLE_TRUST' })} />
  }

  it('the toggle reads "Why am I seeing this?" and reveals the panel on click', async () => {
    render(<Harness />)
    expect(document.querySelector('.trust-panel')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Why am I seeing this\?/ }))
    expect(document.querySelector('.trust-panel')).toBeInTheDocument()
  })

  it('reports aria-expanded, and holds no state of its own', async () => {
    const onToggle = vi.fn()
    render(<TrustDisclosure d={diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })}
                            answerLabels={{}} open={false} onToggle={onToggle} />)
    const btn = screen.getByRole('button', { name: /Why am I seeing this\?/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(btn)
    expect(onToggle).toHaveBeenCalledTimes(1)
    // open={false} never changed, so the panel must still be closed:
    // proof the component is controlled, not self-toggling.
    expect(document.querySelector('.trust-panel')).toBeNull()
  })
})

describe('"Based on" — three distinct cases, all three pinned', () => {
  it('a sourced rule WITH a quote shows the title, the verbatim quote, and the caption', () => {
    // state-5b (rec ESCALATE) is the one passport rule carrying source.quote:
    // '"...within a reasonable period of time" — no numeric deadline is stated.'
    // It is already Task 6's and Task 9's fixture, so nothing new is introduced.
    const d = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })
    expect(d.source.quote).toBeTruthy()          // guard: the fixture really has one
    render(<TrustDisclosure d={d} answerLabels={{}} open onToggle={vi.fn()} />)
    expect(screen.getByText(d.source.title, { exact: false })).toBeInTheDocument()
    expect(document.querySelector('.source-quote')).toHaveTextContent(d.source.quote!)
    expect(screen.getByText(
      /Checked against NextMove's archived copy of this source on 5 Sep 2026\./)).toBeInTheDocument()
  })

  it('a sourced rule WITHOUT a quote shows title + caption and NO .source-quote', () => {
    // s-notice's source is { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR
    // 2026 FAQ, Q23, Q11' } — sourced, but no quote field. Distinct from the
    // docId === null safety net below, and previously conflated with it.
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })
    expect(d.source.quote).toBeUndefined()       // guard
    render(<TrustDisclosure d={d} answerLabels={{}} open onToggle={vi.fn()} />)
    expect(screen.getByText(d.source.title, { exact: false })).toBeInTheDocument()
    expect(document.querySelector('.source-quote')).toBeNull()
    expect(screen.getByText(/archived copy/)).toBeInTheDocument()
  })

  it('the UNCLASSIFIED safety net (docId null) shows NO archived-copy caption', () => {
    const d = diagnose(passportEngine, { q1: 'not_sure' })
    expect(d.source.docId).toBeNull()            // guard
    render(<TrustDisclosure d={d} answerLabels={{}} open onToggle={vi.fn()} />)
    expect(screen.queryByText(/archived copy/)).toBeNull()
  })
})

describe('SOURCES_VERIFIED is real metadata, not a decorative string (Open Question 3)', () => {
  // This test file is a *.test.tsx file, so it is outside the scan performed
  // by playbooks/guardrails/isolation.test.ts (which walks non-test `.ts`
  // files only) and may import the harness's manifest reader. TrustDisclosure
  // .tsx itself must NOT.
  it('parses as "d Mon yyyy" and matches the manifest\'s captured date', () => {
    expect(SOURCES_VERIFIED).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/)

    const captured = Object.values(loadManifest().documents)
      .map(doc => doc.captured)
    expect(captured.every(Boolean)).toBe(true)

    // NOTE: two manifest entries append provenance prose to the ISO date
    // ("2026-09-05 (rendered in browser; raw HTML is a JS shell)",
    //  "2026-09-05 via Wayback Machine snapshot 2025-03-18"), so compare the
    // leading ISO date, not the whole string. There is no top-level
    // verification-date field in the manifest to compare against; the
    // per-document `captured` prefix IS the record.
    const isoDates = new Set(captured.map(c => c!.slice(0, 10)))
    expect(isoDates.size, `captured dates are not uniform: ${[...isoDates]}`).toBe(1)

    const [iso] = [...isoDates]                                   // '2026-09-05'
    const d = new Date(`${iso}T00:00:00Z`)
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    expect(SOURCES_VERIFIED)
      .toBe(`${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.**
- [ ] **Step 3: Implement `TrustDisclosure.tsx`** — port of 2360-2375, minus the `S.appliedText` block (2371, C8's), with the `docId === null` discriminator and the fully-controlled `open`/`onToggle` contract. **It must not import anything under `src/playbooks/guardrails/`** — the manifest comparison above lives in the test file, which is exempt.
- [ ] **Step 4: Implement `CaseTrail.tsx`** — `passportTrailFor(d)` plus the `<CaseTrail>` port of `renderTimeline` (3612-3620).
- [ ] **Step 5: Implement `DiagnosisScreen.tsx`** — port of 3581-3611, with the deliberate omissions listed above, composing `<TrustDisclosure>` at the position line 3608 gives it.
- [ ] **Step 6: Run tests to verify they pass**, then the full suite and the build.

**Acceptance criteria:** every assertion above green for all three services. The template file contains **zero** service-name string comparisons. No internal identifier appears in rendered output. `TrustDisclosure` holds no state and imports no guardrail module. All three `Based on` cases — quoted, sourced-unquoted, safety-net — are pinned by their own named test. `SOURCES_VERIFIED` is tied to the manifest by test, not by comment.

- [ ] **Step 7: Commit** — `feat(c3): shared Diagnosis template + trust disclosure — reveal headline, waiting-on block, case trail, composite label keys`

---

### Task 7: The shared Next Move template

**Files:**
- Create: `src/templates/NextMoveScreen.tsx`, `src/templates/NextMoveScreen.test.tsx`

**Interfaces:**
- Consumes: `Diagnosis` (C1), Task 3's primitives. **NOT `<TrustDisclosure>`** — see the corrected design note 0 below; an earlier draft of this plan wrongly said this template composes it.
- Produces: `<NextMoveScreen>` — the second of the two shared templates.

**Design notes:**

0. **CORRECTION (post-implementation, Task 7 review): `NextMoveScreen` does NOT render a trust panel.** A prior draft of this Interfaces block said this template "consumes Task 6's already-built `<TrustDisclosure>`". That was wrong, caught during Task 7's review, and verified directly against the design authority: `git show 91ff7a1:design/nextmove-v1-prototype.html`'s `renderNextMove` (3654-3684) never calls `trustDisclosure()` anywhere — `trustDisclosure()` has exactly one call site in the whole prototype, inside `renderDiagnosis` (3608, already Task 6's). The PRD independently confirms this is the intended scope, not an accident of one prototype revision: FR-16 (`NEXTMOVE_PRD.md:146`) says "The **Diagnosis screen** includes a 'Why am I seeing this?' control", and PRD line 402 says trust information is "never buried more than one tap away **from Diagnosis**" — neither mentions Next Move. Composing it here would also have been actively harmful: `answerLabels` would need a non-`{}` default to avoid `TrustDisclosure` rendering "Not enough to safely place your case; see below." on a screen that just told the citizen exactly what to do, and `d.explanation` would render twice on one screen (once under "Why", once under "What that means"). **Corrected scope: Next Move has no trust panel. Diagnosis, which the citizen already passed through immediately before reaching Next Move, is the one and only place the disclosure lives.**
1. **Next Move prefers `needList` over `need`, but the lead-in text stays.** `s-notice` is the one rule with a list — `need` is `'Any ONE of these:'`, `needList` is the 12 ECI-prescribed documents (`sirPlaybook.ts`'s own comment: the split exists "so no renderer ever has to inject markup", i.e. so a renderer can print the lead-in as plain text right next to the list, not so the lead-in gets dropped). **CORRECTION (post-implementation, Task 7 review):** an earlier draft of this note said "rendering `need` for it would either drop the items or require injecting markup" and implied `needList` should render *instead of* `need`. That was true of the pre-split `need` (which used to contain raw `<ul>` markup) and stopped being true once C2 split the fields. Render **both**: `need` as plain text, then `needList` as a real `<ul>`/`<li>` list when present — this is what the locked prototype's own line 1335 does, and dropping the lead-in changes a government document requirement from "any ONE of these" to what reads like "all of these," which is a real, substantive accuracy defect, not a rendering nicety.
2. **The "Prepare this for me" CTA is a seam, not a stub.** The template takes an optional `hasPrepPlan?: boolean` prop defaulting to `false`. With `false` it renders the prototype's own no-prep branch — `<button class="btn btn-secondary btn-block">Back to Home</button>` — which is exactly what WAIT and UNCLASSIFIED states already render in the locked design. **No inert or dead button ships.** C4 passes `hasPrepPlan={Boolean(PREP[d.ruleId])}` and adds the primary CTA behind the same prop. See Open Question 2.
3. **"Back to Home" dispatches `RESTART`, not `NAVIGATE 'home'`.** Prototype line 3663 is `onclick="restart()"`, not `onclick="nav('home')"`. This is not incidental: Home is a clean slate, always (the same rule prototype `back()` at 2032-2035 encodes with its own comment). Wiring it to a navigation would leave stale answers behind — precisely the bug that comment was written to fix. Pinned by test in Step 1.
4. **`updateEntry` and `saveControl` are omitted entirely** (C5). A button that does nothing is worse than an absent one.
5. **The crumb is where the matched state surfaces**: `{serviceLabel} · {d.label}` then `Your next move` (prototype line 3667). For passport ladder states `d.label` is already the stage·rung composite, decorated by C1. This is how AC-10's "matched state" requirement is satisfied — see Open Question 4's ruling, including the residual it records.

- [ ] **Step 1: Write the failing tests**

```tsx
// NextMoveScreen.test.tsx
describe('AC-11: What / Why / Where / What-you\'ll-need all populated, never blank', () => {
  const cases = [
    ['passport', passportEngine, { q1: 'adverse', q2: 'formal_grievance' }],
    ['voter', voterEngine, { voterQ1: 'decision', voterAppealed: 'decided' }],
    ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'roll_absent' }],
    ['passport-unclassified', passportEngine, { q1: 'not_sure' }],
  ] as const

  it.each(cases)('%s', (_, engine, answers) => {
    const d = diagnose(engine, answers)
    render(<NextMoveScreen serviceLabel="X" engineKey={engine.key} d={d} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(d.whatShort)
    expect(screen.getByText(d.whatToDo)).toBeInTheDocument()
    for (const k of ['Why', 'Where', "What you'll need"]) expect(screen.getByText(k)).toBeInTheDocument()
    expect(screen.getByText(d.explanation)).toBeInTheDocument()
    expect(screen.getByText(d.where.label, { exact: false })).toBeInTheDocument()
  })
})

describe('optional fields appear only when the rule carries them', () => {
  it('renders "How long?" for a rule with howLong', () => { /* sir roll_absent */ })
  it('omits "How long?" on the UNCLASSIFIED fallback (no howLong on any fallback)', () => { /* ... */ })
  it('renders "What to expect" only for rules with expectNext', () => { /* ... */ })
})

describe('needList beats need, and no data field is ever injected as markup', () => {
  it("s-notice's document list renders as real <li> elements", () => {
    render(<NextMoveScreen ... d={diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })} />)
    const items = document.querySelectorAll('.need-list li')
    expect(items.length).toBe(d.needList!.length)
    expect([...items].map(li => li.textContent)).toEqual(d.needList)
  })

  it('the list is a real <ul>, so the UA default markers apply (Task 1 note 1)', () => {
    // .need-list (prototype 487) sets margin/padding but NOT list-style —
    // the bullets come from the UA default, which is why Tailwind preflight
    // had to go. NOTE: jsdom does not load index.css, so a computed-style
    // assertion here would be vacuous; the stylesheet side of this is pinned
    // in Task 1's tokens.test.ts (which reads the file). All this test owes
    // is that the element really is a list.
    render(<NextMoveScreen ... d={diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })} />)
    expect(document.querySelector('.need-list')!.tagName).toBe('UL')
  })

  it('no rendered element carries raw markup from a data field', () => {
    expect(container.innerHTML).not.toContain('&lt;ul&gt;')
  })
})

describe('the official-channel handoff note is unconditional (Non-Goals: no acting on behalf)', () => {
  it.each(cases)('%s shows it', (_, engine, answers) => {
    /* asserts: "An official government channel. NextMove helps you understand
       and prepare; it doesn't act on your behalf." */
  })
  it('an external channel link opens in a new tab with rel="noopener"', () => { /* ... */ })
})

describe('the prepare CTA seam (C4)', () => {
  it('without a prep plan, the CTA is the secondary "Back to Home" — never a dead button', () => {
    render(<NextMoveScreen ... />)
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveClass('btn-secondary')
    expect(screen.queryByText('Prepare this for me')).toBeNull()
  })

  it('"Back to Home" dispatches RESTART, not NAVIGATE home (prototype 3663 calls restart())', async () => {
    const dispatch = vi.fn()
    render(<NextMoveScreen ... dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Back to Home' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'NAVIGATE' }))
  })

  it('with hasPrepPlan, the primary CTA appears (the seam C4 fills)', () => { /* ... */ })
})

describe('AC-10 (matched state): the Next Move crumb carries it', () => {
  it('AC-10 (matched state): the crumb shows the stage · rung composite C1 decorated — the trust panel deliberately does not', () => {
    const d = diagnose(passportEngine, { q1: 'verified_no_progress', q2: 'informal' })
    expect(d.label).toBe('Verified, processing quiet · informal follow-up unresolved')
    render(<NextMoveScreen serviceLabel="Passport" engineKey="passport" d={d} />)
    expect(screen.getByText(`Passport · ${d.label}`)).toBeInTheDocument()
  })

  it('AC-10 (matched state): every service surfaces its label on the crumb, not only passport', () => {
    for (const [label, engine, answers] of [
      ['Passport', passportEngine, { q1: 'adverse', q2: 'formal_grievance' }],
      ['Voter Services', voterEngine, { voterQ1: 'decision', voterAppealed: 'decided' }],
      ['Voter Services', sirEngine, { sirState: 'delhi', sirQ1: 'roll_absent' }],
    ] as const) {
      const d = diagnose(engine, answers)
      const { unmount } = render(<NextMoveScreen serviceLabel={label} engineKey={engine.key} d={d} />)
      expect(screen.getByText(`${label} · ${d.label}`)).toBeInTheDocument()
      unmount()
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.**
- [ ] **Step 3: Implement `NextMoveScreen.tsx`** — port of 3654-3684, minus `freshBanner`/`updateEntry`/`saveControl`, with `needList` preferred, the prep seam, `RESTART` on "Back to Home", and Task 6's `<TrustDisclosure>` composed at the position the prototype gives it.
- [ ] **Step 4: Run tests to verify they pass**, then the full suite and the build.

**Acceptance criteria:** AC-10 and AC-11 pinned by name for all three services. `needList` renders as JSX. No dead controls. "Back to Home" clears the session rather than navigating.

- [ ] **Step 5: Commit** — `feat(c3): shared Next Move template — needList, prep seam, restart-on-Back-to-Home`

---

### Task 8: The escalation ladder logic (the component and its CSS are deferred to C5)

**Files:**
- Create: `src/templates/ladder.ts`, `src/templates/ladder.test.ts`
- Modify: nothing. **No CSS is appended and no component is built in C3.**

**Design notes — what ships and what does not.**

`ladderFor(engineKey, answers, diagnosis)` (prototype **2760-2790**) is **pure** and fully unit-testable today — it reads only answers and the diagnosis, never session or casefile state. `LADDER_DEFS` (**2746-2757**) and `LADDER_TAG` (**2791**) are plain data. That is the genuinely valuable and genuinely testable half of the ladder work, and it ships here.

`<EscalationLadder>` (the port of `renderLadder`, **2792-2803**) and its CSS (**801-826**) do **not** ship in C3. Open Question 1's ruling explains why, and it is settled, not gated: `renderLadder` has exactly one call site in the locked design — `renderCasefile`, line **2920** — and the casefile screen is C5's. An unmounted React component cannot be checked against the locked design in Task 9's manual pass, would enter the repo with no render test, and would need a C5 review pass regardless. Building it now buys nothing and costs a dead import C5 may not find. **This also removes the "GATED" ambiguity from the task list entirely** — Task 8 is unconditional.

`LADDER_DEFS`' captions carry sourced process claims ("The official grievance ladder for a stuck passport case. Used only as far as your case needs; the recommendation above always comes first.", "The official two-tier appeal structure (ECI FAQ Q34). Used only as far as your case needs."). They are citizen-facing copy and **must** be fed through Task 9's guardrail sweep as `CopyString`s addressed `passport:LADDER_DEFS.caption` / `voter:LADDER_DEFS.caption` — that obligation is unaffected by deferring the component, and is in fact the main reason the data ships now rather than in C5. The rung labels and `LADDER_TAG` values go through the same sweep.

- [ ] **Step 1: Write the failing test** (`src/templates/ladder.test.ts`)

```ts
describe('AC-L-1: the "next" rung equals the diagnosis\'s recommended rung', () => {
  it.each([
    // answers, engine, expected rung statuses
    [{ q1: 'adverse', q2: 'no_followup' }, 'passport', ['next', 'up', 'up']],
    [{ q1: 'adverse', q2: 'informal', fOutcome: 'pending' }, 'passport', ['now', 'up', 'up']],
    [{ q1: 'adverse', q2: 'informal' }, 'passport', ['done', 'next', 'up']],
    [{ q1: 'adverse', q2: 'formal_grievance', gOutcome: 'pending' }, 'passport', ['done', 'now', 'up']],
    [{ q1: 'adverse', q2: 'formal_grievance' }, 'passport', ['done', 'done', 'next']],
    [{ q1: 'adverse', q2: 'formal_grievance', dpgFiled: 'yes' }, 'passport', ['done', 'done', 'now']],
    [{ voterQ1: 'decision', voterAppealed: 'none' }, 'voter', ['next', 'up']],
    [{ voterQ1: 'decision', voterAppealed: 'pending' }, 'voter', ['now', 'up']],
    [{ voterQ1: 'decision', voterAppealed: 'decided' }, 'voter', ['done', 'next']],
  ])('%o', (answers, key, expected) => { /* ... */ })
})

describe('the ladder stays absent where it is not in play', () => {
  it('ladderFor returns null for UNCLASSIFIED, for SIR, for passport state-1, and for an accepted-pending voter case', () => { /* ... */ })
  it('the ladder climbs and never descends: a resolved rung reads done, not reset', () => { /* ... */ })
})

describe('the captions and rung labels are exactly the locked strings', () => {
  it('matches prototype 2746-2757 byte for byte', () => {
    expect(LADDER_DEFS.passport.title).toBe('Escalation ladder')
    expect(LADDER_DEFS.passport.rungs)
      .toEqual(['Informal follow-up', 'Formal grievance (CPGRAMS)', 'DPG escalation'])
    expect(LADDER_DEFS.voter.title).toBe('Appeal ladder')
    expect(LADDER_DEFS.voter.rungs)
      .toEqual(['First appeal — DEO / DM', 'Second appeal — state CEO'])
    expect(LADDER_TAG)
      .toEqual({ done: 'Done', now: 'In progress', next: 'Recommended now', up: '' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.**
- [ ] **Step 3: Implement `ladder.ts`** — verbatim port of `LADDER_DEFS` (2746-2757), `ladderFor` (2760-2790) and `LADDER_TAG` (2791), with the prototype's own decision-recording comments (2743-2745 and 2758-2759). **No JSX, no CSS, no component.** The file exports data and one pure function.
- [ ] **Step 4: Run tests to verify they pass**, then the full suite and the build.

**Acceptance criteria:** all nine `ladderFor` status rows from AC-L-1 green. `ladder.ts` contains no JSX and imports no React. `LADDER_DEFS`' captions reach Task 9's guardrail sweep. Nothing in `src/` mounts a ladder.

- [ ] **Step 5: Commit** — `feat(c3): escalation ladder logic — LADDER_DEFS, ladderFor, LADDER_TAG (component deferred to C5)`

---

### Task 9: The router — Home, Other services, end-to-end flows, and the screen-copy guardrail sweep

**Files:**
- Create: `src/screens/Home.tsx`, `src/screens/OtherServices.tsx`, `src/screens/screenCopy.ts`, `src/screens/screenCopy.test.ts`, `src/App.test.tsx`
- Modify: `src/App.tsx` (rewrite)

**Design notes:**

1. **`App.tsx` is a `useReducer` over Task 2's session plus a `switch` on `state.screen`** — the direct analogue of the prototype's `render()` (3902-3941), carrying only C3's screens. Screen ids are the prototype's own (`passport-q1`, `voter-entry`, `sir-state`, …) so C4/C5 extend the switch rather than renaming the graph. Because `state.screen` is the `ScreenId` union (Task 2 design note 4), the `switch` is exhaustiveness-checked: give it a `default: { const _never: never = state.screen; throw new Error(...) }` arm so a screen added to the union without a case is a compile error.
2. **Home ships without its casefiles section.** `renderHome` (3136-3170) is ported minus `savedCard`/`home-cases` (C5). The three service rows (Passport / Voter Services / Other services), the hero headline with its marker swipe, the hero promise, the `What's stuck?` list-lead and the hero gems all ship. Home renders `topbar(false, false)` — no Back, no Restart.
3. **`OtherServices`** (3176-3200) ships as-is: four inert `Coming Soon` rows. They are `<div class="svc disabled">`, not buttons — nothing here is tappable, and nothing may become tappable.
4. **The SIR route is gated in the router**, not inside a screen: `sirCoverage(SIR_STATES[answers.sirState])` decides `sir-q1` vs `sir-unsupported`, before `optionsForPhase` or `diagnose` is called (C2 handoff MUST).
5. **The screen-copy guardrail sweep** closes the last piece of §7's declared surface for C3. It extends the harness's input; it does not fork it. C2's handoff names three inputs C3 must include beyond its own screen copy: `SIR_STATES[].name`, `PASSPORT_STAGE_SHORT`'s values, and `LADDER_DEFS`' titles, rung labels and captions (Task 8 ships these, so this is unconditional).

6. **`src/screens/screenCopy.ts` is the SINGLE DEFINITION SITE for every authored C3 string, and it must never import the guardrail harness.**

   *Why a real module, not an inline literal in each screen.* An earlier draft had the screens inline their copy and asked a test to "walk the rendered text of every C3 screen and assert each authored sentence appears in `SCREEN_COPY`". "Authored sentence" has no mechanical definition — splitting rendered `textContent` into sentences and subtracting rule-sourced text misfires on the crumb strip (`Passport · Verified, processing quiet · informal follow-up unresolved`), on composed labels, on the stamp label, and on anything part data and part chrome. The predictable outcome is an implementer writing something trivially green, which is the exact failure this test exists to prevent. **So invert it:** screen components import their strings — `SCREEN_COPY.passport.guardrail.headline` and so on — and never inline a citizen-facing literal. Coverage then holds *by construction*, and the test reduces to a mechanical "every `SCREEN_COPY` entry appears somewhere in the rendered output of its screen." This also dissolves Open Question 3's template/rendered-string mismatch, because the archived-copy caption template and its render site become the same object.

   *Shape.* `SCREEN_COPY` is keyed by four buckets — `passport | voter | sir | ui` — each an array of `{ at, text }`. `at` always carries the bucket prefix, matching every other `CopyString.at` in the project.

   *The isolation constraint, and it is a hard one.* `src/playbooks/guardrails/isolation.test.ts` (shipped in C2 at `c3bf48c`) walks **every non-`*.test.ts` `.ts` file under `src/`**, excluding `guardrails/` itself, and fails the build if any of them references a specifier matching `/(^|\/)guardrails(\/|$)/`. Its `importSpecifiers()` matcher is a set of regexes over `from '…'` / bare `import '…'` / `import('…')` — it does **not** distinguish `import type`. `screenCopy.ts` is a plain `.ts` file, so it is squarely in scope, and this would fail the build:

   ```ts
   // src/screens/screenCopy.ts — WOULD FAIL isolation.test.ts
   import { extraCopy, type CopyString } from '../playbooks/guardrails/contentSafety'
   ```

   **C2 already solved this exact problem and C3 reuses its solution verbatim.** `src/playbooks/sirPlaybook.ts` declares its own local interface with the comment "shipped playbook data must never import the harness […] TypeScript's structural typing makes the arrays interchangeable without the dependency":

   ```ts
   export interface CopyLocation { at: string; text: string }
   ```

   So: **`screenCopy.ts` declares its own local `{ at: string; text: string }` type and imports nothing under `src/playbooks/guardrails/`, not even as a type.** `extraCopy()` may only be called from `screenCopy.test.ts` — a `*.test.ts` file, and therefore outside `applicationTsFiles()`'s walk. (Note `isolation.test.ts` is also deliberately `.ts`-only and does not scan `.tsx` at all; do not read that as permission — the constraint is a design rule, not just whatever the scanner happens to catch, and `screenCopy.ts` is scanned regardless.)

   *The `ui:` bucket is scanned, not merely declared.* Three `guardrailFindings` calls consume `SCREEN_COPY.passport`, `.voter` and `.sir`. `SCREEN_COPY.ui` — the service-agnostic chrome: topbar labels, the restart-confirm prompt, Home's hero and lead-ins, `OtherServices`' Coming Soon rows, the trust toggle and its row labels — would otherwise be declared-but-unscanned, which is exactly the "declared guardrail without an executable test" this project forbids. It therefore gets its own fourth assertion: run it through `guardrailFindings(passportPlaybook, { extra: SCREEN_COPY.ui })` (any playbook will do — the content-safety and numeric scanners read `options.extra` regardless of which playbook supplies `copyStrings`) and require `[]`, plus a coverage assertion that no bucket is empty. Test in Step 1.

7. **The `settled` class is React's job, and it gets a test.** The lifted CSS rule (`#app.settled …`, prototype 999-1002, in Task 1's lift) does nothing on its own — something must add and remove the class. The prototype does it imperatively at line 3907: `el.classList.toggle('settled', S.renderedScreen === S.screen); S.renderedScreen = S.screen;`.

   The React equivalent lives in `App.tsx`, and note that the lifted selector is `#app.settled`, so the root element carries **both** the `app` class and the `app` id (prototype line 1011 is `<div class="app" id="app">`):

   ```tsx
   const lastScreen = useRef<ScreenId | null>(null)
   const settled = lastScreen.current === state.screen
   useEffect(() => { lastScreen.current = state.screen })   // after every commit
   return <div id="app" className={settled ? 'app settled' : 'app'}>{body}</div>
   ```

   `renderedScreen` deliberately does **not** go into `SessionState` — it is render bookkeeping, not session state, and putting it in the reducer would make every re-render an action. The `useEffect` takes **no dependency array** on purpose: it must run after every commit, which is what makes "the screen I just rendered" correct rather than "the screen as of the last screen change". `StrictMode`'s double-render is safe here because both passes read the same ref (effects have not run between them) and therefore compute the same `settled`.

   Pinned by test in Step 1: `settled` absent on fresh navigation, present after a same-screen state change such as `TOGGLE_TRUST`, absent again on the next arrival. Without this, Step 8's manual acceptance criterion ("the stamp slams once per arrival and not on trust-toggle") cannot pass, and it would be a declared behaviour with no executable test — which this project's standing rule calls a defect.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/App.test.tsx
describe('Passport, end to end — the flow is real, not just unit-tested components', () => {
  it('Home -> guardrail -> Q1 -> Q2 -> Diagnosis -> Next Move', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    await userEvent.click(screen.getByRole('button', { name: /No, still waiting on it/ }))
    await userEvent.click(screen.getByRole('button', { name: /looks negative or confusing/ }))
    await userEvent.click(screen.getByRole('button', { name: /Yes, I filed a formal grievance/ }))

    const d = diagnose(passportEngine, { guardrail: 'no', q1: 'adverse', q2: 'formal_grievance' })
    expect(document.querySelector('.stamp')).toHaveTextContent('ESCALATE')
    expect(screen.getByText('Waiting on')).toBeInTheDocument()
    expect(screen.getByText(d.dependency)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Why am I seeing this\?/ }))
    expect(screen.getByText(/looks negative or confusing/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(d.whatShort)
  })

  it('AC-8 end to end: Back, change Q1, and the diagnosis follows the NEW answer', async () => {
    /* reach State 1; Back; change Q1 to adverse; Q2 shows with nothing preselected;
       answer again; diagnosis is State 4, never a stale State 1 */
  })

  it('AC-9 end to end: Restart asks first, Cancel keeps everything, Yes returns Home empty', async () => { /* ... */ })
})

describe('Voter and SIR, end to end', () => {
  it('Voter: entry -> not sure -> explainer -> "It\'s a regular application" -> Q1 -> diagnosis', async () => { /* ... */ })
  it('SIR Delhi: entry -> SIR -> Delhi -> Q1 -> diagnosis carries the phase banner', async () => { /* ... */ })
  it('AC-S-5: SIR Bihar -> the coverage screen, and no diagnosis screen is ever rendered', async () => { /* ... */ })
})

describe('Home v2', () => {
  it('shows exactly three service rows and no casefiles section (C5)', () => { /* ... */ })
  it('hides Back and Restart', () => { /* ... */ })
  it('Other services shows four inert Coming Soon rows, none of them a button', () => { /* ... */ })
})

describe('the settled class: choreography plays on arrival, not on interaction', () => {
  it('is absent on a fresh navigation and present after a same-screen state change', async () => {
    render(<App />)
    const app = document.getElementById('app')!
    expect(app).toHaveClass('app')

    // Arrive somewhere new: the entrance animation must be allowed to run.
    await userEvent.click(screen.getByRole('button', { name: /Passport/ }))
    expect(app).not.toHaveClass('settled')

    // Same screen, state changed (TOGGLE_TRUST is the canonical case; on the
    // guardrail screen any same-screen re-render will do). The choreography
    // must NOT replay.
    await userEvent.click(screen.getByRole('button', { name: /Why am I seeing this\?/ }))
    expect(app).toHaveClass('settled')

    // And moving on clears it again.
    await userEvent.click(screen.getByRole('button', { name: /See my next move/ }))
    expect(app).not.toHaveClass('settled')
  })
})
```

> The test above walks to a screen that has a trust toggle first (Home → guardrail → Q1 → Q2 → Diagnosis); write it against whatever the shortest such path is once the screens exist. The three assertions — absent on arrival, present after a same-screen change, absent again on the next arrival — are the contract.

```ts
// src/screens/screenCopy.test.ts
// A *.test.ts file, so isolation.test.ts does not scan it and it MAY import
// the guardrail harness. src/screens/screenCopy.ts may NOT — see design note 6.
import { guardrailFindings } from '../playbooks/guardrails/suite'
import { extraCopy } from '../playbooks/guardrails/contentSafety'
import { SCREEN_COPY } from './screenCopy'   // every authored C3 string, addressed serviceId-first

describe('C3 screen copy passes the same content-safety scan as rule copy (§7)', () => {
  it('passport playbook + passport screen copy is clean', () => {
    expect(guardrailFindings(passportPlaybook, {
      extra: [...SCREEN_COPY.passport,
              ...Object.entries(PASSPORT_STAGE_SHORT).map(([k, v]) =>
                extraCopy(`passport:PASSPORT_STAGE_SHORT.${k}`, v))],
    })).toEqual([])
  })

  it('voter playbook + voter screen copy is clean', () => { /* ... */ })

  it('sir playbook + sir screen copy + state names is clean', () => {
    expect(guardrailFindings(sirPlaybook, {
      currentPhaseId: SIR_STATES.delhi.phase!.id,
      extra: [...sirCopyExtras(), ...SCREEN_COPY.sir,
              ...Object.values(SIR_STATES).map(s => extraCopy(`sir:SIR_STATES.${s.id}.name`, s.name))],
    })).toEqual([])
  })

  it('the ui: bucket is scanned too, not just declared', () => {
    // Service-agnostic chrome: topbar labels, the restart-confirm prompt,
    // Home's hero + lead-ins, OtherServices' Coming Soon rows, the trust
    // toggle and its row labels. Without this assertion the fourth bucket
    // would be declared-but-unscanned — a declared guardrail with no test.
    // Any playbook works: the content-safety and numeric scanners read
    // options.extra regardless of which playbook supplies copyStrings.
    expect(guardrailFindings(passportPlaybook, { extra: SCREEN_COPY.ui })).toEqual([])
  })

  it('every bucket exists and is non-empty (the sweep cannot pass by being empty)', () => {
    for (const key of ['passport', 'voter', 'sir', 'ui'] as const)
      expect(SCREEN_COPY[key].length, key).toBeGreaterThan(0)
  })

  it('every SCREEN_COPY location carries a service or ui prefix matching its bucket', () => {
    for (const [bucket, entries] of Object.entries(SCREEN_COPY))
      for (const c of entries) expect(c.at).toMatch(new RegExp(`^${bucket}:`))
  })

  it('screenCopy.ts declares its own {at,text} type and imports no guardrail module', () => {
    // Belt-and-braces alongside guardrails/isolation.test.ts, and it names
    // the reason at the site where someone would be tempted to break it.
    // (sirPlaybook.ts's CopyLocation is the pattern being followed.)
    // Derive the path via node:path, NOT `new URL('./x', import.meta.url)` —
    // Vite statically rewrites that literal form into an asset URL, which
    // under jsdom resolves to http://localhost:3000/... and makes
    // fileURLToPath throw. Same fix guardrails/manifest.ts and
    // guardrails/isolation.test.ts already use, for the same reason.
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, 'screenCopy.ts'), 'utf8')
    expect(src).not.toMatch(/from\s+['"][^'"]*guardrails/)
  })
})

describe('SCREEN_COPY is the single definition site — coverage holds by construction', () => {
  // The screens import their strings from SCREEN_COPY and inline no
  // citizen-facing literal, so "does SCREEN_COPY cover the screens?" cannot
  // drift. What CAN drift is the reverse: an entry left in SCREEN_COPY after
  // the screen stopped rendering it. That is what this checks, mechanically.
  const SCREENS: [keyof typeof SCREEN_COPY | 'ui', () => ReactElement][] = [
    /* one entry per C3 screen, rendered in its own default state */
  ]

  it.each(SCREENS)('every %s entry appears in its screen\'s rendered output', (bucket, mount) => {
    const { container } = render(mount())
    const text = container.textContent!
    for (const c of SCREEN_COPY[bucket]) {
      if (CAPTION_TEMPLATES.has(c.at)) continue   // see the carve-out below
      expect(text, c.at).toContain(c.text)
    }
  })

  /** The one documented carve-out (Open Question 3). The archived-copy
   *  caption is REGISTERED as a template —
   *    'Checked against NextMove's archived copy of this source on {date}.'
   *  — so the scanned string carries no date and the fail-closed numeric
   *  scan stays sharp. The RENDERED string interpolates SOURCES_VERIFIED, so
   *  it can never equal the registered one. TrustDisclosure.test.tsx pins the
   *  constant to the manifest's captured date instead. This set is the only
   *  legitimate reason an entry may be absent from rendered output; adding to
   *  it needs a recorded reason, exactly like this one. */
  const CAPTION_TEMPLATES = new Set(['ui:trust.verifiedOn'])

  it('each carve-out entry still appears with its placeholder substituted', () => {
    // The carve-out excuses an exact match, not the string's existence.
    const t = SCREEN_COPY.ui.find(c => c.at === 'ui:trust.verifiedOn')!.text
    expect(t).toContain('{date}')
    render(/* Diagnosis with the trust panel open */)
    expect(document.body.textContent)
      .toContain(t.replace('{date}', SOURCES_VERIFIED))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.**

- [ ] **Step 3: Implement `src/screens/screenCopy.ts`** — **do this first, before the screens**, because every screen imports from it. It is plain data: four buckets (`passport`, `voter`, `sir`, `ui`), each an array of `{ at, text }` built against a **locally declared** `interface CopyLocation { at: string; text: string }`, following `src/playbooks/sirPlaybook.ts`'s pattern and carrying the same style of comment explaining why the type is local. **Import nothing from `src/playbooks/guardrails/`, not even a type** — `guardrails/isolation.test.ts` fails the build on it, and its `importSpecifiers()` regex does not exempt `import type`.

  Populate it by **moving** the authored literals out of Tasks 4-7's screens and templates as you go, so nothing is duplicated: a citizen-facing string exists once, in `screenCopy.ts`, and is referenced from the component. Rule-sourced text (anything reached through a `Diagnosis`) is **not** in `SCREEN_COPY` — it is already scanned via `copyStrings(playbook)`.

  **If the scan fires on a date, do not reword the copy.** Check whether the string is government-sourced (then extend `sources/manifest.json`'s allowlist with an `allowed_in` entry) or project metadata (then apply Open Question 3's ruling: register the caption as a `{date}` template and let `TrustDisclosure` interpolate `SOURCES_VERIFIED`). Rewording a locked design string to satisfy a scanner is forbidden.

- [ ] **Step 4: Implement `Home.tsx` and `OtherServices.tsx`**, drawing their copy from `SCREEN_COPY`.
- [ ] **Step 5: Rewrite `App.tsx`** as the reducer + exhaustive switch router, including the `#app` root element and the `settled`-class ref/effect from design note 7.
- [ ] **Step 6: Retro-fit Tasks 4-7's screens** to import their copy from `SCREEN_COPY` rather than inlining it, if any literal is still inline. The coverage test in Step 1 is what tells you when this is done.
- [ ] **Step 7: Run the full suite and the build.** Record the exact final test count in the commit message.
- [ ] **Step 8: Manual verification** — `npm run dev`, walk all three flows in a browser at 375px and 1440px, confirm: the stamp slams once per arrival and not on trust-toggle (the `settled` class behaviour, prototype 3906-3908 — now also pinned by test in Step 1, so this pass is confirming the *visual* result, not the only evidence), `.need-list`'s bullets are visible on the SIR notice Next Move screen, keyboard tab order reaches every control with a visible ink ring, and `prefers-reduced-motion` collapses the animation. Record what was checked in the commit body.

**Acceptance criteria:** all three services complete end to end from Home. AC-8 and AC-9 verified through the real UI, not just the reducer. AC-S-5 verified through the real router. The guardrail sweep is green with C3's copy included, **all four buckets scanned**. No citizen-facing literal is inlined in a screen component. The `settled` class is pinned by test. No casefile, save, check-in, prepare or describe-it control exists anywhere in the built app.

- [ ] **Step 9: Commit** — `feat(c3): app router — Home v2, other services, end-to-end flows, screen-copy guardrail sweep`

---

## Out of Scope for C3 (do not build these)

Per `NextMove_Implementation_Plan_FINAL.md` §9's build sequence. Each is named here so its absence is a decision on record, not an oversight.

- **Prepare screens, drafts, guided-submission steps, official-channel cards, visit cards → C4.** C3 ships the *seam* (`hasPrepPlan`) and the prototype's own no-prep branch, so nothing inert or dead ships. CSS lines 532-650 are deliberately not lifted — **but see the caveat in Task 1 Step 5: 562-568 inside that range is C5's `.saved-*`, not C4's.**
- **Everything persistent → C5:** Home's "Your casefiles" section, `saveControl` ("Save this case…"), `updateEntry` ("Add an update: what's happened since?"), the casefile screen, the check-in panel, the journey log, undo, dead-end / case-closed / reopen, phase-drift handling, `CLOSED_TITLE`, `fmtRemind`, `copyReminder`. **The escalation ladder's `<EscalationLadder>` component, its CSS (801-826) and its mount point are ALL C5's** — C3's Task 8 ships only the pure logic and data (`ladder.ts`). CSS lines 651-800, 801-826 and 827-995 are not lifted.
- **Freshness → C6:** `FRESHNESS`, `degradedFor`, `freshBanner`, and the `sir-reverifying` screen (prototype 3505-3523). C3's `SOURCES_VERIFIED` constant is a plain string that C6 will source from the manifest.
- **Auth → C7:** the account chip, popover, save/OTP/name/done screens, `maskId`, sign-out.
- **Describe-it → C8:** `describeBlock` on every question screen, the interpretation-confirm screen, `factChips`, the "You wrote" trust row, `S.caseFacts`/`S.appliedText`.
- **`ProgressIndicator`** (`NEXTMOVE_V1_IMPLEMENTATION_PLAN.md` §5's component table) — **does not exist in the locked prototype and is not built.** That table predates the design lock and says so of itself. The case trail and the crumb strip carry positional context instead.

## Recorded deviations from the locked prototype (decided, not open)

- **The prototype's CSS is lifted verbatim rather than re-expressed as Tailwind utilities** (Task 1), despite the plan docs naming Tailwind in the stack. Rationale: keyframes, marker-stroke pseudo-elements, `nth-child` stagger and the reduced-motion collapse are load-bearing design, and nothing in a build chunk is authored.
- **`@import "tailwindcss";` is removed from `src/index.css` entirely** (Task 1 design note 1) — not merely unused. Tailwind v4's preflight sets `ul { list-style: none }`, and the prototype's `.need-list` (line 487) declares no `list-style` of its own, so preflight would silently ship `s-notice`'s document list without bullets. The prototype carries a complete reset at 145-163 and needs no other. The `tailwindcss` / `@tailwindcss/vite` packages and the Vite plugin stay installed and inert.
- **`d.id` → `d.ruleId`** throughout (C1's shipped name).
- **The trust panel's safety-net branch tests `d.source.docId === null`, not `title.startsWith("NextMove's own")`** (Task 6). Same behaviour; C2 introduced `docId` exactly so nothing string-matches the safety-net title.
- **`need` vs `needList`:** Next Move prefers `needList`. The prototype's raw `<ul>` inside `need` does not ship (already a C2 recorded deviation; C3 is the consumer side of it).
- **`renderSirReverifying` is not ported** (C6).
- **Home ships without its casefiles section** (C5), and `renderHome`'s `savedCard` branch is simply absent rather than rendered empty.
- **The voter Q2 screen writes two answers** (`voterAppealedRaw` + `voterAppealed`) where the prototype writes them through two `setAns` calls — identical behaviour, now routed through `applyCorrection`.
- **`voterEntryExplain` moves from `S.answers` (prototype 3392 reads it, 3405 writes it) to a top-level `SessionState` field.** It is UI state, not an answer; leaving it in `answers` would put it in `Diagnosis.matchedAnswers` and carry it into the trust panel's label lookup. Behaviour is identical — the prototype clears it only via `restart()`, and C3's `RESTART` returns `initialSession`. This is why Task 5's AC-V-2 test asserts `answers === {}` after the not-sure tap; that is not a transcription slip.
- **`matchPasted(input)` is extracted as a pure function.** The prototype has `pasteMatch()` (3320-3328), an action that reads `S.recoveryText`, writes answers and navigates. C3 splits the decision out of the side effects so AC-5's regressions can be pinned without rendering. The matching logic itself is unchanged, and `recoveryPastedText` is still written before the no-match return (3323 before 3324).
- **A matched paste writes `q1` via `ANSWER` (→ `applyCorrection`), which clears `q2` — the prototype's `setAns` on this path did not.** Verified unreachable in practice: reaching the paste screen already requires `q1: 'not_sure'`, and the reducer already cleared `q2` at that transition, so no state exists where the two behaviours diverge. C3's behaviour is also the more correct one under AC-8's own rule. Recorded for completeness (Task 4/9 review), not because it changes anything observable.
- **`index.html` gains two `preconnect` hints** for `fonts.googleapis.com` / `fonts.gstatic.com`. Prototype line 103 is the stylesheet link alone. Benign and standard, but it is authored markup in a chunk whose first Global Constraint forbids authoring, so it is on the record.
- **`SessionState.screen` / `history` are a `ScreenId` union and `SessionAction.service` is a `ServiceKey` union**, rather than `string` / `keyof typeof DEPS_FOR`. `DEPS_FOR` is typed `Record<string, DependentKeys>`, so `keyof` it is `string` and would type-check nothing. Both unions are declared in `session.ts`; `src/playbooks/` stays untouched.
- **The SIR coverage gate stays inside `SirState` (`SirScreens.tsx`, Task 5's shipped code), not "in the router" as Task 9's design note 4 literally says.** Caught during Task 9's review. The substantive MUST — `optionsForPhase`/`diagnose`/`evaluate` are never reachable for an unsupported SIR state — genuinely holds either way, and was verified against the real code path (`App.tsx` only reaches those calls under screen ids `sir-q1`/further, which `SirState.onSelect`'s `sirCoverage()` check gates before any `NAVIGATE` to them is ever dispatched). Since the gate was already correctly built and tested in Task 5, moving it into `App.tsx` for Task 9 would have been a pointless relocation of already-correct logic, not a fix — so it was left in place and the wording gap is recorded here instead.
- **The stamp and the answer rows carry NO added ARIA.** An earlier draft of this plan gave the stamp `role="status"` and `AnswerRow` `aria-pressed`; both are dropped. `role="status"` is an `aria-live` region that would re-announce on every same-screen re-render, and the stamp's label is already visible text; `aria-pressed` mis-describes a control that navigates rather than toggles. The only ARIA C3 adds is `aria-hidden="true"` on decorative glyphs (`.gems`, `.stamp-icon`), which the Global Constraints already require. **This is a reduction in authored markup, listed here because it reverses an earlier draft's decision, not because it deviates from the prototype.** Tests select the stamp as `document.querySelector('.stamp')`.

## Open questions — RULED. Nothing here is still open.

Four items where the brief, the PRD and the locked prototype genuinely disagreed. Each was escalated rather than silently resolved, the way C1's Task-6 contradiction was, and each now carries a ruling that the tasks above already encode. They are kept in full — question, evidence, ruling — because the reasoning is the record.

**1. Where does the escalation ladder belong — C3 or C5? — RULED: split it.**
*The conflict:* the C3 brief lists "escalation ladder" as part of the Diagnosis template. **The locked prototype renders it nowhere near the Diagnosis screen** — `renderLadder` has exactly one call site, `renderCasefile` line 2920, and the casefile screen is C5. `renderDiagnosis` (3581-3611) contains no ladder.
*Why it matters:* mounting the ladder on Diagnosis would be a design change to a locked design, made by a build chunk, without a new lock.
*The ruling:* **do not mount it, and split the task.** C3's Task 8 ships `ladder.ts` — `LADDER_DEFS`, `ladderFor`, `LADDER_TAG` — plus `ladder.test.ts`. That is the genuinely valuable and genuinely pure part; it is fully testable today, and its captions must go through Task 9's copy sweep now regardless. **`EscalationLadder.tsx` and CSS lines 801-826 defer to C5**, which owns the only screen that mounts it. An unmounted React component cannot be verified against the locked design in C3's manual pass, would enter the repo with no render test, and needs a C5 review pass anyway — so building it now buys nothing and costs a dead import C5 may not find. This also removes the "GATED" wording from the task list entirely. If a later chunk wants the ladder on Diagnosis, that is a design decision needing a new design lock, not an implementation choice.

**2. "Prepare this for me" — seam, stub, or omit? — RULED: seam, and omit the rest.**
*The conflict:* the brief says prepare/check-in call sites "should be present as inert/stubbed hooks or simply omitted." The prototype's Next Move already has a **real** no-prep branch (a secondary "Back to Home" button, shown for every WAIT and UNCLASSIFIED state).
*The ruling (encoded in Task 7):* use the prototype's own no-prep branch via a `hasPrepPlan` prop defaulting to `false`. Every C3 state renders "Back to Home". **No inert button ships anywhere.** `updateEntry` and `saveControl` are omitted outright — a visible control that does nothing is a worse artefact than a missing one, and both belong to C5's session model, not to a prop. No disabled placeholder, not even for demo purposes.
*And one thing this ruling must carry with it:* the prototype's no-prep button calls **`restart()`** (line 3663), not `nav('home')`. **"Back to Home" dispatches `RESTART`, not `NAVIGATE 'home'` — Home is a clean slate, always.** Without this stated, an implementer would reasonably wire it to a navigation and leave stale answers behind, which is precisely the bug the `back()` comment at 2032-2035 exists to prevent. Pinned by a named test in Task 7.

**3. `SOURCES_VERIFIED = '5 Sep 2026'` versus the fail-closed numeric scan. — RULED: option (a), specified concretely.**
*The finding:* the trust panel renders `Checked against NextMove's archived copy of this source on 5 Sep 2026.` C2's `numericFindings` `DATE_RE` matches `5 Sep 2026` → canonical key `"5 Sep"` → **no `sourced_dates` entry → the scan fails.** (`sourced_dates` holds only `30 Jun / 17 Aug / 31 Aug / 30 Sep / 29 Oct / 4 Nov`.) The date is project metadata — the last human verification of `sources/manifest.json` — not a government-process claim, so the scanner is right to see a date and wrong about what it means.
*Rejected:* **(b)** adding a `sourced_dates` entry keyed `"5 Sep"` pointing at the manifest's own provenance. Every other entry in that structure carries `file` / `locator` / `source_form` pointing at a government PDF; putting a NextMove-internal metadata date in there corrodes the one allowlist that must stay unambiguously government-sourced. **(c)** giving `numericFindings` an exemption mechanism — C2's handoff is explicit that C3 extends the harness's *input*, it does not fork the harness.
*The ruling — (a), keep the date out of the scanned set by construction:*
 - `SCREEN_COPY` registers the caption as a **template** at `ui:trust.verifiedOn`: `Checked against NextMove's archived copy of this source on {date}.` — no date in the scanned string, so the scan's teeth stay sharp with no allowlist erosion.
 - `TrustDisclosure.tsx` interpolates `SOURCES_VERIFIED` at render.
 - **A dedicated test in `TrustDisclosure.test.tsx` ties the constant to the manifest.** Concretely: `SOURCES_VERIFIED` must parse as `d Mon yyyy`, and must equal the single distinct ISO date shared by every `manifest.documents[*].captured` value. Two implementation details matter and both were verified against the committed manifest at `c2-playbooks`: **`documents` is an object keyed by filename, not an array** (iterate `Object.values`), and **two entries append provenance prose to the ISO date** — `"2026-09-05 (rendered in browser; raw HTML is a JS shell)"` and `"2026-09-05 via Wayback Machine snapshot 2025-03-18"` — so compare the leading 10 characters, not the whole string. There is **no top-level verification-date field** in the manifest (`Manifest` declares exactly `documents`, `rules`, `sourced_dates`, `sourced_intervals`), and C3 declares `sources/` untouched, so it cannot add one; the per-document `captured` prefix **is** the record. The test also asserts the prefixes are uniform, so C6's freshness job cannot silently desync them. `TrustDisclosure.test.tsx` is a test file and may therefore import `guardrails/manifest`; `TrustDisclosure.tsx` may not.
 - **The carve-out is recorded, not hidden.** This is the one place where a `SCREEN_COPY` entry's registered text cannot equal its rendered text, which contradicts Task 9's "every entry appears in its screen's rendered output" test. Task 9's `CAPTION_TEMPLATES` set carries `ui:trust.verifiedOn` with the reason inline, and a sibling test asserts the *interpolated* form does appear — so the carve-out excuses an exact match, never the string's existence.

**4. AC-10 says the trust panel shows the "matched state"; the locked prototype's trust panel does not. — RULED: follow the prototype, and record the residual.**
*The conflict:* PRD §20 AC-10 requires "You told us" **plus matched state**, plain-language reason, and cited source. The prototype's `trustDisclosure` (**2360-2375**) renders exactly four rows: *You told us* / *(You wrote, C8)* / *What that means* / *Based on*. There is no state row. The human-readable state (`d.label`, already stage·rung-composed for passport by C1's `decorateStageRung`) surfaces instead on **Next Move's crumb** (line 3667), as `{serviceLabel} · {d.label}`.
*The ruling:* **follow the prototype.** It is the design authority, it post-dates the AC, and adding a state row would change the Diagnosis screen's voice — that screen deliberately never names its state anywhere, which Task 6's leak test now pins as a positive assertion. AC-10's "matched state" requirement is satisfied by the Next Move crumb, and Task 7's tests **name the traceability in their titles** — `it('AC-10 (matched state): …')` — so a later audit for AC-10 finds it rather than concluding it was dropped.
*The residual, recorded honestly:* a citizen who taps "Why am I seeing this?" **on the Diagnosis screen** — which is where AC-10 says the disclosure is one tap away — does **not** see the matched state there. They see it only after continuing to Next Move. That is a defensible product call, and it is the locked design's call, but it is **not** a full satisfaction of AC-10 as literally written. It is a deliberate, known gap, recorded here so a later reviewer finds a decision rather than rediscovering a miss. Revisiting it means changing the locked prototype, not the implementation.

## Handoff notes for C4 (recorded now so they aren't rediscovered)

- **`NextMoveScreen` takes `hasPrepPlan?: boolean`.** C4 passes `Boolean(PREP[d.ruleId])` and adds the primary "Prepare this for me" CTA behind the same prop. Do not restructure the CTA branch — the no-prep branch is the locked design for WAIT/UNCLASSIFIED states and stays.
- **CSS for prepare lives at prototype lines 532-650** (`.prep-card`, `.prep-draft`, `.psteps`, `.pstep`, `.channel-card`, `.visit-card`, `.prep-trust`) and is deliberately not yet lifted into `src/index.css`. Append it; do not restyle. **Do not append the range blindly:** lines **562-568** inside it are `.saved-next` / `.saved-steps` / `.saved-meta`, which are **C5's** casefile styles, not C4's. Take 532-561 and 569-650.
- **C4 extends `SCREEN_COPY` (`src/screens/screenCopy.ts`) and the Task 9 guardrail sweep** with prepare-step copy and visit-card lines, addressed `serviceId:ruleId.field` — it does not write a second scanner (C2 handoff, restated). **`screenCopy.ts` must never import anything under `src/playbooks/guardrails/`, not even a type** — it declares its own local `{ at, text }` interface, and `guardrails/isolation.test.ts` fails the build if that is broken. Screens import their citizen-facing strings from `SCREEN_COPY`; C4 keeps that invariant, or Task 9's coverage test stops meaning anything.
- Screen ids `passport-prepare` / `voter-prepare` / `sir-prepare` are already the prototype's names; **add them to the `ScreenId` union in `session.ts` as well as to `App.tsx`'s switch** — the switch has a `never`-typed default arm, so a new union member without a case is a compile error (which is the point).
- **`NextMoveScreen`'s "Back to Home" dispatches `RESTART`.** When C4 adds the primary "Prepare this for me" CTA behind `hasPrepPlan`, it replaces that button on the prep path; it does not change what the no-prep path does.

## Handoff notes for C5

- **`SessionState` is deliberately minimal.** C5 adds `savedCases`, `workingCase`, `activeCaseId`, `ci*`, `prepChecks`, `logOpen`, `phaseDrift` — as new fields on the same reducer, not a second store. Extend the `ScreenId` union too; `App.tsx`'s switch is exhaustiveness-checked against it.
- **`restart()` must not touch auth or saved state** (implementation plan addendum). C3's `RESTART` returns `initialSession`; C5 must change it to preserve the persisted slice explicitly, and pin that with a test. **Note that Next Move's "Back to Home" dispatches `RESTART`** (prototype 3663), so this change is user-visible on that path, not only on the topbar control.
- **C5 owns the ENTIRE escalation ladder except its logic.** C3's Task 8 ships `src/templates/ladder.ts` (`LADDER_DEFS`, `ladderFor`, `LADDER_TAG`) with full AC-L-1 tests, and nothing else. **C5 builds `<EscalationLadder>`** — the port of `renderLadder`, prototype **2792-2803** — **appends CSS lines 801-826** (the range includes the prototype's own decision-recording comment at 801-803), and mounts it at the single call site the locked design gives it: `renderCasefile`, line **2920**. C5 owes it a render test: for a passport `['done','now','up']` state, assert three `.lrung` rows carrying classes `done`/`now`/`up`, the `LADDER_TAG` text on the first two and none on the third, `ICONS.stepCheck` present only on the `done` rung, `.lr-label` text equal to `LADDER_DEFS.passport.rungs`, and `.ladder-note` equal to the caption.
- **When `<EscalationLadder>` mounts, re-open the `--done-bg` question.** `--done-bg #DFF3E6` sits ΔE 2.80 from `--wait-bg #D9F2DF` — the same class of proximity as the retired `butter-soft`/`follow-bg` pair (1.75). C3's Task 1 exempts `done-bg` from the ΔE floor **on the explicit grounds that C3 mounts it on no classification surface**: its only lifted use is `.lrung.done .lr-tag` (prototype 825), which ships with the ladder in C5. That justification expires the moment the ladder renders. C5 must either re-affirm the exemption with a fresh, recorded reason or escalate it as a design finding needing a new lock. The proximity itself is already pinned by a named test in `src/ui/tokens.test.ts`, so it cannot drift unnoticed — but a passing test is not the same as a live justification.
- **`updateEntry` and `saveControl` were deliberately omitted from C3's Diagnosis and Next Move screens.** Both slot back in at the exact prototype positions: `updateEntry` after the Diagnosis CTA and after Next Move's CTA; `saveControl` last on Next Move. `.btn-ghost` / `.saved-note` CSS is at lines 651-660.
- **Home's casefiles section** is `renderHome`'s `savedCard` branch plus `.home-cases` CSS (line 767). C3's `Home.tsx` has a marked insertion point.
- **`CHECKIN_PATCHES` (C2 Task 8) is the data C5 builds on**, and the lookup order stays `CHECKIN_PATCHES[d.state] ?? CHECKIN_PATCHES[d.ruleId]`.

## Handoff notes for C6

- **`SOURCES_VERIFIED`** is a plain constant in `TrustDisclosure.tsx`. C6 sources it from the manifest and adds `freshBanner` at the two positions C3 left commented (first child of Diagnosis's right column, first child of Next Move's right column), plus the `sir-reverifying` screen (prototype 3505-3523).
- **C3 already ties `SOURCES_VERIFIED` to the manifest by test** (`TrustDisclosure.test.tsx`): it must parse as `d Mon yyyy` and equal the single distinct ISO prefix of every `manifest.documents[*].captured` value, and that test **fails if the captured dates stop being uniform**. C6's freshness job therefore cannot silently desync them — but it also means C6 must update the constant and the manifest in the same change. Note `documents` is an object keyed by filename, and two entries append provenance prose after the ISO date, so the comparison is on the leading 10 characters.
- **The caption is registered in `SCREEN_COPY` as a `{date}` template** (`ui:trust.verifiedOn`) precisely to keep the date out of the fail-closed numeric scan — see Open Question 3's ruling. If C6 moves the constant, the template must stay a template; putting a literal date into `SCREEN_COPY` turns the scan red and the correct fix is never to reword the copy.
- `degradedFor(engineKey)` returning true must reduce, never fabricate — the reverifying screen is a *coverage boundary*, styled like `sir-unsupported`, never as an error or as UNCLASSIFIED.
