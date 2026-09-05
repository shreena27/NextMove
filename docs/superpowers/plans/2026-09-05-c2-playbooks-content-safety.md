# C2 — Three Playbooks + Content-Safety Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship all 28 government-process rules (Passport 12, Voter Services 7, SIR 9) plus the three UNCLASSIFIED fallbacks as typed data conforming to C1's engine interfaces, the check-in patch payloads that 11 of those rules are reachable only through, and the full mechanical guardrail suite that makes all of it build-breakingly checkable — chunk C2 of `NextMove_Implementation_Plan_FINAL.md` §9 ("Three playbooks + content-safety suite. All rules as data; the full mechanical guardrail suite, manifest-resolution test first").

**Architecture:** Everything in this chunk is data + test harnesses, almost all of it under `src/playbooks/`. Zero React, zero DOM, zero new engine logic — C1's `evaluate()`, `diagnose()`, `decorateStageRung()`, `optionsForPhase()` and `sirCoverage()` are consumed unchanged. The design authority for every rule's copy, condition, state id, dependency, source and `mustNot` is the locked prototype `design/nextmove-v1-prototype.html` (git tag `v1-design-lock-2`), lines 1016–1516; the check-in patch payloads (Task 8) come from the same prototype, lines 2508–2596. The citation authority is `sources/manifest.json` plus the committed source files under `sources/`. **Nothing in this chunk is authored: every string is a transcription.** Where the prototype and the manifest disagree, that disagreement is a finding to record and fix in the manifest against the committed source text — never a licence to reword a rule.

**Tech Stack:** TypeScript (strict), Vitest. No new dependencies (`@types/node` is already installed; Task 1 turns it on for `src/`).

## Global Constraints

Carried forward from C1 (still binding), plus C2-specific additions.

- **Never invent rule content.** Every rule's `state`, `label`, `rungLabel`, `dependency`, `rec`, `explanation`, `whatShort`, `whatToDo`, `where`, `need`, `needList`, `howLong`, `expectNext`, `source` and `mustNot` is transcribed byte-for-byte from the locked prototype. If a transcription looks wrong, stop and raise it — do not "improve" it.
- **A declared guardrail without an executable test is a defect** (standing project rule, established after a three-round adversarial review found all three prose-only guardrails had failed). Every guardrail this chunk claims ships with a test that fails when the guardrail is violated.
- Government-process rules never live in components or engine code. C2 adds data and test harnesses only. `src/domain/` gains exactly one field on an existing type (Task 1) and one new data module, `checkinPatches.ts` (Task 8) — no new engine *logic* anywhere, and no change to any C1 behaviour.
- Every playbook evaluation stays **first-match-wins over ordered rules**, with exactly one fallback path (UNCLASSIFIED, `ruleId: null`). Rule order in each playbook file is load-bearing and is transcribed in the prototype's own order.
- `Diagnosis` is always derived fresh via `evaluate()`/`diagnose()` — never stored.
- TypeScript strict mode stays on; `npm run build` (`tsc -b && vite build`) must pass at the end of every task.
- Run tests with `npm test -- <path>` or `npx vitest run <path>`.
- The guardrail harness under `src/playbooks/guardrails/` reads real files from disk (`sources/manifest.json`, the committed source texts). It must never be imported by application code — its whole point is to fail when the *committed* bytes change.
- **Scoped exception to C1's "toy fixtures must be obviously fake" rule.** C1 required every test fixture to be unmistakably synthetic (`'Toy label'`, `'Toy source'`) so a fixture could never be mistaken for shipped government copy. C2 keeps the fake *copy*, but its guardrail tests deliberately use **real rule ids and real `docId`s** (`state-1`, `Citizens_Charter.pdf`, `s-duplicate`, `s-final-absent.whatShort`) inside toy playbooks. That is the point: a harness proven only against invented ids proves nothing about whether it would catch a real miscitation in the real manifest. The rule still binds everywhere else — every fixture *string* stays obviously fake, and no test fixture is ever imported by shipped data.
- **Every copy location is addressed as `<serviceId>:<ruleId>.<field>`.** Rule ids are globally unique but the three fallbacks are not: all three would collide on a bare `fallback.explanation`, and in a cross-playbook sweep the last playbook silently wins. The `serviceId:` prefix is therefore mandatory on every `CopyString.at`, on every `SAFETY_EXEMPTIONS.at`, and on every `allowed_in` entry in the manifest allowlists. It also matches the address `citationFindings` already emits.
- End every git commit message with these two lines (verbatim, as the final lines):

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8
  ```

---

## File Structure

```
src/
  domain/
    types.ts                        (MODIFY — SourceReference gains `docId: string | null`)
    evaluate.test.ts                (MODIFY — toy fixtures gain docId)
    engine.test.ts                  (MODIFY — toy fixtures gain docId)
    stageRung.test.ts               (MODIFY — toy fixtures gain docId)
    integration.test.ts             (MODIFY — toy fixtures gain docId)
  playbooks/
    guardrails/
      manifest.ts                   (NEW — typed manifest loader + normalizers; TEST-ONLY)
      manifest.test.ts              (NEW — manifest self-consistency)
      citations.ts                  (NEW — citationFindings + orphanFindings)
      citations.test.ts             (NEW — harness proven against the real manifest)
      contentSafety.ts              (NEW — BANNED_PATTERNS, exemptions, scanners)
      contentSafety.test.ts         (NEW — harness proven on toy fixtures)
      suite.ts                      (NEW — runGuardrailSuite(playbook, options))
    safetyNet.ts                    (NEW — SAFETY_NET_TITLE; fs-free, app-safe)
    passportPlaybook.ts             (NEW — 12 rules + fallback + deps + stage map)
    passportPlaybook.test.ts        (NEW — branch tests + guardrail suite)
    voterPlaybook.ts                (NEW — 7 rules + fallback + deps)
    voterPlaybook.test.ts           (NEW)
    sirPlaybook.ts                  (NEW — 9 rules + fallback + phases + states + Q1 options)
    sirPlaybook.test.ts             (NEW — includes the phase-flip extensibility test)
    engines.ts                      (NEW — passportEngine / voterEngine / sirEngine)
    engines.test.ts                 (NEW — wiring + cross-playbook guardrail sweep)
  domain/
    checkinPatches.ts               (NEW — Task 8: CHECKIN_PATCHES, payloads only)
    checkinPatches.test.ts          (NEW — Task 8: post-patch diagnosis assertions)
sources/
  manifest.json                     (MODIFY — Task 1 corrections + new allowlist blocks)
tsconfig.app.json                   (MODIFY — add "node" to `types`)
```

---

### Task 1: Citation plumbing — `docId`, node types, and manifest corrections

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/evaluate.test.ts`, `src/domain/engine.test.ts`, `src/domain/stageRung.test.ts`, `src/domain/integration.test.ts`, `tsconfig.app.json`, `sources/manifest.json`
- Create: `src/playbooks/guardrails/manifest.ts`, `src/playbooks/guardrails/manifest.test.ts`

**Interfaces:**
- Consumes: C1's `SourceReference`.
- Produces:
  - `SourceReference.docId: string | null` — the `sources/manifest.json` `documents` key (the ERD's `PLAYBOOK_RULE.source_id` FK into `SOURCE_REFERENCE.id`). `null` means "NextMove's own safety net", the ERD's documented null `source_id` for the three fallbacks.
  - `loadManifest(): Manifest`, `loadSourceText(file: string): string`, `squash(s: string): string`, `canonicalDate`, `canonicalInterval` (from `guardrails/manifest.ts`).

**Design notes — the four decisions C1 deferred here, resolved:**

1. **`docId` is a required, explicitly-nullable discriminator, not an optional field.** C1's `SourceReference` is `{ title, url?, quote? }`. Rule source *titles* do not match manifest *document* titles (the rules say `"Citizen's Charter (MEA)"` and `"Citizen's Charter — Grievance Redressal section (MEA)"`; the manifest document is titled `"Citizen's Charter (MEA / Passport Seva)"`), so the manifest-resolution test cannot string-match titles. It resolves on `docId`. Making the field required, and `null` the safety-net value, means the manifest-resolution test **branches on a discriminator field and never string-matches the safety-net title** — exactly what C1's handoff note asked for, and exactly what the ERD models.

   **Recorded deviation from "C2 never touches C1's engine code":** this is a one-field change to `src/domain/types.ts` plus a mechanical `docId` addition to **seven toy `source:` literals** in four C1 test files (`evaluate.test.ts` ×2, `engine.test.ts` ×2, `stageRung.test.ts` ×1, `integration.test.ts` ×2). No C1 *behavior* changes and no C1 test assertion changes. The alternative — an optional field enforced only by a test — was rejected because it lets a new rule ship with no citation binding at all and only fails later, in a test someone can forget to extend.

   `needList` needs **no** type change: C1 already shipped `needList?: string[]` on `RuleContent` (Task 2 of the C1 plan). Task 6 uses it for `s-notice`.

2. **Manifest coverage policy (the 25-vs-28 gap).** The policy this chunk adopts, and enforces bidirectionally in Task 7:
   - **Every rule in a shipped playbook must have a `sources.manifest.json` `rules` entry keyed by its rule id.** No exceptions, no "unmatched rules" carve-out.
   - **Every `rules` entry whose `status` is not `dormant` must have a matching rule in a shipped playbook.** A live entry with no rule is an orphan and fails the build.
   - **The three fallbacks are excluded from citation resolution by `docId === null`**, and are asserted separately: `docId` must be `null` *and* the title must be the safety-net line. Two conditions, so neither a stray `null` nor a copied safety-net string can pass alone.
   - The gap is therefore closed by **adding the six missing entries**, not by relaxing the test. The six are the check-in *pending* rules added in the tracking-loop surgery after the manifest was written: `state-5a-p`, `state-5b-p`, `state-dpg-p`, `v-5-p`, `s-3-p`, `s-4-p`. Each is a rung-state of an already-manifest-backed rule, cites the same document as its parent, and makes only verified-absence claims ("no official response timeline is published"), so each is entered with `"status": "honest_generic"` and `"quote": null` — the same honest treatment `state-2`, `state-3` and the three `-r` rules already carry.

3. **Manifest data defects found while writing this plan** (verified against the committed source text; all of them are manifest-side, not copy-side). **Three of them are rule/manifest mismatches** — `state-dpg`, `state-5b` and `s-5-dormant-final-roll` — and all three are resolved the same way: the design-locked rule copy wins and the manifest is corrected. That direction was re-verified directly against the committed source text (the grievance page's DPG paragraph versus `Citizens_Charter.pdf`'s Grievance Redressal section), so it is what the sources force, not a policy preference. See "Rulings applied before execution", item 5.
   - `v-5`'s quote reads `"A further appeal against the order of the Appellate Authority…"`. `Final-ER-FAQ.extracted.txt` line 696–697 reads `"A further appeal against the order of  Appellate Authority will lie before the Chief Electoral Officer of the State."` — no `the`. **Fix the manifest** (drop the word), do not touch `v-5`'s rule copy, which does not quote the sentence.
   - `s-notice`'s and `v-3`'s quotes only match once whitespace is squashed, because the PDF extraction splits `receipt` as `recei pt` and inserts a space in `Magistrate/ District`. This is an extraction artifact, not a citation error — handled by the `squash()` normalizer below, not by editing the quote.
   - **Mismatch 1 —** `state-dpg` is an **orphan entry**: no shipped rule has that id (the DPG rung shipped as `state-dpg-p` / `state-dpg-r`). Renamed to `state-dpg-p` in Step 7(b), since its quote (the "reasonable period of time" DPG paragraph) is precisely what `state-dpg-p`'s `howLong` rests on.
   - **Mismatch 2 —** `state-5b`'s entry points at `Citizens_Charter.pdf` while the shipped rule cites the grievance page and quotes its DPG paragraph. Same root cause as the orphan above; repointed in Step 7(b2).
   - **Mismatch 3 —** `rules["s-5-dormant-final-roll"]` carries `"status": "verified"`, not `"dormant"`, even though its own note reads "Dormant until Delhi's final_roll phase". It is **fully superseded**: `s-final-absent` carries the identical `file`, `locator` and `quote` (FAQ Q32, "…within 15 days"), and its own note says "Former dormant S-5, now structurally reachable under the final_roll phase only". No shipped rule uses the old id, so a `verified` status makes it a **live orphan**: `orphanFindings` correctly flags it, and Task 2's citation test and Task 7's cross-playbook sweep both fail as written. Set to `"dormant"` in Step 7(b3). Verified by execution: with this one edit, `orphanFindings([passport, voter, sir])` returns `[]`; without it, it returns exactly one finding naming `s-5-dormant-final-roll`.

4. **`tsconfig.app.json` gains `"node"` in `types`.** The guardrail harness must read the committed files from disk (`node:fs`, `node:url`); `src/` is currently typed without node globals, so `tsc -b` would fail. `@types/node` is already a devDependency. This is a build-config change with no runtime effect — nothing in the app import graph pulls `node:fs`, so Vite tree-shakes it out.

- [ ] **Step 1: Write the failing test** (`src/playbooks/guardrails/manifest.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { loadManifest, loadSourceText, squash, canonicalDate, canonicalInterval } from './manifest'

const manifest = loadManifest()

describe('manifest structure', () => {
  it('every rules entry names a document that exists', () => {
    for (const [ruleId, entry] of Object.entries(manifest.rules)) {
      expect(manifest.documents[entry.file], `rules.${ruleId}.file`).toBeDefined()
    }
  })

  it('every rules entry declares a known status', () => {
    const known = ['verified', 'verified_discrepancy', 'honest_generic', 'dormant']
    for (const [ruleId, entry] of Object.entries(manifest.rules)) {
      expect(known, `rules.${ruleId}.status`).toContain(entry.status)
    }
  })

  it('every non-null quote appears verbatim in its committed source file', () => {
    for (const [ruleId, entry] of Object.entries(manifest.rules)) {
      if (!entry.quote) continue
      const text = squash(loadSourceText(entry.file))
      expect(text.includes(squash(entry.quote)), `rules.${ruleId} quote not found in ${entry.file}`).toBe(true)
    }
  })

  it('a honest_generic entry never claims a quote', () => {
    for (const [ruleId, entry] of Object.entries(manifest.rules)) {
      if (entry.status === 'honest_generic') expect(entry.quote, `rules.${ruleId}`).toBeNull()
    }
  })

  it('carries an entry for every check-in pending rule C1 left unmatched', () => {
    for (const id of ['state-5a-p', 'state-5b-p', 'state-dpg-p', 'v-5-p', 's-3-p', 's-4-p']) {
      expect(manifest.rules[id], `rules.${id}`).toBeDefined()
    }
  })

  it('marks the superseded dormant-S-5 entry dormant, not live', () => {
    // s-5-dormant-final-roll was promoted into sirPlaybook as s-final-absent /
    // s-final-unchecked (identical file, locator and quote). Left at
    // "verified" it is a LIVE entry no shipped rule claims, so Task 7's
    // cross-playbook orphan sweep fails.
    expect(manifest.rules['s-5-dormant-final-roll'].status).toBe('dormant')
  })
})

describe('loadSourceText', () => {
  it('refuses a document with no committed text layer instead of reading PDF bytes as text', () => {
    // SIR_revised_Schedule_2026-07-15.pdf is an image-only scan whose
    // extracted_text is explicitly null. `doc.extracted_text ?? file` treats
    // null as PRESENT (only undefined triggers the fallback), so the loader
    // would silently hand back ~320KB of binary decoded as UTF-8 and every
    // quote check against it would fail for entirely the wrong reason.
    expect(() => loadSourceText('SIR_revised_Schedule_2026-07-15.pdf'))
      .toThrow(/no committed, checkable text/i)
  })

  it('throws on a document the manifest does not declare', () => {
    expect(() => loadSourceText('nope.pdf')).toThrow(/unknown manifest document/i)
  })
})

describe('sourced_dates allowlist', () => {
  it('is non-empty and every entry resolves to a document', () => {
    expect(Object.keys(manifest.sourced_dates).length).toBeGreaterThan(0)
    for (const [key, entry] of Object.entries(manifest.sourced_dates)) {
      expect(manifest.documents[entry.file], `sourced_dates["${key}"].file`).toBeDefined()
    }
  })

  it("every entry's source_form appears verbatim in its committed source file", () => {
    for (const [key, entry] of Object.entries(manifest.sourced_dates)) {
      const text = squash(loadSourceText(entry.file))
      expect(text.includes(squash(entry.source_form)), `sourced_dates["${key}"] not found in ${entry.file}`).toBe(true)
    }
  })

  it('is keyed in canonical "d Mon" form', () => {
    for (const key of Object.keys(manifest.sourced_dates)) {
      expect(canonicalDate(key), `sourced_dates key "${key}"`).toBe(key)
    }
  })

  it('covers the six dates the Delhi SIR calendar actually states', () => {
    expect(Object.keys(manifest.sourced_dates).sort())
      .toEqual(['17 Aug', '29 Oct', '30 Jun', '30 Sep', '31 Aug', '4 Nov'])
  })
})

describe('sourced_intervals allowlist', () => {
  it("every entry's source_form appears verbatim in its committed source file", () => {
    for (const [key, entry] of Object.entries(manifest.sourced_intervals)) {
      const text = squash(loadSourceText(entry.file))
      expect(text.includes(squash(entry.source_form)), `sourced_intervals["${key}"] not found in ${entry.file}`).toBe(true)
    }
  })

  it('is keyed in canonical singular form', () => {
    for (const key of Object.keys(manifest.sourced_intervals)) {
      expect(canonicalInterval(key), `sourced_intervals key "${key}"`).toBe(key)
    }
  })

  it("holds the playbook's one sourced numeric interval", () => {
    expect(Object.keys(manifest.sourced_intervals)).toEqual(['15 day'])
  })
})

describe('normalizers', () => {
  it('squash survives the PDF extractor splitting a word ("recei pt")', () => {
    expect(squash('upon receipt of')).toBe(squash('upon recei pt of'))
  })

  it('squash folds curly quotes and dashes to ASCII', () => {
    expect(squash('order’s — note')).toBe(squash("order's - note"))
  })

  it('canonicalDate normalizes long month names and years away', () => {
    expect(canonicalDate('4 November 2026')).toBe('4 Nov')
    expect(canonicalDate('04 Nov')).toBe('4 Nov')
  })

  it('canonicalInterval folds hyphen and plural forms together', () => {
    expect(canonicalInterval('15-day')).toBe('15 day')
    expect(canonicalInterval('15 days')).toBe('15 day')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/playbooks/guardrails/manifest.test.ts`
Expected: FAIL — `./manifest` module not found.

- [ ] **Step 3: Add `"node"` to `tsconfig.app.json`**

Change the `types` array to:

```json
"types": ["vite/client", "vitest/globals", "@testing-library/jest-dom", "node"],
```

- [ ] **Step 4: Add `docId` to `SourceReference`** (`src/domain/types.ts`)

Replace the `SourceReference` interface with:

```ts
export interface SourceReference {
  /** The `sources/manifest.json` `documents` key backing this citation —
   *  the ERD's PLAYBOOK_RULE.source_id FK into SOURCE_REFERENCE.id.
   *  `null` means "NextMove's own safety net": the three UNCLASSIFIED
   *  fallbacks, which the ERD models with a null source_id. Required and
   *  explicitly nullable so the manifest-resolution test branches on a
   *  discriminator, never on string-matching the safety-net title.
   *  C6's freshness job attaches sha256/degraded to the manifest document
   *  this id points at — no rule data changes when it lands. */
  docId: string | null
  title: string
  url?: string
  quote?: string
}
```

Then add `docId: null` to the seven toy `source:` literals in `src/domain/evaluate.test.ts` (lines ~17, ~36), `src/domain/engine.test.ts` (~18, ~37), `src/domain/stageRung.test.ts` (~17) and `src/domain/integration.test.ts` (~28, ~42). Example:

```ts
  source: { docId: null, title: 'Toy source' },
```

- [ ] **Step 5: Implement `src/playbooks/guardrails/manifest.ts`**

The loader is built **before** the manifest is corrected, on purpose. If the manifest is fixed first, Step 2's only evidence that the test works is "module not found" — which proves the import path, not the guardrail. Building the loader first makes Step 6 run the real checks against the *uncorrected* manifest, so each defect this task exists to fix (the `v-5` quote mismatch, the `state-dpg` orphan, the missing rung entries, the live `s-5-dormant-final-roll`) fails as a test, for the right reason, before it is fixed.

```ts
// TEST-ONLY. Reads the committed citation manifest and source texts off disk,
// so a guardrail test fails when the COMMITTED bytes change. Never import this
// from application code.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

export type ManifestStatus = 'verified' | 'verified_discrepancy' | 'honest_generic' | 'dormant'

export interface ManifestDocument {
  title: string
  url?: string
  captured?: string
  extracted_text?: string | null
  note?: string
  sha256?: string
  check?: string
}

export interface ManifestRule {
  file: string
  locator: string
  quote: string | null
  status: ManifestStatus
  note?: string
}

export interface AllowedValue {
  file: string
  locator: string
  source_form: string
  year?: number
  meaning: string
  allowed_in: string[]
}

export interface Manifest {
  documents: Record<string, ManifestDocument>
  rules: Record<string, ManifestRule>
  sourced_dates: Record<string, AllowedValue>
  sourced_intervals: Record<string, AllowedValue>
}

export function loadManifest(): Manifest {
  return JSON.parse(readFileSync(`${repoRoot}sources/manifest.json`, 'utf8')) as Manifest
}

/** The committed, checkable text for a manifest document: the `.extracted.txt`
 *  companion for PDFs, the file itself for the `web/` captures. */
export function loadSourceText(file: string): string {
  const doc = loadManifest().documents[file]
  if (!doc) throw new Error(`unknown manifest document: ${file}`)
  // An EXPLICIT null means "image-only scan, no text layer" (the superseded
  // SIR_revised_Schedule PDF). `?? file` would treat null as present and read
  // ~320KB of PDF bytes as UTF-8, which does not throw — it silently returns
  // mojibake and every quote check against it fails for the wrong reason.
  if (doc.extracted_text === null) {
    throw new Error(
      `manifest document "${file}" declares "extracted_text": null — it has no committed, checkable text layer (image-only scan). Nothing may cite it. Give it an .extracted.txt companion or stop citing it.`,
    )
  }
  const path = doc.extracted_text ?? file
  return readFileSync(`${repoRoot}sources/${path}`, 'utf8')
}

/** Collapse a string to a whitespace-free, ASCII-punctuation, lowercase form.
 *  Whitespace is REMOVED, not collapsed, on purpose: the PDF extractor splits
 *  words mid-token ("recei pt", "Magistrate/ District"), which is an extraction
 *  artifact, not a citation error. Squashing both sides makes a verbatim quote
 *  check survive it without loosening what "verbatim" means. */
export function squash(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "04 November 2026" / "4 Nov" -> "4 Nov". Year is dropped from the key and
 *  checked separately against the allowlist entry's `year`. */
export function canonicalDate(raw: string): string {
  const m = /^\s*0*(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+\d{4})?\s*$/.exec(raw)
  if (!m) return raw
  const month = MONTHS.find(x => x.toLowerCase() === m[2].toLowerCase())
  return month ? `${Number(m[1])} ${month}` : raw
}

/** "15-day" / "15 days" -> "15 day". */
export function canonicalInterval(raw: string): string {
  const m = /^\s*(\d+)[-\s]*([A-Za-z]+?)s?\s*$/.exec(raw)
  return m ? `${Number(m[1])} ${m[2].toLowerCase()}` : raw
}
```

- [ ] **Step 6: Run tests to verify they fail for the RIGHT reason**

Run: `npx vitest run src/playbooks/guardrails/manifest.test.ts`
Expected: FAIL, but now on the real defects, not on a missing module — the `v-5` quote is not found in `Final-ER-FAQ.extracted.txt`; `state-5a-p`/`state-5b-p`/`state-dpg-p`/`v-5-p`/`s-3-p`/`s-4-p` are undefined; `s-5-dormant-final-roll` reads `verified`; `sourced_dates` and `sourced_intervals` do not exist yet. Record which assertions failed before fixing them: that list is the evidence the guardrail bites.

- [ ] **Step 7: Correct and extend `sources/manifest.json`**

Six edits, in order:

**(a)** Fix `rules["v-5"].quote` — drop the word `the` before `Appellate Authority`:

```json
    "v-5": {
      "file": "Final-ER-FAQ.pdf",
      "locator": "Q34",
      "quote": "A further appeal against the order of Appellate Authority will lie before the Chief Electoral Officer of the State.",
      "status": "verified",
      "note": "Quote corrected 2026-09-05 (C2 Task 1): the earlier transcription read 'the order of the Appellate Authority'; the committed extraction reads 'the order of Appellate Authority'. Rule copy does not quote the sentence and is unchanged."
    },
```

**(b)** Rename the orphan `state-dpg` entry to `state-dpg-p` (mismatch 1) and record why:

```json
    "state-dpg-p": {
      "file": "web/grievance_page.txt",
      "locator": "Grievance page, DPG paragraph",
      "quote": "If your passport-related grievance has not been satisfactory redressed by the MEA/Passport issuing Authority within a reasonable period of time, you may lodge a grievance with the Directorate of Public Grievances (DPG), Cabinet Secretariat, Government of India",
      "status": "verified",
      "note": "'Within a reasonable period of time' — supports the rule's verified-absence claim that no numeric deadline exists. Renamed from 'state-dpg' 2026-09-05 (C2 Task 1): the DPG rung shipped as state-dpg-p/state-dpg-r in the tracking-loop surgery, leaving this entry orphaned under the old id."
    },
```

**(b2)** Repoint `rules["state-5b"]` at the document the rule itself cites (mismatch 2). The shipped `state-5b` rule carries `source.title` `"Grievance page — passportindia.gov.in"` and quotes the DPG paragraph's `"...within a reasonable period of time"`; the manifest entry points at `Citizens_Charter.pdf`'s Grievance Redressal section, which backs `state-5a`'s CPGRAMS channel, not `state-5b`'s DPG escalation. The rule's citation is design-locked; the manifest entry is the stale half. Same root cause as (b) — both entries predate the tracking-loop rung split.

```json
    "state-5b": {
      "file": "web/grievance_page.txt",
      "locator": "Grievance page, DPG paragraph",
      "quote": "If your passport-related grievance has not been satisfactory redressed by the MEA/Passport issuing Authority within a reasonable period of time, you may lodge a grievance with the Directorate of Public Grievances (DPG), Cabinet Secretariat, Government of India",
      "status": "verified",
      "note": "Repointed from Citizens_Charter.pdf 2026-09-05 (C2 Task 1): the rule's own design-locked citation is the grievance page's DPG paragraph (it escalates TO the DPG and quotes 'within a reasonable period of time'). The Charter's Grievance Redressal section backs state-5a's CPGRAMS channel, which state-5a already cites."
    },
```

**(b3)** Mark `rules["s-5-dormant-final-roll"]` dormant (mismatch 3). Its own note already says "Dormant until Delhi's final_roll phase", but its `status` reads `verified`, so `orphanFindings` — correctly — flags it as a live entry no shipped rule claims. It is fully superseded: `s-final-absent` carries the identical `file`, `locator` and `quote`, and the dormant S-5 content shipped as `s-final-absent` / `s-final-unchecked`. Only the `status` and `note` change; the citation itself is correct and is left byte-for-byte alone.

```json
    "s-5-dormant-final-roll": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q32",
      "quote": "The applicant can file an appeal before the District Election Officer/District Magistrate of concerned District within 15 days.",
      "status": "dormant",
      "note": "Dormant until Delhi's final_roll phase (04.11.2026). The playbook's sole sourced numeric interval. SUPERSEDED 2026-09-05 (C2 Task 1): the dormant S-5 was promoted into sirPlaybook as s-final-absent (and motivates s-final-unchecked), which carry this same Q32 file/locator/quote under their own ids. Status corrected from 'verified' to 'dormant' so this retired id is not a live orphan — no shipped rule uses it."
    },
```

**(c)** Add the five remaining missing rule entries:

```json
    "state-5a-p": {
      "file": "Citizens_Charter.pdf",
      "locator": "Grievance Redressal section",
      "quote": null,
      "status": "honest_generic",
      "note": "Follow-up-sent WAIT rung of state-5a. Makes only a verified-absence claim ('no official response timeline is published for informal follow-ups'); the Charter supports only that a grievance route exists. Added 2026-09-05 (C2 Task 1)."
    },
    "state-5b-p": {
      "file": "web/grievance_page.txt",
      "locator": "Grievance page, DPG paragraph",
      "quote": null,
      "status": "honest_generic",
      "note": "Grievance-filed WAIT rung of state-5b. Its howLong rests on the same 'reasonable period of time' verified absence as state-dpg-p; no separate quote is claimed. Added 2026-09-05 (C2 Task 1)."
    },
    "v-5-p": {
      "file": "Final-ER-FAQ.pdf",
      "locator": "Q34",
      "quote": null,
      "status": "honest_generic",
      "note": "Second-appeal-filed WAIT rung of v-5. Q34 establishes the second tier exists; no decision timeframe is stated anywhere, which is exactly what the rule says. Added 2026-09-05 (C2 Task 1)."
    },
    "s-3-p": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q4 (calendar)",
      "quote": "Final Publication of Electoral Roll",
      "status": "verified",
      "note": "Form-6-filed WAIT rung of s-roll-absent. Its only factual claim is the next fixed milestone, Final Roll publication on 04.11.2026 (Q4 row 5). Added 2026-09-05 (C2 Task 1)."
    },
    "s-4-p": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q4 (calendar)",
      "quote": "Final Publication of Electoral Roll",
      "status": "verified",
      "note": "Documents-submitted WAIT rung of s-notice. Same single factual claim as s-3-p: the 04.11.2026 Final Roll milestone. Added 2026-09-05 (C2 Task 1)."
    },
```

**(d)** Add a top-level `"sourced_dates"` block (sibling of `"rules"`). Every date any shipped copy may state, each tied to the row of the CEO Delhi FAQ Q4 calendar that states it. `allowed_in` is a `serviceId:ruleId.field` (or `serviceId:SIR_PHASES.<id>.note`) allowlist, matching the mandatory `CopyString.at` address in the Global Constraints — this is what keeps the P0 fix recorded in `VERIFICATION_NOTES.md` §2 fixed: re-adding `29 Oct` to a rule that tells the citizen to *file* fails the build.

```json
  "sourced_dates": {
    "30 Jun": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q4 row 1 (house-to-house visit)",
      "source_form": "30.06.2026",
      "year": 2026,
      "meaning": "House-to-house enumeration begins.",
      "allowed_in": ["sir:SIR_PHASES.claims_notice.note"]
    },
    "17 Aug": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q4 row 1 (house-to-house visit)",
      "source_form": "17.08.2026",
      "year": 2026,
      "meaning": "House-to-house enumeration ends. Enumeration-phase actions are retired from this date.",
      "allowed_in": ["sir:SIR_PHASES.claims_notice.note"]
    },
    "31 Aug": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q4 row 2 (publication of draft electoral roll)",
      "source_form": "31.08.2026",
      "year": 2026,
      "meaning": "Draft Electoral Roll published.",
      "allowed_in": ["sir:SIR_PHASES.claims_notice.note"]
    },
    "30 Sep": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q4 row 3 (period of filing claims & objections)",
      "source_form": "30.09.2026",
      "year": 2026,
      "meaning": "THE CITIZEN'S filing deadline: claims and objections must be filed by this date. Anything the citizen must file cites this, never 29 Oct.",
      "allowed_in": ["sir:s-roll-absent.howLong", "sir:s-roll-unchecked.howLong", "sir:SIR_PHASES.claims_notice.note"]
    },
    "29 Oct": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q4 row 4 (notice phase and disposal of claims and objections)",
      "source_form": "29.10.2026",
      "year": 2026,
      "meaning": "THE ERO'S disposal deadline, not the citizen's. May only describe the phase's own end; may never appear in an instruction to file.",
      "allowed_in": ["sir:s-notice.howLong", "sir:SIR_PHASES.claims_notice.note"]
    },
    "4 Nov": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q4 row 5 / Q31 (final publication of electoral roll)",
      "source_form": "04.11.2026",
      "year": 2026,
      "meaning": "Final Roll publication.",
      "allowed_in": [
        "sir:s-3-p.howLong", "sir:s-3-p.where.label", "sir:s-4-p.howLong",
        "sir:s-roll-present.howLong", "sir:s-roll-present.where.label",
        "sir:SIR_PHASES.claims_notice.note", "sir:SIR_PHASES.final_roll.note"
      ]
    }
  },
```

**(e)** Add a top-level `"sourced_intervals"` block — the playbook's one sourced numeric interval:

```json
  "sourced_intervals": {
    "15 day": {
      "file": "FAQ_SIR2026.pdf",
      "locator": "Q32",
      "source_form": "within 15 days",
      "meaning": "SIR appeal window, running from Final Roll publication.",
      "allowed_in": [
        "sir:s-final-absent.whatShort", "sir:s-final-absent.whatToDo", "sir:s-final-absent.howLong",
        "sir:s-final-unchecked.explanation", "sir:s-final-unchecked.whatToDo", "sir:s-final-unchecked.howLong",
        "sir:SIR_PHASES.final_roll.note"
      ]
    }
  },
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/playbooks/guardrails/manifest.test.ts` — Expected: PASS (19 tests).
Run: `npx vitest run` — Expected: all 50 C1 tests still pass (the `docId` additions are type-only).
Run: `npm run build` — Expected: success.

- [ ] **Step 9: Commit**

```bash
git add src/domain/types.ts src/domain/*.test.ts tsconfig.app.json sources/manifest.json src/playbooks/guardrails/manifest.ts src/playbooks/guardrails/manifest.test.ts
git commit -m "feat(c2): citation plumbing — SourceReference.docId, manifest loader, manifest corrections

docId is a required, explicitly-nullable FK into sources/manifest.json's
documents (ERD PLAYBOOK_RULE.source_id), so the manifest-resolution test
branches on a discriminator instead of string-matching the safety-net title.
Manifest gains the 6 missing check-in-rung entries, a corrected v-5 quote,
the renamed state-dpg-p entry, the superseded s-5-dormant-final-roll entry
marked dormant instead of live, and the sourced_dates/sourced_intervals
allowlists the content-safety scan resolves its numeric claims against.
All three rule/manifest mismatches resolve the same way: the design-locked
rule copy wins and the manifest is corrected against committed source text.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8"
```

---

### Task 2: The manifest-resolution test (the master plan's "first" guardrail)

**Files:**
- Create: `src/playbooks/safetyNet.ts`, `src/playbooks/guardrails/citations.ts`, `src/playbooks/guardrails/citations.test.ts`

**Interfaces:**
- Consumes: `loadManifest` (Task 1); C1's `Playbook`, `PlaybookRule`, `SourceReference`.
- Produces:
  - `citationFindings(playbook: Playbook): string[]` — every way this playbook's citations fail to resolve, as human-readable strings. Empty array = clean.
  - `orphanFindings(playbooks: Playbook[]): string[]` — the reverse direction: live manifest entries with no shipped rule.
  - `SAFETY_NET_TITLE` — the exact fallback source title, defined once in `src/playbooks/safetyNet.ts` so the three playbook files and the tests cannot drift.

**Why `SAFETY_NET_TITLE` lives in its own module, not in `citations.ts`:** the three playbook files need it, and `citations.ts` reaches `node:fs` through `manifest.ts`. Importing it from there would put `node:fs` in the *application* import graph — the exact thing the Global Constraints forbid. `safetyNet.ts` is a bare constant with no imports; `citations.ts` re-exports it so test code can keep importing from one place.

**Design notes:** `NextMove_Implementation_Plan_FINAL.md` §7 defines this test as "every rule's cited source resolves to a `sources/manifest.json` entry, and every entry's quote appears verbatim in its committed source file. An un-backable citation fails the build." The second half — quote-appears-verbatim — is already enforced in Task 1 over the whole manifest. This task adds the *binding*: that each shipped rule points at the right manifest entry, that the entry backing it is not dormant, and that the fallback is uncited by construction.

The quote check deliberately runs on the **manifest's** `quote`, never on the rule's own `source.quote`. They are different things and conflating them is the trap: several rules carry an editorial `source.quote` that describes the citation rather than quoting it (`state-4`: `"Verbatim official guidance for adverse/unclear status."`; `state-1`: `"Police-verification period is explicitly excluded from every stated service timeline."`). Asserting those appear verbatim in a PDF would fail on correct data.

Findings are returned, never thrown, so one run reports every problem at once instead of stopping at the first.

- [ ] **Step 1: Write the failing tests** (`src/playbooks/guardrails/citations.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { citationFindings, orphanFindings, SAFETY_NET_TITLE } from './citations'
import type { Playbook, PlaybookRule } from '../../domain/types'

const rule = (id: string, source: PlaybookRule['source']): PlaybookRule => ({
  id,
  condition: () => false,
  rec: 'WAIT',
  state: `st-${id}`,
  label: `Toy label ${id}`,
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  need: 'Toy need.',
  source,
})

const fallback = (source: PlaybookRule['source']): Playbook['fallback'] => ({
  rec: 'UNCLASSIFIED',
  state: 'st-fallback',
  label: 'Toy unclear',
  dependency: 'Unknown',
  explanation: 'Toy fallback.',
  whatShort: 'Toy check directly.',
  whatToDo: 'Toy check status.',
  where: { label: 'Toy portal' },
  need: 'Toy need.',
  source,
})

// 'state-1' is a real manifest entry (Citizens_Charter.pdf). The harness is
// exercised against the REAL manifest — the only thing that proves it would
// catch a real miscitation.
const clean: Playbook = {
  serviceId: 'toy',
  rules: [rule('state-1', { docId: 'Citizens_Charter.pdf', title: "Citizen's Charter (MEA)" })],
  fallback: fallback({ docId: null, title: SAFETY_NET_TITLE }),
}

const withRule = (r: PlaybookRule): Playbook => ({ ...clean, rules: [r] })

describe('citationFindings', () => {
  it('reports nothing for a rule whose docId matches its manifest entry', () => {
    expect(citationFindings(clean)).toEqual([])
  })

  it('flags a rule with no manifest entry at all', () => {
    const f = citationFindings(withRule(rule('toy-unknown', { docId: 'Citizens_Charter.pdf', title: 'x' })))
    expect(f.join('\n')).toMatch(/toy-unknown.*no sources\/manifest\.json entry/i)
  })

  it('flags a rule whose docId disagrees with its manifest entry', () => {
    const f = citationFindings(withRule(rule('state-1', { docId: 'FAQ_SIR2026.pdf', title: 'x' })))
    expect(f.join('\n')).toMatch(/state-1.*disagrees.*Citizens_Charter\.pdf/i)
  })

  it('flags a rule whose docId is not a known document', () => {
    const f = citationFindings(withRule(rule('state-1', { docId: 'nope.pdf', title: 'x' })))
    expect(f.join('\n')).toMatch(/state-1.*unknown document/i)
  })

  it('flags a live rule citing a dormant manifest entry', () => {
    const f = citationFindings(withRule(rule('s-duplicate', { docId: 'FAQ_SIR2026.pdf', title: 'x' })))
    expect(f.join('\n')).toMatch(/s-duplicate.*dormant/i)
  })

  it('flags a rule that carries the safety-net docId (null) instead of a citation', () => {
    const f = citationFindings(withRule(rule('state-1', { docId: null, title: 'x' })))
    expect(f.join('\n')).toMatch(/state-1.*only the fallback/i)
  })

  it('flags a fallback whose docId is not null', () => {
    const f = citationFindings({
      ...clean,
      fallback: fallback({ docId: 'Citizens_Charter.pdf', title: SAFETY_NET_TITLE }),
    })
    expect(f.join('\n')).toMatch(/fallback.*docId must be null/i)
  })

  it('flags a fallback whose title is not the safety-net line (both conditions, not either)', () => {
    const f = citationFindings({ ...clean, fallback: fallback({ docId: null, title: 'Something else' }) })
    expect(f.join('\n')).toMatch(/fallback.*safety-net title/i)
  })

  it('identifies the fallback by discriminator, not by string-matching a document title', () => {
    // The safety-net title is deliberately NOT a manifest document title.
    expect(SAFETY_NET_TITLE).toMatch(/safety net/i)
    expect(citationFindings(clean)).toEqual([])
  })
})

describe('orphanFindings', () => {
  it('flags a live manifest entry that no shipped rule claims', () => {
    expect(orphanFindings([clean]).join('\n')).toMatch(/v-1.*orphan/i)
  })

  it('never flags a dormant entry as an orphan', () => {
    // BOTH of the manifest's dormant entries. s-5-dormant-final-roll only
    // passes this because Task 1 Step 7(b3) corrected its status from
    // 'verified' to 'dormant'; left as shipped it is a live orphan and this
    // assertion is what catches it.
    const f = orphanFindings([clean]).join('\n')
    expect(f).not.toMatch(/s-duplicate/)
    expect(f).not.toMatch(/s-5-dormant-final-roll/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/playbooks/guardrails/citations.test.ts`
Expected: FAIL — `./citations` module not found.

- [ ] **Step 3: Implement `src/playbooks/safetyNet.ts`**

```ts
// The exact source title every playbook's UNCLASSIFIED fallback carries.
// Its own module, with no imports, because both the shipped playbooks and the
// fs-backed guardrail harness need it and the playbooks must never reach the
// harness (and through it, node:fs).
export const SAFETY_NET_TITLE = "NextMove's own safety net — not a sourced official state."
```

- [ ] **Step 4: Implement `src/playbooks/guardrails/citations.ts`**

```ts
// TEST-ONLY. The manifest-resolution guardrail
// (NextMove_Implementation_Plan_FINAL.md §7 — first of the mechanical tests).
import type { Playbook } from '../../domain/types'
import { loadManifest } from './manifest'
import { SAFETY_NET_TITLE } from '../safetyNet'

// Re-exported so test code imports the constant from one place.
export { SAFETY_NET_TITLE }

/** Every way this playbook's citations fail to resolve. Empty = clean.
 *  Returns findings instead of throwing so one run reports all of them. */
export function citationFindings(playbook: Playbook): string[] {
  const manifest = loadManifest()
  const findings: string[] = []

  for (const rule of playbook.rules) {
    const at = `${playbook.serviceId}:${rule.id}`
    if (rule.source.docId === null) {
      findings.push(`${at}: docId null is reserved for the UNCLASSIFIED fallback — only the fallback may be uncited.`)
      continue
    }
    if (!manifest.documents[rule.source.docId]) {
      findings.push(`${at}: cites unknown document "${rule.source.docId}".`)
    }
    const entry = manifest.rules[rule.id]
    if (!entry) {
      findings.push(`${at}: no sources/manifest.json entry for this rule id.`)
      continue
    }
    if (entry.status === 'dormant') {
      findings.push(`${at}: its manifest entry is dormant — a retired citation cannot back a reachable rule.`)
    }
    if (entry.file !== rule.source.docId) {
      findings.push(`${at}: docId "${rule.source.docId}" disagrees with its manifest entry's file "${entry.file}".`)
    }
  }

  const fb = playbook.fallback.source
  if (fb.docId !== null) {
    findings.push(
      `${playbook.serviceId}:fallback: docId must be null (the ERD's null source_id for the safety net), got "${fb.docId}".`,
    )
  }
  if (fb.title !== SAFETY_NET_TITLE) {
    findings.push(`${playbook.serviceId}:fallback: must carry the safety-net title verbatim, got "${fb.title}".`)
  }
  return findings
}

/** The reverse direction: a live manifest entry no shipped rule claims.
 *  Dormant entries are exempt — that status exists precisely to record
 *  content retired from the reachable set. */
export function orphanFindings(playbooks: Playbook[]): string[] {
  const manifest = loadManifest()
  const shipped = new Set(playbooks.flatMap(p => p.rules.map(r => r.id)))
  return Object.entries(manifest.rules)
    .filter(([id, entry]) => entry.status !== 'dormant' && !shipped.has(id))
    .map(([id]) => `sources/manifest.json rules."${id}": live entry with no shipped rule (orphan).`)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/playbooks/guardrails/citations.test.ts` — Expected: PASS (11 tests).
Run: `npm run build` — Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/playbooks/safetyNet.ts src/playbooks/guardrails/citations.ts src/playbooks/guardrails/citations.test.ts
git commit -m "feat(c2): manifest-resolution guardrail — citationFindings + orphanFindings

Every rule resolves to a live manifest entry whose file matches its docId;
the fallback is identified by docId === null AND the safety-net title, never
by string-matching the title alone. orphanFindings closes the reverse
direction so a live entry cannot outlive the rule that claimed it.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8"
```

---

### Task 3: The content-safety scan — banned patterns, manifest-backed allowlists, retired actions, cause states

**Files:**
- Create: `src/playbooks/guardrails/contentSafety.ts`, `src/playbooks/guardrails/contentSafety.test.ts`, `src/playbooks/guardrails/suite.ts`

**Interfaces:**
- Consumes: `loadManifest`, `canonicalDate`, `canonicalInterval` (Task 1); `citationFindings` (Task 2); C1's `Playbook`, `RuleContent`.
- Produces:
  - `BANNED_PATTERNS`, `SAFETY_EXEMPTIONS`, `RETIRED_ACTIONS`, `CAUSE_STATES`, `COPY_FIELDS`
  - `copyStrings(playbook): CopyString[]` and `extraCopy(at, text): CopyString`
  - `bannedFindings`, `staleExemptionFindings`, `numericFindings`, `retiredActionFindings`, `causeStateFindings`
  - `runGuardrailSuite(playbook, extra?): void` (from `suite.ts`) — the single call each playbook's test file makes.

**Design notes:**

**The `BANNED_PATTERNS` table is lifted from git history, not reinvented.** C1's handoff note: "C2 must lift the hand-authored `BANNED_PATTERNS` table from git history (`91ff7a1`, `src/playbooks/contentSafety.test.ts`) rather than reinvent it." Retrieved with `git show 91ff7a1:src/playbooks/contentSafety.test.ts`; it holds seven rows with written reasons (day/week/month threshold, deadline, guarantee, "we submitted", "we filed", government-affiliation claim, causal language). **Every `pattern` and every `reason` is transcribed byte-for-byte below.** One row is *added* as a documented C2 extension — the original interval row (`\b\d+\s*(day|days|…)\b`) misses the hyphenated form, so `"15-day"` slips through it; the extension row catches it. Nothing is loosened. Each row also gains **two metadata fields that change no pattern and no reason**: `id`, so an exemption can name the one pattern it exempts (see below), and `interval`, which marks the two day-count rows that compose with the manifest allowlist (see below).

**The two day-count rows COMPOSE with `numericFindings`; they do not duplicate it.** C1's instruction, quoted in this plan's own architecture note, was that C2 extend `BANNED_PATTERNS` with the manifest-backed date allowlist **and** that the real copy legitimately contains these values. The two scanners were always meant to compose, and as first drafted they did not: `bannedFindings` re-flagged text that `numericFindings` had already cleared. Executed over the real 28 rules + 3 fallbacks + SIR's phase notes, the lifted table matches **12 times**: 5 are the reviewed exemptions below, and the other 7 are legitimate, sourced "15 day(s)" / "15-day" references — `s-final-absent.whatShort` / `.whatToDo` / `.howLong`, `s-final-unchecked.explanation` / `.whatToDo` / `.howLong`, and `SIR_PHASES.final_roll.note` — every one of which `sourced_intervals`' `allowed_in` already clears.

Adding those 7 to `SAFETY_EXEMPTIONS` was rejected: it would turn a build-breaking guardrail into a hand-maintained allowlist of exactly the copy it exists to police, and it would maintain the same allowlist twice. Instead, when a match comes from an `interval` row, `bannedFindings` **delegates to the same manifest lookup `numericFindings` uses** — `canonicalInterval(match)` must resolve in `sourced_intervals` *and* the location must appear in that entry's `allowed_in`. Anything else still fires. Verified by execution: `bannedFindings` over the whole real corpus returns `[]`, while an unsourced `"45 days"`, and a sourced `"15 days"` at a location it is not allow-listed for, are both still caught.

**An exemption is scoped to one location AND one pattern.** As first drafted, `SAFETY_EXEMPTIONS` rows carried only an `at`, and `bannedFindings` skipped the entire string there — so `s-notice.whatToDo`, exempted purely for the causal regex over-firing on "as your notice directs", was silently blind to affiliation claims, "guaranteed" language, and invented day-counts. The plan's own scoping test ("an exemption is scoped to one field, not to the whole rule") checked *field* scoping only, so the hole was invisible. Every row now names the single `BannedPatternId` it exempts, and the skip matches on both. A test injects a second, unexempted banned phrase at an exempted location and asserts it is still caught.

**What gets scanned.** `COPY_FIELDS` is the citizen-facing set: `label`, `dependency`, `explanation`, `whatShort`, `whatToDo`, `need`, `howLong`, `expectNext`, plus `where.label` and each `needList` item. Every location is addressed `serviceId:ruleId.field` (Global Constraints) — without the prefix all three playbooks' fallbacks collide on `fallback.explanation` and a cross-playbook sweep silently keeps only the last. Deliberately excluded:
- `mustNot` — it is the *negative declaration* of what the copy may not say, so it legitimately contains the banned words themselves (`"Any claim that filing guarantees inclusion."`). Scanning it would make every honest guardrail declaration a violation. It is instead asserted *present* on the cause states below.
- `state` — an internal id, never rendered as prose.
- `source.quote` — an editorial description of the citation, checked by Task 2's binding rather than as citizen copy.

**Exemptions are a reviewed data table, not a looser regex.** After the interval composition above, the lifted table's remaining matches against the real 28 rules are exactly five, and none is a violation. Each becomes a row in `SAFETY_EXEMPTIONS` with its pattern id and reason recorded, and `staleExemptionFindings` fails the build if an exemption stops matching *that pattern* — so the list cannot rot into permanent blanket permission after a copy edit. Four are the `deadline` row firing on verified-*absence* statements, which are the opposite of the invented-deadline claim the pattern exists to catch; the fifth is the `causal` row over-firing on `"as your notice directs"`, which defers to the citizen's own notice rather than asserting a cause. Verified by execution: all five still match their named pattern against the real copy, so none is stale.

**Numeric claims resolve against the manifest, not a hardcoded list.** §7 requires "an allowlist of manifest-backed sourced dates … Any date or day-count outside the allowlist fails the build." Every interval and date match is looked up in `sourced_intervals` / `sourced_dates` (Task 1), and the match's own `at` (`serviceId:ruleId.field`) must appear in that entry's `allowed_in`. This is what keeps the P0 error recorded in `sources/VERIFICATION_NOTES.md` §2 fixed: `29 Oct` is allow-listed only in `s-notice.howLong` and the phase note, so re-introducing it into an instruction to *file* (where the citizen's real deadline is `30 Sep`) fails the build rather than shipping a date one month past the actual window.

**Retired-action-noun scan** (§7): **this pass covers rule copy only; C4 and C5 extend its input.** §7's declared surface is "every reachable rule's copy, prepare steps, and check-in labels". Prepare steps are C4's and check-in labels are C5's, so two-thirds of that surface does not exist yet. The ruling (see "Rulings applied", item 2) is to ship the scanner now over rule copy and require **both** C4 and C5 to extend the harness's *input* rather than fork it — `runGuardrailSuite(playbook, { extra })` already takes any `CopyString[]`, exactly as C3 will do for screen copy. The scan is therefore **declared incomplete on purpose, with named owners**, not declared finished.

Within rule copy it is scanned over **action fields only** (`whatShort`, `whatToDo`, `where.label`). This is deliberate and load-bearing — `s-roll-absent.explanation` and `s-final-absent.need` both mention the Enumeration Form as a *past* event ("Maybe the Enumeration Form wasn't deposited in time", "Proof of your earlier submission (Enumeration Form acknowledgment…)"), which is honest history, not an instruction to perform a retired action. Scanning explanations would force those two truthful sentences to be reworded to satisfy a test. §7's wording is "actions belonging to a phase that has already ended" — an *action*.

**Cause-state assertions** (§7: "Adverse/unclear/notice states (Passport State 4, Voter V-3/V-4, SIR S-3/S-4) may never assert a specific cause for their outcome — covered by a dedicated content test per state"). Mapped to real rule ids: `state-4`, `v-3`, `v-4`, `s-roll-absent`, `s-notice`. Every one must declare a non-empty `mustNot`, and every one whose outcome has an unexplained cause must carry an explicit "NextMove can't tell…" disclaimer.

**Recorded deviation from §7's list:** `v-4` is exempt from the disclaimer requirement. §7 groups it with the adverse states, but `v-4` is *"Appeal already filed, decision pending"* — a WAIT state with no adverse finding and no outcome to explain, so there is nothing for a disclaimer to disclaim. It keeps the `mustNot` requirement and the causal-pattern ban. Flagged rather than silently dropped.

- [ ] **Step 1: Write the failing tests** (`src/playbooks/guardrails/contentSafety.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import {
  BANNED_PATTERNS, SAFETY_EXEMPTIONS, CAUSE_STATES, COPY_FIELDS,
  copyStrings, extraCopy, bannedFindings, staleExemptionFindings,
  numericFindings, retiredActionFindings, causeStateFindings,
} from './contentSafety'
import type { Playbook, PlaybookRule } from '../../domain/types'
import { SAFETY_NET_TITLE } from './citations'

const rule = (id: string, over: Partial<PlaybookRule> = {}): PlaybookRule => ({
  id,
  condition: () => false,
  rec: 'WAIT',
  state: `st-${id}`,
  label: 'Toy label',
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  need: 'Toy need.',
  source: { docId: 'Citizens_Charter.pdf', title: 'Toy source' },
  mustNot: 'Toy must-not.',
  ...over,
})

const book = (rules: PlaybookRule[]): Playbook => ({
  serviceId: 'toy',
  rules,
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'st-fallback',
    label: 'Toy unclear',
    dependency: 'Unknown',
    explanation: 'Toy fallback.',
    whatShort: 'Toy check directly.',
    whatToDo: 'Toy check status.',
    where: { label: 'Toy portal' },
    need: 'Toy need.',
    source: { docId: null, title: SAFETY_NET_TITLE },
  },
})

describe('the lifted BANNED_PATTERNS table', () => {
  it('carries the seven hand-authored rows plus the documented hyphen extension', () => {
    expect(BANNED_PATTERNS).toHaveLength(8)
    for (const row of BANNED_PATTERNS) expect(row.reason.length).toBeGreaterThan(0)
  })

  it('catches the hyphenated interval the original row misses', () => {
    const original = BANNED_PATTERNS[0].pattern
    expect(original.test('15-day')).toBe(false)
    expect(BANNED_PATTERNS.some(r => r.pattern.test('15-day'))).toBe(true)
  })
})

describe('copyStrings', () => {
  it('collects the citizen-facing fields, where.label and needList items', () => {
    const ats = copyStrings(book([
      rule('toy-1', { needList: ['Item one', 'Item two'], howLong: 'Toy how long.', expectNext: 'Toy expect next.' }),
    ])).map(s => s.at)
    for (const f of COPY_FIELDS) expect(ats).toContain(`toy:toy-1.${f}`)
    expect(ats).toContain('toy:toy-1.where.label')
    expect(ats).toContain('toy:toy-1.needList[0]')
    expect(ats).toContain('toy:toy-1.needList[1]')
    expect(ats).toContain('toy:fallback.explanation')
  })

  it('never scans mustNot, state or source.quote', () => {
    const ats = copyStrings(book([rule('toy-1')])).map(s => s.at)
    expect(ats.some(a => a.endsWith('.mustNot'))).toBe(false)
    expect(ats.some(a => a.endsWith('.state'))).toBe(false)
    expect(ats.some(a => a.includes('source'))).toBe(false)
  })
})

describe('bannedFindings', () => {
  it('reports nothing for clean copy', () => {
    expect(bannedFindings(copyStrings(book([rule('toy-1')])))).toEqual([])
  })

  it.each([
    ['whatToDo', 'Wait 30 days and then follow up.', /day\/week\/month/i],
    ['whatToDo', 'The deadline is fixed.', /deadline/i],
    ['explanation', 'Approval is guaranteed.', /guarantee/i],
    ['explanation', 'We submitted your form for you.', /submitted/i],
    ['explanation', 'We filed the grievance.', /filed/i],
    ['explanation', 'NextMove is an official government service.', /affiliation/i],
    ['explanation', 'It was rejected because your address was wrong.', /causal/i],
    ['howLong', 'A 15-day window applies.', /day\/week\/month/i],
  ])('flags %s copy: %s', (field, text, reason) => {
    const findings = bannedFindings(copyStrings(book([rule('toy-1', { [field]: text })])))
    expect(findings.join('\n')).toMatch(reason)
  })

  it('honours an exemption row', () => {
    const exempt = SAFETY_EXEMPTIONS[0]
    const strings = [{ at: exempt.at, text: 'The official page publishes no numeric deadline.' }]
    expect(bannedFindings(strings)).toEqual([])
  })

  it('an exemption is scoped to one field, not to the whole rule', () => {
    const exempt = SAFETY_EXEMPTIONS[0]
    const otherField = `${exempt.at.split('.')[0]}.explanation`
    const findings = bannedFindings([{ at: otherField, text: 'The deadline is fixed.' }])
    expect(findings.join('\n')).toMatch(/deadline/i)
  })

  it('an exemption is scoped to ONE pattern, not to every pattern at that location', () => {
    // The hole this closes: a row exempted only for the causal false-positive
    // used to silence affiliation claims, "guaranteed", and invented day-counts
    // at the very same string.
    const exempt = SAFETY_EXEMPTIONS[0] // the 'deadline' row at state-5b.howLong
    const f = bannedFindings([
      { at: exempt.at, text: 'No numeric deadline is published, and approval is guaranteed.' },
    ]).join('\n')
    expect(f).toMatch(/guarantee/i)             // the unexempted pattern still fires
    expect(f).not.toMatch(/invented deadline/i) // the exempted one stays suppressed
  })

  it('composes with the manifest interval allowlist instead of re-flagging sourced copy', () => {
    // The real SIR copy states a sourced "15 days" / "15-day". numericFindings
    // already clears it via sourced_intervals.allowed_in; bannedFindings must
    // defer to that verdict rather than force the same copy onto a second,
    // hand-maintained allowlist.
    expect(bannedFindings([{ at: 'sir:s-final-absent.whatShort', text: 'File an appeal within 15 days' }])).toEqual([])
    expect(bannedFindings([{ at: 'sir:SIR_PHASES.final_roll.note', text: 'a 15-day appeal window applies' }])).toEqual([])
  })

  it('still flags a sourced interval at a location it is NOT allow-listed for', () => {
    const f = bannedFindings([{ at: 'passport:state-1.whatToDo', text: 'File an appeal within 15 days' }])
    expect(f.join('\n')).toMatch(/day\/week\/month/i)
  })

  it('still flags a day-count with no sourced_intervals entry at all', () => {
    const f = bannedFindings([{ at: 'sir:s-final-absent.whatShort', text: 'Wait 45 days.' }])
    expect(f.join('\n')).toMatch(/day\/week\/month/i)
  })
})

describe('staleExemptionFindings', () => {
  it('flags an exemption that no longer matches anything', () => {
    const findings = staleExemptionFindings([{ at: 'toy-1.whatToDo', text: 'Clean copy.' }])
    expect(findings.length).toBe(SAFETY_EXEMPTIONS.length)
    expect(findings.join('\n')).toMatch(/no longer matches/i)
  })
})

describe('numericFindings (manifest-backed allowlists)', () => {
  it('allows an interval at an allow-listed location', () => {
    expect(numericFindings([{ at: 'sir:s-final-absent.whatShort', text: 'File an appeal within 15 days' }])).toEqual([])
  })

  it('flags the same interval at a location that is not allow-listed', () => {
    const f = numericFindings([{ at: 'passport:state-1.whatToDo', text: 'File an appeal within 15 days' }])
    expect(f.join('\n')).toMatch(/15 day.*not allowed in passport:state-1\.whatToDo/i)
  })

  it('flags an interval that is not in sourced_intervals at all', () => {
    const f = numericFindings([{ at: 'sir:s-final-absent.whatShort', text: 'Wait 45 days.' }])
    expect(f.join('\n')).toMatch(/45 day.*no sourced_intervals entry/i)
  })

  it('allows an allow-listed date at its allow-listed location', () => {
    expect(numericFindings([{ at: 'sir:s-roll-absent.howLong', text: 'closes 30 Sep 2026 in Delhi.' }])).toEqual([])
  })

  it("flags the ERO's 29 Oct disposal date used in a citizen filing instruction (the recorded P0 regression)", () => {
    const f = numericFindings([{ at: 'sir:s-roll-absent.howLong', text: 'File Form 6 through 29 Oct 2026.' }])
    expect(f.join('\n')).toMatch(/29 Oct.*not allowed in sir:s-roll-absent\.howLong/i)
  })

  it('flags a date with the wrong year even at an allow-listed location', () => {
    const f = numericFindings([{ at: 'sir:s-roll-absent.howLong', text: 'closes 30 Sep 2027 in Delhi.' }])
    expect(f.join('\n')).toMatch(/30 Sep.*year 2027.*2026/i)
  })

  it('flags a date with no sourced_dates entry', () => {
    const f = numericFindings([{ at: 'sir:s-roll-absent.howLong', text: 'Filing opens 12 Feb 2027.' }])
    expect(f.join('\n')).toMatch(/12 Feb.*no sourced_dates entry/i)
  })
})

describe('retiredActionFindings', () => {
  it('flags a retired-phase action in an action field', () => {
    const f = retiredActionFindings(book([rule('toy-1', { whatToDo: 'Submit the Enumeration Form now.' })]), 'claims_notice')
    expect(f.join('\n')).toMatch(/toy-1\.whatToDo.*enumeration/i)
  })

  it('does not flag the same noun in an explanation (honest history, not an instruction)', () => {
    const f = retiredActionFindings(
      book([rule('toy-1', { explanation: "Maybe the Enumeration Form wasn't deposited in time." })]),
      'claims_notice',
    )
    expect(f).toEqual([])
  })

  it('does not flag an action from a phase that has not ended', () => {
    const f = retiredActionFindings(book([rule('toy-1', { whatToDo: 'Submit the Enumeration Form now.' })]), 'enumeration')
    expect(f).toEqual([])
  })
})

describe('causeStateFindings', () => {
  it('is configured for the five §7 states', () => {
    expect(CAUSE_STATES.map(s => s.ruleId).sort())
      .toEqual(['s-notice', 's-roll-absent', 'state-4', 'v-3', 'v-4'])
  })

  it('flags a cause state with no mustNot declared', () => {
    const f = causeStateFindings(book([rule('state-4', { mustNot: undefined, explanation: "NextMove can't tell you why." })]))
    expect(f.join('\n')).toMatch(/state-4.*mustNot/i)
  })

  it('flags a cause state missing its "NextMove can\'t tell" disclaimer', () => {
    const f = causeStateFindings(book([rule('state-4', { explanation: 'It reads as negative.' })]))
    expect(f.join('\n')).toMatch(/state-4.*disclaimer/i)
  })

  it('does not require a disclaimer from v-4 (recorded deviation: no adverse outcome to explain)', () => {
    const f = causeStateFindings(book([rule('v-4', { explanation: 'Your appeal is still with the appellate authority.' })]))
    expect(f).toEqual([])
  })

  it('ignores rules that are not cause states', () => {
    expect(causeStateFindings(book([rule('state-1')]))).toEqual([])
  })
})

describe('extraCopy', () => {
  it('wraps a non-rule string (a SIR phase note) for the same scanners', () => {
    expect(extraCopy('sir:SIR_PHASES.final_roll.note', 'A 15-day appeal window applies.')).toEqual({
      at: 'sir:SIR_PHASES.final_roll.note',
      text: 'A 15-day appeal window applies.',
    })
    expect(numericFindings([extraCopy('sir:SIR_PHASES.final_roll.note', 'A 15-day appeal window applies.')])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/playbooks/guardrails/contentSafety.test.ts`
Expected: FAIL — `./contentSafety` module not found.

- [ ] **Step 3: Implement `src/playbooks/guardrails/contentSafety.ts`**

```ts
// TEST-ONLY. The content-safety scan
// (NextMove_Implementation_Plan_FINAL.md §7 and §8).
import type { Playbook, RuleContent } from '../../domain/types'
import { loadManifest, canonicalDate, canonicalInterval } from './manifest'

export interface CopyString {
  /** "<serviceId>:<ruleId>.<field>", or a non-rule location like
   *  "sir:SIR_PHASES.final_roll.note". The serviceId prefix is mandatory:
   *  without it all three playbooks' fallbacks collide on "fallback.explanation"
   *  and a cross-playbook sweep silently keeps only the last one. Matches the
   *  shape of the manifest allowlists' `allowed_in` entries. */
  at: string
  text: string
}

export type BannedPatternId =
  | 'interval' | 'deadline' | 'guarantee' | 'we-submitted' | 'we-filed'
  | 'affiliation' | 'causal' | 'interval-hyphenated'

/** LIFTED VERBATIM from commit 91ff7a1, src/playbooks/contentSafety.test.ts —
 *  the hand-authored table. Every `pattern` and `reason` in rows 1-7 is
 *  byte-for-byte the original. Row 8 is a documented C2 EXTENSION: the original
 *  interval row requires whitespace between the number and the unit, so
 *  "15-day" slips through it. Nothing here was loosened.
 *
 *  Two metadata fields are added to every row and change no pattern and no
 *  reason: `id`, so an exemption can name the ONE pattern it exempts, and
 *  `interval`, which marks the two day-count rows that compose with the
 *  manifest's sourced_intervals allowlist. */
export const BANNED_PATTERNS: {
  id: BannedPatternId
  pattern: RegExp
  reason: string
  interval?: true
}[] = [
  { id: 'interval', pattern: /\b\d+\s*(day|days|week|weeks|month|months)\b/i, reason: 'invented day/week/month threshold', interval: true },
  { id: 'deadline', pattern: /\bdeadline\b/i, reason: 'invented deadline' },
  { id: 'guarantee', pattern: /\bguarantee(d|s)?\b/i, reason: 'promised/guaranteed resolution' },
  { id: 'we-submitted', pattern: /\bwe (have )?submitted\b/i, reason: 'claims NextMove submitted something on the user\'s behalf' },
  { id: 'we-filed', pattern: /\bwe filed\b/i, reason: 'claims NextMove filed something on the user\'s behalf' },
  { id: 'affiliation', pattern: /\b(government of india|official government (app|service|portal)|we are (the|an?) (official|government))\b/i, reason: 'claims government affiliation' },
  {
    id: 'causal',
    pattern: /\b(because|due to|caused by|the reason is|since your|as your)\b/i,
    reason: 'uses causal language that risks stating/implying a cause for the adverse finding',
  },
  // C2 extension (2026-09-05): hyphenated interval form.
  { id: 'interval-hyphenated', pattern: /\b\d+-(day|days|week|weeks|month|months)\b/i, reason: 'invented day/week/month threshold (hyphenated form)', interval: true },
]

/** Reviewed, per-location, PER-PATTERN exemptions. Each is a real match of one
 *  named banned pattern that is NOT a violation, with the reason recorded.
 *  Scoped to one `at` AND one pattern id, never to a whole rule and never to a
 *  whole location: an exemption for the causal row at s-notice.whatToDo leaves
 *  every other pattern live at that same string. staleExemptionFindings()
 *  fails the build if one stops matching, so the list cannot rot into blanket
 *  permission after a copy edit. */
export const SAFETY_EXEMPTIONS: { at: string; pattern: BannedPatternId; reason: string }[] = [
  {
    at: 'passport:state-5b.howLong',
    pattern: 'deadline',
    reason: 'States a verified ABSENCE ("no numeric deadline is published"), the opposite of asserting one. Backed by the grievance page\'s "within a reasonable period of time" (manifest state-dpg-p).',
  },
  {
    at: 'passport:state-5b-p.howLong',
    pattern: 'deadline',
    reason: 'Same verified-absence statement as state-5b.howLong, for the pending rung.',
  },
  {
    at: 'voter:v-3.howLong',
    pattern: 'deadline',
    reason: 'States a verified absence: Final-ER-FAQ Q34 sets no deadline for a first appeal (manifest v-3 note, PRD §23 research question (b), closed 2026-09-05).',
  },
  {
    at: 'sir:s-notice.howLong',
    pattern: 'deadline',
    reason: 'States a verified absence: no elector-facing response deadline exists in any source, so the notice\'s own instructions govern (manifest s-notice note; grill A11).',
  },
  {
    at: 'sir:s-notice.whatToDo',
    pattern: 'causal',
    reason: 'The causal row over-fires on "as your notice directs" — that defers to the citizen\'s own notice, it does not assert a cause. Pattern kept byte-faithful to the lifted table; the exemption is the recorded deviation.',
  },
]

/** Action nouns belonging to an SIR phase that has already ended. Scanned
 *  over ACTION fields only — a past-tense mention in an explanation is
 *  honest history, not an instruction (see the plan's design notes).
 *  C4 (prepare steps) and C5 (check-in labels) EXTEND this scan's input;
 *  they must not fork the harness. */
export const RETIRED_ACTIONS: {
  action: RegExp
  retiredNoun: string
  retiredForPhases: string[]
  reason: string
}[] = [
  {
    action: /enumeration form/i,
    retiredNoun: 'Enumeration Form',
    retiredForPhases: ['claims_notice', 'final_roll'],
    reason: 'House-to-house enumeration closed 17.08.2026 (CEO Delhi FAQ Q4 row 1), so filing an Enumeration Form can no longer be done. Phase-gating applies ON TOP of sources: FAQ Q22 still states the remedy verbatim, and it is still impossible to follow (sources/VERIFICATION_NOTES.md §3).',
  },
]

/** §7: adverse/unclear/notice states may never assert a cause.
 *  `needsDisclaimer: false` on v-4 is a recorded deviation — see the plan. */
export const CAUSE_STATES: { ruleId: string; needsDisclaimer: boolean }[] = [
  { ruleId: 'state-4', needsDisclaimer: true },
  { ruleId: 'v-3', needsDisclaimer: true },
  { ruleId: 'v-4', needsDisclaimer: false },
  { ruleId: 's-roll-absent', needsDisclaimer: true },
  { ruleId: 's-notice', needsDisclaimer: true },
]

export const COPY_FIELDS = [
  'label', 'dependency', 'explanation', 'whatShort', 'whatToDo', 'need', 'howLong', 'expectNext',
] as const

const ACTION_FIELDS = ['whatShort', 'whatToDo'] as const

const DISCLAIMER = /nextmove can'?t (tell|verify)/i

export function extraCopy(at: string, text: string): CopyString {
  return { at, text }
}

function contentStrings(serviceId: string, id: string, c: RuleContent): CopyString[] {
  const out: CopyString[] = []
  const at = `${serviceId}:${id}`
  for (const field of COPY_FIELDS) {
    const text = c[field]
    if (typeof text === 'string') out.push({ at: `${at}.${field}`, text })
  }
  out.push({ at: `${at}.where.label`, text: c.where.label })
  c.needList?.forEach((item, i) => out.push({ at: `${at}.needList[${i}]`, text: item }))
  return out
}

/** Every citizen-facing string in a playbook, addressed serviceId-first.
 *  mustNot, state and source are excluded on purpose (see the design notes). */
export function copyStrings(playbook: Playbook): CopyString[] {
  return [
    ...playbook.rules.flatMap(r => contentStrings(playbook.serviceId, r.id, r)),
    ...contentStrings(playbook.serviceId, 'fallback', playbook.fallback),
  ]
}

const exemptKey = (at: string, pattern: BannedPatternId) => `${at} :: ${pattern}`
const exempt = new Set(SAFETY_EXEMPTIONS.map(e => exemptKey(e.at, e.pattern)))

export function bannedFindings(strings: CopyString[]): string[] {
  const intervals = loadManifest().sourced_intervals
  const findings: string[] = []
  for (const { at, text } of strings) {
    for (const row of BANNED_PATTERNS) {
      const m = row.pattern.exec(text)
      if (!m) continue
      if (exempt.has(exemptKey(at, row.id))) continue
      // The two day-count rows compose with the manifest's sourced_intervals
      // allowlist instead of duplicating it: a day count that IS sourced AND
      // IS allow-listed for this exact location has already been cleared by
      // numericFindings, so re-flagging it here would force the real, sourced
      // copy onto a hand-maintained exemption list.
      if (row.interval) {
        const entry = intervals[canonicalInterval(m[0])]
        if (entry && entry.allowed_in.includes(at)) continue
      }
      findings.push(`${at}: banned pattern (${row.reason}) matched "${m[0]}" in: ${text}`)
    }
  }
  return findings
}

/** An exemption whose NAMED pattern no longer matches at its location is dead
 *  permission. Checked per-pattern, not "any pattern", so narrowing an
 *  exemption cannot silently keep it alive on a different match. */
export function staleExemptionFindings(strings: CopyString[]): string[] {
  const byAt = new Map(strings.map(s => [s.at, s.text]))
  return SAFETY_EXEMPTIONS
    .filter(e => {
      const text = byAt.get(e.at)
      const row = BANNED_PATTERNS.find(r => r.id === e.pattern)
      return text === undefined || !row || !row.pattern.test(text)
    })
    .map(e => `SAFETY_EXEMPTIONS["${e.at}" / ${e.pattern}]: no longer matches that banned pattern — remove it.`)
}

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
const INTERVAL_RE = /\b\d+[-\s]*(?:day|days|week|weeks|month|months|year|years)\b/gi
const DATE_RE = new RegExp(String.raw`\b\d{1,2}\s+(?:${MONTHS})[a-z]*\.?(?:\s+(\d{4}))?\b`, 'gi')

/** §7's allowlist check: every numeric interval and calendar date in shipped
 *  copy must be a manifest-backed sourced value, allow-listed for exactly the
 *  location it appears in. bannedFindings defers to this verdict for the two
 *  day-count patterns — the two scanners compose, they do not duplicate. */
export function numericFindings(strings: CopyString[]): string[] {
  const manifest = loadManifest()
  const findings: string[] = []

  for (const { at, text } of strings) {
    for (const m of text.matchAll(INTERVAL_RE)) {
      const key = canonicalInterval(m[0])
      const entry = manifest.sourced_intervals[key]
      if (!entry) {
        findings.push(`${at}: "${m[0]}" (canonical "${key}") has no sourced_intervals entry in sources/manifest.json.`)
      } else if (!entry.allowed_in.includes(at)) {
        findings.push(`${at}: "${m[0]}" (canonical "${key}") is sourced but not allowed in ${at}. ${entry.meaning}`)
      }
    }
    for (const m of text.matchAll(DATE_RE)) {
      const key = canonicalDate(m[0])
      const entry = manifest.sourced_dates[key]
      if (!entry) {
        findings.push(`${at}: "${m[0]}" (canonical "${key}") has no sourced_dates entry in sources/manifest.json.`)
        continue
      }
      if (!entry.allowed_in.includes(at)) {
        findings.push(`${at}: "${m[0]}" (canonical "${key}") is sourced but not allowed in ${at}. ${entry.meaning}`)
      }
      const year = m[1] ? Number(m[1]) : undefined
      if (year !== undefined && entry.year !== undefined && year !== entry.year) {
        findings.push(`${at}: "${m[0]}" states year ${year}; the sourced date is ${entry.year} (${entry.source_form}).`)
      }
    }
  }
  return findings
}

/** §7's retired-action-noun scan, for the state's currently configured phase. */
export function retiredActionFindings(playbook: Playbook, currentPhaseId: string): string[] {
  const findings: string[] = []
  for (const entry of RETIRED_ACTIONS) {
    if (!entry.retiredForPhases.includes(currentPhaseId)) continue
    for (const rule of playbook.rules) {
      for (const field of ACTION_FIELDS) {
        const text = rule[field]
        if (entry.action.test(text)) {
          findings.push(`${playbook.serviceId}:${rule.id}.${field}: instructs a retired action ("${entry.retiredNoun}"). ${entry.reason}`)
        }
      }
      if (entry.action.test(rule.where.label)) {
        findings.push(`${playbook.serviceId}:${rule.id}.where.label: routes to a retired action ("${entry.retiredNoun}"). ${entry.reason}`)
      }
    }
  }
  return findings
}

/** §7's per-state cause test. */
export function causeStateFindings(playbook: Playbook): string[] {
  const findings: string[] = []
  for (const spec of CAUSE_STATES) {
    const rule = playbook.rules.find(r => r.id === spec.ruleId)
    if (!rule) continue
    if (!rule.mustNot || rule.mustNot.trim() === '') {
      findings.push(`${playbook.serviceId}:${rule.id}: a cause state must declare mustNot — what its copy may never assert.`)
    }
    if (spec.needsDisclaimer && !DISCLAIMER.test(`${rule.explanation} ${rule.whatToDo}`)) {
      findings.push(`${playbook.serviceId}:${rule.id}: a cause state must carry an explicit "NextMove can't tell…" disclaimer in its explanation or whatToDo.`)
    }
  }
  return findings
}
```

- [ ] **Step 4: Implement `src/playbooks/guardrails/suite.ts`**

```ts
// TEST-ONLY. One call per playbook: every §7/§8 guardrail, reported together.
import { expect } from 'vitest'
import type { Playbook } from '../../domain/types'
import { citationFindings } from './citations'
import {
  copyStrings, bannedFindings, staleExemptionFindings,
  numericFindings, retiredActionFindings, causeStateFindings,
  type CopyString,
} from './contentSafety'

export interface SuiteOptions {
  /** Non-rule citizen-facing copy this playbook ships (SIR's phase notes). */
  extra?: CopyString[]
  /** The state's currently configured phase, for the retired-action scan.
   *  Playbooks with no phase model pass 'none'. */
  currentPhaseId?: string
}

export function guardrailFindings(playbook: Playbook, options: SuiteOptions = {}): string[] {
  const strings = [...copyStrings(playbook), ...(options.extra ?? [])]
  return [
    ...citationFindings(playbook),
    ...bannedFindings(strings),
    ...numericFindings(strings),
    ...retiredActionFindings(playbook, options.currentPhaseId ?? 'none'),
    ...causeStateFindings(playbook),
  ]
}

/** Asserts a playbook is clean. Assert on the findings ARRAY, not a boolean,
 *  so a failure prints exactly what broke. */
export function runGuardrailSuite(playbook: Playbook, options: SuiteOptions = {}): void {
  expect(guardrailFindings(playbook, options)).toEqual([])
}

export { staleExemptionFindings, copyStrings }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/playbooks/guardrails/contentSafety.test.ts` — Expected: PASS (36 tests).
Run: `npm run build` — Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/playbooks/guardrails/contentSafety.ts src/playbooks/guardrails/contentSafety.test.ts src/playbooks/guardrails/suite.ts
git commit -m "feat(c2): content-safety scan — lifted BANNED_PATTERNS, manifest-backed allowlists, retired-action and cause-state tests

BANNED_PATTERNS is the hand-authored table from 91ff7a1: every pattern and
reason transcribed byte-for-byte, plus one documented row for the hyphenated
interval form the original misses. The two day-count rows COMPOSE with
sourced_intervals rather than duplicating it, so the real, sourced 15-day
appeal copy passes without being added to an exemption list. Exemptions are
a reviewed table scoped to one location AND one named pattern, so exempting
a causal false-positive cannot blind that same string to a "guaranteed"
claim; the build fails when an entry stops matching its named pattern.
Intervals and dates resolve against sources/manifest.json's
sourced_intervals/sourced_dates, so the recorded P0 (citing the ERO's
29 Oct disposal date in a citizen filing instruction) cannot come back.
The retired-action scan runs over rule copy; C4 and C5 extend its input.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8"
```

---

### Task 4: Passport playbook — 12 rules, fallback, stage map, deps map

**Files:**
- Create: `src/playbooks/passportPlaybook.ts`, `src/playbooks/passportPlaybook.test.ts`

**Interfaces:**
- Consumes: C1's `Playbook`, `PlaybookRule`, `DependentKeys`, `evaluate`; `SAFETY_NET_TITLE` (Task 2); `runGuardrailSuite`, `staleExemptionFindings`, `copyStrings` (Task 3).
- Produces:
  - `passportPlaybook: Playbook` — 12 rules in the prototype's own order (order is load-bearing: first-match-wins), plus the UNCLASSIFIED fallback.
  - `PASSPORT_STAGE_SHORT: Record<string, string>` — the stage·rung short labels, consumed by Task 7's `decorate`.
  - `PASSPORT_DEPS: DependentKeys` — `{ q1: ['q2'] }`.

**Design notes:**
- **Every string below is transcribed from `design/nextmove-v1-prototype.html` lines 1023–1169.** Do not reword, retitle, re-punctuate, or "fix" anything, including the middot in `5a·R` and the curly apostrophes.
- **Rule order is the prototype's order and is load-bearing.** The three "moving again" rules (`-r`) come first, then the check-in pending rules (`-p`, most-specific-first), then the ladder rungs, then the four base stages in reverse-stage order. Reordering silently changes diagnoses.
- Answer values (fixed by the conditions): `q1 ∈ {no_contact, contacted_incomplete, verified_no_progress, adverse, not_sure}`, `q2 ∈ {no_followup, informal, formal_grievance}`. `not_sure` deliberately matches no condition, so `evaluate()` falls through to the fallback on its own — the prototype's recorded "safest thing to do now" behavior, with no sentinel value.
- Outcome keys (`fOutcome`, `gOutcome`, `dpgOutcome`, `dpgFiled`) are plain keys in the same `AnswerRecord`, and are never dependents of `q1` — the ladder never descends itself (C1, `applyCorrection`).
- `docId` values follow the manifest as corrected in Task 1: the three police-verification rules cite `web/faq_police_verification_wayback.txt`, the Charter rules `Citizens_Charter.pdf`, and the grievance/DPG rules `web/grievance_page.txt`.

- [ ] **Step 1: Write the failing tests** (`src/playbooks/passportPlaybook.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { passportPlaybook, PASSPORT_STAGE_SHORT, PASSPORT_DEPS } from './passportPlaybook'
import { evaluate } from '../domain/evaluate'
import { applyCorrection } from '../domain/answers'
import { runGuardrailSuite, staleExemptionFindings, copyStrings } from './guardrails/suite'

const at = (answers: Record<string, string>) => evaluate(passportPlaybook, answers).ruleId

const STAGES = ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'] as const
const BASE_RULE: Record<string, string> = {
  no_contact: 'state-1',
  contacted_incomplete: 'state-2',
  verified_no_progress: 'state-3',
  adverse: 'state-4',
}

describe('passportPlaybook shape', () => {
  it('ships 12 rules with unique ids, in the prototype order', () => {
    expect(passportPlaybook.rules.map(r => r.id)).toEqual([
      'state-5a-r', 'state-5b-r', 'state-dpg-r',
      'state-dpg-p', 'state-5b-p', 'state-5a-p',
      'state-5b', 'state-5a',
      'state-4', 'state-3', 'state-2', 'state-1',
    ])
  })

  it('is the passport service and carries an UNCLASSIFIED fallback', () => {
    expect(passportPlaybook.serviceId).toBe('passport')
    expect(passportPlaybook.fallback.rec).toBe('UNCLASSIFIED')
    expect(passportPlaybook.fallback.state).toBe('6')
  })

  it('every rule carries a classification, a dependency and a mustNot', () => {
    for (const r of passportPlaybook.rules) {
      expect(['WAIT', 'FOLLOW_UP', 'ESCALATE'], r.id).toContain(r.rec)
      expect(r.dependency.length, r.id).toBeGreaterThan(0)
      expect(r.mustNot?.length ?? 0, r.id).toBeGreaterThan(0)
    }
  })

  it('only the ladder rungs carry a rungLabel', () => {
    const withRung = passportPlaybook.rules.filter(r => r.rungLabel).map(r => r.id)
    expect(withRung).toEqual([
      'state-5a-r', 'state-5b-r', 'state-dpg-r', 'state-dpg-p', 'state-5b-p', 'state-5a-p', 'state-5b', 'state-5a',
    ])
  })
})

describe('branch tests — 4 stages x 3 follow-up answers (Implementation Plan §8)', () => {
  it.each(STAGES)('%s + no_followup lands on its own base state', stage => {
    expect(at({ q1: stage, q2: 'no_followup' })).toBe(BASE_RULE[stage])
  })

  it.each(STAGES)('%s + informal lands on the informal rung (5a), whatever the stage', stage => {
    expect(at({ q1: stage, q2: 'informal' })).toBe('state-5a')
  })

  it.each(STAGES)('%s + formal_grievance lands on the grievance rung (5b), whatever the stage', stage => {
    expect(at({ q1: stage, q2: 'formal_grievance' })).toBe('state-5b')
  })

  it('the rungs escalate: informal is FOLLOW_UP, formal grievance is ESCALATE', () => {
    expect(evaluate(passportPlaybook, { q1: 'no_contact', q2: 'informal' }).rec).toBe('FOLLOW_UP')
    expect(evaluate(passportPlaybook, { q1: 'no_contact', q2: 'formal_grievance' }).rec).toBe('ESCALATE')
  })
})

describe('recovery flow (the diagnosis half; the screens are C3)', () => {
  it("'not sure' matches no condition and falls through to the fallback with no sentinel", () => {
    expect(at({ q1: 'not_sure' })).toBeNull()
    expect(at({ q1: 'not_sure', recoveryAskedSafest: 'yes' })).toBeNull()
  })

  it('a paste-matched stage diagnoses exactly as a tapped one would', () => {
    expect(at({ q1: 'verified_no_progress', q2: 'no_followup' })).toBe('state-3')
  })

  it('an unanswered case falls through to the fallback', () => {
    expect(at({})).toBeNull()
  })
})

describe('changing Q1 clears Q2 (PRD FR-22/AC-8, via C1 applyCorrection)', () => {
  it('a changed q1 clears q2', () => {
    const r = applyCorrection({ q1: 'no_contact', q2: 'informal' }, 'q1', 'adverse', PASSPORT_DEPS)
    expect(r.answers).toEqual({ q1: 'adverse' })
  })

  it('a same-value re-tap clears nothing', () => {
    const answers = { q1: 'no_contact', q2: 'informal' }
    expect(applyCorrection(answers, 'q1', 'no_contact', PASSPORT_DEPS).answers).toBe(answers)
  })

  it('a q1 correction never clears an outcome key — the ladder never descends itself', () => {
    const r = applyCorrection(
      { q1: 'no_contact', q2: 'informal', fOutcome: 'pending', dpgFiled: 'yes' },
      'q1', 'adverse', PASSPORT_DEPS,
    )
    expect(r.answers).toEqual({ q1: 'adverse', fOutcome: 'pending', dpgFiled: 'yes' })
  })
})

describe('tracking-loop states (rule order is load-bearing)', () => {
  it.each([
    [{ q2: 'informal', fOutcome: 'pending' }, 'state-5a-p'],
    [{ q2: 'formal_grievance', gOutcome: 'pending' }, 'state-5b-p'],
    [{ dpgFiled: 'yes' }, 'state-dpg-p'],
    [{ fOutcome: 'resolved' }, 'state-5a-r'],
    [{ gOutcome: 'resolved' }, 'state-5b-r'],
    [{ dpgOutcome: 'resolved' }, 'state-dpg-r'],
  ])('%o lands on %s', (answers, ruleId) => {
    expect(at({ q1: 'no_contact', ...answers })).toBe(ruleId)
  })

  it('a resolved outcome beats the pending rung it came from', () => {
    expect(at({ q1: 'no_contact', q2: 'informal', fOutcome: 'resolved' })).toBe('state-5a-r')
  })

  it('a filed DPG escalation beats the grievance rung below it', () => {
    expect(at({ q1: 'no_contact', q2: 'formal_grievance', dpgFiled: 'yes' })).toBe('state-dpg-p')
  })

  it('every pending/resolved state is a WAIT — none re-issues the action already taken', () => {
    for (const id of ['state-5a-p', 'state-5b-p', 'state-dpg-p', 'state-5a-r', 'state-5b-r', 'state-dpg-r']) {
      expect(passportPlaybook.rules.find(r => r.id === id)!.rec, id).toBe('WAIT')
    }
  })
})

describe('PASSPORT_STAGE_SHORT', () => {
  it('labels exactly the four answerable stages', () => {
    expect(Object.keys(PASSPORT_STAGE_SHORT).sort()).toEqual([...STAGES].sort())
  })

  it("has no entry for 'not_sure' — an unknown stage never decorates a label", () => {
    expect(PASSPORT_STAGE_SHORT.not_sure).toBeUndefined()
  })
})

describe('guardrails', () => {
  it('passes the full §7/§8 guardrail suite', () => {
    runGuardrailSuite(passportPlaybook)
  })

  it('leaves no stale safety exemption for this playbook', () => {
    const ats = new Set(copyStrings(passportPlaybook).map(s => s.at))
    const mine = staleExemptionFindings(copyStrings(passportPlaybook))
      .filter(f => [...ats].some(a => f.includes(`"${a}"`)))
    expect(mine).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/playbooks/passportPlaybook.test.ts`
Expected: FAIL — `./passportPlaybook` module not found.

- [ ] **Step 3: Implement `src/playbooks/passportPlaybook.ts`**

Transcribed from `design/nextmove-v1-prototype.html` lines 1023–1169 (tag `v1-design-lock-2`).

```ts
// Passport playbook — 12 rules + the UNCLASSIFIED fallback.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html lines 1023-1169
// (git tag v1-design-lock-2). Citations resolve against sources/manifest.json.
// Rule ORDER is load-bearing: evaluate() is first-match-wins.
import type { DependentKeys } from '../domain/answers'
import type { Playbook } from '../domain/types'
import { SAFETY_NET_TITLE } from './safetyNet'

const CHARTER = 'Citizens_Charter.pdf'
const GRIEVANCE = 'web/grievance_page.txt'
const PV_FAQ = 'web/faq_police_verification_wayback.txt'

const PO = { label: 'Passport Office (PO) concerned', url: 'https://www.passportindia.gov.in' }
const DPG = { label: 'Directorate of Public Grievances (DPG)', url: 'https://dpg.gov.in' }

export const passportPlaybook: Playbook = {
  serviceId: 'passport',
  rules: [
    // "Moving again" states (retire, don't reset): when a rung's response gets
    // things moving but the passport hasn't arrived, the rung is CONSUMED, not
    // erased. If it stalls again, the check-in clears the resolved outcome and
    // the case lands on the NEXT rung — the ladder never descends itself.
    {
      id: 'state-5a-r',
      condition: a => a.fOutcome === 'resolved',
      rec: 'WAIT',
      state: '5a·R',
      label: 'They responded, case moving again',
      rungLabel: 'follow-up worked, case moving',
      dependency: 'Passport Office (processing)',
      explanation: "You've reported that their response got things moving. NextMove can't verify progress beyond your own report, so this rests on what you saw. The next milestone is the passport itself.",
      whatShort: "Nothing to do; it's moving",
      whatToDo: 'Nothing right now. Add an update if it stalls again, or when the passport arrives.',
      where: PO,
      need: 'Nothing. Keep the response you received safe with your case papers.',
      howLong: "The Citizen's Charter's service standards apply to processing overall, but no verified timeline exists for a resumed case, so there's no countdown to show.",
      source: { docId: CHARTER, title: "Citizen's Charter (MEA)" },
      mustNot: 'Any promise that movement continues, or a date the passport "should" arrive.',
    },
    {
      id: 'state-5b-r',
      condition: a => a.gOutcome === 'resolved',
      rec: 'WAIT',
      state: '5b·R',
      label: 'Grievance answered, case moving again',
      rungLabel: 'grievance answered, case moving',
      dependency: 'Passport Office (processing)',
      explanation: "Your grievance got a response and you've reported that things are moving. The grievance rung did its job; the next milestone is the passport itself.",
      whatShort: "Nothing to do; it's moving",
      whatToDo: 'Nothing right now. Add an update if it stalls again, or when the passport arrives.',
      where: PO,
      need: 'Nothing. Keep the grievance response with your case papers.',
      howLong: "No verified timeline exists for a case resumed after a grievance, so there's no countdown to show.",
      source: { docId: CHARTER, title: "Citizen's Charter — Grievance Redressal section (MEA)" },
      mustNot: 'Any promise that movement continues, or a predicted arrival date.',
    },
    {
      id: 'state-dpg-r',
      condition: a => a.dpgOutcome === 'resolved',
      rec: 'WAIT',
      state: 'DPG·R',
      label: 'DPG responded, case moving again',
      rungLabel: 'DPG responded, case moving',
      dependency: 'Passport Office (processing)',
      explanation: "The Directorate of Public Grievances responded and you've reported that things are moving. That's the top of the ladder doing its job; the next milestone is the passport itself.",
      whatShort: "Nothing to do; it's moving",
      whatToDo: 'Nothing right now. Add an update if it stalls again, or when the passport arrives.',
      where: PO,
      need: 'Nothing. Keep the DPG response with your case papers.',
      howLong: "No verified timeline exists for a case resumed after a DPG response, so there's no countdown to show.",
      source: { docId: GRIEVANCE, title: 'Grievance page — passportindia.gov.in' },
      mustNot: 'Any promise that movement continues, or a predicted arrival date.',
    },
    // Check-in pending states: action-state answers (q2, dpgFiled) are only ever
    // written by the user attesting "I did this"; outcome fields are written by
    // check-ins. "Filed and waiting" is its own honest WAIT state, not
    // "unresolved". Most-specific-first: these run before their parent rungs.
    {
      id: 'state-dpg-p',
      condition: a => a.dpgFiled === 'yes',
      rec: 'WAIT',
      state: 'DPG·W',
      label: 'Escalated to the DPG, response pending',
      rungLabel: 'escalated to the DPG, response pending',
      dependency: 'Directorate of Public Grievances',
      explanation: 'Your escalation is with the Directorate of Public Grievances, the top of the verified ladder for passport grievances. Nothing further is needed from you while they review.',
      whatShort: 'Nothing to do while the DPG reviews',
      whatToDo: 'Nothing right now. Add an update to your casefile when the DPG responds.',
      where: DPG,
      need: 'Nothing. Keep your DPG reference number safe.',
      howLong: "No official DPG response timeline exists in NextMove's verified sources, so there's no countdown here.",
      source: { docId: GRIEVANCE, title: 'Grievance page — passportindia.gov.in' },
      mustNot: 'Any prediction of the outcome or its timing.',
    },
    {
      id: 'state-5b-p',
      condition: a => a.q2 === 'formal_grievance' && a.gOutcome === 'pending',
      rec: 'WAIT',
      state: '5b·W',
      label: 'Grievance filed, response pending',
      rungLabel: 'grievance filed, response pending',
      dependency: 'Grievance cell (CPGRAMS)',
      explanation: "Your formal grievance is registered. It's with the grievance cell now. Your grievance number is the anchor for everything from here.",
      whatShort: 'Your grievance is in. Nothing to do yet.',
      whatToDo: 'Nothing further right now. Keep the grievance number safe and add an update when a response arrives.',
      where: { label: 'CPGRAMS · passportindia.gov.in/psp/Grievance', url: 'https://www.passportindia.gov.in/psp/Grievance' },
      need: 'Nothing. Just keep your grievance number safe.',
      howLong: 'The official commitment is only "a reasonable period of time": no numeric deadline is published, so there is no countdown to show.',
      source: { docId: GRIEVANCE, title: 'Grievance page — passportindia.gov.in' },
      mustNot: 'Any number of days defining "reasonable."',
    },
    {
      id: 'state-5a-p',
      condition: a => a.q2 === 'informal' && a.fOutcome === 'pending',
      rec: 'WAIT',
      state: '5a·W',
      label: 'Follow-up sent, awaiting their response',
      rungLabel: 'follow-up sent, response pending',
      dependency: 'Passport Office',
      explanation: "You've sent your follow-up. The ball is with the Passport Office now, and nothing further is needed from you until they respond.",
      whatShort: 'Nothing to do until they respond',
      whatToDo: "Nothing is required from you right now. When a response arrives (or clearly doesn't), add an update to your casefile.",
      where: PO,
      need: 'Nothing. Keep the date and any ticket number of your follow-up safe.',
      howLong: "No official response timeline is published for informal follow-ups, and NextMove won't invent one.",
      source: { docId: CHARTER, title: "Citizen's Charter — Grievance Redressal section (MEA)" },
      mustNot: 'Any claim about when the response "should" arrive.',
    },
    {
      id: 'state-5b',
      condition: a => a.q2 === 'formal_grievance',
      rec: 'ESCALATE',
      state: '5b',
      label: 'Formal grievance raised, unresolved',
      rungLabel: 'formal grievance unresolved',
      dependency: 'Passport-issuing Authority / MEA',
      explanation: "You've already raised a formal grievance and it isn't resolved. The right move now is to escalate beyond the Passport Office itself, to the body that oversees grievance redressal.",
      whatShort: 'Escalate to the Directorate of Public Grievances',
      whatToDo: 'Escalate to the Directorate of Public Grievances (DPG), Cabinet Secretariat, referencing your existing grievance number.',
      where: DPG,
      need: 'Your existing CPGRAMS grievance reference number, and the date you filed it.',
      howLong: 'The official grievance page commits only to "a reasonable period of time": no numeric deadline is published, so NextMove won\'t invent one.',
      source: {
        docId: GRIEVANCE,
        title: 'Grievance page — passportindia.gov.in',
        quote: '"...within a reasonable period of time" — no numeric deadline is stated.',
      },
      mustNot: 'Any specific number of days defining "reasonable."',
    },
    {
      id: 'state-5a',
      condition: a => a.q2 === 'informal',
      rec: 'FOLLOW_UP',
      state: '5a',
      label: 'Followed up informally, unresolved',
      rungLabel: 'informal follow-up unresolved',
      dependency: 'Passport Office',
      explanation: "You've already tried following up informally and it hasn't moved things forward. The next verified step is to make it formal, so there's a record and a defined channel.",
      whatShort: 'Move to a formal Grievance / CPGRAMS filing',
      whatToDo: 'Move to the formal Grievance / CPGRAMS channel, referencing your earlier informal attempt.',
      where: {
        label: 'CPGRAMS · passportindia.gov.in/psp/Grievance',
        url: 'https://www.passportindia.gov.in/psp/Grievance',
        phone: '1800-258-1800',
      },
      need: 'Your application reference number and a short note on what you already tried informally.',
      howLong: "No verified official timeline exists for grievance resolution, so there's no countdown here.",
      source: { docId: CHARTER, title: "Citizen's Charter — Grievance Redressal section (MEA)" },
      mustNot: 'That the informal follow-up "should" have worked by a given point.',
    },
    {
      id: 'state-4',
      condition: a => a.q1 === 'adverse' && a.q2 === 'no_followup',
      rec: 'FOLLOW_UP',
      state: '4',
      label: 'Adverse or unclear outcome',
      dependency: 'Applicant + Passport Office',
      explanation: "Something you saw on the portal reads as negative or unclear. NextMove can't tell you why (only the Passport Office can), but the verified next step is to ask them directly.",
      whatShort: 'Contact the Passport Office',
      whatToDo: 'Contact the Passport Office to understand the reason, clarify if required, and request re-verification if applicable.',
      where: PO,
      need: 'Your application reference number.',
      howLong: "No official timeline is published for clarifying an adverse status, and NextMove won't guess one.",
      source: {
        docId: PV_FAQ,
        title: 'Official FAQ — passportindia.gov.in',
        quote: 'Verbatim official guidance for adverse/unclear status.',
      },
      mustNot: 'The cause of the adverse finding, or that re-verification will succeed.',
    },
    {
      id: 'state-3',
      condition: a => a.q1 === 'verified_no_progress' && a.q2 === 'no_followup',
      rec: 'FOLLOW_UP',
      state: '3',
      label: 'Verified, waiting on processing',
      dependency: 'Passport Office',
      explanation: 'You believe your verification is complete, but nothing has changed since. The verified next step is to confirm that status and prompt a follow-up on processing.',
      whatShort: 'Follow up with the Passport Office',
      whatToDo: 'Follow up with the Passport Office to confirm your verification is logged and ask about processing status.',
      where: PO,
      need: 'Your application reference number, and roughly when you believe verification was completed.',
      howLong: "No official timeline is published for this processing step, and NextMove won't guess one.",
      source: {
        docId: PV_FAQ,
        title: 'Official FAQ — passportindia.gov.in',
        quote: 'General stuck-case guidance — no state-specific source found.',
      },
      mustNot: 'That "verification complete" is a confirmed system fact rather than your own belief.',
    },
    {
      id: 'state-2',
      condition: a => a.q1 === 'contacted_incomplete' && a.q2 === 'no_followup',
      rec: 'FOLLOW_UP',
      state: '2',
      label: 'Verification in progress',
      dependency: 'Police verification process',
      explanation: "Police have contacted you, but verification doesn't appear complete yet. It's worth checking whether anything further is needed from you.",
      whatShort: 'Check what else is needed from you',
      whatToDo: 'Check with the Passport Office or local police whether anything more is required from you to complete verification.',
      where: PO,
      need: 'Your application reference number.',
      howLong: "No official timeline is published for completing verification, and NextMove won't guess one.",
      source: {
        docId: PV_FAQ,
        title: 'Official FAQ — passportindia.gov.in',
        quote: 'General stuck-case guidance — no state-specific source found.',
      },
      mustNot: 'That contact implies a pending task for you, or that verification is close to finishing.',
    },
    {
      id: 'state-1',
      condition: a => a.q1 === 'no_contact' && a.q2 === 'no_followup',
      rec: 'WAIT',
      state: '1',
      label: 'Waiting for police verification to begin',
      dependency: 'Police verification process',
      explanation: "This is the expected current stage: police verification hasn't started yet, and that's normal, not a sign your case is stuck. The official Citizen's Charter explicitly excludes this period from every service-timeline commitment, so there's no 'on track / overdue' line to measure against.",
      whatShort: 'Nothing to do right now',
      whatToDo: "Nothing is required from you right now. If you'd like, you can follow up anyway as a secondary, optional step.",
      where: PO,
      need: 'Nothing. This step needs no action or documents from you yet.',
      howLong: "There is officially no clock running yet. The Citizen's Charter explicitly excludes police verification from every service timeline, so there's nothing to count down.",
      expectNext: 'Police verification typically means a visit or a call from your local police station to confirm your identity and address. Keep a government photo ID, an address proof, and your ARN handy at home. Anyone genuinely doing verification will reference your application, and verification never requires paying anyone. (General guidance, not an official checklist.)',
      source: {
        docId: CHARTER,
        title: "Citizen's Charter (MEA)",
        quote: 'Police-verification period is explicitly excluded from every stated service timeline.',
      },
      mustNot: 'Any day count as "on track" or "overdue"; that PV is "supposed" to take a defined number of days.',
    },
  ],
  fallback: {
    rec: 'UNCLASSIFIED',
    state: '6',
    label: 'Status unclear',
    dependency: 'Unknown',
    explanation: "NextMove doesn't have enough evidence from your answers to safely place your case in a known stage. Rather than guess, it's safest to check your status directly.",
    whatShort: 'Check your status directly',
    whatToDo: 'Check your application status directly through the official portal, or call the helpline.',
    where: { label: 'Passport Seva status portal', url: 'https://www.passportindia.gov.in', phone: '1800-258-1800' },
    need: 'Your application reference number.',
    source: { docId: null, title: SAFETY_NET_TITLE },
    mustNot: 'Any WAIT / FOLLOW UP / ESCALATE claim.',
  },
}

/** Stage·rung composite labels: the passport ladder's short stage names.
 *  Consumed by C1's decorateStageRung via the passport engine's `decorate`.
 *  No 'not_sure' entry on purpose — an unknown stage never decorates. */
export const PASSPORT_STAGE_SHORT: Record<string, string> = {
  no_contact: 'Awaiting verification',
  contacted_incomplete: 'Verification in progress',
  verified_no_progress: 'Verified, processing quiet',
  adverse: 'Adverse outcome',
}

/** A genuinely changed Q1 clears the Q1-dependent Q2 answer (PRD FR-22/AC-8),
 *  so a stale follow-up answer from a different case-stage can never carry
 *  into a new diagnosis. Outcome keys are deliberately NOT dependents. */
export const PASSPORT_DEPS: DependentKeys = { q1: ['q2'] }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/playbooks/passportPlaybook.test.ts` — Expected: PASS (36 tests).
Run: `npm run build` — Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/playbooks/passportPlaybook.ts src/playbooks/passportPlaybook.test.ts
git commit -m "feat(c2): passport playbook — 12 rules + fallback, stage map, deps map

Transcribed from the locked prototype (v1-design-lock-2, lines 1023-1169).
Branch-tested at 4 stages x 3 follow-up answers plus the tracking-loop rungs,
and clean through the full §7/§8 guardrail suite.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8"
```

---

### Task 5: Voter Services playbook — 7 rules, fallback, deps map

**Files:**
- Create: `src/playbooks/voterPlaybook.ts`, `src/playbooks/voterPlaybook.test.ts`

**Interfaces:**
- Consumes: C1's `Playbook`, `DependentKeys`, `evaluate`, `applyCorrection`; `SAFETY_NET_TITLE`; `runGuardrailSuite`.
- Produces:
  - `voterPlaybook: Playbook` — 7 rules in the prototype's order, plus the fallback.
  - `VOTER_DEPS: DependentKeys` — `{ voterQ1: ['voterAppealed', 'voterAppealedRaw'] }`.
  - `VOTER_UNCLASSIFIED_KEYS: string[]` — `['voterQ1', 'voterAppealed']`, consumed by Task 7's engine.

**Design notes:**
- **Transcribed from `design/nextmove-v1-prototype.html` lines 1179–1271.** Every rule cites `Final-ER-FAQ.pdf`; the ECI's national Electoral Roll FAQ backs the whole service, which is exactly the many-rules-to-one-source direction the ERD calls load-bearing for C6's degrade model.
- **Two appeal keys, not one, and both are shipped deliberately.** The question screen writes `voterAppealedRaw` (the raw option the citizen picked, including `notsure`, kept so the trust disclosure can echo their actual answer) and `voterAppealed` (the playbook-read value, with `notsure` normalized to `unclassified`). Only `voterAppealed` appears in a rule condition. Both are dependents of `voterQ1` — the prototype deletes both when Q1 changes — so `VOTER_DEPS` lists both. The raw→normalized transform itself is a question-screen concern and lands in **C3**; C2 ships the deps map and the key names so C3 has nothing to invent.
- **`VOTER_UNCLASSIFIED_KEYS` carries two keys.** This is C1 Task 6's recorded deviation, now given its data: the prototype's Diagnosis screen short-circuits on `voterQ1 === 'unclassified' || voterAppealed === 'unclassified'` while `currentDiagnosis()` checks only `voterQ1`, so answering Q1 "decision received" then "I'm not sure" on the appeal renders UNCLASSIFIED on one screen and a confident FOLLOW_UP on the next. C1 adopted the safer branch everywhere via `unclassifiedKeys`; C2 supplies both keys.
- **Where the short-circuit lives matters for this task's tests.** `evaluate()` alone has no knowledge of `unclassifiedKeys`, so `{ voterQ1: 'decision', voterAppealed: 'unclassified' }` evaluates to `v-3` here. The UNCLASSIFIED outcome is produced by `diagnose()` in Task 7, and is asserted there. Both facts are pinned so nobody "fixes" one by breaking the other.
- **`v-4` carries no disclaimer and that is correct** — see Task 3's recorded deviation from §7's cause-state list.

- [ ] **Step 1: Write the failing tests** (`src/playbooks/voterPlaybook.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { voterPlaybook, VOTER_DEPS, VOTER_UNCLASSIFIED_KEYS } from './voterPlaybook'
import { evaluate } from '../domain/evaluate'
import { applyCorrection } from '../domain/answers'
import { runGuardrailSuite } from './guardrails/suite'

const at = (answers: Record<string, string>) => evaluate(voterPlaybook, answers).ruleId

describe('voterPlaybook shape', () => {
  it('ships 7 rules in the prototype order', () => {
    expect(voterPlaybook.rules.map(r => r.id)).toEqual(['v-acc', 'v-5-p', 'v-5', 'v-4', 'v-3', 'v-2', 'v-1'])
  })

  it('is the voter service and carries an UNCLASSIFIED fallback', () => {
    expect(voterPlaybook.serviceId).toBe('voter')
    expect(voterPlaybook.fallback.rec).toBe('UNCLASSIFIED')
    expect(voterPlaybook.fallback.state).toBe('V-6')
  })

  it('every rule cites the ECI Electoral Roll FAQ (many rules, one source — the ERD degrade join)', () => {
    for (const r of voterPlaybook.rules) expect(r.source.docId, r.id).toBe('Final-ER-FAQ.pdf')
  })

  it('no rule carries a rungLabel — the voter ladder is rendered from answers, not decorated', () => {
    expect(voterPlaybook.rules.filter(r => r.rungLabel)).toEqual([])
  })
})

describe('branch tests — 3 base Q1 answers (Implementation Plan §8)', () => {
  it.each([
    ['no_word', 'v-1', 'WAIT'],
    ['blo_visited', 'v-2', 'WAIT'],
    ['decision', 'v-3', 'FOLLOW_UP'],
  ])('voterQ1 %s lands on %s (%s)', (voterQ1, ruleId, rec) => {
    const d = evaluate(voterPlaybook, { voterQ1 })
    expect(d.ruleId).toBe(ruleId)
    expect(d.rec).toBe(rec)
  })
})

describe("branch tests — 4 appeal follow-up outcomes on the 'decision' branch", () => {
  it.each([
    ['none', 'v-3', 'FOLLOW_UP'],
    ['pending', 'v-4', 'WAIT'],
    ['decided', 'v-5', 'ESCALATE'],
  ])('voterAppealed %s lands on %s (%s)', (voterAppealed, ruleId, rec) => {
    const d = evaluate(voterPlaybook, { voterQ1: 'decision', voterAppealed })
    expect(d.ruleId).toBe(ruleId)
    expect(d.rec).toBe(rec)
  })

  it("the fourth outcome ('I'm not sure') is handled by the engine, not by a rule", () => {
    // evaluate() knows nothing of unclassifiedKeys: this is v-3 here on purpose.
    // diagnose() turns it into the UNCLASSIFIED fallback — asserted in engines.test.ts.
    expect(at({ voterQ1: 'decision', voterAppealed: 'unclassified' })).toBe('v-3')
    expect(VOTER_UNCLASSIFIED_KEYS).toEqual(['voterQ1', 'voterAppealed'])
  })

  it('the appeal answer only bites on the decision branch', () => {
    expect(at({ voterQ1: 'no_word', voterAppealed: 'decided' })).toBe('v-1')
  })

  it('an unanswered case falls through to the fallback', () => {
    expect(at({})).toBeNull()
  })
})

describe('changing Q1 clears the appeal answer (both keys)', () => {
  it('clears voterAppealed and voterAppealedRaw together', () => {
    const r = applyCorrection(
      { voterQ1: 'decision', voterAppealed: 'pending', voterAppealedRaw: 'pending' },
      'voterQ1', 'no_word', VOTER_DEPS,
    )
    expect(r.answers).toEqual({ voterQ1: 'no_word' })
  })

  it('staying on the decision branch clears nothing (same value = no-op)', () => {
    const answers = { voterQ1: 'decision', voterAppealed: 'pending', voterAppealedRaw: 'pending' }
    expect(applyCorrection(answers, 'voterQ1', 'decision', VOTER_DEPS).answers).toBe(answers)
  })

  it('a Q1 correction never clears a voter outcome key', () => {
    const r = applyCorrection(
      { voterQ1: 'decision', voterAppealed: 'pending', voterOutcome: 'accepted_pending', ceoAppeal: 'filed' },
      'voterQ1', 'no_word', VOTER_DEPS,
    )
    expect(r.answers).toEqual({ voterQ1: 'no_word', voterOutcome: 'accepted_pending', ceoAppeal: 'filed' })
  })
})

describe('tracking-loop states', () => {
  it('a favourable decision with nothing delivered yet lands on v-acc, not back on "awaiting decision"', () => {
    expect(at({ voterQ1: 'decision', voterOutcome: 'accepted_pending' })).toBe('v-acc')
    expect(evaluate(voterPlaybook, { voterQ1: 'decision', voterOutcome: 'accepted_pending' }).rec).toBe('WAIT')
  })

  it('a filed second appeal lands on v-5-p, not back on the ESCALATE that prompted it', () => {
    expect(at({ voterQ1: 'decision', voterAppealed: 'decided', ceoAppeal: 'filed' })).toBe('v-5-p')
    expect(evaluate(voterPlaybook, { ceoAppeal: 'filed' }).rec).toBe('WAIT')
  })

  it('v-acc outranks v-5-p (rule order is load-bearing)', () => {
    expect(at({ voterOutcome: 'accepted_pending', ceoAppeal: 'filed' })).toBe('v-acc')
  })
})

describe('guardrails', () => {
  it('passes the full §7/§8 guardrail suite', () => {
    runGuardrailSuite(voterPlaybook)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/playbooks/voterPlaybook.test.ts`
Expected: FAIL — `./voterPlaybook` module not found.

- [ ] **Step 3: Implement `src/playbooks/voterPlaybook.ts`**

Transcribed from `design/nextmove-v1-prototype.html` lines 1179–1271.

```ts
// Voter Services playbook — 7 rules + the UNCLASSIFIED fallback.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html lines 1179-1271
// (git tag v1-design-lock-2).
//
// The appeal structure is genuinely two-tier (Final-ER-FAQ Q34): a first
// appeal to the District Election Officer / District Magistrate, then, only
// once that has been decided, a further appeal to the state CEO. v-4 and v-5
// are those two real situations; an earlier single "have you appealed?" branch
// told an already-appealed citizen to appeal again.
import type { DependentKeys } from '../domain/answers'
import type { Playbook } from '../domain/types'
import { SAFETY_NET_TITLE } from './safetyNet'

const ECI_FAQ = 'Final-ER-FAQ.pdf'
const CEO_LOOKUP = { label: 'State CEO website (roll / decision lookup)', url: 'https://voters.eci.gov.in' }
const CEO = { label: 'State Chief Electoral Officer (CEO)', url: 'https://voters.eci.gov.in' }
const TRACK = { label: "Track status of application (Voters' Service Portal)", url: 'https://voters.eci.gov.in' }

export const voterPlaybook: Playbook = {
  serviceId: 'voter',
  rules: [
    // Favourable-decision-pending: reporting "the decision went my way, but
    // nothing has arrived" used to change NOTHING — the case kept reading
    // "awaiting decision" against the citizen's own report.
    {
      id: 'v-acc',
      condition: a => a.voterOutcome === 'accepted_pending',
      rec: 'WAIT',
      state: 'V·A',
      label: 'Decision in your favour, delivery pending',
      dependency: 'Roll update / card delivery',
      explanation: "You've reported the decision went in your favour and the result hasn't shown up yet. Decisions are communicated by post and SMS, and updated rolls are published on your state CEO's website, so both are worth watching. No official delivery interval is published.",
      whatShort: 'Nothing to do; watch for it to arrive',
      whatToDo: "Nothing is required from you. Check the roll listing on your state CEO's website now and then, and watch the post and SMS.",
      where: CEO_LOOKUP,
      need: 'Your application reference number, for the roll lookup.',
      howLong: 'No official interval for roll updates or card delivery is published, so there is no countdown to show.',
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q25' },
      mustNot: 'Any delivery timeframe, or a promise the entry has actually been made.',
    },
    // Check-in pending state. ceoAppeal is only written by the citizen
    // attesting they filed the second appeal.
    {
      id: 'v-5-p',
      condition: a => a.ceoAppeal === 'filed',
      rec: 'WAIT',
      state: 'V-5·W',
      label: 'Second appeal filed with the state CEO',
      dependency: 'State Chief Electoral Officer',
      explanation: "Your second appeal is with the state CEO, the final tier in the official appeal structure. Nothing further is needed from you while it's considered.",
      whatShort: 'Your final appeal is in. Nothing to do now.',
      whatToDo: 'Nothing right now. Add an update to your casefile when the decision arrives.',
      where: CEO,
      need: 'Nothing. Keep your filing acknowledgment safe.',
      howLong: 'No timeframe for second-appeal decisions is stated in official sources, so there is no countdown to show.',
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q34' },
      mustNot: 'Any predicted outcome or timing.',
    },
    {
      id: 'v-5',
      condition: a => a.voterQ1 === 'decision' && a.voterAppealed === 'decided',
      rec: 'ESCALATE',
      state: 'V-5',
      label: 'First appeal decided, still unresolved',
      dependency: 'State Chief Electoral Officer (second-tier appeal)',
      explanation: "You've already had a first appeal decided and it didn't resolve things. The official structure allows one further appeal, to your state's Chief Electoral Officer.",
      whatShort: 'File a second appeal with your state CEO',
      whatToDo: "File a second appeal with your state's Chief Electoral Officer, referencing the outcome of your first appeal.",
      where: CEO,
      need: 'The decision/order from your first appeal, and your original application reference number.',
      howLong: "No timeframe for the second appeal's decision is stated in official sources, and NextMove won't invent one.",
      source: {
        docId: ECI_FAQ,
        title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q34',
        quote: 'Two-tier appeal structure, verbatim.',
      },
      mustNot: "Any specific timeframe for the second appeal's decision, or its likely outcome.",
    },
    {
      id: 'v-4',
      condition: a => a.voterQ1 === 'decision' && a.voterAppealed === 'pending',
      rec: 'WAIT',
      state: 'V-4',
      label: 'Appeal already filed, decision pending',
      dependency: 'District Election Officer / District Magistrate (your first-tier appeal)',
      explanation: "You've already filed an appeal and it's still with the appellate authority. There's nothing further to do until they decide.",
      whatShort: 'Nothing to do yet. Your appeal is pending.',
      whatToDo: "Nothing is required from you right now. If it's been a long time, you can follow up directly with the office where you filed.",
      where: { label: 'District Election Officer / District Magistrate (per your district)' },
      need: 'Nothing yet. This is a waiting step.',
      howLong: 'No numeric timeline is stated for appeal decisions. Officially there is no "overdue" line to cross, so there\'s no countdown to show.',
      expectNext: "The appellate authority's decision will come from the office where you filed. Keep your filing acknowledgment safe; it's what a second-tier appeal would be built on if you ever need one.",
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q34' },
      mustNot: 'That the appeal "should" be decided by a given point — no numeric timeline is stated.',
    },
    {
      id: 'v-3',
      condition: a => a.voterQ1 === 'decision',
      rec: 'FOLLOW_UP',
      state: 'V-3',
      label: 'Decision received, unclear or disagreed with',
      dependency: 'You: the ball is in your court',
      explanation: "A decision has been issued on your application, communicated by post and SMS. NextMove can't tell you why it went the way it did (no official source describes rejection reasons), but it can point you to where to confirm it and what to do if you disagree.",
      whatShort: 'Check the decision, then appeal if needed',
      whatToDo: "Check the decision on your state CEO's website / roll listing to confirm exactly what it says. If you disagree, this is your entry point to a formal appeal.",
      where: CEO_LOOKUP,
      need: 'Your application reference number.',
      howLong: 'You set the pace on this step. No deadline for a first appeal is stated in the official sources NextMove has verified.',
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q25' },
      mustNot: 'Any reason for the decision — no official source categorizes rejection reasons.',
    },
    {
      id: 'v-2',
      condition: a => a.voterQ1 === 'blo_visited',
      rec: 'WAIT',
      state: 'V-2',
      label: 'Field verification underway, no decision yet',
      dependency: 'ERO decision',
      explanation: "A BLO has visited or contacted you. That's the standard next step for every application, and it means things are moving. The decision itself now sits with the Electoral Registration Officer.",
      whatShort: 'Nothing to do. This is expected.',
      whatToDo: 'Nothing further is required from you yet. Track your status with your reference number if you want a checkpoint.',
      where: TRACK,
      need: 'Your application reference number.',
      howLong: 'No official timeline exists for this verification, and there is no published "should be done by" to measure against, so there\'s no countdown to show.',
      expectNext: "The ERO's decision is what comes next. It's communicated by post and SMS (ECI FAQ Q25), so watch both. No further visit is normally needed from your side once the BLO step is done.",
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q23' },
      mustNot: 'That BLO contact means approval is likely, or that a decision is close.',
    },
    {
      id: 'v-1',
      condition: a => a.voterQ1 === 'no_word',
      rec: 'WAIT',
      state: 'V-1',
      label: 'Application submitted, awaiting decision',
      dependency: 'BLO verification → ERO decision',
      explanation: 'Your application has been received, and BLO field verification is the standard next step for every registration or correction. Not hearing anything yet is expected at this point, not a sign of a problem.',
      whatShort: 'Nothing to do. This is expected.',
      whatToDo: 'Nothing is required from you right now. You can track progress with your reference number any time.',
      where: TRACK,
      need: 'Your application reference number.',
      howLong: 'No official timeline exists for BLO verification. Not hearing anything yet has no official "late," so there\'s no countdown to show.',
      expectNext: 'What comes next is typically a visit or call from your BLO (Booth Level Officer) to verify your details. Keep your reference number and the documents from your application handy. The decision itself is communicated by post and SMS (ECI FAQ Q25), so keep an eye on both.',
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q21 & Q23' },
      mustNot: 'How long verification "should" take — no numeric timeline exists in official sources.',
    },
  ],
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'V-6',
    label: 'Status unclear',
    dependency: 'Unknown',
    explanation: "NextMove doesn't have enough evidence to safely place your case. Check your status directly rather than guess.",
    whatShort: 'Check your status directly',
    whatToDo: 'Check your application status via the reference-ID tracker, or call the toll-free Voter Helpline.',
    where: { label: "Voters' Service Portal", url: 'https://voters.eci.gov.in', phone: '1950' },
    need: 'Your application reference number, if you have it.',
    source: { docId: null, title: SAFETY_NET_TITLE },
    mustNot: 'Any WAIT / FOLLOW UP / ESCALATE claim.',
  },
}

/** A changed Q1 clears the Q1-dependent appeal answer — the same principle as
 *  Passport's Q1→Q2 reset, and a genuine difference from it: the appeal
 *  follow-up is stage-DEPENDENT by construction. Both keys are cleared: the
 *  playbook-read `voterAppealed` and the raw `voterAppealedRaw` the question
 *  screen stores for the trust disclosure (the raw→normalized transform is
 *  C3's). Outcome keys are deliberately not dependents. */
export const VOTER_DEPS: DependentKeys = { voterQ1: ['voterAppealed', 'voterAppealedRaw'] }

/** Answer keys whose value 'unclassified' means the citizen chose "I'm not
 *  sure" at that point. BOTH are listed: the prototype's Diagnosis screen
 *  checked both while currentDiagnosis() checked only voterQ1, so the same
 *  case could read UNCLASSIFIED on one screen and a confident FOLLOW_UP on the
 *  next. C1's ServiceEngine adopts the safer branch everywhere; this is its
 *  data (C1 plan, Task 6 recorded deviation). */
export const VOTER_UNCLASSIFIED_KEYS = ['voterQ1', 'voterAppealed']
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/playbooks/voterPlaybook.test.ts` — Expected: PASS (20 tests).
Run: `npm run build` — Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/playbooks/voterPlaybook.ts src/playbooks/voterPlaybook.test.ts
git commit -m "feat(c2): voter services playbook — 7 rules + fallback, deps map, unclassified keys

Transcribed from the locked prototype (v1-design-lock-2, lines 1179-1271).
Branch-tested at 3 base Q1 answers plus the two-tier appeal follow-ups and
the tracking-loop states. VOTER_UNCLASSIFIED_KEYS supplies the data for C1's
recorded engine deviation (both voterQ1 and voterAppealed short-circuit).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8"
```

---

### Task 6: SIR playbook — 9 rules, fallback, phases, state configs, phase-gated options

**Files:**
- Create: `src/playbooks/sirPlaybook.ts`, `src/playbooks/sirPlaybook.test.ts`

**Interfaces:**
- Consumes: C1's `Playbook`, `evaluate`, `SirPhase`, `SirStateConfig`, `optionsForPhase`, `sirCoverage`; `SAFETY_NET_TITLE`; `runGuardrailSuite`.
- Produces:
  - `sirPlaybook: Playbook` — 9 rules in the prototype's order, plus the fallback.
  - `SIR_PHASES: Record<string, SirPhase>` — `claims_notice`, `final_roll`.
  - `SIR_STATES: Record<string, SirStateConfig>` — Delhi supported; Bihar/Maharashtra/UP/other out of coverage.
  - `SIR_Q1_OPTIONS_FOR: Record<string, Record<string, string>>` — the phase-gated option sets.
  - `sirCopyExtras(): CopyLocation[]` — the phase notes and option labels, so the content scan covers SIR's non-rule copy too. `CopyLocation` is declared locally and is structurally the harness's `CopyString`; shipped data must not import the fs-backed harness.

**Design notes:**
- **Transcribed from `design/nextmove-v1-prototype.html` lines 1306–1516.**
- **`SIR_STATES` map keys are materialized into each record's `id`** — C1's handoff item, resolved here. The prototype's map has bare `{name, supported, phase}` values; C1's `SirStateConfig` requires `id`, so each entry carries its own key.
- **`s-notice`'s `need` markup moves into `needList`** — the other C1 handoff item. The prototype ships that one rule's twelve-document list as raw `<ul class="need-list">…</ul>` inside the `need` string. C2 keeps the plain-text lead-in (`"Any ONE of these:"`) in `need` and moves the twelve `<li>` items, in order, into `needList`. **No type change is required** — C1 already shipped `needList?: string[]` on `RuleContent`, with the note that a renderer must prefer it and must never `dangerouslySetInnerHTML` a data field. The twelve items are the ECI's prescribed list, verified verbatim at CEO Delhi FAQ Q23.
- **Phase-gating is structural, not a runtime filter.** A rule for a phase Delhi is not in is unreachable because no Q1 option produces its answer value — not because something filters it afterwards. The extensibility claim the whole architecture rests on (§8: "switching Delhi's configured phase makes exactly the final-phase states reachable, with zero engine changes") is tested directly below by flipping one config field.
- **`'I'm not sure'` is appended by the question screen outside the phase option set** (C1's `optionsForPhase` note), so `SIR_Q1_OPTIONS_FOR` contains only the phase's own options. Its value `unclassified` matches no rule and reaches the fallback through `evaluate()`.
- **The retired `duplicate` option and its `s-duplicate` content are NOT ported.** FAQ Q22's remedy ("submit the Enumeration Form where you currently live") is verbatim-sourced and impossible to follow, because enumeration closed 17.08.2026 — phase-gating applies on top of sources. The manifest entry stays `dormant`, the option is absent, and duplicate-suspicion falls through to "I'm not sure" → UNCLASSIFIED, which is the honest answer. The prototype's preserved `sirDormantRules_enumeration` object is prototype-only archaeology and is deliberately not shipped; the manifest's dormant entry is the record that survives.
- SIR has no `DependentKeys` map: `sirQ1` has no dependent answers.

- [ ] **Step 1: Write the failing tests** (`src/playbooks/sirPlaybook.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { sirPlaybook, SIR_PHASES, SIR_STATES, SIR_Q1_OPTIONS_FOR, sirCopyExtras } from './sirPlaybook'
import { evaluate } from '../domain/evaluate'
import { optionsForPhase, sirCoverage, type SirStateConfig } from '../domain/sirConfig'
import { runGuardrailSuite } from './guardrails/suite'

const at = (answers: Record<string, string>) => evaluate(sirPlaybook, answers).ruleId

/** The rules reachable from a phase's own Q1 options — structural, not filtered. */
const reachable = (phaseId: string) =>
  Object.keys(SIR_Q1_OPTIONS_FOR[phaseId]).map(v => at({ sirQ1: v })).sort()

describe('sirPlaybook shape', () => {
  it('ships 9 rules in the prototype order', () => {
    expect(sirPlaybook.rules.map(r => r.id)).toEqual([
      's-4-p', 's-3-p', 's-notice', 's-roll-absent', 's-roll-unchecked',
      's-final-absent', 's-final-present', 's-final-unchecked', 's-roll-present',
    ])
  })

  it('is the sir service and carries an UNCLASSIFIED fallback', () => {
    expect(sirPlaybook.serviceId).toBe('sir')
    expect(sirPlaybook.fallback.rec).toBe('UNCLASSIFIED')
    expect(sirPlaybook.fallback.state).toBe('S-7')
  })

  it('does not ship the phase-retired duplicate-registration rule', () => {
    expect(sirPlaybook.rules.find(r => r.id === 's-duplicate')).toBeUndefined()
    for (const opts of Object.values(SIR_Q1_OPTIONS_FOR)) {
      expect(Object.keys(opts)).not.toContain('duplicate')
    }
  })
})

describe("s-notice's need list (C1 handoff: <ul> markup -> needList)", () => {
  const notice = () => sirPlaybook.rules.find(r => r.id === 's-notice')!

  it('keeps a plain-text lead-in and carries no markup anywhere', () => {
    expect(notice().need).toBe('Any ONE of these:')
    expect(notice().need).not.toMatch(/[<>]/)
    for (const item of notice().needList!) expect(item).not.toMatch(/[<>]/)
  })

  it("holds the ECI's twelve prescribed documents, in the source's order", () => {
    expect(notice().needList).toEqual([
      'A government/PSU ID or pension order',
      'A pre-1987 government/bank/LIC/PSU-issued ID',
      'Birth certificate',
      'Passport',
      'Matriculation/educational certificate',
      'Permanent residence certificate',
      'Forest right certificate',
      'Caste certificate',
      'NRC (where it exists)',
      'Family register',
      'Land/house allotment certificate',
      'Aadhaar (per the specific 2025 ECI direction)',
    ])
  })

  it('is the only rule that needs a list', () => {
    expect(sirPlaybook.rules.filter(r => r.needList).map(r => r.id)).toEqual(['s-notice'])
  })
})

describe('SIR_STATES / coverage boundary', () => {
  it('materializes every map key into the record id (C1 handoff)', () => {
    for (const [key, state] of Object.entries(SIR_STATES)) expect(state.id).toBe(key)
  })

  it('covers Delhi alone in V1', () => {
    expect(sirCoverage(SIR_STATES.delhi)).toBe('covered')
    for (const key of ['bihar', 'maharashtra', 'up', 'other']) {
      expect(sirCoverage(SIR_STATES[key]), key).toBe('out-of-coverage')
    }
  })

  it('gives every unsupported state no phase at all — impossible options are structurally absent', () => {
    for (const key of ['bihar', 'maharashtra', 'up', 'other']) {
      expect(SIR_STATES[key].phase, key).toBeUndefined()
      expect(() => optionsForPhase(SIR_STATES[key], SIR_Q1_OPTIONS_FOR)).toThrow(/unsupported/i)
    }
  })
})

describe('branch tests — Delhi in its verified current phase (Implementation Plan §8)', () => {
  it('offers exactly the four claims-and-objections situations', () => {
    expect(Object.keys(optionsForPhase(SIR_STATES.delhi, SIR_Q1_OPTIONS_FOR)))
      .toEqual(['roll_present', 'roll_absent', 'roll_unchecked', 'notice'])
  })

  it.each([
    ['roll_present', 's-roll-present', 'WAIT'],
    ['roll_absent', 's-roll-absent', 'FOLLOW_UP'],
    ['roll_unchecked', 's-roll-unchecked', 'FOLLOW_UP'],
    ['notice', 's-notice', 'FOLLOW_UP'],
  ])('sirQ1 %s lands on %s (%s)', (sirQ1, ruleId, rec) => {
    const d = evaluate(sirPlaybook, { sirQ1 })
    expect(d.ruleId).toBe(ruleId)
    expect(d.rec).toBe(rec)
  })

  it("'I'm not sure' matches no rule and reaches the fallback (never a guessed phase)", () => {
    expect(at({ sirQ1: 'unclassified' })).toBeNull()
  })

  it('the final-phase states are unreachable from this phase, by construction', () => {
    const claims = reachable('claims_notice')
    for (const id of ['s-final-present', 's-final-absent', 's-final-unchecked']) {
      expect(claims, id).not.toContain(id)
    }
  })
})

describe('phase flip — the extensibility claim, with zero engine changes', () => {
  const advanced: SirStateConfig = { ...SIR_STATES.delhi, phase: SIR_PHASES.final_roll }

  it('one config field swaps the offered option set', () => {
    expect(Object.keys(optionsForPhase(advanced, SIR_Q1_OPTIONS_FOR)))
      .toEqual(['final_present', 'final_absent', 'final_unchecked'])
  })

  it.each([
    ['final_present', 's-final-present', 'WAIT'],
    ['final_absent', 's-final-absent', 'ESCALATE'],
    ['final_unchecked', 's-final-unchecked', 'FOLLOW_UP'],
  ])('sirQ1 %s lands on %s (%s)', (sirQ1, ruleId, rec) => {
    const d = evaluate(sirPlaybook, { sirQ1 })
    expect(d.ruleId).toBe(ruleId)
    expect(d.rec).toBe(rec)
  })

  it('makes EXACTLY the final-phase states reachable and retires the draft-phase ones', () => {
    expect(reachable('final_roll')).toEqual(['s-final-absent', 's-final-present', 's-final-unchecked'])
    expect(reachable('final_roll')).not.toContain('s-roll-unchecked')
  })

  it('the two phases share no reachable state', () => {
    const a = new Set(reachable('claims_notice'))
    expect(reachable('final_roll').some(id => a.has(id))).toBe(false)
  })

  it('needs no change to the playbook, the engine, or any rule condition', () => {
    // The only difference between the two runs above is delhi.phase.
    expect(SIR_STATES.delhi.phase).toBe(SIR_PHASES.claims_notice)
    expect(advanced.phase).toBe(SIR_PHASES.final_roll)
  })
})

describe('tracking-loop states', () => {
  it('a filed Form 6 lands on s-3-p, not back on "file Form 6"', () => {
    expect(at({ sirQ1: 'roll_absent', form6Filed: 'yes' })).toBe('s-3-p')
    expect(evaluate(sirPlaybook, { sirQ1: 'roll_absent', form6Filed: 'yes' }).rec).toBe('WAIT')
  })

  it('submitted notice documents land on s-4-p, not back on "submit the documents"', () => {
    expect(at({ sirQ1: 'notice', sirDocsFiled: 'yes' })).toBe('s-4-p')
    expect(evaluate(sirPlaybook, { sirQ1: 'notice', sirDocsFiled: 'yes' }).rec).toBe('WAIT')
  })

  it('s-4-p outranks s-3-p (rule order is load-bearing)', () => {
    expect(at({ sirDocsFiled: 'yes', form6Filed: 'yes' })).toBe('s-4-p')
  })
})

describe('guardrails', () => {
  it('passes the full §7/§8 guardrail suite, including SIR-only copy and the retired-action scan', () => {
    runGuardrailSuite(sirPlaybook, { extra: sirCopyExtras(), currentPhaseId: SIR_STATES.delhi.phase!.id })
  })

  it('stays clean under the final_roll phase too, before C6 ever flips it', () => {
    // The three final-phase rules are the ones carrying the sourced 15-day
    // interval, and the Enumeration Form stays retired in that phase too.
    // Proving them clean now closes the gap ahead of the flip.
    runGuardrailSuite(sirPlaybook, { extra: sirCopyExtras(), currentPhaseId: SIR_PHASES.final_roll.id })
  })

  it('no action field instructs the retired Enumeration Form filing', () => {
    for (const r of sirPlaybook.rules) {
      expect(`${r.whatShort} ${r.whatToDo} ${r.where.label}`, r.id).not.toMatch(/enumeration form/i)
    }
  })

  it("the citizen's filing deadline is 30 Sep, never the ERO's 29 Oct disposal date", () => {
    for (const id of ['s-roll-absent', 's-roll-unchecked']) {
      const r = sirPlaybook.rules.find(x => x.id === id)!
      expect(r.howLong, id).toMatch(/30 Sep 2026/)
      expect(`${r.whatToDo} ${r.howLong}`, id).not.toMatch(/29 Oct/)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/playbooks/sirPlaybook.test.ts`
Expected: FAIL — `./sirPlaybook` module not found.

- [ ] **Step 3: Implement `src/playbooks/sirPlaybook.ts`**

Transcribed from `design/nextmove-v1-prototype.html` lines 1306–1516.

```ts
// SIR playbook — 9 rules + the UNCLASSIFIED fallback, plus Delhi's verified
// phase configuration.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html lines 1306-1516
// (git tag v1-design-lock-2).
//
// STATE -> VERIFIED CURRENT PHASE -> USER SITUATION -> APPLICABLE RULE -> DIAGNOSIS
//
// The active rules reflect only what is actionable in a state's current phase.
// Final-phase rules are unreachable under the claims/notice phase because no
// Q1 option produces their answer values — structural gating, not a runtime
// check. Flipping delhi.phase is the whole change needed to advance.
import type { Playbook } from '../domain/types'
import type { SirPhase, SirStateConfig } from '../domain/sirConfig'
import { SAFETY_NET_TITLE } from './safetyNet'

/** Structurally identical to the guardrail harness's CopyString, declared
 *  locally on purpose: shipped playbook data must never import the harness
 *  (which reaches node:fs). TypeScript's structural typing makes the arrays
 *  interchangeable without the dependency. */
export interface CopyLocation {
  at: string
  text: string
}

const SIR_FAQ = 'FAQ_SIR2026.pdf'
const VOTERS_PORTAL = 'https://voters.eci.gov.in'
const FINAL_ROLL_MILESTONE = { label: 'Final Roll publication — 4 Nov 2026 (Delhi)' }

export const sirPlaybook: Playbook = {
  serviceId: 'sir',
  rules: [
    // Check-in pending states.
    {
      id: 's-4-p',
      condition: a => a.sirDocsFiled === 'yes',
      rec: 'WAIT',
      state: 'S-4·W',
      label: 'Documents submitted, with the ERO',
      dependency: 'ERO decision',
      explanation: "You've submitted your document as the notice asked. The decision on your record now rests with the ERO, and nothing further is needed from you.",
      whatShort: 'Documents in. Nothing to do now.',
      whatToDo: 'Nothing right now. Add an update when you hear back, or when the Final Roll publishes.',
      where: { label: 'ERO (per your notice)' },
      need: 'Nothing. Keep your submission acknowledgment safe.',
      howLong: 'The next fixed milestone is Final Roll publication — 4 Nov 2026 in Delhi.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ; Delhi SIR calendar' },
      mustNot: "Any prediction of the ERO's decision.",
    },
    {
      id: 's-3-p',
      condition: a => a.form6Filed === 'yes',
      rec: 'WAIT',
      state: 'S-3·W',
      label: 'Form 6 filed, decision ahead of the Final Roll',
      dependency: 'ERO / Final Roll publication',
      explanation: 'Your Form 6 claim is in during the Claims & Objections window. The decision lands ahead of the Final Roll, and nothing further is needed from you.',
      whatShort: 'Claim filed. Nothing to do now.',
      whatToDo: 'Nothing right now. Add an update when you hear back, or when the Final Roll publishes.',
      where: FINAL_ROLL_MILESTONE,
      need: 'Nothing. Keep your Form 6 acknowledgment safe: it is your proof of filing.',
      howLong: 'The next fixed milestone is Final Roll publication — 4 Nov 2026 in Delhi.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ; Delhi SIR calendar' },
      mustNot: 'Any claim that filing guarantees inclusion.',
    },
    {
      id: 's-notice',
      condition: a => a.sirQ1 === 'notice',
      rec: 'FOLLOW_UP',
      state: 'S-4',
      label: 'Notice requesting documents',
      dependency: 'You, then ERO',
      explanation: "You've received an official notice asking for documents. NextMove can't tell you why the notice was issued specifically, only that it means your last-SIR record couldn't be confirmed from the form alone.",
      whatShort: 'Submit the requested documents',
      whatToDo: 'Submit one of the ECI-prescribed documents as your notice directs.',
      where: { label: "Submit to your BLO / ERO per the notice's instructions" },
      // The prototype ships this list as raw <ul> markup inside `need`. C2
      // splits it: plain-text lead-in here, items in needList, so no renderer
      // ever has to inject markup from a data field (C1 types.ts note).
      need: 'Any ONE of these:',
      needList: [
        'A government/PSU ID or pension order',
        'A pre-1987 government/bank/LIC/PSU-issued ID',
        'Birth certificate',
        'Passport',
        'Matriculation/educational certificate',
        'Permanent residence certificate',
        'Forest right certificate',
        'Caste certificate',
        'NRC (where it exists)',
        'Family register',
        'Land/house allotment certificate',
        'Aadhaar (per the specific 2025 ECI direction)',
      ],
      howLong: "Your notice's own instructions control the deadline; no separate elector-facing deadline is published. Delhi's notice/disposal phase itself runs through 29 Oct 2026.",
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ, Q23, Q11' },
      mustNot: 'Why the notice was issued, or which specific document will be accepted for your case.',
    },
    {
      id: 's-roll-absent',
      condition: a => a.sirQ1 === 'roll_absent',
      rec: 'FOLLOW_UP',
      state: 'S-3',
      label: 'Not on the Draft Roll',
      dependency: 'You: active follow-up needed',
      explanation: "You've checked the Draft Roll and your name isn't there. That can happen for a few different reasons. Maybe the Enumeration Form wasn't deposited in time, or you'd moved and it couldn't reach you. NextMove can't tell which applies to you. But the fix is the same either way, and it's live right now: Delhi is currently in the Claims & Objections window.",
      whatShort: 'File Form 6 during Claims & Objections',
      whatToDo: 'File Form 6 with a Declaration Form and supporting documents during the Claims & Objections window.',
      where: { label: 'Form 6 — Claims & Objections window (online or at the Voter Centre)', url: VOTERS_PORTAL },
      need: 'One of the ECI-accepted document types (see your next-move details) and the Declaration Form.',
      howLong: 'The claims filing window is live now and closes 30 Sep 2026 in Delhi. File by then.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ, Q20, Q21, Q28, Q30' },
      mustNot: 'The specific reason your name is missing.',
    },
    {
      id: 's-roll-unchecked',
      condition: a => a.sirQ1 === 'roll_unchecked',
      rec: 'FOLLOW_UP',
      state: 'S-2',
      label: "Haven't checked the Draft Roll yet",
      dependency: 'You: one check needed',
      explanation: "The Draft Roll for Delhi has already been published, so the fastest way to know where you stand is to check it directly. Waiting won't surface new information on its own the way it would have during enumeration.",
      whatShort: 'Check the Draft Roll now',
      whatToDo: "Check the Draft Electoral Roll now via the Voters' Service Portal, ECINET app, or the Delhi CEO website. What you find determines the next step: if you're listed, there's nothing further to do; if not, file Form 6 during the current Claims & Objections window.",
      where: { label: 'Draft Roll — voters.eci.gov.in, ECINET app, or the Delhi CEO website', url: VOTERS_PORTAL },
      need: 'Nothing. Just your name and constituency to search.',
      howLong: "Delhi's claims filing window closes 30 Sep 2026, so checking now leaves time to file if you're not listed.",
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ, Q15, Q25, Q26, Q27' },
      mustNot: "A guess at whether you'll be listed — NextMove doesn't know until you check.",
    },
    // Final-phase rules: reachable only once a state's phase is final_roll,
    // because only that phase's Q1 offers these answer values.
    {
      id: 's-final-absent',
      condition: a => a.sirQ1 === 'final_absent',
      rec: 'ESCALATE',
      state: 'S-5',
      label: 'Name still missing after the Final Roll',
      dependency: 'Appellate authority',
      explanation: "You did everything asked and your name still isn't on the Final Roll. There's a real, time-bound official appeal for exactly this, and it needs to move quickly.",
      whatShort: 'File an appeal within 15 days',
      whatToDo: "File an appeal before the District Election Officer / District Magistrate of your district, within 15 days of the Final Roll's publication.",
      where: { label: 'District Election Officer / District Magistrate' },
      need: 'Proof of your earlier submission (Enumeration Form acknowledgment or Form 6 filing) and any documents you already submitted.',
      howLong: 'The appeal window is 15 days from Final Roll publication (CEO Delhi FAQ Q32), one of the few sourced numeric deadlines in this playbook.',
      source: {
        docId: SIR_FAQ,
        title: 'CEO Delhi — Official SIR 2026 FAQ, Q32',
        quote: '15-day appeal window — one of the few sourced numeric deadlines in this playbook.',
      },
      mustNot: "Anything about the appeal's likely outcome.",
    },
    {
      id: 's-final-present',
      condition: a => a.sirQ1 === 'final_present',
      rec: 'WAIT',
      state: 'S-8',
      label: 'On the Final Roll. Complete.',
      dependency: 'Nothing. This is the outcome.',
      explanation: "Your name is on the Final Roll. That's the outcome this whole process was about; nothing further is pending.",
      whatShort: 'Nothing to do. This is done.',
      whatToDo: "Nothing. If you're tracking this case, record the good news and close it.",
      where: { label: "Final Roll — your state CEO's website", url: VOTERS_PORTAL },
      need: 'Nothing.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ; Delhi SIR calendar' },
      mustNot: 'Nothing further to flag.',
    },
    {
      id: 's-final-unchecked',
      condition: a => a.sirQ1 === 'final_unchecked',
      rec: 'FOLLOW_UP',
      state: 'S-9',
      label: "Haven't checked the Final Roll yet",
      dependency: 'You — one check needed',
      explanation: 'The Final Roll is published, and the 15-day appeal window (if you need it) runs from publication, so checking promptly matters.',
      whatShort: 'Check the Final Roll now',
      whatToDo: "Check the Final Electoral Roll now via the Voters' Service Portal or your state CEO's website. If you're listed, you're done; if not, the 15-day appeal is the next step.",
      where: { label: 'Final Roll — voters.eci.gov.in or the state CEO website', url: VOTERS_PORTAL },
      need: 'Nothing. Just your name and constituency to search.',
      howLong: 'The appeal window, if needed, is 15 days from Final Roll publication (CEO Delhi FAQ Q32), so checking early preserves your options.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ, Q32' },
      mustNot: "A guess at whether you'll be listed.",
    },
    {
      id: 's-roll-present',
      condition: a => a.sirQ1 === 'roll_present',
      rec: 'WAIT',
      state: 'S-1',
      label: 'On the Draft Roll, nothing pending',
      dependency: 'Final Roll publication',
      explanation: "You've checked the Draft Roll and your name is there. Nothing further is required from you unless a notice arrives. The next official milestone is the Final Roll itself.",
      whatShort: 'Nothing to do right now',
      whatToDo: 'Nothing is required from you right now. If a notice requesting documents arrives before the Final Roll is published, that changes things. Otherwise, just wait.',
      where: FINAL_ROLL_MILESTONE,
      need: 'Nothing. This is a waiting step.',
      howLong: "The next official milestone has a real date: Final Roll publication on 4 Nov 2026, per Delhi's verified SIR calendar.",
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ; Delhi SIR calendar' },
      mustNot: 'Any claim that inclusion on the Draft Roll guarantees Final Roll inclusion.',
    },
  ],
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'S-7',
    label: 'SIR status unclear',
    dependency: 'Unknown',
    explanation: "NextMove doesn't have enough evidence from your answers to safely place your case, even within Delhi's verified current phase. Rather than guess, it's safest to check directly.",
    whatShort: 'Check your status directly',
    whatToDo: 'Check directly rather than guess.',
    where: { label: 'voters.eci.gov.in', url: VOTERS_PORTAL, phone: '1950' },
    need: 'Nothing. Just check directly.',
    source: { docId: null, title: SAFETY_NET_TITLE },
    mustNot: 'Any WAIT / FOLLOW UP / ESCALATE claim, or an assumed SIR phase for your state.',
  },
}

/** Phases live apart from states so advancing a state's phase is a one-line
 *  config change touching no engine code. */
export const SIR_PHASES: Record<string, SirPhase> = {
  claims_notice: {
    id: 'claims_notice',
    label: 'Claims & Objections / Notice window',
    note: "Delhi's enumeration ran 30 Jun–17 Aug 2026 and the Draft Roll published on 31 Aug. Claims and objections can be filed through 30 Sep 2026; the notice/disposal phase runs through 29 Oct, ahead of the Final Roll on 4 Nov 2026.",
  },
  final_roll: {
    id: 'final_roll',
    label: 'Final Roll published',
    note: "Delhi's Final Roll published on 4 Nov 2026. If your name is on it, the process is complete. If it isn't, a 15-day appeal window applies from publication (CEO Delhi FAQ Q32).",
  },
}

/** V1 SIR coverage is locked to Delhi. A state with `supported: false` never
 *  reaches this playbook — it routes to the coverage screen. Adding a verified
 *  state later is one config entry with its own phase; no UX changes.
 *  Each record carries its own map key as `id` (C1 handoff item). */
export const SIR_STATES: Record<string, SirStateConfig> = {
  delhi: { id: 'delhi', name: 'Delhi', supported: true, phase: SIR_PHASES.claims_notice },
  bihar: { id: 'bihar', name: 'Bihar', supported: false },
  maharashtra: { id: 'maharashtra', name: 'Maharashtra', supported: false },
  up: { id: 'up', name: 'Uttar Pradesh', supported: false },
  other: { id: 'other', name: 'Another state / not sure', supported: false },
}

/** SIR Q1's option set is phase-gated, not fixed. Only situations actually
 *  live in a state's current phase are offered, so a citizen is never asked to
 *  distinguish something the phase makes impossible. "I'm not sure" is
 *  appended by the question screen OUTSIDE this set (C3) and is deliberately
 *  not phase-gated.
 *
 *  'duplicate' is absent on purpose: its only verified remedy (file the
 *  Enumeration Form where you now live, FAQ Q22) belongs to a phase that
 *  closed on 17.08.2026. The source is verbatim; the calendar retired the
 *  action. Duplicate-suspicion falls through to "I'm not sure" ->
 *  UNCLASSIFIED, which is the honest answer. */
export const SIR_Q1_OPTIONS_FOR: Record<string, Record<string, string>> = {
  claims_notice: {
    roll_present: 'I checked the Draft Roll and my name is there',
    roll_absent: "I checked the Draft Roll and my name isn't there",
    roll_unchecked: "I haven't checked the Draft Roll yet",
    notice: 'I got a notice asking for documents',
  },
  final_roll: {
    final_present: 'I checked the Final Roll and my name is there',
    final_absent: "I checked the Final Roll and my name isn't there",
    final_unchecked: "I haven't checked the Final Roll yet",
  },
}

/** SIR's citizen-facing copy that does not live on a rule: the phase notes
 *  (rendered on the Diagnosis screen) and the Q1 option labels. Fed to the
 *  content-safety scan so SIR's dates are allow-listed there too.
 *  Locations carry the same mandatory 'sir:' service prefix every other
 *  CopyString does, so they match the manifest allowlists' allowed_in
 *  entries and can never collide with another playbook's copy. */
export function sirCopyExtras(): CopyLocation[] {
  const out: CopyLocation[] = []
  for (const phase of Object.values(SIR_PHASES)) {
    out.push({ at: `sir:SIR_PHASES.${phase.id}.label`, text: phase.label })
    out.push({ at: `sir:SIR_PHASES.${phase.id}.note`, text: phase.note })
  }
  for (const [phaseId, options] of Object.entries(SIR_Q1_OPTIONS_FOR)) {
    for (const [value, label] of Object.entries(options)) {
      out.push({ at: `sir:SIR_Q1_OPTIONS_FOR.${phaseId}.${value}`, text: label })
    }
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/playbooks/sirPlaybook.test.ts` — Expected: PASS (30 tests).
Run: `npm run build` — Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/playbooks/sirPlaybook.ts src/playbooks/sirPlaybook.test.ts
git commit -m "feat(c2): SIR playbook — 9 rules + fallback, phases, state configs, phase-gated options

Transcribed from the locked prototype (v1-design-lock-2, lines 1306-1516).
SIR_STATES keys are materialized into each record's id and s-notice's <ul>
markup moves into needList, closing both C1 handoff items. The phase-flip
test proves the extensibility claim directly: changing delhi.phase makes
exactly the final-phase states reachable, with no engine or rule changes.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8"
```

---

### Task 7: Service engines — wiring C1's `diagnose()` to real data, plus the cross-playbook sweep

**Files:**
- Create: `src/playbooks/engines.ts`, `src/playbooks/engines.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–6, plus C1's `ServiceEngine`, `diagnose`, `decorateStageRung`, `DependentKeys`.
- Produces:
  - `passportEngine`, `voterEngine`, `sirEngine: ServiceEngine`
  - `ENGINES: Record<string, ServiceEngine>` and `DEPS_FOR: Record<string, DependentKeys>` — the two lookups C3/C5 route through.

**Design notes:**
- This is the first task where C1's `diagnose()` runs against real government-process data. Everything before it exercised `evaluate()` alone.
- **Passport gets `decorate`**, wired to C1's `decorateStageRung` with `PASSPORT_STAGE_SHORT` and the stage key `q1`. C1 applies it only when a rule actually matched, so an UNCLASSIFIED fallback is never dressed as a diagnosed state.
- **Voter gets `unclassifiedKeys`**, both keys. SIR gets `unclassifiedKeys: ['sirQ1']` — the prototype's SIR Diagnosis screen and `currentDiagnosis()` agree on that one key, so there is no contradiction to resolve, only the same mechanism used consistently.
- **Neither Voter nor SIR gets a `decorate`**, and Passport gets no `unclassifiedKeys`: the prototype's passport Q1 "I'm not sure" is stored as the literal `not_sure`, which matches no condition and reaches the fallback through `evaluate()` on its own. Adding a short-circuit there would be new behavior, not a translation.
- The **cross-playbook sweep** is the bidirectional half of the manifest policy (Task 1, design note 2). It can only run here, because it needs all three playbooks at once.

- [ ] **Step 1: Write the failing tests** (`src/playbooks/engines.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { passportEngine, voterEngine, sirEngine, ENGINES, DEPS_FOR } from './engines'
import { passportPlaybook } from './passportPlaybook'
import { voterPlaybook } from './voterPlaybook'
import { sirPlaybook, sirCopyExtras, SIR_STATES } from './sirPlaybook'
import { diagnose } from '../domain/engine'
import { applyEvent } from '../domain/answers'
import { orphanFindings } from './guardrails/citations'
import { copyStrings, staleExemptionFindings } from './guardrails/contentSafety'
import { guardrailFindings } from './guardrails/suite'

const ALL = [passportPlaybook, voterPlaybook, sirPlaybook]

describe('engine wiring', () => {
  it('registers one engine per service, keyed for routing and storage', () => {
    expect(Object.keys(ENGINES).sort()).toEqual(['passport', 'sir', 'voter'])
    for (const [key, engine] of Object.entries(ENGINES)) expect(engine.key, key).toBe(key)
  })

  it('only passport decorates; only voter and sir short-circuit on "I\'m not sure"', () => {
    expect(passportEngine.decorate).toBeTypeOf('function')
    expect(voterEngine.decorate).toBeUndefined()
    expect(sirEngine.decorate).toBeUndefined()
    expect(passportEngine.unclassifiedKeys).toBeUndefined()
    expect(voterEngine.unclassifiedKeys).toEqual(['voterQ1', 'voterAppealed'])
    expect(sirEngine.unclassifiedKeys).toEqual(['sirQ1'])
  })

  it('exposes the per-service dependent-key maps', () => {
    expect(DEPS_FOR.passport).toEqual({ q1: ['q2'] })
    expect(DEPS_FOR.voter).toEqual({ voterQ1: ['voterAppealed', 'voterAppealedRaw'] })
    expect(DEPS_FOR.sir).toEqual({})
  })
})

describe('passport — stage·rung composition on real data', () => {
  it('composes "{stage} · {rung}" for a ladder state', () => {
    const d = diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })
    expect(d.ruleId).toBe('state-5a')
    expect(d.label).toBe('Adverse outcome · informal follow-up unresolved')
  })

  it('the same rung under a different stage reads differently — the stage stays visible', () => {
    const a = diagnose(passportEngine, { q1: 'no_contact', q2: 'informal' }).label
    const b = diagnose(passportEngine, { q1: 'adverse', q2: 'informal' }).label
    expect(a).toBe('Awaiting verification · informal follow-up unresolved')
    expect(a).not.toBe(b)
  })

  it('leaves a base state\'s own label alone (no rungLabel, nothing to compose)', () => {
    expect(diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' }).label)
      .toBe('Waiting for police verification to begin')
  })

  it("never decorates the fallback — 'I'm not sure' stays plainly unclear", () => {
    const d = diagnose(passportEngine, { q1: 'not_sure' })
    expect(d.ruleId).toBeNull()
    expect(d.label).toBe('Status unclear')
  })

  it('decorates a tracking-loop rung with the stage it is still attached to', () => {
    expect(diagnose(passportEngine, { q1: 'verified_no_progress', dpgFiled: 'yes' }).label)
      .toBe('Verified, processing quiet · escalated to the DPG, response pending')
  })
})

describe('voter — the unclassified short-circuit, on real data', () => {
  it("'I'm not sure' on Q1 reaches the fallback", () => {
    const d = diagnose(voterEngine, { voterQ1: 'unclassified' })
    expect(d.ruleId).toBeNull()
    expect(d.state).toBe('V-6')
  })

  it("'I'm not sure' on the appeal follow-up ALSO reaches the fallback (C1's recorded deviation)", () => {
    // evaluate() alone would return the confident v-3 here; the engine must not.
    const d = diagnose(voterEngine, { voterQ1: 'decision', voterAppealed: 'unclassified' })
    expect(d.ruleId).toBeNull()
    expect(d.rec).toBe('UNCLASSIFIED')
  })

  it('the short-circuit beats a stale outcome key that would otherwise match first', () => {
    const d = diagnose(voterEngine, { voterQ1: 'unclassified', voterOutcome: 'accepted_pending' })
    expect(d.ruleId).toBeNull()
  })

  it('a real answer still diagnoses normally', () => {
    expect(diagnose(voterEngine, { voterQ1: 'blo_visited' }).state).toBe('V-2')
  })
})

describe('sir — engine on real data', () => {
  it("'I'm not sure' reaches the fallback, never a guessed phase", () => {
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'unclassified' })
    expect(d.ruleId).toBeNull()
    expect(d.state).toBe('S-7')
  })

  it('diagnoses a Delhi claims-phase situation', () => {
    expect(diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'roll_absent' }).state).toBe('S-3')
  })

  it('carries the answers it was computed from, including the state key', () => {
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })
    expect(d.matchedAnswers.sirState).toBe('delhi')
  })
})

describe('check-in composition across the real ladders (retire, don\'t reset)', () => {
  it('passport: consuming a resolved outcome lands on the rung, not back at the base state', () => {
    const resting = { q1: 'no_contact', q2: 'informal', fOutcome: 'resolved' }
    expect(diagnose(passportEngine, resting).ruleId).toBe('state-5a-r')
    const stalled = applyEvent(resting, { fOutcome: null })
    expect(diagnose(passportEngine, stalled).ruleId).toBe('state-5a')
    expect(stalled.q2).toBe('informal')
  })

  it('voter: filing the second appeal moves the case up, and the question answers survive', () => {
    const next = applyEvent({ voterQ1: 'decision', voterAppealed: 'decided' }, { ceoAppeal: 'filed' })
    expect(diagnose(voterEngine, next).ruleId).toBe('v-5-p')
    expect(next.voterAppealed).toBe('decided')
  })

  it('sir: submitting the notice documents moves the case off the FOLLOW_UP that asked for them', () => {
    const next = applyEvent({ sirQ1: 'notice' }, { sirDocsFiled: 'yes' })
    expect(diagnose(sirEngine, next).ruleId).toBe('s-4-p')
    expect(diagnose(sirEngine, next).rec).toBe('WAIT')
  })
})

describe('cross-playbook guardrail sweep', () => {
  it('all three playbooks are clean through the full suite', () => {
    expect(guardrailFindings(passportPlaybook)).toEqual([])
    expect(guardrailFindings(voterPlaybook)).toEqual([])
    expect(guardrailFindings(sirPlaybook, {
      extra: sirCopyExtras(),
      currentPhaseId: SIR_STATES.delhi.phase!.id,
    })).toEqual([])
  })

  it('ships exactly 28 rules with globally unique ids', () => {
    const ids = ALL.flatMap(p => p.rules.map(r => r.id))
    expect(ids).toHaveLength(28)
    expect(new Set(ids).size).toBe(28)
  })

  it('ships the expected per-service rule counts (Implementation Plan §1)', () => {
    expect(passportPlaybook.rules).toHaveLength(12)
    expect(voterPlaybook.rules).toHaveLength(7)
    expect(sirPlaybook.rules).toHaveLength(9)
  })

  it('no live manifest entry is orphaned by the shipped set', () => {
    expect(orphanFindings(ALL)).toEqual([])
  })

  it('every safety exemption still earns its place across all three playbooks', () => {
    const all = ALL.flatMap(p => copyStrings(p)).concat(sirCopyExtras())
    expect(staleExemptionFindings(all)).toEqual([])
  })

  it('exactly three fallbacks exist, each uncited by discriminator', () => {
    for (const p of ALL) {
      expect(p.fallback.rec, p.serviceId).toBe('UNCLASSIFIED')
      expect(p.fallback.source.docId, p.serviceId).toBeNull()
    }
  })

  it('no non-fallback rule is uncited', () => {
    for (const p of ALL) {
      for (const r of p.rules) expect(r.source.docId, `${p.serviceId}:${r.id}`).not.toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/playbooks/engines.test.ts`
Expected: FAIL — `./engines` module not found.

- [ ] **Step 3: Implement `src/playbooks/engines.ts`**

```ts
// The three service engines: C1's ServiceEngine shape, filled with C2's data.
// This is the only place playbook data and engine composition meet; no
// government-process rule lives here, only which composition each service uses.
import type { DependentKeys } from '../domain/answers'
import type { ServiceEngine } from '../domain/engine'
import { decorateStageRung } from '../domain/stageRung'
import { passportPlaybook, PASSPORT_STAGE_SHORT, PASSPORT_DEPS } from './passportPlaybook'
import { voterPlaybook, VOTER_DEPS, VOTER_UNCLASSIFIED_KEYS } from './voterPlaybook'
import { sirPlaybook } from './sirPlaybook'

/** Passport is the one service with an escalation ladder deep enough that the
 *  rung alone would hide the stage, so its labels compose "{stage} · {rung}".
 *  No unclassifiedKeys: passport's "I'm not sure" is stored as the literal
 *  'not_sure', which matches no condition and reaches the fallback through
 *  evaluate() on its own — the prototype's behavior, kept. */
export const passportEngine: ServiceEngine = {
  key: 'passport',
  playbook: passportPlaybook,
  decorate: d => decorateStageRung(d, PASSPORT_STAGE_SHORT, 'q1'),
}

/** Voter carries BOTH unclassified keys — see voterPlaybook's note and C1
 *  Task 6's recorded deviation. */
export const voterEngine: ServiceEngine = {
  key: 'voter',
  playbook: voterPlaybook,
  unclassifiedKeys: VOTER_UNCLASSIFIED_KEYS,
}

/** SIR has one question, so one unclassified key. No decoration: SIR has no
 *  escalation ladder to compose a label from. */
export const sirEngine: ServiceEngine = {
  key: 'sir',
  playbook: sirPlaybook,
  unclassifiedKeys: ['sirQ1'],
}

export const ENGINES: Record<string, ServiceEngine> = {
  passport: passportEngine,
  voter: voterEngine,
  sir: sirEngine,
}

/** Per-service answer dependencies, for C1's applyCorrection. SIR's sirQ1 has
 *  no dependent answers, so its map is deliberately empty rather than absent. */
export const DEPS_FOR: Record<string, DependentKeys> = {
  passport: PASSPORT_DEPS,
  voter: VOTER_DEPS,
  sir: {},
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/playbooks/engines.test.ts` — Expected: PASS (25 tests).
Run: `npx vitest run` — Expected: the whole suite green (C1's 50, plus Tasks 1-7's 177; Task 8 adds the last 45).
Run: `npm run build` — Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/playbooks/engines.ts src/playbooks/engines.test.ts
git commit -m "feat(c2): service engines — diagnose() wired to real playbook data

Passport composes stage·rung labels, voter and sir short-circuit on an
explicit 'I'm not sure', and the cross-playbook sweep closes the manifest
policy in both directions: 28 uniquely-identified rules, no orphaned live
citation, no stale safety exemption, three fallbacks uncited by discriminator.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8"
```

---

---

### Task 8: Check-in patch payloads + post-patch diagnosis assertions

**Files:**
- Create: `src/domain/checkinPatches.ts`, `src/domain/checkinPatches.test.ts`

**Interfaces:**
- Consumes: C1's `applyEvent`, `diagnose`; Tasks 4–7's `passportPlaybook` / `voterPlaybook` / `sirPlaybook` and their engines.
- Produces:
  - `CHECKIN_PATCHES: Record<string, CheckinPatchOption[]>` — the patch payloads of the prototype's `CHECKIN` table, keyed by rule id (passport, voter) or user-facing state id (SIR), transcribed in the prototype's own option order.
  - `CheckinPatchOption` — `{ patch?, pendingPatch?, rejectPatch?, acceptPendingPatch?, rejectDeadend? }`.

**Why this task exists (the §7 guardrail C2 cannot honestly defer):** §7 declares a "check-in post-patch assertions" guardrail — "for every check-in option in all three services, a test asserting exactly what the diagnosis reads after the patch is applied". The first draft of this plan deferred the whole `CHECKIN` table to C5. That was half right. The prototype's table (`design/nextmove-v1-prototype.html` lines 2508–2596) has two genuinely separate halves:

- **UI/session mechanics — C5's, correctly deferred:** every option's `label`, its `k` kind (`event` / `action` / `resolved-rung` / `valence` / `closureq` / `deadend`), the `prepAware` flag, valence branching, dead-end and closure states, the universal options the loop appends ("Nothing yet", the deliverable, "Something else happened"), and the degraded-source pause. None of that can be built or tested without a session, a casefile and a screen.
- **Patch payloads — pure rule-keyed data, assertable NOW:** `patch`, `pendingPatch`, `acceptPendingPatch`, `rejectPatch`, `rejectDeadend`. These are plain `AnswerRecord` deltas. C1 already shipped `applyEvent` and `diagnose`; nothing about them needs a session or a screen.

And C2 already ships the half that depends on them: **11 of C2's 28 rules are reachable only through a check-in patch** — `state-5a-p`, `state-5a-r`, `state-5b-p`, `state-5b-r`, `state-dpg-p`, `state-dpg-r`, `v-acc`, `v-5-p`, `s-3-p`, `s-4-p`. Their data ships in Tasks 4–6; what was missing was the proof. Tasks 4–7's tracking-loop tests only exercise the happy outcomes (`pending`, `resolved`, `filed`). They never exercise `unhelpful`, `no_response`, or the `null`-deletion "retire, don't reset" case — and those are the load-bearing "the ladder climbs, never descends" transitions.

**Design notes:**
- **Transcribed, not authored.** Every payload is byte-for-byte from `design/nextmove-v1-prototype.html` lines 2508–2596 (tag `v1-design-lock-2`). Labels and kinds are dropped, nothing is reworded.
- **Placed after Task 7 on purpose:** the assertions key against all three playbooks' real rule ids and need all three engines wired.
- **The keys are a mix, and that is the prototype's own shape:** passport and voter entries are keyed by rule id, SIR entries by the user-facing `state` id (`S-1`, `S-2`, `S-3`, `S-4`, `S-9`). The prototype resolves `CHECKIN[d.state] ?? CHECKIN[d.id]` (line 2599). The mix is transcribed rather than normalized, and the lookup order is recorded for C5.
- **`S-6` is absent**, matching Task 6: its check-in moved to `sirDormantRules_enumeration` when the enumeration phase closed on 17.08.2026, and that content is not ported.
- **Two options carry no payload at all** — `state-dpg-r[0]` and `state-dpg-p[1]`, both dead ends at the top of the verified passport ladder. A test pins exactly those two, so a payload silently going missing elsewhere fails the build.
- **Lives in `src/domain/`, not `src/playbooks/`,** because it is keyed to states rather than being a playbook of its own, and because C5's session layer is its only consumer. It imports nothing from the fs-backed guardrail harness.

- [ ] **Step 1: Write the failing tests** (`src/domain/checkinPatches.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { CHECKIN_PATCHES } from './checkinPatches'
import { applyEvent } from './answers'
import { diagnose } from './engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { passportPlaybook } from '../playbooks/passportPlaybook'
import { voterPlaybook } from '../playbooks/voterPlaybook'
import { sirPlaybook } from '../playbooks/sirPlaybook'

const ALL = [passportPlaybook, voterPlaybook, sirPlaybook]
const PAYLOAD_KEYS = ['patch', 'pendingPatch', 'rejectPatch', 'acceptPendingPatch'] as const

describe('CHECKIN_PATCHES shape', () => {
  it('carries payloads only — never a label, a kind, or a prepAware flag (those are C5)', () => {
    const allowed = new Set([...PAYLOAD_KEYS, 'rejectDeadend'])
    for (const [key, opts] of Object.entries(CHECKIN_PATCHES)) {
      for (const [i, opt] of opts.entries()) {
        for (const k of Object.keys(opt)) {
          expect(allowed.has(k as never), `${key}[${i}].${k}`).toBe(true)
        }
      }
    }
  })

  it('keys every entry to a shipped rule id or a shipped rule state id', () => {
    const ids = new Set(ALL.flatMap(p => p.rules.map(r => r.id)))
    const states = new Set(ALL.flatMap(p => p.rules.map(r => r.state)))
    for (const key of Object.keys(CHECKIN_PATCHES)) {
      expect(ids.has(key) || states.has(key), `CHECKIN_PATCHES["${key}"]`).toBe(true)
    }
  })

  it('does not carry the phase-retired duplicate-registration check-in', () => {
    expect(CHECKIN_PATCHES['S-6']).toBeUndefined()
  })

  it('only the two dead-end options carry no payload at all', () => {
    const payloadFree = Object.entries(CHECKIN_PATCHES)
      .flatMap(([key, opts]) => opts.map((o, i) => [`${key}[${i}]`, o] as const))
      .filter(([, o]) => !PAYLOAD_KEYS.some(k => o[k]))
      .map(([at]) => at)
    expect(payloadFree).toEqual(['state-dpg-r[0]', 'state-dpg-p[1]'])
  })

  it("v-5-p's reject branch is a declared dead end, not a patch", () => {
    expect(CHECKIN_PATCHES['v-5-p'][0].rejectDeadend).toBe(true)
    expect(CHECKIN_PATCHES['v-5-p'][0].rejectPatch).toBeUndefined()
  })
})

describe('passport post-patch assertions', () => {
  it.each([
    ['state-1[0]', { q1: 'no_contact', q2: 'no_followup' }, { q1: 'contacted_incomplete' }, 'state-2'],
    ['state-1[1]', { q1: 'no_contact', q2: 'no_followup' }, { q1: 'verified_no_progress' }, 'state-3'],
    ['state-1[2]', { q1: 'no_contact', q2: 'no_followup' }, { q1: 'adverse' }, 'state-4'],
    ['state-2[2]', { q1: 'contacted_incomplete', q2: 'no_followup' }, { q2: 'informal', fOutcome: 'pending' }, 'state-5a-p'],
    ['state-3[0]', { q1: 'verified_no_progress', q2: 'no_followup' }, { q2: 'informal', fOutcome: 'pending' }, 'state-5a-p'],
    ['state-4[0]', { q1: 'adverse', q2: 'no_followup' }, { q2: 'informal', fOutcome: 'pending' }, 'state-5a-p'],
    ['state-5a-p[0]', { q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }, { fOutcome: 'resolved' }, 'state-5a-r'],
    ['state-5a-p[1]', { q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }, { fOutcome: 'unhelpful' }, 'state-5a'],
    ['state-5a-p[2]', { q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }, { fOutcome: 'no_response' }, 'state-5a'],
    ['state-5a-r[0]', { q1: 'no_contact', q2: 'informal', fOutcome: 'resolved' }, { fOutcome: null }, 'state-5a'],
    ['state-5a[0]', { q1: 'no_contact', q2: 'informal' }, { q2: 'formal_grievance', gOutcome: 'pending' }, 'state-5b-p'],
    ['state-5b-p[0]', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'pending' }, { gOutcome: 'resolved' }, 'state-5b-r'],
    ['state-5b-p[1]', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'pending' }, { gOutcome: 'unhelpful' }, 'state-5b'],
    ['state-5b-p[2]', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'pending' }, { gOutcome: 'no_response' }, 'state-5b'],
    ['state-5b-r[0]', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'resolved' }, { gOutcome: null }, 'state-5b'],
    ['state-5b[0]', { q1: 'no_contact', q2: 'formal_grievance' }, { dpgFiled: 'yes' }, 'state-dpg-p'],
    ['state-dpg-p[0]', { q1: 'no_contact', q2: 'formal_grievance', dpgFiled: 'yes' }, { dpgOutcome: 'resolved' }, 'state-dpg-r'],
  ])('%s reads %s after the patch', (_at, answers, patch, expected) => {
    expect(diagnose(passportEngine, applyEvent(answers, patch)).ruleId).toBe(expected)
  })

  it('an unhelpful or unanswered follow-up climbs the ladder, never descends it', () => {
    for (const outcome of ['unhelpful', 'no_response']) {
      const next = applyEvent({ q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }, { fOutcome: outcome })
      const d = diagnose(passportEngine, next)
      expect(d.ruleId, outcome).toBe('state-5a')
      expect(d.rec, outcome).toBe('FOLLOW_UP') // "make it formal", not "wait again"
      expect(next.q2, outcome).toBe('informal') // the rung is consumed, not erased
    }
  })
})

describe('voter post-patch assertions', () => {
  it.each([
    ['v-1[0]', { voterQ1: 'no_word' }, { voterQ1: 'blo_visited' }, 'v-2'],
    ['v-1[1] reject', { voterQ1: 'no_word' }, { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' }, 'v-3'],
    ['v-1[1] acceptPending', { voterQ1: 'no_word' }, { voterQ1: 'decision', voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-2[0] reject', { voterQ1: 'blo_visited' }, { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' }, 'v-3'],
    ['v-2[0] acceptPending', { voterQ1: 'blo_visited' }, { voterQ1: 'decision', voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-3[0]', { voterQ1: 'decision', voterAppealed: 'none' }, { voterAppealedRaw: 'pending', voterAppealed: 'pending' }, 'v-4'],
    ['v-3[1]', { voterQ1: 'decision', voterAppealed: 'none' }, { voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-4[0] reject', { voterQ1: 'decision', voterAppealed: 'pending' }, { voterAppealedRaw: 'decided', voterAppealed: 'decided' }, 'v-5'],
    ['v-4[0] acceptPending', { voterQ1: 'decision', voterAppealed: 'pending' }, { voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-5[0]', { voterQ1: 'decision', voterAppealed: 'decided' }, { ceoAppeal: 'filed' }, 'v-5-p'],
    ['v-5-p[0] acceptPending', { voterQ1: 'decision', voterAppealed: 'decided', ceoAppeal: 'filed' }, { voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-acc[0]', { voterQ1: 'decision', voterOutcome: 'accepted_pending' }, { voterOutcome: null }, 'v-3'],
  ])('%s reads %s after the patch', (_at, answers, patch, expected) => {
    expect(diagnose(voterEngine, applyEvent(answers, patch)).ruleId).toBe(expected)
  })

  it("deleting a stale favourable outcome returns the case to the citizen's own answers, not to the start", () => {
    const next = applyEvent({ voterQ1: 'decision', voterAppealed: 'none', voterOutcome: 'accepted_pending' }, { voterOutcome: null })
    expect(diagnose(voterEngine, next).ruleId).toBe('v-3')
    expect(next.voterQ1).toBe('decision')
  })
})

describe('sir post-patch assertions', () => {
  it.each([
    ['S-1[0]', { sirQ1: 'roll_present' }, { sirQ1: 'notice' }, 's-notice'],
    ['S-2[0]', { sirQ1: 'roll_unchecked' }, { sirQ1: 'roll_present' }, 's-roll-present'],
    ['S-2[1]', { sirQ1: 'roll_unchecked' }, { sirQ1: 'roll_absent' }, 's-roll-absent'],
    ['S-3[0]', { sirQ1: 'roll_absent' }, { form6Filed: 'yes' }, 's-3-p'],
    ['S-4[0]', { sirQ1: 'notice' }, { sirDocsFiled: 'yes' }, 's-4-p'],
    ['S-9[0]', { sirQ1: 'final_unchecked' }, { sirQ1: 'final_present' }, 's-final-present'],
    ['S-9[1]', { sirQ1: 'final_unchecked' }, { sirQ1: 'final_absent' }, 's-final-absent'],
  ])('%s reads %s after the patch', (_at, answers, patch, expected) => {
    expect(diagnose(sirEngine, applyEvent(answers, patch)).ruleId).toBe(expected)
  })

  it('a filed action lands on a WAIT rung, never re-issues the action just taken', () => {
    expect(diagnose(sirEngine, applyEvent({ sirQ1: 'roll_absent' }, { form6Filed: 'yes' })).rec).toBe('WAIT')
    expect(diagnose(sirEngine, applyEvent({ sirQ1: 'notice' }, { sirDocsFiled: 'yes' })).rec).toBe('WAIT')
  })
})

describe('outcome-value coverage', () => {
  it('exercises every outcome value the prototype options actually write', () => {
    const written = new Set<string>()
    for (const opts of Object.values(CHECKIN_PATCHES)) {
      for (const opt of opts) {
        for (const k of PAYLOAD_KEYS) {
          for (const [key, value] of Object.entries(opt[k] ?? {})) written.add(`${key}=${value}`)
        }
      }
    }
    for (const expected of [
      'fOutcome=pending', 'fOutcome=resolved', 'fOutcome=unhelpful', 'fOutcome=no_response', 'fOutcome=null',
      'gOutcome=pending', 'gOutcome=resolved', 'gOutcome=unhelpful', 'gOutcome=no_response', 'gOutcome=null',
      'dpgFiled=yes', 'dpgOutcome=resolved',
      'voterOutcome=accepted_pending', 'voterOutcome=null', 'ceoAppeal=filed',
      'form6Filed=yes', 'sirDocsFiled=yes',
    ]) {
      expect(written, expected).toContain(expected)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/checkinPatches.test.ts`
Expected: FAIL — `./checkinPatches` module not found.

- [ ] **Step 3: Implement `src/domain/checkinPatches.ts`**

Transcribed from `design/nextmove-v1-prototype.html` lines 2508–2596.

```ts
// Check-in PATCH PAYLOADS only — the rule-keyed data half of the prototype's
// CHECKIN table (design/nextmove-v1-prototype.html lines 2508-2596, tag
// v1-design-lock-2). TRANSCRIBED, not authored.
//
// Deliberately EXCLUDED and left to C5: every option's `label`, its `k` kind
// ('event' | 'action' | 'resolved-rung' | 'valence' | 'closureq' | 'deadend'),
// the `prepAware` flag, and the universal options the loop appends
// ("Nothing yet", the deliverable, "Something else happened"). Those are
// session/UI mechanics. What ships here is what C1's applyEvent() can already
// apply and diagnose() can already be asserted against.
//
// Keys are the prototype's own keys, and they are a MIX on purpose: passport
// and voter entries are keyed by rule id, SIR entries by user-facing `state`
// id ('S-1', 'S-3', ...). The prototype resolves
// `CHECKIN[d.state] ?? CHECKIN[d.id]` (line 2599); C5 must keep that order.
//
// Option ORDER within each array is the prototype's order and is preserved.
export interface CheckinPatchOption {
  /** Applied immediately when the option is chosen. `null` deletes a key. */
  patch?: Record<string, string | null>
  /** Applied when the rung resolved but the deliverable has not arrived —
   *  "retire, don't reset": the rung is CONSUMED, never erased. */
  pendingPatch?: Record<string, string | null>
  /** A 'valence' option's branch when the decision went against the citizen. */
  rejectPatch?: Record<string, string | null>
  /** A 'valence' option's branch when it went their way but nothing arrived. */
  acceptPendingPatch?: Record<string, string | null>
  /** A 'valence' option whose reject branch is the top of the verified ladder:
   *  there is no further patch, only C5's dead-end closure. */
  rejectDeadend?: true
}

export const CHECKIN_PATCHES: Record<string, CheckinPatchOption[]> = {
  'state-1': [
    { patch: { q1: 'contacted_incomplete' } },
    { patch: { q1: 'verified_no_progress' } },
    { patch: { q1: 'adverse' } },
  ],
  'state-2': [
    { patch: { q1: 'verified_no_progress' } },
    { patch: { q1: 'adverse' } },
    { patch: { q2: 'informal', fOutcome: 'pending' } },
  ],
  'state-3': [
    { patch: { q2: 'informal', fOutcome: 'pending' } },
    { patch: { q1: 'adverse' } },
  ],
  'state-4': [
    { patch: { q2: 'informal', fOutcome: 'pending' } },
  ],
  'state-5a-p': [
    { pendingPatch: { fOutcome: 'resolved' } },
    { patch: { fOutcome: 'unhelpful' } },
    { patch: { fOutcome: 'no_response' } },
  ],
  'state-5a-r': [
    { patch: { fOutcome: null } },
  ],
  'state-5b-r': [
    { patch: { gOutcome: null } },
  ],
  'state-dpg-r': [
    {},
  ],
  'state-5a': [
    { patch: { q2: 'formal_grievance', gOutcome: 'pending' } },
  ],
  'state-5b-p': [
    { pendingPatch: { gOutcome: 'resolved' } },
    { patch: { gOutcome: 'unhelpful' } },
    { patch: { gOutcome: 'no_response' } },
  ],
  'state-5b': [
    { patch: { dpgFiled: 'yes' } },
  ],
  'state-dpg-p': [
    { pendingPatch: { dpgOutcome: 'resolved' } },
    {},
  ],
  'v-1': [
    { patch: { voterQ1: 'blo_visited' } },
    {
      rejectPatch: { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' },
      acceptPendingPatch: { voterQ1: 'decision', voterOutcome: 'accepted_pending' },
    },
  ],
  'v-2': [
    {
      rejectPatch: { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' },
      acceptPendingPatch: { voterQ1: 'decision', voterOutcome: 'accepted_pending' },
    },
  ],
  'v-3': [
    { patch: { voterAppealedRaw: 'pending', voterAppealed: 'pending' } },
    { pendingPatch: { voterOutcome: 'accepted_pending' } },
  ],
  'v-4': [
    {
      rejectPatch: { voterAppealedRaw: 'decided', voterAppealed: 'decided' },
      acceptPendingPatch: { voterOutcome: 'accepted_pending' },
    },
  ],
  'v-5': [
    { patch: { ceoAppeal: 'filed' } },
  ],
  'v-5-p': [
    { rejectDeadend: true, acceptPendingPatch: { voterOutcome: 'accepted_pending' } },
  ],
  'v-acc': [
    { patch: { voterOutcome: null } },
  ],
  'S-1': [
    { patch: { sirQ1: 'notice' } },
  ],
  'S-2': [
    { patch: { sirQ1: 'roll_present' } },
    { patch: { sirQ1: 'roll_absent' } },
  ],
  'S-3': [
    { patch: { form6Filed: 'yes' } },
  ],
  'S-4': [
    { patch: { sirDocsFiled: 'yes' } },
  ],
  // 'S-6' is absent: its check-in moved to sirDormantRules_enumeration when
  // the enumeration phase closed (17.08.2026), and that content is not ported.
  'S-9': [
    { patch: { sirQ1: 'final_present' } },
    { patch: { sirQ1: 'final_absent' } },
  ],
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/checkinPatches.test.ts` — Expected: PASS (45 tests).
Run: `npx vitest run` — Expected: the whole suite green: C1's 50 plus C2's 222, 272 total.
Run: `npm run build` — Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/domain/checkinPatches.ts src/domain/checkinPatches.test.ts
git commit -m "feat(c2): check-in patch payloads + post-patch diagnosis assertions

Splits the prototype's CHECKIN table along its real seam: the patch payloads
are rule-keyed data and ship here, asserted with C1's applyEvent + diagnose;
labels, option kinds, valence branching, closure and dead-ends stay C5's.
Closes §7's 'check-in post-patch assertions' guardrail for the 11 C2 rules
reachable only through a check-in, including the unhelpful / no_response /
null-deletion transitions no earlier test exercised.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DQXZbJ4FPS3h8QdTwfCaf8"
```

## Out of Scope for C2 (do not build these)

Per `NextMove_Implementation_Plan_FINAL.md` §9's build sequence:

- **Visual system, shared Diagnosis/Next Move templates, question screens, routing, recovery flow, trust disclosure, restart confirm → C3.** C2 ships the data those screens render and nothing that renders it. The §8 coverage-boundary **spy** test ("selecting an unsupported SIR state never calls `sirPlaybook.evaluate()`, verified via a spy") also lands in C3, once a router exists to spy on — C2's `sirCoverage` tests pin the verdict, but only a router can prove the verdict is consulted before evaluation.
- **The §7 token perceptual-distance floor → C3.** This is a *mechanical guardrail test*, and §9 assigns "the full mechanical guardrail suite" to C2, so its omission here is deliberate and is recorded permanently rather than left as an open question. The test requires a colour-token system that does not exist until C3's visual system; writing a stub against tokens that do not exist would ship a green test that proves nothing. **C3 owns it, and C3 must not consider its visual system done without it.**
- **`PREP` (draft templates + guided-submission steps), `VISIT_EXPECT`, official-channel cards → C4.** These are keyed by rule id and read `PREP[d.ruleId]`, so C2's rule ids are their join key; the content itself is C4's.
- **Check-in `label`s and option `k` kinds, `prepAware`, valence branching, closure / dead-end / reopen, casefiles, persistence, undo, phase-drift handling → C5.** The *patch payloads* under that table are not deferred: they ship in Task 8 as `CHECKIN_PATCHES`, with post-patch diagnosis assertions. C5 layers the UI and session halves on top of that data.
- **The freshness job itself → C6.** C2 shapes the data for it (`SourceReference.docId` resolves to the manifest document that carries `sha256`/`check`/`degraded`), and deliberately builds nothing that reads a degraded flag. C6 also owns actually flipping `SIR_STATES.delhi.phase` to `final_roll`; Task 6 already proves the guardrail suite stays clean under that phase before the flip happens.
- **Auth → C7. Describe-it, its gate contract, and the Aadhaar-refusal extraction test → C8.**

## Rulings applied before execution (was: open scoping questions)

Five items where §7 or the source material was genuinely ambiguous. All five were ruled on before any of this plan executed; the rulings are recorded here so the reasoning survives, and each is already reflected in the task text above.

1. **Token perceptual-distance floor → C3.** The plan's default was confirmed. Moved out of this list and into the permanent "Out of Scope for C2 → C3" list above, so the deferral survives the deletion of this section rather than disappearing with it.

2. **Retired-action-noun scan → rule copy only, for now.** The plan's default was confirmed, with the scope stated honestly rather than implied complete. Task 3's design note and its commit message now say the scan runs "over rule copy; C4 and C5 extend the input". Handoff notes for **both** C4 (prepare steps) and C5 (check-in labels) say they extend the harness's `CopyString[]` input rather than fork it — the same instruction C3 already carries for screen copy and for the token guardrail.

3. **`CHECKIN` option sets → SPLIT, not deferred whole. New Task 8.** The prototype's table has two separable halves. UI/session mechanics (`label`, `k` kind, `prepAware`, valence branching, closure, dead-ends, universal options) are C5's and stay deferred. **Patch payloads** (`patch` / `pendingPatch` / `acceptPendingPatch` / `rejectPatch` / `rejectDeadend`) are pure rule-keyed data and are fully assertable now with C1's already-shipped `applyEvent` + `diagnose` — no session, no screen. 11 of C2's 28 rules are reachable only through a check-in patch, so that data already ships in C2; what was missing was the proof, and the existing tests never exercised the `unhelpful` / `no_response` / `null`-deletion outcomes, which are the real "the ladder climbs, never descends" transitions. Task 8 closes §7's "check-in post-patch assertions" guardrail for everything C2 ships.

4. **Aadhaar refusal → C8.** The plan's default was confirmed: no playbook-level Aadhaar test, because one that only proved "no rule asks for an Aadhaar number" would give false comfort about a chip/fill/persist path that does not exist yet. Recorded for whoever writes C8's test: **`s-notice.needList[11]` legitimately reads `"Aadhaar (per the specific 2025 ECI direction)"`.** That is an ECI-*prescribed document name*, verified verbatim at CEO Delhi FAQ Q23 — it is not a request for an Aadhaar *number* and not a violation. C8's refusal test must not trip on it, and any scan C8 writes must distinguish "names the document" from "collects the value".

5. **Manifest vs. rule conflicts → the rule wins; the manifest is corrected.** Confirmed, and independently re-verified against the committed source text rather than settled as a policy call: the grievance page's DPG paragraph and `Citizens_Charter.pdf`'s Grievance Redressal section are different passages backing different rungs, and the shipped rules quote the right ones. There are **three** such mismatches, not two, and all three are resolved this way in Task 1 Step 7: the `state-dpg` → `state-dpg-p` rename (b), the `state-5b` Charter → grievance-page repoint (b2), and `s-5-dormant-final-roll`'s `verified` → `dormant` correction (b3), which is the one the first draft of this plan missed entirely and which would have failed Task 2's citation test and Task 7's cross-playbook sweep as written.

## Recorded deviations from the locked prototype (decided, not open)

Listed the way C1 listed its own, so a reviewer can find them without reading the tasks.

- **`v-4` is exempt from the cause-state disclaimer requirement** (Task 3). §7 groups it with the adverse/unclear states, but `v-4` is "appeal filed, decision pending" — a WAIT state with no adverse finding to explain. It keeps the `mustNot` requirement and the causal-pattern ban.
- **`BANNED_PATTERNS` gains one row and two metadata fields** (Task 3). The added row catches the hyphenated interval form (`"15-day"`) the lifted interval row misses. Every row also gains an `id` (so an exemption can name the one pattern it exempts) and, on the two day-count rows, `interval: true` (so they compose with the manifest allowlist). **Every `pattern` and every `reason` from the original seven rows is byte-for-byte unchanged.**
- **The two day-count patterns compose with `sourced_intervals` instead of being exempted** (Task 3). Executed over the real corpus, the lifted table matches 12 times: 5 reviewed exemptions and 7 legitimate sourced 15-day references. Adding those 7 to the exemption table was rejected — it would make the guardrail a hand-maintained allowlist of exactly the copy it polices — so `bannedFindings` defers to `numericFindings`' manifest lookup for interval matches.
- **Safety exemptions are scoped to one location AND one named pattern** (Task 3), not to a whole location. The five reviewed exemptions are four `deadline` matches on verified-*absence* statements and one `causal` match on `"as your notice directs"`.
- **Every copy location is addressed `serviceId:ruleId.field`** (Global Constraints; Tasks 1, 3, 6). Without the prefix the three fallbacks collide on `fallback.explanation` and the last playbook in a cross-playbook sweep silently wins. The manifest's `allowed_in` entries and `SAFETY_EXEMPTIONS.at` values carry the same prefix.
- **`loadSourceText` refuses a document whose `extracted_text` is explicitly `null`** (Task 1). `?? file` treated null as present, which does not throw — it silently reads ~320KB of PDF bytes as UTF-8 and fails every downstream quote check for the wrong reason.
- **`SourceReference` gains a required `docId`** (Task 1), touching `src/domain/types.ts` and seven toy fixtures in four C1 test files. No C1 behavior changes.
- **C1's "toy fixtures must be obviously fake" rule has one scoped exception** (Global Constraints): C2's guardrail tests use real rule ids and real `docId`s inside toy playbooks, because a harness proven only against invented ids proves nothing about the real manifest. Every fixture *string* stays obviously fake.
- **`s-notice`'s `need` splits into `need` + `needList`** (Task 6). The `<ul>` markup does not ship.
- **The dormant `s-duplicate` content is not ported** (Task 6). The manifest's `dormant` entry is the surviving record; the prototype's `sirDormantRules_enumeration` object is prototype-only archaeology.
- **`CHECKIN` is split along its data/UI seam** (Task 8). Patch payloads ship as `CHECKIN_PATCHES`; labels, kinds, `prepAware`, valence branching, closure and dead-ends stay C5's. `S-6`'s check-in is not ported, matching the dormant `s-duplicate` rule.

## Handoff notes for C3 (recorded now so they aren't rediscovered)

- **Question-screen answer values are fixed by the rule conditions** and must not be renamed: passport `q1 ∈ {no_contact, contacted_incomplete, verified_no_progress, adverse, not_sure}`, `q2 ∈ {no_followup, informal, formal_grievance}`; voter `voterQ1 ∈ {no_word, blo_visited, decision, unclassified}`, `voterAppealed ∈ {none, pending, decided, unclassified}`; SIR `sirQ1` from `SIR_Q1_OPTIONS_FOR[phase]` plus `unclassified`.
- **The raw→normalized voter transform is C3's**: the screen writes `voterAppealedRaw` with the picked option (including `notsure`) and `voterAppealed` with `notsure` normalized to `unclassified`. `VOTER_DEPS` already clears both on a Q1 change. The same `notsure → unclassified` normalization applies to `voterQ1` and `sirQ1`.
- **`"I'm not sure"` is appended to SIR Q1 outside the phase option set** — `optionsForPhase` returns only the phase's own options, by design.
- **Question label maps are C3's, not C2's**: `PASSPORT_Q1_LABELS`, `PASSPORT_Q2_LABELS`, `VOTER_Q1_LABELS`, `VOTER_APPEAL_LABELS` live in the prototype at lines 3229–3235, 3408–3412 and 3466–3477. Only the SIR Q1 option labels ship in C2, because phase-gating makes them structural.
- **Renderers must prefer `needList` over `need` when present** and must never inject markup from a data field.
- **`PASTE_MATCH_EXAMPLES`** (prototype ~3297) is the authority for the recovery flow's paste matching — exact normalized matching, never the retired bare-substring `'verif'` match.
- **C3 extends the guardrail input, it does not fork the harness**: `runGuardrailSuite(playbook, { extra })` takes any `CopyString[]`, so screen copy joins the same scan. Screen copy locations must carry a `serviceId:` (or an equally unambiguous) prefix, like every other `CopyString.at`.
- **C3 owns the §7 token perceptual-distance floor**, which C2 could not write against tokens that did not exist. See "Out of Scope".

## Handoff notes for C4

- **C4 extends the retired-action scan's input, it does not fork the harness.** Prepare steps are the second third of §7's declared surface for that scan ("every reachable rule's copy, prepare steps, and check-in labels"). `retiredActionFindings` and `runGuardrailSuite(playbook, { extra })` already accept a `CopyString[]`; C4 passes its prepare-step copy in, addressed the same `serviceId:ruleId.field` way, rather than writing a second scanner.
- `PREP` is keyed by rule id, so C2's 28 rule ids are its join key. They are stable and are asserted globally unique in Task 7.

## Handoff notes for C5

- **`CHECKIN_PATCHES` (Task 8) is the data C5 builds on, not a draft C5 replaces.** C5 layers the prototype's `label`, `k` kind, `prepAware`, valence branching, closure/dead-end handling and the universal options ("Nothing yet", the deliverable, "Something else happened") on top of it, and **extends** Task 8's post-patch assertions rather than re-authoring them from scratch.
- **Keep the prototype's lookup order:** `CHECKIN_PATCHES[d.state] ?? CHECKIN_PATCHES[d.ruleId]` (prototype line 2599). The keys are deliberately a mix of rule ids and state ids because the prototype's are.
- **Two options carry no payload at all** — `state-dpg-r[0]` and `state-dpg-p[1]` — because both are dead ends at the top of the verified passport ladder. C5 supplies the closure behavior; the absence of a patch is intentional and is pinned by a test.
- **`v-5-p`'s valence option carries `rejectDeadend: true`** and no `rejectPatch`, for the same reason: the state CEO is the final tier.
- **C5 extends the retired-action scan's input, it does not fork the harness.** Check-in labels are the last third of §7's declared surface for that scan. Pass them in as `CopyString[]`, addressed the same way.
