import { describe, it, expect } from 'vitest'
import type { AnswerRecord } from '../domain/types'
import type { Casefile } from '../domain/casefile'
import { caseSnapshot } from '../domain/casefile'
import { diagnose } from '../domain/engine'
import { applyCorrection, applyEvent } from '../domain/answers'
import { passportEngine, sirEngine } from '../playbooks/engines'
import { PASSPORT_DEPS } from '../playbooks/passportPlaybook'
import {
  activeCase, sameAnswers, caseIsSaved, loadCase, openCheckin, beginWorkingCheckin, completeSave,
} from './cases'
import type { OpenCheckinFragment, BeginWorkingFragment } from './cases'

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
