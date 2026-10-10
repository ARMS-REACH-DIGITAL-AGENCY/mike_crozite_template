#!/usr/bin/env python3
"""Read-only, rate-limited health checks of the full YATSTATS microsite inventory."""
import concurrent.futures
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

inventory = json.loads(Path("monitoring/microsites.json").read_text())
urls = inventory["urls"]
if len(urls) < 1000 or len(set(urls)) != len(urls):
    raise SystemExit("Invalid microsite inventory: expected >=1000 unique URLs")
workers = max(1, min(int(os.getenv("HEALTH_WORKERS", "3")), 5))
timeout = 18

def check(url):
    started = time.monotonic()
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "YATSTATS-health-monitor/1.0"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(200000).decode("utf-8", errors="replace").lower()
            status = response.status
        invalid = ("this school microsite doesn't exist yet" in body or
                   "no players found" in body or "application error" in body)
        return {"url": url, "ok": status == 200 and not invalid, "status": status,
                "ms": round((time.monotonic()-started)*1000), "reason": "error page" if invalid else ""}
    except Exception as exc:
        return {"url": url, "ok": False, "ms": round((time.monotonic()-started)*1000),
                "reason": type(exc).__name__ + ": " + str(exc)[:130]}

with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
    first = list(pool.map(check, urls))
failed = [x["url"] for x in first if not x["ok"]]
# Retry only failures; avoid amplifying transient errors.
time.sleep(5) if failed else None
with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
    retries = list(pool.map(check, failed))
by_url = {r["url"]: r for r in first}
by_url.update({r["url"]: r for r in retries})
results = [by_url[url] for url in urls]
bad = [r for r in results if not r["ok"]]
report = {"checked_at": datetime.now(timezone.utc).isoformat(),
          "inventory_count": len(urls), "healthy_count": len(urls)-len(bad),
          "unhealthy_count": len(bad), "unhealthy": bad,
          "p95_ms": sorted(x["ms"] for x in results)[int((len(results)-1)*0.95)]}
Path("site-health-report.json").write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps(report, indent=2))
raise SystemExit(1 if bad else 0)
