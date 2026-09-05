#!/usr/bin/env python3
"""Source-freshness detector for NextMove (detect -> degrade -> human-verify model).

Re-downloads every manifest document marked check:"auto" and compares its
SHA-256 against the committed copy's hash recorded in manifest.json.

Exit code 0 = all checked sources unchanged.
Exit code 1 = at least one source CHANGED or could not be fetched.

A CHANGED source means: degrade the rules that cite it (see manifest "rules",
matched via the document's "title") until a human re-verifies and updates the
manifest — never auto-adopt the new content. The manifest update is the audit
trail.

Run from the sources/ directory:  python check_freshness.py
"""
import hashlib
import json
import sys
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (NextMove source-freshness check)"}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main() -> int:
    with open("manifest.json", encoding="utf-8") as f:
        manifest = json.load(f)

    failures = 0
    for name, doc in manifest["documents"].items():
        mode = doc.get("check", "manual")
        if mode != "auto":
            print(f"SKIP     {name}  (check={mode})")
            continue
        try:
            live = fetch(doc["url"])
        except Exception as e:  # noqa: BLE001 - report and continue
            failures += 1
            print(f"FETCH-FAILED  {name}  ({e}) — treat as CHANGED until confirmed")
            continue
        live_hash = hashlib.sha256(live).hexdigest()
        if live_hash == doc["sha256"]:
            print(f"OK       {name}")
        else:
            failures += 1
            affected = [rid for rid, r in manifest["rules"].items()
                        if r["file"] == name]
            print(f"CHANGED  {name}")
            print(f"         live sha256 {live_hash[:16]}… != committed {doc['sha256'][:16]}…")
            print(f"         degrade + re-verify these rules: {', '.join(affected) or '(none cite it directly)'}")

    if failures:
        print(f"\n{failures} source(s) need attention. Degrade affected rules; "
              "adopt changes only after human re-verification updates manifest.json.")
        return 1
    print("\nAll auto-checked sources match their committed copies.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
