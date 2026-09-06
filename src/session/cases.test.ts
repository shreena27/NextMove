import { describe, it, expect } from 'vitest'
import type { AnswerRecord, Diagnosis } from '../domain/types'
import type { Casefile, ServiceKey } from '../domain/casefile'
import { caseSnapshot, LOG_COPY } from '../domain/casefile'
import { diagnose } from '../domain/engine'
import type { ServiceEngine } from '../domain/engine'
import { applyCorrection, applyEvent } from '../domain/answers'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { PASSPORT_DEPS } from '../playbooks/passportPlaybook'
import { checkinOptionsFor, type CheckinOption } from '../domain/checkinOptions'
import { ladderFor } from '../templates/ladder'
import {
  activeCase, sameAnswers, caseIsSaved, loadCase, openCheckin, beginWorkingCheckin, completeSave,
  appendLog, ciChoose, ciConfirm, ciValence, ciClosureAnswer, ciUndo, ciCancel,
} from './cases'
import type { OpenCheckinFragment, BeginWorkingFragment, CiSnapshot } from './cases'

const NOW = 1_725_000_000_000

// state-5a (FOLLOW_UP, "Followed up informally, unresolved") and state-4
// (FOLLOW_UP, "Adverse or unclear outcome") — two real passport diagnoses
// with different labels, confirmed against passportPlaybook.test.ts's own
// rule table. Never hand-typed as label strings below — every assertion
// against a label goes through a real diagnose() call.
const PASSPORT_ANSWERS: AnswerRecord = { q1: 'adverse', q2: 'informal' }
const PASSPORT_ANSWERS_2: AnswerRecord = { q1: 'adverse', q2: 'no_followup' }

function passportSnap(answers: AnswerRecord, prepChecks: Record<number, boolean> = {}, now = NOW) {
  return caseSnapshot('passport', 'Passport', 'passport-nextmove', diagnose(passportEngine, answers), answers, prepChecks, now)
}

function savedCase(answers: AnswerRecord, overrides: Partial<Casefile> = {}): Casefile {
  const snap = passportSnap(answers)
  return {
    ...snap,
    id: 'c1',
    outcome: 'still_open',
    lastCheck: null,
    remindAt: null,
    log: [{ t: NOW, kind: 'diagnosed', text: snap.stateLabel }],
    ...overrides,
  }
}

// The case-relevant slice of SessionState, minimal-but-real (every field a
// beginWorkingCheckin/completeSave input actually reads — see cases.ts's
// own signatures), so tests can build inputs without constructing a whole
// SessionState (design note 1's own stated purpose).
const BASE = {
  savedCases: [] as Casefile[],
  workingCase: null as Casefile | null,
  answers: {} as AnswerRecord,
  prepChecks: {} as Record<number, boolean>,
}

const PASSPORT_PAYLOAD = {
  engineKey: 'passport' as const,
  serviceLabel: 'Passport',
  returnScreen: 'passport-nextmove',
  now: NOW,
}

function assertOpened(f: OpenCheckinFragment | BeginWorkingFragment): asserts f is OpenCheckinFragment {
  if ('workingCase' in f) {
    throw new Error('expected beginWorkingCheckin to redirect into the matching saved case, not create a working one')
  }
}

function assertBeginWorking(f: OpenCheckinFragment | BeginWorkingFragment): asserts f is BeginWorkingFragment {
  if (!('workingCase' in f)) {
    throw new Error('expected beginWorkingCheckin to create/reuse a working case, not redirect to a saved one')
  }
}

// ---------------------------------------------------------------------------
// Task 6 fixtures: the check-in state machine. Every walk below drives the
// real diagnose()/checkinOptionsFor() pipeline — never a hand-built
// Diagnosis — per the brief's own instruction.
// ---------------------------------------------------------------------------

/** Builds a saved case for any of the three engines, real diagnose() + real
 *  caseSnapshot(), the same shape savedCase() above builds for passport
 *  only. `id` defaults to 'c1' (savedCase()'s own default) unless overridden. */
function caseFor(
  engineKey: ServiceKey,
  engine: ServiceEngine,
  serviceLabel: string,
  returnScreen: string,
  answers: AnswerRecord,
  overrides: Partial<Casefile> = {},
  prepChecks: Record<number, boolean> = {},
  now = NOW,
): Casefile {
  const d = diagnose(engine, answers)
  const snap = caseSnapshot(engineKey, serviceLabel, returnScreen, d, answers, prepChecks, now)
  return {
    ...snap,
    id: 'c1',
    outcome: 'still_open',
    lastCheck: null,
    remindAt: null,
    log: [{ t: now, kind: 'diagnosed', text: snap.stateLabel }],
    ...overrides,
  }
}

/** The minimal-but-real check-in-relevant session slice every ciChoose/
 *  ciConfirm/ciValence/ciClosureAnswer/ciUndo test below builds and chains
 *  fragments onto (design note 1's own stated purpose — see this file's own
 *  header comment on BASE above). `c` becomes the SOLE saved case (or, with
 *  `working=true`, the working case) so `activeCase()` resolves it. */
interface CiTestState {
  answers: AnswerRecord
  prepChecks: Record<number, boolean>
  activeCaseId: string | null
  workingCase: Casefile | null
  savedCases: Casefile[]
  ciPending: CheckinOption | null
  ciPendingIdx: number | null
  ciStage: 'confirm' | 'valence' | 'closureq' | null
  ciReassure: boolean
  ciSnapshot: CiSnapshot | null
  ciJustUpdated: boolean
  ciConsecutive: boolean
  ciAccepted: boolean
}

function sessionFor(c: Casefile, working = false): CiTestState {
  return {
    answers: { ...c.answers },
    prepChecks: { ...c.prepChecks },
    activeCaseId: working ? 'working' : c.id,
    workingCase: working ? c : null,
    savedCases: working ? [] : [c],
    ciPending: null, ciPendingIdx: null, ciStage: null, ciReassure: false,
    ciSnapshot: null, ciJustUpdated: false, ciConsecutive: false, ciAccepted: false,
  }
}

/** Finds a real checkinOptionsFor(...) option by its exact label — every
 *  test below picks an option the same way the checkin screen itself would
 *  (by what's actually offered), never by a hand-typed index. */
function optIndex(d: Diagnosis, prepChecks: Record<number, boolean>, engineKey: ServiceKey, label: string): number {
  const i = checkinOptionsFor(d, prepChecks, engineKey).findIndex(o => o.label === label)
  if (i === -1) {
    throw new Error(`checkinOptionsFor(${engineKey}, state ${d.state}) has no option labeled ${JSON.stringify(label)}`)
  }
  return i
}

describe('activeCase (design note 2)', () => {
  it("resolves the working sentinel, a saved id, and null for an unknown id", () => {
    const working = savedCase(PASSPORT_ANSWERS, { id: 'working', unsaved: true })
    const saved = savedCase(PASSPORT_ANSWERS_2, { id: 'c1' })
    const state = { activeCaseId: 'working', workingCase: working, savedCases: [saved] }

    expect(activeCase(state)).toBe(working)
    expect(activeCase({ ...state, activeCaseId: 'c1' })).toBe(saved)
    expect(activeCase({ ...state, activeCaseId: 'unknown' })).toBeNull()
  })
})

describe('beginWorkingCheckin (design note 3)', () => {
  it("with an identical still-open saved case, opens that case instead — activeCaseId is the saved case's id, workingCase is left untouched (null here)", () => {
    const saved = savedCase(PASSPORT_ANSWERS, { id: 'c-saved' })
    const fragment = beginWorkingCheckin(
      { ...BASE, savedCases: [saved], answers: { ...PASSPORT_ANSWERS } },
      PASSPORT_PAYLOAD,
    )

    assertOpened(fragment)
    expect(fragment.activeCaseId).toBe('c-saved')
    expect('workingCase' in fragment).toBe(false)
  })

  it('twice with unchanged answers keeps the SAME working-case object identity and does not re-seed the log', () => {
    const state1 = { ...BASE, answers: { ...PASSPORT_ANSWERS } }
    const fragment1 = beginWorkingCheckin(state1, PASSPORT_PAYLOAD)
    assertBeginWorking(fragment1)

    const state2 = { ...state1, ...fragment1 }
    const fragment2 = beginWorkingCheckin(state2, { ...PASSPORT_PAYLOAD, now: NOW + 60_000 })
    assertBeginWorking(fragment2)

    expect(fragment2.workingCase).toBe(fragment1.workingCase)
    expect(fragment2.workingCase.log).toHaveLength(1)
    expect(fragment2.workingCase.log).toEqual(fragment1.workingCase.log)
  })

  it('after the answers changed, replaces the working case and re-seeds a one-entry diagnosed log', () => {
    const state1 = { ...BASE, answers: { ...PASSPORT_ANSWERS } }
    const fragment1 = beginWorkingCheckin(state1, PASSPORT_PAYLOAD)
    assertBeginWorking(fragment1)

    const state2 = { ...state1, ...fragment1, answers: { ...PASSPORT_ANSWERS_2 } }
    const fragment2 = beginWorkingCheckin(state2, { ...PASSPORT_PAYLOAD, now: NOW + 60_000 })
    assertBeginWorking(fragment2)

    expect(fragment2.workingCase).not.toBe(fragment1.workingCase)
    expect(fragment2.workingCase.log).toHaveLength(1)
    expect(fragment2.workingCase.log[0].kind).toBe('diagnosed')
    expect(fragment2.workingCase.log[0].t).toBe(NOW + 60_000)
    expect(fragment2.workingCase.stateLabel).toBe(diagnose(passportEngine, PASSPORT_ANSWERS_2).label)
    expect(fragment2.workingCase.stateLabel).not.toBe(fragment1.workingCase.stateLabel)
  })

  it("the working case's seed entry text is the real diagnose(...).label, not a hand-typed string", () => {
    const d = diagnose(passportEngine, PASSPORT_ANSWERS)
    const fragment = beginWorkingCheckin({ ...BASE, answers: { ...PASSPORT_ANSWERS } }, PASSPORT_PAYLOAD)
    assertBeginWorking(fragment)
    expect(fragment.workingCase.log[0].text).toBe(d.label)
  })

  it("sets activeCaseId to the 'working' sentinel and clears ciStage/ciPending/ciReassure/ciJustUpdated/ciSnapshot (design note 3.3, Task 4 design note 5's third sibling)", () => {
    const fragment = beginWorkingCheckin({ ...BASE, answers: { ...PASSPORT_ANSWERS } }, PASSPORT_PAYLOAD)
    assertBeginWorking(fragment)
    expect(fragment.activeCaseId).toBe('working')
    expect(fragment.ciStage).toBeNull()
    expect(fragment.ciPending).toBeNull()
    expect(fragment.ciReassure).toBe(false)
    expect(fragment.ciJustUpdated).toBe(false)
    expect(fragment.ciSnapshot).toBeNull()
  })
})

describe('loadCase (design note 6)', () => {
  it('copies (does not alias) answers and prepChecks, and clears prepDraft', () => {
    const answers = { q1: 'adverse' }
    const prepChecks = { 0: true }
    const c = savedCase(PASSPORT_ANSWERS, { id: 'c1', answers, prepChecks })

    const fragment = loadCase([c], 'c1')

    expect(fragment).not.toBeNull()
    expect(fragment!.activeCaseId).toBe('c1')
    expect(fragment!.answers).toEqual(answers)
    expect(fragment!.answers).not.toBe(answers)
    expect(fragment!.prepChecks).toEqual(prepChecks)
    expect(fragment!.prepChecks).not.toBe(prepChecks)
    expect(fragment!.prepDraft).toBeNull()
  })

  it('returns null for an unknown id', () => {
    expect(loadCase([], 'nope')).toBeNull()
  })
})

describe('openCheckin (design note 3.1, Task 4 design note 5)', () => {
  it('loads the case and clears check-in interaction state, including ciSnapshot', () => {
    const c = savedCase(PASSPORT_ANSWERS, { id: 'c1' })
    const fragment = openCheckin([c], 'c1')

    expect(fragment).not.toBeNull()
    expect(fragment!.activeCaseId).toBe('c1')
    expect(fragment!.ciStage).toBeNull()
    expect(fragment!.ciPending).toBeNull()
    expect(fragment!.ciReassure).toBe(false)
    expect(fragment!.ciJustUpdated).toBe(false)
    expect(fragment!.ciSnapshot).toBeNull()
  })

  it("returns null for an unknown id (mirrors the prototype's if(!c) return)", () => {
    expect(openCheckin([], 'nope')).toBeNull()
  })
})

describe('completeSave (design note 4)', () => {
  it("with no existing case, unshifts a new case with a 'c'-prefixed id and outcome still_open", () => {
    const fragment = completeSave({ ...BASE, answers: { ...PASSPORT_ANSWERS } }, PASSPORT_PAYLOAD)

    expect(fragment.savedCases).toHaveLength(1)
    expect(fragment.savedCases[0].id).toBe('c' + NOW)
    expect(fragment.savedCases[0].outcome).toBe('still_open')
    expect(fragment.activeCaseId).toBe('c' + NOW)
    expect(fragment.workingCase).toBeNull()
  })

  it('with an existing still-open case of the same engine, updates in place — length unchanged, id unchanged, log = existing + working non-diagnosed + diagnosed-if-changed, in order', () => {
    const existing = savedCase(PASSPORT_ANSWERS, { id: 'c-existing' })
    const workingSnap = passportSnap(PASSPORT_ANSWERS_2)
    const working: Casefile = {
      ...workingSnap,
      id: 'working',
      unsaved: true,
      outcome: 'still_open',
      lastCheck: null,
      remindAt: null,
      log: [
        { t: NOW - 4000, kind: 'diagnosed', text: 'seed entry — must be stripped, this case is being merged' },
        { t: NOW - 1000, kind: 'checked', text: 'Checked in — no change reported', noChange: true },
      ],
    }
    expect(workingSnap.stateLabel).not.toBe(existing.stateLabel) // premise: the label really did change

    const fragment = completeSave(
      { savedCases: [existing], workingCase: working, answers: PASSPORT_ANSWERS_2, prepChecks: {} },
      PASSPORT_PAYLOAD,
    )

    expect(fragment.savedCases).toHaveLength(1)
    expect(fragment.savedCases[0].id).toBe('c-existing')
    expect(fragment.activeCaseId).toBe('c-existing')
    expect(fragment.workingCase).toBeNull()
    expect(fragment.savedCases[0].log).toEqual([
      existing.log[0],
      working.log[1],
      { t: NOW, kind: 'diagnosed', text: workingSnap.stateLabel },
    ])
  })

  it('when the label did not change, appends no diagnosed entry', () => {
    const existing = savedCase(PASSPORT_ANSWERS, { id: 'c-existing' })

    const fragment = completeSave(
      { savedCases: [existing], workingCase: null, answers: PASSPORT_ANSWERS, prepChecks: {} },
      { ...PASSPORT_PAYLOAD, now: NOW + 1000 },
    )

    expect(fragment.savedCases[0].log).toEqual(existing.log)
  })

  it("adopts a working case's lastCheck/remindAt onto a newly created case", () => {
    const working: Casefile = {
      ...passportSnap(PASSPORT_ANSWERS),
      id: 'working',
      unsaved: true,
      outcome: 'still_open',
      lastCheck: NOW - 86_400_000,
      remindAt: '2026-09-10',
      log: [{ t: NOW - 86_400_000, kind: 'diagnosed', text: 'seed' }],
    }

    const fragment = completeSave(
      { savedCases: [], workingCase: working, answers: PASSPORT_ANSWERS, prepChecks: {} },
      PASSPORT_PAYLOAD,
    )

    expect(fragment.savedCases[0].lastCheck).toBe(NOW - 86_400_000)
    expect(fragment.savedCases[0].remindAt).toBe('2026-09-10')
    expect(fragment.savedCases[0].log).toEqual(working.log)
  })

  it('never mutates the input savedCases array or any case object in it', () => {
    const existing = savedCase(PASSPORT_ANSWERS, { id: 'c-existing' })
    const savedCases = [existing]
    const clone = structuredClone(savedCases)

    completeSave(
      { savedCases, workingCase: null, answers: PASSPORT_ANSWERS_2, prepChecks: {} },
      PASSPORT_PAYLOAD,
    )

    expect(savedCases).toHaveLength(1)
    expect(savedCases[0]).toBe(existing) // same object reference — never mutated in place
    expect(savedCases).toEqual(clone) // deep-equal to the pre-call snapshot
  })

  it('two still-open cases for different engines both survive a save on one (SIR-alongside-passport)', () => {
    const sirAnswers: AnswerRecord = { sirState: 'delhi', sirQ1: 'notice' }
    const sirD = diagnose(sirEngine, sirAnswers)
    const sirSnap = caseSnapshot('sir', 'Voter roll (SIR)', 'sir-nextmove', sirD, sirAnswers, {}, NOW - 1000)
    const sirCase: Casefile = {
      ...sirSnap, id: 'c-sir', outcome: 'still_open', lastCheck: null, remindAt: null,
      log: [{ t: NOW - 1000, kind: 'diagnosed', text: sirSnap.stateLabel }],
    }
    const passportExisting = savedCase(PASSPORT_ANSWERS, { id: 'c-passport' })

    const fragment = completeSave(
      { savedCases: [sirCase, passportExisting], workingCase: null, answers: PASSPORT_ANSWERS_2, prepChecks: {} },
      PASSPORT_PAYLOAD,
    )

    expect(fragment.savedCases).toHaveLength(2)
    const sirAfter = fragment.savedCases.find(c => c.id === 'c-sir')
    expect(sirAfter).toEqual(sirCase) // completely untouched by a save on the OTHER engine
    const passportAfter = fragment.savedCases.find(c => c.id === 'c-passport')
    expect(passportAfter?.id).toBe('c-passport')
    expect(passportAfter?.stateLabel).toBe(diagnose(passportEngine, PASSPORT_ANSWERS_2).label)
  })
})

describe('D3 — key-order-independent answers comparison (deviation D3)', () => {
  // The reorder MUST come from the correction path (applyCorrection +
  // PASSPORT_DEPS), never from an applyEvent null-then-set round trip: a
  // null-patch always deletes the record's LAST key, and re-adding it
  // restores byte-identical insertion order — verified empirically, see
  // the brief/plan's own note. PASSPORT_DEPS = { q1: ['q2'] } deletes q2
  // (a MIDDLE key) when q1 changes, so re-adding it lands at the END.
  function reorderedFixture() {
    const saved = applyEvent({ q1: 'contacted_incomplete' }, { q2: 'informal', fOutcome: 'pending' })
    // insertion order: q1, q2, fOutcome
    let session = applyCorrection(saved, 'q1', 'adverse', PASSPORT_DEPS).answers // q2 deleted
    session = applyCorrection(session, 'q1', 'contacted_incomplete', PASSPORT_DEPS).answers
    session = applyCorrection(session, 'q2', 'informal', PASSPORT_DEPS).answers // q2 re-added, at the END
    // insertion order: q1, fOutcome, q2 — same entries, different order
    return { saved, session }
  }

  it('caseIsSaved matches a still-open case whose answers were reordered by the correction path', () => {
    const { saved, session } = reorderedFixture()
    expect(JSON.stringify(saved)).not.toBe(JSON.stringify(session)) // the premise: a real reorder

    const stillOpen: Casefile = {
      ...passportSnap(saved), id: 'c1', outcome: 'still_open', lastCheck: null, remindAt: null,
      log: [{ t: NOW, kind: 'diagnosed', text: 'seed' }],
    }
    expect(caseIsSaved({ savedCases: [stillOpen], answers: session }, 'passport')).toBe(true)
  })

  it('beginWorkingCheckin opens the matching saved case instead of creating a redundant one, even when the answers were reordered by the correction path (the other two D3 sites, design note 5)', () => {
    const { saved, session } = reorderedFixture()
    expect(JSON.stringify(saved)).not.toBe(JSON.stringify(session))

    const stillOpen: Casefile = {
      ...passportSnap(saved), id: 'c-saved', outcome: 'still_open', lastCheck: null, remindAt: null,
      log: [{ t: NOW - 1000, kind: 'diagnosed', text: 'seed' }],
    }
    const logBefore = stillOpen.log

    const fragment = beginWorkingCheckin(
      { ...BASE, savedCases: [stillOpen], answers: session },
      PASSPORT_PAYLOAD,
    )

    assertOpened(fragment)
    expect(fragment.activeCaseId).toBe('c-saved')
    expect('workingCase' in fragment).toBe(false) // untouched — stays null, never forced
    expect(stillOpen.log).toBe(logBefore) // unchanged — no redundant working case, no re-seed
  })

  it("the SAME shared comparison helper — the one updateEntry's routing decision (Task 11) will use — also resolves this reordered pair as a match, standalone, with no whole session or component required", () => {
    const { saved, session } = reorderedFixture()
    // updateEntry (Task 11) asks exactly this question — "does a still-open
    // case of this engine have the SAME answers as the session" — to
    // decide OPEN_CHECKIN vs BEGIN_WORKING_CHECKIN. It must use this exact
    // helper, not a reimplementation (design note 5): a fix applied to one
    // of the three D3 sites is a bug left standing in the other two.
    expect(sameAnswers(saved, session)).toBe(true)
  })
})

// =============================================================================
// Task 6 — the check-in interaction state machine. Prototype 2617-2724.
// =============================================================================

describe('appendLog (design note 4 — deliberate unification, NOT a transcription)', () => {
  it('stamps lastCheck on a "closed" append and a "reopened" append — the prototype does NOT do this for either: c.log.push(...) for both bypasses ciLog (2699/2728, 2185) and leaves c.lastCheck untouched; this port unifies every append through one helper for reasons this file\'s appendLog doc comment gives', () => {
    const c = savedCase(PASSPORT_ANSWERS, { id: 'c1', lastCheck: null })

    const closed = appendLog(c, { kind: 'closed', text: LOG_COPY.closedUnresolved }, NOW + 5000)
    expect(closed.lastCheck).toBe(NOW + 5000)
    expect(closed.log).toEqual([...c.log, { t: NOW + 5000, kind: 'closed', text: LOG_COPY.closedUnresolved }])

    const reopened = appendLog(c, { kind: 'reopened', text: LOG_COPY.reopened }, NOW + 6000)
    expect(reopened.lastCheck).toBe(NOW + 6000)
    expect(reopened.log).toEqual([...c.log, { t: NOW + 6000, kind: 'reopened', text: LOG_COPY.reopened }])
  })

  it('a noChange entry carries the flag; a plain entry does not carry the key at all', () => {
    const c = savedCase(PASSPORT_ANSWERS)
    const nothing = appendLog(c, { kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true }, NOW + 1000)
    expect(nothing.log.at(-1)).toEqual({ t: NOW + 1000, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true })
    const reported = appendLog(c, { kind: 'reported', text: 'x' }, NOW + 1000)
    expect(reported.log.at(-1)).not.toHaveProperty('noChange')
  })
})

describe('passport walk: state-1 -> state-2 (design notes 3-5)', () => {
  it('"Police contacted or visited me" confirms into state-2, preserves q2 (a fact), and logs reported-then-diagnosed in order', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const d0 = diagnose(passportEngine, answers)
    expect(d0.ruleId).toBe('state-1') // premise

    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'passport', 'Police contacted or visited me')
    const f1 = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f1.ciStage).toBe('confirm')
    const s1 = { ...s0, ...f1 }

    const f2 = ciConfirm(s1, NOW + 2000)!
    expect(f2.navigateTo).toBe('passport-diagnosis')
    const s2 = { ...s1, ...f2 }

    const after = diagnose(passportEngine, s2.answers)
    expect(after.ruleId).toBe('state-2')
    expect(s2.answers.q1).toBe('contacted_incomplete')
    expect(s2.answers.q2).toBe('no_followup') // the fact survived

    const updatedCase = s2.savedCases[0]
    expect(updatedCase.log.slice(1)).toEqual([
      { t: NOW + 2000, kind: 'reported', text: 'Police contacted or visited me' },
      { t: NOW + 2000, kind: 'diagnosed', text: after.label },
    ])
  })
})

describe('passport action attestation + ladder: state-5a -> state-5b-p -> state-5b -> state-dpg-p -> dead-end', () => {
  it('state-5a: "I filed the formal grievance..." confirms into state-5b-p (grievance pending WAIT)', () => {
    const d0 = diagnose(passportEngine, PASSPORT_ANSWERS)
    expect(d0.ruleId).toBe('state-5a') // premise (this file's own fixture comment)
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', PASSPORT_ANSWERS)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'passport', 'I filed the formal grievance on CPGRAMS and have a number')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    const f2 = ciConfirm(s1, NOW + 1100)!
    const after = diagnose(passportEngine, f2.answers!)
    expect(after.ruleId).toBe('state-5b-p')
    expect(after.rec).toBe('WAIT')
  })

  it('state-5b-p: "They responded, but it did not help" confirms into state-5b — the ladder does NOT climb itself (rung 2 done, rung 3 next — never "now")', () => {
    const answers: AnswerRecord = { q1: 'adverse', q2: 'formal_grievance', gOutcome: 'pending' }
    const d0 = diagnose(passportEngine, answers)
    expect(d0.ruleId).toBe('state-5b-p')
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'passport', 'They responded, but it did not help')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    const f2 = ciConfirm(s1, NOW + 1100)!
    const after = diagnose(passportEngine, f2.answers!)
    expect(after.ruleId).toBe('state-5b')

    const ladder = ladderFor('passport', f2.answers!, after)
    expect(ladder?.s[1]).toBe('done')
    expect(ladder?.s[2]).toBe('next')
  })

  it('state-5b: "I escalated to the DPG and have a reference number" confirms into state-dpg-p', () => {
    const answers: AnswerRecord = { q1: 'adverse', q2: 'formal_grievance', gOutcome: 'unhelpful' }
    const d0 = diagnose(passportEngine, answers)
    expect(d0.ruleId).toBe('state-5b')
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'passport', 'I escalated to the DPG and have a reference number')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    const f2 = ciConfirm(s1, NOW + 1100)!
    const after = diagnose(passportEngine, f2.answers!)
    expect(after.ruleId).toBe('state-dpg-p')
  })

  it('state-dpg-p: the deadend option navigates to dead-end, logs a reported entry, and leaves answers unchanged', () => {
    const answers: AnswerRecord = { q1: 'adverse', q2: 'formal_grievance', gOutcome: 'unhelpful', dpgFiled: 'yes' }
    const d0 = diagnose(passportEngine, answers)
    expect(d0.ruleId).toBe('state-dpg-p')
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'passport', 'The DPG responded, but it did not resolve anything')
    const f1 = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f1.ciStage).toBe('confirm')
    const s1 = { ...s0, ...f1 }

    const f2 = ciConfirm(s1, NOW + 1100)!
    expect(f2.navigateTo).toBe('dead-end')
    expect(f2.answers).toBeUndefined() // no patch applied at all
    const updated = f2.savedCases!.find(x => x.id === 'c1')!
    expect(updated.log.at(-1)).toEqual({ t: NOW + 1100, kind: 'reported', text: 'The DPG responded, but it did not resolve anything' })
    expect(updated.answers).toEqual(answers) // untouched
  })
})

describe('passport resolved rung: state-5a-p, "retire don\'t reset" (design note 8)', () => {
  const answers: AnswerRecord = { q1: 'adverse', q2: 'informal', fOutcome: 'pending' }

  it('closure "Not yet" applies the pendingPatch, lands back on a WAIT, and logs a "...deliverable still pending" entry', () => {
    const d0 = diagnose(passportEngine, answers)
    expect(d0.ruleId).toBe('state-5a-p')
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'passport', 'They responded and things are moving again')
    const f1 = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f1.ciStage).toBe('closureq')
    const s1 = { ...s0, ...f1 }

    const f2 = ciClosureAnswer(s1, false, NOW + 1100)!
    const after = diagnose(passportEngine, f2.answers!)
    expect(after.ruleId).toBe('state-5a-r') // id DID change (5a-p -> 5a-r), so a diagnosed entry follows
    expect(after.rec).toBe('WAIT')
    const updated = f2.savedCases!.find(x => x.id === 'c1')!
    expect(updated.log.at(-2)).toEqual({
      t: NOW + 1100, kind: 'reported',
      text: 'They responded and things are moving again' + LOG_COPY.pendingSuffix,
    })
    expect(updated.log.at(-1)).toEqual({ t: NOW + 1100, kind: 'diagnosed', text: after.label })
  })

  it('the SAME option, "Yes, it\'s done": outcome becomes deliverable_received, closedAt is set, a closed entry is appended, screen is case-closed', () => {
    const d0 = diagnose(passportEngine, answers)
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'passport', 'They responded and things are moving again')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }

    const f2 = ciClosureAnswer(s1, true, NOW + 1100)!
    expect(f2.navigateTo).toBe('case-closed')
    const updated = f2.savedCases!.find(x => x.id === 'c1')!
    expect(updated.outcome).toBe('deliverable_received')
    expect(updated.closedAt).toBe(NOW + 1100)
    expect(updated.log.at(-1)).toEqual({ t: NOW + 1100, kind: 'closed', text: LOG_COPY.closedDeliverable })
  })
})

describe('voter valence (design note 7 — "the celebratory beat can never land on a rejection")', () => {
  it('v-4: "The appeal was decided" + CI_VALENCE(false) sets voterAppealed=decided, diagnosis becomes v-5, and the log entry text ends " — rejected"', () => {
    const answers: AnswerRecord = { voterQ1: 'decision', voterAppealed: 'pending' }
    const d0 = diagnose(voterEngine, answers)
    expect(d0.ruleId).toBe('v-4')
    const c = caseFor('voter', voterEngine, 'Voter roll', 'voter-nextmove', answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'voter', 'The appeal was decided')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    expect(s1.ciStage).toBe('valence')

    const f2 = ciValence(s1, false, NOW + 1100)!
    expect(f2.answers!.voterAppealed).toBe('decided')
    const after = diagnose(voterEngine, f2.answers!)
    expect(after.ruleId).toBe('v-5') // id DID change (v-4 -> v-5), so a diagnosed entry follows
    const updated = f2.savedCases!.find(x => x.id === 'c1')!
    expect(updated.log.at(-2)?.text.endsWith(LOG_COPY.rejectedSuffix)).toBe(true)
    expect(updated.log.at(-1)).toEqual({ t: NOW + 1100, kind: 'diagnosed', text: after.label })
  })

  it('v-5: "I filed the second appeal with the state CEO" confirms into v-5-p', () => {
    const answers: AnswerRecord = { voterQ1: 'decision', voterAppealed: 'decided' }
    const d0 = diagnose(voterEngine, answers)
    expect(d0.ruleId).toBe('v-5')
    const c = caseFor('voter', voterEngine, 'Voter roll', 'voter-nextmove', answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'voter', 'I filed the second appeal with the state CEO')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    const f2 = ciConfirm(s1, NOW + 1100)!
    const after = diagnose(voterEngine, f2.answers!)
    expect(after.ruleId).toBe('v-5-p')
  })

  it('v-5-p: CI_VALENCE(false) is a rejectDeadend — navigates to dead-end with NO patch applied', () => {
    const answers: AnswerRecord = { voterQ1: 'decision', voterAppealed: 'decided', ceoAppeal: 'filed' }
    const d0 = diagnose(voterEngine, answers)
    expect(d0.ruleId).toBe('v-5-p')
    const c = caseFor('voter', voterEngine, 'Voter roll', 'voter-nextmove', answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'voter', 'The second appeal was decided')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    const f2 = ciValence(s1, false, NOW + 1100)!
    expect(f2.navigateTo).toBe('dead-end')
    expect(f2.answers).toBeUndefined() // no patch applied
  })

  it('v-4: CI_VALENCE(true) sets ciStage=closureq with NO log entry and NO patch yet', () => {
    const answers: AnswerRecord = { voterQ1: 'decision', voterAppealed: 'pending' }
    const c = caseFor('voter', voterEngine, 'Voter roll', 'voter-nextmove', answers)
    const preLog = [...c.log]
    const d0 = diagnose(voterEngine, answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'voter', 'The appeal was decided')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }

    const f2 = ciValence(s1, true, NOW + 1100)!
    expect(f2.ciStage).toBe('closureq')
    expect(f2.answers).toBeUndefined()
    expect(f2.savedCases).toBeUndefined()
    expect(s1.savedCases[0].log).toEqual(preLog) // still completely untouched
  })

  it('...then CI_CLOSURE(false) applies acceptPendingPatch (voterOutcome=accepted_pending), NOT pendingPatch', () => {
    const answers: AnswerRecord = { voterQ1: 'decision', voterAppealed: 'pending' }
    const c = caseFor('voter', voterEngine, 'Voter roll', 'voter-nextmove', answers)
    const d0 = diagnose(voterEngine, answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d0, {}, 'voter', 'The appeal was decided')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    const s2 = { ...s1, ...ciValence(s1, true, NOW + 1100)! }

    const f3 = ciClosureAnswer(s2, false, NOW + 1200)!
    expect(f3.answers!.voterOutcome).toBe('accepted_pending')
    const after = diagnose(voterEngine, f3.answers!)
    expect(after.ruleId).toBe('v-acc')
  })
})

describe('"Nothing yet" (CI_CHOOSE nothing branch — first-class, previously the one un-undoable kind)', () => {
  it('logs a checked/noChange entry, sets ciReassure, does NOT navigate, does NOT touch answers; a second consecutive one sets ciConsecutive; one after a "reported" entry does not', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const d = diagnose(passportEngine, answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d, {}, 'passport', 'Nothing yet')

    const f1 = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f1.ciConsecutive).toBe(false) // the case's last entry was 'diagnosed', not 'checked'
    expect(f1.ciReassure).toBe(true)
    expect(f1.ciPending).toBeNull()
    expect(f1.navigateTo).toBeNull()
    expect(f1.answers).toBeUndefined() // never touches answers
    const s1 = { ...s0, ...f1 }
    expect(s1.answers).toBe(s0.answers) // same reference — literally untouched
    const case1 = s1.savedCases[0]
    expect(case1.log.at(-1)).toEqual({ t: NOW + 1000, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true })

    const f2 = ciChoose(s1, { index: idx, now: NOW + 2000 })!
    expect(f2.ciConsecutive).toBe(true) // second consecutive nothing-yet

    // a "nothing yet" AFTER a reported entry (not a checked one) is not consecutive
    const withReported = appendLog(c, { kind: 'reported', text: 'x' }, NOW + 500)
    const s0b = sessionFor(withReported)
    const f3 = ciChoose(s0b, { index: idx, now: NOW + 1000 })!
    expect(f3.ciConsecutive).toBe(false)
  })
})

describe('"Something else happened" (CI_CHOOSE else branch — the mandatory universal escape hatch)', () => {
  it('passport: logs a checked entry and navigates to passport-q1', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const d = diagnose(passportEngine, answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d, {}, 'passport', 'Something else happened')
    const f = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f.navigateTo).toBe('passport-q1')
    expect(f.savedCases![0].log.at(-1)).toEqual({ t: NOW + 1000, kind: 'checked', text: LOG_COPY.elseReDiagnose })
  })

  it('voter: navigates to voter-entry', () => {
    const answers: AnswerRecord = { voterQ1: 'no_word' }
    const c = caseFor('voter', voterEngine, 'Voter roll', 'voter-nextmove', answers)
    const d = diagnose(voterEngine, answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d, {}, 'voter', 'Something else happened')
    const f = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f.navigateTo).toBe('voter-entry')
  })

  it('sir: navigates to sir-q1', () => {
    const answers: AnswerRecord = { sirQ1: 'roll_present' }
    const c = caseFor('sir', sirEngine, 'Voter roll (SIR)', 'sir-nextmove', answers)
    const d = diagnose(sirEngine, answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d, {}, 'sir', 'Something else happened')
    const f = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f.navigateTo).toBe('sir-q1')
  })
})

describe('"I haven\'t done this yet" (CI_CHOOSE notdone branch)', () => {
  it('navigates to the prepare screen and writes NO log entry, no patch, no snapshot', () => {
    const answers: AnswerRecord = { q1: 'verified_no_progress', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const d = diagnose(passportEngine, answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d, {}, 'passport', "I haven't done this yet; take me back to the steps")
    const f = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f.navigateTo).toBe('passport-prepare')
    expect(f.ciSnapshot).toBeUndefined()
    expect(f.savedCases).toEqual(s0.savedCases)
    expect(f.savedCases![0]).toBe(c) // same reference — nothing written at all
  })
})

describe('D1 RED — the Undo snapshot bug (deviation D1; the single most important test in this task)', () => {
  it('undo after a diagnosis-changing check-in restores answers, prepChecks AND the log to their pre-check-in state', () => {
    // state-2, prepChecks={0:true} seeded (state-2 has a real 4-step prep
    // plan — prep.ts). Choosing "I asked the office what was pending"
    // changes the diagnosis id (state-2 -> state-5a-p): exactly the
    // two-log-write path (`reported` then `diagnosed`) design note 5 (D1)
    // is about.
    const answers: AnswerRecord = { q1: 'contacted_incomplete', q2: 'no_followup' }
    const prepChecks = { 0: true }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers, {}, prepChecks)
    const preAnswers = { ...answers }
    const preLog = [...c.log]
    const d0 = diagnose(passportEngine, answers)
    expect(d0.ruleId).toBe('state-2') // premise

    const s0 = sessionFor(c)
    expect(s0.prepChecks).toEqual({ 0: true }) // premise
    const idx = optIndex(d0, s0.prepChecks, 'passport', 'I asked the office what was pending (call, visit, or message)')
    const f1 = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    const s1 = { ...s0, ...f1 }
    const f2 = ciConfirm(s1, NOW + 2000)!
    const s2 = { ...s1, ...f2 }

    const afterCheckin = diagnose(passportEngine, s2.answers)
    expect(afterCheckin.ruleId).toBe('state-5a-p') // premise: the diagnosis DID change
    expect(s2.prepChecks).toEqual({}) // premise: prep cleared by the id change

    // DEVIATION D1. A faithful transcription of the prototype's ciLog
    // (2621-2627) re-snapshots on EVERY log write. applyCheckinPatch here
    // writes TWO entries for this ONE interaction (`reported` then
    // `diagnosed`) — under a faithful transcription, snapshot #1 would be
    // taken correctly before `reported` (capturing the true pre-check-in
    // answers/prepChecks/log), and then OVERWRITTEN by snapshot #2, taken
    // before `diagnosed` — which is AFTER updateAns/the prepChecks-clear
    // has already run, and AFTER the `reported` entry is already in the
    // log (the `diagnosed` push happens strictly after #2 is taken).
    //
    // Restoring FROM that faithful #2 would still correctly drop the
    // `diagnosed` entry from the log — Undo's log-shrinking IS real and
    // DOES happen even under the unfixed prototype behaviour. So a test
    // run where the log merely shrank by one entry is NOT evidence D1 is
    // fixed. What a faithful transcription gets wrong is `answers`
    // (already patched when #2 was taken — the citizen's Undo click would
    // silently keep `fOutcome`), `prepChecks` (already {} when #2 was
    // taken), and the surviving `reported` entry (already in the log at
    // #2). The `answers` assertion just below is the one that actually
    // catches D1, and it is the one that matters.
    const f3 = ciUndo(s2)!
    const s3 = { ...s2, ...f3 }

    expect(s3.answers).toEqual(preAnswers) // THE assertion that catches D1
    expect(s3.prepChecks).toEqual({ 0: true })
    const restoredCase = s3.savedCases.find(x => x.id === 'c1')!
    expect(restoredCase.log).toEqual(preLog) // BOTH reported and diagnosed removed
    expect(s3.ciSnapshot).toBeNull()
    expect(s3.ciJustUpdated).toBe(false)
    expect(s3.ciReassure).toBe(false)
  })
})

describe('CI_UNDO — additional cases', () => {
  it('undoes a "nothing yet" check-in (previously the one un-undoable kind), restoring the log', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const preLog = [...c.log]
    const d = diagnose(passportEngine, answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d, {}, 'passport', 'Nothing yet')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    expect(s1.savedCases[0].log).toHaveLength(2) // premise: the check DID get logged

    const f2 = ciUndo(s1)!
    const s2 = { ...s1, ...f2 }
    expect(s2.savedCases[0].log).toEqual(preLog)
    expect(s2.ciSnapshot).toBeNull()
  })

  it('restores a WORKING case as well as a saved one', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers, { id: 'working', unsaved: true })
    const preLog = [...c.log]
    const d = diagnose(passportEngine, answers)
    const s0 = sessionFor(c, true) // working case
    const idx = optIndex(d, {}, 'passport', 'Nothing yet')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    expect(s1.workingCase!.log).toHaveLength(2)

    const f2 = ciUndo(s1)!
    const s2 = { ...s1, ...f2 }
    expect(s2.workingCase!.log).toEqual(preLog)
    expect(s2.savedCases).toEqual([]) // untouched
  })

  it('returns null (no-op) when there is no snapshot to restore', () => {
    const c = savedCase(PASSPORT_ANSWERS)
    const s0 = sessionFor(c)
    expect(ciUndo(s0)).toBeNull()
  })
})

describe('Prep-step survival (design note 3)', () => {
  it('a same-diagnosis-id check-in leaves prepChecks intact; an id-changing one clears it AND memorialises the old plan with a diagnosed entry', () => {
    // No CHECKIN_META option in the locked prototype ever leaves the
    // diagnosis id unchanged — every real option is designed to move the
    // case forward. The "same id" half is exercised with a synthetic
    // CheckinOption whose patch key ('note') no playbook rule condition
    // ever reads, applied through the real applyCheckinPatch path (via
    // CI_CONFIRM) against a REAL diagnose() call — never a hand-built
    // Diagnosis.
    const prepChecks = { 0: true }
    const answers2: AnswerRecord = { q1: 'contacted_incomplete', q2: 'no_followup' } // state-2, has a prep plan
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers2, {}, prepChecks)
    const s0 = sessionFor(c)
    const sameIdOpt: CheckinOption = { k: 'event', label: 'test: same-id event', patch: { note: 'x' } }
    const f1 = ciConfirm({ ...s0, ciPending: sameIdOpt }, NOW + 1000)!
    expect(f1.prepChecks).toEqual({ 0: true }) // intact — the ruleId did not change
    // no memorial entry beyond the case's own pre-existing seed 'diagnosed'
    // entry (caseFor's own log[0]) — log grows by exactly one, 'reported'.
    expect(f1.savedCases![0].log).toHaveLength(2)
    expect(f1.savedCases![0].log.at(-1)?.kind).toBe('reported')

    // id-changing half: state-3 (prepAware, has a prep plan) -> state-4.
    const answers3: AnswerRecord = { q1: 'verified_no_progress', q2: 'no_followup' }
    const c2 = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers3, {}, { 0: true })
    const d2 = diagnose(passportEngine, answers3)
    expect(d2.ruleId).toBe('state-3') // premise
    const s2a = sessionFor(c2)
    const idx2 = optIndex(d2, { 0: true }, 'passport', 'The portal shows an adverse or confusing status')
    const s2b = { ...s2a, ...ciChoose(s2a, { index: idx2, now: NOW + 1000 })! }
    const f2 = ciConfirm(s2b, NOW + 1100)!
    expect(f2.prepChecks).toEqual({}) // cleared — the ruleId DID change
    expect(f2.savedCases![0].log.at(-1)?.kind).toBe('diagnosed') // memorialised
  })
})

describe('CI_CANCEL (design note 10 — previously declared and untested; a defect by this project\'s own Global Constraints)', () => {
  it('from ciStage "confirm": clears ciStage/ciPending/ciPendingIdx; log, answers, ciSnapshot, ciReassure and savedCases are unchanged BY IDENTITY', () => {
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', { q1: 'no_contact', q2: 'no_followup' })
    const opt: CheckinOption = { k: 'event', label: 'x', patch: { q1: 'adverse' } }
    const s0: CiTestState = { ...sessionFor(c), ciStage: 'confirm', ciPending: opt, ciPendingIdx: 0 }

    const f = ciCancel()
    const s1 = { ...s0, ...f }

    expect(s1.ciStage).toBeNull()
    expect(s1.ciPending).toBeNull()
    expect(s1.ciPendingIdx).toBeNull()
    expect(s1.savedCases).toBe(s0.savedCases) // same array — not a copy
    expect(s1.savedCases[0]).toBe(c) // same case object — no log write
    expect(s1.answers).toBe(s0.answers)
    expect(s1.ciSnapshot).toBe(s0.ciSnapshot)
    expect(s1.ciReassure).toBe(s0.ciReassure)
  })

  it('from ciStage "valence": the same guarantees — a cancel that quietly wrote a log entry would be the worst kind of bug here (the citizen said "no")', () => {
    const c = caseFor('voter', voterEngine, 'Voter roll', 'voter-nextmove', { voterQ1: 'decision', voterAppealed: 'pending' })
    const opt: CheckinOption = { k: 'valence', label: 'The appeal was decided', rejectPatch: { voterAppealedRaw: 'decided', voterAppealed: 'decided' } }
    const s0: CiTestState = { ...sessionFor(c), ciStage: 'valence', ciPending: opt, ciPendingIdx: 0 }

    const f = ciCancel()
    const s1 = { ...s0, ...f }

    expect(s1.ciStage).toBeNull()
    expect(s1.ciPending).toBeNull()
    expect(s1.ciPendingIdx).toBeNull()
    expect(s1.savedCases[0]).toBe(c)
    expect(s1.answers).toBe(s0.answers)
  })
})

describe("The re-snapshot's actual purpose (design note 3) + D7 RED — savedAt survives the re-snapshot", () => {
  it('after a diagnosis-changing check-in on a SAVED case: stateLabel/rec/whatShort/stepsTotal/stepsDone match a fresh caseSnapshot against the NEW diagnosis; savedAt is UNCHANGED while lastCheck DOES advance', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const FIXED_SAVED_AT = 1_700_000_000_000
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers, { savedAt: FIXED_SAVED_AT })
    const d0 = diagnose(passportEngine, answers)
    const s0 = sessionFor(c)
    const FAR_FUTURE = FIXED_SAVED_AT + 999_999_999
    const idx = optIndex(d0, {}, 'passport', 'Police contacted or visited me')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: FAR_FUTURE })! }
    const f2 = ciConfirm(s1, FAR_FUTURE)!
    const updated = f2.savedCases!.find(x => x.id === 'c1')!

    const after = diagnose(passportEngine, f2.answers!)
    const freshSnap = caseSnapshot('passport', 'Passport', 'passport-nextmove', after, f2.answers!, f2.prepChecks!, FAR_FUTURE)
    expect(updated.stateLabel).toBe(freshSnap.stateLabel)
    expect(updated.rec).toBe(freshSnap.rec)
    expect(updated.whatShort).toBe(freshSnap.whatShort)
    expect(updated.stepsTotal).toBe(freshSnap.stepsTotal)
    expect(updated.stepsDone).toBe(freshSnap.stepsDone)

    // D7: a faithful transcription of ciPersistState (Object.assign(c,
    // caseSnapshot(...))) would overwrite savedAt with the fresh stamp,
    // making the rendered "Saved {date}" untrue.
    expect(updated.savedAt).toBe(FIXED_SAVED_AT)
    expect(updated.savedAt).not.toBe(freshSnap.savedAt)
    // lastCheck is a DIFFERENT clock and genuinely SHOULD advance.
    expect(updated.lastCheck).toBe(FAR_FUTURE)
  })
})

describe('ciSnapshot does not leak across cases (Task 4 design note 5\'s third sibling)', () => {
  it('OPEN_CHECKIN on a different case clears a snapshot left standing by a prior check-in', () => {
    const answersA: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const answersB: AnswerRecord = { q1: 'adverse', q2: 'informal' }
    const caseA = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answersA, { id: 'a' })
    const caseB = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answersB, { id: 'b' })
    const s0: CiTestState = { ...sessionFor(caseA), activeCaseId: 'a', savedCases: [caseA, caseB] }
    const d = diagnose(passportEngine, answersA)
    const idx = optIndex(d, {}, 'passport', 'Nothing yet')
    const f1 = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    const s1 = { ...s0, ...f1 }
    expect(s1.ciSnapshot).not.toBeNull() // premise: A's check-in left a snapshot standing

    const opened = openCheckin(s1.savedCases, 'b')!
    expect(opened.ciSnapshot).toBeNull()
  })

  it('BEGIN_WORKING_CHECKIN clears a snapshot left standing by a prior check-in', () => {
    const answersA: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const caseA = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answersA, { id: 'a' })
    const s0: CiTestState = { ...sessionFor(caseA), activeCaseId: 'a' }
    const d = diagnose(passportEngine, answersA)
    const idx = optIndex(d, {}, 'passport', 'Nothing yet')
    const f1 = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    const s1 = { ...s0, ...f1 }
    expect(s1.ciSnapshot).not.toBeNull()

    const fragment = beginWorkingCheckin(
      { savedCases: s1.savedCases, workingCase: null, answers: { q1: 'different', q2: 'different' }, prepChecks: {} },
      PASSPORT_PAYLOAD,
    )
    assertBeginWorking(fragment)
    expect(fragment.ciSnapshot).toBeNull()
  })
})

describe('ciReassure is cleared by CI_CHOOSE on every branch (2640)', () => {
  it('an event option (opens the confirm panel) clears ciReassure to false', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const d = diagnose(passportEngine, answers)
    const s0: CiTestState = { ...sessionFor(c), ciReassure: true }
    const idx = optIndex(d, {}, 'passport', 'Police contacted or visited me')
    const f = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f.ciReassure).toBe(false)
  })

  it('the "nothing" branch clears it first, then ends the branch with it true', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const d = diagnose(passportEngine, answers)
    const s0: CiTestState = { ...sessionFor(c), ciReassure: true }
    const idx = optIndex(d, {}, 'passport', 'Nothing yet')
    const f = ciChoose(s0, { index: idx, now: NOW + 1000 })!
    expect(f.ciReassure).toBe(true)
  })
})

describe('Immutability: no CI_* arm mutates the previous state', () => {
  it('CI_CHOOSE + CI_CONFIRM (event, diagnosis-changing) never mutate savedCases, the case object, answers, or the log', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const savedCases = [c]
    const cloneCases = structuredClone(savedCases)
    const cloneAnswers = { ...answers }
    const d = diagnose(passportEngine, answers)
    const s0 = { ...sessionFor(c), savedCases }
    const idx = optIndex(d, {}, 'passport', 'Police contacted or visited me')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    ciConfirm(s1, NOW + 2000)

    expect(savedCases).toEqual(cloneCases)
    expect(savedCases[0]).toBe(c)
    expect(answers).toEqual(cloneAnswers)
    expect(c.log).toEqual(cloneCases[0].log)
  })

  it('CI_UNDO never mutates the snapshot it restores from', () => {
    const answers: AnswerRecord = { q1: 'no_contact', q2: 'no_followup' }
    const c = caseFor('passport', passportEngine, 'Passport', 'passport-nextmove', answers)
    const d = diagnose(passportEngine, answers)
    const s0 = sessionFor(c)
    const idx = optIndex(d, {}, 'passport', 'Nothing yet')
    const s1 = { ...s0, ...ciChoose(s0, { index: idx, now: NOW + 1000 })! }
    const snapshotClone = structuredClone(s1.ciSnapshot)

    ciUndo(s1)

    expect(s1.ciSnapshot).toEqual(snapshotClone)
  })
})
