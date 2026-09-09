// TEST-ONLY. Enforces the plan's Global Constraint (carried from C1, still
// binding): "The guardrail harness under src/playbooks/guardrails/ reads
// real files from disk (sources/manifest.json, the committed source texts).
// It must never be imported by application code." Nothing else in the
// suite checks this — and per the project's own standing rule, "a declared
// guardrail without an executable test is a defect," this IS that test.
//
// Files inside src/playbooks/guardrails/ itself are exempt from BOTH rules
// below: they are the harness, so they are allowed to import each other
// and node:fs/node:url — that is their whole job.
//
// src/test/ (path-anchored — see TEST_INFRA_DIR below, not name-matched)
// gets a NARROWER exemption, from rule 2 only: it is this project's shared
// TEST INFRASTRUCTURE directory (vite.config.ts's own `setupFiles:
// ['./src/test/setup.ts']`; Task 3 adds src/test/supabaseMock.ts alongside
// it), so it legitimately needs `vitest` (`vi.fn()` etc.) the same way an
// individual *.test.ts file already may — this is that same carve-out,
// applied at directory granularity because these files support tests
// without themselves carrying a `.test.ts` suffix. It is NOT exempt from
// rule 1: nothing about being test infrastructure justifies reaching into
// the guardrail harness, so a file under src/test/ that imported
// guardrails/ would still (correctly) be flagged.
//
// Every OTHER .ts/.tsx file under src/ (application, domain and
// playbook-data code, excluding *.test.ts/*.test.tsx files) must never:
//   1. import anything under guardrails/, or
//   2. import node:fs, node:path, node:url or vitest directly — those are
//      guardrail-harness-only dependencies that application/domain/
//      playbook-data code should never need.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// NOTE: deliberately not `fileURLToPath(new URL('../../', import.meta.url))`.
// Vite statically rewrites a literal `new URL(<string>, import.meta.url)` call
// into an asset-import URL (its documented `new URL(url, import.meta.url)`
// feature) — under vitest's jsdom environment that resolves to
// `http://localhost:3000/...`, not a `file:` URL, so fileURLToPath throws
// "The URL must be of scheme file". Deriving the same directory via node:path
// from this module's own file path avoids the rewrite entirely (same fix as
// guardrails/manifest.ts uses for the same reason).
const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..') // -> <repo>/src

// Path-anchored (NOT name-matched): only this exact directory is shared
// test infrastructure. A directory merely NAMED "test" elsewhere under
// src/ (e.g. src/screens/test/) is a different directory and gets no
// exemption from anything.
const TEST_INFRA_DIR = join(srcRoot, 'test')

function isSharedTestInfraFile(file: string): boolean {
  return file === TEST_INFRA_DIR || file.startsWith(TEST_INFRA_DIR + sep)
}

const DISALLOWED_BARE_IMPORTS = ['node:fs', 'node:path', 'node:url', 'vitest']

/** Every .ts/.tsx file under src/, excluding *.test.ts/*.test.tsx files and
 *  anything inside playbooks/guardrails/ (the harness itself, exempt from
 *  BOTH rules below — that's its entire purpose). src/test/ (shared test
 *  infrastructure) is DELIBERATELY still included here, unlike
 *  guardrails/: it only gets the narrower rule-2-only exemption applied in
 *  findingsFor (via isSharedTestInfraFile above), so it stays subject to
 *  rule 1 — importing the guardrail harness would still be flagged even
 *  from a src/test/ file. Used to cover `.ts` only, on the theory that
 *  App.tsx/main.tsx were the only `.tsx` files and carried no such
 *  imports — C3 added ~30 more `.tsx` screen/template files, so the
 *  extension filter now covers both. */
function applicationTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'guardrails') continue
      out.push(...applicationTsFiles(full))
      continue
    }
    if (!entry.isFile()) continue
    if (!/\.tsx?$/.test(entry.name)) continue
    if (/\.test\.tsx?$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

/** Every module specifier this file's import/export/dynamic-import
 *  statements reference. Deliberately over-broad (matches `import ... from`,
 *  `export ... from`, side-effect `import '...'`, and `import('...')`)
 *  rather than a full parser — a guardrail that misses an exotic import
 *  form is still strictly better than no guardrail at all, and every
 *  shipped C2 file uses plain static imports. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specifiers.push(m[1])
  }
  return specifiers
}

const GUARDRAILS_PATH_RE = /(^|\/)guardrails(\/|$)/

function findingsFor(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const label = file.split(sep).join('/')
  const violations: string[] = []
  // Rule 2 only (see this file's header comment) — src/test/ still gets
  // rule 1 applied below, unconditionally.
  const exemptFromBareImportRule = isSharedTestInfraFile(file)

  for (const spec of importSpecifiers(source)) {
    if (GUARDRAILS_PATH_RE.test(spec)) {
      violations.push(
        `${label}: imports "${spec}" — the guardrail harness under src/playbooks/guardrails/ must never be imported by application code.`,
      )
    }
    if (!exemptFromBareImportRule && DISALLOWED_BARE_IMPORTS.includes(spec)) {
      violations.push(
        `${label}: imports "${spec}" directly — that is a guardrail-harness-only dependency (node:fs/node:path/node:url/vitest have no place in application, domain or playbook-data code).`,
      )
    }
  }
  return violations
}

describe('guardrail harness isolation', () => {
  const files = applicationTsFiles(srcRoot)

  it('found application .ts files to check (the check itself is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('no application file imports the guardrail harness or its fs/vitest-only dependencies', () => {
    const violations = files.flatMap(findingsFor)
    expect(violations, violations.join('\n')).toEqual([])
  })
})

// Whole-branch review (2026-09-09 fix wave), Finding 4: this chunk's own
// `evalHarness.ts` introduced a NEW class of layering violation this file
// did not yet catch — `session/` importing from `screens/` (`UI` from
// `../screens/screenCopy`, to build seed eval fixtures). The plan's Global
// Constraints (docs/superpowers/plans/2026-09-08-c8-describe-it.md)
// establish that `session/` code never imports from `screens/` — that
// module has been fixed (the seed data moved into its own test file, which
// this scan does not walk, by the SAME `applicationTsFiles` exemption the
// guardrail-isolation check above already relies on) — but nothing
// mechanical asserted the RULE itself, only this one instance. This closes
// the class, not just the instance: `templates/` and `ui/` are named
// alongside `screens/` because they sit at the SAME "renders to the citizen"
// layer `session/` (pure state/orchestration) must stay below, and a future
// `session/` file could just as easily reach for a template or a UI
// component instead of a screen.
const SESSION_DIR = join(srcRoot, 'session')
const FORBIDDEN_FROM_SESSION_RE = /(^|\/)(screens|templates|ui)(\/|$)/

function isSessionFile(file: string): boolean {
  return file === SESSION_DIR || file.startsWith(SESSION_DIR + sep)
}

function sessionLayeringFindingsFor(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const label = file.split(sep).join('/')
  const violations: string[] = []
  for (const spec of importSpecifiers(source)) {
    if (FORBIDDEN_FROM_SESSION_RE.test(spec)) {
      violations.push(
        `${label}: imports "${spec}" — session/ code must never import from screens/, templates/ or ui/ (Global Constraints, docs/superpowers/plans/2026-09-08-c8-describe-it.md).`,
      )
    }
  }
  return violations
}

describe('session/ layering: never imports from screens/, templates/ or ui/', () => {
  const files = applicationTsFiles(srcRoot).filter(isSessionFile)

  it('found session/ application files to check (the check itself is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('no session/ file imports screens/, templates/ or ui/', () => {
    const violations = files.flatMap(sessionLayeringFindingsFor)
    expect(violations, violations.join('\n')).toEqual([])
  })
})
