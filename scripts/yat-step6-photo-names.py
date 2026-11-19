#!/usr/bin/env python3
"""YAT key transition, step 6 (docs/yat-key-transition.md): photos to YAT-ID names.

Every stored player photo is named by the number of the card it belongs to
(players/<folder>/<number>[_<rest>].<ext>). Step 6 gives each one a copy named
by the person's YAT ID (players/<folder>/<YAT ID>[_<rest>].<ext>). The YAT ID
comes from public.yat_id_for(), the same lookup the database uses everywhere.

MODE=report (default): read-only. Lists the bucket, looks up every name, and
  writes a summary plus plan.csv (one line per file: old key, new key, status).
MODE=copy: copies ONLY the files of the players named in ONLY_IDS (old numbers
  or YAT IDs, comma-separated).
MODE=copy_all: copies every file with status "copy" (Pete's yes, Nov 18 2026).
In both copy modes a copy is never made over an existing file, and no
original is ever deleted or changed.
MODE=catch_up (hourly, until uploads and image jobs write YAT ID names):
  copy_all, plus "stale" files: a photo uploaded again under the old name
  after its YAT ID copy was made. Only then is the YAT ID file replaced, so a
  newer file under the YAT ID name is never written over.

Statuses:
  copy        - new name is free; will be copied
  already_yat - the file is already named by its YAT ID
  exists      - a file with the new name already exists (left alone; listed)
  stale       - exists, but the old-name file is newer (catch_up replaces it)
  clash       - two old numbers of the SAME person have a file with the same
                new name in the same folder; the file of the number his card
                is under now is copied (a PHOTO_NUMBER_FIXES file comes
                first), the other is left alone
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
# Photo files saved under a mistyped number (Pete, Nov 18 2026): the cropped
# HS photos without the old card frame. They become the player's YAT ID photo
# in place of the framed file under his card number (209894 / 224784), which
# stays in the bucket untouched.
PHOTO_NUMBER_FIXES = {
    "208894": "YAT100830",  # Austin Filiere, card 209894 (Hamilton 5004)
    "234784": "YAT110490",  # Kyle Hasler, card 224784 (Hamilton 5004)
}

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
    if MODE not in ("report", "copy", "copy_all", "catch_up"):
        sys.exit(f"MODE must be report, copy, copy_all or catch_up, not {MODE}")
    if MODE == "copy" and not ONLY:
        sys.exit("MODE=copy needs ONLY_IDS (a small sample); a full copy is a later, separate approval.")
    s3 = boto3.client("s3")
    keys, mtime = [], {}
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix="players/"):
        for o in page.get("Contents", []):
            if not o["Key"].endswith("/"):
                keys.append(o["Key"]); mtime[o["Key"]] = o["LastModified"]
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
    yat.update(PHOTO_NUMBER_FIXES)

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
    # Two old numbers of one person with a file of the same new name: the file
    # of the number his card is under now wins (Gary Legumina, YAT058185: card
    # 137905, Pete's newer upload; the old YAT000103 file stays as it is).
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute("SET TRANSACTION READ ONLY")
        cur.execute("SELECT DISTINCT playerid::text FROM public.flip_card_front_stage WHERE playerid::text = ANY(%s)", (ids,))
        on_card = {r[0] for r in cur.fetchall()}
    for r in rows:
        if r[2] == "copy":
            olds = targets[r[1]]
            if len(olds) > 1:
                winners = ([k for k in olds if parsed[k][1] in PHOTO_NUMBER_FIXES]
                           or [k for k in olds if parsed[k][1] in on_card])
                r[2] = "copy" if winners == [r[0]] else "clash"
            if r[2] == "copy" and r[1] in existing:
                r[2] = "stale" if mtime[r[0]] > mtime[r[1]] else "exists"

    with open("plan.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["old_key", "new_key", "status"]); w.writerows(rows)

    by = defaultdict(Counter)
    for k, new, st in rows:
        by[k.split("/")[1]][st] += 1
    cols = ["copy", "stale", "already_yat", "exists", "clash", "no_yat_id", "not_player"]
    print("| Folder | " + " | ".join(cols) + " |")
    print("|---|" + "---:|" * len(cols))
    tot = Counter()
    for folder in sorted(by):
        tot.update(by[folder])
        print(f"| `{folder}` | " + " | ".join(f"{by[folder][c]:,}" for c in cols) + " |")
    print("| **Total** | " + " | ".join(f"**{tot[c]:,}**" for c in cols) + " |")
    for st in ("stale", "clash", "exists", "no_yat_id"):
        sample = [r for r in rows if r[2] == st][:15]
        if sample:
            print(f"\n**{st}** (first {len(sample)}):\n")
            for r in sample:
                print(f"- `{r[0]}` -> `{r[1] or '-'}`")

    if MODE in ("copy", "copy_all", "catch_up"):
        want = set(ONLY) | {yat.get(i) for i in ONLY if yat.get(i)}
        todo = [(k, new) for k, new, st in rows if (st == "copy" or (st == "stale" and MODE == "catch_up")) and (
            MODE in ("copy_all", "catch_up") or parsed[k][1] in want or yat.get(parsed[k][1]) in want)]
        stale = {(k, new) for k, new, st in rows if st == "stale"}

        def copy_one(pair):
            old_key, new_key = pair
            if pair in stale:  # catch_up: the old-name file is newer; replace our older copy
                try:
                    s3.copy_object(Bucket=BUCKET, Key=new_key, CopySource={"Bucket": BUCKET, "Key": old_key},
                                   MetadataDirective="COPY")
                    return "replaced_stale"
                except ClientError as e:
                    return "error: " + str(e)
            try:  # never write over an existing file
                s3.head_object(Bucket=BUCKET, Key=new_key)
                return "skipped_exists"
            except ClientError as e:
                if e.response.get("Error", {}).get("Code") not in ("404", "NoSuchKey", "NotFound"):
                    return "error: " + str(e)
            try:
                s3.copy_object(Bucket=BUCKET, Key=new_key, CopySource={"Bucket": BUCKET, "Key": old_key},
                               MetadataDirective="COPY")
                return "copied"
            except ClientError as e:
                return "error: " + str(e)

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=16) as pool:
            results = list(pool.map(copy_one, todo))
        outcome = Counter(r if not r.startswith("error") else "error" for r in results)
        with open("copied.csv", "w", newline="") as f:
            w = csv.writer(f); w.writerow(["old_key", "new_key", "result"])
            w.writerows([a, b, r] for (a, b), r in zip(todo, results))
        print(f"\n**Copy ({MODE}), originals untouched:** " + ", ".join(f"{k}: {v:,}" for k, v in sorted(outcome.items())))
        for (a, b), r in zip(todo, results):
            if r.startswith("error"):
                print(f"- `{a}` -> `{b}`: {r}")
        if outcome.get("error"):
            sys.exit(1)

if __name__ == "__main__":
    main()
