import { describe, it, expect } from 'vitest'
import { initialSession, sessionReducer as r, parsePendingGoogleSaveSnapshot } from './session'
import type { SessionState } from './session'
import type { Casefile } from '../domain/casefile'
import type { CheckinOption } from '../domain/checkinOptions'
import type { AppUser } from './auth'

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
// C7 fixture: a signed-in phone-method user with a display name — every
// field AppUser declares (session/auth.ts), nothing invented beyond it.
const FIXTURE_USER: AppUser = { method: 'phone', id: '+919876543210', name: 'Ananya' }

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

describe('SessionState field list (C5\'s pin, was the C4 scope-exclusion pin before that — C7 adds the auth-flow fields below)', () => {
  it('has exactly the fields this chunk ships — no fewer, no silent extra', () => {
    expect(Object.keys(initialSession).sort()).toEqual([
      'acctOpen', 'activeCaseId', 'answers', 'authBusy', 'authErr', 'authId', 'authMethod',
      'ciAccepted', 'ciConsecutive', 'ciJustUpdated',
      'ciPending', 'ciPendingIdx', 'ciReassure', 'ciSnapshot', 'ciStage',
      'history', 'logOpen', 'migration',
      'otp', 'otpCooldownUntil', 'otpResent',
      'pendingName', 'pendingSave', 'phaseDrift', 'prepChecks', 'prepDraft',
      'recoveryText', 'reminderCopied', 'removeConfirm', 'restartConfirm',
      'savedCases', 'screen', 'signOutConfirm',
      'trustOpen', 'user', 'voterEntryExplain', 'workingCase',
    ])
  })
})

describe('RESTART preserves the persisted slice AND the signed-in user (Issue #7 / design note 3; C7 design note 6)', () => {
  it('preserves savedCases and user, and resets every other field to initialSession, field by field', () => {
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
      user: FIXTURE_USER,
      authMethod: 'email',
      authId: 'someone@example.com',
      otp: '123456',
      authErr: 'That doesn\'t look like a full mobile number yet.',
      otpResent: true,
      signOutConfirm: true,
      acctOpen: true,
      pendingName: 'Draft Name',
      authBusy: true,
      otpCooldownUntil: 1_726_000_000_000,
      migration: 'running',
    }

    const s = r(dirty, { type: 'RESTART' })

    expect(s).toEqual({ ...initialSession, savedCases, user: FIXTURE_USER })
    expect(s.savedCases).toBe(savedCases) // the SAME array, not a copy
    expect(s.user, 'the topbar brand button dispatches RESTART; without this, tapping the logo signs the citizen out').toBe(FIXTURE_USER)
    for (const key of Object.keys(initialSession) as (keyof SessionState)[]) {
      if (key === 'savedCases' || key === 'user') continue
      expect(s[key], `RESTART must reset ${key} to initialSession's value`).toEqual(initialSession[key])
    }
  })
})

describe('BACK to Home preserves the persisted slice AND the signed-in user (design note 4; C7 design note 6)', () => {
  it('preserves savedCases and user when the previous screen is home — the single most likely place to silently wipe a citizen\'s saved casefiles', () => {
    const savedCases = [FIXTURE_CASE]
    const dirty: SessionState = {
      ...initialSession,
      savedCases,
      user: FIXTURE_USER,
      history: ['home'],
      screen: 'passport-q1',
      answers: { q1: 'adverse' },
      trustOpen: true,
    }

    const s = r(dirty, { type: 'BACK' })

    expect(s.screen).toBe('home')
    expect(s.savedCases).toBe(savedCases) // the SAME array, not a copy
    expect(s.user, 'the topbar brand button dispatches RESTART; without this, tapping the logo signs the citizen out').toBe(FIXTURE_USER)
    expect(s).toEqual({ ...initialSession, savedCases, user: FIXTURE_USER })
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

  it('C8\'s interp-confirm is still NOT part of this union (negative type-check, narrowed from C5\'s four-id pin now that C7 lands three of them)', () => {
    // @ts-expect-error 'interp-confirm' is C8's — not on ScreenId until then
    r(initialSession, { type: 'NAVIGATE', screen: 'interp-confirm' })
  })
  // 'sir-reverifying' (C6) moved out of this negative check — it is a real
  // ScreenId now; routing coverage lives in sirFlow.test.tsx.
})

describe('C7 ScreenId additions', () => {
  it('save-case / save-otp / save-name type-check in NAVIGATE (prototype router, 3937-3939)', () => {
    const s1 = seq({ type: 'NAVIGATE', screen: 'save-case' })
    const s2 = seq({ type: 'NAVIGATE', screen: 'save-otp' })
    const s3 = seq({ type: 'NAVIGATE', screen: 'save-name' })
    expect([s1.screen, s2.screen, s3.screen]).toEqual(['save-case', 'save-otp', 'save-name'])
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

describe('BEGIN_SAVE (C7 Task 16: the prototype\'s full beginSave branch, 2048-2052 — C5 only ever built the `if(S.user)` half)', () => {
  it(
    "signed in: lands on 'save-done' with the case saved, activeCaseId set, and pendingSave.returnScreen populated for " +
    'SaveDoneScreen to read — a pure regression pin on C5\'s shipped behaviour, unchanged by this task',
    () => {
      const s = seq(
        { type: 'SIGNED_IN', user: FIXTURE_USER },
        { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
        { type: 'ANSWER', service: 'passport', key: 'q2', value: 'informal' },
        {
          type: 'BEGIN_SAVE',
          engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
          now: 1_725_000_000_000, newId: 'passport-case-uuid',
        },
      )
      expect(s.screen).toBe('save-done')
      expect(s.savedCases).toHaveLength(1)
      // D4: BEGIN_SAVE threads the injected `newId` straight through to
      // completeSave — the created case's id is the INJECTED value, never a
      // timestamp derived inside the reducer.
      expect(s.savedCases[0].id).toBe('passport-case-uuid')
      expect(s.savedCases[0].engineKey).toBe('passport')
      expect(s.savedCases[0].outcome).toBe('still_open')
      expect(s.activeCaseId).toBe(s.savedCases[0].id)
      expect(s.pendingSave).toEqual({ engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove' })
      expect(s.workingCase).toBeNull()
      expect(s.user).toBe(FIXTURE_USER)
    },
  )

  it(
    'signed out: detours into the sign-in flow instead of saving — sets pendingSave, clears otp/authErr, navigates to ' +
    "'save-case', and leaves savedCases AND workingCase completely untouched (identity, not just value)",
    () => {
      expect.assertions(5)
      const workingCase: Casefile = { ...FIXTURE_CASE, id: 'working', unsaved: true }
      const dirty: SessionState = {
        ...initialSession,
        savedCases: [FIXTURE_CASE],
        workingCase,
        answers: { q1: 'adverse', q2: 'informal' },
        otp: '123456',
        authErr: 'That doesn\'t look like a full mobile number yet.',
        user: null,
      }
      const s = r(dirty, {
        type: 'BEGIN_SAVE',
        engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
        now: 1_725_000_000_000, newId: 'unused-because-signed-out',
      })
      expect(s.screen).toBe('save-case')
      expect(s.pendingSave).toEqual({ engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove' })
      expect({ otp: s.otp, authErr: s.authErr }).toEqual({ otp: '', authErr: null })
      // Identity, not value — a clone that happens to match by content would
      // still be a bug (a citizen's saved list re-rendering / an unrelated
      // effect re-firing off a changed reference). `dirty.savedCases` is the
      // exact same array BEGIN_SAVE was handed; nothing here may replace it.
      expect(s.savedCases).toBe(dirty.savedCases)
      expect(s.workingCase).toBe(dirty.workingCase)
    },
  )

  it(
    'abandoning at the OTP screen (BEGIN_SAVE then NAVIGATE away) leaves savedCases untouched at the reducer level — ' +
    'no route needed; the full rendered journey is Task 17\'s',
    () => {
      const before = seq({ type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' })
      const afterBeginSave = r(before, {
        type: 'BEGIN_SAVE',
        engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
        now: 1_725_000_000_000, newId: 'unused-because-signed-out',
      })
      expect(afterBeginSave.screen).toBe('save-case')
      expect(afterBeginSave.savedCases).toEqual([])
      const afterNavigateAway = r(afterBeginSave, { type: 'NAVIGATE', screen: 'home' })
      expect(afterNavigateAway.savedCases).toBe(afterBeginSave.savedCases) // same empty array, never touched
      expect(afterNavigateAway.savedCases).toEqual([])
      expect(afterNavigateAway.workingCase).toBeNull()
    },
  )
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

describe('TOGGLE_PREP_STEP / SET_PREP_DRAFT — PrepareScreen\'s tick/draft state lifted into the reducer (Task 12)', () => {
  const NOW = 1_725_000_000_000
  // state-5b (q1 'adverse' + q2 'formal_grievance'): 4 real steps, the same
  // fixture PrepareScreen.test.tsx uses as `escalate` — real playbook data,
  // not a toy fixture, so `caseSnapshot`'s own `stepsTotal`/`stepsDone`
  // derivation is exercised for real.
  const ESCALATE_ANSWERS = { q1: 'adverse', q2: 'formal_grievance' }

  it('SET_PREP_DRAFT stores the text verbatim', () => {
    const s = r(initialSession, { type: 'SET_PREP_DRAFT', text: 'in progress draft' })
    expect(s.prepDraft).toBe('in progress draft')
  })

  it('TOGGLE_PREP_STEP flips one index and leaves the rest; toggling twice returns to the original value; the previous prepChecks object is not mutated', () => {
    // Index 1 starts as an explicit `false` (not absent) so the round trip
    // is exact: `!false` -> `true` -> `!true` -> `false`, the SAME explicit
    // value it started at — an index that started absent would instead
    // land on an explicit `false` after two toggles (prototype
    // `S.prepChecks[i]=!S.prepChecks[i]`, verbatim), which is behaviourally
    // identical everywhere `prepChecks[i]` is read for truthiness but is
    // not what this test is checking.
    const before: SessionState = { ...initialSession, prepChecks: { 0: true, 1: false, 2: true } }
    const s1 = r(before, { type: 'TOGGLE_PREP_STEP', index: 1, now: NOW })
    expect(s1.prepChecks).toEqual({ 0: true, 1: true, 2: true })
    expect(before.prepChecks).toEqual({ 0: true, 1: false, 2: true }) // not mutated
    const s2 = r(s1, { type: 'TOGGLE_PREP_STEP', index: 1, now: NOW })
    expect(s2.prepChecks).toEqual({ 0: true, 1: false, 2: true })
  })

  it('re-snapshots the active still-open case when its engine matches the CURRENT screen — returnScreen becomes S.screen, stepsDone reflects the new tick', () => {
    const active: Casefile = {
      ...FIXTURE_CASE, id: 'c1', engineKey: 'passport', outcome: 'still_open',
      answers: ESCALATE_ANSWERS, returnScreen: 'passport-nextmove',
      stepsTotal: 0, stepsDone: 0, savedAt: NOW - 10_000,
    }
    const dirty: SessionState = {
      ...initialSession, savedCases: [active], activeCaseId: 'c1',
      screen: 'passport-prepare', answers: ESCALATE_ANSWERS, prepChecks: {},
    }
    const s = r(dirty, { type: 'TOGGLE_PREP_STEP', index: 0, now: NOW })
    expect(s.prepChecks).toEqual({ 0: true })
    expect(s.savedCases[0].returnScreen).toBe('passport-prepare')
    expect(s.savedCases[0].stepsTotal).toBe(4)
    expect(s.savedCases[0].stepsDone).toBe(1)
  })

  it('a MISMATCHED engine leaves the active case untouched — ticking a passport step must never overwrite a voter case', () => {
    const voterCase: Casefile = {
      ...FIXTURE_CASE, id: 'c1', engineKey: 'voter', outcome: 'still_open',
      returnScreen: 'voter-nextmove', savedAt: NOW - 10_000,
    }
    const dirty: SessionState = {
      ...initialSession, savedCases: [voterCase], activeCaseId: 'c1',
      screen: 'passport-prepare', answers: ESCALATE_ANSWERS, prepChecks: {},
    }
    const s = r(dirty, { type: 'TOGGLE_PREP_STEP', index: 0, now: NOW })
    expect(s.prepChecks).toEqual({ 0: true }) // the tick itself still happens
    expect(s.savedCases[0]).toEqual(voterCase) // but the voter case is untouched
    expect(s.savedCases).toBe(dirty.savedCases) // same reference — never rebuilt
  })

  it(
    'a superseded case (even with a matching engine) is left untouched — the still_open guard already covers it ' +
    '(Task 5 design note 1: verified correct as-is, pinned so a later reader does not "fix" it)',
    () => {
      const superseded: Casefile = {
        ...FIXTURE_CASE, id: 'c1', engineKey: 'passport', outcome: 'superseded',
        answers: ESCALATE_ANSWERS, returnScreen: 'passport-nextmove', savedAt: NOW - 10_000,
      }
      const dirty: SessionState = {
        ...initialSession, savedCases: [superseded], activeCaseId: 'c1',
        screen: 'passport-prepare', answers: ESCALATE_ANSWERS, prepChecks: {},
      }
      const s = r(dirty, { type: 'TOGGLE_PREP_STEP', index: 0, now: NOW })
      expect(s.prepChecks).toEqual({ 0: true }) // the tick itself still happens
      expect(s.savedCases[0]).toEqual(superseded) // but the superseded case's snapshot is untouched
      expect(s.savedCases).toBe(dirty.savedCases) // same reference — never rebuilt
    },
  )

  it('with no active case, TOGGLE_PREP_STEP is a no-op on savedCases/workingCase', () => {
    const dirty: SessionState = { ...initialSession, screen: 'passport-prepare', prepChecks: {} }
    const s = r(dirty, { type: 'TOGGLE_PREP_STEP', index: 0, now: NOW })
    expect(s.prepChecks).toEqual({ 0: true })
    expect(s.savedCases).toBe(dirty.savedCases)
    expect(s.workingCase).toBe(dirty.workingCase)
  })

  it('D7: preserves the case\'s ORIGINAL savedAt — a faithful transcription would push "Saved {date}" forward on every ticked checkbox', () => {
    const FIXED_SAVED_AT = 1_700_000_000_000
    const FAR_FUTURE_NOW = 9_999_999_999_999
    const active: Casefile = {
      ...FIXTURE_CASE, id: 'c1', engineKey: 'passport', outcome: 'still_open',
      answers: ESCALATE_ANSWERS, returnScreen: 'passport-nextmove', savedAt: FIXED_SAVED_AT,
      stepsTotal: 0, stepsDone: 0,
    }
    const dirty: SessionState = {
      ...initialSession, savedCases: [active], activeCaseId: 'c1',
      screen: 'passport-prepare', answers: ESCALATE_ANSWERS, prepChecks: {},
    }
    const s = r(dirty, { type: 'TOGGLE_PREP_STEP', index: 0, now: FAR_FUTURE_NOW })
    expect(s.savedCases[0].savedAt).toBe(FIXED_SAVED_AT) // unchanged
    expect(s.savedCases[0].stepsDone).toBe(1) // but the tick DID update
  })
})

describe('PHASE_DRIFT_RECHECK — the phase-drift interstitial\'s own CTA (Task 13, design note 2)', () => {
  it('clears phaseDrift and navigates to sir-q1, with the same nav()-style clears every other navigating action applies', () => {
    const dirty: SessionState = {
      ...initialSession, screen: 'checkin', history: ['home', 'sir-diagnosis'],
      phaseDrift: true, trustOpen: true, restartConfirm: true, removeConfirm: 'c1',
    }
    const s = r(dirty, { type: 'PHASE_DRIFT_RECHECK' })
    expect(s.phaseDrift).toBe(false)
    expect(s.screen).toBe('sir-q1')
    expect(s.history).toEqual(['home', 'sir-diagnosis', 'checkin'])
    expect(s.trustOpen).toBe(false)
    expect(s.restartConfirm).toBe(false)
    expect(s.removeConfirm).toBeNull()
  })

  it('touches nothing else — not answers, not savedCases, not any ci* field', () => {
    const dirty: SessionState = {
      ...initialSession, screen: 'checkin', phaseDrift: true,
      answers: { sirState: 'delhi', sirQ1: 'roll_present' }, savedCases: [FIXTURE_CASE],
      activeCaseId: 'c1', ciReassure: true,
    }
    const s = r(dirty, { type: 'PHASE_DRIFT_RECHECK' })
    expect(s.answers).toEqual(dirty.answers)
    expect(s.savedCases).toBe(dirty.savedCases)
    expect(s.activeCaseId).toBe('c1')
    expect(s.ciReassure).toBe(true)
  })
})

describe('BEGIN_WORKING_CHECKIN leaves phaseDrift false for a freshly built/reused working case (Task 13)', () => {
  it('a brand new working case never carries a stale phaseDrift=true from an earlier interaction', () => {
    const dirty: SessionState = {
      ...initialSession, screen: 'sir-diagnosis', phaseDrift: true,
      answers: { sirState: 'delhi', sirQ1: 'roll_present' },
    }
    const s = r(dirty, {
      type: 'BEGIN_WORKING_CHECKIN', engineKey: 'sir', serviceLabel: 'SIR',
      returnScreen: 'sir-nextmove', now: 1_760_000_000_000,
    })
    expect(s.screen).toBe('checkin')
    expect(s.phaseDrift).toBe(false)
  })
})

// =============================================================================
// Task 4 (C7) — the user, the auth-flow fields, the three screen ids.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html (git tag
// v1-design-lock-2) — S (1946-1951), nav() (2027-2031), back() (2035-2040),
// restart() (2043-2045), authSubmitId (2104-2113), authVerifyOtp (2119-2128),
// signOut (2155-2159), acctPopover (2246-2261), topbar's acct-chip (2262-
// 2274), the Escape handler (3948-3949).
// =============================================================================

describe('NAVIGATE clears authErr and acctOpen (C7 design note 5 — prototype nav(), 2029)', () => {
  it('clears a stale auth error and a floating account popover on navigation — a stale authErr would put "That doesn\'t look like a full mobile number yet." on a screen the citizen just arrived at, and a stale acctOpen would leave the popover floating over an unrelated screen', () => {
    const dirty: SessionState = {
      ...initialSession, authErr: 'That doesn\'t look like a full mobile number yet.', acctOpen: true,
    }
    const s = r(dirty, { type: 'NAVIGATE', screen: 'passport-q1' })
    expect(s.authErr).toBeNull()
    expect(s.acctOpen).toBe(false)
  })
})

describe('Every other navigating arm applies the SAME authErr/acctOpen clears as NAVIGATE (C7 design note 5 — C5\'s own design note 5 records this exact family of clears was missed once already)', () => {
  const NOW = 1_725_000_000_000
  const withStaleAuthUi = (extra: Partial<SessionState> = {}): SessionState => ({
    ...initialSession, authErr: 'stale error', acctOpen: true, ...extra,
  })

  const cases: Array<{ name: string; run: () => SessionState }> = [
    {
      name: 'BEGIN_WORKING_CHECKIN',
      run: () => r(withStaleAuthUi(), {
        type: 'BEGIN_WORKING_CHECKIN', engineKey: 'passport', serviceLabel: 'Passport',
        returnScreen: 'passport-nextmove', now: NOW,
      }),
    },
    {
      name: 'OPEN_CHECKIN',
      run: () => r(withStaleAuthUi({ savedCases: [FIXTURE_CASE] }), { type: 'OPEN_CHECKIN', id: 'c1' }),
    },
    {
      name: 'BEGIN_SAVE',
      run: () => r(withStaleAuthUi(), {
        type: 'BEGIN_SAVE', engineKey: 'passport', serviceLabel: 'Passport',
        returnScreen: 'passport-nextmove', now: NOW, newId: 'wiring-test-id',
      }),
    },
    {
      name: 'REOPEN_CASE',
      run: () => r(
        withStaleAuthUi({ savedCases: [{ ...FIXTURE_CASE, outcome: 'closed_unresolved', closedAt: NOW - 5000 }] }),
        { type: 'REOPEN_CASE', id: 'c1', now: NOW },
      ),
    },
    {
      name: 'REMOVE_SAVED',
      run: () => r(withStaleAuthUi({ savedCases: [FIXTURE_CASE] }), { type: 'REMOVE_SAVED', id: 'c1' }),
    },
    {
      name: 'PHASE_DRIFT_RECHECK',
      run: () => r(withStaleAuthUi({ screen: 'checkin' }), { type: 'PHASE_DRIFT_RECHECK' }),
    },
    {
      name: "applyCiFragment's navigating branch (exercised via CI_CHOOSE then CI_CONFIRM)",
      run: () => {
        const afterChoose = seq(
          { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
          { type: 'ANSWER', service: 'passport', key: 'q2', value: 'no_followup' },
          { type: 'BEGIN_WORKING_CHECKIN', engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove', now: NOW },
          { type: 'CI_CHOOSE', index: 0, now: NOW + 1000 },
        )
        return r({ ...afterChoose, authErr: 'stale error', acctOpen: true }, { type: 'CI_CONFIRM', now: NOW + 2000 })
      },
    },
    {
      // DEVIATION from the prototype's back() (2035-2040), which clears
      // neither acctOpen nor restartConfirm — this codebase already
      // diverges on restartConfirm (C3, 257-258), so adding acctOpen here
      // follows that same established local precedent rather than
      // inventing a new one. removeConfirm is deliberately NOT asserted
      // here: back() does not clear it, matching the prototype.
      name: "BACK to a non-Home screen — deliberate divergence from the prototype's back(), matching C3's existing restartConfirm divergence",
      run: () => r(withStaleAuthUi({ screen: 'passport-q2', history: ['home', 'passport-q1'] }), { type: 'BACK' }),
    },
  ]

  it.each(cases)('$name clears authErr and acctOpen', ({ run }) => {
    const s = run()
    expect(s.authErr).toBeNull()
    expect(s.acctOpen).toBe(false)
  })
})

describe('SET_AUTH_METHOD (prototype 3841)', () => {
  it('switching to email clears authId and authErr', () => {
    const dirty: SessionState = { ...initialSession, authMethod: 'phone', authId: '9876543210', authErr: 'some error' }
    const s = r(dirty, { type: 'SET_AUTH_METHOD', method: 'email' })
    expect(s.authMethod).toBe('email')
    expect(s.authId).toBe('')
    expect(s.authErr).toBeNull()
  })
})

describe('Auth-flow field setters — thin arms, prototype-mirrored', () => {
  it('SET_AUTH_ID stores the raw input verbatim', () => {
    const s = r(initialSession, { type: 'SET_AUTH_ID', value: '98765' })
    expect(s.authId).toBe('98765')
  })

  it('SET_OTP stores the raw input verbatim', () => {
    const s = r(initialSession, { type: 'SET_OTP', value: '123' })
    expect(s.otp).toBe('123')
  })

  it('SET_AUTH_ERR sets and clears the error', () => {
    const s1 = r(initialSession, { type: 'SET_AUTH_ERR', error: 'bad input' })
    expect(s1.authErr).toBe('bad input')
    const s2 = r(s1, { type: 'SET_AUTH_ERR', error: null })
    expect(s2.authErr).toBeNull()
  })

  it('SET_PENDING_NAME stores the draft name verbatim', () => {
    const s = r(initialSession, { type: 'SET_PENDING_NAME', value: 'Ananya' })
    expect(s.pendingName).toBe('Ananya')
  })

  it('SET_AUTH_BUSY sets and clears the in-flight flag — a citizen who taps "Send me a code" twice must not start two flows', () => {
    const s1 = r(initialSession, { type: 'SET_AUTH_BUSY', value: true })
    expect(s1.authBusy).toBe(true)
    const s2 = r(s1, { type: 'SET_AUTH_BUSY', value: false })
    expect(s2.authBusy).toBe(false)
  })

  it('SET_OTP_RESENT sets and clears the resent flag', () => {
    const s1 = r(initialSession, { type: 'SET_OTP_RESENT', value: true })
    expect(s1.otpResent).toBe(true)
    const s2 = r(s1, { type: 'SET_OTP_RESENT', value: false })
    expect(s2.otpResent).toBe(false)
  })

  it('SET_OTP_COOLDOWN stores the supplied deadline verbatim (D6: never Date.now() inside the reducer)', () => {
    const s = r(initialSession, { type: 'SET_OTP_COOLDOWN', until: 1_726_000_000_000 })
    expect(s.otpCooldownUntil).toBe(1_726_000_000_000)
    const cleared = r(s, { type: 'SET_OTP_COOLDOWN', until: null })
    expect(cleared.otpCooldownUntil).toBeNull()
  })
})

describe('AUTH_ID_SUBMITTED — the successful half of authSubmitId (prototype 2113)', () => {
  it('lands on save-otp with otp cleared, authErr null, and the normalised id written', () => {
    const dirty: SessionState = { ...initialSession, screen: 'save-case', otp: 'stale', authErr: 'stale error' }
    const s = r(dirty, { type: 'AUTH_ID_SUBMITTED', authId: '+919876543210', otpCooldownUntil: 1_726_000_060_000 })
    expect(s.screen).toBe('save-otp')
    expect(s.otp).toBe('')
    expect(s.authErr).toBeNull()
    expect(s.authId).toBe('+919876543210')
  })

  it(
    'also arms otpCooldownUntil with the supplied deadline (Task 12, design note 6) — GoTrue\'s rate-limit ' +
    'window starts at THIS send, so the resend control must already be disabled on arrival, not only after a resend',
    () => {
      const s = r(initialSession, { type: 'AUTH_ID_SUBMITTED', authId: '+919876543210', otpCooldownUntil: 1_726_000_060_000 })
      expect(s.otpCooldownUntil).toBe(1_726_000_060_000)
    },
  )
})

describe('SIGNED_IN (prototype authVerifyOtp, 2122)', () => {
  it('sets the user and clears authErr/otp/authBusy, leaving migration untouched — starting the migration is a separate, explicitly-dispatched step', () => {
    const dirty: SessionState = { ...initialSession, authBusy: true, authErr: 'stale', otp: '123456', migration: 'idle' }
    const s = r(dirty, { type: 'SIGNED_IN', user: FIXTURE_USER })
    expect(s.user).toEqual(FIXTURE_USER)
    expect(s.authBusy).toBe(false)
    expect(s.authErr).toBeNull()
    expect(s.otp).toBe('')
    expect(s.migration).toBe('idle')
  })
})

describe('SET_USER_NAME (Task 13\'s standalone rename path — distinct from SIGNED_IN, design note 7)', () => {
  it('sets user.name and changes nothing else, surviving a non-null authErr, a non-empty otp, and authBusy:true', () => {
    const dirty: SessionState = {
      ...initialSession,
      user: { method: 'phone', id: '+919876543210', name: null },
      authErr: 'stale error', otp: '123456', authBusy: true,
    }
    const s = r(dirty, { type: 'SET_USER_NAME', name: 'Ananya' })
    expect(s.user).toEqual({ method: 'phone', id: '+919876543210', name: 'Ananya' })
    for (const key of Object.keys(initialSession) as (keyof SessionState)[]) {
      if (key === 'user') continue
      expect(
        s[key],
        'reusing SIGNED_IN for a name change wipes three unrelated fields; the standalone rename path has no auth flow in progress to wipe',
      ).toEqual(dirty[key])
    }
  })

  it('returns s by identity when user is null', () => {
    const s = r(initialSession, { type: 'SET_USER_NAME', name: 'Ananya' })
    expect(s).toBe(initialSession)
  })
})

describe('MIGRATION_STARTED — the double-trigger guard (Task 8 design note 4: the mount effect\'s getCurrentUser() and the onAuthChange subscription can both fire)', () => {
  it.each([
    { from: 'idle', expectRunning: true },
    { from: 'failed', expectRunning: true },
    { from: 'running', expectRunning: false },
    { from: 'done', expectRunning: false },
  ] as const)('from $from', ({ from, expectRunning }) => {
    expect.assertions(1) // conditional branch below — pin exactly one assertion runs
    const dirty: SessionState = { ...initialSession, migration: from }
    const s = r(dirty, { type: 'MIGRATION_STARTED' })
    if (expectRunning) {
      expect(s.migration).toBe('running')
    } else {
      // The no-op IS the guard: identity, not just equal value.
      expect(s).toBe(dirty)
    }
  })
})

describe('MIGRATION_FAILED — nm_cases stays authoritative on failure (design note 7)', () => {
  it('sets migration to failed and authErr, leaving savedCases identical by reference', () => {
    const savedCases = [FIXTURE_CASE]
    const dirty: SessionState = { ...initialSession, migration: 'running', savedCases }
    const s = r(dirty, { type: 'MIGRATION_FAILED', error: 'network error' })
    expect(s.migration).toBe('failed')
    expect(s.authErr).toBe('network error')
    expect(s.savedCases).toBe(savedCases)
  })
})

describe('ADOPT_CASES — D10\'s adoptStoredCases (design note 7: cases is adopted+toUpload, the union — never adopted alone)', () => {
  it('replaces savedCases wholesale and sets migration to done in the SAME transition', () => {
    const dirty: SessionState = { ...initialSession, savedCases: [FIXTURE_CASE], migration: 'running' }
    const merged = [{ ...FIXTURE_CASE, id: 'c2' }, { ...FIXTURE_CASE, id: 'c3' }]
    const s = r(dirty, { type: 'ADOPT_CASES', cases: merged })
    expect(s.savedCases).toEqual(merged)
    expect(s.migration).toBe('done')
  })

  it('replaces a non-empty local set with an empty adopted set — the real "no cases anywhere" case a naive merge would get wrong', () => {
    const dirty: SessionState = { ...initialSession, savedCases: [FIXTURE_CASE], migration: 'running' }
    const s = r(dirty, { type: 'ADOPT_CASES', cases: [] })
    expect(s.savedCases).toEqual([])
    expect(s.migration).toBe('done')
  })
})

describe('SIGN_OUT — the Global Constraint arm (design note 7: local casefiles must never be lost silently)', () => {
  it('with an empty localCases payload (the ordinary, successful-migration case) clears user and savedCases, and resets everything else', () => {
    const dirty: SessionState = {
      ...initialSession, user: FIXTURE_USER, savedCases: [FIXTURE_CASE],
      screen: 'passport-diagnosis', history: ['home'], acctOpen: true, signOutConfirm: true,
      migration: 'done',
    }
    const s = r(dirty, { type: 'SIGN_OUT', localCases: [] })
    expect(s).toEqual(initialSession)
  })

  it('with a non-empty localCases payload (a failed migration) clears user but sets savedCases to those cases, and resets migration to idle', () => {
    const dirty: SessionState = { ...initialSession, user: FIXTURE_USER, savedCases: [], migration: 'failed', authErr: 'network error' }
    const localCases = [FIXTURE_CASE, { ...FIXTURE_CASE, id: 'c2' }]
    const s = r(dirty, { type: 'SIGN_OUT', localCases })
    expect(
      s.user,
      'after a failed migration the local set is still the truth; emptying it here is what lets the signed-out persistence effect write [] over the rows the failure path preserved',
    ).toBeNull()
    expect(
      s.savedCases,
      'after a failed migration the local set is still the truth; emptying it here is what lets the signed-out persistence effect write [] over the rows the failure path preserved',
    ).toEqual(localCases)
    expect(s.migration).toBe('idle')
  })
})

describe('TOGGLE_ACCT / CLOSE_ACCT / SET_SIGN_OUT_CONFIRM (prototype acct-chip 2266, scrim/Escape 2248/3949)', () => {
  it('TOGGLE_ACCT twice returns to closed and clears signOutConfirm on the closing toggle', () => {
    const opened = r(initialSession, { type: 'TOGGLE_ACCT' })
    expect(opened.acctOpen).toBe(true)
    const withConfirmArmed: SessionState = { ...opened, signOutConfirm: true }
    const closed = r(withConfirmArmed, { type: 'TOGGLE_ACCT' })
    expect(closed.acctOpen).toBe(false)
    expect(closed.signOutConfirm).toBe(false)
  })

  it('CLOSE_ACCT (scrim click / Escape) closes the popover and clears signOutConfirm', () => {
    const dirty: SessionState = { ...initialSession, acctOpen: true, signOutConfirm: true }
    const s = r(dirty, { type: 'CLOSE_ACCT' })
    expect(s.acctOpen).toBe(false)
    expect(s.signOutConfirm).toBe(false)
  })

  it('SET_SIGN_OUT_CONFIRM arms and disarms', () => {
    const armed = r(initialSession, { type: 'SET_SIGN_OUT_CONFIRM', value: true })
    expect(armed.signOutConfirm).toBe(true)
    const disarmed = r(armed, { type: 'SET_SIGN_OUT_CONFIRM', value: false })
    expect(disarmed.signOutConfirm).toBe(false)
  })
})

// =============================================================================
// Task 19 (post-Task-18 fix) — Google's real, full-page OAuth redirect wipes
// pendingSave/answers/prepChecks out of memory. RESUME_PENDING_SAVE is the
// new action App.tsx's mount effect dispatches once it reads a sessionStorage
// snapshot back and confirms a signed-in session; parsePendingGoogleSaveSnapshot
// is the pure validation that snapshot goes through first. See session.ts's
// own PENDING_GOOGLE_SAVE_KEY comment for the full design.
// =============================================================================
describe('RESUME_PENDING_SAVE (Task 19 fix)', () => {
  it(
    'produces the EXACT SAME savedCases entry BEGIN_SAVE\'s signed-in branch would produce from equivalent live ' +
    'state — field by field, not just "a case exists" — proving the restored answers/prepChecks on the action ' +
    'payload feed completeSave identically to state.answers/state.prepChecks on a live BEGIN_SAVE',
    () => {
      const liveEquivalent = seq(
        { type: 'SIGNED_IN', user: FIXTURE_USER },
        { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' },
        { type: 'ANSWER', service: 'passport', key: 'q2', value: 'informal' },
        {
          type: 'BEGIN_SAVE',
          engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
          now: 1_725_000_000_000, newId: 'same-uuid',
        },
      )

      // The post-redirect boot: a freshly-booted session (SIGNED_IN already
      // dispatched by App.tsx's mount effect — RESUME_PENDING_SAVE never
      // touches `user` itself) with the restored answers/prepChecks carried
      // on the ACTION payload, never read off live state (which starts
      // empty this early — the whole reason BEGIN_SAVE itself cannot be
      // re-dispatched here, per the brief).
      const booted = r(initialSession, { type: 'SIGNED_IN', user: FIXTURE_USER })
      const s = r(booted, {
        type: 'RESUME_PENDING_SAVE',
        engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
        answers: { q1: 'adverse', q2: 'informal' }, prepChecks: {},
        now: 1_725_000_000_000, newId: 'same-uuid',
      })

      expect(s.savedCases).toEqual(liveEquivalent.savedCases)
      expect(s.savedCases).toHaveLength(1)
      expect(s.savedCases[0].id).toBe('same-uuid')
      expect(s.savedCases[0].engineKey).toBe('passport')
      expect(s.savedCases[0].outcome).toBe('still_open')
      expect(s.activeCaseId).toBe(liveEquivalent.activeCaseId)
      expect(s.workingCase).toBeNull()
      expect(s.screen).toBe('save-done')
      expect(s.pendingSave).toEqual({ engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove' })
      // Beyond what BEGIN_SAVE itself needs to touch (its own state.answers
      // is already live and correct) — RESUME_PENDING_SAVE restores
      // state.answers/state.prepChecks too, so "Back to my case" from
      // save-done re-diagnoses against the SAME answers the save used, not
      // an empty post-boot answers record.
      expect(s.answers).toEqual({ q1: 'adverse', q2: 'informal' })
      expect(s.prepChecks).toEqual({})
      expect(s.user).toBe(FIXTURE_USER)
    },
  )

  it('merges into an existing still-open case of the same engine, exactly like BEGIN_SAVE\'s completeSave call does', () => {
    const withExisting: SessionState = {
      ...initialSession,
      user: FIXTURE_USER,
      savedCases: [{ ...FIXTURE_CASE, id: 'existing-1', engineKey: 'passport' }],
    }
    const s = r(withExisting, {
      type: 'RESUME_PENDING_SAVE',
      engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
      answers: { q1: 'adverse' }, prepChecks: {},
      now: 1_725_000_000_000, newId: 'unused-because-merged',
    })
    expect(s.savedCases).toHaveLength(1)
    expect(s.savedCases[0].id).toBe('existing-1') // merged, not a second row
    expect(s.activeCaseId).toBe('existing-1')
  })

  it('does not mutate the reducer (no Date.now()/crypto.randomUUID() call needed — now/newId come from the action)', () => {
    const s = r(initialSession, {
      type: 'RESUME_PENDING_SAVE',
      engineKey: 'sir', serviceLabel: 'SIR', returnScreen: 'sir-nextmove',
      answers: {}, prepChecks: {},
      now: 1_725_000_000_000, newId: 'fixed-id-proves-no-internal-mint',
    })
    expect(s.savedCases[0].id).toBe('fixed-id-proves-no-internal-mint')
  })
})

describe('parsePendingGoogleSaveSnapshot (Task 19 fix — validates a sessionStorage-round-tripped snapshot before it ever reaches RESUME_PENDING_SAVE)', () => {
  const VALID_RAW = JSON.stringify({
    engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
    answers: { q1: 'adverse' }, prepChecks: { 0: true },
  })

  it('parses a well-formed snapshot, field by field', () => {
    const s = parsePendingGoogleSaveSnapshot(VALID_RAW)
    expect(s).toEqual({
      engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
      answers: { q1: 'adverse' }, prepChecks: { 0: true },
    })
  })

  it('returns null, not a throw, on malformed JSON', () => {
    expect(parsePendingGoogleSaveSnapshot('{not valid json')).toBeNull()
  })

  it('returns null on valid JSON that is not an object (e.g. a bare number or string)', () => {
    expect(parsePendingGoogleSaveSnapshot('42')).toBeNull()
    expect(parsePendingGoogleSaveSnapshot('"just a string"')).toBeNull()
    expect(parsePendingGoogleSaveSnapshot('null')).toBeNull()
  })

  it('returns null when engineKey is not a real engine — the one check that stops a corrupt snapshot from crashing the resumed diagnose()', () => {
    const raw = JSON.stringify({
      engineKey: 'not-a-real-engine', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
      answers: {}, prepChecks: {},
    })
    expect(parsePendingGoogleSaveSnapshot(raw)).toBeNull()
  })

  it(
    'fix round 1, Finding 2: returns null when returnScreen is not a real ScreenId — a bogus/renamed/removed ' +
    'screen id must not reach App.tsx\'s `as ScreenId` cast and crash the router\'s exhaustiveness-checked ' +
    '`default` arm (a plain `throw`, with no error boundary anywhere in src/)',
    () => {
      const raw = JSON.stringify({
        engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'not-a-real-screen',
        answers: {}, prepChecks: {},
      })
      expect(parsePendingGoogleSaveSnapshot(raw)).toBeNull()
    },
  )

  it('returns null when a required field is missing (serviceLabel absent)', () => {
    const raw = JSON.stringify({ engineKey: 'passport', returnScreen: 'passport-nextmove', answers: {}, prepChecks: {} })
    expect(parsePendingGoogleSaveSnapshot(raw)).toBeNull()
  })

  it('returns null when answers/prepChecks are not objects', () => {
    const raw1 = JSON.stringify({
      engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
      answers: 'not an object', prepChecks: {},
    })
    const raw2 = JSON.stringify({
      engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'passport-nextmove',
      answers: {}, prepChecks: 'not an object',
    })
    expect(parsePendingGoogleSaveSnapshot(raw1)).toBeNull()
    expect(parsePendingGoogleSaveSnapshot(raw2)).toBeNull()
  })
})
