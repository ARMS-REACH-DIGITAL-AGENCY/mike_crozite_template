#!/usr/bin/env python3
"""Build display-ready WebP versions of the player cutouts on S3.

The career timeline's anchor slide shows three cutouts per player. The
cutout PNGs keep each source photo's full canvas and size (2-6MB, up to
~2000x2800), so the site used to trim, fade and shrink them on the fly
in src/app/api/cutout/route.ts -- 1-2s the first time any player was
viewed. This job does the same work ahead of time and stores the result
next to the cutouts, so the page loads a finished ~30-100KB file:

- players/then-cutouts/{id}.png -> players/then-web/{id}.webp
- players/back-cutouts/{id}.png -> players/back-web/{id}.webp
- players/now-cutouts/{id}.png  -> players/now-web/{id}.webp

It also makes card-size copies of the original photos for the school
gallery's flip cards (drawn 264px wide; the originals average 1.4MB):

- players/then/{id}.jpg -> players/then-card/{id}.webp  (flip-card front, 800px wide)
- players/back/{id}.jpg -> players/back-card/{id}.webp  (flip-card back, 800px wide)
- players/now/{id}.jpg  -> players/now-thumb/{id}.webp  (gallery strip headshot, 400px wide)

Cutout processing mirrors api/cutout/route.ts (keep the two in step):
1. Downscale to fit 2000x2000.
2. back only, when the image is at least twice as wide as tall: fade
   the left side out (alpha 0 at 12% of the width to 1 at 42%,
   smoothstep then ^1.5).
3. Trim the transparent border (alpha <= 10) on all four sides.
4. Fit within 1400x1000, save WebP (quality 82, alpha quality 90).

Photo processing: apply the EXIF rotation (browsers honor it on the
original JPG; a re-encoded copy has to bake it in), shrink to the target
width (never enlarge), save WebP quality 80. Aspect ratio is kept, so
the card's centered "cover" crop is unchanged.

A web file is rebuilt whenever its cutout is newer than it, so a
replaced cutout (same key) gets a fresh web version on the next run.
Web files are uploaded with a one-day cache, not "immutable", so a
rebuilt one reaches browsers.

Environment variables:
- YATSTATS_S3_BUCKET: default yatstats-assets
- AWS_REGION / AWS_DEFAULT_REGION: default us-west-2
- KINDS: comma-separated subset of then,back,now,then-card,back-card,now-thumb
  (default all six)
- DRY_RUN: true/false, default true
- OVERWRITE: true/false, default false (rebuild even when up to date)
- MAX_FILES: optional integer limit per kind, for testing
- ONLY_IDS: optional comma-separated player ids to process
"""

from __future__ import annotations

import io
import os
import sys

from PIL import Image, ImageChops, ImageOps

BUCKET = os.getenv("YATSTATS_S3_BUCKET", "yatstats-assets")
AWS_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-west-2"
ALL_KINDS = "then,back,now,then-card,back-card,now-thumb"
KINDS = [k.strip() for k in os.getenv("KINDS", ALL_KINDS).split(",") if k.strip()]
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"
OVERWRITE = os.getenv("OVERWRITE", "false").lower() == "true"
MAX_FILES_RAW = os.getenv("MAX_FILES", "").strip()
MAX_FILES = int(MAX_FILES_RAW) if MAX_FILES_RAW.isdigit() else None
ONLY_IDS = {i.strip() for i in os.getenv("ONLY_IDS", "").split(",") if i.strip()}

WORK_MAX = 2000
OUT_MAX_W = 1400
OUT_MAX_H = 1000
TRIM_ALPHA = 10
CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800"


def fade_alpha_row(width: int) -> list[int]:
    row = []
    for x in range(width):
        t = min(1.0, max(0.0, (x / width - 0.12) / 0.3))
        a = (t * t * (3 - 2 * t)) ** 1.5
        row.append(round(a * 255))
    return row


def build_web_image(kind: str, png_bytes: bytes) -> bytes:
    image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    image.thumbnail((WORK_MAX, WORK_MAX), Image.LANCZOS)

    if kind == "back" and image.width / image.height >= 2:
        mask = Image.new("L", (image.width, 1))
        mask.putdata(fade_alpha_row(image.width))
        mask = mask.resize(image.size, Image.NEAREST)
        # Same as sharp's dest-in composite: each pixel keeps its own
        # alpha, scaled by the fade (a * m / 255).
        image.putalpha(ImageChops.multiply(image.getchannel("A"), mask))

    bbox = image.getchannel("A").point(lambda v: 255 if v > TRIM_ALPHA else 0).getbbox()
    if bbox:
        image = image.crop(bbox)

    image.thumbnail((OUT_MAX_W, OUT_MAX_H), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="WEBP", quality=82, alpha_quality=90, method=4)
    return out.getvalue()


def build_card_photo(photo_bytes: bytes, width: int) -> bytes:
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(photo_bytes)))
    image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="WEBP", quality=80, method=4)
    return out.getvalue()


PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

# kind -> (source folder, source extensions, output folder, builder)
JOBS = {
    "then": ("players/then-cutouts/", (".png",), "players/then-web/", lambda b: build_web_image("then", b)),
    "back": ("players/back-cutouts/", (".png",), "players/back-web/", lambda b: build_web_image("back", b)),
    "now": ("players/now-cutouts/", (".png",), "players/now-web/", lambda b: build_web_image("now", b)),
    "then-card": ("players/then/", PHOTO_EXTENSIONS, "players/then-card/", lambda b: build_card_photo(b, 800)),
    "back-card": ("players/back/", PHOTO_EXTENSIONS, "players/back-card/", lambda b: build_card_photo(b, 800)),
    "now-thumb": ("players/now/", PHOTO_EXTENSIONS, "players/now-thumb/", lambda b: build_card_photo(b, 400)),
}


def main() -> int:
    import boto3

    s3 = boto3.client("s3", region_name=AWS_REGION)
    print(f"Bucket: {BUCKET}  Region: {AWS_REGION}")
    print(f"Kinds: {KINDS}  Dry run: {DRY_RUN}  Overwrite: {OVERWRITE}  Max files per kind: {MAX_FILES or 'all'}")
    if ONLY_IDS:
        print(f"Only ids: {sorted(ONLY_IDS)}")

    built = skipped = failed = would_build = 0
    unknown = [k for k in KINDS if k not in JOBS]
    if unknown:
        print(f"Unknown KINDS: {unknown} (expected some of {ALL_KINDS})")
        return 1

    for kind in KINDS:
        src_prefix, src_exts, out_prefix, build = JOBS[kind]

        sources: dict[str, dict] = {}
        outputs: dict[str, dict] = {}
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=BUCKET, Prefix=src_prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                name = key[len(src_prefix):]
                # Direct children only (players/then/ must not pick up
                # anything nested under it).
                if "/" in name or not name.lower().endswith(src_exts):
                    continue
                pid = name.rsplit(".", 1)[0]
                # If a player has both a .jpg and a .png, prefer the newest.
                if pid not in sources or obj["LastModified"] > sources[pid]["LastModified"]:
                    sources[pid] = obj
        for page in paginator.paginate(Bucket=BUCKET, Prefix=out_prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.lower().endswith(".webp"):
                    outputs[key[len(out_prefix):-5]] = obj

        ids = sorted(i for i in sources if not ONLY_IDS or i in ONLY_IDS)
        if MAX_FILES is not None:
            ids = ids[:MAX_FILES]
        print(f"\n== {kind}: {len(sources)} sources in {src_prefix}, {len(outputs)} built already, {len(ids)} to check")

        for n, pid in enumerate(ids, start=1):
            src = sources[pid]
            out = outputs.get(pid)
            if out and not OVERWRITE and out["LastModified"] >= src["LastModified"]:
                skipped += 1
                continue
            label = f"[{kind} {n}/{len(ids)}] {src['Key']} -> {out_prefix}{pid}.webp"
            if DRY_RUN:
                print(f"{label}  DRY RUN would build ({'stale' if out else 'missing'})")
                would_build += 1
                continue
            try:
                png = s3.get_object(Bucket=BUCKET, Key=src["Key"])["Body"].read()
                webp = build(png)
                s3.put_object(
                    Bucket=BUCKET,
                    Key=f"{out_prefix}{pid}.webp",
                    Body=webp,
                    ContentType="image/webp",
                    CacheControl=CACHE_CONTROL,
                )
                print(f"{label}  OK {len(png):,} -> {len(webp):,} bytes")
                built += 1
            except Exception as exc:  # keep going; report at the end
                print(f"{label}  FAILED: {exc}")
                failed += 1

    print("\nSummary")
    print(f"Built: {built}")
    print(f"Up to date (skipped): {skipped}")
    print(f"Dry run, would build: {would_build}")
    print(f"Failed: {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
