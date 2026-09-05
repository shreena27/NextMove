# Account chip + profile popover — design

**Date:** 2026-09-05 · **Status:** approved (user, this date) · **Scope:** design prototype now; production notes inline

## Problem

The signed-in indicator is a masked id chip (`s•••@gmail.com` / `+91 •••••• 210`) whose only
action is sign-out. User feedback: it reads cold, and it does too little. Approved fix:
show the person's name and give the chip a small popover home (Approach A of three).

## Design

### The chip

- Avatar circle with the first initial + first name: **Ⓢ Shreena** (replaces the masked id
  as the chip label).
- No name available → the chip shows the masked id as today, inside the same avatar-chip
  visual. Never blocks on a name.
- Click toggles the popover (was: immediate sign-out confirm).

### Where the name comes from

- **Google:** carried by the account. Prototype simulates with a demo name; production reads
  the OAuth profile's given name.
- **Phone / email:** one optional ask-once screen right after OTP verification — headline
  "What should we call you?", single input, primary continue, quiet **Skip** link. Skipping
  falls back to the masked id forever after; saving is never blocked. Stored on the user
  record (`nm_user.name` in the prototype; account profile in production).

### The popover

Small border-only card anchored to the chip (Ticklist account-menu card language — border,
no heavy shadow; small popovers don't earn overlay elevation). Contents, in full:

1. **Name** (or masked id when no name), with the masked sign-in id as a quiet secondary
   line beneath when a name is shown — the privacy detail survives, demoted from headline
   to detail.
2. **"Your casefiles — N open"** row; activating it goes Home (where the cards live).
3. **Sign out**, confirming inline inside the popover.

Dismissal: click outside or Esc. `aria-expanded` on the chip; the popover is keyboard
reachable.

### Sign-out semantics (adopting grill A8 with this change, not later)

The popover must not ship the old, production-contradicting copy. With this change:

- Sign out clears the session only; casefiles stay on the account. Copy: **"Sign out? Your
  cases stay on your account — sign back in any time."**
- Prototype modeling: `nm_cases` persists in storage; in-memory cases clear on sign-out and
  Home shows none while signed out; signing back in restores them (cases load at boot only
  when a user is present, and sign-in re-loads stored cases before any save completes, so a
  signed-out save can never clobber the stored set).
- **Remove** (per-case, on Home) stays the actual deletion path, unchanged.

## Out of scope (deliberate, per minimalism principle)

- Case actions in the popover (open/remove) — they stay on Home's cards; the popover must
  not become a second Home.
- Profile editing, avatar images, notification preferences, a full profile screen.

## Testing (prototype, live in browser)

1. Google save → chip shows demo name + initial; popover shows name, masked id, correct
   open-case count; count row navigates Home.
2. Phone save → ask-once screen appears after OTP; entering a name shows it on the chip;
   Skip falls back to masked id.
3. Sign out → confirm copy is the account-scoped version; Home shows no cases while signed
   out; sign back in → cases return, including after a page reload.
4. Signed-out save of a new case does not destroy previously stored cases.
5. Popover closes on outside click and Esc; detector run clean; republish same URL.
