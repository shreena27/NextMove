/** The app router — a `useReducer` over the session plus a `switch` on
 *  `state.screen`, the direct analogue of the prototype's `render()`
 *  (design/nextmove-v1-prototype.html, 3902-3941). Screen ids are the
 *  prototype's own; C4 added the three `*-prepare` cases, Task 13 added
 *  four more (`checkin`/`dead-end`/`case-closed`/`save-done`), and C7 Task
 *  17 adds the last three (`save-case`/`save-otp`/`save-name` — present in
 *  the `ScreenId` union since C7 Task 4, but routerless until now), which is
 *  what finally makes every `ScreenId` member a real case below.
 *
 *  Because `state.screen` is the `ScreenId` union (session.ts), the switch
 *  is exhaustiveness-checked: the `default` arm assigns `state.screen` to a
 *  `never`-typed binding, so a screen added to the union without a case
 *  becomes a compile error rather than a silent fallthrough — this is why
 *  `npm run build` goes fully clean only once Task 17's three cases exist
 *  (Global Constraints' named build-window exception, closed here).
 *
 *  The SIR route is gated in the SIR screens themselves (`SirState`'s
 *  `sirCoverage()` call), not here — this router never calls
 *  `optionsForPhase` or `diagnose` for an unsupported state; it only ever
 *  reaches `sir-diagnosis` once `sir-q1` has already been reached, which is
 *  only possible for a covered state.
 *
 *  `Diagnosis` is always derived fresh via `diagnose(engine, answers)` at
 *  render time (Global Constraint) — nothing here stores a computed
 *  diagnosis in session state.
 *
 *  THE `settled` CLASS (design note 7): the lifted `#app.settled` CSS rule
 *  (src/index.css) suppresses the entrance choreography on a same-screen
 *  re-render (trust toggle, selection) while still playing it on a genuine
 *  navigation. The prototype does this imperatively
 *  (`el.classList.toggle('settled', S.renderedScreen === S.screen)`,
 *  3907-3908); the React equivalent is a ref that remembers the screen last
 *  committed, compared against the screen being rendered THIS pass, updated
 *  in a no-dependency-array `useEffect` so it always reflects "the screen
 *  that was actually painted," not "the screen as of the last screen
 *  change." `renderedScreen` deliberately does NOT go into `SessionState` —
 *  it is render bookkeeping, not session state, and putting it in the
 *  reducer would make every re-render an action. `StrictMode`'s double-
 *  render is safe here: both passes read the same ref (no effect has run
 *  between them yet), so both compute the same `settled`. */
import { useReducer, useRef, useEffect, type ReactNode } from 'react'
import {
  sessionReducer, initialSession, PENDING_GOOGLE_SAVE_KEY, parsePendingGoogleSaveSnapshot,
  type ScreenId, type ServiceKey, type SessionAction, type PendingGoogleSaveSnapshot,
} from './session/session'
import { activeCase, newCaseId } from './session/cases'
import { loadCases, saveCases } from './session/caseStore'
import { getCurrentUser, onAuthChange } from './session/auth'
import { runSignInMigration, pushCases } from './session/caseSync'
import type { Casefile } from './domain/casefile'
import { hasAnswers } from './screens/screenProps'
import { Topbar } from './ui/Topbar'
import { Footer } from './ui/Footer'
import { Banner } from './ui/Banner'
import { Home } from './screens/Home'
import { OtherServices } from './screens/OtherServices'
import { PassportGuardrail, PassportOutOfScope, PassportQ1, PassportQ2 } from './screens/passport/PassportScreens'
import { PassportRecovery, PassportRecoveryPaste, PassportRecoveryShow } from './screens/passport/PassportRecovery'
import { VoterEntry, VoterQ1, VoterQ2 } from './screens/voter/VoterScreens'
import { SirState, SirUnsupported, SirReverifying, SirQ1 } from './screens/sir/SirScreens'
import { DiagnosisScreen } from './templates/DiagnosisScreen'
import { NextMoveScreen } from './templates/NextMoveScreen'
import { PrepareScreen } from './templates/PrepareScreen'
import { CasefileScreen } from './templates/CasefileScreen'
import { DeadEndScreen } from './templates/DeadEndScreen'
import { CaseClosedScreen } from './templates/CaseClosedScreen'
import { SaveCaseScreen } from './templates/SaveCaseScreen'
import { SaveOtpScreen } from './templates/SaveOtpScreen'
import { SaveNameScreen } from './templates/SaveNameScreen'
import { SaveDoneScreen } from './templates/SaveDoneScreen'
import { diagnose } from './domain/engine'
import { degradedFor, changedOnFor } from './domain/freshness'
import { passportEngine, voterEngine, sirEngine, ENGINES } from './playbooks/engines'
import { prepPlanFor } from './playbooks/prep'
import { SIR_STATES, SIR_Q1_OPTIONS_FOR } from './playbooks/sirPlaybook'
import { labelMap, PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS, VOTER_Q1_LABELS, VOTER_APPEAL_LABELS } from './screens/labels'
import { UI, PASSPORT_COPY, VOTER_COPY, SIR_COPY } from './screens/screenCopy'

/** DESIGN NOTE (Task 6 brief, design note 3): the honest port of the
 *  prototype's `if(!prep){ restart(); return renderHome(); }` guard
 *  (3749). `PrepareScreen`'s `prep` prop is required and non-nullable
 *  (Task 3), so a `*-prepare` screen id reached with a diagnosis that has
 *  no prep plan cannot be handed to it — unreachable through the UI (the
 *  "Prepare this for me" CTA only renders behind `hasPrepPlan`), but
 *  reachable via a direct NAVIGATE. This reproduces the prototype's
 *  behaviour: clear the working case and land on Home. RESTART is
 *  dispatched from an effect, never during render, and nothing is
 *  rendered — never `<Home>` with the stale answers that got it here
 *  (Home is a clean slate, always), and never a silent fall-through to
 *  `NextMoveScreen`. */
function RestartToHome({ dispatch }: { dispatch: (action: SessionAction) => void }) {
  useEffect(() => {
    dispatch({ type: 'RESTART' })
  }, [dispatch])
  return null
}

export default function App() {
  // Task 13, design note 6: the lazy `useReducer` initializer runs ONCE, at
  // mount, and is the ONLY place `nm_cases` is ever READ — mirroring the
  // `useEffect` below, the ONLY place it is ever WRITTEN. A corrupt
  // `nm_cases` value cannot prevent this from rendering: `loadCases()`
  // itself fails closed to `[]` (caseStore.ts's own contract), so this
  // initializer can only ever hand `sessionReducer` a real array, never
  // throw.
  const [state, dispatch] = useReducer(sessionReducer, initialSession, s => ({ ...s, savedCases: loadCases() }))

  // D6: the ONE clock this render pass hands to every D6-typed function and
  // prop below — CaseCard's own header note explains why a shared value
  // matters here specifically: two CaseCard instances rendered in the SAME
  // pass (Home's open-cases list) must never read two different `Date.now()`
  // values and disagree about "how long ago." Every other D6 function/
  // component in this chunk takes `now` as a REQUIRED prop/argument
  // specifically so it never has to call `Date.now()` itself (CaseCard.tsx's
  // own header note: oxlint's react(purity) rule correctly flags that as
  // impure) — this is the one deliberate exception: App.tsx is the actual
  // root of the tree, so SOMETHING has to call it for real, exactly once
  // per render pass, for every one of those props/arguments to share.
  // Declared here, before the auth-lifecycle effects below, so the
  // migration runner (effect 4) can reuse THIS render's clock for
  // `runSignInMigration(now)` rather than a separate `Date.now()` call.
  // oxlint-disable-next-line react/purity -- deliberate, single call site; see comment above
  const now = Date.now()

  // =========================================================================
  // C7 Task 8 — the auth lifecycle. Six effects (Task 19 adds the fifth):
  //   1. Signed-OUT persistence (C5's original effect, now gated).
  //   2. The mount effect — resolves any session supabase-js already
  //      restored, and strips a `?code=` param off the address bar.
  //   3. The `onAuthChange` subscription — every later auth event, named
  //      explicitly (design note 5).
  //   4. The migration runner — the only place that ever calls
  //      `runSignInMigration`.
  //   5. Task 19's resume-after-migration effect — finishes a save resumed
  //      from a pending-Google-save sessionStorage snapshot, once THIS
  //      sign-in's own migration has actually settled.
  //   6. The signed-IN push effect.
  // See each effect's own comment for its specific job; the migration
  // runner's comment explains the double-fire guard's actual mechanism.
  // =========================================================================

  // 1. Signed-out persistence (C5's effect; design note 7/9's gate).
  // Without the `user === null` gate, an account's cases would get written
  // into `nm_cases`, and the next different account to sign in on this
  // browser would migrate them onto itself — the D6 cross-account leak.
  // No further exception is needed for a failed migration: `SIGN_OUT`'s
  // `localCases` payload (design note 9, effect 3's `SIGNED_OUT` case
  // below) guarantees `state.savedCases` is already exactly what
  // `nm_cases` should hold by the time this effect ever sees it — `[]`
  // after a successful migration, the preserved set after a failed one.
  // Neither can be lost by writing it back over itself.
  useEffect(() => {
    if (state.user !== null) return
    saveCases(state.savedCases)
  }, [state.savedCases, state.user])

  // `ADOPT_CASES`'s own payload, captured at its one dispatch site (effect
  // 4 below) — design note 7's push-effect optimisation. The signed-in
  // push effect (6) skips a push when `state.savedCases` is
  // REFERENCE-identical to what the migration just adopted: the rows are
  // byte-identical to what the server already has (upsert-keyed on
  // `(user_id, id)`), so pushing them straight back is a wasted round
  // trip, never a correctness issue. This ref is what lets that effect
  // tell "just adopted" apart from "the citizen changed something."
  const justAdoptedRef = useRef<Casefile[] | null>(null)

  // Task 19 (post-Task-18 fix): a pending-Google-save snapshot read off
  // sessionStorage in the mount effect (2) below, held here until THIS
  // sign-in's own migration has actually settled (effect 5). Deliberately
  // NOT dispatched directly from the mount effect: `ADOPT_CASES` (effect
  // 4's own dispatch) unconditionally REPLACES `state.savedCases` with the
  // migration's merged set (fetched remote + local `nm_cases`) — dispatching
  // `RESUME_PENDING_SAVE` synchronously alongside `MIGRATION_STARTED` would
  // have the resumed case clobbered the instant that later, ASYNC
  // `ADOPT_CASES` lands, since the resumed case was never part of either
  // the remote fetch or the local `nm_cases` the migration reads (it only
  // ever lived in `sessionStorage`). Verified directly: an earlier version
  // of this fix dispatched `RESUME_PENDING_SAVE` inline in the mount effect,
  // and the Task 19 integration test's own "Go home -> `.saved-card`"
  // assertion failed — the case existed for exactly one render, then
  // vanished under `ADOPT_CASES`.
  //
  // Fix round 1, Finding 1: this ref is now populated SYNCHRONOUSLY, as the
  // very first thing effect 2 does (before that effect's own `await
  // getCurrentUser()`), rather than inside effect 2's async continuation —
  // see effect 2's own comment for why that used to leave a real (if
  // narrow) ordering hazard: effect 3's `onAuthChange` `SIGNED_IN` handler
  // could dispatch `MIGRATION_STARTED` and let the migration settle to
  // `'done'`/`'failed'` — firing this effect once, against a still-null ref
  // — before effect 2's OWN continuation ever got around to populating it,
  // permanently losing the resumed save (effect 5 is keyed only on
  // `state.migration`, which never changes value again). Populating the ref
  // synchronously, before effect 3 has even registered its subscription,
  // removes the race entirely rather than narrowing it: nothing that can
  // dispatch `MIGRATION_STARTED` — not effect 2's own continuation, not
  // effect 3's handler, not a real supabase-js notification, which cannot
  // fire before its listener exists — can run before this ref is already
  // set. See the "fix round 1, Finding 1" test in App.test.tsx for the
  // reproduction (RED against the old, async-continuation-only read) and
  // the fix (GREEN here).
  const pendingResumeRef = useRef<PendingGoogleSaveSnapshot | null>(null)

  // 2. The mount effect: resolves whatever session supabase-js already
  // restored (a real page load, or the PKCE code exchange it just
  // performed as part of `getCurrentUser()`'s own `getSession()` call),
  // dispatches `SIGNED_IN` + `MIGRATION_STARTED` when one exists (design
  // note 3.2), and — unconditionally, once that resolution has settled,
  // whichever way — strips a `?code=` param from the address bar (design
  // note 6). Gating the strip on success gets the failure case exactly
  // backwards: a FAILED exchange is precisely the case that otherwise
  // leaves a dead `?code=` to retry and fail again on every refresh, with
  // no way for the citizen to clear it but editing the address bar
  // themselves. No other file in `src/` reads `window.location` (design
  // note 6), so this is the app's only interaction with the URL.
  //
  // Task 19 (post-Task-18 fix): also where a pending-Google-save
  // `sessionStorage` snapshot is read — a save that was in flight when a
  // real Google OAuth redirect wiped `pendingSave`/`answers`/`prepChecks`
  // out of memory. This IS that "fresh page load" the comment above already
  // names, which is exactly why the read has to happen here rather than
  // anywhere else. `SaveCaseScreen.tsx`'s `handleGoogle` is the write site;
  // `session/session.ts`'s `PENDING_GOOGLE_SAVE_KEY` comment has the full
  // design. Read once, act once (the same discipline caseStore.ts's own
  // `nm_case` -> `nm_cases` migration uses): the key is cleared immediately
  // after being read, so a snapshot that fails to parse can never replay on
  // a later boot. A successfully parsed snapshot is stashed on
  // `pendingResumeRef` (declared above), NOT dispatched here — see that
  // ref's own comment for why the actual `RESUME_PENDING_SAVE` dispatch has
  // to wait for effect 5.
  //
  // Fix round 1, Finding 1: this read is now the VERY FIRST thing this
  // effect does — synchronous, before the `await getCurrentUser()` below
  // ever yields to the microtask queue — rather than living inside that
  // async continuation, gated on `result.ok && result.user`. That gate is
  // what created the ordering hazard: it forced the read to wait on a
  // promise, during which effect 3 (declared next) could already have
  // registered its `onAuthChange` subscription and had it fire — on a real
  // OAuth return, gotrue notifies subscribers as part of the SAME
  // initialization `getSession()` awaits, so effect 3 firing FIRST is the
  // ordering to expect, not an exotic one — settling the migration to
  // `'done'`/`'failed'` before this line ever ran, and permanently losing
  // the snapshot (`pendingResumeRef`'s own comment has the full mechanism;
  // App.test.tsx's "fix round 1, Finding 1" test is the reproduction).
  // Reading synchronously here removes that dependency entirely: effects
  // commit synchronously, in declaration order, within the SAME mount, so
  // nothing that can ever dispatch `MIGRATION_STARTED` — not this effect's
  // own async continuation below, not effect 3's handler, not a real
  // supabase-js notification (which cannot fire before its listener
  // exists) — can run before this line does. One consequence, deliberately
  // accepted: the key is now cleared regardless of whether a signed-in
  // session actually comes back (previously only cleared inside
  // `result.ok && result.user`) — a snapshot written but never followed by
  // a successful sign-in (the citizen cancelled at Google, or closed the
  // tab) is discarded here rather than left standing, since this effect
  // only ever runs once per mount and nothing else in the app ever reads
  // this key; `sessionStorage` not outliving the tab already made "left
  // standing" harmless, so discarding it immediately is no less safe and
  // closes the ordering hazard outright rather than merely narrowing it.
  useEffect(() => {
    try {
      const rawSnapshot = sessionStorage.getItem(PENDING_GOOGLE_SAVE_KEY)
      if (rawSnapshot !== null) {
        sessionStorage.removeItem(PENDING_GOOGLE_SAVE_KEY)
        pendingResumeRef.current = parsePendingGoogleSaveSnapshot(rawSnapshot)
      }
    } catch {
      // Storage absent, full, or disabled — same fail-soft discipline as
      // caseStore.ts's own store.get/store.del. The redirect already
      // completed; a lost resume here is the SAME pre-existing bug this
      // task fixes, not a new failure mode.
    }

    let cancelled = false
    void (async () => {
      const result = await getCurrentUser()
      if (!cancelled && result.ok && result.user) {
        dispatch({ type: 'SIGNED_IN', user: result.user })
        dispatch({ type: 'MIGRATION_STARTED' })
      }
      if (window.location.search.includes('code=')) {
        history.replaceState(null, '', window.location.pathname)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 3. Every later auth event, named explicitly (design note 5) — they all
  // arrive on the same channel, and an unhandled event falling through an
  // unremarked `default` is a decision made by accident.
  useEffect(() => {
    const unsubscribe = onAuthChange((event, user) => {
      switch (event) {
        case 'SIGNED_IN':
          // The main path. Also fires for a sign-in the mount effect (2)
          // already handled — see effect 4's comment for why that never
          // runs the migration twice.
          if (user) {
            dispatch({ type: 'SIGNED_IN', user })
            dispatch({ type: 'MIGRATION_STARTED' })
          }
          break
        case 'INITIAL_SESSION':
          // Ignored: the mount effect (2) already covers the
          // boot-with-a-session case, and this event's session is the
          // same one. Removes one of the three triggers at the source —
          // belt to effect 4's braces, which does not rest on this filter
          // alone.
          break
        case 'SIGNED_OUT':
          // No `auth.signOut()` call — the sign-out already happened,
          // here or in another tab; this is what makes a sign-out in a
          // second tab coherent in this one. It also fires for OUR OWN
          // sign-out, so this dispatch runs twice; `SIGN_OUT` on an
          // already-signed-out state resets to the same value, so it is
          // idempotent by construction. `loadCases()` (never `[]`, never
          // `state.savedCases`) is design note 9's fix: post-sign-out
          // `savedCases` becomes exactly what `nm_cases` already holds,
          // which is what preserves a failed migration's still-local
          // cases instead of a hardcoded `[]` destroying them.
          dispatch({ type: 'SIGN_OUT', localCases: loadCases() })
          break
        case 'USER_UPDATED':
          // Not `SIGNED_IN` (Task 4's action list) — `SIGNED_IN` also
          // clears `authErr`/`otp`/`authBusy`, which would silently wipe
          // unrelated state when there is no auth flow in progress.
          // Fired by `setDisplayName`'s `updateUser` call (Task 13); lands
          // on the same arm as that screen's own optimistic dispatch, with
          // the same value, so the second is a no-op.
          dispatch({ type: 'SET_USER_NAME', name: user?.name ?? null })
          break
        case 'TOKEN_REFRESHED':
          // Explicitly ignored: the access token rotated, the user
          // identity did not. Re-dispatching SIGNED_IN would clear
          // authErr/otp/authBusy mid-flow; re-running the migration would
          // be worse.
          break
        case 'PASSWORD_RECOVERY':
        case 'MFA_CHALLENGE_VERIFIED':
          // Unreachable and ignored: this app ships no password auth and
          // no MFA (scope exclusion 4). Named so a reader does not have to
          // re-derive that they are impossible.
          break
        default: {
          // Task 8 fix round 1, Finding 4: `onAuthChange`'s `event` is now
          // typed `AuthChangeEvent` (supabase-js's own 7-member union), so
          // this switch is exhaustiveness-checked the same way the screen
          // router below is — a name added to that union without a case
          // here becomes a compile error, not a silent no-op.
          const _never: never = event
          throw new Error(`unhandled auth event: ${String(_never)}`)
        }
      }
    })
    return unsubscribe
  }, [])

  // 4. The migration runner — design note 4's single entry point. The
  // mount effect (2) and the `onAuthChange` subscription's `SIGNED_IN`
  // case (3) are the ONLY two places that ever dispatch
  // `MIGRATION_STARTED`, and NEITHER of them calls `runSignInMigration`
  // directly; this effect is the only place that does.
  //
  // The guard is Task 4's reducer arm (`MIGRATION_STARTED` no-ops once
  // `migration` is already `'running'`/`'done'`), and this effect is what
  // makes that guard airtight rather than merely advisory: it is keyed on
  // `[state.migration]`, a PRIMITIVE STRING compared by VALUE, so React
  // only re-runs it when that value actually changes. However many
  // `MIGRATION_STARTED` actions land in the same batch — one from the
  // mount effect, one from `onAuthChange`'s `SIGNED_IN`, even a same-tick
  // double-fire of both — the reducer applies them in order and the value
  // transitions from `'idle'`/`'failed'` to `'running'` AT MOST ONCE; this
  // effect therefore fires at most once per genuine transition, no matter
  // how many call sites raced to trigger it.
  //
  // This is deliberately NOT "a single async function that dispatches
  // MIGRATION_STARTED and then reads `state.migration` back off a local
  // variable before proceeding": a plain closure read like that can be
  // stale exactly where it matters most — the `onAuthChange` subscription
  // (3) is set up ONCE, in a mount-only effect, so any `state` it closes
  // over is pinned to that first render and never sees a later
  // MIGRATION_STARTED transition without a ref. Keying a dedicated effect
  // on the reducer's OWN field sidesteps that: React always diffs against
  // the actually-committed value, not a possibly-stale closure, which is
  // the concrete sense in which "reducer state is shared, inspectable and
  // assertable" is stronger than a ref here, not just a style preference.
  //
  // The concrete harm this prevents: the upsert's idempotence (Task 7
  // design note 8) means the SERVER'S end state survives a double run, but
  // a second run would read `nm_cases` AFTER the first cleared it, see an
  // empty local set, and produce a `merged` that omits everything this
  // device contributed — which then replaces `savedCases`. The citizen's
  // cases are on the server and gone from the screen.
  //
  // Task 8 fix round 1, Finding 2 — the guard is genuinely TWO layers, not
  // one, and both are load-bearing for different trigger shapes: THIS
  // EFFECT's own `[state.migration]` value-comparison stops every
  // SAME-BATCH-OR-EARLIER double-fire (mount + onAuthChange racing before
  // the migration completes — shapes (a)/(b)/(c) below), because a
  // `MIGRATION_STARTED` dispatched while already `'running'` produces the
  // SAME string value, which React's dependency diff treats as unchanged.
  // But `SIGNED_IN` can also arrive AFTER a migration has already settled
  // to `'done'` — a real supabase-js shape (tab focus, cross-tab session
  // recovery) — and THAT case has no same-value protection to lean on:
  // without the reducer's own status check also covering `'done'`, this
  // effect's dependency array would see a genuine `'done'` -> `'running'`
  // VALUE CHANGE and correctly (from its own narrow perspective) fire
  // again. Verified directly: deleting the reducer's status check while
  // leaving this effect exactly as it is left shapes (a)/(b)/(c) green but
  // fails a fourth, dedicated test for this exact shape.
  useEffect(() => {
    if (state.migration !== 'running') return
    let cancelled = false
    void (async () => {
      const result = await runSignInMigration(now)
      if (cancelled) return
      if (result.ok) {
        justAdoptedRef.current = result.cases
        dispatch({ type: 'ADOPT_CASES', cases: result.cases })
      } else {
        dispatch({ type: 'MIGRATION_FAILED', error: result.error })
      }
    })()
    return () => { cancelled = true }
    // `now` is intentionally omitted from the dependency array: it is this
    // RENDER's clock (D6), read once when the effect actually fires (the
    // render where `state.migration` transitioned to `'running'`), not a
    // value this effect should re-run for on every later render — adding it
    // would re-fire this effect on every render once migration is
    // `'running'`, since `now` changes every render by construction.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deliberate: `now` is a snapshot, not a re-run trigger; see comment above
  }, [state.migration])

  // 5. Task 19 (post-Task-18 fix) — the resume-after-migration effect.
  // Finishes a save resumed from a pending-Google-save `sessionStorage`
  // snapshot (effect 2 stashes it on `pendingResumeRef`, declared above),
  // once THIS sign-in's own migration has actually settled — not before.
  // Keyed on `[state.migration]`, the SAME primitive-string dependency
  // effect 4 uses, for the SAME reason (that effect's own comment has the
  // full mechanism): `MIGRATION_STARTED` -> `'running'` -> a single
  // eventual `'done'`/`'failed'` transition, diffed by VALUE, so this
  // effect fires at most once per genuine settle. Runs on EITHER `'done'`
  // OR `'failed'`: a failed migration still leaves the local set (and, by
  // extension, this dispatch) as the truth (`MIGRATION_FAILED`'s own
  // reducer-arm comment) — there is no reason to strand the citizen's
  // resumed save waiting on a migration retry that may never come.
  // `pendingResumeRef.current` is `null` on every ordinary sign-in (nothing
  // to do — cheap, correct no-op); it is only ever non-null for the one
  // sign-in that just consumed a real snapshot.
  useEffect(() => {
    if (state.migration !== 'done' && state.migration !== 'failed') return
    const snapshot = pendingResumeRef.current
    if (!snapshot) return
    pendingResumeRef.current = null
    dispatch({
      type: 'RESUME_PENDING_SAVE',
      engineKey: snapshot.engineKey as ServiceKey,
      serviceLabel: snapshot.serviceLabel,
      returnScreen: snapshot.returnScreen as ScreenId,
      answers: snapshot.answers,
      prepChecks: snapshot.prepChecks,
      now, newId: newCaseId(),
    })
    // `now` is intentionally omitted from the dependency array — same
    // reasoning as effect 4's own comment above: this render's clock (D6),
    // read once when the effect actually fires, not a value to re-run for.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deliberate: `now` is a snapshot, not a re-run trigger; see comment above
  }, [state.migration])

  // 6. The signed-in push effect — pushes `savedCases` to the server on
  // change, and must NEVER call `saveCases` (that would resurrect the leak
  // the split exists to prevent — design note 9's first guarantee: no case
  // fetched from the account may reach `nm_cases` on the way out).
  //
  // Gated on `user !== null && migration === 'done'`: during `'running'`
  // it would race the migration's own upsert with a `savedCases` that is
  // still the PRE-migration local set (`SIGNED_IN` lands before
  // `ADOPT_CASES`); during `'failed'` it would push to a server that just
  // rejected the write, surfacing the error a second time from a path the
  // citizen did not trigger. The `justAdoptedRef` check skips the one
  // harmless-but-wasted push that would otherwise fire immediately after
  // `ADOPT_CASES` lands the just-adopted set right back into this effect's
  // own dependency.
  useEffect(() => {
    if (state.user === null || state.migration !== 'done') return
    if (state.savedCases === justAdoptedRef.current) return
    let cancelled = false
    void (async () => {
      const result = await pushCases(state.savedCases)
      if (cancelled) return
      if (!result.ok) dispatch({ type: 'MIGRATION_FAILED', error: result.error })
    })()
    return () => { cancelled = true }
  }, [state.savedCases, state.user, state.migration])

  const lastScreen = useRef<ScreenId | null>(null)
  // Deliberate ref-during-render read (see header comment): this is what
  // makes `settled` reflect "the screen that was actually painted," not
  // "the screen as of the last screen change." Safe because the effect
  // below has no dependency array, so it always runs after this read and
  // keeps `lastScreen.current` in sync; StrictMode's double-render reads
  // the same value on both passes (the effect hasn't run between them yet).
  // oxlint-disable-next-line react/refs
  const settled = lastScreen.current === state.screen
  useEffect(() => {
    lastScreen.current = state.screen
  })

  const topbar = (showBack: boolean, showRestart: boolean): ReactNode => (
    <Topbar
      showBack={showBack}
      showRestart={showRestart}
      hasAnswers={hasAnswers(state)}
      restartConfirm={state.restartConfirm}
      state={state}
      dispatch={dispatch}
    />
  )

  let body: ReactNode
  switch (state.screen) {
    case 'home':
      body = <Home state={state} dispatch={dispatch} now={now} />
      break
    case 'other-services':
      body = <OtherServices state={state} dispatch={dispatch} />
      break

    case 'passport-guardrail':
      body = <PassportGuardrail state={state} dispatch={dispatch} />
      break
    case 'passport-outofscope':
      body = <PassportOutOfScope state={state} dispatch={dispatch} />
      break
    case 'passport-q1':
      body = <PassportQ1 state={state} dispatch={dispatch} />
      break
    case 'passport-q2':
      body = <PassportQ2 state={state} dispatch={dispatch} />
      break
    case 'passport-recovery':
      body = <PassportRecovery state={state} dispatch={dispatch} />
      break
    case 'passport-recovery-paste':
      body = <PassportRecoveryPaste state={state} dispatch={dispatch} />
      break
    case 'passport-recovery-show':
      body = <PassportRecoveryShow state={state} dispatch={dispatch} />
      break
    case 'passport-diagnosis': {
      const d = diagnose(passportEngine, state.answers)
      const freshDegraded = degradedFor(passportEngine.playbook.rules)
      const freshChangedOn = changedOnFor(passportEngine.playbook.rules)
      const answerLabels = {
        ...labelMap('q1', { ...PASSPORT_Q1_LABELS, not_sure: PASSPORT_COPY.q1.notSure }),
        ...labelMap('q2', PASSPORT_Q2_LABELS),
      }
      // The recovery echoes (design note 10): a citizen who reached
      // Diagnosis via the "I'm not sure" recovery detour gets an extra
      // "You told us" row reflecting what they actually did there. Checked
      // in the same order the prototype writes them (recoveryPastedText
      // before recoveryAskedSafest can ever both be set — they're mutually
      // exclusive detour branches).
      const extraToldUs = state.answers.recoveryPastedText
        ? `${PASSPORT_COPY.recovery.extraToldUsPasted} "${state.answers.recoveryPastedText}"`
        : state.answers.recoveryAskedSafest === 'yes'
          ? PASSPORT_COPY.recovery.extraToldUsSafest
          : undefined
      body = (
        <DiagnosisScreen
          serviceLabel={UI.serviceLabel.passport}
          engineKey="passport"
          d={d}
          answerLabels={answerLabels}
          trustOpen={state.trustOpen}
          onToggleTrust={() => dispatch({ type: 'TOGGLE_TRUST' })}
          topbar={topbar(true, true)}
          extraToldUs={extraToldUs}
          appliedText={state.appliedText}
          caseFacts={state.caseFacts}
          onNavigate={screen => dispatch({ type: 'NAVIGATE', screen })}
          ciJustUpdated={state.ciJustUpdated}
          ciSnapshot={state.ciSnapshot}
          onUndo={() => dispatch({ type: 'CI_UNDO' })}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
              returnScreen: 'passport-nextmove', now,
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }
    case 'passport-nextmove': {
      const d = diagnose(passportEngine, state.answers)
      const prep = prepPlanFor(d)
      const freshDegraded = degradedFor(passportEngine.playbook.rules)
      const freshChangedOn = changedOnFor(passportEngine.playbook.rules)
      body = (
        <NextMoveScreen
          serviceLabel={UI.serviceLabel.passport}
          engineKey="passport"
          d={d}
          hasPrepPlan={Boolean(prep)}
          onPrepare={() => dispatch({ type: 'NAVIGATE', screen: 'passport-prepare' })}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
              returnScreen: 'passport-nextmove', now,
            })
          }
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
              returnScreen: 'passport-nextmove', now, newId: newCaseId(),
            })
          }
        />
      )
      break
    }
    case 'passport-prepare': {
      const d = diagnose(passportEngine, state.answers)
      const prep = prepPlanFor(d)
      if (!prep) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      const freshDegraded = degradedFor(passportEngine.playbook.rules)
      const freshChangedOn = changedOnFor(passportEngine.playbook.rules)
      body = (
        // `key={d.ruleId}` remounts PrepareScreen when the diagnosis changes
        // under it. Before Task 12 this also reset the screen's local
        // tick/draft `useState` — a clean slate per new plan. Now that
        // `prepChecks`/`prepDraft` live in the reducer (cleared by ANSWER
        // itself, not by this remount), the only state left for the
        // remount to discard is `copied`'s pending flash timer — still
        // worth doing (a stale "Copied ✓" flash from the OLD plan's draft
        // should not survive onto a new one), just for a narrower reason
        // than before. Kept for that reason, not dropped.
        <PrepareScreen
          key={d.ruleId}
          serviceLabel={UI.serviceLabel.passport}
          engineKey="passport"
          d={d}
          prep={prep}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          prepChecks={state.prepChecks}
          prepDraft={state.prepDraft}
          onTogglePrepStep={i => dispatch({ type: 'TOGGLE_PREP_STEP', index: i, now })}
          onSetPrepDraft={text => dispatch({ type: 'SET_PREP_DRAFT', text })}
          caseFacts={state.caseFacts}
          fillsReviewed={state.fillsReviewed}
          onToggleFillsReviewed={() => dispatch({ type: 'TOGGLE_FILLS_REVIEWED' })}
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
              returnScreen: 'passport-prepare', now, newId: newCaseId(),
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }

    case 'voter-entry':
      body = <VoterEntry state={state} dispatch={dispatch} />
      break
    case 'voter-q1':
      body = <VoterQ1 state={state} dispatch={dispatch} />
      break
    case 'voter-q2':
      body = <VoterQ2 state={state} dispatch={dispatch} />
      break
    case 'voter-diagnosis': {
      const d = diagnose(voterEngine, state.answers)
      const freshDegraded = degradedFor(voterEngine.playbook.rules)
      const freshChangedOn = changedOnFor(voterEngine.playbook.rules)
      const answerLabels = {
        ...labelMap('voterQ1', { ...VOTER_Q1_LABELS, unclassified: VOTER_COPY.q1.notSure }),
        ...labelMap('voterAppealedRaw', VOTER_APPEAL_LABELS),
      }
      body = (
        <DiagnosisScreen
          serviceLabel={UI.serviceLabel.voterServices}
          engineKey="voter"
          d={d}
          answerLabels={answerLabels}
          trustOpen={state.trustOpen}
          onToggleTrust={() => dispatch({ type: 'TOGGLE_TRUST' })}
          topbar={topbar(true, true)}
          appliedText={state.appliedText}
          caseFacts={state.caseFacts}
          onNavigate={screen => dispatch({ type: 'NAVIGATE', screen })}
          ciJustUpdated={state.ciJustUpdated}
          ciSnapshot={state.ciSnapshot}
          onUndo={() => dispatch({ type: 'CI_UNDO' })}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'voter', serviceLabel: UI.serviceLabel.voterServices,
              returnScreen: 'voter-nextmove', now,
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }
    case 'voter-nextmove': {
      const d = diagnose(voterEngine, state.answers)
      const prep = prepPlanFor(d)
      const freshDegraded = degradedFor(voterEngine.playbook.rules)
      const freshChangedOn = changedOnFor(voterEngine.playbook.rules)
      body = (
        <NextMoveScreen
          serviceLabel={UI.serviceLabel.voterServices}
          engineKey="voter"
          d={d}
          hasPrepPlan={Boolean(prep)}
          onPrepare={() => dispatch({ type: 'NAVIGATE', screen: 'voter-prepare' })}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'voter', serviceLabel: UI.serviceLabel.voterServices,
              returnScreen: 'voter-nextmove', now,
            })
          }
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'voter', serviceLabel: UI.serviceLabel.voterServices,
              returnScreen: 'voter-nextmove', now, newId: newCaseId(),
            })
          }
        />
      )
      break
    }
    case 'voter-prepare': {
      const d = diagnose(voterEngine, state.answers)
      const prep = prepPlanFor(d)
      if (!prep) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      const freshDegraded = degradedFor(voterEngine.playbook.rules)
      const freshChangedOn = changedOnFor(voterEngine.playbook.rules)
      body = (
        // See the passport-prepare case's own comment on `key={d.ruleId}`.
        <PrepareScreen
          key={d.ruleId}
          serviceLabel={UI.serviceLabel.voterServices}
          engineKey="voter"
          d={d}
          prep={prep}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          prepChecks={state.prepChecks}
          prepDraft={state.prepDraft}
          onTogglePrepStep={i => dispatch({ type: 'TOGGLE_PREP_STEP', index: i, now })}
          onSetPrepDraft={text => dispatch({ type: 'SET_PREP_DRAFT', text })}
          caseFacts={state.caseFacts}
          fillsReviewed={state.fillsReviewed}
          onToggleFillsReviewed={() => dispatch({ type: 'TOGGLE_FILLS_REVIEWED' })}
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'voter', serviceLabel: UI.serviceLabel.voterServices,
              returnScreen: 'voter-prepare', now, newId: newCaseId(),
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }

    case 'sir-state':
      body = <SirState state={state} dispatch={dispatch} />
      break
    case 'sir-unsupported':
      body = <SirUnsupported state={state} dispatch={dispatch} />
      break
    case 'sir-reverifying':
      body = <SirReverifying state={state} dispatch={dispatch} />
      break
    case 'sir-q1':
      body = <SirQ1 state={state} dispatch={dispatch} />
      break
    case 'sir-diagnosis': {
      const d = diagnose(sirEngine, state.answers)
      const freshDegraded = degradedFor(sirEngine.playbook.rules)
      const freshChangedOn = changedOnFor(sirEngine.playbook.rules)
      // Reachable only via sir-q1, which is itself only reachable for a
      // covered, phased state (SirState's sirCoverage() gate) — so
      // st.phase is always defined here.
      const st = SIR_STATES[state.answers.sirState]
      const answerLabels = labelMap('sirQ1', { ...SIR_Q1_OPTIONS_FOR[st.phase!.id], unclassified: SIR_COPY.q1.notSure })
      body = (
        <DiagnosisScreen
          serviceLabel={UI.serviceLabel.sir}
          engineKey="sir"
          d={d}
          answerLabels={answerLabels}
          trustOpen={state.trustOpen}
          onToggleTrust={() => dispatch({ type: 'TOGGLE_TRUST' })}
          topbar={topbar(true, true)}
          preNote={<Banner><b>{st.name} · {st.phase!.label}:</b> {st.phase!.note}</Banner>}
          appliedText={state.appliedText}
          caseFacts={state.caseFacts}
          onNavigate={screen => dispatch({ type: 'NAVIGATE', screen })}
          ciJustUpdated={state.ciJustUpdated}
          ciSnapshot={state.ciSnapshot}
          onUndo={() => dispatch({ type: 'CI_UNDO' })}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'sir', serviceLabel: UI.serviceLabel.sir,
              returnScreen: 'sir-nextmove', now,
            })
          }
          phaseDrift={state.phaseDrift}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }
    case 'sir-nextmove': {
      const d = diagnose(sirEngine, state.answers)
      const prep = prepPlanFor(d)
      const freshDegraded = degradedFor(sirEngine.playbook.rules)
      const freshChangedOn = changedOnFor(sirEngine.playbook.rules)
      body = (
        <NextMoveScreen
          serviceLabel={UI.serviceLabel.sir}
          engineKey="sir"
          d={d}
          hasPrepPlan={Boolean(prep)}
          onPrepare={() => dispatch({ type: 'NAVIGATE', screen: 'sir-prepare' })}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
          onUpdate={() =>
            dispatch({
              type: 'BEGIN_WORKING_CHECKIN', engineKey: 'sir', serviceLabel: UI.serviceLabel.sir,
              returnScreen: 'sir-nextmove', now,
            })
          }
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'sir', serviceLabel: UI.serviceLabel.sir,
              returnScreen: 'sir-nextmove', now, newId: newCaseId(),
            })
          }
        />
      )
      break
    }
    case 'sir-prepare': {
      const d = diagnose(sirEngine, state.answers)
      const prep = prepPlanFor(d)
      if (!prep) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      const freshDegraded = degradedFor(sirEngine.playbook.rules)
      const freshChangedOn = changedOnFor(sirEngine.playbook.rules)
      body = (
        // See the passport-prepare case's own comment on `key={d.ruleId}`.
        <PrepareScreen
          key={d.ruleId}
          serviceLabel={UI.serviceLabel.sir}
          engineKey="sir"
          d={d}
          prep={prep}
          topbar={topbar(true, true)}
          dispatch={dispatch}
          prepChecks={state.prepChecks}
          prepDraft={state.prepDraft}
          onTogglePrepStep={i => dispatch({ type: 'TOGGLE_PREP_STEP', index: i, now })}
          onSetPrepDraft={text => dispatch({ type: 'SET_PREP_DRAFT', text })}
          caseFacts={state.caseFacts}
          fillsReviewed={state.fillsReviewed}
          onToggleFillsReviewed={() => dispatch({ type: 'TOGGLE_FILLS_REVIEWED' })}
          savedCases={state.savedCases}
          onSave={() =>
            dispatch({
              type: 'BEGIN_SAVE', engineKey: 'sir', serviceLabel: UI.serviceLabel.sir,
              returnScreen: 'sir-prepare', now, newId: newCaseId(),
            })
          }
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }

    case 'checkin': {
      const c = activeCase(state)
      if (!c) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      // FIX WAVE (2026-09-06, whole-branch final review, Critical finding 1):
      // this was `diagnose(ENGINES[c.engineKey], c.answers)` — the ACTIVE
      // CASE's own stored answers. But `session/cases.ts`'s `ciChoose` (the
      // reducer logic that runs when the citizen clicks one of the option
      // rows this screen renders) independently rebuilds ITS OWN diagnosis
      // from `state.answers` (the session's live answers), which can genuinely
      // differ from `c.answers` — the ANSWER action updates `state.answers`
      // but never touches the active case's stored `answers`, and a citizen
      // can reach the casefile screen with the two out of sync via Back
      // navigation after answering a question mid check-in. When they diverge,
      // `ciChoose` indexes into a freshly-built option list (from
      // `state.answers`) using the click index the citizen picked off THIS
      // screen's list (built from `c.answers`) — silently recording the wrong
      // option, or doing nothing at all if the new list is shorter. The fix:
      // derive `d` from `state.answers`, exactly like `ciChoose` does and
      // exactly like the locked prototype's own `currentDiagnosis()`
      // (S.answers) — so the screen's rendered diagnosis and the reducer's
      // diagnosis are the SAME computation over the SAME data, by
      // construction, and can never diverge again.
      const d = diagnose(ENGINES[c.engineKey], state.answers)
      const freshDegraded = degradedFor(ENGINES[c.engineKey].playbook.rules)
      const freshChangedOn = changedOnFor(ENGINES[c.engineKey].playbook.rules)
      body = (
        <CasefileScreen
          case={c}
          d={d}
          answers={state.answers}
          prepChecks={state.prepChecks}
          savedCases={state.savedCases}
          now={now}
          ciPending={state.ciPending}
          ciPendingIdx={state.ciPendingIdx}
          ciStage={state.ciStage}
          ciReassure={state.ciReassure}
          ciSnapshot={state.ciSnapshot}
          ciConsecutive={state.ciConsecutive}
          phaseDrift={state.phaseDrift}
          reminderCopied={state.reminderCopied}
          logOpen={state.logOpen}
          removeConfirm={state.removeConfirm}
          topbar={topbar(true, false)}
          dispatch={dispatch}
          freshDegraded={freshDegraded}
          freshChangedOn={freshChangedOn}
        />
      )
      break
    }
    case 'dead-end': {
      const c = activeCase(state)
      if (!c) {
        body = <RestartToHome dispatch={dispatch} />
        break
      }
      body = (
        <DeadEndScreen case={c} logOpen={state.logOpen} now={now} topbar={topbar(true, false)} dispatch={dispatch} />
      )
      break
    }
    case 'case-closed': {
      // Mirrors the prototype's own lookup (CaseClosedScreen.tsx's header
      // note): a saved, deliverable_received case matching activeCaseId, or
      // whatever activeCase() otherwise resolves to (a working case closed
      // without ever having been saved). Nullable — the component's own
      // job, not RestartToHome's, to render sensibly for either.
      const c = state.savedCases.find(x => x.outcome === 'deliverable_received' && x.id === state.activeCaseId)
        ?? activeCase(state)
      body = <CaseClosedScreen case={c} logOpen={state.logOpen} topbar={topbar(false, false)} dispatch={dispatch} />
      break
    }
    case 'save-case':
      body = (
        <SaveCaseScreen
          authMethod={state.authMethod} authId={state.authId} authErr={state.authErr} authBusy={state.authBusy}
          pendingSave={state.pendingSave} answers={state.answers} prepChecks={state.prepChecks}
          now={now} topbar={topbar(true, false)} dispatch={dispatch}
        />
      )
      break
    case 'save-otp':
      body = (
        <SaveOtpScreen
          authMethod={state.authMethod} authId={state.authId} otp={state.otp} authErr={state.authErr}
          authBusy={state.authBusy} otpResent={state.otpResent} otpCooldownUntil={state.otpCooldownUntil}
          now={now} topbar={topbar(true, false)} dispatch={dispatch}
        />
      )
      break
    case 'save-name':
      body = (
        <SaveNameScreen
          pendingSave={state.pendingSave} pendingName={state.pendingName} now={now}
          topbar={topbar(false, false)} dispatch={dispatch}
        />
      )
      break
    case 'save-done':
      body = (
        <SaveDoneScreen pendingSave={state.pendingSave} user={state.user} topbar={topbar(false, false)} dispatch={dispatch} />
      )
      break

    default: {
      const _never: never = state.screen
      throw new Error(`unhandled screen: ${String(_never)}`)
    }
  }

  return (
    <div id="app" className={settled ? 'app settled' : 'app'}>
      {body}
      <Footer />
    </div>
  )
}
