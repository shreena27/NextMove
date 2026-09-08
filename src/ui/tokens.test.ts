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
  // See tokens.ts: --done-bg #DFF3E6 sits 2.80 from --wait-bg #D9F2DF.
  //
  // RE-RULED at C5 Task 1, now that .lrung.done .lr-tag actually mounts
  // (issue #7): --done-bg now paints the escalation ladder's "Done" rung
  // tag; --wait-bg paints the WAIT status stamp. ΔE ≈ 2.8 is below the
  // project's self-imposed 2.7-3.0 noticeable-difference floor.
  //
  // CORRECTION to the original C3 exemption, not carried forward: it said
  // the two tokens sit in "a different block", implying they never
  // co-occur. That was wrong. They DO co-occur — a state-5b-p WAIT case
  // renders the stamp ABOVE a ladder whose earlier rungs are marked Done,
  // on the same screen and in the same column. The honest description is
  // "same screen, never the same surface or size, each labelled", not
  // "different block".
  //
  // The exemption still holds, because the ΔE floor is a SELF-IMPOSED
  // project standard for classification surfaces, not a WCAG requirement,
  // and the binding accessibility rule (1.4.1, colour is never the sole
  // carrier) is independently satisfied: the stamp reads "WAIT", the rung
  // tag reads "Done", at different sizes and weights, and neither is
  // decodable only by hue.
  //
  // This test FAILS THE MOMENT the gap widens or narrows, forcing a fresh
  // ruling rather than silent drift.
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

  // Task 9 design note 5: three rendered text/background pairs in the
  // lifted auth/account CSS get a genuine contrast CHECK, not an
  // assumption, even though their tokens are already covered against
  // --paper above. --card is pure white (#FFFFFF, the lightest possible
  // background), so in principle every pair here can only measure AT LEAST
  // as high a ratio as the same foreground on --paper — but that is exactly
  // the kind of "should be fine" reasoning design note 5 says not to trust
  // silently; each is measured and pinned explicitly instead.
  it.each([
    // selector, size, fg token, bg token, min ratio (AA, small text = 4.5:1)
    ['.acct-chip.noname', '11px', 'ink-soft', 'card', 4.5],
    ['.acct-pop-sub', '11px', 'ink-soft', 'card', 4.5],
    // the tightest pair in the range — --ink-faint is the lighter of the
    // two secondary-gray tokens (see tokens.ts comment)
    ['.acct-pop-row .row-sub', '11.5px', 'ink-faint', 'card', 4.5],
  ])('%s (%s, %s on %s) clears %s:1', (_selector, _size, fg, bg, min) => {
    const ratio = contrastRatio(TOKENS[fg as keyof typeof TOKENS], TOKENS[bg as keyof typeof TOKENS])
    expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(min as number)
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

  it('carries the casefile/ladder/check-in/journey CSS (prototype 562-568, 651-661, 744-878)', () => {
    // Scoped to the CSS body (past the header) — the rewritten provenance
    // header names most of these classes in its own prose (the lifted-range
    // table and the "lifted but unused" callout), so a whole-file `css`
    // search can't tell "documented as lifted" from "actually shipped".
    // Same reasoning as the presence/absence/ordering tests around this one.
    const body = css.slice(css.indexOf(':root{'))
    for (const cls of [
      '.saved-card', '.saved-next', '.saved-steps', '.saved-meta',
      '.btn-ghost', '.saved-note',
      '.home-cases', '.case-meta-line', '.case-links', '.case-link', '.case-remove', '.case-h1',
      '.case-progress', '.cp-head', '.cp-count', '.cp-bar', '.cp-fill',
      '.ladder', '.lrung', '.lr-dot', '.lr-label', '.lr-tag', '.ladder-note',
      '.update-mod', '.um-head', '.um-kicker', '.um-title',
      '.stamp.mini', '.closedmark', '.saved-card.closed',
      '.ci-panel', '.remind-row', '.remind-input',
      '.journey', '.log-e', '.log-mile', '.log-d', '.log-who', '.log-note',
      // Task 8 review follow-up, addressed by Task 9: `.read-change` was
      // originally swept into the blanket "881-995 = all C8" exclusion
      // below, but it is a small, generic, reusable text-link-styled
      // button utility — used by JourneyLog's "Show all N entries" (Task
      // 8) AND CasefileScreen's "Copy reminder"/"Undo this check-in"
      // buttons (Task 9) — not describe-it-specific. It physically sits
      // among C8's describe-it rules (prototype 930-945) but is not one of
      // them, so it is lifted on its own, scoped and documented, while its
      // neighbours (.read-q, .read-pick, .span-quote, .read-opts, .ropt)
      // stay excluded. See index.css's own provenance comment.
      '.read-change',
    ]) expect(body, cls).toContain(cls)
  })

  it('ships the C5 casefile styles that used to sit inside the same prototype range', () => {
    // Inverse of the C4-era test this replaces: prototype 562-568
    // (.saved-next/.saved-steps/.saved-meta) was C5's and physically
    // interleaved into C4's block, so C4 correctly deferred it (issue #7 /
    // C3 handoff). Now that C5 Task 1 lifts it, asserting its absence would
    // be false — assert presence instead.
    // Scoped to the CSS body (past the header) — the header's own
    // provenance prose legitimately names these classes in its lifted-range
    // list; this test is about the class shipping as a live rule.
    const body = css.slice(css.indexOf(':root{'))
    for (const cls of ['.saved-next', '.saved-steps', '.saved-meta']) {
      expect(body, cls).toContain(cls)
    }
  })

  it("does NOT ship C8's describe-it CSS", () => {
    // 662-743 (.auth-*, .btn-google, .otp-input, .acct-*, .demo-hint) used
    // to sit physically BETWEEN this task's 651-661 and 744-878 ranges and
    // was skipped rather than swallowed into one contiguous append (the
    // same kind of interleaved-range hazard C4 had to handle) — Task 9
    // lifts it, so it is now asserted PRESENT below ('lifts the
    // auth/account CSS' block), not absent here. 881-995 (C8's describe-it
    // / fills-review CSS) still isn't built, so that half of this test
    // stays.
    // Scoped to the body — see the test above for why.
    const body = css.slice(css.indexOf(':root{'))
    for (const cls of [
      '.fill-list', '.fill-review', '.describe-ta', '.fchip',
    ]) expect(body, cls).not.toContain(cls)
  })

  it('lifts the auth/account CSS (prototype 662-743)', () => {
    // Inverse of the test above, now that Task 9 lifts this range. It sits
    // physically between .btn-ghost/.saved-note (651-661) and .saved-card
    // (744-878) — checked here as one presence test; per-selector RED
    // coverage (so a PARTIAL lift fails loudly, selector by selector) lives
    // in the it.each block right below.
    const body = css.slice(css.indexOf(':root{'))
    for (const cls of [
      '.auth-input', '.btn-google', '.otp-input', '.acct-chip', '.acct-pop',
      '.demo-hint',
    ]) expect(body, cls).toContain(cls)
  })

  // Selector text carries the opening brace (or the exact descendant
  // combinator) so a PARTIAL lift fails on exactly the missing rules —
  // '.acct-chip' alone is a substring of '.acct-chip.noname{', so a bare
  // class-name match would pass even if only the .noname variant shipped.
  // Same reasoning as the '.copy-btn{' vs '.copy-btn.copied{' pair above.
  it.each([
    '.acct-chip{', '.acct-chip.noname{',
    '.acct-av{', '.acct-wrap{', '.acct-scrim{',
    '.acct-pop{', '.acct-pop-head{', '.acct-pop-name{', '.acct-pop-sub{',
    '.acct-pop-row{', '.acct-pop-confirm{',
    '.auth-field{', '.auth-label{', '.auth-input{', '.otp-input{',
    '.auth-err{', '.auth-divider{', '.btn-google{', '.auth-switch{',
    '.auth-note{', '.demo-hint{',
  ])('body contains %s (prototype 662-743)', selector => {
    const body = css.slice(css.indexOf(':root{'))
    expect(body).toContain(selector)
  })

  it('keeps the prototype ordering: prepare CSS precedes the settled/reduced-motion tail', () => {
    // Scoped to the body — the header's own prose mentions "996-1008
    // (#app.settled animation suppression...)", which would otherwise
    // trip this check without any real CSS ever having been reordered.
    const body = css.slice(css.indexOf(':root{'))
    expect(body.indexOf('.prep-card')).toBeGreaterThan(-1)
    expect(body.indexOf('.prep-card')).toBeLessThan(body.indexOf('#app.settled'))
    expect(body.indexOf('.visit-note')).toBeLessThan(body.indexOf('@media (prefers-reduced-motion:reduce)'))
  })

  it('orders the C5 casefile card between .visit-note and the settled tail', () => {
    const body = css.slice(css.indexOf(':root{'))
    expect(body.indexOf('.saved-card')).toBeGreaterThan(body.indexOf('.visit-note'))
    expect(body.indexOf('.saved-card')).toBeLessThan(body.indexOf('#app.settled'))
  })

  it('pins the cascade order: the compact-card overrides of .saved-next/.saved-meta land LAST', () => {
    // .saved-next and .saved-meta are each declared TWICE in the prototype
    // — once at 562/568 (the base chip rules) and again at 761-762 (inside
    // the compact-card block) — with identical selector specificity, so
    // the LATER declaration in this file is the one that wins the cascade,
    // and only because it comes later. Appending 744-878 before 562-568
    // would silently drop the compact card's own overrides with no error
    // anywhere; this test turns that into a loud failure instead.
    const body = css.slice(css.indexOf(':root{'))
    const savedNextFirst = body.indexOf('.saved-next{font-size:13.5px;')
    const savedNextSecond = body.indexOf('.saved-next{display:block;}')
    const savedMetaFirst = body.indexOf('.saved-meta{display:flex;')
    const savedMetaSecond = body.indexOf('.saved-meta{font-size:12.5px;')
    expect(savedNextFirst, '.saved-next base rule').toBeGreaterThan(-1)
    expect(savedNextSecond, '.saved-next compact-card override').toBeGreaterThan(-1)
    expect(savedMetaFirst, '.saved-meta base rule').toBeGreaterThan(-1)
    expect(savedMetaSecond, '.saved-meta compact-card override').toBeGreaterThan(-1)
    expect(savedNextSecond).toBeGreaterThan(savedNextFirst)
    expect(savedMetaSecond).toBeGreaterThan(savedMetaFirst)
  })

  it('keeps 662-743 in prototype position: between .btn-ghost and .saved-card', () => {
    // No selector in 662-743 collides with anything else in the file
    // (design note 2), so unlike the .saved-next/.saved-meta pair above
    // this ordering isn't cascade-load-bearing — but the file's own
    // append-order convention is prototype order, and honouring it costs
    // nothing.
    const body = css.slice(css.indexOf(':root{'))
    const btnGhost = body.indexOf('.btn-ghost')
    const acctChip = body.indexOf('.acct-chip')
    const savedCard = body.indexOf('.saved-card')
    expect(btnGhost, '.btn-ghost').toBeGreaterThan(-1)
    expect(acctChip, '.acct-chip').toBeGreaterThan(-1)
    expect(savedCard, '.saved-card').toBeGreaterThan(-1)
    expect(btnGhost).toBeLessThan(acctChip)
    expect(acctChip).toBeLessThan(savedCard)
  })

  it("the file's own provenance header no longer disclaims what it now ships", () => {
    // A provenance header that lies is worse than none. Design note 6.
    // C5 Task 1 lifted three more ranges — the header must say so, in
    // order, with the reason the order is load-bearing, and (at that point)
    // still disclaim the C7 range sitting physically between two of them.
    const header = css.slice(0, css.indexOf(':root{'))
    expect(header).toContain('533-561')
    expect(header).toContain('569-646')
    // now named as LIFTED, not disclaimed
    expect(header).toContain('562-568')
    expect(header).toContain('651-661')
    expect(header).toContain('744-878')
    // C8's range is still not built, still disclaimed
    expect(header).toContain('881-995')
    // the cascade-order reasoning is on the record, not just followed
    expect(header.toLowerCase()).toContain('cascade')
    // the three dead-but-lifted rules are named, not silently absorbed
    expect(header).toContain('.saved-actions')
    expect(header).toContain('.saved-continue')
    expect(header).toContain('.saved-remove')
  })

  it("Task 9: the header now lifts 662-743 instead of disclaiming it", () => {
    // Companion to the test above — 662-743 flips from "Deliberately NOT
    // lifted" to lifted-and-documented, so the "662-743" string must now
    // appear OUTSIDE the "Deliberately NOT lifted" paragraph, and the
    // paragraph that remains there must only disclaim 881-995 (C8's).
    const header = css.slice(0, css.indexOf(':root{'))
    expect(header).toContain('662-743')
    const notLiftedIdx = header.indexOf('Deliberately NOT lifted')
    expect(notLiftedIdx, '"Deliberately NOT lifted" paragraph').toBeGreaterThan(-1)
    const notLiftedParagraph = header.slice(notLiftedIdx)
    expect(notLiftedParagraph).not.toContain('662-743')
    expect(notLiftedParagraph).toContain('881-995')
    // the acct/auth classes are named in the (now non-disclaiming) header
    expect(header).toContain('.acct-chip')
    expect(header).toContain('.auth-input')
    // .demo-hint is documented as lifted-but-unused, matching the style
    // already used for .saved-actions/.saved-continue/.saved-remove. Find
    // the SECOND mention (the callout), not the first (the range-summary
    // class list at the top of the 662-743 paragraph), and check what
    // follows it names the unused status.
    const firstMention = header.indexOf('.demo-hint')
    expect(firstMention, '.demo-hint mentioned in header').toBeGreaterThan(-1)
    const calloutIdx = header.indexOf('.demo-hint', firstMention + 1)
    expect(calloutIdx, '.demo-hint mentioned a second time (the callout)').toBeGreaterThan(-1)
    expect(header.slice(calloutIdx, calloutIdx + 300).toUpperCase()).toContain('LIFTED BUT')
  })
})
