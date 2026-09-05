# C1 — Engine + Answer Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build NextMove's production diagnosis engine and answer model (chunk C1 of `NextMove_Implementation_Plan_FINAL.md` §9) as pure, fully-tested TypeScript — the keyed answer record, `evaluate()`, the two write paths, the stage·rung decorator, and phase-gated option derivation — replacing the superseded Slice-1 domain layer.

**Architecture:** Everything in this chunk is data + pure functions under `src/domain/` — zero React, zero DOM, zero playbook *content*. The design authority is the locked prototype `design/nextmove-v1-prototype.html` (git tag `v1-design-lock-2`); every function in this plan is a typed translation of a mechanism that prototype already implements and verified live. Real playbook rules/copy arrive in chunk C2 — this chunk's tests use small toy fixtures only.

**Tech Stack:** TypeScript (strict), Vitest. No new dependencies.

## Global Constraints

- The keyed answer model is **`Record<string, string>`** — never an ordered array. (Implementation plan §2; the old Slice-1 `Answer[]` model is superseded.)
- Government-process rules never live in components or engine code — the engine only evaluates rule data given to it. Toy fixtures in tests must be obviously fake (`'toy-1'`, `'Toy dependency'`), never plausible-sounding government copy. Never invent rule content, deadlines, or process claims in this chunk.
- Every playbook evaluation is **first-match-wins over ordered rules**, with exactly one fallback path (UNCLASSIFIED, `ruleId: null`).
- `Diagnosis` is always derived fresh from answers via `evaluate()`/`diagnose()` — never stored as mutable state.
- TypeScript strict mode stays on; `npm run build` (`tsc -b && vite build`) must pass at the end of every task.
- Run tests with `npx vitest run <path>` (Task 1 adds a `"test"` script; after that `npm test -- <path>` also works).
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
    types.ts          (REWRITE — v2 domain types, keyed answer record)
    evaluate.ts       (NEW — evaluate(): first-match-wins + fallback)
    evaluate.test.ts  (NEW)
    answers.ts        (NEW — applyCorrection / applyEvent write paths)
    answers.test.ts   (NEW)
    stageRung.ts      (NEW — decorateStageRung composite-label decorator)
    stageRung.test.ts (NEW)
    sirConfig.ts      (NEW — SirPhase/SirStateConfig, optionsForPhase, sirRoute)
    sirConfig.test.ts (NEW)
    engine.ts         (NEW — ServiceEngine + diagnose() composition)
    engine.test.ts    (NEW)
  App.tsx             (REWRITE — minimal placeholder shell until C3)
  main.tsx            (unchanged)
  index.css           (unchanged)
  test/setup.ts       (unchanged)
```

**Deleted in Task 1** (superseded Slice-1 code — preserved in git history at `91ff7a1`; the locked prototype, not this code, is the design authority): all of `src/components/`, `src/domain/playbook.ts`, `src/domain/playbook.test.ts`, `src/playbooks/` (old `passportPlaybook`, `matchStatusText`, `contentSafety` tests — all rebuilt against the v2 model in C2), `src/state/` (old `caseSession` — rebuilt in C5), `src/App.test.tsx`.

---

### Task 1: Clear the deck — remove superseded Slice-1 code, keep the build green

**Files:**
- Delete: `src/components/` (entire directory), `src/domain/playbook.ts`, `src/domain/playbook.test.ts`, `src/playbooks/` (entire directory), `src/state/` (entire directory), `src/App.test.tsx`
- Modify: `src/App.tsx`, `package.json`
- Test: build + full remaining suite

**Interfaces:**
- Consumes: nothing.
- Produces: a repo where `npm run build` and `npx vitest run` both pass with the old domain gone, ready for the v2 domain. `src/domain/types.ts` still exists (old content) and is rewritten in Task 2.

**Why this is safe:** the Slice-1 UI implements the pre-design-lock Ramp/Acctual visual world and the old `Answer[]` domain model, both explicitly superseded by the locked prototype (`v1-design-lock-2`). C2 rebuilds the playbooks and C3 rebuilds every screen from the locked design. Git history preserves all of it.

- [ ] **Step 1: Add the test script**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 2: Delete the superseded files**

```bash
git rm -r src/components src/playbooks src/state src/App.test.tsx src/domain/playbook.ts src/domain/playbook.test.ts
```

- [ ] **Step 3: Replace `src/App.tsx` with a minimal shell**

```tsx
// Minimal shell. The real screens are rebuilt in chunk C3 from the locked
// design prototype (design/nextmove-v1-prototype.html, tag v1-design-lock-2).
export default function App() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-neutral-500">
        NextMove — production build in progress (C1: engine).
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Verify build and suite pass**

Run: `npm run build` — Expected: success, no TS errors.
Run: `npx vitest run` — Expected: passes (zero or near-zero tests remaining is fine; no failures).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(c1): remove superseded Slice-1 UI and domain, minimal shell

Slice-1 (commit 5e62794) predates the design lock; the locked prototype
(v1-design-lock-2) is the design authority. Playbooks return in C2,
screens in C3, session/persistence in C5. History preserves the old code."
```

---

### Task 2: v2 domain types + `evaluate()`

**Files:**
- Rewrite: `src/domain/types.ts`
- Create: `src/domain/evaluate.ts`, `src/domain/evaluate.test.ts`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces (later tasks and C2 rely on these exact names):
  - `AnswerRecord = Record<string, string>`
  - `Recommendation = 'WAIT' | 'FOLLOW_UP' | 'ESCALATE'`, `Classification = Recommendation | 'UNCLASSIFIED'`
  - `OfficialChannel { label: string; url?: string; phone?: string }`
  - `SourceReference { title: string; url?: string; quote?: string }`
  - `PlaybookRule`, `FallbackDiagnosis`, `Diagnosis`, `Playbook` (below)
  - `evaluate(playbook: Playbook, answers: AnswerRecord): Diagnosis`

- [ ] **Step 1: Rewrite `src/domain/types.ts`**

```ts
// Domain types for the NextMove diagnosis engine, v2 (keyed answer model).
// Source of truth: the locked design prototype (design/nextmove-v1-prototype.html,
// tag v1-design-lock-2) and NextMove_Implementation_Plan_FINAL.md §2-§3.

/** Answers are a keyed record, never an ordered array: Voter/SIR follow-up
 *  question keys only exist depending on earlier answers, and check-in
 *  outcome keys (e.g. fOutcome) are answers too. */
export type AnswerRecord = Record<string, string>

export type Recommendation = 'WAIT' | 'FOLLOW_UP' | 'ESCALATE'
export type Classification = Recommendation | 'UNCLASSIFIED'

export interface OfficialChannel {
  label: string
  url?: string
  phone?: string
}

export interface SourceReference {
  title: string
  url?: string
  quote?: string
}

/** The content fields shared by every rule and the fallback — everything a
 *  Diagnosis/Next Move screen renders. All copy lives in playbook data (C2),
 *  never in engine code. */
export interface RuleContent {
  /** User-facing state id, e.g. "5a", "V-3", "S-4·W". */
  state: string
  label: string
  dependency: string
  explanation: string
  whatShort: string
  whatToDo: string
  where: OfficialChannel
  need?: string
  howLong?: string
  expectNext?: string
  source: SourceReference
  /** What this rule's copy must never assert — enforced by content tests (C2). */
  mustNot?: string
  /** Escalation-ladder rung label; presence enables stage·rung decoration. */
  rungLabel?: string
}

export interface PlaybookRule extends RuleContent {
  id: string
  rec: Recommendation
  condition: (answers: AnswerRecord) => boolean
}

export interface FallbackDiagnosis extends RuleContent {
  rec: 'UNCLASSIFIED'
}

export interface Diagnosis extends RuleContent {
  rec: Classification
  /** The matched rule's id, or null when the fallback fired. */
  ruleId: string | null
  /** Snapshot of the answers this diagnosis was computed from. */
  matchedAnswers: AnswerRecord
}

export interface Playbook {
  serviceId: string
  /** Ordered; evaluate() is first-match-wins. */
  rules: PlaybookRule[]
  fallback: FallbackDiagnosis
}
```

- [ ] **Step 2: Write the failing tests** (`src/domain/evaluate.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import type { Playbook, PlaybookRule } from './types'

const rule = (id: string, condition: PlaybookRule['condition'], rec: PlaybookRule['rec'] = 'WAIT'): PlaybookRule => ({
  id,
  condition,
  rec,
  state: `st-${id}`,
  label: `Toy label ${id}`,
  dependency: `Toy dependency ${id}`,
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  source: { title: 'Toy source' },
})

const toy: Playbook = {
  serviceId: 'toy',
  rules: [
    rule('toy-specific', a => a.k1 === 'x' && a.k2 === 'y', 'ESCALATE'),
    rule('toy-general', a => a.k1 === 'x', 'FOLLOW_UP'),
  ],
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'st-fallback',
    label: 'Toy unclear',
    dependency: 'Unknown',
    explanation: 'Toy fallback explanation.',
    whatShort: 'Toy check directly.',
    whatToDo: 'Toy check status directly.',
    where: { label: 'Toy portal' },
    source: { title: "Toy safety net" },
  },
}

describe('evaluate', () => {
  it('returns the first matching rule (order wins over later matches)', () => {
    const d = evaluate(toy, { k1: 'x', k2: 'y' })
    expect(d.ruleId).toBe('toy-specific')
    expect(d.rec).toBe('ESCALATE')
  })

  it('falls through to a later rule when earlier conditions fail', () => {
    const d = evaluate(toy, { k1: 'x' })
    expect(d.ruleId).toBe('toy-general')
    expect(d.rec).toBe('FOLLOW_UP')
  })

  it('returns the fallback with ruleId null when nothing matches', () => {
    const d = evaluate(toy, { k1: 'nope' })
    expect(d.ruleId).toBeNull()
    expect(d.rec).toBe('UNCLASSIFIED')
    expect(d.state).toBe('st-fallback')
  })

  it('returns the fallback for empty answers', () => {
    expect(evaluate(toy, {}).ruleId).toBeNull()
  })

  it('snapshots matchedAnswers as a copy, not a live reference', () => {
    const answers = { k1: 'x' }
    const d = evaluate(toy, answers)
    answers.k1 = 'mutated'
    expect(d.matchedAnswers).toEqual({ k1: 'x' })
  })

  it('does not leak the condition function onto the diagnosis', () => {
    const d = evaluate(toy, { k1: 'x' })
    expect('condition' in d).toBe(false)
    expect('id' in d).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/domain/evaluate.test.ts`
Expected: FAIL — `./evaluate` module not found.

- [ ] **Step 4: Implement `src/domain/evaluate.ts`**

```ts
import type { AnswerRecord, Diagnosis, Playbook } from './types'

/** First-match-wins over the playbook's ordered rules; exactly one fallback
 *  path (UNCLASSIFIED, ruleId null). Mirrors the locked prototype's
 *  evaluate() verbatim in behavior. */
export function evaluate(playbook: Playbook, answers: AnswerRecord): Diagnosis {
  for (const rule of playbook.rules) {
    if (rule.condition(answers)) {
      const { condition: _condition, id, ...content } = rule
      return { ...content, ruleId: id, matchedAnswers: { ...answers } }
    }
  }
  return { ...playbook.fallback, ruleId: null, matchedAnswers: { ...answers } }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/domain/evaluate.test.ts`
Expected: PASS (6 tests). Then `npm run build` — Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/evaluate.ts src/domain/evaluate.test.ts
git commit -m "feat(c1): v2 domain types (keyed AnswerRecord) + evaluate()"
```

---

### Task 3: Answer write paths — `applyCorrection` and `applyEvent`

**Files:**
- Create: `src/domain/answers.ts`, `src/domain/answers.test.ts`

**Interfaces:**
- Consumes: `AnswerRecord` from Task 2.
- Produces (C5's session layer and C3's question screens rely on these):
  - `DependentKeys = Record<string, string[]>` — per-service config mapping an answer key to the keys invalidated when it *changes* (e.g. passport `{ q1: ['q2'] }`; the real maps ship with the playbooks in C2).
  - `applyCorrection(answers, key, value, deps?): { answers: AnswerRecord; changed: boolean }` — pure; same-value is a no-op returning the same object.
  - `applyEvent(answers, patch): AnswerRecord` — pure merge; `null` deletes a key; never clears unrelated keys.

**Design notes (locked prototype behavior being translated):**
- *Correction path* = the citizen changed their mind about a question. Locked behavior: "changing Q1 after Q2 was answered clears Q2" — and a same-value re-tap must NOT clear anything (the "same-vs-changed check", a previously-regressed locked fix). Clearing is transitive through the deps map, cycle-safe.
- *Event path* = a check-in reported something new happening in the world (`updateAns` in the prototype): facts always survive; keys merge in; `null` in a patch deletes that key (used when a check-in consumes an outcome key). It never touches keys outside the patch.

- [ ] **Step 1: Write the failing tests** (`src/domain/answers.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { applyCorrection, applyEvent } from './answers'

describe('applyCorrection', () => {
  const deps = { q1: ['q2'], q2: ['q3'] }

  it('sets a new answer and reports changed', () => {
    const r = applyCorrection({}, 'q1', 'a', deps)
    expect(r.changed).toBe(true)
    expect(r.answers).toEqual({ q1: 'a' })
  })

  it('is a no-op when the value is unchanged (same object back, nothing cleared)', () => {
    const answers = { q1: 'a', q2: 'b' }
    const r = applyCorrection(answers, 'q1', 'a', deps)
    expect(r.changed).toBe(false)
    expect(r.answers).toBe(answers)
    expect(r.answers.q2).toBe('b')
  })

  it('clears dependent keys when the value changes', () => {
    const r = applyCorrection({ q1: 'a', q2: 'b' }, 'q1', 'c', deps)
    expect(r.answers).toEqual({ q1: 'c' })
  })

  it('clears transitively through the deps chain', () => {
    const r = applyCorrection({ q1: 'a', q2: 'b', q3: 'c' }, 'q1', 'z', deps)
    expect(r.answers).toEqual({ q1: 'z' })
  })

  it('survives a cyclic deps map without hanging', () => {
    const cyclic = { a: ['b'], b: ['a'] }
    const r = applyCorrection({ a: '1', b: '2' }, 'a', '9', cyclic)
    expect(r.answers).toEqual({ a: '9' })
  })

  it('leaves unrelated keys alone', () => {
    const r = applyCorrection({ q1: 'a', other: 'keep' }, 'q1', 'c', deps)
    expect(r.answers.other).toBe('keep')
  })

  it('does not mutate the input record', () => {
    const answers = { q1: 'a', q2: 'b' }
    applyCorrection(answers, 'q1', 'c', deps)
    expect(answers).toEqual({ q1: 'a', q2: 'b' })
  })

  it('works with no deps map given', () => {
    const r = applyCorrection({ q1: 'a' }, 'q1', 'b')
    expect(r.answers).toEqual({ q1: 'b' })
  })
})

describe('applyEvent', () => {
  it('merges new keys without touching existing ones', () => {
    const next = applyEvent({ q1: 'a', q2: 'b' }, { fOutcome: 'pending' })
    expect(next).toEqual({ q1: 'a', q2: 'b', fOutcome: 'pending' })
  })

  it('overwrites a key present in the patch', () => {
    const next = applyEvent({ fOutcome: 'pending' }, { fOutcome: 'resolved' })
    expect(next.fOutcome).toBe('resolved')
  })

  it('deletes a key when the patch value is null', () => {
    const next = applyEvent({ q1: 'a', fOutcome: 'resolved' }, { fOutcome: null })
    expect(next).toEqual({ q1: 'a' })
  })

  it('applies multi-key patches atomically', () => {
    const next = applyEvent({ q1: 'a' }, { fOutcome: null, gOutcome: 'pending' })
    expect(next).toEqual({ q1: 'a', gOutcome: 'pending' })
  })

  it('does not mutate the input record', () => {
    const answers = { q1: 'a' }
    applyEvent(answers, { q1: 'b' })
    expect(answers.q1).toBe('a')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/answers.test.ts`
Expected: FAIL — `./answers` module not found.

- [ ] **Step 3: Implement `src/domain/answers.ts`**

```ts
import type { AnswerRecord } from './types'

/** Per-service map: answer key -> keys invalidated when that answer CHANGES.
 *  Real maps ship with the playbooks (C2); the engine only walks the map. */
export type DependentKeys = Record<string, string[]>

/** Correction path: the citizen changed their mind about a question.
 *  Same value = strict no-op (same object back; nothing cleared).
 *  Changed value = set it and clear dependent keys, transitively, cycle-safe. */
export function applyCorrection(
  answers: AnswerRecord,
  key: string,
  value: string,
  deps: DependentKeys = {},
): { answers: AnswerRecord; changed: boolean } {
  if (answers[key] === value) return { answers, changed: false }
  const next: AnswerRecord = { ...answers, [key]: value }
  const visited = new Set<string>()
  const queue = [...(deps[key] ?? [])]
  while (queue.length > 0) {
    const k = queue.shift()!
    if (visited.has(k)) continue
    visited.add(k)
    delete next[k]
    queue.push(...(deps[k] ?? []))
  }
  return { answers: next, changed: true }
}

/** Event path (a check-in reported the world moved): pure merge. null deletes
 *  a key (an outcome consumed); keys outside the patch are never touched. */
export function applyEvent(
  answers: AnswerRecord,
  patch: Record<string, string | null>,
): AnswerRecord {
  const next: AnswerRecord = { ...answers }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]
    else next[k] = v
  }
  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/answers.test.ts`
Expected: PASS (13 tests). Then `npm run build` — Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/domain/answers.ts src/domain/answers.test.ts
git commit -m "feat(c1): answer write paths — applyCorrection (clears dependents) + applyEvent (merge)"
```

---

### Task 4: Stage·rung decorator

**Files:**
- Create: `src/domain/stageRung.ts`, `src/domain/stageRung.test.ts`

**Interfaces:**
- Consumes: `Diagnosis`, `AnswerRecord` from Task 2.
- Produces (C2's passport engine config relies on this):
  - `decorateStageRung(d: Diagnosis, stageShort: Record<string, string>, stageKey: string): Diagnosis`

**Design notes:** translates the prototype's `decoratePassport` exactly: when the matched rule carries a `rungLabel` AND the stage map has a label for `matchedAnswers[stageKey]`, the diagnosis label becomes `"{stage} · {rung}"`. Base states (no `rungLabel`) and unknown stage values keep their original label untouched. The map contents (`PASSPORT_STAGE_SHORT`) are playbook data — C2.

- [ ] **Step 1: Write the failing tests** (`src/domain/stageRung.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { decorateStageRung } from './stageRung'
import type { Diagnosis } from './types'

const base = (over: Partial<Diagnosis>): Diagnosis => ({
  rec: 'FOLLOW_UP',
  ruleId: 'toy-1',
  matchedAnswers: {},
  state: 'st-1',
  label: 'Original label',
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  source: { title: 'Toy source' },
  ...over,
})

const stages = { stage_a: 'Stage A short', stage_b: 'Stage B short' }

describe('decorateStageRung', () => {
  it('composes "{stage} · {rung}" when both exist', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'stage_a' } })
    expect(decorateStageRung(d, stages, 'q1').label).toBe('Stage A short · rung one')
  })

  it('same rung under a different stage yields a distinct label', () => {
    const d1 = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'stage_a' } })
    const d2 = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'stage_b' } })
    expect(decorateStageRung(d1, stages, 'q1').label)
      .not.toBe(decorateStageRung(d2, stages, 'q1').label)
  })

  it('leaves the label untouched when the rule has no rungLabel', () => {
    const d = base({ matchedAnswers: { q1: 'stage_a' } })
    expect(decorateStageRung(d, stages, 'q1')).toBe(d)
  })

  it('leaves the label untouched when the stage key has no mapped label', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'unknown' } })
    expect(decorateStageRung(d, stages, 'q1')).toBe(d)
  })

  it('leaves the label untouched when the stage key is unanswered', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: {} })
    expect(decorateStageRung(d, stages, 'q1')).toBe(d)
  })

  it('does not mutate the input diagnosis', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'stage_a' } })
    decorateStageRung(d, stages, 'q1')
    expect(d.label).toBe('Original label')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/stageRung.test.ts`
Expected: FAIL — `./stageRung` module not found.

- [ ] **Step 3: Implement `src/domain/stageRung.ts`**

```ts
import type { Diagnosis } from './types'

/** Stage·rung composite labels (passport ladder): when the matched rule
 *  carries a rungLabel AND the stage map labels the citizen's stage answer,
 *  compose "{stage} · {rung}". Otherwise return the diagnosis unchanged
 *  (same object — callers may rely on identity for "no decoration"). */
export function decorateStageRung(
  d: Diagnosis,
  stageShort: Record<string, string>,
  stageKey: string,
): Diagnosis {
  const stageValue = d.matchedAnswers[stageKey]
  const stage = stageValue !== undefined ? stageShort[stageValue] : undefined
  if (d.rungLabel && stage) {
    return { ...d, label: `${stage} · ${d.rungLabel}` }
  }
  return d
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/stageRung.test.ts`
Expected: PASS (6 tests). Then `npm run build` — Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/domain/stageRung.ts src/domain/stageRung.test.ts
git commit -m "feat(c1): stage-rung composite-label decorator"
```

---

### Task 5: SIR phase gating — `SirStateConfig`, `optionsForPhase`, `sirRoute`

**Files:**
- Create: `src/domain/sirConfig.ts`, `src/domain/sirConfig.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone config layer).
- Produces (C2's SIR playbook data and C3's SIR screens rely on these):
  - `SirPhase { id: string; label: string; note: string }`
  - `SirStateConfig { id: string; name: string; supported: boolean; phase?: SirPhase }`
  - `optionsForPhase<T>(state: SirStateConfig, optionsByPhase: Record<string, T>): T` — throws on unsupported states or unconfigured phases (impossible options are structurally absent, not filtered).
  - `sirRoute(state: SirStateConfig): 'sir-q1' | 'sir-unsupported'` — the structural coverage gate: an unsupported state can never reach the playbook, by construction.

**Design notes:** the locked prototype's coverage boundary is structural — `sirStateAnswer()` only routes to SIR Q1 when `supported === true`, so `sirPlaybook` is unreachable for Bihar/Maharashtra/UP/other. Phase-gating means SIR Q1's options are *generated* from the state's current verified phase (`SIR_Q1_OPTIONS_FOR[phase.id]`), so an option belonging to a past or future phase is never offered. The extensibility promise (implementation plan §8): flipping a state's configured phase changes exactly which option set is offered, with zero engine changes.

- [ ] **Step 1: Write the failing tests** (`src/domain/sirConfig.test.ts`)

```ts
import { describe, it, expect, vi } from 'vitest'
import { optionsForPhase, sirRoute, type SirStateConfig, type SirPhase } from './sirConfig'

const phaseA: SirPhase = { id: 'phase_a', label: 'Toy phase A', note: 'Toy note A.' }
const phaseB: SirPhase = { id: 'phase_b', label: 'Toy phase B', note: 'Toy note B.' }

const supported: SirStateConfig = { id: 'toyland', name: 'Toyland', supported: true, phase: phaseA }
const unsupported: SirStateConfig = { id: 'elsewhere', name: 'Elsewhere', supported: false }

const optionsByPhase = {
  phase_a: { opt1: 'Toy option 1', opt2: 'Toy option 2' },
  phase_b: { opt3: 'Toy option 3' },
}

describe('optionsForPhase', () => {
  it("returns exactly the current phase's option set", () => {
    expect(optionsForPhase(supported, optionsByPhase)).toEqual(optionsByPhase.phase_a)
  })

  it('flipping the configured phase swaps the option set with zero other changes', () => {
    const advanced: SirStateConfig = { ...supported, phase: phaseB }
    expect(optionsForPhase(advanced, optionsByPhase)).toEqual(optionsByPhase.phase_b)
  })

  it('throws for an unsupported state (options are structurally absent)', () => {
    expect(() => optionsForPhase(unsupported, optionsByPhase)).toThrow(/unsupported/i)
  })

  it('throws for a phase with no configured options', () => {
    const misconfigured: SirStateConfig = {
      ...supported,
      phase: { id: 'phase_missing', label: 'Toy', note: 'Toy.' },
    }
    expect(() => optionsForPhase(misconfigured, optionsByPhase)).toThrow(/phase_missing/)
  })
})

describe('sirRoute (structural coverage gate)', () => {
  it('routes a supported state to SIR Q1', () => {
    expect(sirRoute(supported)).toBe('sir-q1')
  })

  it('routes an unsupported state to the coverage-boundary screen', () => {
    expect(sirRoute(unsupported)).toBe('sir-unsupported')
  })

  it('a supported state missing its phase config is treated as unsupported, never diagnosed', () => {
    const broken: SirStateConfig = { id: 'broken', name: 'Broken', supported: true }
    expect(sirRoute(broken)).toBe('sir-unsupported')
  })

  it('the unsupported path can never invoke a playbook evaluation', () => {
    // The gate is structural: given the route, the caller never calls
    // evaluate. This test encodes the contract the C3 router must keep.
    const evaluateSpy = vi.fn()
    const route = sirRoute(unsupported)
    if (route === 'sir-q1') evaluateSpy()
    expect(evaluateSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/sirConfig.test.ts`
Expected: FAIL — `./sirConfig` module not found.

- [ ] **Step 3: Implement `src/domain/sirConfig.ts`**

```ts
/** A verified SIR phase a state can be in. Phases constrain which question
 *  options are even offered — impossible options are structurally absent,
 *  not filtered after the fact. Real phase/state data ships in C2. */
export interface SirPhase {
  id: string
  label: string
  /** Context note shown on the Diagnosis screen. */
  note: string
}

export interface SirStateConfig {
  id: string
  name: string
  /** false routes to the coverage-boundary screen, never to the playbook. */
  supported: boolean
  /** Required when supported; its id selects the offered option set. */
  phase?: SirPhase
}

/** Derive the question options for a state's current verified phase.
 *  Throws (rather than returning something) for unsupported/misconfigured
 *  states: callers must gate on sirRoute() first, so reaching this without
 *  a phase is a programming error, not a user state. */
export function optionsForPhase<T>(
  state: SirStateConfig,
  optionsByPhase: Record<string, T>,
): T {
  if (!state.supported || !state.phase) {
    throw new Error(`unsupported SIR state: ${state.id}`)
  }
  const options = optionsByPhase[state.phase.id]
  if (options === undefined) {
    throw new Error(`no options configured for phase: ${state.phase.id}`)
  }
  return options
}

/** The structural coverage gate: only a supported state with a verified
 *  phase calendar ever reaches SIR Q1 (and therefore the SIR playbook).
 *  Everything else gets the honest coverage-boundary screen. */
export function sirRoute(state: SirStateConfig): 'sir-q1' | 'sir-unsupported' {
  return state.supported && state.phase ? 'sir-q1' : 'sir-unsupported'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/sirConfig.test.ts`
Expected: PASS (8 tests). Then `npm run build` — Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sirConfig.ts src/domain/sirConfig.test.ts
git commit -m "feat(c1): SIR phase gating + structural coverage gate (sirRoute)"
```

---

### Task 6: `ServiceEngine` + `diagnose()` composition

**Files:**
- Create: `src/domain/engine.ts`, `src/domain/engine.test.ts`

**Interfaces:**
- Consumes: `evaluate` (Task 2), `Diagnosis`, `Playbook`, `AnswerRecord` (Task 2).
- Produces (C2 defines the three real engines with this exact shape; C3+ call `diagnose`):
  - `ServiceEngine { key: string; playbook: Playbook; decorate?: (d: Diagnosis) => Diagnosis; unclassifiedKey?: string }`
  - `diagnose(engine: ServiceEngine, answers: AnswerRecord): Diagnosis`

**Design notes:** translates the prototype's `currentDiagnosis()`: (1) an explicit "I'm not sure" (`answers[unclassifiedKey] === 'unclassified'`) short-circuits straight to the fallback — this must win even when stale check-in outcome keys would otherwise match a rule first; (2) the service's decorator (stage·rung for passport) applies after evaluation; (3) diagnosis is always computed fresh — `diagnose` is pure.

- [ ] **Step 1: Write the failing tests** (`src/domain/engine.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { diagnose, type ServiceEngine } from './engine'
import type { Playbook, PlaybookRule, Diagnosis } from './types'

const rule = (id: string, condition: PlaybookRule['condition']): PlaybookRule => ({
  id,
  condition,
  rec: 'WAIT',
  state: `st-${id}`,
  label: `Toy label ${id}`,
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  source: { title: 'Toy source' },
})

const toy: Playbook = {
  serviceId: 'toy',
  rules: [
    rule('toy-outcome', a => a.someOutcome === 'yes'),
    rule('toy-q1', a => a.q1 === 'a'),
  ],
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'st-fallback',
    label: 'Toy unclear',
    dependency: 'Unknown',
    explanation: 'Toy fallback.',
    whatShort: 'Toy check directly.',
    whatToDo: 'Toy check status.',
    where: { label: 'Toy portal' },
    source: { title: 'Toy safety net' },
  },
}

describe('diagnose', () => {
  it('evaluates the playbook for ordinary answers', () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy }
    expect(diagnose(engine, { q1: 'a' }).ruleId).toBe('toy-q1')
  })

  it("short-circuits to the fallback when the unclassified key says 'unclassified'", () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy, unclassifiedKey: 'q1' }
    const d = diagnose(engine, { q1: 'unclassified' })
    expect(d.ruleId).toBeNull()
    expect(d.rec).toBe('UNCLASSIFIED')
  })

  it('the short-circuit beats a rule that stale outcome keys would match first', () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy, unclassifiedKey: 'q1' }
    const d = diagnose(engine, { q1: 'unclassified', someOutcome: 'yes' })
    expect(d.ruleId).toBeNull()
  })

  it('without an unclassifiedKey, the literal value just falls through to the fallback via evaluate', () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy }
    expect(diagnose(engine, { q1: 'unclassified' }).ruleId).toBeNull()
  })

  it('applies the decorator after evaluation', () => {
    const decorate = (d: Diagnosis): Diagnosis => ({ ...d, label: `decorated: ${d.label}` })
    const engine: ServiceEngine = { key: 'toy', playbook: toy, decorate }
    expect(diagnose(engine, { q1: 'a' }).label).toBe('decorated: Toy label toy-q1')
  })

  it('does not apply the decorator to the short-circuit fallback', () => {
    const decorate = (d: Diagnosis): Diagnosis => ({ ...d, label: 'decorated' })
    const engine: ServiceEngine = { key: 'toy', playbook: toy, decorate, unclassifiedKey: 'q1' }
    expect(diagnose(engine, { q1: 'unclassified' }).label).toBe('Toy unclear')
  })

  it('carries matchedAnswers on the short-circuit fallback too', () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy, unclassifiedKey: 'q1' }
    const d = diagnose(engine, { q1: 'unclassified', extra: 'kept' })
    expect(d.matchedAnswers).toEqual({ q1: 'unclassified', extra: 'kept' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/engine.test.ts`
Expected: FAIL — `./engine` module not found.

- [ ] **Step 3: Implement `src/domain/engine.ts`**

```ts
import type { AnswerRecord, Diagnosis, Playbook } from './types'
import { evaluate } from './evaluate'

/** One service's diagnosis engine: its playbook plus service-specific
 *  composition (passport's stage·rung decorator; the explicit "I'm not
 *  sure" short-circuit). The three real engines are defined with the
 *  playbook data in C2 — this module never contains service content. */
export interface ServiceEngine {
  key: string
  playbook: Playbook
  /** Applied to matched diagnoses only (e.g. stage·rung composition). */
  decorate?: (d: Diagnosis) => Diagnosis
  /** Answer key whose literal value 'unclassified' means the citizen chose
   *  "I'm not sure": short-circuits to the fallback, beating any rule that
   *  stale outcome keys might otherwise match first. */
  unclassifiedKey?: string
}

/** Pure: diagnosis is always derived fresh from the current answers,
 *  never stored (implementation plan §5). */
export function diagnose(engine: ServiceEngine, answers: AnswerRecord): Diagnosis {
  if (engine.unclassifiedKey && answers[engine.unclassifiedKey] === 'unclassified') {
    return { ...engine.playbook.fallback, ruleId: null, matchedAnswers: { ...answers } }
  }
  const d = evaluate(engine.playbook, answers)
  return engine.decorate ? engine.decorate(d) : d
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/engine.test.ts`
Expected: PASS (7 tests). Then run the full suite and build:
Run: `npx vitest run` — Expected: all C1 tests pass (Tasks 2-6).
Run: `npm run build` — Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/domain/engine.ts src/domain/engine.test.ts
git commit -m "feat(c1): ServiceEngine + diagnose() — unclassified short-circuit, decorator hook"
```

---

## Out of Scope for C1 (do not build these)

- Real playbook rules, copy, sources, stage maps, deps maps, SIR state/phase data → **C2**.
- Content-safety / guardrail test suite (manifest resolution, deadline allowlist, retired-action scan) → **C2**.
- Screens, templates, routing, visual system → **C3**.
- Prepare plans, session/persistence, casefiles, check-in loop, auth, describe-it → **C4–C8**.
