import { describe, it, expect } from 'vitest'
import { initialSession, sessionReducer as r, parsePendingGoogleSaveSnapshot, SCREEN_IDS } from './session'
import type { SessionState, ActiveInterpretation } from './session'
import type { Casefile } from '../domain/casefile'
import type { CheckinOption } from '../domain/checkinOptions'
import type { AppUser } from './auth'
import type { GatedInterpretation, Fact } from '../domain/interpret'

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
// C8 (Task 6) fixtures. `__gated` uses the SAME test-only escape hatch
// domain/interpret.test.ts's own `makeInterp()` already establishes as the
// sanctioned way to build a GatedInterpretation-shaped fixture outside
// interpretGates.ts's sole real constructor (`gateInterpretation`) — never
// used in production code, only in tests (this file's own reducer code
// below routes every REAL interp value through that same real constructor,
// exactly like interpretation.ts does).
const FIXTURE_FACT: Fact = {
  kind: 'reference_number', refType: 'passport_file_no', label: 'File Number',
  value: 'AB1234567890123', fills: '[File Number / ARN]',
}
const FIXTURE_INTERP: ActiveInterpretation = {
  __gated: 'test-only' as unknown as GatedInterpretation['__gated'],
  mappings: [
    {
      questionId: 'q1', value: 'adverse', span: 'they rejected my application',
      optionValues: ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'],
    },
  ],
  discarded: [],
  facts: [FIXTURE_FACT],
  droppedSensitive: false,
  unplaceable: false,
  provenance: 'simulated (local matcher)',
  ctxScreen: 'passport-q1',
  engine: 'passport',
  service: 'Passport',
  text: 'They rejected my application; I have File Number AB1234567890123.',
}

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

describe('SessionState field list (C5\'s pin, was the C4 scope-exclusion pin before that — C7 adds the auth-flow fields below, C8/Task 6 adds the describe/interp slice)', () => {
  it('has exactly the fields this chunk ships — no fewer, no silent extra', () => {
    expect(Object.keys(initialSession).sort()).toEqual([
      'acctOpen', 'activeCaseId', 'answers', 'appliedText', 'authBusy', 'authErr', 'authId', 'authMethod',
      'caseFacts',
      'ciAccepted', 'ciConsecutive', 'ciJustUpdated',
      'ciPending', 'ciPendingIdx', 'ciReassure', 'ciSnapshot', 'ciStage',
      'describeErr', 'describeOpen', 'describeText',
      'factEditIdx', 'factEditVal', 'fillsReviewed',
      'history',
      'interp', 'interpChangeOpen', 'interpProvenance',
      'logOpen', 'migration',
      'otp', 'otpCooldownUntil', 'otpResent',
      'pendingName', 'pendingSave', 'phaseDrift', 'prepChecks', 'prepDraft', 'quotaExhausted',
      'reading', 'recoveryText', 'reminderCopied', 'removeConfirm', 'restartConfirm',
      'savedCases', 'screen', 'signOutConfirm',
      'trustOpen', 'user', 'voterEntryExplain', 'workingCase',
    ])
  })
})

describe('initialSession has the thirteen C8 fields (Task 6) at their initial values', () => {
  it('the describe/interp slice starts closed, empty, and untouched', () => {
    expect(initialSession.describeOpen).toBe(false)
    expect(initialSession.describeText).toBe('')
    expect(initialSession.describeErr).toBeNull()
    expect(initialSession.reading).toBe(false)
    expect(initialSession.interp).toBeNull()
    expect(initialSession.interpChangeOpen).toEqual({})
    expect(initialSession.caseFacts).toEqual([])
    expect(initialSession.appliedText).toBeNull()
    expect(initialSession.factEditIdx).toBeNull()
    expect(initialSession.factEditVal).toBe('')
    expect(initialSession.fillsReviewed).toBe(false)
    expect(initialSession.interpProvenance).toBeNull()
    expect(initialSession.quotaExhausted).toBe(false)
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
      describeOpen: true,
      describeText: 'Police visited my house in June',
      describeErr: 'some error',
      reading: true,
      interp: FIXTURE_INTERP,
      interpChangeOpen: { q1: true },
      caseFacts: [FIXTURE_FACT],
      appliedText: 'Police visited my house in June',
      factEditIdx: 0,
      factEditVal: 'edited value',
      fillsReviewed: true,
      interpProvenance: 'simulated (local matcher)',
      quotaExhausted: true,
    }

    const s = r(dirty, { type: 'RESTART' })

    expect(s).toEqual({ ...initialSession, savedCases, user: FIXTURE_USER, migration: 'running' })
    expect(s.savedCases).toBe(savedCases) // the SAME array, not a copy
    expect(s.user, 'the topbar brand button dispatches RESTART; without this, tapping the logo signs the citizen out').toBe(FIXTURE_USER)
    // Whole-branch review Finding C1: migration must survive RESTART too.
    // With migration silently reset to 'idle', App.tsx's effect gates
    // (state.user !== null && state.migration === 'idle') make every
    // save after this point write to memory only — see the it.each below
    // for the full structural pin across all FOUR initialSession-reset
    // arms (Task 6 extends this from three to four — RESTART, BACK-to-home,
    // CLOSE_UNRESOLVED, SIGN_OUT).
    expect(s.migration, 'RESTART must not reset migration — doing so re-opens the App.tsx effect-gate hole (Finding C1)').toBe('running')
    for (const key of Object.keys(initialSession) as (keyof SessionState)[]) {
      if (key === 'savedCases' || key === 'user' || key === 'migration') continue
      expect(s[key], `RESTART must reset ${key} to initialSession's value`).toEqual(initialSession[key])
    }
  })
})

describe('BACK to Home preserves the persisted slice AND the signed-in user (design note 4; C7 design note 6)', () => {
  it('preserves savedCases, user AND migration when the previous screen is home — the single most likely place to silently wipe a citizen\'s saved casefiles (Finding C1)', () => {
    const savedCases = [FIXTURE_CASE]
    const dirty: SessionState = {
      ...initialSession,
      savedCases,
      user: FIXTURE_USER,
      migration: 'running',
      history: ['home'],
      screen: 'passport-q1',
      answers: { q1: 'adverse' },
      trustOpen: true,
    }

    const s = r(dirty, { type: 'BACK' })

    expect(s.screen).toBe('home')
    expect(s.savedCases).toBe(savedCases) // the SAME array, not a copy
    expect(s.user, 'the topbar brand button dispatches RESTART; without this, tapping the logo signs the citizen out').toBe(FIXTURE_USER)
    expect(s.migration, 'BACK-to-home must not reset migration — doing so re-opens the App.tsx effect-gate hole (Finding C1)').toBe('running')
    expect(s).toEqual({ ...initialSession, savedCases, user: FIXTURE_USER, migration: 'running' })
  })
})

describe('user/migration survive, and the thirteen C8 fields reset, on every `{ ...initialSession, ... }` reset arm — RESTART, BACK-to-home, CLOSE_UNRESOLVED, SIGN_OUT (whole-branch review Findings C1/C2, 2026-09-07 fix wave; Task 6 extends this from three arms to four)', () => {
  // Task 4 built a per-arm named test for RESTART and BACK-to-home (above),
  // but neither dirtied `migration`, so neither would have caught Finding
  // C1 (both arms silently dropped it) or Finding C2 (CLOSE_UNRESOLVED also
  // dropped `user`, re-opening a cross-account data leak — see caseSync.ts
  // rule zero and App.tsx's effect 1). This it.each is the structural fix
  // the review asked for: one assertion covering every arm that spreads
  // `initialSession`, so a field added to SessionState later and forgotten
  // on one of these arms fails here immediately, the same way the
  // nav-clear-set it.each above (`$name clears authErr and acctOpen`)
  // already catches a forgotten clear.
  //
  // Task 6 (C8): a FOURTH arm exists — SIGN_OUT — that this it.each never
  // covered before (session.ts's own comment near CLOSE_UNRESOLVED still
  // said "all three" until this task). SIGN_OUT's survivors differ from
  // the other three (it takes `a.localCases`, and `user` becomes null, not
  // preserved) — see this it.each's own `expectedUser`/`expectedMigration`
  // per arm, restored from RESTART/BACK/CLOSE_UNRESOLVED's shared
  // FIXTURE_USER/'running' pair only for those three. Every arm here is
  // ALSO seeded with all thirteen new C8 fields dirty, and the it.each body
  // asserts every one of them resets to `initialSession`'s own value on
  // every arm — none of the thirteen is ever a survivor (design note 3:
  // "quotaExhausted... resets on the four initialSession arms like
  // everything else").
  const NOW = 1_725_000_000_000
  const CLOSABLE_CASE: Casefile = {
    ...FIXTURE_CASE, id: 'c1', outcome: 'still_open',
    log: [{ t: NOW - 1000, kind: 'diagnosed', text: 'Escalate' }],
  }
  const DIRTY_C8_FIELDS = {
    describeOpen: true,
    describeText: 'I went to the passport office and they rejected my application.',
    describeErr: 'Write a line or two first. Even rough words are fine.',
    reading: true,
    interp: FIXTURE_INTERP,
    interpChangeOpen: { q1: true },
    caseFacts: [FIXTURE_FACT],
    appliedText: 'I went to the passport office and they rejected my application.',
    factEditIdx: 0,
    factEditVal: 'AB1234567890123 (edited)',
    fillsReviewed: true,
    interpProvenance: 'simulated (local matcher)',
    quotaExhausted: true,
  } satisfies Partial<SessionState>
  const C8_FIELD_KEYS = Object.keys(DIRTY_C8_FIELDS) as (keyof SessionState)[]

  const arms: Array<{
    name: string
    dirty: SessionState
    run: (s: SessionState) => SessionState
    expectedUser: AppUser | null
    expectedMigration: SessionState['migration']
  }> = [
    {
      name: 'RESTART',
      dirty: {
        ...initialSession, ...DIRTY_C8_FIELDS, user: FIXTURE_USER, migration: 'running',
        savedCases: [FIXTURE_CASE], screen: 'passport-diagnosis', history: ['home', 'passport-q1'],
      },
      run: (dirty) => r(dirty, { type: 'RESTART' }),
      expectedUser: FIXTURE_USER, expectedMigration: 'running',
    },
    {
      name: 'BACK to home',
      dirty: {
        ...initialSession, ...DIRTY_C8_FIELDS, user: FIXTURE_USER, migration: 'running',
        savedCases: [FIXTURE_CASE], screen: 'passport-q1', history: ['home'],
      },
      run: (dirty) => r(dirty, { type: 'BACK' }),
      expectedUser: FIXTURE_USER, expectedMigration: 'running',
    },
    {
      name: 'CLOSE_UNRESOLVED',
      dirty: {
        ...initialSession, ...DIRTY_C8_FIELDS, user: FIXTURE_USER, migration: 'running',
        savedCases: [CLOSABLE_CASE], activeCaseId: 'c1', screen: 'checkin', history: ['home'],
      },
      run: (dirty) => r(dirty, { type: 'CLOSE_UNRESOLVED', now: NOW }),
      expectedUser: FIXTURE_USER, expectedMigration: 'running',
    },
    {
      name: 'SIGN_OUT',
      dirty: {
        ...initialSession, ...DIRTY_C8_FIELDS, user: FIXTURE_USER, migration: 'done',
        savedCases: [FIXTURE_CASE], screen: 'passport-diagnosis', history: ['home', 'passport-q1'],
      },
      run: (dirty) => r(dirty, { type: 'SIGN_OUT', localCases: [] }),
      expectedUser: null, expectedMigration: 'idle',
    },
  ]

  it.each(arms)('$name preserves/resolves user and migration as documented, and resets all thirteen C8 fields', ({ dirty, run, expectedUser, expectedMigration }) => {
    const s = run(dirty)
    expect(s.user, "must resolve to this arm's own documented value — Finding C2's cross-account leak starts exactly here").toEqual(expectedUser)
    expect(s.migration, "must resolve to this arm's own documented value — Finding C1's effect-gate hole starts exactly here").toBe(expectedMigration)
    for (const key of C8_FIELD_KEYS) {
      expect(s[key], `${key} must reset to initialSession's value on this arm — a new field is non-persisted by default`).toEqual(initialSession[key])
    }
  })
})

describe('D17 (design note 3): interpProvenance is non-null iff appliedText is non-null — written and cleared together, always; forgetting this on ANY transition below leaves a provenance record attached to text that has been discarded', () => {
  const NOW = 1_725_000_000_000
  const CLOSABLE_CASE: Casefile = {
    ...FIXTURE_CASE, id: 'c1', outcome: 'still_open',
    log: [{ t: NOW - 1000, kind: 'diagnosed', text: 'Escalate' }],
  }
  const seedBothPopulated = (extra: Partial<SessionState> = {}): SessionState => ({
    ...initialSession,
    appliedText: 'I went to the passport office and they rejected my application.',
    interpProvenance: 'simulated (local matcher)',
    ...extra,
  })

  const transitions: Array<{ name: string; run: () => SessionState }> = [
    {
      name: 'ANSWER',
      run: () => r(
        seedBothPopulated({ answers: { q1: 'adverse' } }),
        { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' },
      ),
    },
    { name: 'RESTART', run: () => r(seedBothPopulated(), { type: 'RESTART' }) },
    {
      name: 'BACK to home',
      run: () => r(seedBothPopulated({ screen: 'passport-q1', history: ['home'] }), { type: 'BACK' }),
    },
    {
      name: 'CLOSE_UNRESOLVED',
      run: () => r(
        seedBothPopulated({ savedCases: [CLOSABLE_CASE], activeCaseId: 'c1', screen: 'checkin', history: ['home'] }),
        { type: 'CLOSE_UNRESOLVED', now: NOW },
      ),
    },
    { name: 'SIGN_OUT', run: () => r(seedBothPopulated(), { type: 'SIGN_OUT', localCases: [] }) },
  ]

  it.each(transitions)('$name leaves both null — never one without the other', ({ run }) => {
    const s = run()
    expect(
      s.interpProvenance === null,
      'D17: interpProvenance must be non-null exactly when appliedText is non-null',
    ).toBe(s.appliedText === null)
    expect(s.appliedText).toBeNull()
    expect(s.interpProvenance).toBeNull()
  })
})

describe('FR-AI-04\'s Sign-out deletion (Task 6) — "Remove/Sign out deletes them"; the Remove half already has a pin (Task 8 design note 6), this is the Sign-out half', () => {
  it(
    'with appliedText, caseFacts and interpProvenance all populated, SIGN_OUT leaves all three at their initial ' +
    'values, AND the serialised next state contains neither the applied text nor any fact value — a stated privacy ' +
    'guarantee with no test is a defect by this project\'s own standing rule',
    () => {
      expect.assertions(3)
      const dirty: SessionState = {
        ...initialSession,
        user: FIXTURE_USER,
        appliedText: 'I have a very specific File Number AB1234567890123 nobody else should see.',
        caseFacts: [FIXTURE_FACT],
        interpProvenance: 'simulated (local matcher)',
      }
      const s = r(dirty, { type: 'SIGN_OUT', localCases: [] })
      expect({ appliedText: s.appliedText, caseFacts: s.caseFacts, interpProvenance: s.interpProvenance }).toEqual({
        appliedText: initialSession.appliedText,
        caseFacts: initialSession.caseFacts,
        interpProvenance: initialSession.interpProvenance,
      })
      const serialised = JSON.stringify(s)
      expect(serialised).not.toContain('I have a very specific File Number')
      expect(serialised).not.toContain('AB1234567890123')
    },
  )
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

describe('ANSWER unconditionally clears caseFacts/appliedText/interpProvenance/fillsReviewed (Task 6 design note 6 — the ANSWER arm\'s one behaviour change this chunk)', () => {
  const seeded = (): SessionState => ({
    ...initialSession,
    answers: { q1: 'adverse' },
    caseFacts: [FIXTURE_FACT],
    appliedText: 'I went to the passport office and they rejected my application.',
    interpProvenance: 'simulated (local matcher)',
    fillsReviewed: true,
  })

  it(
    'a correction may change the diagnosis; a draft pre-filled from a fact captured under a different reading is the ' +
    'harm — and a provenance record attached to discarded text is a false record',
    () => {
      const s = r(seeded(), { type: 'ANSWER', service: 'passport', key: 'q1', value: 'no_contact' })
      expect(s.caseFacts).toEqual([])
      expect(s.appliedText).toBeNull()
      expect(s.interpProvenance).toBeNull()
      expect(s.fillsReviewed).toBe(false)
    },
  )

  it('clears all four even when the written value is UNCHANGED — never gated on the answers no-op (unlike `answers` itself, which keeps C1\'s strict no-op)', () => {
    const dirty = seeded()
    const s = r(dirty, { type: 'ANSWER', service: 'passport', key: 'q1', value: 'adverse' })
    expect(s.answers).toBe(dirty.answers) // C1's strict no-op still holds for `answers`
    expect(s.caseFacts).toEqual([])
    expect(s.appliedText).toBeNull()
    expect(s.interpProvenance).toBeNull()
    expect(s.fillsReviewed).toBe(false)
  })
})

describe('describeText survives Back, failure, and re-entry (spec §1) — the nav clear set grows by ZERO, a decision not an omission (Task 6 design note 5)', () => {
  it('NAVIGATE does not clear describeText', () => {
    const dirty: SessionState = { ...initialSession, describeText: 'Police visited my house in June' }
    const s = r(dirty, { type: 'NAVIGATE', screen: 'passport-q2' })
    expect(s.describeText).toBe('Police visited my house in June')
  })

  it('BACK to a non-Home screen does not clear describeText', () => {
    const dirty: SessionState = {
      ...initialSession, describeText: 'Police visited my house in June',
      screen: 'passport-q2', history: ['home', 'passport-q1'],
    }
    const s = r(dirty, { type: 'BACK' })
    expect(s.describeText).toBe('Police visited my house in June')
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

})

describe('C8 ScreenId addition (Task 6 — D13, prototype router 3936)', () => {
  it(
    "'interp-confirm' type-checks in NAVIGATE and lands — replaces the deleted @ts-expect-error negative pin " +
    "(D13's own '@ts-expect-error whose error no longer occurs is itself a compile error' point)",
    () => {
      const s = seq({ type: 'NAVIGATE', screen: 'interp-confirm' })
      expect(s.screen).toBe('interp-confirm')
    },
  )

  it("SCREEN_IDS has 'interp-confirm' — keeps the runtime validator and the union from drifting apart", () => {
    expect('interp-confirm' in SCREEN_IDS).toBe(true)
  })
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
    {
      // Fix round 1, Finding 2: C8's INTERPRETATION_DONE/INTERPRETATION_FAILED
      // are new navigating arms and had not joined this shared regression
      // pin — the exact family of clears this describe block exists to
      // guard, per its own name ("this exact family of clears was missed
      // once already"). INTERPRETATION_DONE also has its own bespoke
      // field-by-field test covering all five nav clears (see the
      // INTERPRETATION_DONE describe block below); this entry is the
      // regression pin, not a replacement for that.
      name: 'INTERPRETATION_DONE (C8)',
      run: () => r(
        withStaleAuthUi({ screen: 'passport-q1', history: ['home'] }),
        { type: 'INTERPRETATION_DONE', interp: FIXTURE_INTERP },
      ),
    },
    {
      // Fix round 1, Finding 2: the non-quota branch of INTERPRETATION_FAILED
      // navigates too, and had zero coverage of the nav clear set it applies
      // (session.ts's own `trustOpen`/`restartConfirm`/`removeConfirm`/
      // `authErr`/`acctOpen` clears). `screen: 'passport-q1'` is a real
      // DESCRIBE_CHAINS-covered entry screen, so this exercises the
      // navigating branch, not the no-entry no-navigate branch (Finding 3)
      // or the 'quota' no-navigate branch.
      name: 'INTERPRETATION_FAILED (C8, non-quota)',
      run: () => r(
        withStaleAuthUi({ screen: 'passport-q1', history: ['home'], describeText: 'they rejected my application' }),
        { type: 'INTERPRETATION_FAILED', reason: 'failed' },
      ),
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
// Task 6 (C8) — the describe/interp slice: fields, the 'interp-confirm'
// ScreenId, and the reducer actions/arms. TRANSCRIBED, not authored:
// design/nextmove-v1-prototype.html (git tag v1-design-lock-2) — S (1949),
// nav() (2027-2031), restart() (2043-2045), setAns (2195), toggleDescribe/
// describeInput/exampleFill/runInterpretation/interpPick/removeFact/
// editFact/saveFactEdit (2410-2456), the per-question reveal (3076), router
// (3936). APPLY_INTERPRETATION is Task 7's, not built here (design note 6).
// =============================================================================

describe('TOGGLE_DESCRIBE (prototype toggleDescribe, 2410)', () => {
  it('flips describeOpen and clears describeErr on both edges', () => {
    const dirty: SessionState = { ...initialSession, describeOpen: false, describeErr: 'some error' }
    const opened = r(dirty, { type: 'TOGGLE_DESCRIBE' })
    expect(opened.describeOpen).toBe(true)
    expect(opened.describeErr).toBeNull()
    const closed = r({ ...opened, describeErr: 'another error' }, { type: 'TOGGLE_DESCRIBE' })
    expect(closed.describeOpen).toBe(false)
    expect(closed.describeErr).toBeNull()
  })
})

describe('SET_DESCRIBE_TEXT / FILL_DESCRIBE_EXAMPLE / SET_DESCRIBE_ERR — thin field arms (prototype 2411-2422)', () => {
  it('SET_DESCRIBE_TEXT stores the raw input verbatim and does NOT touch describeErr', () => {
    const dirty: SessionState = { ...initialSession, describeErr: 'some error' }
    const s = r(dirty, { type: 'SET_DESCRIBE_TEXT', text: 'a new draft' })
    expect(s.describeText).toBe('a new draft')
    expect(s.describeErr).toBe('some error')
  })

  it(
    'FILL_DESCRIBE_EXAMPLE sets the text AND clears describeErr — a separate action from SET_DESCRIBE_TEXT so a ' +
    'later test can tell "typed" from "tapped an example"',
    () => {
      const dirty: SessionState = { ...initialSession, describeErr: 'some error' }
      const s = r(dirty, { type: 'FILL_DESCRIBE_EXAMPLE', text: 'Police came to my house in June' })
      expect(s.describeText).toBe('Police came to my house in June')
      expect(s.describeErr).toBeNull()
    },
  )

  it('SET_DESCRIBE_ERR sets and clears the error', () => {
    const s1 = r(initialSession, { type: 'SET_DESCRIBE_ERR', error: 'Write a line or two first. Even rough words are fine.' })
    expect(s1.describeErr).toBe('Write a line or two first. Even rough words are fine.')
    const s2 = r(s1, { type: 'SET_DESCRIBE_ERR', error: null })
    expect(s2.describeErr).toBeNull()
  })
})

describe('INTERPRETATION_STARTED (prototype runInterpretation, 2424)', () => {
  it('sets reading and clears describeErr', () => {
    const dirty: SessionState = { ...initialSession, describeErr: 'some error' }
    const s = r(dirty, { type: 'INTERPRETATION_STARTED' })
    expect(s.reading).toBe(true)
    expect(s.describeErr).toBeNull()
  })
})

describe('INTERPRETATION_DONE (prototype 2429-2431) — one action, one transition: state write and navigation together', () => {
  it('sets interp, clears reading/interpChangeOpen/factEditIdx, lands on interp-confirm, pushes history, and applies the nav clear set — field by field', () => {
    const dirty: SessionState = {
      ...initialSession,
      reading: true, interpChangeOpen: { oldQ: true }, factEditIdx: 2,
      screen: 'passport-q1', history: ['home'],
      trustOpen: true, restartConfirm: true, removeConfirm: 'c1', authErr: 'stale error', acctOpen: true,
    }
    const s = r(dirty, { type: 'INTERPRETATION_DONE', interp: FIXTURE_INTERP })
    expect(s.interp).toBe(FIXTURE_INTERP)
    expect(s.reading).toBe(false)
    expect(s.interpChangeOpen).toEqual({})
    expect(s.factEditIdx).toBeNull()
    expect(s.screen).toBe('interp-confirm')
    expect(s.history).toEqual(['home', 'passport-q1'])
    expect(s.trustOpen).toBe(false)
    expect(s.restartConfirm).toBe(false)
    expect(s.removeConfirm).toBeNull()
    expect(s.authErr).toBeNull()
    expect(s.acctOpen).toBe(false)
  })

  it(
    'replaces a previous interp WHOLESALE — a stale mapping does not survive, and interpChangeOpen is {} even if ' +
    'the previous one had open entries (spec §3: "old mappings discarded, stated")',
    () => {
      const staleInterp: ActiveInterpretation = {
        ...FIXTURE_INTERP,
        mappings: [{ questionId: 'q2', value: 'informal', span: 'informally raised it', optionValues: ['no_followup', 'informal', 'formal_grievance'] }],
      }
      const dirty: SessionState = { ...initialSession, interp: staleInterp, interpChangeOpen: { q2: true }, screen: 'passport-q1', history: ['home'] }
      const freshInterp: ActiveInterpretation = {
        ...FIXTURE_INTERP,
        mappings: [{ questionId: 'q1', value: 'adverse', span: 'they rejected my application', optionValues: ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'] }],
      }
      const s = r(dirty, { type: 'INTERPRETATION_DONE', interp: freshInterp })
      expect(s.interp).toBe(freshInterp)
      expect(s.interp?.mappings).toEqual(freshInterp.mappings)
      expect(s.interpChangeOpen).toEqual({})
    },
  )
})

describe('INTERPRETATION_FAILED (FR-AI-05) — every failure lands on the "We couldn\'t safely place this" panel, fail CLOSED not fail-stuck', () => {
  const dirty = (extra: Partial<SessionState> = {}): SessionState => ({
    ...initialSession,
    screen: 'passport-q1', history: ['home'],
    describeText: 'I went to the passport office and they rejected my application.',
    describeOpen: true, reading: true,
    ...extra,
  })

  it(
    'fix round 1, Finding 2: navigating (non-quota) applies the SAME full nav clear set as INTERPRETATION_DONE — ' +
    'trustOpen/restartConfirm/removeConfirm/authErr/acctOpen — field by field; INTERPRETATION_DONE already has a ' +
    'bespoke test for this, INTERPRETATION_FAILED previously had none',
    () => {
      const s = r(
        dirty({ trustOpen: true, restartConfirm: true, removeConfirm: 'c1', authErr: 'stale error', acctOpen: true }),
        { type: 'INTERPRETATION_FAILED', reason: 'failed' },
      )
      expect(s.trustOpen).toBe(false)
      expect(s.restartConfirm).toBe(false)
      expect(s.removeConfirm).toBeNull()
      expect(s.authErr).toBeNull()
      expect(s.acctOpen).toBe(false)
    },
  )

  it.each([
    ['failed'], ['no-provider'], ['no-chain'],
  ] as const)(
    'reason %s: navigates to interp-confirm with unplaceable:true, the citizen\'s text preserved, and reading false — ' +
    'fail-closed means landing on the panel with the text preserved; staying put with an error is fail-stuck',
    (reason) => {
      const s = r(dirty(), { type: 'INTERPRETATION_FAILED', reason })
      expect(s.screen).toBe('interp-confirm')
      expect(s.interp?.unplaceable).toBe(true)
      expect(s.interp?.text).toBe('I went to the passport office and they rejected my application.')
      expect(s.reading).toBe(false)
    },
  )

  it(
    "reason 'quota' does NOT navigate (I7) — the entry row is hidden, not broken (spec §2); the citizen stays on " +
    'their own question screen with the full closed option list, the path that always works',
    () => {
      expect.assertions(6)
      const s = r(dirty(), { type: 'INTERPRETATION_FAILED', reason: 'quota' })
      expect(s.screen).toBe('passport-q1')
      expect(s.quotaExhausted).toBe(true)
      expect(s.reading).toBe(false)
      expect(s.describeOpen).toBe(false)
      expect(s.interp).toBeNull()
      expect(s.describeText).toBe('I went to the passport office and they rejected my application.')
    },
  )

  it(
    'fix round 1, Finding 3: when s.screen is somehow not a real describe entry screen, does NOT synthesise an ' +
    'inconsistent interp (a wrong engine paired with an unrelated ctxScreen) — it takes the same no-navigate shape ' +
    'the \'quota\' reason uses instead, field by field',
    () => {
      expect.assertions(5)
      const s = r(dirty({ screen: 'home' }), { type: 'INTERPRETATION_FAILED', reason: 'failed' })
      expect(s.screen).toBe('home')
      expect(s.reading).toBe(false)
      expect(s.describeOpen).toBe(false)
      expect(s.interp).toBeNull()
      expect(s.describeText).toBe('I went to the passport office and they rejected my application.')
    },
  )

  it(
    'fix round 1, Finding 1: replacing interp wholesale ALSO clears interpChangeOpen/factEditIdx, matching what ' +
    'INTERPRETATION_DONE already correctly does (design note 8) — a reveal or an armed fact-edit left open against ' +
    'the OLD interp must not survive onto the new (synthesised, unplaceable) one',
    () => {
      const s = r(
        dirty({ interp: FIXTURE_INTERP, interpChangeOpen: { q1: true }, factEditIdx: 0, factEditVal: 'stale value' }),
        { type: 'INTERPRETATION_FAILED', reason: 'failed' },
      )
      expect(s.interpChangeOpen).toEqual({})
      expect(s.factEditIdx).toBeNull()
    },
  )

  it(
    'fix round 1, Finding 1 — the concrete reachable path from the review: confirm screen -> SET_FACT_EDIT opens ' +
    'edit mode on fact chip 0 -> BACK ("I\'ll answer the questions myself instead", which clears neither field) -> ' +
    'the citizen edits the text and re-runs -> it fails again; the stale factEditIdx/interpChangeOpen must not ' +
    'survive onto the new unplaceable panel',
    () => {
      const onConfirmScreen: SessionState = {
        ...initialSession, screen: 'interp-confirm', history: ['home', 'passport-q1'],
        describeText: 'they rejected my application', interp: FIXTURE_INTERP,
      }
      const editOpen = r(onConfirmScreen, { type: 'SET_FACT_EDIT', index: 0 })
      expect(editOpen.factEditIdx).toBe(0)
      expect(editOpen.factEditVal).toBe(FIXTURE_FACT.value)
      const backOut = r(editOpen, { type: 'BACK' })
      // BACK clears neither factEditIdx nor interpChangeOpen — that gap is
      // exactly what this finding is about; the fix is in the FAILED arm,
      // not here.
      expect(backOut.factEditIdx).toBe(0)
      const retyped = r(backOut, { type: 'SET_DESCRIBE_TEXT', text: 'a completely different story' })
      const s = r(retyped, { type: 'INTERPRETATION_FAILED', reason: 'failed' })
      expect(s.factEditIdx).toBeNull()
      expect(s.interpChangeOpen).toEqual({})
    },
  )
})

describe('INTERPRETATION_ABANDONED (I5) — the unmount cleanup for an in-flight call the citizen navigated away from', () => {
  it('with reading:true, clears reading and describeErr, leaving describeText/describeOpen/interp/screen untouched', () => {
    expect.assertions(6)
    const dirty: SessionState = {
      ...initialSession,
      reading: true, describeErr: 'some error',
      describeText: 'in progress text', describeOpen: true,
      interp: FIXTURE_INTERP, screen: 'passport-q1',
    }
    const s = r(dirty, { type: 'INTERPRETATION_ABANDONED' })
    expect(s.reading).toBe(false)
    expect(s.describeErr).toBeNull()
    expect(s.describeText).toBe('in progress text')
    expect(s.describeOpen).toBe(true)
    expect(s.interp).toBe(FIXTURE_INTERP)
    expect(s.screen).toBe('passport-q1')
  })

  it(
    'with reading:false, returns the reference-identical state — the same unmount cleanup also runs on the SUCCESS ' +
    'path (INTERPRETATION_DONE navigates, which unmounts the block too), and a second state write there would ' +
    're-render the confirm screen for nothing',
    () => {
      const dirty: SessionState = { ...initialSession, reading: false }
      const s = r(dirty, { type: 'INTERPRETATION_ABANDONED' })
      expect(s).toBe(dirty)
    },
  )
})

describe('INTERP_REPICK — thin arm over D4\'s pure repick', () => {
  it('delegates to repick and does not mutate the previous interp (identity check on the old mappings array)', () => {
    const dirty: SessionState = {
      ...initialSession,
      interp: {
        __gated: 'test-only' as unknown as GatedInterpretation['__gated'],
        mappings: [
          { questionId: 'voterQ1', value: 'decision', span: 'a decision', optionValues: [] },
          { questionId: 'voterAppealedRaw', value: 'pending', span: 'appeal pending', optionValues: [] },
        ],
        discarded: [], facts: [], droppedSensitive: false, unplaceable: false, provenance: 'sim',
        ctxScreen: 'voter-q1', engine: 'voter', service: 'Voter Services', text: 'a decision, appeal pending',
      },
    }
    const oldMappings = dirty.interp!.mappings
    // The reducer resolves the chain off the REAL DESCRIBE_CHAINS['voter-q1']
    // (interpret.ts) by ctxScreen — this exercises the real wiring, not a
    // stub. That chain's voterAppealedRaw is reachableIf voterQ1==='decision';
    // changing voterQ1 away from 'decision' is exactly what should void it.
    const s = r(dirty, { type: 'INTERP_REPICK', questionId: 'voterQ1', value: 'no_word' })
    expect(s.interp?.mappings).toEqual([{ questionId: 'voterQ1', value: 'no_word', span: 'a decision', optionValues: [] }])
    expect(s.interp?.discarded).toEqual([{ questionId: 'voterAppealedRaw', reason: 'unreachable' }])
    expect(oldMappings).toEqual([
      { questionId: 'voterQ1', value: 'decision', span: 'a decision', optionValues: [] },
      { questionId: 'voterAppealedRaw', value: 'pending', span: 'appeal pending', optionValues: [] },
    ]) // old array untouched — repick never mutates
    expect(s.interp?.mappings).not.toBe(oldMappings)
  })

  it('is a no-op when there is no active interp', () => {
    const s = r(initialSession, { type: 'INTERP_REPICK', questionId: 'q1', value: 'adverse' })
    expect(s).toEqual(initialSession)
  })

  it(
    'fix round 1, Finding 4: also closes the reveal for the question just picked, matching the locked prototype\'s ' +
    'own interpPick and the wider plan\'s Task 12 design note — one user action (picking a value FROM the open ' +
    'reveal), one atomic transition, leaving OTHER questions\' reveal state untouched',
    () => {
      const dirty: SessionState = {
        ...initialSession,
        interp: FIXTURE_INTERP,
        interpChangeOpen: { q1: true, q2: true },
      }
      const s = r(dirty, { type: 'INTERP_REPICK', questionId: 'q1', value: 'no_contact' })
      expect(s.interpChangeOpen).toEqual({ q1: false, q2: true })
    },
  )
})

describe('TOGGLE_INTERP_CHANGE — the per-question reveal (prototype 3076, D11\'s persistent control)', () => {
  it('opens and closes a single question\'s reveal by id, leaving other entries untouched', () => {
    const dirty: SessionState = { ...initialSession, interpChangeOpen: { q1: true } }
    const opened = r(dirty, { type: 'TOGGLE_INTERP_CHANGE', questionId: 'q2', open: true })
    expect(opened.interpChangeOpen).toEqual({ q1: true, q2: true })
    const closed = r(opened, { type: 'TOGGLE_INTERP_CHANGE', questionId: 'q1', open: false })
    expect(closed.interpChangeOpen).toEqual({ q1: false, q2: true })
  })
})

describe('SET_FACT_EDIT / SET_FACT_EDIT_VAL / SAVE_FACT_EDIT / REMOVE_FACT (D7, D4) — each does exactly one thing', () => {
  const withInterp = (facts: Fact[]): SessionState => ({
    ...initialSession,
    interp: { ...FIXTURE_INTERP, facts },
  })

  it('SET_FACT_EDIT arms the index and seeds factEditVal from the fact\'s current value', () => {
    const s = r(withInterp([FIXTURE_FACT]), { type: 'SET_FACT_EDIT', index: 0 })
    expect(s.factEditIdx).toBe(0)
    expect(s.factEditVal).toBe('AB1234567890123')
  })

  it('SET_FACT_EDIT_VAL stores the raw input verbatim', () => {
    const s = r(initialSession, { type: 'SET_FACT_EDIT_VAL', value: 'AB999' })
    expect(s.factEditVal).toBe('AB999')
  })

  it('SAVE_FACT_EDIT commits the trimmed value onto the fact at factEditIdx, sets edited:true, and closes edit mode', () => {
    const dirty: SessionState = { ...withInterp([FIXTURE_FACT]), factEditIdx: 0, factEditVal: '  AB999  ' }
    const s = r(dirty, { type: 'SAVE_FACT_EDIT' })
    expect(s.interp?.facts).toEqual([{ ...FIXTURE_FACT, value: 'AB999', edited: true }])
    expect(s.factEditIdx).toBeNull()
  })

  it('SAVE_FACT_EDIT with a blank (whitespace-only) value discards the edit but still closes edit mode — matches the prototype\'s own guard', () => {
    const dirty: SessionState = { ...withInterp([FIXTURE_FACT]), factEditIdx: 0, factEditVal: '   ' }
    const s = r(dirty, { type: 'SAVE_FACT_EDIT' })
    expect(s.interp?.facts).toEqual([FIXTURE_FACT])
    expect(s.factEditIdx).toBeNull()
  })

  it('REMOVE_FACT removes exactly the fact at index, leaving the others', () => {
    const otherFact: Fact = { kind: 'note', refType: 'date_applied', label: 'Applied', value: '12 June 2026', fills: null }
    const s = r(withInterp([FIXTURE_FACT, otherFact]), { type: 'REMOVE_FACT', index: 0 })
    expect(s.interp?.facts).toEqual([otherFact])
  })

  it('SET_FACT_EDIT / SAVE_FACT_EDIT / REMOVE_FACT are no-ops when there is no active interp', () => {
    expect(r(initialSession, { type: 'SET_FACT_EDIT', index: 0 })).toEqual(initialSession)
    expect(r(initialSession, { type: 'SAVE_FACT_EDIT' })).toEqual(initialSession)
    expect(r(initialSession, { type: 'REMOVE_FACT', index: 0 })).toEqual(initialSession)
  })
})

// =============================================================================
// Task 7 — APPLY_INTERPRETATION / UNPLACEABLE_PICK: the one path from a
// proposal to an answer (design notes 1-7; AC-AI-1). FIXTURE_INTERP is a
// passport interp; VOTER_INTERP below builds a voter one for the D2/D3/
// dependent-clearing tests, which all need the voter engine specifically.
// =============================================================================

describe('APPLY_INTERPRETATION — Task 7: the one path from a proposal to an answer (design notes 1-5, 7; AC-AI-1)', () => {
  const NOW = 1_726_000_000_000

  const PASSPORT_INTERP: ActiveInterpretation = {
    ...FIXTURE_INTERP,
    mappings: [
      { questionId: 'q1', value: 'adverse', span: 'they rejected my application', optionValues: ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'] },
      { questionId: 'q2', value: 'formal_grievance', span: 'I filed a formal grievance', optionValues: ['no_followup', 'informal', 'formal_grievance'] },
    ],
    facts: [FIXTURE_FACT],
    provenance: 'simulated (local matcher)',
    text: 'they rejected my application; I filed a formal grievance',
  }

  const VOTER_INTERP = (mappings: ActiveInterpretation['mappings']): ActiveInterpretation => ({
    ...FIXTURE_INTERP,
    engine: 'voter', service: 'Voter Services', ctxScreen: 'voter-q1',
    mappings,
  })

  const dirty = (extra: Partial<SessionState> = {}): SessionState => ({
    ...initialSession,
    interp: PASSPORT_INTERP,
    screen: 'passport-q1', history: ['home'],
    prepChecks: { 0: true }, prepDraft: 'a draft', fillsReviewed: true,
    describeText: 'they rejected my application', describeOpen: true,
    trustOpen: true, restartConfirm: true, removeConfirm: 'c1', authErr: 'stale error', acctOpen: true,
    ...extra,
  })

  it('writes both passport answers and lands on passport-diagnosis', () => {
    const s = r(dirty(), { type: 'APPLY_INTERPRETATION', now: NOW })
    expect(s.answers.q1).toBe('adverse')
    expect(s.answers.q2).toBe('formal_grievance')
    expect(s.screen).toBe('passport-diagnosis')
  })

  it(
    'sets caseFacts to the interpretation\'s facts, appliedText to its text and interpProvenance to interp.provenance ' +
    '(D17), non-empty — design note 2: facts must be assigned AFTER the answer writes; the ANSWER-path semantics ' +
    'clear them, and a refactor routing this arm through ANSWER would silently reintroduce that',
    () => {
      const s = r(dirty(), { type: 'APPLY_INTERPRETATION', now: NOW })
      expect(s.caseFacts).toEqual([FIXTURE_FACT])
      expect(s.caseFacts.length).toBeGreaterThan(0)
      expect(s.appliedText).toBe(PASSPORT_INTERP.text)
      expect(s.interpProvenance).toBe(PASSPORT_INTERP.provenance)
    },
  )

  it('clears prepChecks, prepDraft, fillsReviewed, describeText, describeOpen and interp, and applies the nav clear set', () => {
    const s = r(dirty(), { type: 'APPLY_INTERPRETATION', now: NOW })
    expect(s.prepChecks).toEqual({})
    expect(s.prepDraft).toBeNull()
    expect(s.fillsReviewed).toBe(false)
    expect(s.describeText).toBe('')
    expect(s.describeOpen).toBe(false)
    expect(s.interp).toBeNull()
    expect(s.history).toEqual(['home', 'passport-q1'])
    expect(s.trustOpen).toBe(false)
    expect(s.restartConfirm).toBe(false)
    expect(s.removeConfirm).toBeNull()
    expect(s.authErr).toBeNull()
    expect(s.acctOpen).toBe(false)
  })

  it(
    'dependent clearing threads correctly: a voterQ1 mapping applied over an existing voterAppealedRaw/voterAppealed ' +
    'pair clears both (via VOTER_DEPS), in one transition — the accumulating answers object must be threaded through ' +
    'applyCorrection; applying each mapping against the ORIGINAL answers loses the dependent clear',
    () => {
      const dirtyState: SessionState = {
        ...dirty({ interp: VOTER_INTERP([{ questionId: 'voterQ1', value: 'no_word', span: 'no word yet', optionValues: [] }]) }),
        answers: { voterQ1: 'decision', voterAppealedRaw: 'pending', voterAppealed: 'pending' },
      }
      const s = r(dirtyState, { type: 'APPLY_INTERPRETATION', now: NOW })
      expect(s.answers.voterQ1).toBe('no_word')
      expect(s.answers.voterAppealedRaw).toBeUndefined()
      expect(s.answers.voterAppealed).toBeUndefined()
    },
  )

  it(
    'the parity write: a voterAppealedRaw: \'pending\' mapping writes BOTH voterAppealedRaw and voterAppealed, in ' +
    'that order — the raw/normalised split, VoterScreens.tsx:106-108',
    () => {
      // DESCRIBE_CHAINS['voter-q2'] only offers a voterAppealedRaw mapping
      // when the entry screen is voter-q2 — reachable only once voterQ1 is
      // ALREADY 'decision' (the tap path's own precondition). answers
      // seeds that pre-existing fact so routeAfterApply sees a realistic
      // voter-q2-entry state, not an interp that arrived with no voterQ1
      // at all.
      const dirtyState = dirty({
        interp: VOTER_INTERP([{ questionId: 'voterAppealedRaw', value: 'pending', span: 'appeal is pending', optionValues: [] }]),
        answers: { voterQ1: 'decision' },
      })
      const s = r(dirtyState, { type: 'APPLY_INTERPRETATION', now: NOW })
      expect(s.answers.voterAppealedRaw).toBe('pending')
      expect(s.answers.voterAppealed).toBe('pending')
      expect(s.screen).toBe('voter-diagnosis')
    },
  )

  it(
    'the parity write\'s normalisation logic is exercised directly, not just the identity case: a mapping value of ' +
    '\'notsure\' (never produced by a real describe mapping — Task 2 design note 5 keeps it out of the option set) ' +
    'still normalises to \'unclassified\' on voterAppealed while voterAppealedRaw keeps the raw pick',
    () => {
      const dirtyState = dirty({ interp: VOTER_INTERP([{ questionId: 'voterAppealedRaw', value: 'notsure', span: 'not sure about the appeal', optionValues: [] }]) })
      const s = r(dirtyState, { type: 'APPLY_INTERPRETATION', now: NOW })
      expect(s.answers.voterAppealedRaw).toBe('notsure')
      expect(s.answers.voterAppealed).toBe('unclassified')
    },
  )

  it(
    'D2: a confirmed voterEntry: \'sir\' mapping lands on sir-state and state.answers.voterEntry is undefined — the ' +
    'tap path (VoterEntry\'s own onSelect, session.ts\'s voterEntryExplain note) writes nothing for it either',
    () => {
      expect.assertions(2)
      const dirtyState = dirty({ interp: VOTER_INTERP([{ questionId: 'voterEntry', value: 'sir', span: 'I am on the SIR roll', optionValues: [] }]) })
      const s = r(dirtyState, { type: 'APPLY_INTERPRETATION', now: NOW })
      expect(s.screen).toBe('sir-state')
      expect(s.answers.voterEntry).toBeUndefined()
    },
  )

  it('is a no-op when there is no active interp', () => {
    const s = r(initialSession, { type: 'APPLY_INTERPRETATION', now: NOW })
    expect(s).toBe(initialSession)
  })

  it(
    'design note 1: re-snapshots the active still-open case when its engine matches the interpretation\'s engine — ' +
    'preserving the case\'s OWN returnScreen (the second precedent, applyCheckinPatch\'s, NOT TOGGLE_PREP_STEP\'s ' +
    's.screen-based one), pinning savedAt (D7), and re-snapshotting with prepChecks:{} per design note 2\'s own clear',
    () => {
      const active: Casefile = {
        ...FIXTURE_CASE, id: 'c1', engineKey: 'passport', outcome: 'still_open',
        answers: { q1: 'no_contact' }, returnScreen: 'passport-nextmove',
        prepChecks: { 0: true }, savedAt: NOW - 10_000,
      }
      const dirtyState: SessionState = {
        ...dirty(), savedCases: [active], activeCaseId: 'c1', answers: { q1: 'no_contact' },
      }
      const s = r(dirtyState, { type: 'APPLY_INTERPRETATION', now: NOW })
      expect(s.savedCases[0].answers).toEqual({ q1: 'adverse', q2: 'formal_grievance' })
      expect(s.savedCases[0].returnScreen).toBe('passport-nextmove') // preserved, NOT recomputed to 'passport-diagnosis'
      expect(s.savedCases[0].savedAt).toBe(NOW - 10_000) // D7: original savedAt survives
      expect(s.savedCases[0].prepChecks).toEqual({}) // re-snapshotted with {} per design note 2's clear
      expect(s.screen).toBe('passport-diagnosis') // the CITIZEN still navigates to the real destination
    },
  )

  it('with no active case, APPLY_INTERPRETATION leaves savedCases/workingCase untouched', () => {
    const s = r(dirty(), { type: 'APPLY_INTERPRETATION', now: NOW })
    expect(s.savedCases).toEqual([])
    expect(s.workingCase).toBeNull()
  })

  it('a MISMATCHED engine\'s active case is left untouched — applying a passport interpretation must never overwrite a voter case', () => {
    const voterCase: Casefile = {
      ...FIXTURE_CASE, id: 'c1', engineKey: 'voter', outcome: 'still_open', returnScreen: 'voter-nextmove', savedAt: NOW - 10_000,
    }
    const dirtyState: SessionState = { ...dirty(), savedCases: [voterCase], activeCaseId: 'c1' }
    const s = r(dirtyState, { type: 'APPLY_INTERPRETATION', now: NOW })
    expect(s.savedCases[0]).toEqual(voterCase)
    expect(s.savedCases).toBe(dirtyState.savedCases)
  })
})

describe(
  'AC-AI-1 (reducer level) — reaching interp-confirm writes NOTHING to answers/caseFacts/appliedText/prepChecks/' +
  'savedCases; only APPLY_INTERPRETATION and UNPLACEABLE_PICK write',
  () => {
    it('INTERPRETATION_DONE leaves answers reference-identical, and leaves caseFacts/appliedText/savedCases untouched', () => {
      expect.assertions(4)
      const dirty: SessionState = {
        ...initialSession,
        answers: { q1: 'adverse' },
        caseFacts: [], appliedText: null,
        savedCases: [FIXTURE_CASE],
        screen: 'passport-q1', history: ['home'],
      }
      const s = r(dirty, { type: 'INTERPRETATION_DONE', interp: FIXTURE_INTERP })
      expect(s.answers).toBe(dirty.answers) // reference-identical, not merely deep-equal
      expect(s.caseFacts).toBe(dirty.caseFacts)
      expect(s.appliedText).toBe(dirty.appliedText)
      expect(s.savedCases).toBe(dirty.savedCases)
    })
  },
)

describe('UNPLACEABLE_PICK — the unplaceable-panel fallback (design note 6, I10)', () => {
  const onPanel = (extra: Partial<SessionState> = {}): SessionState => ({
    ...initialSession,
    interp: FIXTURE_INTERP,
    screen: 'interp-confirm', history: ['home', 'passport-q1'],
    ...extra,
  })

  it('writes the answer, restores the facts/text/provenance, and navigates — all in one transition', () => {
    const s = r(onPanel(), {
      type: 'UNPLACEABLE_PICK', questionId: 'q1', value: 'adverse',
      facts: [FIXTURE_FACT], text: 'they rejected my application', provenance: 'simulated (local matcher)',
    })
    expect(s.answers.q1).toBe('adverse')
    expect(s.caseFacts).toEqual([FIXTURE_FACT])
    expect(s.appliedText).toBe('they rejected my application')
    expect(s.interpProvenance).toBe('simulated (local matcher)')
    expect(s.screen).toBe('passport-q2')
    expect(s.interp).toBeNull()
  })

  it('an empty facts payload leaves caseFacts empty rather than stale', () => {
    const withStaleFacts: SessionState = { ...onPanel(), caseFacts: [FIXTURE_FACT] }
    const s = r(withStaleFacts, {
      type: 'UNPLACEABLE_PICK', questionId: 'q2', value: 'informal',
      facts: [], text: 'informally raised it', provenance: 'simulated (local matcher)',
    })
    expect(s.caseFacts).toEqual([])
  })

  it.each([
    ['q1', 'adverse', 'q1', 'adverse', 'passport-q2'],
    ['q2', 'informal', 'q2', 'informal', 'passport-diagnosis'],
    ['voterQ1', 'no_word', 'voterQ1', 'no_word', 'voter-diagnosis'],
    ['sirQ1', 'roll_absent', 'sirQ1', 'roll_absent', 'sir-diagnosis'],
  ] as const)(
    'question %s value %s: derives its write/destination from unplaceablePickPlan, matching the real screen',
    (questionId, value, key, expectedValue, screen) => {
      const s = r(onPanel(), { type: 'UNPLACEABLE_PICK', questionId, value, facts: [], text: 't', provenance: 'p' })
      expect(s.answers[key]).toBe(expectedValue)
      expect(s.screen).toBe(screen)
    },
  )

  it(
    'D2: for voterEntry: \'sir\' writes NO answer at all and lands on sir-state, with the facts restored — ' +
    'VoterScreens.tsx:30-38',
    () => {
      expect.assertions(3)
      const s = r(onPanel(), {
        type: 'UNPLACEABLE_PICK', questionId: 'voterEntry', value: 'sir',
        facts: [FIXTURE_FACT], text: 'I am on the SIR roll', provenance: 'simulated (local matcher)',
      })
      expect(s.answers.voterEntry).toBeUndefined()
      expect(s.screen).toBe('sir-state')
      expect(s.caseFacts).toEqual([FIXTURE_FACT])
    },
  )

  it(
    'for voterAppealedRaw: \'pending\' produces the raw-then-normalised dual write, in that order, matching ' +
    'VoterScreens.tsx:107-113\'s own load-bearing-ordering comment',
    () => {
      const s = r(onPanel(), {
        type: 'UNPLACEABLE_PICK', questionId: 'voterAppealedRaw', value: 'pending',
        facts: [], text: 'appeal pending', provenance: 'p',
      })
      expect(s.answers.voterAppealedRaw).toBe('pending')
      expect(s.answers.voterAppealed).toBe('pending')
      expect(s.screen).toBe('voter-diagnosis')
    },
  )

  it(
    'voterEntry: \'notsure\' explains in place — no writes, no fact restore, no navigation, matching ' +
    'EXPLAIN_VOTER_ENTRY exactly',
    () => {
      const before = onPanel()
      const s = r(before, {
        type: 'UNPLACEABLE_PICK', questionId: 'voterEntry', value: 'notsure',
        facts: [FIXTURE_FACT], text: 'not sure', provenance: 'p',
      })
      expect(s.voterEntryExplain).toBe(true)
      expect(s.screen).toBe(before.screen) // unchanged — no navigation
      expect(s.interp).toBe(before.interp) // untouched
      expect(s.caseFacts).toEqual(before.caseFacts) // untouched — no restore either
    },
  )

  it(
    'I10: the action type carries no pre-computed screen — a payload screen field does not type-check, so the ' +
    'destination can only ever come from unplaceablePickPlan',
    () => {
      // @ts-expect-error — UNPLACEABLE_PICK carries no `screen` field on purpose (I10): a pre-computed destination
      // pushes six shipped routings into the panel as a second, drifting copy; Task 2's parity test is what keeps
      // the single derivation honest. Verified RED by adding `screen` to the SessionAction member above and
      // watching this line's ts-expect-error itself fail to compile ("Unused '@ts-expect-error' directive").
      r(initialSession, { type: 'UNPLACEABLE_PICK', questionId: 'q1', value: 'adverse', facts: [], text: 't', provenance: 'p', screen: 'passport-q2' })
    },
  )
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

  it(
    "accepts 'interp-confirm' (Task 6/C8) as a returnScreen — a new ScreenId joins SCREEN_IDS by construction " +
    '(session.ts\'s own `Record<ScreenId, true>` comment), so this validator needs no per-chunk update',
    () => {
      const raw = JSON.stringify({
        engineKey: 'passport', serviceLabel: 'Passport', returnScreen: 'interp-confirm',
        answers: {}, prepChecks: {},
      })
      expect(parsePendingGoogleSaveSnapshot(raw)).not.toBeNull()
    },
  )
})
