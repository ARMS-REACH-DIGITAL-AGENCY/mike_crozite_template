#!/usr/bin/env python3
"""Process only queued Contribute cutouts; retain failed tasks for retry."""
import io
import json
import os
import sys
import boto3
from PIL import Image
from rembg import remove
from botocore.exceptions import ClientError

bucket = os.getenv("YATSTATS_S3_BUCKET", "yatstats-assets")
s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-west-2")
prefix = "cutout-queue/pending/"
valid = {
    "players/then/": "players/then-cutouts/",
    "players/back/": "players/back-cutouts/",
    "players/now/": "players/now-cutouts/",
    "players/season-photos/": "players/season-cutouts/",
}

def run():
    paginator = s3.get_paginator("list_objects_v2")
    done = failed = 0
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for entry in page.get("Contents", []):
            task_key = entry["Key"]
            if not task_key.endswith(".json"):
                continue
            try:
                task = json.loads(s3.get_object(Bucket=bucket, Key=task_key)["Body"].read())
                source = task["sourceKey"]
                output = task["destination"]
                if not any(source.startswith(a) and output == b + source[len(a):].rsplit(".", 1)[0] + ".png" for a, b in valid.items()):
                    raise ValueError("Invalid source/destination pair")
                try:
                    s3.head_object(Bucket=bucket, Key=output)
                    print("ALREADY COMPLETE", output)
                    s3.delete_object(Bucket=bucket, Key=task_key)
                    done += 1
                    continue
                except ClientError as exc:
                    if exc.response.get("Error", {}).get("Code") not in ("404", "NoSuchKey", "NotFound"):
                        raise
                raw = s3.get_object(Bucket=bucket, Key=source)["Body"].read()
                result = remove(raw)
                image = Image.open(io.BytesIO(result)).convert("RGBA")
                low, high = image.getchannel("A").getextrema()
                if low >= 255 or high <= 0:
                    raise ValueError("No usable transparency")
                buf = io.BytesIO()
                image.save(buf, format="PNG", optimize=True)
                s3.put_object(Bucket=bucket, Key=output, Body=buf.getvalue(),
                              ContentType="image/png", CacheControl="public, max-age=31536000, immutable")
                s3.delete_object(Bucket=bucket, Key=task_key)
                print("PROCESSED", source, "->", output)
                done += 1
            except Exception as exc:
                print("RETRY NEXT RUN", task_key, str(exc), file=sys.stderr)
                failed += 1
    print(f"Queue completed={done} failed={failed}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(run())
