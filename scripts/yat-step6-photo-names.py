#!/usr/bin/env python3
"""YAT key transition, step 6 (docs/yat-key-transition.md): photos to YAT-ID names.

Every stored player photo is named by the number of the card it belongs to
(players/<folder>/<number>[_<rest>].<ext>). Step 6 gives each one a copy named
by the person's YAT ID (players/<folder>/<YAT ID>[_<rest>].<ext>). The YAT ID
comes from public.yat_id_for(), the same lookup the database uses everywhere.

MODE=report (default): read-only. Lists the bucket, looks up every name, and
  writes a summary plus plan.csv (one line per file: old key, new key, status).
MODE=copy: copies ONLY the files of the players named in ONLY_IDS (old numbers
  or YAT IDs, comma-separated). A copy is never made over an existing file,
  and no original is ever deleted or changed.

Statuses:
  copy        - new name is free; will be copied
  already_yat - the file is already named by its YAT ID
  exists      - a file with the new name already exists (left alone; listed)
  clash       - two old numbers of the SAME person have a file with the same
                new name in the same folder (left alone; Pete decides)
  no_yat_id   - the number has no YAT ID (left alone; listed)
  not_player  - the file name has no player part (left alone)
"""
import csv
import os
import re
import sys
from collections import Counter, defaultdict

import boto3
from botocore.exceptions import ClientError
import psycopg

BUCKET = os.environ.get("YATSTATS_S3_BUCKET", "yatstats-assets")
MODE = os.environ.get("MODE", "report")
ONLY = {x.strip() for x in os.environ.get("ONLY_IDS", "").split(",") if x.strip()}
PLAYER = re.compile(r"^(YAT\d{6,}|\d+)(.*)$")

def split_key(key):
    """players/<folder>/<id><rest> -> (folder, id, rest) or None."""
    parts = key.split("/")
    if len(parts) != 3 or parts[0] != "players" or not parts[2]:
        return None
    m = PLAYER.match(parts[2])
    if not m:
        return None
    rest = m.group(2)
    if rest and rest[0] not in "._":
        return None  # e.g. 12345abc.jpg: not a clean player name
    return parts[1], m.group(1), rest

def main():
    if MODE not in ("report", "copy"):
        sys.exit(f"MODE must be report or copy, not {MODE}")
    if MODE == "copy" and not ONLY:
        sys.exit("MODE=copy needs ONLY_IDS (a small sample); a full copy is a later, separate approval.")
    s3 = boto3.client("s3")
    keys = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix="players/"):
        keys += [o["Key"] for o in page.get("Contents", []) if not o["Key"].endswith("/")]
    existing = set(keys)
    parsed = {k: split_key(k) for k in keys}
    ids = sorted({p[1] for p in parsed.values() if p})

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute("SET TRANSACTION READ ONLY")
        cur.execute("""
          WITH n(id) AS (SELECT unnest(%s::text[]))
          SELECT n.id,
                 CASE WHEN EXISTS (SELECT 1 FROM public.yat_registry r WHERE r.yatid = n.id) THEN n.id
                      ELSE (SELECT ids.yatid FROM public.yat_registry_ids ids
                             WHERE ids.source IN ('tbc','yat_card','yat_legacy') AND ids.source_id = n.id
                             ORDER BY ids.source = 'tbc' DESC LIMIT 1) END
            FROM n""", (ids,))
        yat = dict(cur.fetchall())

    targets = defaultdict(set)  # new key -> old keys
    rows = []
    for k in keys:
        p = parsed[k]
        if not p:
            rows.append([k, "", "not_player"]); continue
        folder, pid, rest = p
        y = yat.get(pid)
        if not y:
            rows.append([k, "", "no_yat_id"]); continue
        new = f"players/{folder}/{y}{rest}"
        if new == k:
            rows.append([k, new, "already_yat"]); continue
        targets[new].add(k)
        rows.append([k, new, "copy"])
    for r in rows:
        if r[2] == "copy":
            if len(targets[r[1]]) > 1:
                r[2] = "clash"
            elif r[1] in existing:
                r[2] = "exists"

    with open("plan.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["old_key", "new_key", "status"]); w.writerows(rows)

    by = defaultdict(Counter)
    for k, new, st in rows:
        by[k.split("/")[1]][st] += 1
    cols = ["copy", "already_yat", "exists", "clash", "no_yat_id", "not_player"]
    print("| Folder | " + " | ".join(cols) + " |")
    print("|---|" + "---:|" * len(cols))
    tot = Counter()
    for folder in sorted(by):
        tot.update(by[folder])
        print(f"| `{folder}` | " + " | ".join(f"{by[folder][c]:,}" for c in cols) + " |")
    print("| **Total** | " + " | ".join(f"**{tot[c]:,}**" for c in cols) + " |")
    for st in ("clash", "exists", "no_yat_id"):
        sample = [r for r in rows if r[2] == st][:15]
        if sample:
            print(f"\n**{st}** (first {len(sample)}):\n")
            for r in sample:
                print(f"- `{r[0]}` -> `{r[1] or '-'}`")

    if MODE == "copy":
        want = {i for i in ONLY} | {yat.get(i) for i in ONLY if yat.get(i)}
        done = 0
        print("\n**Copies made (originals untouched):**\n")
        for k, new, st in rows:
            p = parsed[k]
            if st != "copy" or not p or (p[1] not in want and yat.get(p[1]) not in want):
                continue
            try:  # never write over an existing file
                s3.head_object(Bucket=BUCKET, Key=new); continue
            except ClientError:
                pass
            s3.copy_object(Bucket=BUCKET, Key=new, CopySource={"Bucket": BUCKET, "Key": k},
                           MetadataDirective="COPY")
            done += 1
            print(f"- `{k}` -> `{new}`")
        print(f"\n{done} files copied.")

if __name__ == "__main__":
    main()
