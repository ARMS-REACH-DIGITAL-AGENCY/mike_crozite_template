#!/usr/bin/env python3
"""Read-only production smoke checks. No database credentials or writes."""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

SITES = {
    "Basha": ("https://basha.az.yatstats.com", "BASHA"),
    "Hamilton": ("https://hamilton.az.yatstats.com", "HAMILTON"),
    "Perry": ("https://perry.az.yatstats.com", "PERRY"),
}
TIMEOUT = 25
results = []
for name, (url, marker) in SITES.items():
    attempts = []
    for attempt in range(2):
        started = time.monotonic()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "YATSTATS-health-monitor/1.0", "Cache-Control": "no-cache"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                body = response.read(1500000).decode("utf-8", errors="replace")
                status = response.status
            elapsed = round((time.monotonic() - started) * 1000)
            lower = body.lower()
            error_page = "this school microsite doesn't exist yet" in lower or "no players found" in lower
            ok = status == 200 and marker.lower() in lower and not error_page
            attempts.append({"status": status, "duration_ms": elapsed, "ok": ok, "reason": "ok" if ok else "missing school marker, empty roster, or error page"})
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            attempts.append({"ok": False, "reason": type(exc).__name__ + ": " + str(exc)[:180]})
        if attempts[-1]["ok"]:
            break
        if attempt == 0:
            time.sleep(5)
    results.append({"school": name, "url": url, "healthy": attempts[-1]["ok"], "attempts": attempts})

report = {"checked_at": datetime.now(timezone.utc).isoformat(), "healthy": all(r["healthy"] for r in results), "results": results}
print(json.dumps(report, indent=2))
output = os.environ.get("GITHUB_OUTPUT")
if output:
    with open(output, "a", encoding="utf-8") as fh:
        fh.write("healthy=" + str(report["healthy"]).lower() + "\n")
        fh.write("report=" + json.dumps(report, separators=(",", ":")) + "\n")
raise SystemExit(0 if report["healthy"] else 1)
