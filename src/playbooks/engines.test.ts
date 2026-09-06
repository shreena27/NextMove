import { describe, it, expect } from 'vitest'
import { passportEngine, voterEngine, sirEngine, ENGINES, DEPS_FOR } from './engines'
import { passportPlaybook } from './passportPlaybook'
import { voterPlaybook } from './voterPlaybook'
import { sirPlaybook, sirCopyExtras, SIR_STATES } from './sirPlaybook'
import { diagnose } from '../domain/engine'
import { applyEvent } from '../domain/answers'
import { orphanFindings } from './guardrails/citations'
import { copyStrings, staleExemptionFindings, extraCopy, type CopyString } from './guardrails/contentSafety'
import { guardrailFindings } from './guardrails/suite'
import { LADDER_DEFS } from '../templates/ladder'

const ALL = [passportPlaybook, voterPlaybook, sirPlaybook]

// C3 Task 9 review fix round 1: LADDER_DEFS' title/caption/rungs are now
// swept by screenCopy.test.tsx's guardrail assertions (design note 5 names
// them an unconditional scan input), which added two SAFETY_EXEMPTIONS
// entries for the two captions' shared "as far as your case needs" false
// positive on the causal pattern (same shape as sir:s-notice.whatToDo,
// above). Those two `at` locations must appear here too, or the
// comprehensive "every exemption still earns its place" check below would
// flag them as stale simply because THIS test's own copy-string universe
// predates ladder.ts — not because the exemptions are actually dead.
function ladderDefStrings(bucket: 'passport' | 'voter'): CopyString[] {
  const def = LADDER_DEFS[bucket]
  return [
    extraCopy(`${bucket}:LADDER_DEFS.${bucket}.title`, def.title),
    extraCopy(`${bucket}:LADDER_DEFS.${bucket}.caption`, def.caption),
    ...def.rungs.map((r, i) => extraCopy(`${bucket}:LADDER_DEFS.${bucket}.rungs[${i}]`, r)),
  ]
}

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
    const all = ALL.flatMap(p => copyStrings(p))
      .concat(sirCopyExtras())
      .concat(ladderDefStrings('passport'))
      .concat(ladderDefStrings('voter'))
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
