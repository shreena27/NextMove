import { describe, it, expect } from 'vitest'
import { initialSession, sessionReducer as r } from './session'
import type { SessionState } from './session'
import type { Casefile } from '../domain/casefile'
import type { CheckinOption } from '../domain/checkinOptions'

const seq = (...actions: Parameters<typeof r>[1][]) =>
  actions.reduce((s, a) => r(s, a), initialSession)

// Minimal-but-real fixtures for the C5 fields — every field a Casefile /
// CheckinOption requires, nothing invented beyond what those interfaces
// declare (see casefile.ts / checkinOptions.ts).
const FIXTURE_CASE: Casefile = {
  engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
  answers: { q1: 'adverse' }, prepChecks: {}, savedAt: 1_725_000_000_000,
  stateLabel: 'Escalate', rec: 'WAIT', whatShort: null,
  stepsTotal: 0, stepsDone: 0, sirPhaseId: null,
  id: 'c1', outcome: 'still_open', lastCheck: null, remindAt: null, log: [],
}
const FIXTURE_OPTION: CheckinOption = { k: 'event', label: 'A BLO visited or contacted me' }

describe('navigation', () => {
  it('pushes history and lands on the new screen', () => {
    const s = seq({ type: 'NAVIGATE', screen: 'passport-guardrail' })
    expect(s.screen).toBe('passport-guardrail')
    expect(s.history).toEqual(['home'])
  })

  it('replace navigation does not push history (recovery "show me where")', () => {
    const s = seq(
      { type: 'NAVIGATE', screen: 'passport-q1' },
      { type: 'NAVIGATE', screen: 'passport-recovery' },
      { type: 'NAVIGATE', screen: 'passport-q1', replace: true },
    )
    expect(s.history).toEqual(['home', 'passport-q1'])
  })

  it('clears trustOpen and restartConfirm on every navigation', () => {
    const s = seq(
      { type: 'NAVIGATE', screen: 'passport-diagnosis' },
      { type: 'TOGGLE_TRUST' },
      { type: 'RESTART_REQUEST' },
      { type: 'NAVIGATE', screen: 'passport-nextmove' },
    )
    expect(s.trustOpen).toBe(false)
    expect(s.restartConfirm).toBe(false)
  })
})

describe('back — AC-7: back preserves prior answers', () => {
  it('pops history and keeps every stored answer', () => {
    const s = seq(
      { type: 'NAVIGATE', screen: 'passport-q1' },
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
      { type: 'NAVIGATE', screen: 'passport-q2' },
      { type: 'ANSWER', service: 'passport', key: 'q2', value: 'no_followup' },
      { type: 'NAVIGATE', screen: 'passport-diagnosis' },
      { type: 'BACK' },
    )
    expect(s.screen).toBe('passport-q2')
    expect(s.answers).toEqual({ q1: 'no_contact', q2: 'no_followup' })
  })

  it('back to Home is a full restart, not a history pop', () => {
    const s = seq(
      { type: 'NAVIGATE', screen: 'passport-guardrail' },
      { type: 'ANSWER', service: 'passport', key: 'guardrail', value: 'no' },
      { type: 'BACK' },
    )
    expect(s.screen).toBe('home')
    expect(s.answers).toEqual({})
    expect(s.history).toEqual([])
  })
})

describe('answer writes route through applyCorrection', () => {
  it('AC-8: a changed passport q1 clears q2', () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
      { type: 'ANSWER', service: 'passport', key: 'q2', value: 'no_followup' },
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
    )
    expect(s.answers).toEqual({ q1: 'adverse' })
  })

  it('AC-7: re-picking the SAME q1 does not clear q2', () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
      { type: 'ANSWER', service: 'passport', key: 'q2', value: 'informal' },
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
    )
    expect(s.answers).toEqual({ q1: 'no_contact', q2: 'informal' })
  })

  it('AC-V-7: a changed voterQ1 clears BOTH voterAppealed and voterAppealedRaw', () => {
    const s = seq(
      { type: 'ANSWER', service: 'voter', key: 'voterQ1', value: 'decision' },
      { type: 'ANSWER', service: 'voter', key: 'voterAppealedRaw', value: 'pending' },
      { type: 'ANSWER', service: 'voter', key: 'voterAppealed', value: 'pending' },
      { type: 'ANSWER', service: 'voter', key: 'voterQ1', value: 'no_word' },
    )
    expect(s.answers).toEqual({ voterQ1: 'no_word' })
  })
})

describe('restart — AC-9 + PRD §15 inline confirmation', () => {
  it('RESTART_REQUEST only arms the confirm; it clears nothing', () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
      { type: 'NAVIGATE', screen: 'passport-q2' },
      { type: 'RESTART_REQUEST' },
    )
    expect(s.restartConfirm).toBe(true)
    expect(s.answers).toEqual({ q1: 'adverse' })
    expect(s.screen).toBe('passport-q2')
  })

  it('RESTART_CANCEL leaves all state untouched', () => {
    const armed = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
      { type: 'NAVIGATE', screen: 'passport-q2' },
      { type: 'RESTART_REQUEST' },
    )
    const s = r(armed, { type: 'RESTART_CANCEL' })
    expect(s.restartConfirm).toBe(false)
    expect(s.answers).toEqual({ q1: 'adverse' })
    expect(s.screen).toBe('passport-q2')
  })

  it('RESTART clears answers, history and every transient flag, and returns Home', () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
      { type: 'NAVIGATE', screen: 'passport-diagnosis' },
      { type: 'TOGGLE_TRUST' },
      { type: 'SET_RECOVERY_TEXT', text: 'something' },
      { type: 'RESTART' },
    )
    expect(s).toEqual(initialSession)
  })
})

describe('C5 SessionState field list (was the C4 scope-exclusion pin — C4 said no prep* fields, C5 is where they land)', () => {
  it('has exactly the fields this chunk ships — no fewer, no silent extra', () => {
    expect(Object.keys(initialSession).sort()).toEqual([
      'activeCaseId', 'answers', 'ciAccepted', 'ciConsecutive', 'ciJustUpdated',
      'ciPending', 'ciPendingIdx', 'ciReassure', 'ciSnapshot', 'ciStage',
      'history', 'logOpen', 'pendingSave', 'phaseDrift', 'prepChecks', 'prepDraft',
      'recoveryText', 'reminderCopied', 'removeConfirm', 'restartConfirm',
      'savedCases', 'screen', 'trustOpen', 'voterEntryExplain', 'workingCase',
    ])
  })
})

describe('RESTART preserves the persisted slice (Issue #7 / design note 3)', () => {
  it('preserves savedCases and resets every other field to initialSession, field by field', () => {
    const savedCases = [FIXTURE_CASE]
    const dirty: SessionState = {
      screen: 'passport-diagnosis',
      history: ['home', 'passport-q1'],
      answers: { q1: 'adverse' },
      restartConfirm: true,
      trustOpen: true,
      recoveryText: 'pasted text',
      voterEntryExplain: true,
      savedCases,
      workingCase: FIXTURE_CASE,
      activeCaseId: 'c1',
      prepChecks: { 0: true },
      prepDraft: 'a draft',
      ciPending: FIXTURE_OPTION,
      ciPendingIdx: 1,
      ciStage: 'valence',
      ciReassure: true,
      ciSnapshot: { answers: {}, prepChecks: {}, casefile: FIXTURE_CASE },
      ciJustUpdated: true,
      ciConsecutive: true,
      ciAccepted: true,
      logOpen: { c1: true },
      removeConfirm: 'c1',
      reminderCopied: true,
      phaseDrift: true,
      pendingSave: { engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove' },
    }

    const s = r(dirty, { type: 'RESTART' })

    expect(s).toEqual({ ...initialSession, savedCases })
    expect(s.savedCases).toBe(savedCases) // the SAME array, not a copy
    for (const key of Object.keys(initialSession) as (keyof SessionState)[]) {
      if (key === 'savedCases') continue
      expect(s[key], `RESTART must reset ${key} to initialSession's value`).toEqual(initialSession[key])
    }
  })
})

describe('BACK to Home preserves the persisted slice (design note 4)', () => {
  it('preserves savedCases when the previous screen is home — the single most likely place to silently wipe a citizen\'s saved casefiles', () => {
    const savedCases = [FIXTURE_CASE]
    const dirty: SessionState = {
      ...initialSession,
      savedCases,
      history: ['home'],
      screen: 'passport-q1',
      answers: { q1: 'adverse' },
      trustOpen: true,
    }

    const s = r(dirty, { type: 'BACK' })

    expect(s.screen).toBe('home')
    expect(s.savedCases).toBe(savedCases) // the SAME array, not a copy
    expect(s).toEqual({ ...initialSession, savedCases })
  })
})

describe('NAVIGATE clears removeConfirm (design note 5)', () => {
  it('clears an armed destructive remove-confirm on any navigation — without this, a citizen who arms it, navigates away, and returns finds a live delete one stray tap from firing', () => {
    const armed: SessionState = { ...initialSession, removeConfirm: 'c123' }
    const s = r(armed, { type: 'NAVIGATE', screen: 'passport-q1' })
    expect(s.removeConfirm).toBeNull()
  })
})

describe('ANSWER resets prepChecks/prepDraft unconditionally (answers.ts design note, design note 6)', () => {
  it('clears prepChecks and prepDraft even when the written value is unchanged — never gated on `changed` — while answers stays the SAME object reference (C1\'s strict no-op is unchanged)', () => {
    const seeded: SessionState = {
      ...initialSession,
      answers: { q1: 'adverse' },
      prepChecks: { 0: true, 1: true },
      prepDraft: 'in-progress draft',
    }

    const s = r(seeded, { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' })

    expect(s.prepChecks).toEqual({})
    expect(s.prepDraft).toBeNull()
    expect(s.answers).toBe(seeded.answers)
  })
})

describe('C5 ScreenId additions', () => {
  it('checkin / dead-end / case-closed / save-done type-check in NAVIGATE', () => {
    const s1 = seq({ type: 'NAVIGATE', screen: 'checkin' })
    const s2 = seq({ type: 'NAVIGATE', screen: 'dead-end' })
    const s3 = seq({ type: 'NAVIGATE', screen: 'case-closed' })
    const s4 = seq({ type: 'NAVIGATE', screen: 'save-done' })
    expect([s1.screen, s2.screen, s3.screen, s4.screen])
      .toEqual(['checkin', 'dead-end', 'case-closed', 'save-done'])
  })

  it('C7/C6/C8 screen ids are NOT part of this union yet (negative type-check)', () => {
    // @ts-expect-error 'save-case' is C7's — not on ScreenId until then
    r(initialSession, { type: 'NAVIGATE', screen: 'save-case' })
    // @ts-expect-error 'save-otp' is C7's — not on ScreenId until then
    r(initialSession, { type: 'NAVIGATE', screen: 'save-otp' })
    // @ts-expect-error 'save-name' is C7's — not on ScreenId until then
    r(initialSession, { type: 'NAVIGATE', screen: 'save-name' })
    // @ts-expect-error 'sir-reverifying' is C6's — not on ScreenId until then
    r(initialSession, { type: 'NAVIGATE', screen: 'sir-reverifying' })
    // @ts-expect-error 'interp-confirm' is C8's — not on ScreenId until then
    r(initialSession, { type: 'NAVIGATE', screen: 'interp-confirm' })
  })
})

describe('BEGIN_WORKING_CHECKIN / OPEN_CHECKIN reducer wiring (thin arms over cases.ts, design notes 3 and 8)', () => {
  it('BEGIN_WORKING_CHECKIN navigates to checkin and sets activeCaseId to the working sentinel', () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
      { type: 'ANSWER', service: 'passport', key: 'q2', value: 'informal' },
      {
        type: 'BEGIN_WORKING_CHECKIN',
        engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
        now: 1_725_000_000_000,
      },
    )
    expect(s.screen).toBe('checkin')
    expect(s.activeCaseId).toBe('working')
    expect(s.workingCase).not.toBeNull()
    expect(s.workingCase?.log).toHaveLength(1)
    expect(s.ciSnapshot).toBeNull()
  })

  it('OPEN_CHECKIN loads the given saved case and navigates to checkin', () => {
    const withSaved: SessionState = { ...initialSession, savedCases: [FIXTURE_CASE] }
    const s = r(withSaved, { type: 'OPEN_CHECKIN', id: 'c1' })
    expect(s.screen).toBe('checkin')
    expect(s.activeCaseId).toBe('c1')
    expect(s.answers).toEqual(FIXTURE_CASE.answers)
  })

  it('OPEN_CHECKIN for an unknown id is a no-op (mirrors the prototype\'s if(!loadCase(id)) return)', () => {
    const s = r(initialSession, { type: 'OPEN_CHECKIN', id: 'nope' })
    expect(s).toEqual(initialSession)
  })
})

describe("BEGIN_SAVE (design notes 8-9: completes immediately, no auth detour in C5)", () => {
  it("lands on 'save-done' with the case saved, activeCaseId set, and pendingSave.returnScreen populated for SaveDoneScreen to read", () => {
    const s = seq(
      { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
      { type: 'ANSWER', service: 'passport', key: 'q2', value: 'informal' },
      {
        type: 'BEGIN_SAVE',
        engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
        now: 1_725_000_000_000,
      },
    )
    expect(s.screen).toBe('save-done')
    expect(s.savedCases).toHaveLength(1)
    expect(s.savedCases[0].engineKey).toBe('passport')
    expect(s.savedCases[0].outcome).toBe('still_open')
    expect(s.activeCaseId).toBe(s.savedCases[0].id)
    expect(s.pendingSave).toEqual({ engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove' })
    expect(s.workingCase).toBeNull()
  })
})

describe('CI_CHOOSE / CI_CONFIRM / CI_VALENCE / CI_CLOSURE / CI_UNDO / CI_CANCEL — reducer wiring (Task 6, design notes 2-10)', () => {
  // The state machine's own branch-by-branch logic is exhaustively pinned
  // in cases.test.ts (ciChoose/ciConfirm/ciValence/ciClosureAnswer/ciUndo/
  // ciCancel, called directly). This block only proves the WIRING: each
  // reducer arm calls the right function, applies navigation exactly when
  // the fragment's navigateTo says to (and not otherwise), and no-ops
  // cleanly with no active case / no pending option / no snapshot.
  const NOW = 1_725_000_000_000

  function withPassportCheckin(answers: Record<string, string> = { q1: 'no_contact', q2: 'no_followup' }) {
    const answerActions = Object.entries(answers).map(
      ([key, value]) => ({ type: 'ANSWER' as const, service: 'passport' as const, key, value }),
    )
    return seq(
      ...answerActions,
      { type: 'BEGIN_WORKING_CHECKIN', engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove', now: NOW },
    )
  }

  it('CI_CHOOSE on a confirm-opening option (index 0, "Police contacted or visited me") stays on the checkin screen and sets ciStage — no navigation', () => {
    const s0 = withPassportCheckin()
    const s1 = r(s0, { type: 'CI_CHOOSE', index: 0, now: NOW + 1000 })
    expect(s1.screen).toBe('checkin')
    expect(s1.history).toEqual(s0.history) // untouched — no nav happened
    expect(s1.ciStage).toBe('confirm')
    expect(s1.ciPending).not.toBeNull()
  })

  it('CI_CONFIRM applies the patch, navigates to passport-diagnosis, and pushes history', () => {
    const s0 = withPassportCheckin()
    const s1 = r(s0, { type: 'CI_CHOOSE', index: 0, now: NOW + 1000 })
    const s2 = r(s1, { type: 'CI_CONFIRM', now: NOW + 2000 })
    expect(s2.screen).toBe('passport-diagnosis')
    expect(s2.history).toEqual([...s1.history, 'checkin'])
    expect(s2.answers.q1).toBe('contacted_incomplete')
    expect(s2.ciJustUpdated).toBe(true)
    expect(s2.ciSnapshot).not.toBeNull()
    expect(s2.ciStage).toBeNull()
    expect(s2.ciPending).toBeNull()
  })

  it('CI_UNDO restores the pre-check-in state after CI_CONFIRM, without navigating', () => {
    const s0 = withPassportCheckin()
    const s1 = r(s0, { type: 'CI_CHOOSE', index: 0, now: NOW + 1000 })
    const s2 = r(s1, { type: 'CI_CONFIRM', now: NOW + 2000 })
    const s3 = r(s2, { type: 'CI_UNDO' })
    expect(s3.answers.q1).toBe('no_contact')
    expect(s3.ciSnapshot).toBeNull()
    expect(s3.screen).toBe(s2.screen) // CI_UNDO never navigates
  })

  it('CI_CANCEL clears the confirm panel without touching answers or navigating', () => {
    const s0 = withPassportCheckin()
    const s1 = r(s0, { type: 'CI_CHOOSE', index: 0, now: NOW + 1000 })
    expect(s1.ciStage).toBe('confirm')
    const s2 = r(s1, { type: 'CI_CANCEL' })
    expect(s2.ciStage).toBeNull()
    expect(s2.ciPending).toBeNull()
    expect(s2.ciPendingIdx).toBeNull()
    expect(s2.screen).toBe('checkin')
    expect(s2.answers).toBe(s1.answers) // untouched
  })

  it('CI_CHOOSE / CI_CONFIRM / CI_VALENCE / CI_CLOSURE / CI_UNDO are clean no-ops with no active case / no pending option / no snapshot', () => {
    expect(r(initialSession, { type: 'CI_CHOOSE', index: 0, now: NOW })).toEqual(initialSession)
    expect(r(initialSession, { type: 'CI_CONFIRM', now: NOW })).toEqual(initialSession)
    expect(r(initialSession, { type: 'CI_VALENCE', accepted: true, now: NOW })).toEqual(initialSession)
    expect(r(initialSession, { type: 'CI_CLOSURE', gotIt: true, now: NOW })).toEqual(initialSession)
    expect(r(initialSession, { type: 'CI_UNDO' })).toEqual(initialSession)
  })
})

describe('C5 action union excludes CONTINUE_SAVED (design note 7: dead code in the lock, zero call sites)', () => {
  it('CONTINUE_SAVED does not type-check as a dispatchable action — a later reader adding it back has to argue with this test', () => {
    // @ts-expect-error CONTINUE_SAVED is dead code in the locked prototype (zero call sites) — deliberately not ported
    r(initialSession, { type: 'CONTINUE_SAVED', id: 'c1' })
  })
})

describe('CLOSE_UNRESOLVED / REOPEN_CASE / REMOVE_SAVED / SET_REMIND / TOGGLE_LOG / SET_REMOVE_CONFIRM / SET_REMINDER_COPIED — reducer wiring (Task 7, design notes 1-9)', () => {
  // The branch-by-branch logic is exhaustively pinned in cases.test.ts
  // (closeUnresolved/reopenCase/removeSaved/setRemind/toggleLog/
  // setRemoveConfirm/setReminderCopied, called directly). This block only
  // proves the WIRING, plus the two facts that can only be observed at the
  // full SessionState level: CLOSE_UNRESOLVED landing on Home with every
  // other field reset (it ends in the same RESTART allowlist RESTART
  // itself uses), and RESTART clearing reminderCopied (already pinned by
  // the "RESTART preserves the persisted slice" test above — re-confirmed
  // here against a differently-shaped, non-default fixture).
  const NOW = 1_725_000_000_000
  const CLOSABLE_CASE: Casefile = {
    ...FIXTURE_CASE, id: 'c1', outcome: 'still_open',
    log: [{ t: NOW - 1000, kind: 'diagnosed', text: 'Escalate' }],
  }

  it('CLOSE_UNRESOLVED on a SAVED active case lands on Home with the case closed in savedCases and every other field reset', () => {
    const dirty: SessionState = {
      ...initialSession, savedCases: [CLOSABLE_CASE], activeCaseId: 'c1',
      screen: 'checkin', history: ['home'], answers: { q1: 'adverse' },
    }

    const s = r(dirty, { type: 'CLOSE_UNRESOLVED', now: NOW })

    expect(s.screen).toBe('home')
    expect(s.savedCases).toHaveLength(1)
    expect(s.savedCases[0].outcome).toBe('closed_unresolved')
    expect(s.savedCases[0].closedAt).toBe(NOW)
    expect(s.savedCases[0].log.at(-1)?.kind).toBe('closed')
    expect(s).toEqual({ ...initialSession, savedCases: s.savedCases }) // everything else reset
  })

  it('CLOSE_UNRESOLVED on the WORKING case leaves savedCases genuinely unchanged — DESIGN NOTE 9: a working case that was never saved leaves no record', () => {
    const preexisting: Casefile[] = [{ ...FIXTURE_CASE, id: 'other' }]
    const dirty: SessionState = {
      ...initialSession, savedCases: preexisting,
      workingCase: { ...FIXTURE_CASE, id: 'working', unsaved: true }, activeCaseId: 'working',
      screen: 'checkin', history: ['home'],
    }

    const s = r(dirty, { type: 'CLOSE_UNRESOLVED', now: NOW })

    expect(s.savedCases).toBe(preexisting) // the SAME reference — the working case's closure never touched it
    expect(s.workingCase).toBeNull() // dropped by RESTART, closure and all
  })

  it('CLOSE_UNRESOLVED with no active case is a clean no-op', () => {
    expect(r(initialSession, { type: 'CLOSE_UNRESOLVED', now: NOW })).toEqual(initialSession)
  })

  it("REOPEN_CASE flips a closed case back to still_open, navigates to the engine's diagnosis screen, and pushes history; closedAt is left standing (design note 3)", () => {
    const dirty: SessionState = {
      ...initialSession,
      savedCases: [{ ...CLOSABLE_CASE, outcome: 'closed_unresolved', closedAt: NOW - 5000 }],
      screen: 'home', history: [],
    }

    const s = r(dirty, { type: 'REOPEN_CASE', id: 'c1', now: NOW })

    expect(s.screen).toBe('passport-diagnosis')
    expect(s.history).toEqual(['home'])
    expect(s.savedCases[0].outcome).toBe('still_open')
    expect(s.savedCases[0].closedAt).toBe(NOW - 5000)
    expect(s.activeCaseId).toBe('c1')
  })

  it('REOPEN_CASE for an unknown id is a clean no-op', () => {
    expect(r(initialSession, { type: 'REOPEN_CASE', id: 'nope', now: NOW })).toEqual(initialSession)
  })

  it("REMOVE_SAVED deletes the case, sends the citizen to Home with cleared history (design note 4 — never left on a dead case's screen), and clears removeConfirm", () => {
    const other: Casefile = { ...FIXTURE_CASE, id: 'other' }
    const dirty: SessionState = {
      ...initialSession, savedCases: [CLOSABLE_CASE, other], activeCaseId: 'c1',
      screen: 'checkin', history: ['home'], removeConfirm: 'c1',
    }

    const s = r(dirty, { type: 'REMOVE_SAVED', id: 'c1' })

    expect(s.savedCases).toEqual([other])
    expect(s.activeCaseId).toBeNull()
    expect(s.screen).toBe('home')
    expect(s.history).toEqual([])
    expect(s.removeConfirm).toBeNull()
  })

  it('SET_REMIND writes onto the WORKING case (D5) — a search-by-id over savedCases would have silently missed it', () => {
    const dirty: SessionState = {
      ...initialSession,
      workingCase: { ...FIXTURE_CASE, id: 'working', unsaved: true, remindAt: null }, activeCaseId: 'working',
    }

    const s = r(dirty, { type: 'SET_REMIND', value: '2026-10-12' })

    expect(s.workingCase!.remindAt).toBe('2026-10-12')
  })

  it('SET_REMIND with no active case is a clean no-op', () => {
    expect(r(initialSession, { type: 'SET_REMIND', value: '2026-10-12' })).toEqual(initialSession)
  })

  it('TOGGLE_LOG opens exactly the given case id', () => {
    const s = r(initialSession, { type: 'TOGGLE_LOG', caseId: 'c1' })
    expect(s.logOpen).toEqual({ c1: true })
  })

  it('SET_REMOVE_CONFIRM arms and disarms', () => {
    const armed = r(initialSession, { type: 'SET_REMOVE_CONFIRM', id: 'c1' })
    expect(armed.removeConfirm).toBe('c1')
    const disarmed = r(armed, { type: 'SET_REMOVE_CONFIRM', id: null })
    expect(disarmed.removeConfirm).toBeNull()
  })

  it('SET_REMINDER_COPIED sets/clears the flag and touches savedCases/workingCase/answers not at all (by identity); RESTART clears it', () => {
    const dirty: SessionState = {
      ...initialSession, savedCases: [CLOSABLE_CASE],
      workingCase: { ...FIXTURE_CASE, id: 'working' }, answers: { q1: 'adverse' },
    }

    const s1 = r(dirty, { type: 'SET_REMINDER_COPIED', value: true })
    expect(s1.reminderCopied).toBe(true)
    expect(s1.savedCases).toBe(dirty.savedCases)
    expect(s1.workingCase).toBe(dirty.workingCase)
    expect(s1.answers).toBe(dirty.answers)

    const s2 = r(s1, { type: 'SET_REMINDER_COPIED', value: false })
    expect(s2.reminderCopied).toBe(false)

    const s3 = r(s1, { type: 'RESTART' })
    expect(s3.reminderCopied).toBe(false)
  })
})
