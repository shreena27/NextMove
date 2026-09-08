import type { AnswerRecord } from '../domain/types'
import type { Casefile } from '../domain/casefile'
import { caseSnapshot } from '../domain/casefile'
import type { CheckinOption } from '../domain/checkinOptions'
import { applyCorrection } from '../domain/answers'
import { diagnose } from '../domain/engine'
import { DEPS_FOR, ENGINES } from '../playbooks/engines'
import type { CiFragment, CiSnapshot } from './cases'
import {
  beginWorkingCheckin, openCheckin, completeSave, activeCase,
  ciChoose, ciConfirm, ciValence, ciClosureAnswer, ciUndo, ciCancel,
  closeUnresolved, reopenCase, removeSaved, setRemind, toggleLog, setRemoveConfirm, setReminderCopied,
} from './cases'
// A session/ -> session/ import, permitted by the layering rule (session.ts's
// own doc comment / auth.ts's doc comment): AppUser is a type only, never a
// network call — session.ts still never talks to Supabase directly.
import type { AppUser } from './auth'

/** The three services C3 ships. Declared here rather than derived from
 *  DEPS_FOR, which is typed Record<string, DependentKeys> — `keyof` that is
 *  `string`, so it would type-check nothing. src/playbooks/ is untouched by
 *  C3, so this union does not move into engines.ts until a later chunk. */
export type ServiceKey = 'passport' | 'voter' | 'sir'

/** Every screen C3 routes to — the prototype's own ids (router, 3910-3944),
 *  so C4/C5 extend the union rather than renaming the graph. Typed as a
 *  union, not `string`, so Task 9's switch is exhaustiveness-checked and a
 *  typo'd id is a compile error instead of a silent `default`. */
export type ScreenId =
  | 'home' | 'other-services'
  | 'passport-guardrail' | 'passport-outofscope' | 'passport-q1' | 'passport-q2'
  | 'passport-recovery' | 'passport-recovery-paste' | 'passport-recovery-show'
  | 'passport-diagnosis' | 'passport-nextmove' | 'passport-prepare'
  | 'voter-entry' | 'voter-q1' | 'voter-q2' | 'voter-diagnosis' | 'voter-nextmove' | 'voter-prepare'
  | 'sir-state' | 'sir-unsupported' | 'sir-reverifying' | 'sir-q1' | 'sir-diagnosis' | 'sir-nextmove' | 'sir-prepare'
  | 'checkin' | 'dead-end' | 'case-closed' | 'save-done'
  | 'save-case' | 'save-otp' | 'save-name'
// Transcribe the exact id list from the prototype's own switch (3910-3944),
// taking only C3's screens; do not invent or normalise a name.
// C4 adds the three '*-prepare' ids (also the prototype's own, same
// switch) next to each service's existing block, per this union's own
// anticipation above — nothing else in this file changes for C4 (no new
// action, no new field, no reducer change; session.test.ts pins that).
// C5 adds the four ids above (same switch, 3941-3943 plus save-done at
// 3940) — 'checkin', 'dead-end', 'case-closed', 'save-done'.
// C6 adds 'sir-reverifying' (freshness/re-verification screen, prototype
// 3931's 'sir-reverifying' case).
// C7 adds 'save-case' / 'save-otp' / 'save-name' (same switch, 3937-3939) —
// the sign-in + save flow. Still deliberately NOT added here:
// 'interp-confirm' (C8's free-text interpretation confirm) — it belongs to
// a later chunk and stays off this union until that chunk lands.

// CiSnapshot is cases.ts's, not this file's (imported above): Task 4
// anticipated its shape here (`answers`/`prepChecks` copied by value, plus
// the active case serialised whole to a `caseJson` string so ciUndo could
// `Object.assign` every field back — a faithful mirror of the prototype's
// own ciSnapshotNow(), 2658-2661). Task 6's brief corrects that
// anticipation: this port is immutable, so the snapshot can hold the case
// object directly — no JSON.stringify/parse round trip is needed the way
// the prototype's needs one (it mutates the case in place after
// snapshotting, so a live reference would drift under it). See cases.ts's
// own CiSnapshot doc comment for the full reasoning.

/** C3+C4's slice, plus everything C5 adds, plus C7's user/auth-flow fields:
 *  the persisted casefile list, working/active case tracking,
 *  prepare-progress state, check-in interaction state, casefile UI state,
 *  and (from C7) the signed-in user and the sign-in/save-flow's own UI
 *  state. Fields belonging to the LATER C8 chunk (`describe*`/`interp`) are
 *  still ABSENT on purpose — a field nothing reads is a field that rots.
 *
 *  `savedCases` AND (from C7) `user` are the persisted slice: they are the
 *  ONLY fields RESTART and BACK-to-Home preserve, via an explicit allowlist
 *  (`{ ...initialSession, savedCases: s.savedCases, user: s.user }`) rather
 *  than a blanket `initialSession` reset — so a future field added here is
 *  non-persisted by default (fail-safe direction) unless someone
 *  deliberately adds it to that allowlist too. Signing out is a DIFFERENT,
 *  explicit action (`SIGN_OUT`) — RESTART and BACK-to-Home must never do it
 *  as a side effect (the topbar brand button dispatches RESTART; without
 *  `user` on the allowlist, tapping the logo would silently sign the
 *  citizen out). */
export interface SessionState {
  screen: ScreenId
  history: ScreenId[]
  answers: AnswerRecord
  restartConfirm: boolean
  trustOpen: boolean
  recoveryText: string
  /** The voter entry question's inline not-sure explainer (FR-V-03):
   *  "I'm not sure" EXPLAINS in place, it does not exit the flow (AC-V-2).
   *  RECORDED DEVIATION: the prototype stores this inside S.answers
   *  (line 3405). It is UI state, not an answer — in `answers` it would
   *  land in Diagnosis.matchedAnswers and reach the trust panel. Same
   *  behaviour: the prototype clears it only via restart(), and RESTART
   *  returns initialSession. */
  voterEntryExplain: boolean

  /** The persisted casefile list (prototype `S.savedCases`, 1948). See this
   *  interface's own header comment — the one field RESTART/BACK-to-Home
   *  preserve. */
  savedCases: Casefile[]
  /** The case a diagnosis/check-in/prepare screen currently operates
   *  against, and its id (prototype `S.workingCase`/`S.activeCaseId`,
   *  1948). Cleared by RESTART/BACK-to-Home along with everything else
   *  that is not `savedCases`. */
  workingCase: Casefile | null
  activeCaseId: string | null

  /** Lifted out of `PrepareScreen`'s own `useState` (Task 12) so a
   *  correction elsewhere can reset it (design note 6): prep progress
   *  belongs to the diagnosis, not the screen, and must not survive a
   *  correction-path answer write that may have changed the diagnosis. */
  prepChecks: Record<number, boolean>
  prepDraft: string | null

  /** Check-in interaction state (prototype `S`, 1950). `ciPendingIdx`,
   *  `ciConsecutive` and `ciAccepted` are absent from the prototype's `S`
   *  literal — it assigns them ad hoc at first use (2640, 2644, 2686) —
   *  but they are real state, declared, typed and initialised here. */
  ciPending: CheckinOption | null
  ciPendingIdx: number | null
  ciStage: 'confirm' | 'valence' | 'closureq' | null
  ciReassure: boolean
  ciSnapshot: CiSnapshot | null
  ciJustUpdated: boolean
  ciConsecutive: boolean
  ciAccepted: boolean

  /** Casefile UI state. */
  logOpen: Record<string, boolean>
  /** Arms the destructive "Remove this case and its history? · Yes ·
   *  Cancel" inline confirm, by case id (prototype `S.removeConfirm`,
   *  1948). NAVIGATE clears this on every navigation — an armed
   *  destructive confirm must never survive leaving the screen that armed
   *  it (design note 5). */
  removeConfirm: string | null
  /** Also absent from the prototype's `S` literal — assigned ad hoc at
   *  first use (3729). */
  reminderCopied: boolean
  /** SIR phase drift (Task 13, design note 1): true when the active case's
   *  stamped `sirPhaseId` no longer matches the live `SIR_STATES` config —
   *  set by `loadCase`/`openCheckin`/`reopenCase` (session/cases.ts's own
   *  `phaseDriftFor`) whenever they resolve a case, left `false` by a fresh
   *  working case (`beginWorkingCheckin`, snapshotted against the live phase
   *  by construction). Drives two surfaces: the casefile screen's
   *  interstitial (CasefileScreen.tsx design note 1, replacing the whole
   *  `.update-mod` — no check-in option is reachable while this is true) and
   *  the Diagnosis banner (DiagnosisScreen.tsx design note). Cleared by its
   *  own `PHASE_DRIFT_RECHECK` action (the interstitial's CTA) and by
   *  RESTART/BACK-to-Home like every other transient field. */
  phaseDrift: boolean

  pendingSave: { engineKey: ServiceKey; serviceLabel: string; returnScreen: ScreenId } | null

  /** The signed-in citizen, or `null` when signed out (prototype `S.user`,
   *  1948). Imported as a TYPE from `session/auth.ts` — the only file that
   *  actually talks to Supabase `auth.*`; this file just carries the
   *  shape. Preserved by RESTART/BACK-to-Home (this interface's own header
   *  comment); cleared only by the explicit `SIGN_OUT` action. */
  user: AppUser | null
  /** Which identifier the save-flow's sign-in screen is currently asking
   *  for (prototype `S.authMethod`, 1948, initial `'phone'`). Switching
   *  clears `authId`/`authErr` (prototype 3841, `SET_AUTH_METHOD`'s own
   *  arm) — a half-typed id or a stale error from the other method must
   *  never survive the switch. */
  authMethod: 'phone' | 'email'
  /** The raw text of whatever `authMethod` is currently asking for
   *  (prototype `S.authId`, 1948) — normalised only on successful
   *  submission (`AUTH_ID_SUBMITTED`); the reducer never validates. */
  authId: string
  /** The OTP input (prototype `S.otp`, 1948). */
  otp: string
  /** The save-flow's inline error string, or `null` (prototype `S.authErr`,
   *  1948) — e.g. "That doesn't look like a full mobile number yet."
   *  Cleared on every navigation (nav()-style clears, design note 5) so it
   *  never survives onto a screen the citizen just arrived at. */
  authErr: string | null
  /** The OTP screen's transient "code resent" flash (prototype
   *  `S.otpResent`, 1948). */
  otpResent: boolean
  /** Arms the account popover's inline "Sign out?" confirm (prototype
   *  `S.signOutConfirm`, 1948). Cleared whenever the popover itself closes
   *  (`TOGGLE_ACCT`'s closing branch, `CLOSE_ACCT`) — prototype 2266/2248/
   *  3949 — so it never survives to the popover's next opening. */
  signOutConfirm: boolean
  /** Whether the topbar account popover is open (prototype `S.acctOpen`,
   *  1951). Cleared on every navigation, alongside `authErr` (nav()-style
   *  clears, design note 5) — a stale popover must never float over an
   *  unrelated screen. */
  acctOpen: boolean
  /** The optional-name screen's draft input (prototype `S.pendingName`,
   *  1951) — cleared, never persisted mid-edit; `SET_USER_NAME` is the only
   *  action that writes the value onto `user.name`. */
  pendingName: string

  /** NOT a prototype field — a mechanism field for a mechanism deviation
   *  (design note 4): the prototype's auth calls are synchronous
   *  simulations, real ones are not, and a citizen who taps "Send me a
   *  code" twice must not start two flows. Declared, typed, initialised,
   *  and used to disable the submit controls — same class as C5's
   *  `ciPendingIdx`/`ciConsecutive`. */
  authBusy: boolean
  /** NOT a prototype field — D2's OTP-resend cooldown deadline, a
   *  timestamp. D6: always supplied on the dispatching action
   *  (`SET_OTP_COOLDOWN`), never read from `Date.now()` inside the
   *  reducer. */
  otpCooldownUntil: number | null
  /** NOT a prototype field, and the field that makes three separate
   *  hazards testable instead of hopeful: the prototype's `adoptStoredCases`
   *  is one synchronous line with no lifecycle to model; the real one is an
   *  awaited fetch-plan-push-clear sequence that can be in flight, can
   *  fail, and can be triggered from two independent places at once
   *  (Task 8's mount effect AND its `onAuthChange` subscription).
   *   - `'idle'` — no migration has run for the current session. The only
   *     status (with `'failed'`) from which a migration may START
   *     (`MIGRATION_STARTED`).
   *   - `'running'` — a migration is in flight. THIS IS THE DOUBLE-TRIGGER
   *     GUARD: `MIGRATION_STARTED` is a no-op, by identity, while this is
   *     `'running'` or `'done'` — a status check in real reducer state,
   *     testable and inspectable, unlike an in-flight `useRef`.
   *   - `'done'` — the migration succeeded; `nm_cases` is genuinely empty
   *     and the server is authoritative. Gates the signed-in push effect
   *     (Task 8): that effect must not fire during `'running'` (it would
   *     race the migration's own upsert) or `'failed'` (it would push to a
   *     server that just rejected the write).
   *   - `'failed'` — the fetch or the push failed. `nm_cases` STILL HOLDS
   *     the citizen's cases and is authoritative. No automatic retry: the
   *     next sign-in re-runs the migration against the still-intact local
   *     set — see `SIGN_OUT`'s own comment for why this makes the
   *     signed-out persistence effect safe by construction.
   *  `SIGN_OUT` resets this to `'idle'` (it is part of `initialSession`),
   *  so a subsequent sign-in retries cleanly. */
  migration: 'idle' | 'running' | 'done' | 'failed'
}

export const initialSession: SessionState = {
  screen: 'home', history: [], answers: {},
  restartConfirm: false, trustOpen: false,
  recoveryText: '', voterEntryExplain: false,
  savedCases: [], workingCase: null, activeCaseId: null,
  prepChecks: {}, prepDraft: null,
  ciPending: null, ciPendingIdx: null, ciStage: null, ciReassure: false,
  ciSnapshot: null, ciJustUpdated: false, ciConsecutive: false, ciAccepted: false,
  logOpen: {}, removeConfirm: null, reminderCopied: false, phaseDrift: false,
  pendingSave: null,
  user: null, authMethod: 'phone', authId: '', otp: '', authErr: null,
  otpResent: false, signOutConfirm: false, acctOpen: false, pendingName: '',
  authBusy: false, otpCooldownUntil: null, migration: 'idle',
}

// =============================================================================
// Task 19 (post-Task-18 fix) — Google sign-in loses a pending save across the
// REAL OAuth redirect. Confirmed live (not hypothesized): signInWithOAuth
// (session/auth.ts) performs a genuine full-page navigation to
// accounts.google.com and back — the browser tab actually leaves the app and
// returns as a fresh page load, which resets every `useReducer` value,
// including `pendingSave`/`answers`/`prepChecks`. Phone/email never hit this:
// their OTP calls never navigate away, so the citizen stays on the same page
// the whole time and nothing in memory is ever at risk.
//
// The fix: SaveCaseScreen's handleGoogle snapshots what completeSave needs to
// `sessionStorage` (PENDING_GOOGLE_SAVE_KEY below) immediately before starting
// the redirect. App.tsx's mount effect reads it back — once, and only once a
// signed-in session actually comes back — parses it (below), and dispatches
// RESUME_PENDING_SAVE (in the SessionAction union below) to finish the save.
//
// `sessionStorage`, not caseStore.ts's `nm_`-prefixed `localStorage`
// convention: this is a short-lived artifact of ONE in-flight redirect, not
// durable app state like `nm_cases`/`nm_user` — it must not survive to a
// later, unrelated session/tab the way those do. Flagged to the reviewer as a
// real decision, not a foregone one.
// =============================================================================
export const PENDING_GOOGLE_SAVE_KEY = 'nm_pending_google_save'

/** What SaveCaseScreen's handleGoogle writes, and what App.tsx's mount effect
 *  reads back via `parsePendingGoogleSaveSnapshot` below. `engineKey` and
 *  `returnScreen` are plain strings, not `ServiceKey`/`ScreenId`: this is
 *  untrusted round-tripped JSON (sessionStorage can be hand-edited, or hold a
 *  snapshot written by an older build), not a same-module value, so it is
 *  VALIDATED below rather than assumed to already be one of those literal
 *  unions — the same reasoning `CiFragment.navigateTo` (session/cases.ts)
 *  documents for staying a plain string. */
export interface PendingGoogleSaveSnapshot {
  engineKey: string
  serviceLabel: string
  returnScreen: string
  answers: AnswerRecord
  prepChecks: Record<number, boolean>
}

/** Parses a stored snapshot; `null` on anything that is not exactly the
 *  expected shape — missing key, corrupt JSON, a hand-edited value, or an
 *  `engineKey` this build no longer recognises. The `engineKey in ENGINES`
 *  check is not shape-checking for its own sake: `ENGINES` is the SAME
 *  registry `diagnose` itself indexes by (session/cases.ts's `completeSave`),
 *  so this is the one check that actually stops a corrupt snapshot from
 *  crashing the resumed diagnosis rather than merely failing to resume it.
 *  App.tsx's mount effect is the only caller — read once, act once (the same
 *  discipline caseStore.ts's own `nm_case` -> `nm_cases` migration uses): the
 *  key is cleared immediately after being read, before this function's
 *  result is ever dispatched, so a snapshot that fails to parse can never
 *  replay on a later boot. Pure — no storage access, no throw, matching every
 *  other pure fragment-returning function in session/cases.ts. */
export function parsePendingGoogleSaveSnapshot(raw: string): PendingGoogleSaveSnapshot | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>
  if (typeof p.engineKey !== 'string' || !(p.engineKey in ENGINES)) return null
  if (typeof p.serviceLabel !== 'string' || typeof p.returnScreen !== 'string') return null
  if (!p.answers || typeof p.answers !== 'object') return null
  if (!p.prepChecks || typeof p.prepChecks !== 'object') return null
  return {
    engineKey: p.engineKey, serviceLabel: p.serviceLabel, returnScreen: p.returnScreen,
    answers: p.answers as AnswerRecord, prepChecks: p.prepChecks as Record<number, boolean>,
  }
}

export type SessionAction =
  | { type: 'NAVIGATE'; screen: ScreenId; replace?: boolean }
  | { type: 'BACK' }
  | { type: 'ANSWER'; service: ServiceKey; key: string; value: string }
  | { type: 'RESTART_REQUEST' } | { type: 'RESTART_CANCEL' } | { type: 'RESTART' }
  | { type: 'TOGGLE_TRUST' }
  | { type: 'SET_RECOVERY_TEXT'; text: string }
  | { type: 'EXPLAIN_VOTER_ENTRY' }
  // C5: tracking never requires an account (Product Principle #4) — the
  // working case, opening an already-saved case, and the save/adopt flow
  // (design notes 3, 5, 4, 9). Deliberately NO `CONTINUE_SAVED`: it is
  // dead code in the locked prototype (zero call sites) — design note 7.
  | { type: 'BEGIN_WORKING_CHECKIN'; engineKey: ServiceKey; serviceLabel: string; returnScreen: ScreenId; now: number }
  // No `now`: unlike its two siblings, OPEN_CHECKIN never stamps a time
  // anywhere in the prototype (loadCase/openCheckin, 2160-2171/2633-2637)
  // — a field nothing reads is a field that rots.
  | { type: 'OPEN_CHECKIN'; id: string }
  // D4: `newId` is injected here, the same way `now` already is — the
  // dispatching onSave handler calls `newCaseId()` (cases.ts's one mint
  // site) and passes the result; the reducer/completeSave never mints an
  // id itself. See cases.ts's `newCaseId()` doc comment for the full
  // reasoning (UUID vs. the old `'c' + now`).
  | { type: 'BEGIN_SAVE'; engineKey: ServiceKey; serviceLabel: string; returnScreen: ScreenId; now: number; newId: string }
  // Task 19 (post-Task-18 fix) — completes a save that was in flight when a
  // real Google OAuth redirect wiped state.pendingSave/answers/prepChecks
  // out of memory (see PENDING_GOOGLE_SAVE_KEY's own comment above; App.tsx's
  // mount effect is the one dispatch site). Deliberately NOT a re-dispatch of
  // BEGIN_SAVE: that action's signed-in branch reads answers/prepChecks off
  // LIVE state, which does not exist yet this early in the reducer's life —
  // this action carries the RESTORED answers/prepChecks on its own payload
  // instead, the one real behavioural difference from BEGIN_SAVE this fix
  // needs. `now`/`newId` are dispatch-site-injected (App.tsx's mount effect),
  // same D4/D6 convention as BEGIN_SAVE's own — never minted in the reducer.
  | {
      type: 'RESUME_PENDING_SAVE'; engineKey: ServiceKey; serviceLabel: string; returnScreen: ScreenId
      answers: AnswerRecord; prepChecks: Record<number, boolean>; now: number; newId: string
    }
  // The check-in interaction state machine (Task 6; design notes 2-10).
  // Every one of these six is a thin arm over its matching cases.ts pure
  // function, run through applyCiFragment below.
  | { type: 'CI_CHOOSE'; index: number; now: number }
  | { type: 'CI_CONFIRM'; now: number }
  | { type: 'CI_VALENCE'; accepted: boolean; now: number }
  | { type: 'CI_CLOSURE'; gotIt: boolean; now: number }
  | { type: 'CI_UNDO' }
  | { type: 'CI_CANCEL' }
  // Task 7: the remaining case-lifecycle actions — closing a case as
  // unresolved, reopening a closed one, permanently removing a saved one,
  // the check-back reminder date, the journey log's "Show all" toggle, and
  // the reminder copy-flash flag. Each is a thin arm over its matching
  // cases.ts pure function (design note 1), same shape as BEGIN_SAVE/
  // OPEN_CHECKIN/CI_* above. Design note 2: the dead-end screen's "Keep the
  // case open" button is deliberately NOT a new action here — it is a plain
  // RESTART dispatch (nothing is written; the case stays exactly as the
  // deadend option's own `reported` entry left it).
  | { type: 'CLOSE_UNRESOLVED'; now: number }
  | { type: 'REOPEN_CASE'; id: string; now: number }
  | { type: 'REMOVE_SAVED'; id: string }
  | { type: 'SET_REMIND'; value: string }
  | { type: 'TOGGLE_LOG'; caseId: string }
  | { type: 'SET_REMOVE_CONFIRM'; id: string | null }
  | { type: 'SET_REMINDER_COPIED'; value: boolean }
  // Task 12: PrepareScreen's tick/draft state, lifted out of its own local
  // `useState` (C4) so it survives a Back-then-return instead of resetting
  // on unmount. `TOGGLE_PREP_STEP` takes `now` (D6: the dispatching
  // component supplies the clock, never an internal `Date.now()`) because
  // it may re-snapshot an active case (prototype `togglePrepStep`,
  // 3685-3695) — see the reducer arm's own comment. `SET_PREP_DRAFT` needs
  // no clock; it only ever writes `prepDraft` (prototype 3722-ish;
  // `updateBracketHint`'s own textarea `oninput`).
  | { type: 'TOGGLE_PREP_STEP'; index: number; now: number }
  | { type: 'SET_PREP_DRAFT'; text: string }
  // Task 13, design note 2: the SIR phase-drift interstitial's own CTA
  // (prototype `onclick="S.phaseDrift=false; nav('sir-q1')"`, casefile
  // 2931) — clears `phaseDrift` and re-diagnoses against the current phase
  // starting from 'sir-q1'. No cases.ts pure function backs this (design
  // note 1's "thin arm over a pure function" shape doesn't apply — there is
  // no case data to touch, only a field clear plus the same nav()-style
  // treatment NAVIGATE itself applies), so it is a direct reducer arm, like
  // NAVIGATE's own.
  | { type: 'PHASE_DRIFT_RECHECK' }
  // Task 4 (C7) — the sign-in + save/adopt/sign-out flow. Every arm here is
  // a thin arm doing exactly what its prototype counterpart does (design
  // note 7), except `authBusy`/`otpCooldownUntil`/`migration`, which are
  // mechanism fields the prototype has no counterpart for (design note 4).
  | { type: 'SET_AUTH_METHOD'; method: 'phone' | 'email' }
  | { type: 'SET_AUTH_ID'; value: string }
  | { type: 'SET_OTP'; value: string }
  | { type: 'SET_AUTH_ERR'; error: string | null }
  | { type: 'SET_PENDING_NAME'; value: string }
  | { type: 'SET_AUTH_BUSY'; value: boolean }
  // The successful half of authSubmitId (prototype 2113) — the reducer
  // never validates; auth.ts's normalisePhone/isValidEmail (pure, tested
  // there) decide what reaches this action. `otpCooldownUntil` is Task 12's
  // own addition (design note 6): GoTrue's `max_frequency` clock starts at
  // THIS send, which is why the cooldown must be armed here too, not only
  // on a resend — the caller (SaveCaseScreen) computes
  // `now + OTP_RESEND_COOLDOWN_MS` and supplies it, the same D6
  // injected-clock convention `SET_OTP_COOLDOWN` already uses; the reducer
  // still never reads `Date.now()` itself.
  | { type: 'AUTH_ID_SUBMITTED'; authId: string; otpCooldownUntil: number }
  // Prototype authVerifyOtp (2119-2128)'s user-write half. Deliberately
  // does NOT start the migration (design note 7) — that is Task 7/8's own
  // MIGRATION_STARTED, dispatched separately, because the two are
  // triggered from different places and conflating them reintroduces the
  // double-fire hazard MIGRATION_STARTED exists to guard against.
  | { type: 'SIGNED_IN'; user: AppUser }
  // Task 13's standalone rename path (account popover "Add your name" /
  // prototype saveNameFinish, 2129-2136) AND Task 8's USER_UPDATED echo —
  // the SAME arm for both, idempotent by construction. Deliberately NOT
  // SIGNED_IN (design note 7): SIGNED_IN also clears authErr/otp/authBusy,
  // which would silently wipe unrelated state when there is no auth flow
  // in progress.
  | { type: 'SET_USER_NAME'; name: string | null }
  // The double-trigger guard (design note 7) — a no-op, by identity, from
  // 'running'/'done'.
  | { type: 'MIGRATION_STARTED' }
  | { type: 'MIGRATION_FAILED'; error: string }
  // D10's adoptStoredCases. `cases` is the account's COMPLETE post-
  // migration set (Task 7's `migrateLocalCases`'s own `merged` —
  // adopted+toUpload, never `adopted` alone; design note 7) — this arm
  // trusts its payload completely on purpose.
  | { type: 'ADOPT_CASES'; cases: Casefile[] }
  // Prototype signOut (2155-2159). `localCases` is read at the dispatch
  // site via `loadCases()` (the same injection convention as `now`/
  // `newId` elsewhere in this file) — the reducer still reads no storage.
  // See design note 7's own comment for why a payload, not `[]`.
  | { type: 'SIGN_OUT'; localCases: Casefile[] }
  // Prototype's acct-chip onclick (2266) and the scrim/Escape handler
  // (2248/3949).
  | { type: 'TOGGLE_ACCT' }
  | { type: 'CLOSE_ACCT' }
  | { type: 'SET_SIGN_OUT_CONFIRM'; value: boolean }
  // D2.
  | { type: 'SET_OTP_RESENT'; value: boolean }
  | { type: 'SET_OTP_COOLDOWN'; until: number | null }

/** Applies a CiFragment (cases.ts) onto SessionState. `navigateTo` decides
 *  the shape: a non-null screen id gets the SAME nav()-style treatment
 *  every other navigating action gets (history push, screen change,
 *  trustOpen/restartConfirm/removeConfirm/authErr/acctOpen cleared —
 *  prototype nav(), line 2029; the last two are C7's, design note 5);
 *  `null` means the interaction stays on the current screen (e.g.
 *  CI_CHOOSE opening a panel, or CI_CLOSURE's "still pending, no patch"
 *  branch), so only the fragment's own fields are spread on. */
function applyCiFragment(s: SessionState, fragment: CiFragment): SessionState {
  const { navigateTo, ...rest } = fragment
  if (navigateTo) {
    return {
      ...s, ...rest,
      history: [...s.history, s.screen], screen: navigateTo as ScreenId,
      trustOpen: false, restartConfirm: false, removeConfirm: null,
      authErr: null, acctOpen: false,
    }
  }
  return { ...s, ...rest }
}

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'NAVIGATE':
      return {
        ...s,
        history: a.replace ? s.history : [...s.history, s.screen],
        screen: a.screen,
        // removeConfirm: an armed destructive confirm must never survive a
        // navigation away from the screen that armed it (design note 5;
        // prototype nav(), line 2029). authErr/acctOpen: C7's own addition
        // to the SAME nav()-style clear set (design note 5) — a stale auth
        // error or a floating account popover must never survive either.
        trustOpen: false, restartConfirm: false, removeConfirm: null,
        authErr: null, acctOpen: false,
      }
    case 'BACK': {
      if (s.history.length === 0) return s
      const history = s.history.slice(0, -1)
      const prev = s.history[s.history.length - 1]
      // Home is a clean slate, always (prototype back(), line 2035-2040).
      // Explicit allowlist, not a blanket initialSession reset: savedCases
      // AND (C7) user are the persisted slice and must survive this, and
      // only this — RESTART's own arm comment explains why user must be on
      // this allowlist.
      if (prev === 'home') return { ...initialSession, savedCases: s.savedCases, user: s.user }
      // DEVIATION from the prototype's back() (2035-2040), which clears
      // only trustOpen/authErr — not acctOpen, and not restartConfirm
      // either; only nav() and restart() carry the full clear set. This
      // arm already diverged on restartConfirm (C3, shipped) before C7
      // existed; acctOpen follows that same established local precedent
      // (design note 5) rather than inventing a new one — a popover
      // surviving Back would float over an unrelated screen, the same
      // defect the clear exists to prevent. removeConfirm is deliberately
      // NOT cleared here, matching the prototype.
      return { ...s, screen: prev, history, trustOpen: false, restartConfirm: false, authErr: null, acctOpen: false }
    }
    case 'ANSWER': {
      const { answers } = applyCorrection(s.answers, a.key, a.value, DEPS_FOR[a.service])
      // prepChecks/prepDraft reset on EVERY correction-path write,
      // unconditionally — never gated on whether `answers` actually
      // changed (design note 6; answers.ts's own doc comment). `answers`
      // itself keeps C1's strict no-op: the same reference comes back
      // when the written value is unchanged.
      return { ...s, answers, prepChecks: {}, prepDraft: null }
    }
    case 'RESTART_REQUEST': return { ...s, restartConfirm: true }
    case 'RESTART_CANCEL': return { ...s, restartConfirm: false }
    // Explicit allowlist, not a blanket initialSession reset (Issue #7,
    // design note 3; C7 design note 6): savedCases AND (from C7) user are
    // the persisted slice and must survive a restart — every other field,
    // including any added later, resets to initialSession's value by
    // default. `user` is on this allowlist because the topbar BRAND BUTTON
    // dispatches RESTART (prototype topbar(), 2273): without it, tapping
    // the logo would silently sign the citizen out. Signing out is a
    // separate, explicit action (SIGN_OUT) — never a RESTART side effect.
    case 'RESTART': return { ...initialSession, savedCases: s.savedCases, user: s.user }
    case 'TOGGLE_TRUST': return { ...s, trustOpen: !s.trustOpen }
    case 'SET_RECOVERY_TEXT': return { ...s, recoveryText: a.text }
    case 'EXPLAIN_VOTER_ENTRY': return { ...s, voterEntryExplain: true }
    // C5: thin arms over cases.ts's pure functions (design note 1) — pull
    // the relevant slice off `s`, call the matching helper, spread its
    // fragment back on, then apply the SAME nav()-style clears every
    // navigation applies (prototype nav(), line 2029; NAVIGATE arm above).
    case 'BEGIN_WORKING_CHECKIN': {
      const fragment = beginWorkingCheckin(
        { savedCases: s.savedCases, workingCase: s.workingCase, answers: s.answers, prepChecks: s.prepChecks },
        { engineKey: a.engineKey, serviceLabel: a.serviceLabel, returnScreen: a.returnScreen, now: a.now },
      )
      return {
        ...s, ...fragment,
        history: [...s.history, s.screen], screen: 'checkin',
        trustOpen: false, restartConfirm: false, removeConfirm: null,
        authErr: null, acctOpen: false,
      }
    }
    case 'OPEN_CHECKIN': {
      const fragment = openCheckin(s.savedCases, a.id)
      if (!fragment) return s
      return {
        ...s, ...fragment,
        history: [...s.history, s.screen], screen: 'checkin',
        trustOpen: false, restartConfirm: false, removeConfirm: null,
        authErr: null, acctOpen: false,
      }
    }
    case 'BEGIN_SAVE': {
      // C7 Task 16 (prototype beginSave, 2048-2052): C5 could only build the
      // `if(S.user)` half of this — no real accounts existed yet. This arm
      // now carries the full branch.
      const pendingSave = { engineKey: a.engineKey, serviceLabel: a.serviceLabel, returnScreen: a.returnScreen }
      if (!s.user) {
        // Signed out: detour into the sign-in flow instead of saving.
        // `pendingSave` is set so `saveNameFinish` (Task 13) knows what to
        // save once the citizen has signed in, and `SaveDoneScreen`'s "Back
        // to my case" (Task 14) knows where to go — the SAME shape the
        // signed-in branch below sets it to. `otp`/`authErr` are cleared the
        // same way `AUTH_ID_SUBMITTED` clears them before a fresh sign-in
        // attempt. Critically: NO write to `savedCases` or `workingCase` —
        // if the citizen abandons the flow (e.g. at the OTP screen), the
        // case must be exactly as it was before this tap.
        return {
          ...s,
          pendingSave,
          otp: '',
          history: [...s.history, s.screen], screen: 'save-case',
          trustOpen: false, restartConfirm: false, removeConfirm: null,
          authErr: null, acctOpen: false,
        }
      }
      const fragment = completeSave(
        { savedCases: s.savedCases, workingCase: s.workingCase, answers: s.answers, prepChecks: s.prepChecks },
        { engineKey: a.engineKey, serviceLabel: a.serviceLabel, returnScreen: a.returnScreen, now: a.now, newId: a.newId },
      )
      return {
        ...s, ...fragment,
        // pendingSave is set even though the save completes immediately —
        // SaveDoneScreen's "Back to my case" button reads
        // pendingSave.returnScreen (prototype 3895; design note 9).
        pendingSave,
        history: [...s.history, s.screen], screen: 'save-done',
        trustOpen: false, restartConfirm: false, removeConfirm: null,
        authErr: null, acctOpen: false,
      }
    }
    case 'RESUME_PENDING_SAVE': {
      // Task 19 fix. Mirrors BEGIN_SAVE's signed-in branch immediately
      // above — same completeSave call, same pendingSave shape, same
      // navigation to 'save-done' — except answers/prepChecks come from
      // the ACTION (the restored sessionStorage snapshot), never from live
      // state: state.answers/state.prepChecks are still whatever a
      // freshly-booted session starts at (initialSession's `{}`) this
      // early in the mount effect, not the citizen's actual in-progress
      // answers. `workingCase: null`, not `s.workingCase`, per the task
      // brief's own point 1: a freshly-booted state.workingCase always
      // starts null (initialSession), so completeSave's internal
      // `state.workingCase && state.workingCase.engineKey === ...`
      // derivation would resolve to null here regardless — asserted
      // directly rather than merely assumed.
      const pendingSave = { engineKey: a.engineKey, serviceLabel: a.serviceLabel, returnScreen: a.returnScreen }
      const fragment = completeSave(
        { savedCases: s.savedCases, workingCase: null, answers: a.answers, prepChecks: a.prepChecks },
        { engineKey: a.engineKey, serviceLabel: a.serviceLabel, returnScreen: a.returnScreen, now: a.now, newId: a.newId },
      )
      return {
        ...s, ...fragment,
        // Beyond what completeSave's own fragment touches (savedCases/
        // activeCaseId/workingCase): also restore answers/prepChecks onto
        // top-level session state, which BEGIN_SAVE's own arm never needs
        // to do (its state.answers is already live and correct). Without
        // this, a citizen who taps "Back to my case" from save-done
        // (SaveDoneScreen, NAVIGATE to pendingSave.returnScreen) would land
        // on a screen that re-diagnoses against an EMPTY post-boot answers
        // record instead of the answers the save just used.
        answers: a.answers,
        prepChecks: a.prepChecks,
        pendingSave,
        history: [...s.history, s.screen], screen: 'save-done',
        trustOpen: false, restartConfirm: false, removeConfirm: null,
        authErr: null, acctOpen: false,
      }
    }
    case 'CI_CHOOSE': {
      const fragment = ciChoose(
        { answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId, workingCase: s.workingCase, savedCases: s.savedCases },
        { index: a.index, now: a.now },
      )
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_CONFIRM': {
      const fragment = ciConfirm(
        {
          answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId,
          workingCase: s.workingCase, savedCases: s.savedCases, ciPending: s.ciPending,
        },
        a.now,
      )
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_VALENCE': {
      const fragment = ciValence(
        {
          answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId,
          workingCase: s.workingCase, savedCases: s.savedCases, ciPending: s.ciPending,
        },
        a.accepted, a.now,
      )
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_CLOSURE': {
      const fragment = ciClosureAnswer(
        {
          answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId,
          workingCase: s.workingCase, savedCases: s.savedCases, ciPending: s.ciPending, ciAccepted: s.ciAccepted,
        },
        a.gotIt, a.now,
      )
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_UNDO': {
      const fragment = ciUndo({
        activeCaseId: s.activeCaseId, workingCase: s.workingCase, savedCases: s.savedCases, ciSnapshot: s.ciSnapshot,
      })
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_CANCEL':
      return applyCiFragment(s, ciCancel())
    case 'CLOSE_UNRESOLVED': {
      const fragment = closeUnresolved(
        { activeCaseId: s.activeCaseId, workingCase: s.workingCase, savedCases: s.savedCases },
        a.now,
      )
      if (!fragment) return s
      // Prototype closeUnresolved() ends in restart() (2729) — the SAME
      // explicit allowlist RESTART's own arm uses (design note 3): only
      // savedCases survives. Design note 9: for a working (unsaved) case,
      // `fragment.workingCase` holds the just-closed case, but it was
      // never a member of savedCases and is dropped here exactly like
      // everywhere else RESTART drops workingCase — leaving genuinely no
      // record, on purpose.
      return { ...initialSession, savedCases: fragment.savedCases }
    }
    case 'REOPEN_CASE': {
      const fragment = reopenCase(s.savedCases, a.id, a.now)
      if (!fragment) return s
      const { navigateTo, ...rest } = fragment
      return {
        ...s, ...rest,
        history: [...s.history, s.screen], screen: navigateTo as ScreenId,
        trustOpen: false, restartConfirm: false, removeConfirm: null,
        authErr: null, acctOpen: false,
      }
    }
    case 'REMOVE_SAVED': {
      const fragment = removeSaved({ savedCases: s.savedCases, activeCaseId: s.activeCaseId }, a.id)
      return {
        ...s, ...fragment,
        // Design note 4: the casefile screen's inline confirm sets
        // screen:'home', history:[] BEFORE removing (prototype 2881) —
        // folded into this one action so the citizen can never be left on
        // a screen for a case that no longer exists, regardless of what
        // dispatches it.
        screen: 'home', history: [],
        trustOpen: false, restartConfirm: false, removeConfirm: null,
        authErr: null, acctOpen: false,
      }
    }
    case 'SET_REMIND': {
      const fragment = setRemind(
        { activeCaseId: s.activeCaseId, workingCase: s.workingCase, savedCases: s.savedCases },
        a.value,
      )
      return fragment ? { ...s, ...fragment } : s
    }
    case 'TOGGLE_LOG':
      return { ...s, ...toggleLog(s.logOpen, a.caseId) }
    case 'SET_REMOVE_CONFIRM':
      return { ...s, ...setRemoveConfirm(a.id) }
    case 'SET_REMINDER_COPIED':
      return { ...s, ...setReminderCopied(a.value) }
    case 'SET_PREP_DRAFT':
      return { ...s, prepDraft: a.text }
    case 'PHASE_DRIFT_RECHECK':
      return {
        ...s, phaseDrift: false,
        history: [...s.history, s.screen], screen: 'sir-q1',
        trustOpen: false, restartConfirm: false, removeConfirm: null,
        authErr: null, acctOpen: false,
      }
    case 'TOGGLE_PREP_STEP': {
      const prepChecks = { ...s.prepChecks, [a.index]: !s.prepChecks[a.index] }
      // Prototype togglePrepStep() (3685-3695): "a saved case keeps itself
      // current: ticking steps after saving updates the snapshot rather
      // than letting the Home card drift." Guarded on BOTH still_open AND
      // an engine match — `c.engineKey===S.screen.split('-')[0]` (3690),
      // transcribed verbatim as `s.screen.split('-')[0]` below. The engine
      // guard is load-bearing, not incidental: without it, ticking a
      // passport step while a voter case happens to be the active one
      // would silently overwrite the voter case's snapshot with passport
      // data.
      const c = activeCase(s)
      const currentEngine = s.screen.split('-')[0]
      if (!c || c.outcome !== 'still_open' || c.engineKey !== currentEngine) {
        return { ...s, prepChecks }
      }
      const d = diagnose(ENGINES[c.engineKey], s.answers)
      const snap = caseSnapshot(c.engineKey, c.serviceLabel, s.screen, d, s.answers, prepChecks, a.now)
      // DEVIATION D7 (second site — the first was Task 6's check-in state
      // machine, cases.ts's applyCheckinPatch): a faithful
      // `Object.assign(c, caseSnapshot(...))` (3691) resets `savedAt` to
      // `now`, so EVERY ticked checkbox would push the case's "Saved
      // {date}" forward on Home and the casefile screen. `savedAt` is
      // pinned back to the existing case's own value; `lastCheck` is a
      // DIFFERENT clock this action never touches (the prototype doesn't
      // stamp it here either).
      const updated: Casefile = { ...c, ...snap, savedAt: c.savedAt }
      const placement = s.activeCaseId === 'working'
        ? { workingCase: updated, savedCases: s.savedCases }
        : { workingCase: s.workingCase, savedCases: s.savedCases.map(x => (x.id === s.activeCaseId ? updated : x)) }
      return { ...s, prepChecks, ...placement }
    }
    // Task 4 (C7) — the sign-in + save/adopt/sign-out flow.
    case 'SET_AUTH_METHOD':
      // Prototype 3841: switching identifier type clears whatever was
      // half-typed for the OTHER method, and any error it left behind.
      return { ...s, authMethod: a.method, authId: '', authErr: null }
    case 'SET_AUTH_ID':
      return { ...s, authId: a.value }
    case 'SET_OTP':
      return { ...s, otp: a.value }
    case 'SET_AUTH_ERR':
      return { ...s, authErr: a.error }
    case 'SET_PENDING_NAME':
      return { ...s, pendingName: a.value }
    case 'SET_AUTH_BUSY':
      return { ...s, authBusy: a.value }
    case 'AUTH_ID_SUBMITTED':
      // authSubmitId's success path (2104-2113) ends in `nav('save-otp')` —
      // the SAME nav()-style treatment every other navigating arm applies,
      // plus the auth-specific writes design note 7 calls out (id written,
      // otp cleared, authErr cleared). `otpCooldownUntil` (Task 12, design
      // note 6): armed on THIS transition too, not only on a resend — the
      // citizen arrives at save-otp with GoTrue's rate-limit window already
      // running from the send that just happened, so an unarmed resend
      // control here would let their first tap burn on a rejection.
      return {
        ...s, authId: a.authId, authErr: null, otp: '', otpCooldownUntil: a.otpCooldownUntil,
        history: [...s.history, s.screen], screen: 'save-otp',
        trustOpen: false, restartConfirm: false, removeConfirm: null, acctOpen: false,
      }
    case 'SIGNED_IN':
      // Deliberately does NOT touch `migration` (design note 7) — starting
      // the migration is a separate, explicitly-dispatched step.
      return { ...s, user: a.user, authErr: null, otp: '', authBusy: false }
    case 'SET_USER_NAME':
      // Returns `s` unchanged when there is no signed-in user to rename
      // (design note 7) — and touches nothing but `user.name` otherwise,
      // unlike SIGNED_IN.
      if (!s.user) return s
      return { ...s, user: { ...s.user, name: a.name } }
    case 'MIGRATION_STARTED':
      // The double-trigger guard (design note 7; Task 8 design note 4): a
      // no-op, BY IDENTITY, while a migration is already in flight or has
      // already succeeded — the mount effect's getCurrentUser() and the
      // onAuthChange subscription can both fire for the same sign-in.
      if (s.migration === 'running' || s.migration === 'done') return s
      return { ...s, migration: 'running' }
    case 'MIGRATION_FAILED':
      // savedCases is deliberately left exactly as it is (design note 7):
      // after a failed push the locally-loaded set is still the truth.
      return { ...s, migration: 'failed', authErr: a.error }
    case 'ADOPT_CASES':
      // Replaces savedCases wholesale and sets migration:'done' in the
      // SAME transition (design note 7) — splitting them would invite a
      // state where the cases landed but the signed-in push effect is
      // still gated off.
      return { ...s, savedCases: a.cases, migration: 'done' }
    case 'SIGN_OUT':
      // Prototype signOut (2155-2159): clears the SESSION only, never the
      // account's stored cases. `a.localCases` (not the in-state
      // savedCases, and not `[]`) is what makes the signed-out persistence
      // effect safe by construction — see design note 7's own comment.
      return { ...initialSession, savedCases: a.localCases, user: null }
    case 'TOGGLE_ACCT': {
      // Prototype acct-chip onclick (2266): `S.acctOpen=!S.acctOpen;
      // if(!S.acctOpen)S.signOutConfirm=false` — the condition reads the
      // NEW value, so signOutConfirm clears only on the CLOSING toggle.
      const acctOpen = !s.acctOpen
      return { ...s, acctOpen, signOutConfirm: acctOpen ? s.signOutConfirm : false }
    }
    case 'CLOSE_ACCT':
      // The scrim click (2248) and Escape (3949) — both always close and
      // clear signOutConfirm, regardless of the popover's current state.
      return { ...s, acctOpen: false, signOutConfirm: false }
    case 'SET_SIGN_OUT_CONFIRM':
      return { ...s, signOutConfirm: a.value }
    case 'SET_OTP_RESENT':
      return { ...s, otpResent: a.value }
    case 'SET_OTP_COOLDOWN':
      return { ...s, otpCooldownUntil: a.until }
  }
}
