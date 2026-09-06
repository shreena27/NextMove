// TEST-ONLY. Enforces the plan's Global Constraint (carried from C1, still
// binding): "The guardrail harness under src/playbooks/guardrails/ reads
// real files from disk (sources/manifest.json, the committed source texts).
// It must never be imported by application code." Nothing else in the
// suite checks this — and per the project's own standing rule, "a declared
// guardrail without an executable test is a defect," this IS that test.
//
// Files inside src/playbooks/guardrails/ itself are exempt: they are the
// harness, so they are allowed to import each other and node:fs/node:url —
// that is their whole job. Every OTHER .ts file under src/ (application,
// domain and playbook-data code, excluding *.test.ts files) must never:
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

const DISALLOWED_BARE_IMPORTS = ['node:fs', 'node:path', 'node:url', 'vitest']

/** Every .ts file under src/, excluding *.test.ts files and anything inside
 *  playbooks/guardrails/ (the harness itself, which is allowed to use these
 *  dependencies — that's its entire purpose). Deliberately `.ts` only, not
 *  `.tsx`: the plan's isolation constraint is about the harness's fs/vitest
 *  dependencies leaking into logic modules, and the two current `.tsx`
 *  files (App.tsx, main.tsx) carry no such imports today. */
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
    if (!entry.name.endsWith('.ts')) continue
    if (entry.name.endsWith('.test.ts')) continue
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

  for (const spec of importSpecifiers(source)) {
    if (GUARDRAILS_PATH_RE.test(spec)) {
      violations.push(
        `${label}: imports "${spec}" — the guardrail harness under src/playbooks/guardrails/ must never be imported by application code.`,
      )
    }
    if (DISALLOWED_BARE_IMPORTS.includes(spec)) {
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
