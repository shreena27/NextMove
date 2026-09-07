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
    const dollarMatch = /^\$[a-zA-Z_]*\$/.exec(text.slice(i))
    if (dollarMatch) {
      const tag = dollarMatch[0]
      const end = text.indexOf(tag, i + tag.length)
      const bodyEnd = end === -1 ? text.length : end + tag.length
      current += text.slice(i, bodyEnd)
      i = bodyEnd
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
 */
function securityDefinerFindings(text: string): string[] {
  const findings: string[] = []
  for (const statement of splitSqlStatements(text)) {
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

  it('the UPDATE policy has both USING and WITH CHECK', () => {
    const match = /create policy "own rows: update"[\s\S]*?;/i.exec(sql)
    expect(match, 'the "own rows: update" policy is missing entirely').toBeTruthy()
    const statement = match![0]
    expect(
      statement,
      'USING gates which existing rows a user may touch — without it the UPDATE policy would not scope by owner at all',
    ).toMatch(/using\s*\(/i)
    expect(
      statement,
      "without WITH CHECK on UPDATE, a signed-in user can update one of their own rows and reassign its user_id to someone else's account — USING only gates which rows may be touched, WITH CHECK gates what the row may become, and per design note 2 this clause is the SOLE protection against that (a column-level revoke would be a no-op)",
    ).toMatch(/with check\s*\(/i)
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
  })
})
