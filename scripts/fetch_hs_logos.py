#!/usr/bin/env python3
"""
fetch_hs_logos.py
-----------------
Finds a logo for every bracket high school that has none in S3 and saves it
as a transparent PNG at schools/{hsid}.png.

How a school is matched (no guessing from search results):
  MaxPreps publishes a sitemap of every school page, and each page's address
  is built from the school's state, city, name and mascot:
      https://www.maxpreps.com/ca/la-verne/damien-spartans/
  Our CSV has all four (hsid, hsname.1, nickname, "City,ST"), so each school is
  scored against the pages in its own state and city. The school's page then
  names its own logo (image.maxpreps.io/school-mascot/.../{schoolId}.gif),
  which is downloaded at 1024px.

Processing: logos without real transparency get the same border flood fill as
scripts/process-team-logo-cutouts-s3.py (it never erases enclosed details
like a mascot's teeth), then are trimmed, centered on a square transparent
canvas and capped at 1024px.

Modes (--mode):
  dry_run  match and download, write nothing to S3 (default)
  stage    every logo found -> schools-candidates/{hsid}.png
  publish  confident matches -> schools/{hsid}.png, the rest -> schools-candidates/
Never overwrites an existing schools/{hsid}.png.

Outputs (also uploaded as a workflow artifact):
  logo_report.csv    one row per school: status, score, matched page, logo url
  logo_review.html   contact sheet of every logo found, to spot-check matches
                     (uploaded to schools-candidates/index.html unless dry_run)
"""

import argparse
import base64
import csv
import html
import importlib.util
import io
import logging
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import boto3
import requests
from PIL import Image

log = logging.getLogger("logos")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s",
                    handlers=[logging.FileHandler("fetch_logos.log"), logging.StreamHandler(sys.stdout)])

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
DELAY = 1.0
MP = "https://www.maxpreps.com"
SITEMAPS = [f"{MP}/Schools-1-Sitemap.xml", f"{MP}/Schools-2-Sitemap.xml"]
CONFIDENT = 85  # score at or above this, 15+ clear of the runner-up, publishes


# ── Schools ──────────────────────────────────────────────────────────────────

def load_schools(path: Path) -> list[dict]:
    out = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            hsid = (row.get("hsid") or "").strip()
            if not hsid.isdigit():
                continue
            city, _, state = (row.get("city") or "").strip().rpartition(",")
            out.append({"hsid": hsid, "name": (row.get("hsname.1") or "").strip(),
                        "nickname": (row.get("nickname") or "").strip(),
                        "city": city.strip(), "state": state.strip().upper()})
    return out


def existing_hsids(s3, bucket: str, prefix: str) -> set[str]:
    have = set()
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            name = obj["Key"][len(prefix):]
            if "/" not in name and name.endswith(".png"):
                have.add(name[:-4])
    return have


# ── Matching against the MaxPreps sitemap ────────────────────────────────────

def slug(s: str) -> str:
    s = s.lower().replace("&", " and ").replace("'", "").replace(".", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


STOP = {"high", "school", "hs", "the", "senior", "of"}


SAME = {"st": "saint", "mt": "mount", "ft": "fort"}


def tokens(s: str) -> set[str]:
    return {SAME.get(t, t) for t in slug(s).split("-") if t and t not in STOP}


def load_sitemap() -> dict[str, list[tuple[str, str, str]]]:
    """state -> [(city_slug, school_slug, url)]"""
    by_state: dict[str, list] = {}
    n = 0
    for url in SITEMAPS:
        r = SESSION.get(url, timeout=60)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        for loc in root.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
            m = re.match(r"https://www\.maxpreps\.com/([a-z]{2})/([^/]+)/([^/]+)/?$", (loc.text or "").strip())
            if not m:
                continue
            by_state.setdefault(m.group(1).upper(), []).append((m.group(2), m.group(3), loc.text.strip()))
            n += 1
        time.sleep(DELAY)
    log.info(f"MaxPreps sitemap: {n} school pages in {len(by_state)} states")
    return by_state


def score(school: dict, city_slug: str, school_slug: str) -> int:
    name_s, nick_s = slug(school["name"]), slug(school["nickname"])
    if nick_s and school_slug == f"{name_s}-{nick_s}":
        base = 100
    else:
        # MaxPreps ends the address with the mascot; peel it off first, matching
        # without hyphens so "Seahawks" finds sea-hawks.
        parts, rest, nick_ok = school_slug.split("-"), school_slug, False
        for k in range(1, min(4, len(parts) - 1) + 1):
            if nick_s and "".join(parts[-k:]) == nick_s.replace("-", ""):
                rest, nick_ok = "-".join(parts[:-k]), True
                break
        nt, rt = tokens(school["name"]), tokens(rest)
        # Either name may be the longer one ("Archbishop Moeller" vs moeller-crusaders).
        cover = len(nt & rt) / min(len(nt), len(rt) or 1) if nt else 0
        base = round(60 * cover + (30 if nick_ok else 0) - 5 * len(rt - nt))
    return base + (0 if city_slug == slug(school["city"]) else -10)


def match(school: dict, by_state: dict) -> tuple[int, int, str]:
    """(best score, runner-up score, page url)"""
    ranked = sorted(((score(school, c, s), u) for c, s, u in by_state.get(school["state"], [])), reverse=True)
    if not ranked:
        return 0, 0, ""
    return ranked[0][0], ranked[1][0] if len(ranked) > 1 else 0, ranked[0][1]


# ── The school's own logo from its page ──────────────────────────────────────

def logo_url_from_page(page_url: str) -> tuple[str, str]:
    """(logo url, the page's own "City / Mascot" for the report)"""
    r = SESSION.get(page_url, timeout=30)
    r.raise_for_status()
    h = r.text
    sid = re.search(r'"schoolContext":\{"schoolId":"([0-9a-f-]{36})"', h)
    if not sid:
        return "", ""
    guid = sid.group(1)
    m = re.search(r"https://image\.maxpreps\.io/school-mascot/[0-9a-f]/[0-9a-f]/[0-9a-f]/"
                  + re.escape(guid) + r"\.(\w+)\?version=(\d+)", h)
    info = re.search(r'"city":"([^"]*)","zip":"[^"]*","zipCode":"[^"]*","mascot":"([^"]*)"', h)
    seen = f"{info.group(1)} / {info.group(2)}" if info else ""
    if not m:
        return "", seen
    a, b, c = guid[0], guid[1], guid[2]
    return (f"https://image.maxpreps.io/school-mascot/{a}/{b}/{c}/{guid}.{m.group(1)}"
            f"?version={m.group(2)}&width=1024&height=1024"), seen


# ── Image processing ─────────────────────────────────────────────────────────

def _cutout_module():
    spec = importlib.util.spec_from_file_location(
        "cutouts", Path(__file__).with_name("process-team-logo-cutouts-s3.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CUTOUT = None


def make_png(raw: bytes) -> bytes | None:
    global CUTOUT
    im = Image.open(io.BytesIO(raw))
    im.seek(0)
    im = im.convert("RGBA")
    if min(im.size) < 48:
        return None
    a = im.getchannel("A")
    w, h = im.size
    edge = [a.getpixel((x, 0)) for x in range(w)] + [a.getpixel((x, h - 1)) for x in range(w)]
    if sum(v < 10 for v in edge) / len(edge) < 0.5:  # no real transparency: cut the background out
        CUTOUT = CUTOUT or _cutout_module()
        im = Image.open(io.BytesIO(CUTOUT.process_image_bytes(raw, 30.0))).convert("RGBA")
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not box:
        return None
    im = im.crop(box)
    side = round(max(im.size) * 1.04)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    if side > 1024:
        canvas = canvas.resize((1024, 1024), Image.LANCZOS)
    buf = io.BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def thumb(png: bytes) -> str:
    im = Image.open(io.BytesIO(png))
    im.thumbnail((140, 140))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ── Report ───────────────────────────────────────────────────────────────────

def write_review(rows: list[dict], thumbs: dict[str, str], path: Path):
    cards = []
    for r in rows:
        if r["hsid"] not in thumbs:
            continue
        cards.append(
            f'<figure class="{r["status"]}"><img src="data:image/png;base64,{thumbs[r["hsid"]]}">'
            f'<figcaption><b>{html.escape(r["name"])}</b> {html.escape(r["nickname"])}<br>'
            f'{html.escape(r["city"])}, {r["state"]} · #{r["hsid"]}<br>'
            f'<a href="{html.escape(r["page"])}">{html.escape(r["page_seen"] or "MaxPreps page")}</a><br>'
            f'{r["status"]} · score {r["score"]}</figcaption></figure>')
    path.write_text(
        "<!doctype html><meta charset=utf-8><title>School logo review</title><style>"
        "body{font:13px system-ui;background:#f4f4f4;margin:16px}"
        "main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}"
        "figure{margin:0;background:#fff;border-radius:8px;padding:8px;border:2px solid #ddd}"
        "figure.staged,figure.would_stage{border-color:#e0a400}"
        "img{width:140px;height:140px;object-fit:contain;display:block;margin:auto;"
        "background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px}"
        "figcaption{margin-top:6px;line-height:1.35}</style>"
        f"<h1>School logos found: {len(cards)}</h1><p>Gold border = staged for review (less certain match).</p>"
        f"<main>{''.join(cards)}</main>", encoding="utf-8")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", default="data/hsid_for_Claude.csv")
    p.add_argument("--bucket", default="yatstats-assets")
    p.add_argument("--prefix", default="schools/")
    p.add_argument("--stage-prefix", default="schools-candidates/")
    p.add_argument("--region", default="us-west-2")
    p.add_argument("--mode", choices=["dry_run", "stage", "publish"], default="dry_run")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--hsids", default="", help="comma-separated hsids to run (default: all missing)")
    args = p.parse_args()

    s3 = boto3.client("s3", region_name=args.region)
    schools = load_schools(Path(args.csv))
    have = existing_hsids(s3, args.bucket, args.prefix)
    todo = [s for s in schools if s["hsid"] not in have]
    if args.hsids:
        want = {h.strip() for h in args.hsids.split(",") if h.strip()}
        todo = [s for s in todo if s["hsid"] in want]
    if args.limit > 0:
        todo = todo[: args.limit]
    log.info(f"{len(schools)} schools, {len(have)} already have a logo, {len(todo)} to find · mode {args.mode}")

    by_state = load_sitemap()
    rows, thumbs = [], {}
    for i, s in enumerate(todo, 1):
        best, second, page = match(s, by_state)
        row = {**s, "score": best, "runner_up": second, "page": page, "page_seen": "",
               "logo_url": "", "status": "no_match", "key": ""}
        try:
            if page and best >= 50:
                time.sleep(DELAY)
                row["logo_url"], row["page_seen"] = logo_url_from_page(page)
                if not row["logo_url"]:
                    row["status"] = "no_logo_on_page"
                else:
                    time.sleep(DELAY / 2)
                    img = SESSION.get(row["logo_url"], timeout=30)
                    img.raise_for_status()
                    png = make_png(img.content)
                    if not png:
                        row["status"] = "bad_image"
                    else:
                        thumbs[s["hsid"]] = thumb(png)
                        sure = best >= CONFIDENT and best - second >= 15
                        dest = args.prefix if (args.mode == "publish" and sure) else args.stage_prefix
                        row["key"] = f"{dest}{s['hsid']}.png"
                        if args.mode == "dry_run":
                            row["status"] = "would_publish" if sure else "would_stage"
                        else:
                            s3.put_object(Bucket=args.bucket, Key=row["key"], Body=png,
                                          ContentType="image/png", CacheControl="public, max-age=86400")
                            row["status"] = "published" if dest == args.prefix else "staged"
        except Exception as e:  # one school's failure never stops the run
            row["status"] = f"error: {type(e).__name__}"
        rows.append(row)
        log.info(f"RESULT\t{s['hsid']}\t{row['status']}\t{best}/{second}\t{s['name']} {s['nickname']} "
                 f"({s['city']}, {s['state']})\t{page}\t{row['page_seen']}")
        if i % 50 == 0:
            log.info(f"... {i}/{len(todo)}")

    with open("logo_report.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["hsid"])
        w.writeheader()
        w.writerows(rows)
    write_review(rows, thumbs, Path("logo_review.html"))
    if args.mode != "dry_run" and thumbs:
        s3.upload_file("logo_review.html", args.bucket, f"{args.stage_prefix}index.html",
                       ExtraArgs={"ContentType": "text/html"})
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    log.info("SUMMARY " + "  ".join(f"{k}={v}" for k, v in sorted(counts.items())))


if __name__ == "__main__":
    main()
