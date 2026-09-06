import { describe, it, expect } from 'vitest'
import {
  CHECKIN, CHECKIN_META, DELIVERABLE_LABEL, DELIVERABLE_Q, CLOSED_TITLE,
  checkinOptionsFor, checkinCopyExtras,
  type CheckinKind,
} from './checkinOptions'
import type { ServiceKey } from './casefile'
import { CHECKIN_PATCHES, type CheckinPatchOption } from './checkinPatches'
import { diagnose } from './engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { passportPlaybook } from '../playbooks/passportPlaybook'
import { voterPlaybook } from '../playbooks/voterPlaybook'
import { sirPlaybook, SIR_STATES } from '../playbooks/sirPlaybook'
import { prepPlanFor } from '../playbooks/prep'
import { guardrailFindings } from '../playbooks/guardrails/suite'
import { retiredActionFindings } from '../playbooks/guardrails/contentSafety'

const PLAYBOOKS = [passportPlaybook, voterPlaybook, sirPlaybook]

// ---------------------------------------------------------------------------
// The pairing pin (design note 1). ONE expected label/kind/patch table,
// transcribed once, directly from the prototype's CHECKIN (2508-2596).
// Asserted against CHECKIN (the zipped output) key by key AND index by
// index — a swap of two entries within one key changes neither the key set
// nor the array length, so only a full position-by-position pin catches it.
// 'state-5a-p' is the worked example the brief names: [resolved-rung, event,
// event] — swapping its two 'event' rows would silently pair "They
// responded, but it did not help" with the wrong patch.
// ---------------------------------------------------------------------------
type ExpectedOption = { k: CheckinKind; label: string } & CheckinPatchOption

const EXPECTED: Record<string, ExpectedOption[]> = {
  'state-1': [
    { k: 'event', label: 'Police contacted or visited me', patch: { q1: 'contacted_incomplete' } },
    { k: 'event', label: 'Verification seems done, but nothing has moved since', patch: { q1: 'verified_no_progress' } },
    { k: 'event', label: 'The portal shows an adverse or confusing status', patch: { q1: 'adverse' } },
  ],
  'state-2': [
    { k: 'event', label: 'Verification finished, but nothing has moved since', patch: { q1: 'verified_no_progress' } },
    { k: 'event', label: 'The portal shows an adverse or confusing status', patch: { q1: 'adverse' } },
    { k: 'action', label: 'I asked the office what was pending (call, visit, or message)', patch: { q2: 'informal', fOutcome: 'pending' } },
  ],
  'state-3': [
    { k: 'action', label: 'I followed up with the Passport Office', patch: { q2: 'informal', fOutcome: 'pending' } },
    { k: 'event', label: 'The portal shows an adverse or confusing status', patch: { q1: 'adverse' } },
  ],
  'state-4': [
    { k: 'action', label: 'I contacted the office and asked for clarification', patch: { q2: 'informal', fOutcome: 'pending' } },
  ],
  'state-5a-p': [
    { k: 'resolved-rung', label: 'They responded and things are moving again', pendingPatch: { fOutcome: 'resolved' } },
    { k: 'event', label: 'They responded, but it did not help', patch: { fOutcome: 'unhelpful' } },
    { k: 'event', label: 'No response at all so far', patch: { fOutcome: 'no_response' } },
  ],
  'state-5a-r': [
    { k: 'event', label: 'It stalled again; nothing has moved since', patch: { fOutcome: null } },
  ],
  'state-5b-r': [
    { k: 'event', label: 'It stalled again; nothing has moved since', patch: { gOutcome: null } },
  ],
  'state-dpg-r': [
    { k: 'deadend', label: "It stalled again after the DPG's response" },
  ],
  'state-5a': [
    { k: 'action', label: 'I filed the formal grievance on CPGRAMS and have a number', patch: { q2: 'formal_grievance', gOutcome: 'pending' } },
  ],
  'state-5b-p': [
    { k: 'resolved-rung', label: 'They responded and things are moving again', pendingPatch: { gOutcome: 'resolved' } },
    { k: 'event', label: 'They responded, but it did not help', patch: { gOutcome: 'unhelpful' } },
    { k: 'event', label: 'No response at all so far', patch: { gOutcome: 'no_response' } },
  ],
  'state-5b': [
    { k: 'action', label: 'I escalated to the DPG and have a reference number', patch: { dpgFiled: 'yes' } },
  ],
  'state-dpg-p': [
    { k: 'resolved-rung', label: 'The DPG responded and things are moving again', pendingPatch: { dpgOutcome: 'resolved' } },
    { k: 'deadend', label: 'The DPG responded, but it did not resolve anything' },
  ],
  'v-1': [
    { k: 'event', label: 'A BLO visited or contacted me', patch: { voterQ1: 'blo_visited' } },
    {
      k: 'valence', label: 'A decision arrived',
      rejectPatch: { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' },
      acceptPendingPatch: { voterQ1: 'decision', voterOutcome: 'accepted_pending' },
    },
  ],
  'v-2': [
    {
      k: 'valence', label: 'A decision arrived',
      rejectPatch: { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' },
      acceptPendingPatch: { voterQ1: 'decision', voterOutcome: 'accepted_pending' },
    },
  ],
  'v-3': [
    { k: 'action', label: 'I filed the first appeal with the DEO/DM', patch: { voterAppealedRaw: 'pending', voterAppealed: 'pending' } },
    { k: 'closureq', label: 'I checked, and the decision was actually in my favour', pendingPatch: { voterOutcome: 'accepted_pending' } },
  ],
  'v-4': [
    {
      k: 'valence', label: 'The appeal was decided',
      rejectPatch: { voterAppealedRaw: 'decided', voterAppealed: 'decided' },
      acceptPendingPatch: { voterOutcome: 'accepted_pending' },
    },
  ],
  'v-5': [
    { k: 'action', label: 'I filed the second appeal with the state CEO', patch: { ceoAppeal: 'filed' } },
  ],
  'v-5-p': [
    { k: 'valence', label: 'The second appeal was decided', rejectDeadend: true, acceptPendingPatch: { voterOutcome: 'accepted_pending' } },
  ],
  'v-acc': [
    { k: 'event', label: "It's been a long time with no sign of it", patch: { voterOutcome: null } },
  ],
  'S-1': [
    { k: 'event', label: 'I got a notice asking for documents', patch: { sirQ1: 'notice' } },
  ],
  'S-2': [
    { k: 'event', label: 'I checked, and my name IS on the Draft Roll', patch: { sirQ1: 'roll_present' } },
    { k: 'event', label: 'I checked, and my name is NOT on the Draft Roll', patch: { sirQ1: 'roll_absent' } },
  ],
  'S-3': [
    { k: 'action', label: 'I filed Form 6 with the declaration and a document', patch: { form6Filed: 'yes' } },
  ],
  'S-4': [
    { k: 'action', label: 'I submitted the requested document to the BLO/ERO', patch: { sirDocsFiled: 'yes' } },
  ],
  'S-9': [
    { k: 'event', label: 'I checked, and my name IS on the Final Roll', patch: { sirQ1: 'final_present' } },
    { k: 'event', label: 'I checked, and my name is NOT on the Final Roll', patch: { sirQ1: 'final_absent' } },
  ],
}

describe('CHECKIN — the zipped table (design note 1)', () => {
  it('CHECKIN and the expected pairing table share the exact same key set', () => {
    expect(Object.keys(CHECKIN).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it('every key resolves to a shipped rule id or a shipped rule state id (same universe as CHECKIN_PATCHES)', () => {
    expect(Object.keys(CHECKIN).sort()).toEqual(Object.keys(CHECKIN_PATCHES).sort())
  })

  for (const [key, opts] of Object.entries(EXPECTED)) {
    it.each(opts.map((expected, i) => [i, expected] as const))(
      `${key}[%i] pairs the expected label, kind and full patch, position by position`,
      (i, expected) => {
        const actual = CHECKIN[key]?.opts[i]
        expect(actual, `CHECKIN['${key}'].opts[${i}] is missing`).toBeDefined()
        expect(actual!.label, `${key}[${i}].label`).toBe(expected.label)
        expect(actual!.k, `${key}[${i}].k`).toBe(expected.k)
        const { k: _ak, label: _al, ...actualPatch } = actual!
        const { k: _ek, label: _el, ...expectedPatch } = expected
        expect(actualPatch, `${key}[${i}] — the whole patch object`).toEqual(expectedPatch)
      },
    )
  }
})

describe('CHECKIN shape', () => {
  const SIX_KINDS = new Set<CheckinKind>(['event', 'action', 'resolved-rung', 'valence', 'closureq', 'deadend'])

  it('every CHECKIN_META option k is one of the six per-state kinds', () => {
    for (const [key, meta] of Object.entries(CHECKIN_META)) {
      meta.opts.forEach((o, i) => expect(SIX_KINDS.has(o.k), `${key}[${i}].k = "${o.k}"`).toBe(true))
    }
  })

  it("a valence option's zipped entry carries rejectPatch+acceptPendingPatch, or rejectDeadend", () => {
    const valences = Object.entries(CHECKIN)
      .flatMap(([key, cfg]) => cfg.opts.map((o, i) => [`${key}[${i}]`, o] as const))
      .filter(([, o]) => o.k === 'valence')
    expect(valences.length).toBeGreaterThan(0)
    for (const [at, o] of valences) {
      const hasRejectAccept = o.rejectPatch !== undefined && o.acceptPendingPatch !== undefined
      const hasDeadend = o.rejectDeadend === true
      expect(hasRejectAccept || hasDeadend, at).toBe(true)
    }
  })

  it("a deadend option's zipped entry carries no payload at all (state-dpg-r / state-dpg-p)", () => {
    const deadends = Object.entries(CHECKIN)
      .flatMap(([key, cfg]) => cfg.opts.map((o, i) => [`${key}[${i}]`, o] as const))
      .filter(([, o]) => o.k === 'deadend')
    expect(deadends.map(([at]) => at)).toEqual(['state-dpg-r[0]', 'state-dpg-p[1]'])
    for (const [at, o] of deadends) {
      const { k: _k, label: _l, ...payload } = o
      expect(payload, at).toEqual({})
    }
  })

  it("a resolved-rung option's zipped entry carries pendingPatch", () => {
    const rungs = Object.entries(CHECKIN)
      .flatMap(([key, cfg]) => cfg.opts.map((o, i) => [`${key}[${i}]`, o] as const))
      .filter(([, o]) => o.k === 'resolved-rung')
    expect(rungs.length).toBeGreaterThan(0)
    for (const [at, o] of rungs) expect(o.pendingPatch, at).toBeDefined()
  })
})

describe('key resolution (design note 2)', () => {
  it('SIR resolves via d.state', () => {
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })
    expect(d.ruleId).toBe('s-notice')
    expect(d.state).toBe('S-4')
    const cfg = CHECKIN[d.state] ?? (d.ruleId ? CHECKIN[d.ruleId] : undefined)
    expect(cfg).toBe(CHECKIN['S-4'])
  })

  it('passport resolves via d.ruleId (its state values never appear as CHECKIN keys)', () => {
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(d.ruleId).toBe('state-1')
    expect(d.state).toBe('1')
    expect(CHECKIN[d.state]).toBeUndefined()
    const cfg = CHECKIN[d.state] ?? (d.ruleId ? CHECKIN[d.ruleId] : undefined)
    expect(cfg).toBe(CHECKIN['state-1'])
  })

  it(
    "voter 'v-4' resolves ONLY because JS object keys are case-sensitive — this is the thin-margin " +
    'case (design notes 2 & 14): a well-meaning .toLowerCase() on either side of the lookup would ' +
    'silently break it',
    () => {
      const d = diagnose(voterEngine, { voterQ1: 'decision', voterAppealed: 'pending' })
      expect(d.ruleId).toBe('v-4')
      expect(d.state).toBe('V-4')
      expect(
        CHECKIN_META['V-4'],
        "CHECKIN_META keys by the lowercase rule id ('v-4'), not the capitalised diagnosis state " +
        "('V-4'). This lookup MUST miss — if it ever starts matching, a case-normalisation change " +
        'has silently merged two lookups that must stay distinct.',
      ).toBeUndefined()
      const cfg = CHECKIN[d.state] ?? (d.ruleId ? CHECKIN[d.ruleId] : undefined)
      expect(
        cfg,
        "the ?? CHECKIN[d.ruleId] fallback must be what resolves 'v-4' here, since CHECKIN[d.state] " +
        "('V-4') just failed above",
      ).toBe(CHECKIN['v-4'])
    },
  )

  it('passport d.state values never collide with a SIR CHECKIN key', () => {
    const SIR_KEYS = new Set(['S-1', 'S-2', 'S-3', 'S-4', 'S-9'])
    const passportStates = [...passportPlaybook.rules.map(r => r.state), passportPlaybook.fallback.state]
    expect(passportStates).toContain('1')
    expect(passportStates).toContain('5a·W')
    for (const s of passportStates) expect(SIR_KEYS.has(s), s).toBe(false)
  })
})

describe('checkinOptionsFor', () => {
  it('prepAware state with a prep plan: notdone leads when no step is checked yet', () => {
    const d = diagnose(passportEngine, { q1: 'verified_no_progress', q2: 'no_followup' })
    expect(d.ruleId).toBe('state-3')
    expect(CHECKIN['state-3'].prepAware).toBe(true)
    expect(prepPlanFor(d)).toBeDefined()

    const opts = checkinOptionsFor(d, {}, 'passport')
    expect(opts[0].k).toBe('notdone')
    expect(opts.slice(-3).map(o => o.k)).toEqual(['nothing', 'deliverable', 'else'])
  })

  it('the same prepAware state with one step checked: notdone is absent, everything else unchanged', () => {
    const d = diagnose(passportEngine, { q1: 'verified_no_progress', q2: 'no_followup' })
    const withNone = checkinOptionsFor(d, {}, 'passport')
    const withOne = checkinOptionsFor(d, { 0: true }, 'passport')

    expect(withOne.some(o => o.k === 'notdone')).toBe(false)
    expect(withOne).toEqual(withNone.filter(o => o.k !== 'notdone'))
  })

  it('a non-prepAware state never yields notdone, even with prepChecks = {} (state-2, not state-1)', () => {
    const d = diagnose(passportEngine, { q1: 'contacted_incomplete', q2: 'no_followup' })
    expect(d.ruleId).toBe('state-2')
    expect(CHECKIN['state-2'].prepAware).toBeUndefined()
    // state-2 DOES have a PREP entry — this is what isolates the prepAware
    // flag. state-1 has neither prepAware nor a prep plan, so it would pass
    // this assertion for two confounded reasons and prove nothing.
    expect(prepPlanFor(d)).toBeDefined()

    const opts = checkinOptionsFor(d, {}, 'passport')
    expect(opts.some(o => o.k === 'notdone')).toBe(false)
  })

  it('state-1 (neither prepAware nor a prep plan) also never yields notdone', () => {
    const d = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
    expect(d.ruleId).toBe('state-1')
    expect(prepPlanFor(d)).toBeUndefined()
    expect(checkinOptionsFor(d, {}, 'passport').some(o => o.k === 'notdone')).toBe(false)
  })

  it('an UNCLASSIFIED diagnosis yields exactly nothing / deliverable / else', () => {
    const d = diagnose(passportEngine, { q1: 'not_sure' })
    expect(d.ruleId).toBeNull()
    const opts = checkinOptionsFor(d, {}, 'passport')
    expect(opts.map(o => o.k)).toEqual(['nothing', 'deliverable', 'else'])
    expect(opts.map(o => o.label)).toEqual([
      'Nothing yet',
      DELIVERABLE_LABEL.passport,
      'Something else happened',
    ])
  })

  it('a real matched diagnosis whose rule ships no CHECKIN config also yields exactly nothing / deliverable / else', () => {
    // s-4-p ('S-4·W') is a real, matched SIR rule (first-match-wins on
    // sirDocsFiled === 'yes') with no CHECKIN_META entry under either its
    // rule id or its state — this exercises the `cfg` undefined branch on a
    // REAL matched diagnosis, distinct from the UNCLASSIFIED path above
    // (which never even reaches a matched rule).
    const d = diagnose(sirEngine, { sirDocsFiled: 'yes' })
    expect(d.ruleId).toBe('s-4-p')
    expect(d.state).toBe('S-4·W')
    expect(CHECKIN[d.state]).toBeUndefined()
    expect(CHECKIN[d.ruleId!]).toBeUndefined()
    expect(checkinOptionsFor(d, {}, 'sir').map(o => o.k)).toEqual(['nothing', 'deliverable', 'else'])
  })

  it('deliverable label resolves per engineKey', () => {
    const d = diagnose(voterEngine, { voterQ1: 'not_sure' })
    const opts = checkinOptionsFor(d, {}, 'voter')
    const deliverable = opts.find(o => o.k === 'deliverable')
    expect(deliverable?.label).toBe(DELIVERABLE_LABEL.voter)
  })
})

describe('per-service copy maps', () => {
  const SERVICE_KEYS: ServiceKey[] = ['passport', 'voter', 'sir']

  it.each([
    ['DELIVERABLE_LABEL', DELIVERABLE_LABEL],
    ['DELIVERABLE_Q', DELIVERABLE_Q],
    ['CLOSED_TITLE', CLOSED_TITLE],
  ] as const)('%s has exactly the three ServiceKey entries, no more, no fewer', (_name, map) => {
    expect(Object.keys(map).sort()).toEqual([...SERVICE_KEYS].sort())
  })
})

describe('check-in copy passes the same content-safety scan as rule/prep copy (§7)', () => {
  it.each(PLAYBOOKS.map(p => [p.serviceId, p] as const))('%s check-in copy is clean', (_id, playbook) => {
    expect(guardrailFindings(playbook, {
      currentPhaseId: playbook.serviceId === 'sir' ? SIR_STATES.delhi.phase!.id : 'none',
      extra: checkinCopyExtras(playbook),
    })).toEqual([])
  })

  it('the sweep is not vacuous — every playbook contributes check-in copy locations', () => {
    for (const p of PLAYBOOKS) expect(checkinCopyExtras(p).length, p.serviceId).toBeGreaterThan(0)
  })

  it('check-in copy joins the retired-action scan, under the live SIR phase', () => {
    expect(retiredActionFindings(sirPlaybook, SIR_STATES.delhi.phase!.id, checkinCopyExtras(sirPlaybook))).toEqual([])
  })
})

describe('completeness pin (design note 6)', () => {
  it('the union of at values across the three checkinCopyExtras(playbook) calls covers every CHECKIN_PATCHES key', () => {
    const ats = PLAYBOOKS.flatMap(checkinCopyExtras).map(c => c.at)
    for (const at of ats) expect(at, at).toMatch(/^(passport|voter|sir):/)
    for (const key of Object.keys(CHECKIN_PATCHES)) {
      const covered = ats.some(a => a.includes(`CHECKIN.${key}.opts[`))
      expect(
        covered,
        `CHECKIN_PATCHES['${key}'] has no checkinCopyExtras entry — orphan key: either a config for ` +
        'a rule no playbook ships, or a resolution mismatch between rule.state/rule.id and CHECKIN_META.',
      ).toBe(true)
    }
  })
})

describe('checkinOptions.ts is playbook DATA — the isolation rule holds by construction', () => {
  it('exports a flattener whose entries all carry a serviceId prefix', () => {
    for (const p of PLAYBOOKS) {
      for (const c of checkinCopyExtras(p)) expect(c.at).toMatch(new RegExp(`^${p.serviceId}:`))
    }
  })
})
