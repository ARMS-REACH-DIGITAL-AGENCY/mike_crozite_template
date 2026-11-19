#!/usr/bin/env python3
"""YAT key transition, step 0b (docs/yat-key-transition.md, section 1.4).

Counts the stored photos in S3 (bucket yatstats-assets) per folder, before
step 6 renames them to YAT IDs. READ-ONLY: it only lists the bucket; it never
writes, copies or deletes a file.

Reads `aws s3 ls --recursive` lines on stdin ("date time size key") and prints
one Markdown table: per folder, the number of files, total size, and how the
files are named (by card/player number, by YAT ID, or something else), plus
how many different players each folder covers.
"""
import re
import sys
from collections import defaultdict

YAT = re.compile(r"^YAT\d{6}$", re.I)
NUM = re.compile(r"^\d+$")

def folder_of(key: str) -> str:
    parts = key.split("/")
    if parts[0] == "players" and len(parts) > 2:
        return "players/" + parts[1]
    return parts[0] if len(parts) > 1 else "(root)"

def player_part(key: str) -> str:
    """The player part of a file name: the first path piece after the folder,
    or the file name up to the first '.', '_' or '-'."""
    parts = key.split("/")
    rest = parts[2:] if parts[0] == "players" else parts[1:]
    if not rest:
        return ""
    if len(rest) > 1:
        return rest[0]
    return re.split(r"[._-]", rest[0], maxsplit=1)[0]

stats = defaultdict(lambda: {"files": 0, "bytes": 0, "num": 0, "yat": 0, "other": 0, "ids": set()})
for line in sys.stdin:
    m = re.match(r"^\S+\s+\S+\s+(\d+)\s+(.+)$", line.rstrip("\n"))
    if not m:
        continue
    size, key = int(m.group(1)), m.group(2)
    if key.endswith("/"):
        continue
    s = stats[folder_of(key)]
    s["files"] += 1
    s["bytes"] += size
    pid = player_part(key)
    if YAT.match(pid):
        s["yat"] += 1
        s["ids"].add(pid.upper())
    elif NUM.match(pid):
        s["num"] += 1
        s["ids"].add(pid)
    else:
        s["other"] += 1

print("| Folder | Files | Size (MB) | Named by number | Named by YAT ID | Other names | Players |")
print("|---|---:|---:|---:|---:|---:|---:|")
tot = {"files": 0, "bytes": 0, "num": 0, "yat": 0, "other": 0}
for f in sorted(stats):
    s = stats[f]
    for k in tot:
        tot[k] += s[k]
    print(f"| `{f}` | {s['files']:,} | {s['bytes']/1e6:,.1f} | {s['num']:,} | {s['yat']:,} | {s['other']:,} | {len(s['ids']):,} |")
print(f"| **Total** | {tot['files']:,} | {tot['bytes']/1e6:,.1f} | {tot['num']:,} | {tot['yat']:,} | {tot['other']:,} | |")
