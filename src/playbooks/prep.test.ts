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
