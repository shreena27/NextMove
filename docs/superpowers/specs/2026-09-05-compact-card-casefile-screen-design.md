# Compact casefile card + casefile screen — design

**Date:** 2026-09-05 · **Status:** approved (user: card "looks too big… make a flow to go
inside and see updates") · **Scope:** design prototype

## Problem

The Home casefile card carries the full journey log and a three-button action cluster
(Add an update / Open / Remove), duplicating the log the check-in screen already renders
and making Home do casefile-detail work. Approved direction: compact card on Home; a
dedicated "inside" view for updates and history.

## Design

### Home card (compact, one tap target)

- Keeps: service square + kicker, state label, "Next: …" one-liner, mini stamp +
  steps/last-update/check-back chips.
- Drops: journey log, the button cluster.
- The **whole card** is the tap target (locked list-row pattern) → opens the casefile
  screen. Applies to open and closed cases alike; closed cards keep their dimmed style
  and "Closed — got it / unresolved" kicker.

### Casefile screen (the existing check-in screen, promoted)

No fifth surface: the check-in screen becomes the case's home.

**Open case:** left column — crumbs (`{service} · {state}` / "Your casefile"), the
"What's happened since?" headline + lede, a meta line (Saved date · check-back date), and
the **journey log's only home**. Right column — freshness banner, the untouched check-in
machinery (options, confirm/valence/closure panels, reassure, undo), the check-back date
picker, then quiet links: **See my diagnosis** (→ `{engine}-diagnosis`) and **Continue
preparing** (→ `{engine}-prepare`, only when the state has a PREP entry), and finally
**Remove** — quiet, inline-confirmed, relocated from Home (deleting from the overview was
too trigger-happy).

**Closed case:** same screen, no check-in options — headline "Case closed — the record
stays.", the log, **This came back** (existing reopen path) and **Remove**.

### Explicitly unchanged

Check-in semantics (options, patches, undo, snapshots), reopenCase, the popover, save
flows, and Home's service list. The old "Open" button's job (returning to Next Move /
Prepare) is covered by the in-screen links; `continueSaved` remains for the save-done
"Back to my case" path.

### Trade-off accepted

Reporting an update becomes two taps (card → option). Correct: the first tap shows where
things stand, which is what a returning user wants first.

## Testing (live)

1. Open-case card tap → casefile screen; full check-in path (report → confirm → diagnosis
   update → undo) still works from it.
2. Diagnosis and Prepare links land correctly; Prepare link absent on WAIT states.
3. Remove inside: confirm → case gone → back on Home.
4. Closed case: tap → closed variant; This came back reopens to diagnosis.
5. Home shows no logs/buttons on cards; detector clean; republished.
