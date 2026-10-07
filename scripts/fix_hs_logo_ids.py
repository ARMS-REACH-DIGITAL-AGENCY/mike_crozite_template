#!/usr/bin/env python3
"""
fix_hs_logo_ids.py
------------------
One-off repair. data/hsid_for_Claude.csv carried the wrong hsid for 168 of
the bracket schools (San Marcos, CA is 2490, the CSV said 2489; Perkiomen
Valley and Wachusett had each other's), so fetch_hs_logos.py saved those
logos under the wrong number. The real ids are the bracket's own
(public/bracket-lab/2026/index.json, from school_success).

For every logo fetch_hs_logos.py wrote (anything in schools/ modified on or
after --since; older files are the owner's and are never touched):
  - the school it was fetched for is found by name + city in the bracket
    list, and the logo is copied to schools/{real hsid}.png, unless that
    key holds one of the owner's older logos;
  - a logo left at a wrong number is deleted, so no school shows another
    school's logo.
Copies go through a temporary prefix first, so swapped pairs resolve.

  python scripts/fix_hs_logo_ids.py --since 2026-10-07T01:30:00Z [--apply]
Without --apply it only prints the plan.
"""

import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path

import boto3

BUCKET = "yatstats-assets"
PREFIX = "schools/"
TMP = "schools-idfix-tmp/"


def key(name: str, loc: str) -> str:
    return re.sub(r"[^a-z]", "", (name + loc).lower())


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--since", required=True)
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()
    since = datetime.fromisoformat(args.since.replace("Z", "+00:00"))

    index = json.load(open("public/bracket-lab/2026/index.json"))["schools"]
    real_by_name: dict[str, str] = {}
    for h, v in index.items():
        m = re.match(r"(.*) \((.*)\)$", v[0])
        real_by_name[key(m.group(1), m.group(2))] = str(h)
    real_of_csv: dict[str, str] = {}
    for r in csv.DictReader(open("data/hsid_for_Claude.csv", newline="", encoding="utf-8")):
        h = (r.get("hsid") or "").strip()
        if h.isdigit():
            real = real_by_name.get(key(r["hsname.1"].strip(), r["city"].strip()))
            if real:
                real_of_csv[h] = real

    s3 = boto3.client("s3", region_name="us-west-2")
    files: dict[str, datetime] = {}
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=PREFIX):
        for o in page.get("Contents", []):
            name = o["Key"][len(PREFIX):]
            if "/" not in name and name.endswith(".png"):
                files[name[:-4]] = o["LastModified"]
    mine = {h for h, t in files.items() if t >= since}
    owners = {h for h in files if h not in mine}
    print(f"{len(files)} logos in {PREFIX}: {len(owners)} the owner's, {len(mine)} written since {args.since}")

    # Where each logo written today belongs.
    copies: dict[str, str] = {}  # real hsid -> source key (written today)
    for h in sorted(mine, key=int):
        real = real_of_csv.get(h)
        if real is None or real == h:
            continue
        if real in owners:
            print(f"KEEP\t{real}\tthe owner's logo stays (today's copy came from {h})")
            continue
        copies[real] = h
    targets = set(copies)
    # Today's logos sitting at a number that isn't their school's and isn't
    # about to be overwritten with the right logo: remove.
    deletes = [h for h in sorted(mine, key=int)
               if real_of_csv.get(h, h) != h and h not in targets]

    for real, src in sorted(copies.items(), key=lambda kv: int(kv[0])):
        print(f"COPY\t{src} -> {real}\t{index[real][0]}")
    for h in deletes:
        print(f"DELETE\t{h}\t(fetched for real hsid {real_of_csv.get(h)})")
    print(f"PLAN copies={len(copies)} deletes={len(deletes)}")

    if not args.apply:
        return
    for real, src in copies.items():
        s3.copy_object(Bucket=BUCKET, Key=f"{TMP}{real}.png", CopySource={"Bucket": BUCKET, "Key": f"{PREFIX}{src}.png"})
    for real in copies:
        s3.copy_object(Bucket=BUCKET, Key=f"{PREFIX}{real}.png", CopySource={"Bucket": BUCKET, "Key": f"{TMP}{real}.png"},
                       ContentType="image/png", CacheControl="public, max-age=86400", MetadataDirective="REPLACE")
        s3.delete_object(Bucket=BUCKET, Key=f"{TMP}{real}.png")
    for h in deletes:
        s3.delete_object(Bucket=BUCKET, Key=f"{PREFIX}{h}.png")
    print("APPLIED")


if __name__ == "__main__":
    main()
