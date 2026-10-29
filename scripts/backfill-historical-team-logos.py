#!/usr/bin/env python3
"""Backfill explicitly verified historical logo keys without franchise substitution.

Read-only by default. Source and destination reside in the same S3 bucket.
Only copies source artwork after verifying that it is a valid image and the
destination does not already exist. Never overwrites historic original art.
"""
import csv,io,os
from pathlib import Path
import boto3
from botocore.exceptions import ClientError
from PIL import Image
BUCKET=os.getenv("YATSTATS_S3_BUCKET","yatstats-assets")
DRY_RUN=os.getenv("DRY_RUN","true").lower()!="false"
MANIFEST=Path(os.getenv("HISTORICAL_LOGO_MANIFEST","data/historical-team-logo-sources.csv"))

def present(s3,key):
    try: return s3.head_object(Bucket=BUCKET,Key=key)
    except ClientError as err:
        if err.response["Error"]["Code"] in ("404","NoSuchKey","NotFound"): return None
        raise

def main():
    s3=boto3.client("s3",region_name=os.getenv("AWS_DEFAULT_REGION","us-west-2"))
    ok=skip=error=0
    with MANIFEST.open(newline="",encoding="utf-8") as handle:
        records=list(csv.DictReader(handle))
    for row in records:
        tid=row["historic_teamid"].strip()
        source=row["verified_source_s3_key"].strip()
        if not tid.isdigit() or not source.startswith(("teams/","teams-web/")) or ".." in source:
            print("REJECT invalid manifest entry",tid,source);error+=1;continue
        ext=source.rsplit(".",1)[-1].lower()
        dest=f"teams/{tid}.png"
        target_web=f"teams-web/{tid}.webp"
        has_original=bool(present(s3,dest))
        has_cutout=bool(present(s3,f"teams/cutouts/{tid}.png"))
        has_web=bool(present(s3,target_web))
        if has_web:
            print("SKIP already published historical WebP",tid);skip+=1;continue
        try:
            # Never change existing historical artwork. The optimized asset can
            # be repaired independently if an earlier run created only the PNG.
            original_key=f"teams/cutouts/{tid}.png" if has_cutout else dest if has_original else source
            raw=Image.open(io.BytesIO(s3.get_object(Bucket=BUCKET,Key=original_key)["Body"].read())).convert("RGBA")
            if min(raw.size)<32: raise ValueError("artwork too small")
            print(("DRY RUN" if DRY_RUN else "PUBLISH"),tid,original_key,"=>",target_web)
            if not DRY_RUN:
                if not (has_original or has_cutout):
                    rendered=io.BytesIO()
                    raw.save(rendered,format="PNG")
                    s3.put_object(Bucket=BUCKET,Key=dest,Body=rendered.getvalue(),ContentType="image/png",CacheControl="public, max-age=86400",IfNoneMatch="*")
                raw.thumbnail((400,400),Image.Resampling.LANCZOS)
                optimized=io.BytesIO()
                raw.save(optimized,format="WEBP",quality=82,alpha_quality=90)
                s3.put_object(Bucket=BUCKET,Key=target_web,Body=optimized.getvalue(),ContentType="image/webp",CacheControl="public, max-age=86400",IfNoneMatch="*")
            ok+=1
        except Exception as exc:
            print("FAILED",tid,str(exc));error+=1
    print(f"ready={ok} skipped={skip} errors={error} dry_run={DRY_RUN}")
    return 1 if error else 0

if __name__=="__main__":
    raise SystemExit(main())
