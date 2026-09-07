import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CaseOutcome, ServiceKey } from '../src/domain/casefile.ts'

// Static (always-runs) test over every supabase/migrations/*.sql file. It
// greps the SQL text — it cannot prove a policy does what it says, only
// that the load-bearing pieces are present, worded the load-bearing way,
// and that the one guardrail this chunk claims (SECURITY DEFINER pinning)
// is a rule this checker can actually catch a violation of. The live-stack
// test in rls.live.test.ts is what proves behaviour.

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, 'migrations')

function readAllMigrations(): string {
  let files: string[] = []
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
  } catch {
    files = []
  }
  return files.map((f) => readFileSync(join(migrationsDir, f), 'utf-8')).join('\n\n')
}

const sql = readAllMigrations()

// design note 5 (Task 2) / Task 5's own GREEN item ("Wire Task 2's
// migration test to import CASE_OUTCOMES") both establish that
// src/domain/casefile.ts does not yet export a runtime CASE_OUTCOMES
// companion, and CaseOutcome itself does not yet include 'superseded' —
// that lands in Task 5 (D3), which is *why* Task 5 says it will "wire"
// this file rather than this file already doing so. Until then this array
// is the one deliberate, tracked exception to "imported, not hand-typed"
// in this file: it is typed against the CURRENT CaseOutcome import plus
// the one literal value ('superseded') Task 5 adds, so drift in the
// three EXISTING members still shows up as a type mismatch to a reader's
// editor even though tsc -b does not check this file (design note 5).
const CASE_OUTCOMES: (CaseOutcome | 'superseded')[] = [
  'still_open',
  'deliverable_received',
  'closed_unresolved',
  'superseded',
]

// ServiceKey is already exported from src/domain/casefile.ts today (no
// Task 5 dependency for the type itself) — the runtime SERVICE_KEYS
// companion is what lands in Task 5 "in the same one-line style" as
// CASE_OUTCOMES. Typing this hand-array against the ServiceKey import is
// the best available "imported, not hand-typed" today.
const SERVICE_KEYS: ServiceKey[] = ['passport', 'voter', 'sir']

/**
 * If `text` starts a dollar-quoted body (`$tag$...$tag$`, e.g. a plpgsql
 * function body) at index `i`, returns the index just past its closing
 * tag; otherwise returns null. Shared by stripSqlComments and
 * splitSqlStatements so both treat a dollar-quoted body as opaque the
 * same way — a `;`, `--`, or `/*` inside one is part of the function's
 * own code, never a statement boundary or a top-level SQL comment.
 */
function dollarQuoteEnd(text: string, i: number): number | null {
  const dollarMatch = /^\$[a-zA-Z_]*\$/.exec(text.slice(i))
  if (!dollarMatch) return null
  const tag = dollarMatch[0]
  const end = text.indexOf(tag, i + tag.length)
  return end === -1 ? text.length : end + tag.length
}

/**
 * Strips SQL line comments (`--`) and C-style block comments, outside
 * dollar-quoted bodies, before statement-splitting. Without this, a trailing comment
 * block that happens to mention `set search_path = ''` in prose — exactly
 * what this migration's own closing comment does, describing the
 * SECURITY DEFINER guardrail itself — satisfies the guardrail for
 * anything appended after it, since code and prose were never
 * distinguished before splitting on `;`. (Found by the Task 2 reviewer:
 * appending a real unpinned SECURITY DEFINER function after this
 * migration's text left the guardrail at 0 findings.)
 */
function stripSqlComments(text: string): string {
  let result = ''
  let i = 0
  while (i < text.length) {
    const dqEnd = dollarQuoteEnd(text, i)
    if (dqEnd !== null) {
      result += text.slice(i, dqEnd)
      i = dqEnd
      continue
    }
    if (text[i] === '-' && text[i + 1] === '-') {
      const eol = text.indexOf('\n', i)
      i = eol === -1 ? text.length : eol
      continue
    }
    if (text[i] === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
      continue
    }
    result += text[i]
    i += 1
  }
  return result
}

/**
 * Splits SQL text into top-level statements on `;`, treating anything
 * inside a `$tag$...$tag$` dollar-quoted body (a plpgsql function body,
 * for instance) as opaque so a `;` inside a function is never mistaken
 * for a statement boundary. This is what lets the SECURITY DEFINER
 * guardrail check "the same statement" rather than "the same file".
 */
function splitSqlStatements(text: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  while (i < text.length) {
    const dqEnd = dollarQuoteEnd(text, i)
    if (dqEnd !== null) {
      current += text.slice(i, dqEnd)
      i = dqEnd
      continue
    }
    const ch = text[i]
    if (ch === ';') {
      statements.push(current)
      current = ''
      i += 1
      continue
    }
    current += ch
    i += 1
  }
  if (current.trim().length > 0) statements.push(current)
  return statements
}

/**
 * Returns one finding per statement that contains `security definer`
 * (case-insensitive) without also containing `set search_path = ''` in
 * that SAME statement — a SECURITY DEFINER function that doesn't pin its
 * search_path resolves unqualified identifiers against the CALLER's
 * search_path, which the caller controls (a privilege-escalation shape).
 * Comments are stripped first (see stripSqlComments) so a search_path
 * pin mentioned only in prose can never satisfy this for real code.
 */
function securityDefinerFindings(text: string): string[] {
  const findings: string[] = []
  for (const statement of splitSqlStatements(stripSqlComments(text))) {
    const hasSecurityDefiner = /security\s+definer/i.test(statement)
    const pinsSearchPath = /set\s+search_path\s*=\s*''/i.test(statement)
    if (hasSecurityDefiner && !pinsSearchPath) {
      findings.push(statement.trim().slice(0, 120))
    }
  }
  return findings
}

describe('supabase/migrations/*.sql — casefiles table, RLS, and the SECURITY DEFINER guardrail (Task 2)', () => {
  it('creates public.casefiles', () => {
    expect(
      sql,
      'no supabase/migrations/*.sql defines public.casefiles — nothing else in this suite can be meaningfully true if the table itself is missing',
    ).toMatch(/create table public\.casefiles/i)
  })

  it('enables row level security on public.casefiles', () => {
    expect(
      sql,
      'without ROW LEVEL SECURITY enabled, the policies below are never consulted and any role with a table grant can read/write every row',
    ).toMatch(/alter table public\.casefiles enable row level security/i)
  })

  describe.each(['select', 'insert', 'update', 'delete'])('the "own rows: %s" policy', (op) => {
    it(`is present, scoped to authenticated, for ${op}`, () => {
      const re = new RegExp(`create policy "own rows: ${op}" on public\\.casefiles for ${op} to authenticated`, 'i')
      expect(sql, `missing the "own rows: ${op}" policy — without it, ${op} on casefiles is not scoped to its owning user at all`).toMatch(re)
    })
  })

  it('the UPDATE policy has both USING and WITH CHECK, each scoped to the owning user (not merely present)', () => {
    const match = /create policy "own rows: update"[\s\S]*?;/i.exec(sql)
    expect(match, 'the "own rows: update" policy is missing entirely').toBeTruthy()
    const statement = match![0]
    // Matches the full clause content, not just the "using(" / "with
    // check(" keywords — a keyword-only check still passes a weakened
    // `using (true)` or `with check (true)`, which is exactly the
    // mutation the Task 2 reviewer showed this test used to miss.
    expect(
      statement,
      'USING gates which existing rows a user may touch — without it scoped to the owning user, the UPDATE policy would not scope by owner at all',
    ).toMatch(/using\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)/i)
    expect(
      statement,
      "without WITH CHECK scoped to the owning user on UPDATE, a signed-in user can update one of their own rows and reassign its user_id to someone else's account — USING only gates which rows may be touched, WITH CHECK gates what the row may become",
    ).toMatch(/with check\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)/i)
  })

  it('the partial unique index guarantees one open case per (user_id, engine_key)', () => {
    expect(
      sql,
      "without casefiles_one_open_per_service, session/cases.ts's completeSave client-side check is a suggestion only — the invariant is never actually enforced server-side, so two devices (or a bypassed client) can create two still_open cases for the same service",
    ).toMatch(/create unique index casefiles_one_open_per_service\s+on public\.casefiles \(user_id, engine_key\) where outcome = 'still_open'/i)
  })

  it('revokes all privileges from anon', () => {
    expect(
      sql,
      'without "revoke all ... from anon", an anonymous browser could read or write casefiles rows if privileges were ever left at the Supabase image default — this is what makes "the diagnosis you just got never required signing in" structurally true rather than a promise',
    ).toMatch(/revoke all on public\.casefiles from anon/i)
  })

  it('explicitly grants authenticated the privileges it needs', () => {
    expect(
      sql,
      "omitting this grant relies on Supabase's own default privileges on new public tables; replaying these migrations against a plain Postgres (exactly what a fresh clone's db reset does) then produces a table 'authenticated' cannot write, and the failure surfaces as an opaque permission error far from its cause",
    ).toMatch(/grant select, insert, update, delete on public\.casefiles to authenticated/i)
  })

  it('never uses a column-level "revoke update (" anywhere', () => {
    expect(
      sql,
      "a column-level REVOKE UPDATE is a no-op while the role holds table-level UPDATE (which 'authenticated' does, and must, for upsert to work); asserting it as protection hides that WITH CHECK is doing all the work — this is a negative pin so the no-op cannot be re-added by a reader who remembers it as defence-in-depth",
    ).not.toMatch(/revoke\s+update\s*\(/i)
  })

  it('every auth.uid() call INSIDE A POLICY is wrapped as (select auth.uid())', () => {
    const policyStatements = (sql.match(/create policy[\s\S]*?;/gi) ?? []).join('\n')
    expect(policyStatements.length, 'no create policy statements were found to check').toBeGreaterThan(0)
    const bareOccurrences = policyStatements.match(/(?<!select\s)auth\.uid\(\)/gi) ?? []
    expect(
      bareOccurrences.length,
      'a bare auth.uid() inside a policy is re-evaluated once per ROW instead of once per query — on this small a table the difference is invisible, which is exactly why it would get "simplified" back to the bare form later',
    ).toBe(0)
  })

  it('the outcome check constraint lists exactly the four CaseOutcome values', () => {
    const match = /check\s*\(outcome in \(([^)]*)\)\)/i.exec(sql)
    expect(match, 'no outcome check constraint was found on public.casefiles').toBeTruthy()
    const values = match![1]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .sort()
    expect(
      values,
      "a hand-typed outcome list is a second source of truth that will drift from src/domain/casefile.ts's CaseOutcome union",
    ).toEqual([...CASE_OUTCOMES].sort())
  })

  it("the engine_key check constraint lists exactly the ServiceKey union's members", () => {
    const match = /check\s*\(engine_key in \(([^)]*)\)\)/i.exec(sql)
    expect(match, 'no engine_key check constraint was found on public.casefiles').toBeTruthy()
    const values = match![1]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .sort()
    expect(
      values,
      "a hand-typed engine_key list is a second source of truth that will drift from src/domain/casefile.ts's ServiceKey union",
    ).toEqual([...SERVICE_KEYS].sort())
  })

  describe('the SECURITY DEFINER guardrail', () => {
    it('no migration today contains an un-pinned "security definer"', () => {
      expect(
        securityDefinerFindings(sql),
        "a SECURITY DEFINER function without SET search_path = '' resolves unqualified identifiers against the CALLER's search_path, which the caller controls — this chunk's whole migration path deliberately needs none (design note 4), and this assertion keeps that true",
      ).toEqual([])
    })

    // "A guardrail that has never been shown to fail is not a guardrail" —
    // this fixture proves the checker CAN fail, by feeding it a real
    // violation, rather than merely asserting a rule that happens to be
    // vacuously true because nothing in the real SQL triggers it yet.
    it('the checker can fail: a bare "security definer" with no search_path pin is reported', () => {
      const fixture = `
        create function public.pwn() returns void
        language plpgsql
        security definer
        as $$ begin update public.casefiles set outcome = 'closed_unresolved'; end; $$;
      `
      const findings = securityDefinerFindings(fixture)
      expect(findings.length, 'the guardrail failed to catch a bare SECURITY DEFINER in the fixture — it cannot be trusted against the real migrations either').toBeGreaterThan(0)
    })

    it("a SECURITY DEFINER function that DOES pin set search_path = '' in the same statement produces no finding", () => {
      const fixture = `
        create function public.safe() returns void
        language plpgsql
        security definer
        set search_path = ''
        as $$ begin update public.casefiles set outcome = 'closed_unresolved'; end; $$;
      `
      expect(securityDefinerFindings(fixture)).toEqual([])
    })

    it('a search_path pin in a DIFFERENT statement does not count — the guardrail is per-statement, not per-file', () => {
      const fixture = `
        create function public.pwn() returns void
        language plpgsql
        security definer
        as $$ begin update public.casefiles set outcome = 'closed_unresolved'; end; $$;
        set search_path = '';
      `
      const findings = securityDefinerFindings(fixture)
      expect(findings.length, 'a search_path pin in a later, unrelated statement must not satisfy the guardrail for the SECURITY DEFINER statement above it').toBeGreaterThan(0)
    })

    // The four tests above only ever fed the checker isolated fixture
    // strings — none of them exercised it against the one input CI
    // actually feeds it: the REAL migration corpus. This migration's own
    // closing comment (supabase/migrations/20260907103532_casefiles.sql)
    // explains the guardrail in prose and, in doing so, literally contains
    // the text `set search_path = ''`. Before comment-stripping was added
    // to securityDefinerFindings, that trailing comment satisfied
    // pinsSearchPath for anything appended after it, so a real violation
    // appended to the end of the real migration text went uncaught even
    // though every isolated-fixture test above still passed — proof that
    // "passes against fixtures" is not the same claim as "works on the
    // real input", and this test is what closes that gap.
    it('the checker can fail against the REAL migration corpus (not just an isolated fixture): appending an unpinned security definer to the actual migration SQL is still caught', () => {
      const violation = `
        create function public.pwn() returns void
        language plpgsql
        security definer
        as $$ begin update public.casefiles set outcome = 'closed_unresolved'; end; $$;
      `
      const findings = securityDefinerFindings(sql + '\n' + violation)
      expect(
        findings.length,
        "appending a real unpinned SECURITY DEFINER violation after the real migration text must still be caught. If it is not, the checker is only ever exercised against isolated fixture strings, not the actual input CI feeds it — and this migration's own trailing comment (which mentions set search_path = '' in prose, describing this very guardrail) can silently satisfy the checker for anything appended after it",
      ).toBeGreaterThan(0)
    })
  })
})
