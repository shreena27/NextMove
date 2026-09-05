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
type PatchField = (typeof PAYLOAD_KEYS)[number]

/** Resolves the SHIPPED patch straight out of CHECKIN_PATCHES, keyed by the
 *  option's own key/index/field, instead of a hand-typed literal in the test
 *  table. This is what makes the post-patch assertions below self-pinning: a
 *  future edit that swaps patch<->pendingPatch, reorders options within a
 *  CHECKIN_PATCHES key, or changes a payload value now fails HERE (a shape
 *  mismatch or a different resulting diagnosis), not silently, since the old
 *  hardcoded literal would have kept matching whatever was typed by hand at
 *  test-authoring time regardless of what actually shipped. */
function shippedPatch(key: string, index: number, field: PatchField): Record<string, string | null> {
  const opt = CHECKIN_PATCHES[key]?.[index]
  const patch = opt?.[field]
  if (!patch) {
    throw new Error(`CHECKIN_PATCHES['${key}'][${index}].${field} is not defined — check the row's key/index/field.`)
  }
  return patch
}

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
    ['state-1', 0, 'patch', 'state-2', { q1: 'no_contact', q2: 'no_followup' }],
    ['state-1', 1, 'patch', 'state-3', { q1: 'no_contact', q2: 'no_followup' }],
    ['state-1', 2, 'patch', 'state-4', { q1: 'no_contact', q2: 'no_followup' }],
    ['state-2', 2, 'patch', 'state-5a-p', { q1: 'contacted_incomplete', q2: 'no_followup' }],
    ['state-3', 0, 'patch', 'state-5a-p', { q1: 'verified_no_progress', q2: 'no_followup' }],
    ['state-4', 0, 'patch', 'state-5a-p', { q1: 'adverse', q2: 'no_followup' }],
    ['state-5a-p', 0, 'pendingPatch', 'state-5a-r', { q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }],
    ['state-5a-p', 1, 'patch', 'state-5a', { q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }],
    ['state-5a-p', 2, 'patch', 'state-5a', { q1: 'no_contact', q2: 'informal', fOutcome: 'pending' }],
    ['state-5a-r', 0, 'patch', 'state-5a', { q1: 'no_contact', q2: 'informal', fOutcome: 'resolved' }],
    ['state-5a', 0, 'patch', 'state-5b-p', { q1: 'no_contact', q2: 'informal' }],
    ['state-5b-p', 0, 'pendingPatch', 'state-5b-r', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'pending' }],
    ['state-5b-p', 1, 'patch', 'state-5b', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'pending' }],
    ['state-5b-p', 2, 'patch', 'state-5b', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'pending' }],
    ['state-5b-r', 0, 'patch', 'state-5b', { q1: 'no_contact', q2: 'formal_grievance', gOutcome: 'resolved' }],
    ['state-5b', 0, 'patch', 'state-dpg-p', { q1: 'no_contact', q2: 'formal_grievance' }],
    ['state-dpg-p', 0, 'pendingPatch', 'state-dpg-r', { q1: 'no_contact', q2: 'formal_grievance', dpgFiled: 'yes' }],
  ] as [string, number, PatchField, string, Record<string, string>][])(
    '%s[%i].%s reads %s after the SHIPPED patch',
    (key, index, field, expected, answers) => {
      const patch = shippedPatch(key, index, field)
      expect(diagnose(passportEngine, applyEvent(answers, patch)).ruleId).toBe(expected)
    },
  )

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
    ['v-1', 0, 'patch', 'v-2', { voterQ1: 'no_word' }],
    ['v-1', 1, 'rejectPatch', 'v-3', { voterQ1: 'no_word' }],
    ['v-1', 1, 'acceptPendingPatch', 'v-acc', { voterQ1: 'no_word' }],
    ['v-2', 0, 'rejectPatch', 'v-3', { voterQ1: 'blo_visited' }],
    ['v-2', 0, 'acceptPendingPatch', 'v-acc', { voterQ1: 'blo_visited' }],
    ['v-3', 0, 'patch', 'v-4', { voterQ1: 'decision', voterAppealed: 'none' }],
    ['v-3', 1, 'pendingPatch', 'v-acc', { voterQ1: 'decision', voterAppealed: 'none' }],
    ['v-4', 0, 'rejectPatch', 'v-5', { voterQ1: 'decision', voterAppealed: 'pending' }],
    ['v-4', 0, 'acceptPendingPatch', 'v-acc', { voterQ1: 'decision', voterAppealed: 'pending' }],
    ['v-5', 0, 'patch', 'v-5-p', { voterQ1: 'decision', voterAppealed: 'decided' }],
    ['v-5-p', 0, 'acceptPendingPatch', 'v-acc', { voterQ1: 'decision', voterAppealed: 'decided', ceoAppeal: 'filed' }],
    ['v-acc', 0, 'patch', 'v-3', { voterQ1: 'decision', voterOutcome: 'accepted_pending' }],
  ] as [string, number, PatchField, string, Record<string, string>][])(
    '%s[%i].%s reads %s after the SHIPPED patch',
    (key, index, field, expected, answers) => {
      const patch = shippedPatch(key, index, field)
      expect(diagnose(voterEngine, applyEvent(answers, patch)).ruleId).toBe(expected)
    },
  )

  it("deleting a stale favourable outcome returns the case to the citizen's own answers, not to the start", () => {
    const next = applyEvent({ voterQ1: 'decision', voterAppealed: 'none', voterOutcome: 'accepted_pending' }, { voterOutcome: null })
    expect(diagnose(voterEngine, next).ruleId).toBe('v-3')
    expect(next.voterQ1).toBe('decision')
  })
})

describe('sir post-patch assertions', () => {
  it.each([
    ['S-1', 0, 'patch', 's-notice', { sirQ1: 'roll_present' }],
    ['S-2', 0, 'patch', 's-roll-present', { sirQ1: 'roll_unchecked' }],
    ['S-2', 1, 'patch', 's-roll-absent', { sirQ1: 'roll_unchecked' }],
    ['S-3', 0, 'patch', 's-3-p', { sirQ1: 'roll_absent' }],
    ['S-4', 0, 'patch', 's-4-p', { sirQ1: 'notice' }],
    ['S-9', 0, 'patch', 's-final-present', { sirQ1: 'final_unchecked' }],
    ['S-9', 1, 'patch', 's-final-absent', { sirQ1: 'final_unchecked' }],
  ] as [string, number, PatchField, string, Record<string, string>][])(
    '%s[%i].%s reads %s after the SHIPPED patch',
    (key, index, field, expected, answers) => {
      const patch = shippedPatch(key, index, field)
      expect(diagnose(sirEngine, applyEvent(answers, patch)).ruleId).toBe(expected)
    },
  )

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
