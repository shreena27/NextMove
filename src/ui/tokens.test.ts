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
    // it.each's mixed string/number tuple widens fg/bg to plain `string`
    // (the same reason `min` needs `as number` just below) — cast to the
    // same `keyof typeof TOKENS` idiom the fidelity test above already uses.
    expect(contrastRatio(TOKENS[fg as keyof typeof TOKENS], TOKENS[bg as keyof typeof TOKENS])).toBeGreaterThanOrEqual(min as number)
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
