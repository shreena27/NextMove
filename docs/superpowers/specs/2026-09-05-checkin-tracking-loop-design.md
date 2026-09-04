# Design: The check-in tracking loop ("walking with them")

**Date:** 2026-09-05 · **Status:** Approved (user); Opus-reviewed — all 6 blockers + important findings incorporated · **Vision (user's words):** "NextMove is their buddy walking with them at each step until they get clarity on the deliverable."

## The loop

Diagnose → act → wait → **check in ("Add an update")** → re-orient → repeat, until the deliverable is in hand (case closed) or the verified ladder is exhausted (dead end, honestly named). This implements the TRACKING stage of the original MVP engine (STATUS → DEPENDENCY → NEXT ACTION → EXECUTION → TRACKING → ESCALATION).

## Answer-model surgery (Opus blockers 1–2 — lands before any UI)

The one-shot model conflated *what the user did*, *what the world did*, and *how it turned out*. Corrected:

- **Actions vs outcomes.** Action-state answers (Passport `q2`, voter appeal filings) are only ever written by the user attesting to their own action, in first-person past-tense copy ("I filed the grievance on CPGRAMS and have a number"). Outcome answers are new fields (`fOutcome`, `gOutcome`, `dpgOutcome`, `ceoAppeal`, `sirDocsFiled`, `form6Filed`, …) written by check-ins. **The ladder never climbs itself:** "they responded — didn't help" sets an outcome on the current rung; the playbook then *recommends* the next rung; a later check-in records that the user actually took it.
- **New pending WAIT states** (all sourced from the same grievance/appeal citations as their parent rungs, most-specific-first in each rules array): follow-up sent/awaiting response; grievance filed/response pending; escalated to DPG/response pending; second appeal filed with state CEO; SIR documents submitted / Form 6 filed. "Filed and waiting" is a real, honest state — not the same as "unresolved."
- **Two write paths on the same engine.** `setAns` (correction, via Back) clears downstream state as today. `updateAns` (check-in event) preserves facts always; prepare progress is cleared only when the resulting diagnosis id changes (the plan changed), and completed work is memorialized in the journey log before clearing.

## Check-in screen ("Add an update" — command copy, not a question)

Options are generated from **(current diagnosis state × prepare-step completion)**, grouped and typed:

- **World events** ("Police contacted me", "The BLO visited", "A decision arrived") — patch world-state answers.
- **My actions** ("I filed the formal grievance and have a number") — patch action-state answers; offered only when relevant; when zero prepare steps are ticked, the list leads with a shame-free **"I haven't done this yet"** that reopens the prepare flow.
- **"Nothing yet"** — first-class: logs a dated check, restates the case's own verified "How long?" and "What to expect" fields byte-identically, never implies lateness. Two consecutive nothing-yet checks surface the anti-compulsion line: "This stage doesn't change day to day."
- **"Something else happened"** — mandatory escape hatch on every list; routes to full re-diagnosis (or the honest UNCLASSIFIED screen). Closed options must never absorb sideways reality.
- Decision-class events are **valence-asked** ("Was it accepted or rejected?") before any routing. Rejection → a calm, non-shaming screen naming the next *verified* rung. The celebratory beat can never land on a rejection.
- Every state-changing option confirms before recording; a fresh update shows **Undo** (true rollback + entry removal — the immediate-undo policy; later corrections are visible log entries, never silent rewrites).
- Multi-event days: after recording one update, "Anything else change?" loops back.

## Closure, dead ends, reopening (blockers 3–4 + forgotten items)

- `case_outcome: still_open | deliverable_received | closed_unresolved`. Only **deliverable_received** archives with the single calm celebratory beat (reduced-motion-safe). "They responded — sorted" asks the follow-up — "Did you get your passport?" — no → the rung resets (consumed), the case returns to a WAIT on the world, tracking continues.
- **Dead end** (after DPG; after the CEO second appeal rejected): its own screen, not a diagnosis. Copy says plainly: *you have used every step this playbook can verify* — no invented next step, no false hope. Choices: close as unresolved, or keep the case open. (Production: export the record.)
- Closure is not permanent: archived cases show under "Closed" with **"This came back"** → restore to live, log intact.
- UNCLASSIFIED check-in model: re-diagnose / "I got it" / nothing yet — nothing else.

## Journey log

- Entries are typed and labeled: **"You reported:"** vs **"NextMove:"** (diagnosis changes), plus checked/closed/reopened/corrected. Entry text references state transitions — **no PII in log lines** (facts stay in the structured record).
- Consecutive "nothing yet" checks collapse: "Checked N times, {range} — no change reported." Milestones styled apart from checks. Last 3 shown, "Show all" expands.
- One plain line: "Your journey record — not an official document." Deleting the case deletes the log (real deletion). Production: DPDP retention line in-UI.

## Multiple casefiles (blocker-adjacent 8)

`nm_cases` is an array (old single `nm_case` migrates on load). Home renders a card list; open cases first, closed collapsed below. Save always creates/updates by case id. SIR overlap with a passport case is the expected co-occurrence.

## The buddy without notifications (finding 11)

- User-picked check-back date on the check-in and save-done screens — **never a suggested interval** (a suggested cadence is an invented timeline through the back door). The date renders on the casefile card ("You planned to check back on 12 Oct") and as a copyable reminder line for the user's own phone. (Production: .ics download + opt-in email.)
- Passive "Last checked N days ago" on the card — concrete time, no nagging.

## SIR phase drift + versioning (forgotten items)

- A SIR case stamps its phase id at save. On continue/check-in, if the live phase config differs, an interstitial states "Delhi's SIR phase has changed since you saved" and re-diagnoses against the current phase before any options are offered; options whose action window has closed are never offered.
- Production requirement (PRD, not prototype): stamp `playbook_version` per case; on resume, if the recommendation changed, say so out loud ("The official process changed since you saved this") — never swap silently.

## Save prompt repositioning

The auth ask now sells tracking, not storage: "Save this case and NextMove keeps walking with you — updates, journey record, and your next move, whenever you come back."

## Prototype scope note

Passport implements the full ladder (all rungs, pending states, dead end). Voter implements the appeal ladder with valence + second-appeal pending + dead end. SIR implements S-1/S-4 transitions, filed-pending states, phase-drift check; remaining SIR breadth is data work, flagged in the PRD. Reminder is a date field + copyable line (no .ics in an artifact).

## Test list

Migration of old saved case; save → log seeded with diagnosis entry; passport walk state-1 → "police contacted" → state-2 with facts preserved + log entries; action attestation 5a → "I filed the grievance" → grievance-pending WAIT → "didn't help" → 5b (DPG recommended) → "I escalated" → DPG-pending → "didn't help" → dead end; "sorted" → deliverable question → no → rung reset to WAIT; deliverable → closed → archived → reopen; voter v-4 decided-rejected → v-5 → filed → pending → rejected → dead end; decided-accepted → closure question; undo restores pre-check-in state exactly; nothing-yet logs + collapse + anti-compulsion on second consecutive; two saved cases render as two cards; reminder date renders on card; escape hatch routes to Q1; prep steps survive a same-id check-in and clear on id change.
