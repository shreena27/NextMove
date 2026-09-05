import { describe, it, expect } from 'vitest'
import { CHECKIN_PATCHES } from './checkinPatches'
import { applyEvent } from './answers'
import { diagnose } from './engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { passportPlaybook } from '../playbooks/passportPlaybook'
import { voterPlaybook } from '../playbooks/voterPlaybook'
import { sirPlaybook } from '../playbooks/sirPlaybook'

const ALL = [passportPlaybook, voterPlaybook, sirPlaybook]
const PAYLOAD_KEYS = ['patch', 'pendingPatch', 'rejectPatch', 'acceptPendingPatch'] as const

describe('CHECKIN_PATCHES shape', () => {
  it('carries payloads only — never a label, a kind, or a prepAware flag (those are C5)', () => {
    const allowed = new Set([...PAYLOAD_KEYS, 'rejectDeadend'])
    for (const [key, opts] of Object.entries(CHECKIN_PATCHES)) {
      for (const [i, opt] of opts.entries()) {
        for (const k of Object.keys(opt)) {
          expect(allowed.has(k as never), `${key}[${i}].${k}`).toBe(true)
        }
      }
    }
  })

  it('keys every entry to a shipped rule id or a shipped rule state id', () => {
    const ids = new Set(ALL.flatMap(p => p.rules.map(r => r.id)))
    const states = new Set(ALL.flatMap(p => p.rules.map(r => r.state)))
    for (const key of Object.keys(CHECKIN_PATCHES)) {
      expect(ids.has(key) || states.has(key), `CHECKIN_PATCHES["${key}"]`).toBe(true)
    }
  })

  it('does not carry the phase-retired duplicate-registration check-in', () => {
    expect(CHECKIN_PATCHES['S-6']).toBeUndefined()
  })

  it('only the two dead-end options carry no payload at all', () => {
    const payloadFree = Object.entries(CHECKIN_PATCHES)
      .flatMap(([key, opts]) => opts.map((o, i) => [`${key}[${i}]`, o] as const))
      .filter(([, o]) => !PAYLOAD_KEYS.some(k => o[k]))
      .map(([at]) => at)
    expect(payloadFree).toEqual(['state-dpg-r[0]', 'state-dpg-p[1]'])
  })

  it("v-5-p's reject branch is a declared dead end, not a patch", () => {
    expect(CHECKIN_PATCHES['v-5-p'][0].rejectDeadend).toBe(true)
    expect(CHECKIN_PATCHES['v-5-p'][0].rejectPatch).toBeUndefined()
  })
})

describe('passport post-patch assertions', () => {
  it.each([
    ['state-1[0]', { q1: 'no_contact', q2: 'no_followup' }, { q1: 'contacted_incomplete' }, 'state-2'],
    ['state-1[1]', { q1: 'no_contact', q2: 'no_followup' }, { q1: 'verified_no_progress' }, 'state-3'],
    ['state-1[2]', { q1: 'no_contact', q2: 'no_followup' }, { q1: 'adverse' }, 'state-4'],
    ['state-2[2]', { q1: 'contacted_incomplete', q2: 'no_followup' }, { q2: 'informal', fOutcome: 'pending' }, 'state-5a-p'],
    ['state-3[0]', { q1: 'verified_no_progress', q2: 'no_followup' }, { q2: 'informal', fOutcome: 'pending' }, 'state-5a-p'],
    ['state-4[0]', { q1: 'adverse', q2: 'no_followup' }, { q2: 'informal', fOutcome: 'pending' }, 'state-5a-p'],
    ['state-5a-p[0]', { q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }, { fOutcome: 'resolved' }, 'state-5a-r'],
    ['state-5a-p[1]', { q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }, { fOutcome: 'unhelpful' }, 'state-5a'],
    ['state-5a-p[2]', { q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }, { fOutcome: 'no_response' }, 'state-5a'],
    ['state-5a-r[0]', { q1: 'no_contact', q2: 'informal', fOutcome: 'resolved' }, { fOutcome: null }, 'state-5a'],
    ['state-5a[0]', { q1: 'no_contact', q2: 'informal' }, { q2: 'formal_grievance', gOutcome: 'pending' }, 'state-5b-p'],
    ['state-5b-p[0]', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'pending' }, { gOutcome: 'resolved' }, 'state-5b-r'],
    ['state-5b-p[1]', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'pending' }, { gOutcome: 'unhelpful' }, 'state-5b'],
    ['state-5b-p[2]', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'pending' }, { gOutcome: 'no_response' }, 'state-5b'],
    ['state-5b-r[0]', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'resolved' }, { gOutcome: null }, 'state-5b'],
    ['state-5b[0]', { q1: 'no_contact', q2: 'formal_grievance' }, { dpgFiled: 'yes' }, 'state-dpg-p'],
    ['state-dpg-p[0]', { q1: 'no_contact', q2: 'formal_grievance', dpgFiled: 'yes' }, { dpgOutcome: 'resolved' }, 'state-dpg-r'],
  ])('%s reads %s after the patch', (_at, answers, patch, expected) => {
    expect(diagnose(passportEngine, applyEvent(answers, patch)).ruleId).toBe(expected)
  })

  it('an unhelpful or unanswered follow-up climbs the ladder, never descends it', () => {
    for (const outcome of ['unhelpful', 'no_response']) {
      const next = applyEvent({ q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }, { fOutcome: outcome })
      const d = diagnose(passportEngine, next)
      expect(d.ruleId, outcome).toBe('state-5a')
      expect(d.rec, outcome).toBe('FOLLOW_UP') // "make it formal", not "wait again"
      expect(next.q2, outcome).toBe('informal') // the rung is consumed, not erased
    }
  })
})

describe('voter post-patch assertions', () => {
  it.each([
    ['v-1[0]', { voterQ1: 'no_word' }, { voterQ1: 'blo_visited' }, 'v-2'],
    ['v-1[1] reject', { voterQ1: 'no_word' }, { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' }, 'v-3'],
    ['v-1[1] acceptPending', { voterQ1: 'no_word' }, { voterQ1: 'decision', voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-2[0] reject', { voterQ1: 'blo_visited' }, { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' }, 'v-3'],
    ['v-2[0] acceptPending', { voterQ1: 'blo_visited' }, { voterQ1: 'decision', voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-3[0]', { voterQ1: 'decision', voterAppealed: 'none' }, { voterAppealedRaw: 'pending', voterAppealed: 'pending' }, 'v-4'],
    ['v-3[1]', { voterQ1: 'decision', voterAppealed: 'none' }, { voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-4[0] reject', { voterQ1: 'decision', voterAppealed: 'pending' }, { voterAppealedRaw: 'decided', voterAppealed: 'decided' }, 'v-5'],
    ['v-4[0] acceptPending', { voterQ1: 'decision', voterAppealed: 'pending' }, { voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-5[0]', { voterQ1: 'decision', voterAppealed: 'decided' }, { ceoAppeal: 'filed' }, 'v-5-p'],
    ['v-5-p[0] acceptPending', { voterQ1: 'decision', voterAppealed: 'decided', ceoAppeal: 'filed' }, { voterOutcome: 'accepted_pending' }, 'v-acc'],
    ['v-acc[0]', { voterQ1: 'decision', voterOutcome: 'accepted_pending' }, { voterOutcome: null }, 'v-3'],
  ])('%s reads %s after the patch', (_at, answers, patch, expected) => {
    expect(diagnose(voterEngine, applyEvent(answers, patch)).ruleId).toBe(expected)
  })

  it("deleting a stale favourable outcome returns the case to the citizen's own answers, not to the start", () => {
    const next = applyEvent({ voterQ1: 'decision', voterAppealed: 'none', voterOutcome: 'accepted_pending' }, { voterOutcome: null })
    expect(diagnose(voterEngine, next).ruleId).toBe('v-3')
    expect(next.voterQ1).toBe('decision')
  })
})

describe('sir post-patch assertions', () => {
  it.each([
    ['S-1[0]', { sirQ1: 'roll_present' }, { sirQ1: 'notice' }, 's-notice'],
    ['S-2[0]', { sirQ1: 'roll_unchecked' }, { sirQ1: 'roll_present' }, 's-roll-present'],
    ['S-2[1]', { sirQ1: 'roll_unchecked' }, { sirQ1: 'roll_absent' }, 's-roll-absent'],
    ['S-3[0]', { sirQ1: 'roll_absent' }, { form6Filed: 'yes' }, 's-3-p'],
    ['S-4[0]', { sirQ1: 'notice' }, { sirDocsFiled: 'yes' }, 's-4-p'],
    ['S-9[0]', { sirQ1: 'final_unchecked' }, { sirQ1: 'final_present' }, 's-final-present'],
    ['S-9[1]', { sirQ1: 'final_unchecked' }, { sirQ1: 'final_absent' }, 's-final-absent'],
  ])('%s reads %s after the patch', (_at, answers, patch, expected) => {
    expect(diagnose(sirEngine, applyEvent(answers, patch)).ruleId).toBe(expected)
  })

  it('a filed action lands on a WAIT rung, never re-issues the action just taken', () => {
    expect(diagnose(sirEngine, applyEvent({ sirQ1: 'roll_absent' }, { form6Filed: 'yes' })).rec).toBe('WAIT')
    expect(diagnose(sirEngine, applyEvent({ sirQ1: 'notice' }, { sirDocsFiled: 'yes' })).rec).toBe('WAIT')
  })
})

describe('outcome-value coverage', () => {
  it('exercises every outcome value the prototype options actually write', () => {
    const written = new Set<string>()
    for (const opts of Object.values(CHECKIN_PATCHES)) {
      for (const opt of opts) {
        for (const k of PAYLOAD_KEYS) {
          for (const [key, value] of Object.entries(opt[k] ?? {})) written.add(`${key}=${value}`)
        }
      }
    }
    for (const expected of [
      'fOutcome=pending', 'fOutcome=resolved', 'fOutcome=unhelpful', 'fOutcome=no_response', 'fOutcome=null',
      'gOutcome=pending', 'gOutcome=resolved', 'gOutcome=unhelpful', 'gOutcome=no_response', 'gOutcome=null',
      'dpgFiled=yes', 'dpgOutcome=resolved',
      'voterOutcome=accepted_pending', 'voterOutcome=null', 'ceoAppeal=filed',
      'form6Filed=yes', 'sirDocsFiled=yes',
    ]) {
      expect(written, expected).toContain(expected)
    }
  })
})
