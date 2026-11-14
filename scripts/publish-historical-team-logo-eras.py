#!/usr/bin/env python3
"""Publish verified, immutable historical baseball insignia by team ID and era.

Never edits teams/{teamid} or teams-web/{teamid}: those slots represent the
general team identity. Historical artwork is independently stored at
teams-history/{teamid}/{start}-{end}.webp.
"""
import hashlib
import io
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

MANIFEST = Path("data/historical-team-logo-eras.json")
BUCKET = os.getenv("YATSTATS_S3_BUCKET", "yatstats-assets")
DRY_RUN = os.getenv("DRY_RUN", "true").lower() != "false"


def validate(entries):
    seen = set()
    for entry in entries:
        team = entry["teamid"]
        start, end = entry["from_year"], entry["to_year"]
        sha = entry["sha1"]
        filename = entry["source_file"]
        assert team.isdecimal() and 1850 <= start <= end <= 2100
        assert len(sha) == 40 and all(c in "0123456789abcdef" for c in sha)
        assert filename.startswith("California Angels logo (") and filename.endswith(").svg")
        assert "https://commons.wikimedia.org/wiki/File:" in entry["source_page"]
        for year in range(start, end + 1):
            pair = (team, year)
            if pair in seen:
                raise ValueError(f"Historical years overlap: {pair}")
            seen.add(pair)
        yield entry


def verified_svg(entry):
    title = entry["source_file"]
    redirect = "https://commons.wikimedia.org/wiki/Special:Redirect/file/" + urllib.parse.quote(title)
    req = urllib.request.Request(redirect, headers={
        "User-Agent": "YATSTATS-HistoricalTeamLogoPublisher/1.0 (info@yatstats.com)",
        "Accept": "image/svg+xml",
    })
    with urllib.request.urlopen(req, timeout=30) as response:
        if not response.url.startswith("https://upload.wikimedia.org/"):
            raise ValueError("Unexpected source host")
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000 or b"<svg" not in raw[:2000]:
        raise ValueError("Unrecognized/oversized SVG")
    actual = hashlib.sha1(raw).hexdigest()
    if actual != entry["sha1"]:
        raise ValueError(f"Source changed: expected {entry['sha1']}, got {actual}")
    return raw


def main():
    entries = list(validate(json.loads(MANIFEST.read_text(encoding="utf-8"))))
    if DRY_RUN:
        for entry in entries:
            print("DRY RUN verified manifest:", entry["teamid"], entry["from_year"], entry["to_year"], entry["source_page"])
        return 0

    import boto3
    from botocore.exceptions import ClientError
    import cairosvg
    from PIL import Image

    s3 = boto3.client("s3", region_name=os.getenv("AWS_DEFAULT_REGION", "us-west-2"))
    published = already = failures = 0
    for entry in entries:
        team, start, end = entry["teamid"], entry["from_year"], entry["to_year"]
        key = f"teams-history/{team}/{start}-{end}.webp"
        try:
            try:
                s3.head_object(Bucket=BUCKET, Key=key)
                print("EXISTS", key)
                already += 1
                continue
            except ClientError as error:
                if error.response.get("Error", {}).get("Code") not in ("404", "NotFound", "NoSuchKey"):
                    raise

            svg = verified_svg(entry)
            png = cairosvg.svg2png(bytestring=svg, output_width=400)
            image = Image.open(io.BytesIO(png)).convert("RGBA")
            image.thumbnail((400, 400), Image.Resampling.LANCZOS)
            stream = io.BytesIO()
            image.save(stream, "WEBP", quality=88, method=6)
            s3.put_object(
                Bucket=BUCKET,
                Key=key,
                Body=stream.getvalue(),
                ContentType="image/webp",
                CacheControl="public, max-age=31536000, immutable",
                IfNoneMatch="*",
                Metadata={"source-sha1": entry["sha1"], "era": f"{start}-{end}"},
            )
            print("PUBLISHED", key)
            published += 1
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in ("PreconditionFailed", "412"):
                print("EXISTS (concurrent)", key)
                already += 1
            else:
                print("FAILED", key, repr(error), file=sys.stderr)
                failures += 1
        except Exception as error:
            print("FAILED", key, repr(error), file=sys.stderr)
            failures += 1
    print(f"Historical logo assets published={published}, existing={already}, failed={failures}")
    return int(failures > 0)


if __name__ == "__main__":
    raise SystemExit(main())
