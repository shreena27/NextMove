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
  routeAfterApply,
} from './cases'
// A session/ -> session/ import, permitted by the layering rule (session.ts's
// own doc comment / auth.ts's doc comment): AppUser is a type only, never a
// network call — session.ts still never talks to Supabase directly.
import type { AppUser } from './auth'
// C8 (Task 6): the describe/interp slice. `GatedInterpretation`/`Fact` are
// Task 2's types; `DESCRIBE_CHAINS`/`DescribeEntryScreenId` are Task 2's own
// values/types; `repick`/`editFact`/`removeFact` are Task 2's pure D4
// helpers — INTERP_REPICK/SAVE_FACT_EDIT/REMOVE_FACT are thin arms over
// them. `gateInterpretation` (interpretGates.ts) is the SOLE legitimate
// constructor of a `GatedInterpretation` (its own doc comment) — the
// INTERPRETATION_FAILED arm below routes its synthesised unplaceable value
// through this same real constructor rather than the `__gated` brand's
// `as unknown as` escape hatch, so every real interp value in this codebase,
// success or failure, is stamped by the one module that owns the brand.
// `InterpretationFailure` is Task 5's orchestrator result-reason union
// (session/interpretation.ts) — imported here only as a TYPE for the
// INTERPRETATION_FAILED action's payload; this file never calls
// `runInterpretation` itself (that is Task 11's dispatch site).
import type { DescribeEntryScreenId, Fact, GatedInterpretation } from '../domain/interpret'
import { DESCRIBE_CHAINS, editFact, removeFact, repick, unplaceablePickPlan } from '../domain/interpret'
import { gateInterpretation } from '../domain/interpretGates'
import type { InterpretationFailure } from './interpretation'

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
  | 'interp-confirm'
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
// the sign-in + save flow.
// C8/Task 6 adds 'interp-confirm' (the prototype's own id, same switch,
// 3936) — the free-text interpretation confirm/unplaceable screen. Its own
// line, not folded into a neighbour, matching its own router adjacency
// (sir-prepare -> interp-confirm -> save-case). App.tsx's router `switch`
// does not gain a case for it in this task (Code Organization) — that is
// what deliberately opens this task's one-error build window (Global
// Constraints).

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

/** C3+C4's slice, plus everything C5 adds, plus C7's user/auth-flow fields,
 *  plus (from C8/Task 6) the describe/interp slice: the persisted casefile
 *  list, working/active case tracking, prepare-progress state, check-in
 *  interaction state, casefile UI state, the signed-in user and the
 *  sign-in/save-flow's own UI state, and the "describe it in your own
 *  words" free-text interpretation state (`describe*`/`interp*`/
 *  `caseFacts`/`appliedText`/`factEdit*`/`fillsReviewed`/`quotaExhausted`).
 *  This chunk's own doc comment used to say those fields were "still ABSENT
 *  on purpose — a field nothing reads is a field that rots"; that list is
 *  now empty — every field below is declared, typed, initialised, and
 *  written/read by a real reducer arm in this same file.
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

  // ---------------------------------------------------------------------
  // C8 (Task 6) — the describe/interp slice. All thirteen fields below are
  // real state: eleven of the prototype's own (S, 1949) plus two genuinely
  // added ones (`interpProvenance`, `quotaExhausted` — marked below). None
  // of the thirteen is on the NAVIGATE-style clear set (design note 5): the
  // prototype's own nav() (2029) clears none of them either, and
  // `describeText` surviving Back/failure/re-entry is spec §1's own
  // requirement, not an omission — see session.test.ts's own pin. All
  // thirteen ARE on the four `initialSession`-allowlist arms (RESTART,
  // BACK-to-Home, CLOSE_UNRESOLVED, SIGN_OUT), for free, because those arms
  // spread `initialSession` rather than listing fields to clear — this
  // interface's own header comment explains why that is the fail-safe
  // direction for any field, present or future.
  // ---------------------------------------------------------------------

  /** The entry row's expanded state (prototype `S.describeOpen`, 1949;
   *  `toggleDescribe`, 2410). */
  describeOpen: boolean
  /** The citizen's in-progress text (prototype `S.describeText`, 1949).
   *  Survives Back, failure, and re-entry (spec §1) — it lives on
   *  `SessionState`, not a component's own `useState`, and is deliberately
   *  NOT on the nav()-style clear set (design note 5, above). */
  describeText: string
  /** The empty-input error (prototype `S.describeErr`, 1949; prototype
   *  2422: "Write a line or two first. Even rough words are fine."). Scoped
   *  to the describe box, not the screen: cleared by `TOGGLE_DESCRIBE` and
   *  by starting a new read (`INTERPRETATION_STARTED`), never by
   *  navigation. */
  describeErr: string | null
  /** An interpretation is in flight (prototype `S.reading`, 1949; D6: a
   *  real promise this port awaits, not the prototype's `setTimeout`). */
  reading: boolean
  /** The active interpretation, or `null` (prototype `S.interp`, 1949: the
   *  composed `{ctxScreen, engine, service, text, ...result}` shape,
   *  2429). Typed as `ActiveInterpretation` (below), not an inline
   *  intersection, because three components and two reducer arms read it.
   *  Replaced WHOLESALE by `INTERPRETATION_DONE`/`INTERPRETATION_FAILED`,
   *  never merged (design note 8) — editing the original text re-runs
   *  interpretation and "old mappings discarded, stated" (spec §3). */
  interp: ActiveInterpretation | null
  /** Per-question "Change" reveal state, keyed by `questionId` (prototype
   *  `S.interpChangeOpen`, 1949; the per-question reveal, 3076). Reset to
   *  `{}` by `INTERPRETATION_DONE` AND `INTERPRETATION_FAILED`, both in the
   *  SAME transition that replaces `interp` — a reveal left open against
   *  the old mapping list must not survive onto the new one (design note
   *  8), and that reasoning applies identically whether the new `interp`
   *  is a real result or a synthesised unplaceable one (fix round 1,
   *  Finding 1). Also reset by `INTERP_REPICK` for the single question
   *  just picked (Finding 4) — see that arm's own comment. */
  interpChangeOpen: Record<string, boolean>
  /** The CONFIRMED facts, which outlive the interpretation and belong to
   *  the case (prototype `S.caseFacts`, 1949). Cleared by every ANSWER
   *  write, unconditionally (design note 6) — a fact captured under one
   *  diagnosis must not survive onto a corrected one. */
  caseFacts: Fact[]
  /** The text that produced the CURRENT answers, kept for the trust
   *  disclosure and the casefile (prototype `S.appliedText`, 1949). D17's
   *  invariant, pinned in session.test.ts: non-null iff `interpProvenance`
   *  is non-null — see that field's own comment. */
  appliedText: string | null
  /** D7's inline fact-edit state (prototype `S.factEditIdx`/`S.factEditVal`,
   *  1949; `editFact(i)`/`saveFactEdit()`, 2451-2455). `factEditIdx` is the
   *  index into `interp.facts` currently being edited, or `null`;
   *  `factEditVal` is the draft input, seeded from the fact's current value
   *  when editing starts and discarded (not applied) if saved blank —
   *  matching the prototype's own guard exactly. */
  factEditIdx: number | null
  factEditVal: string
  /** FR-AI-04's review acknowledgment (prototype `S.fillsReviewed`, 1949;
   *  Task 15). Cleared by every ANSWER write alongside `caseFacts`/
   *  `appliedText` (design note 6) — an acknowledgment of fills belonging
   *  to a discarded diagnosis must not carry forward. */
  fillsReviewed: boolean
  /** D17 — NOT a prototype field; the prototype derives provenance at save
   *  time instead (`caseSnapshot`), which this port deliberately does NOT
   *  do: deriving it later from whatever `interpreterId()` happens to say
   *  at save/render time would stamp a simulator-read case with a
   *  `gemini:…` provenance the moment a later prepare step is ticked in a
   *  `gemini`-configured environment. Captured HERE, at interpretation time
   *  (`runInterpretation`'s own `provenanceLabel` call, session/
   *  interpretation.ts), carried on `state.interp.provenance`, and copied
   *  onto this field by the SAME transition that writes `appliedText`
   *  (`APPLY_INTERPRETATION`/`UNPLACEABLE_PICK`, Task 7). Invariant, pinned
   *  in session.test.ts: non-null iff `appliedText` is non-null — written
   *  and cleared together, always, so a provenance record can never end up
   *  attached to text that has been discarded (the ANSWER arm's own
   *  unconditional clear, design note 6, is what keeps this true across a
   *  correction). */
  interpProvenance: string | null
  /** I7 — NOT a prototype field; a provider reported its quota exhausted
   *  this session, so `DescribeBlock` (Task 11) renders `null` (spec §2:
   *  "the entry row is hidden, not broken"). Declared and reducer-tested
   *  here, inert until Task 18 supplies the only piece this task genuinely
   *  cannot: a real provider recognising a 429. Deliberately NOT on the
   *  NAVIGATE clear set (design note 5) — quota exhaustion is a property of
   *  the SESSION, not of a screen — and it resets on the four
   *  `initialSession` arms like everything else above. */
  quotaExhausted: boolean
}

/** The prototype's own composed interp shape (`S.interp = {ctxScreen,
 *  engine, service, text, ...result}`, 2429): a `GatedInterpretation`
 *  (interpretGates.ts's sole real constructor output) plus the entry-screen
 *  context that produced it. `ctxScreen`/`engine`/`service`/`text` never
 *  live on `GatedInterpretation` itself — that module has no reason to know
 *  them — so the party that calls `runInterpretation` composes this wrapper
 *  before dispatching `INTERPRETATION_DONE`. Exported as its own interface,
 *  not an inline intersection on `SessionState.interp`, because three
 *  components and two reducer arms read it. `engine` uses this file's own
 *  `ServiceKey` (above), not `domain/casefile.ts`'s structurally-identical
 *  one — same "declared locally, not imported" layering reasoning that
 *  file's own `ServiceKey` doc comment gives. */
export interface ActiveInterpretation extends GatedInterpretation {
  ctxScreen: string
  engine: ServiceKey
  service: string
  text: string
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
  // C8 (Task 6) — the describe/interp slice (SessionState's own comment,
  // above, explains why none of these thirteen is on the nav clear set).
  describeOpen: false, describeText: '', describeErr: null,
  reading: false, interp: null, interpChangeOpen: {},
  caseFacts: [], appliedText: null,
  factEditIdx: null, factEditVal: '', fillsReviewed: false,
  interpProvenance: null, quotaExhausted: false,
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

// Fix round 1, Finding 2: a runtime set of every valid ScreenId, checked the
// SAME way `engineKey` is checked against `ENGINES` just below. `ScreenId`
// (this file, above) is a compile-time-only union — it has no runtime
// representation on its own — so a snapshot's `returnScreen` cannot be
// checked against it directly the way `engineKey in ENGINES` checks against
// a real object. `Record<ScreenId, true>` is what keeps this list a real
// validator rather than a second, driftable source of truth: TypeScript
// requires EVERY `ScreenId` member as a key (missing one is a compile
// error) and rejects any key that is not one (a typo is also a compile
// error), so this can only ever be exactly the union, by construction —
// there is no way for it to silently fall out of sync the way a hand-
// maintained array or a comment could. Before adding this, the codebase had
// no existing runtime list/set of screen ids to reuse (App.tsx's router is a
// `switch` on `state.screen`, not an enumerable list; the closest thing,
// its `default: const _never: never = state.screen` exhaustiveness check,
// only fires for a screen id the TYPE SYSTEM already believes is
// unreachable — no help against a plain `string` read back from
// `sessionStorage`).
// Exported (C8/Task 6) so session.test.ts can assert `'interp-confirm' in
// SCREEN_IDS` directly — the same drift-proof guarantee this const's own
// comment above already documents, now checkable from the test file instead
// of only indirectly through parsePendingGoogleSaveSnapshot.
export const SCREEN_IDS: Record<ScreenId, true> = {
  'home': true, 'other-services': true,
  'passport-guardrail': true, 'passport-outofscope': true, 'passport-q1': true, 'passport-q2': true,
  'passport-recovery': true, 'passport-recovery-paste': true, 'passport-recovery-show': true,
  'passport-diagnosis': true, 'passport-nextmove': true, 'passport-prepare': true,
  'voter-entry': true, 'voter-q1': true, 'voter-q2': true,
  'voter-diagnosis': true, 'voter-nextmove': true, 'voter-prepare': true,
  'sir-state': true, 'sir-unsupported': true, 'sir-reverifying': true,
  'sir-q1': true, 'sir-diagnosis': true, 'sir-nextmove': true, 'sir-prepare': true,
  'checkin': true, 'dead-end': true, 'case-closed': true, 'save-done': true,
  'save-case': true, 'save-otp': true, 'save-name': true,
  'interp-confirm': true,
}

/** Parses a stored snapshot; `null` on anything that is not exactly the
 *  expected shape — missing key, corrupt JSON, a hand-edited value, an
 *  `engineKey` this build no longer recognises, or (fix round 1, Finding 2)
 *  a `returnScreen` that is not a real, currently-routable screen id. Both
 *  the `engineKey in ENGINES` check and the `returnScreen in SCREEN_IDS`
 *  check below exist for the SAME reason, against the SAME class of hazard:
 *  `ENGINES` is the registry `diagnose` itself indexes by (session/cases.ts's
 *  `completeSave`), and `SCREEN_IDS` (above) is every id App.tsx's router
 *  switch actually handles — so together they are what stops a corrupt
 *  snapshot from crashing the resumed diagnosis OR the resumed navigation,
 *  rather than merely failing to resume it. This is not only a tampering
 *  concern: the snapshot is written by the build that starts the redirect
 *  and read by whatever build the tab loads on return, so a deploy landing
 *  in that window that renames or removes a screen id produces a
 *  perfectly-valid-JSON snapshot the new build's parser must still reject.
 *  Before this check existed, `engineKey` was protected and `returnScreen`
 *  was not — `App.tsx` cast it `as ScreenId` on trust, and a bogus value
 *  reached the router's exhaustiveness-checked `default` arm, which
 *  `throw`s with no error boundary anywhere in `src/`: a blank page.
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
  if (typeof p.serviceLabel !== 'string') return null
  if (typeof p.returnScreen !== 'string' || !(p.returnScreen in SCREEN_IDS)) return null
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
  // Task 6 (C8) — the describe/interp slice. Every arm below is a thin arm
  // doing exactly what its prototype counterpart does (design note 7),
  // EXCEPT `APPLY_INTERPRETATION`/`UNPLACEABLE_PICK` — Task 7's, declared
  // at the end of this slice (below `REMOVE_FACT`), alongside the routing
  // they need (`routeAfterApply`, session/cases.ts).
  | { type: 'TOGGLE_DESCRIBE' }
  | { type: 'SET_DESCRIBE_TEXT'; text: string }
  // A separate action from SET_DESCRIBE_TEXT (prototype exampleFill,
  // 2416-2419) — it also clears describeErr, and a later task's test needs
  // to distinguish "typed" from "tapped an example".
  | { type: 'FILL_DESCRIBE_EXAMPLE'; text: string }
  | { type: 'SET_DESCRIBE_ERR'; error: string | null }
  | { type: 'INTERPRETATION_STARTED' }
  // One action, one transition (design note 6): splitting the state write
  // from the navigation invites a state where the confirm screen renders
  // against a stale `interp`. `interp` is fully composed by the dispatching
  // caller (Task 11) before this fires — this arm never builds one itself.
  | { type: 'INTERPRETATION_DONE'; interp: ActiveInterpretation }
  // FR-AI-05: every failure lands on the unplaceable panel, fail CLOSED —
  // except the 'quota' reason (I7), the spec's own named exception, which
  // stays put instead (see the reducer arm's own comment). NOTE: this file
  // never PRODUCES the 'quota' reason (nothing dispatches it — that is
  // Task 18's real Gemini-429 mapping); this arm only CONSUMES it, the
  // branch design note 7's own brief explicitly asks Task 6 to build.
  // interpretation.test.ts's own grep-style pin greps for the literal
  // substring `reason:` immediately followed by `'quota'` (colon, not
  // `===`) — deliberately never written that way anywhere in this file, in
  // code OR comments, so that pin stays meaningful for Task 18.
  | { type: 'INTERPRETATION_FAILED'; reason: InterpretationFailure }
  // I5's other half — the unmount cleanup for an in-flight call the citizen
  // navigated away from (Task 11 design note 7a). Guarded on `s.reading` in
  // the reducer arm itself: the SAME cleanup also fires on the successful
  // (INTERPRETATION_DONE) unmount, where it must be a no-op.
  | { type: 'INTERPRETATION_ABANDONED' }
  | { type: 'INTERP_REPICK'; questionId: string; value: string }
  | { type: 'TOGGLE_INTERP_CHANGE'; questionId: string; open: boolean }
  | { type: 'SET_FACT_EDIT'; index: number }
  | { type: 'SET_FACT_EDIT_VAL'; value: string }
  | { type: 'SAVE_FACT_EDIT' }
  | { type: 'REMOVE_FACT'; index: number }
  // Task 7 — the one path from a proposal to an answer (design notes 1-7;
  // AC-AI-1). No payload beyond the clock: everything else the arm needs
  // is already on `state.interp` (design note 1) — passing the mappings in
  // again would create a second source of truth and a chance for the
  // dispatch site to pass a stale set. `now` is injected (D6) because the
  // arm may re-snapshot an active case, exactly as `TOGGLE_PREP_STEP`
  // does.
  | { type: 'APPLY_INTERPRETATION'; now: number }
  // Task 7, design note 6 / I10 — the unplaceable panel's fallback.
  // Deliberately has NO `screen` field: the destination is derived, once,
  // by `unplaceablePickPlan` (domain/interpret.ts) — the single derivation
  // pinned against all six real components by `interpretChains.test.ts`'s
  // onSelect-parity test (Task 2 design note 8). A payload `screen` would
  // let this action silently push six shipped routings into the panel
  // component as a second, drifting copy (I10) — session.test.ts pins the
  // absence with a `// @ts-expect-error`. `facts`/`text`/`provenance` are
  // the interpretation's OWN values at the moment the citizen picked from
  // the panel, carried on the action because `state.interp` is cleared by
  // this SAME transition — there is nothing left to read them off
  // afterward (the prototype's own "…so re-assign after (same rule as
  // apply)" comment, 2486-2488).
  | { type: 'UNPLACEABLE_PICK'; questionId: string; value: string; facts: Fact[]; text: string; provenance: string }

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
      // Explicit allowlist, not a blanket initialSession reset: savedCases,
      // user AND (whole-branch review Finding C1, 2026-09-07 fix wave)
      // migration are the persisted slice and must survive this, and only
      // this — RESTART's own arm comment explains why user must be on this
      // allowlist. migration was missing here because the field that
      // *reads* it (App.tsx's effect gates) was introduced by a later
      // task than the one that wrote this arm — dropping it silently
      // stops both the local-persistence effect (gated on user !== null)
      // and the server-push effect (gated on migration === 'done') from
      // ever running again after a Back-to-home, so a casefile saved
      // after that point exists only in memory. See the it.each in
      // session.test.ts pinning all FOUR initialSession-reset arms (Task 6
      // extends this from three to four — RESTART, BACK-to-home,
      // CLOSE_UNRESOLVED, SIGN_OUT).
      if (prev === 'home') return { ...initialSession, savedCases: s.savedCases, user: s.user, migration: s.migration }
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
      //
      // Task 6 (C8) design note 6 — the one existing-arm behaviour change
      // this chunk makes, transcribed from the prototype's own setAns()
      // (2195): caseFacts/appliedText/fillsReviewed reset here too, for the
      // SAME reason prepChecks/prepDraft already do — facts and the applied
      // text belong to the diagnosis they were captured for, and a
      // correction that changes the diagnosis must not leave a draft
      // pre-filled from a fact captured under a different reading, or a
      // trust disclosure quoting text that no longer produced the current
      // answers. `interpProvenance` joins them — the prototype has no
      // equivalent (it derives provenance at save time instead), but
      // clearing it here is what keeps D17's "non-null iff appliedText is
      // non-null" invariant true; forgetting it would leave a provenance
      // record attached to text that has just been discarded. ALL FOUR are
      // unconditional, exactly like prepChecks/prepDraft — never gated on
      // whether `answers` changed; the reference-equality no-op applies to
      // `answers` alone.
      //
      // This is also the seam Task 7's design note 2 names as the
      // sharpest interaction in the chunk: APPLY_INTERPRETATION writes
      // answers AND facts, so a naive multi-dispatch implementation
      // (N x ANSWER, then set facts) would have each ANSWER wipe what the
      // previous one just set. This arm's clears are correct and required
      // here regardless — Task 7 is where the ordering that survives them
      // gets solved, not this file.
      return {
        ...s, answers, prepChecks: {}, prepDraft: null,
        caseFacts: [], appliedText: null, interpProvenance: null, fillsReviewed: false,
      }
    }
    case 'RESTART_REQUEST': return { ...s, restartConfirm: true }
    case 'RESTART_CANCEL': return { ...s, restartConfirm: false }
    // Explicit allowlist, not a blanket initialSession reset (Issue #7,
    // design note 3; C7 design note 6): savedCases, user AND (whole-branch
    // review Finding C1, 2026-09-07 fix wave) migration are the persisted
    // slice and must survive a restart — every other field, including any
    // added later, resets to initialSession's value by default. `user` is
    // on this allowlist because the topbar BRAND BUTTON dispatches RESTART
    // (prototype topbar(), 2273), and — pointedly — so does the account
    // popover's own primary row (AccountChip.tsx's "Your casefile · N
    // open" button): without it, either tap would silently sign the
    // citizen out. Signing out is a separate, explicit action (SIGN_OUT)
    // — never a RESTART side effect. `migration` is on this allowlist for
    // the same reason: dropping it to 'idle' blanks App.tsx's
    // persistence/server-push effect gates (so a later save lands nowhere
    // durable) AND re-arms MIGRATION_STARTED's guard, so a re-emitted
    // SIGNED_IN (tab focus / cross-tab recovery) re-runs the migration
    // against an already-cleared nm_cases and can drop cases saved since
    // the restart. See the it.each in session.test.ts pinning all FOUR
    // initialSession-reset arms (RESTART, BACK-to-home, CLOSE_UNRESOLVED,
    // and — Task 6's addition — SIGN_OUT).
    case 'RESTART': return { ...initialSession, savedCases: s.savedCases, user: s.user, migration: s.migration }
    case 'TOGGLE_TRUST': return { ...s, trustOpen: !s.trustOpen }
    case 'SET_RECOVERY_TEXT': return { ...s, recoveryText: a.text }
    case 'EXPLAIN_VOTER_ENTRY': return { ...s, voterEntryExplain: true }
    // C5: thin arms over cases.ts's pure functions (design note 1) — pull
    // the relevant slice off `s`, call the matching helper, spread its
    // fragment back on, then apply the SAME nav()-style clears every
    // navigation applies (prototype nav(), line 2029; NAVIGATE arm above).
    case 'BEGIN_WORKING_CHECKIN': {
      const fragment = beginWorkingCheckin(
        {
          savedCases: s.savedCases, workingCase: s.workingCase, answers: s.answers, prepChecks: s.prepChecks,
          caseFacts: s.caseFacts, appliedText: s.appliedText, interpProvenance: s.interpProvenance,
        },
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
        {
          savedCases: s.savedCases, workingCase: s.workingCase, answers: s.answers, prepChecks: s.prepChecks,
          caseFacts: s.caseFacts, appliedText: s.appliedText, interpProvenance: s.interpProvenance,
        },
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
        {
          savedCases: s.savedCases, workingCase: null, answers: a.answers, prepChecks: a.prepChecks,
          caseFacts: s.caseFacts, appliedText: s.appliedText, interpProvenance: s.interpProvenance,
        },
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
        {
          answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId, workingCase: s.workingCase, savedCases: s.savedCases,
          caseFacts: s.caseFacts, appliedText: s.appliedText, interpProvenance: s.interpProvenance,
        },
        { index: a.index, now: a.now },
      )
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_CONFIRM': {
      const fragment = ciConfirm(
        {
          answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId,
          workingCase: s.workingCase, savedCases: s.savedCases, ciPending: s.ciPending,
          caseFacts: s.caseFacts, appliedText: s.appliedText, interpProvenance: s.interpProvenance,
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
          caseFacts: s.caseFacts, appliedText: s.appliedText, interpProvenance: s.interpProvenance,
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
          caseFacts: s.caseFacts, appliedText: s.appliedText, interpProvenance: s.interpProvenance,
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
      // explicit allowlist RESTART's own arm uses (design note 3), now
      // matching that allowlist exactly: savedCases, user AND migration
      // survive (whole-branch review Finding C2, 2026-09-07 fix wave).
      // Task 4's review flagged this arm as an unbriefed, untouched clone
      // of RESTART's allowlist and explicitly deferred the decision here.
      // The ruling: it must match RESTART, not diverge from it. Dropping
      // `user` here silently signs the citizen out while their Supabase
      // session stays live — the account chip disappears, a later Save
      // takes the signed-out branch, the closure itself never reaches the
      // server (effect 6 is gated on user !== null, so the next sign-in's
      // rule-zero authoritative-remote-row logic silently reverts it), and
      // — the actual leak — with `user` now null, App.tsx's local-
      // persistence effect no longer early-returns, so it writes this
      // account's savedCases into nm_cases; a different account signing in
      // next on the same browser then migrates account A's cases onto
      // account B. `migration` is on the same allowlist for the same
      // reason RESTART carries it. Design note 9: for a working (unsaved)
      // case, `fragment.workingCase` holds the just-closed case, but it was
      // never a member of savedCases and is dropped here exactly like
      // everywhere else RESTART drops workingCase — leaving genuinely no
      // record, on purpose. See the it.each in session.test.ts pinning all
      // FOUR initialSession-reset arms (Task 6 extends this from three to
      // four — RESTART, BACK-to-home, CLOSE_UNRESOLVED, SIGN_OUT).
      return { ...initialSession, savedCases: fragment.savedCases, user: s.user, migration: s.migration }
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
      const snap = caseSnapshot(
        c.engineKey, c.serviceLabel, s.screen, d, s.answers, prepChecks,
        s.caseFacts, s.appliedText, s.interpProvenance,
        a.now,
      )
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
    // Task 6 (C8) — the describe/interp slice. APPLY_INTERPRETATION is
    // Task 7's, not built here.
    case 'TOGGLE_DESCRIBE':
      // Prototype toggleDescribe() (2410): `S.describeOpen=!S.describeOpen;
      // S.describeErr=null;` — describeErr is scoped to the box, not the
      // screen, so it clears on both the opening AND closing edge.
      return { ...s, describeOpen: !s.describeOpen, describeErr: null }
    case 'SET_DESCRIBE_TEXT':
      // Prototype describeInput() (2411-2415) — the char-count is a pure
      // render-time derivation of `describeText.length` in every real
      // caller; nothing here needs to track it separately.
      return { ...s, describeText: a.text }
    case 'FILL_DESCRIBE_EXAMPLE':
      // Prototype exampleFill() (2416-2419): sets the text AND clears
      // describeErr — a distinct action from SET_DESCRIBE_TEXT for exactly
      // that second clear.
      return { ...s, describeText: a.text, describeErr: null }
    case 'SET_DESCRIBE_ERR':
      return { ...s, describeErr: a.error }
    case 'INTERPRETATION_STARTED':
      // Prototype runInterpretation() (2424): `S.reading=true;
      // S.describeErr=null;` — the empty-input guard immediately above it
      // (2422) never reaches this arm; INTERPRETATION_STARTED is only ever
      // dispatched once the caller has already confirmed non-empty text.
      return { ...s, reading: true, describeErr: null }
    case 'INTERPRETATION_DONE':
      // Prototype (2429-2431): `S.interp={...}; S.reading=false;
      // S.interpChangeOpen={}; S.factEditIdx=null; nav('interp-confirm')`.
      // One action, one transition (design note 6) — `interp` is assigned
      // WHOLESALE, never spread onto the previous value (design note 8): a
      // stale mapping or an open reveal from the earlier interpretation
      // must not survive onto the new one.
      return {
        ...s, interp: a.interp, reading: false, interpChangeOpen: {}, factEditIdx: null,
        history: [...s.history, s.screen], screen: 'interp-confirm',
        trustOpen: false, restartConfirm: false, removeConfirm: null, authErr: null, acctOpen: false,
      }
    case 'INTERPRETATION_FAILED': {
      if (a.reason === 'quota') {
        // I7, the spec's own named exception (spec §2: "the entry row is
        // hidden, not broken") — does NOT navigate. Not fail-stuck: the
        // citizen stays on their own question screen with the full closed
        // option list right there, the path that always works. describeText
        // is deliberately untouched (it is never on the nav clear set
        // anyway, but this arm does not even navigate, so there is no clear
        // set to apply here at all).
        return { ...s, reading: false, quotaExhausted: true, describeOpen: false, interp: null }
      }
      // Resolve the chain/engine for the CURRENT screen ONCE, up front —
      // fix round 1, Finding 3. A prior draft defaulted a missing engine
      // inline (`DESCRIBE_CHAINS[s.screen]?.engine ?? 'passport'`), which
      // an independent review correctly flagged as NOT a safe default: it
      // would write `engine: 'passport'` next to `ctxScreen: s.screen`, an
      // INTERNALLY INCONSISTENT pair. Task 14's render site resolves the
      // chain off `ctxScreen`, so a fallback `engine` buys nothing there —
      // and `engine` is not inert regardless: it feeds `gateFacts(engine,
      // text, raw.facts)` unconditionally inside `gateInterpretation`
      // below, so a wrong engine would run one service's fact-extraction
      // rules over another service's text. `s.screen` not being a real
      // describe entry screen should be unreachable (DescribeBlock only
      // ever renders, and only ever dispatches from, a screen
      // DESCRIBE_CHAINS covers) — but rather than synthesise an
      // inconsistent value for that case (a declared guardrail without an
      // executable test is a defect, and an inconsistent-but-tested value
      // is not better), this arm takes the SAME no-navigate shape the
      // 'quota' branch above already uses: `reading` clears, the describe
      // box closes, `interp` stays `null`, and the citizen is left on
      // their own question screen — the path that always works — instead
      // of being routed to a confirm panel built from a broken value. This
      // removes the bad branch rather than merely testing it.
      const entry = DESCRIBE_CHAINS[s.screen as DescribeEntryScreenId]
      if (!entry) return { ...s, reading: false, describeOpen: false, interp: null }
      // FR-AI-05: every other failure lands on the "We couldn't safely
      // place this" panel with the citizen's text preserved — fail CLOSED,
      // not fail-stuck. The synthesised interp is routed through the SAME
      // sole legitimate constructor every real interpretation uses
      // (interpretGates.ts's `gateInterpretation`), never the raw
      // `__gated` brand escape hatch: an empty `raw.mappings` forces
      // `unplaceable: true` (mappings.length===0) and an empty `discarded`
      // unconditionally — with no raw mapping ever proposed, the chain
      // argument has no effect on that output, so `[]` is exactly as
      // correct as the real chain would be here. `gateFacts`, called
      // UNCONDITIONALLY inside `gateInterpretation`, still derives real
      // facts straight from the citizen's own text regardless of the
      // failed provider call (interpretFacts.ts's own baseline extraction
      // runs off `text` alone) — exactly what the unplaceable panel's fact
      // chips need. `service` comes straight off the resolved `entry`
      // (`DescribeChain.service`) — the same real value every ordinary
      // DESCRIBE_CHAINS entry already carries, not a second, driftable
      // source of truth.
      const gated = gateInterpretation(
        [], entry.engine, s.answers, s.describeText, { mappings: [], facts: [] }, 0, 'none — interpretation failed',
      )
      return {
        ...s, reading: false,
        // interpChangeOpen/factEditIdx reset in the SAME transition, for
        // the SAME reason INTERPRETATION_DONE already resets them (design
        // note 8) — fix round 1, Finding 1. `interp` is replaced wholesale
        // here too (a brand-new, empty-mappings unplaceable value), so a
        // reveal or an armed fact-edit left open against the OLD
        // mapping/fact list must not survive onto this new one. Concrete
        // reachable path this closes: confirm screen -> SET_FACT_EDIT opens
        // edit mode on fact chip 0 -> BACK ("I'll answer myself instead",
        // which clears neither field) -> the citizen edits the text and
        // re-runs -> it fails again. Without this clear, `factEditIdx: 0`
        // would still be armed and pre-seeded with a value belonging to a
        // fact that no longer exists on the new (different) unplaceable
        // panel.
        interpChangeOpen: {}, factEditIdx: null,
        interp: { ...gated, ctxScreen: s.screen, engine: entry.engine, service: entry.service, text: s.describeText },
        history: [...s.history, s.screen], screen: 'interp-confirm',
        trustOpen: false, restartConfirm: false, removeConfirm: null, authErr: null, acctOpen: false,
      }
    }
    case 'INTERPRETATION_ABANDONED':
      // I5's other half (Task 11 design note 7a) — the unmount cleanup for
      // an in-flight call the citizen navigated away from. Guarded on
      // `s.reading`: the SAME cleanup also fires on the SUCCESSFUL unmount
      // (INTERPRETATION_DONE navigates, which unmounts the describe block
      // too), where `reading` is already false — this must be a no-op
      // there, by identity, not a second state write. Touches nothing but
      // `reading`/`describeErr` — in particular NOT describeText,
      // describeOpen, interp, or screen.
      return s.reading ? { ...s, reading: false, describeErr: null } : s
    case 'INTERP_REPICK': {
      // Thin arm over D4's pure `repick` (domain/interpret.ts). No-op with
      // no active interpretation.
      if (!s.interp) return s
      const chain = DESCRIBE_CHAINS[s.interp.ctxScreen as DescribeEntryScreenId]?.chain ?? []
      const gated = repick(s.interp, a.questionId, a.value, chain)
      // Also closes the reveal for the question just picked — fix round 1,
      // Finding 4, a judgment call. The independent review found a real
      // plan/implementation mismatch: the locked prototype's own
      // `interpPick` closes the reveal as part of the SAME transition
      // (design/nextmove-v1-prototype.html 2447), and the wider plan's own
      // Task 12 design note 8 already asserts this arm does exactly that —
      // but this task's original brief never listed the requirement, so
      // the arm as first built did not do it. Resolved HERE (the arm
      // closes its own reveal) rather than by pushing a second,
      // separately-dispatched action onto Task 12's UI code, because this
      // codebase already has an established "one user action, one atomic
      // transition" pattern for exactly this shape of problem —
      // INTERPRETATION_DONE above (design note 8) assigns the new `interp`
      // and navigates in the SAME transition specifically so a reveal
      // opened against a stale value cannot survive the gap between two
      // separate dispatches. A re-pick is the same shape: the citizen
      // closes the reveal BY picking a value from it, so requiring a
      // caller to remember a follow-up `TOGGLE_INTERP_CHANGE` dispatch
      // would both misrepresent a single user gesture as two actions and
      // reintroduce the "caller forgets the second dispatch" hazard this
      // pattern exists to avoid. This also means the wider plan's Task 12
      // design note was correct as written and needs no correction — this
      // arm now matches it.
      return {
        ...s,
        interp: { ...s.interp, mappings: gated.mappings, discarded: gated.discarded },
        interpChangeOpen: { ...s.interpChangeOpen, [a.questionId]: false },
      }
    }
    case 'TOGGLE_INTERP_CHANGE':
      // The per-question reveal (prototype 3076). D11's persistent control:
      // the caller supplies the target `open` state explicitly rather than
      // this arm inferring a toggle, so a reveal can be closed again the
      // same way it was opened.
      return { ...s, interpChangeOpen: { ...s.interpChangeOpen, [a.questionId]: a.open } }
    case 'SET_FACT_EDIT': {
      // Prototype editFact(i) (2451) — arms the index and seeds
      // factEditVal from the fact's CURRENT value. No-op with no active
      // interpretation or an out-of-range index.
      if (!s.interp) return s
      const fact = s.interp.facts[a.index]
      if (!fact) return s
      return { ...s, factEditIdx: a.index, factEditVal: fact.value }
    }
    case 'SET_FACT_EDIT_VAL':
      return { ...s, factEditVal: a.value }
    case 'SAVE_FACT_EDIT': {
      // Prototype saveFactEdit() (2452-2455): a blank (whitespace-only)
      // value is DISCARDED, not applied — but edit mode still closes
      // either way, matching the prototype's own guard exactly. Thin arm
      // over D4's pure `editFact` (domain/interpret.ts) for the applied
      // case.
      if (!s.interp || s.factEditIdx === null) return s
      const trimmed = s.factEditVal.trim()
      const facts = trimmed ? editFact(s.interp.facts, s.factEditIdx, trimmed) : s.interp.facts
      return { ...s, interp: { ...s.interp, facts }, factEditIdx: null }
    }
    case 'REMOVE_FACT': {
      // Thin arm over D4's pure `removeFact`. No-op with no active
      // interpretation.
      if (!s.interp) return s
      // fix round 1, Important finding: also clear factEditIdx/factEditVal —
      // `factEditIdx` is a plain array index into `interp.facts`, and
      // removing a fact at a LOWER index than the one currently being edited
      // shifts every later fact down by one, so a stale factEditIdx would
      // silently reattach the open editor to a DIFFERENT fact than the one
      // the citizen is actually looking at (with only two facts left, the
      // index goes fully out of range instead — milder, same root cause).
      // Matches the same reset-rather-than-shift-adjust convention this
      // codebase already established at INTERPRETATION_DONE and the
      // INTERPRETATION_FAILED reset site above for this exact stale-index
      // hazard class: removing ANY fact while a DIFFERENT fact is being
      // edited closes the open editor (its unsaved draft is discarded)
      // rather than risking it silently reattaching to the wrong fact.
      return {
        ...s,
        interp: { ...s.interp, facts: removeFact(s.interp.facts, a.index) },
        factEditIdx: null, factEditVal: '',
      }
    }
    case 'APPLY_INTERPRETATION': {
      // Design note 1: everything this arm needs is already on
      // `state.interp` — no-op with no active interpretation, matching
      // every other thin arm in this slice's own "no active interp -> no
      // -op" convention (INTERP_REPICK, SET_FACT_EDIT, SAVE_FACT_EDIT,
      // REMOVE_FACT, above).
      if (!s.interp) return s
      const interp = s.interp

      // Design note 2 — the sharpest interaction in the whole chunk, and
      // the load-bearing write order: thread the ACCUMULATING `answers`
      // through `applyCorrection` for every surviving mapping, in mapping
      // order (skipping `voterEntry`, D2, below), so an earlier write's
      // dependent-clearing (`DEPS_FOR[interp.engine]`) correctly wipes a
      // later mapping's now-stale dependent — exactly as it would if the
      // citizen had tapped them in order. `caseFacts`/`appliedText`/
      // `interpProvenance` are assigned ONLY after this loop finishes (in
      // the returned object, at the very end) — never inside it, and this
      // arm never dispatches through the `ANSWER` case above, whose own
      // unconditional clear (that arm's own design note 6 comment) would
      // otherwise wipe them the instant any second write landed. A future
      // refactor that routed this arm through `ANSWER` would silently
      // reintroduce exactly that bug; this comment, and the ordering test
      // pinning it (session.test.ts), are what stop it.
      let answers = s.answers
      for (const m of interp.mappings) {
        // D2: `voterEntry` is consumed as routing (below), never written —
        // the tap path (`VoterEntry`'s own `onSelect`, VoterScreens.tsx)
        // writes nothing for it either.
        if (m.questionId === 'voterEntry') continue
        answers = applyCorrection(answers, m.questionId, m.value, DEPS_FOR[interp.engine]).answers
        if (m.questionId === 'voterAppealedRaw') {
          // Design note 3 — the raw/normalised parity write, immediately
          // after the raw write, in that order (VoterScreens.tsx:106-113's
          // own load-bearing-ordering comment): the voter playbook reads
          // the NORMALISED `voterAppealed`; the trust disclosure echoes
          // the RAW pick. A describe mapping's value is never 'notsure'
          // (Task 2 design note 5 keeps it out of the option set), so this
          // normalisation is the identity here — written anyway, so the
          // describe path and the tap path produce byte-identical answer
          // records, which is FR-AI-01's actual promise.
          const normalized = m.value === 'notsure' ? 'unclassified' : m.value
          answers = applyCorrection(answers, 'voterAppealed', normalized, DEPS_FOR[interp.engine]).answers
        }
      }

      // Design note 5 — FR-AI-03's smart skip, in its entirety: the
      // destination is derived from the answers the writes above just
      // produced, plus the D2 routing value read off the mapping list
      // (never off `answers` — `voterEntry` was never written there).
      const entryRoute = interp.mappings.find(m => m.questionId === 'voterEntry')?.value
      const screen = routeAfterApply(interp.engine, answers, entryRoute) as ScreenId

      // Design note 1's re-snapshot — the SECOND precedent
      // (`applyCheckinPatch`, session/cases.ts:462), not `TOGGLE_PREP_
      // STEP`'s own `s.screen`-based one: the citizen is not necessarily
      // standing on the screen the new answers "belong" to, so this
      // preserves the case's OWN existing `returnScreen` rather than
      // recomputing it, and pins `savedAt` (D7) — the SAME inline
      // placement logic `TOGGLE_PREP_STEP` uses, not an import.
      // `prepChecks` is `{}` here, not `s.prepChecks`, because design note
      // 2 clears `prepChecks` as part of this SAME transition (below) —
      // snapshotting with stale prepChecks would contradict that clear.
      const c = activeCase(s)
      let workingCase = s.workingCase
      let savedCases = s.savedCases
      if (c && c.outcome === 'still_open' && c.engineKey === interp.engine) {
        const d = diagnose(ENGINES[c.engineKey], answers)
        // Task 8: `interp.facts`/`interp.text`/`interp.provenance`, NOT
        // `s.caseFacts`/`s.appliedText`/`s.interpProvenance` — at this
        // point in the transition, `s.*` still holds the STALE values
        // belonging to the interpretation being discarded, while
        // `interp.*` are the NEW ones this SAME transition writes onto
        // session state a few lines below (`caseFacts: interp.facts,
        // appliedText: interp.text, interpProvenance: interp.provenance`).
        // The re-snapshotted case must carry the SAME new values the
        // session state is about to hold — exactly the way this call
        // already snapshots against the post-write `answers` local, not
        // `s.answers`. Passing `s.*` here would silently persist a stale
        // fact/text/provenance record onto a case whose diagnosis just
        // changed.
        const snap = caseSnapshot(
          c.engineKey, c.serviceLabel, c.returnScreen, d, answers, {},
          interp.facts, interp.text, interp.provenance,
          a.now,
        )
        const updated: Casefile = { ...c, ...snap, savedAt: c.savedAt }
        if (s.activeCaseId === 'working') {
          workingCase = updated
        } else {
          savedCases = s.savedCases.map(x => (x.id === s.activeCaseId ? updated : x))
        }
      }

      return {
        ...s, answers, workingCase, savedCases,
        // Design note 2's ordering, restated: these three are the LAST
        // things this transition sets, after every write above.
        caseFacts: interp.facts, appliedText: interp.text, interpProvenance: interp.provenance,
        prepChecks: {}, prepDraft: null, fillsReviewed: false,
        describeText: '', describeOpen: false, interp: null,
        // This push lands 'interp-confirm' on `history` (the real dispatch
        // site's s.screen) in the same transition that nulls `interp`
        // above — BACK can land back on 'interp-confirm' with
        // `interp: null`. Intentional: Task 17's router renders Home for
        // that case (no dispatch, no crash), not a defect to fix here.
        history: [...s.history, s.screen], screen,
        trustOpen: false, restartConfirm: false, removeConfirm: null, authErr: null, acctOpen: false,
      }
    }
    case 'UNPLACEABLE_PICK': {
      // I10 — the single derivation of what a normal tap on each of the
      // six describable questions does; never re-implemented here (design
      // note 6).
      const plan = unplaceablePickPlan(a.questionId, a.value)
      if (!plan.screen) {
        // The ONLY branch where `unplaceablePickPlan` returns a null
        // screen is `voterEntry`/'notsure', which also sets `explain:
        // true` — matches `EXPLAIN_VOTER_ENTRY` (above) exactly: no writes
        // (`plan.writes` is empty for this branch anyway), no fact
        // restore, no navigation, no `interp`/`describeText`/
        // `describeOpen` clear. The citizen is not leaving the panel —
        // they are opening the SAME inline explainer the entry screen's
        // own `onSelect` opens.
        return { ...s, voterEntryExplain: true }
      }
      // Design note 6 — the same write-threading discipline as design note
      // 2's loop above, but simpler: `unplaceablePickPlan` already bakes
      // in the raw/normalised dual write for `voterAppealedRaw` (its own
      // `writes` array), so this loop needs no per-question special
      // casing.
      let answers = s.answers
      for (const w of plan.writes) {
        answers = applyCorrection(answers, w.key, w.value, DEPS_FOR[w.service]).answers
      }
      return {
        ...s, answers,
        // Restored AFTER the writes above — the prototype's own "…so
        // re-assign after (same rule as apply)" comment (2486-2488): a
        // plain answer write has no `ANSWER`-arm awareness of the
        // unplaceable-panel facts it must not wipe, so this arm carries
        // them on its own payload (`a.facts`/`a.text`/`a.provenance`) and
        // re-applies them itself, in this SAME transition.
        caseFacts: a.facts, appliedText: a.text, interpProvenance: a.provenance,
        // Fix round 1, Finding 1: this arm is an ordinary answer pick — the
        // same three clears the real onSelect for this question would
        // produce (via ANSWER's own unconditional clear, design note 6)
        // and APPLY_INTERPRETATION's sibling arm already applies above.
        // Without these, a prepare-plan tick or an FR-AI-04 fills
        // acknowledgment captured under one diagnosis could survive onto a
        // different one reached via this panel.
        prepChecks: {}, prepDraft: null, fillsReviewed: false,
        interp: null, describeText: '', describeOpen: false,
        // This push lands 'interp-confirm' on `history` (the real dispatch
        // site's s.screen) in the same transition that nulls `interp`
        // above — BACK can land back on 'interp-confirm' with
        // `interp: null`. Intentional: Task 17's router renders Home for
        // that case (no dispatch, no crash), not a defect to fix here.
        history: [...s.history, s.screen], screen: plan.screen as ScreenId,
        trustOpen: false, restartConfirm: false, removeConfirm: null, authErr: null, acctOpen: false,
      }
    }
  }
}
