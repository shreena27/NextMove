#!/usr/bin/env python3
"""Source-freshness detector for NextMove (detect -> degrade -> human-verify model).

Re-downloads every checked manifest document and compares its SHA-256
against the committed copy's hash recorded in manifest.json. Writes
freshness.json with a per-document status, which the deployed app's build
step bundles (committed by this script, never fetched live by a citizen's
browser) to decide whether to show a "this may be outdated" banner.

check modes (manifest.json's documents[*].check):
  auto    - checked every run, CI and local alike.
  local   - checked only outside CI (NEXTMOVE_CI=1 unset). ceodelhi.gov.in
            silently drops connections from GitHub Actions' US-based
            runner IPs (confirmed 2026-09-07 — 60s timeout, unaffected by
            a realistic browser User-Agent; eci.gov.in and
            passportindia.gov.in are unaffected, so this is a per-site
            block, not a general NIC restriction). This product is used
            from India, so a human running this from home reaches it
            fine (confirmed: 3.6s fetch). See manifest.json's
            FAQ_SIR2026.pdf.check_note for the full writeup.
  manual / none - never auto-checked; a human periodically re-verifies by
            hand (unchanged from before this script existed).

Per-document status, written to freshness.json:
  ok          - live hash matches the committed copy. lastChecked updates.
  changed     - live hash differs, from a genuine PDF fetch (content-type
                or magic-byte checked — a maintenance page served with
                HTTP 200 is 'unreachable', not 'changed'). Degrade rules
                citing this document until a human re-verifies and
                updates manifest.json's committed hash. Sticky: the
                first-detected changedOn date is preserved across runs
                rather than rolling forward every day it stays unfixed.
  unreachable - fetch failed after retries, or the response wasn't a
                genuine PDF. NEVER treated as 'changed' and NEVER written
                over a document's last-known ok/changed status —
                government sites go down for hours routinely, and a
                transient outage flipping a citizen-facing banner would
                be worse than saying nothing. The previous entry (if any)
                is carried forward unchanged; 'unreachable' only affects
                this script's own exit code, surfacing to whichever human
                is watching CI (email/notification), not to citizens.

Exit code 0 = every document checked this run is 'ok'.
Exit code 1 = at least one document checked this run is 'changed' or
              could not be reached — investigate; nothing in the deployed
              app degrades on 'unreachable' by itself.

Run from the sources/ directory:  python check_freshness.py
Set NEXTMOVE_CI=1 to skip 'local'-mode documents (the scheduled GitHub
Actions workflow sets this; leave it unset for a normal human-run check).
"""
import hashlib
import json
import os
import sys
import time
import urllib.request

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
}

RETRIES = 3
RETRY_DELAY_SECONDS = 5
REQUEST_TIMEOUT_SECONDS = 60


def fetch(url: str) -> bytes:
    """Fetch url, retrying transient failures. Raises on final failure, or
    if the response is reachable but plainly isn't a PDF (a maintenance
    page served with HTTP 200 must not be hashed and mistaken for a real
    content change)."""
    last_error = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as r:
                content_type = r.headers.get("Content-Type", "")
                body = r.read()
            if "pdf" not in content_type.lower() and not body.startswith(b"%PDF"):
                raise ValueError(
                    f"response is not a PDF (content-type={content_type!r}, "
                    f"first bytes={body[:16]!r})"
                )
            return body
        except Exception as e:  # noqa: BLE001 - retry, then let the caller report it
            last_error = e
            if attempt < RETRIES:
                time.sleep(RETRY_DELAY_SECONDS)
    assert last_error is not None
    raise last_error


def today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def main() -> int:
    with open("manifest.json", encoding="utf-8") as f:
        manifest = json.load(f)

    previous: dict = {}
    if os.path.exists("freshness.json"):
        with open("freshness.json", encoding="utf-8") as f:
            previous = json.load(f).get("documents", {})

    ci = os.environ.get("NEXTMOVE_CI") == "1"
    checked_from = "ci" if ci else "local"

    documents: dict = {}
    needs_attention = 0

    for name, doc in manifest["documents"].items():
        mode = doc.get("check", "manual")
        if mode not in ("auto", "local"):
            print(f"SKIP     {name}  (check={mode})")
            continue
        if mode == "local" and ci:
            print(f"SKIP     {name}  (check=local, running in CI - carrying forward last-known status)")
            if name in previous:
                documents[name] = previous[name]
            continue

        try:
            live = fetch(doc["url"])
        except Exception as e:  # noqa: BLE001 - report and continue
            needs_attention += 1
            print(f"UNREACHABLE  {name}  ({e}) - leaving last-known status unchanged")
            if name in previous:
                documents[name] = previous[name]
            continue

        live_hash = hashlib.sha256(live).hexdigest()
        if live_hash == doc["sha256"]:
            print(f"OK       {name}")
            documents[name] = {
                "status": "ok",
                "lastChecked": now_iso(),
                "checkedFrom": checked_from,
            }
        else:
            needs_attention += 1
            affected = [rid for rid, r in manifest["rules"].items()
                        if r["file"] == name]
            # Sticky: keep the first-detected changedOn instead of rolling
            # it forward every day this stays unfixed.
            changed_on = previous.get(name, {}).get("changedOn") or today()
            print(f"CHANGED  {name}")
            print(f"         live sha256 {live_hash[:16]}… != committed {doc['sha256'][:16]}…")
            print(f"         degrade + re-verify these rules: {', '.join(affected) or '(none cite it directly)'}")
            documents[name] = {
                "status": "changed",
                "lastChecked": now_iso(),
                "checkedFrom": checked_from,
                "changedOn": changed_on,
                "liveSha256": live_hash,
            }

    with open("freshness.json", "w", encoding="utf-8") as f:
        json.dump({"checkedAt": now_iso(), "documents": documents}, f, indent=2)
        f.write("\n")

    if needs_attention:
        print(f"\n{needs_attention} source(s) need attention. Only 'changed' degrades the "
              "live app; 'unreachable' is a transient-fetch signal for a human to check, "
              "and never overwrites a document's last-known status. Adopt changes only "
              "after human re-verification updates manifest.json.")
        return 1
    print("\nAll checked-this-run sources match their committed copies.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
