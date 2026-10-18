#!/usr/bin/env python3
"""Prepare one stable, resumable GitHub Actions matrix for all missing HS logos.

One manual bulk dispatch partitions the canonical Neon HSIDs into <=100-school
jobs. Existing live and staged objects are excluded; published keys are never
modified. The output is a compact dynamic matrix suitable for a single Actions
workflow with at most two concurrent workers.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from pathlib import Path

DEFAULT_BUCKET = "yatstats-assets"
LIVE_PREFIX = "schools/"
STAGE_PREFIX = "schools-candidates/"


def build_plan(schools: list[dict], live_ids: set[str], staged_ids: set[str],
               batch_size: int = 100) -> dict:
    if not 1 <= batch_size <= 100:
        raise ValueError("batch_size must be 1..100")
    by_hsid: dict[str, dict] = {}
    for row in schools:
        hsid = str(row.get("hsid") or "")
        if not hsid.isdecimal() or int(hsid) < 1:
            raise ValueError(f"Invalid canonical HSID: {hsid!r}")
        if hsid in by_hsid:
            raise ValueError(f"Duplicate HSID from canonical Neon data: {hsid}")
        if not row.get("name") or not row.get("state"):
            raise ValueError(f"Incomplete canonical school identity: {hsid}")
        by_hsid[hsid] = row
    ordered = sorted(by_hsid.keys(), key=int)
    targets = [hsid for hsid in ordered if hsid not in live_ids and hsid not in staged_ids]
    batches = []
    for i in range(0, len(targets), batch_size):
        ids = targets[i:i + batch_size]
        batches.append({
            "batch": f"{len(batches)+1:04d}",
            "hsids": ",".join(ids),
            "size": len(ids),
            "first_hsid": ids[0],
            "last_hsid": ids[-1],
        })
    if len(batches) > 256:
        raise ValueError("GitHub Actions accepts no more than 256 matrix entries")
    return {
        "source": "Neon player_hsids joined to tbc_schools_raw by canonical HSID",
        "total_canonical": len(ordered),
        "live_existing": sum(h in live_ids for h in ordered),
        "already_staged": sum(h not in live_ids and h in staged_ids for h in ordered),
        "remaining": len(targets),
        "batch_size": batch_size,
        "batch_count": len(batches),
        "batches": batches,
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Generate dynamic safe HS logo staging batches")
    p.add_argument("--batch-size", type=int, default=100)
    p.add_argument("--bucket", default=DEFAULT_BUCKET)
    p.add_argument("--output", default="bulk_logo_plan.json")
    args = p.parse_args()
    import boto3
    from fetch_hs_logos_expanded import load_schools, existing_hsids

    schools = load_schools()
    s3 = boto3.client("s3", region_name="us-west-2")
    live = existing_hsids(s3, args.bucket, LIVE_PREFIX)
    staged = existing_hsids(s3, args.bucket, STAGE_PREFIX)
    plan = build_plan(schools, live, staged, args.batch_size)
    Path(args.output).write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")

    # Compact output (typically 40-60KB) is safely below the GitHub Actions
    # 1MB job output maximum. Batch membership is snapshotted only once.
    matrix = json.dumps({"include": [
        {"batch": batch["batch"], "hsids": batch["hsids"]}
        for batch in plan["batches"]
    ]}, separators=(",", ":"))
    if len(matrix.encode("utf-8")) > 750_000:
        raise ValueError("Matrix exceeds safe GitHub Actions job output size")
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as output:
            output.write(f"matrix={matrix}\n")
            output.write(f"batch_count={plan['batch_count']}\n")
            output.write(f"remaining={plan['remaining']}\n")
            output.write(f"existing={plan['live_existing']}\n")
            output.write(f"staged={plan['already_staged']}\n")
    print(f"BULK PLAN canonical={plan['total_canonical']}, live={plan['live_existing']}, "
          f"already_staged={plan['already_staged']}, remaining={plan['remaining']}, "
          f"jobs={plan['batch_count']} x at most {plan['batch_size']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
