#!/usr/bin/env python3
"""One-click production-target logo manifest. Include staged files for publication.

This only plans work; it never writes to S3.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import boto3
from fetch_hs_logos_expanded import load_schools, existing_hsids
from plan_hs_logo_batches import build_plan


def main():
    schools = load_schools()
    s3 = boto3.client("s3", region_name="us-west-2")
    live = existing_hsids(s3, "yatstats-assets", "schools/")
    staged = existing_hsids(s3, "yatstats-assets", "schools-candidates/")
    # Include pre-staged candidates: they must be validated/published too.
    plan = build_plan(schools, live, set(), 100)
    plan["already_staged_for_verification"] = sum(
        str(s["hsid"]) in staged and str(s["hsid"]) not in live for s in schools
    )
    Path("bulk_logo_plan.json").write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    matrix = json.dumps({"include": [
        {"batch": b["batch"], "hsids": b["hsids"]}
        for b in plan["batches"]
    ]}, separators=(",", ":"))
    if len(matrix.encode("utf-8")) > 750000:
        raise ValueError("GitHub Actions matrix output size too large")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as f:
            f.write(f"matrix={matrix}\n")
            f.write(f"batch_count={plan['batch_count']}\n")
            f.write(f"remaining={plan['remaining']}\n")
    print(
        "PRODUCTION LOGO PLAN canonical=%d live=%d staged_to_verify=%d remaining=%d batches=%d" % (
            plan["total_canonical"], plan["live_existing"],
            plan["already_staged_for_verification"], plan["remaining"],
            plan["batch_count"]
        )
    )


if __name__ == "__main__":
    main()
