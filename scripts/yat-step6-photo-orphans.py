#!/usr/bin/env python3
"""Read-only list of player photo files no flip card shows (Pete, Nov 19 2026).

Lists every file under players/ in the photo bucket and sorts it:
  shown          - named by a YAT ID that has a flip card (the site reads it)
  old_name_copy  - an old card-number file whose YAT ID copy exists (counted,
                   not listed: the copy is what the site shows)
  not_shown_*    - listed one by one with a link, so Pete can look:
      no_player_in_name  - the file name carries no player id
      no_yat_id          - the number belongs to no YAT ID
      yat_without_card   - a YAT ID with no flip card
      old_name_no_copy   - an old card-number file with no YAT ID copy
Nothing is copied, moved or deleted.
"""
import csv
import os
import re
from collections import Counter

import boto3
import psycopg

BUCKET = os.environ.get("YATSTATS_S3_BUCKET", "yatstats-assets")
BASE = f"https://{BUCKET}.s3.us-west-2.amazonaws.com/"
PLAYER = re.compile(r"^(YAT\d{6,}|\d+)(.*)$")


def split_key(key):
    parts = key.split("/")
    if len(parts) != 3 or parts[0] != "players" or not parts[2]:
        return None
    m = PLAYER.match(parts[2])
    if not m:
        return None
    rest = m.group(2)
    if rest and rest[0] not in "._":
        return None
    return parts[1], m.group(1), rest


def main():
    s3 = boto3.client("s3")
    objs = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix="players/"):
        objs += [o for o in page.get("Contents", []) if not o["Key"].endswith("/")]
    keys = {o["Key"] for o in objs}
    parsed = {o["Key"]: split_key(o["Key"]) for o in objs}
    ids = sorted({p[1] for p in parsed.values() if p})

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute("SET TRANSACTION READ ONLY")
        cur.execute("SELECT x, public.yat_id_for(x) FROM unnest(%s::text[]) x", (ids,))
        yat = dict(cur.fetchall())
        cur.execute("SELECT DISTINCT yatid FROM public.flip_card_front_stage WHERE yatid IS NOT NULL")
        carded = {r[0] for r in cur.fetchall()}
        cur.execute("""SELECT yatid, max(display_name), max(hsid::text) FROM public.flip_card_front_stage
                        WHERE yatid IS NOT NULL GROUP BY yatid""")
        names = {r[0]: (r[1] or "", r[2] or "") for r in cur.fetchall()}
        cur.execute("SELECT yatid, trim(concat_ws(' ', first_name, last_name)) FROM public.yat_registry")
        reg_names = dict(cur.fetchall())

    rows, counts = [], Counter()
    for o in objs:
        k = o["Key"]; p = parsed[k]
        if not p:
            cat, y = "no_player_in_name", ""
        else:
            folder, pid, rest = p
            y = yat.get(pid) or ""
            if not y:
                cat = "no_yat_id"
            elif y not in carded:
                cat = "yat_without_card"
            elif pid == y:
                cat = "shown"
            elif f"players/{folder}/{y}{rest}" in keys:
                cat = "old_name_copy"
            else:
                cat = "old_name_no_copy"
        counts[(k.split("/")[1], cat)] += 1
        if cat not in ("shown", "old_name_copy"):
            nm, hs = names.get(y, (reg_names.get(y, ""), ""))
            rows.append([cat, k, y, nm, hs, o["Size"], o["LastModified"].strftime("%Y-%m-%d"), BASE + k])

    rows.sort()
    with open("photos-not-shown.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["category", "key", "yatid", "name", "hsid", "bytes", "modified", "url"])
        w.writerows(rows)

    total = Counter()
    for (folder, cat), n in counts.items():
        total[cat] += n
    print("**Player photo files by category (read-only):** " + ", ".join(f"{c}: {n:,}" for c, n in sorted(total.items())))
    print(f"\n**Not shown by any flip card: {len(rows)} files**\n")
    print("ROWS-BEGIN")
    for r in rows:
        print("ROW\t" + "\t".join(str(x) for x in r))
    print("ROWS-END")


if __name__ == "__main__":
    main()
