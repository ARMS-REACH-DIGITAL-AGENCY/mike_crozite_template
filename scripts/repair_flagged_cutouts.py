#!/usr/bin/env python3
"""Repair quarantined generated cutouts; original source photographs stay intact."""
import io, json, os, re
from datetime import datetime, timezone
from pathlib import Path
import boto3
from botocore.exceptions import ClientError
from PIL import Image
from rembg import new_session, remove
from cutout_quality import inspect_cutout, meaningful_head_extension

S3=boto3.client("s3",region_name=os.getenv("AWS_REGION") or "us-west-2")
BUCKET=os.getenv("YATSTATS_S3_BUCKET","yatstats-assets")
DRY=os.getenv("DRY_RUN","false").lower()=="true"
ROOT=Path(__file__).resolve().parent.parent
REQUESTS=json.loads((ROOT/"data/cutout-repair-requests.json").read_text())["requests"]

def head(key):
    try: return S3.head_object(Bucket=BUCKET,Key=key)
    except ClientError as ex:
        if ex.response.get("Error",{}).get("Code") in ("404","NotFound","NoSuchKey"): return None
        raise

def get(key):
    return S3.get_object(Bucket=BUCKET,Key=key)["Body"].read()

def put(key,data,mime):
    S3.put_object(Bucket=BUCKET,Key=key,Body=data,ContentType=mime,CacheControl="public,max-age=3600")

def repair(item):
    kind,pid=item["kind"],str(item["player_id"])
    if kind not in ("then","back","now") or not re.fullmatch(r"(?:[0-9]+|YAT[0-9]+)",pid):
        raise ValueError("Invalid photo role/player ID")
    originals=[]
    for ext in ("jpg","jpeg","webp","png"):
        key=f"players/{kind}/{pid}.{ext}"
        metadata=head(key)
        if metadata: originals.append((metadata["LastModified"],key,metadata))
    if not originals: raise RuntimeError("Original photo missing; refusing to alter generated assets")
    _,source_key,source_meta=max(originals)
    source=get(source_key)
    cut_key=f"players/{kind}-cutouts/{pid}.png"
    web_key=f"players/{kind}-web/{pid}.webp"
    reject_key=f"players/cutout-quality/rejected/{kind}/{pid}.json"
    old=get(cut_key) if head(cut_key) else None
    accepted=None
    findings=[]
    for name in ("isnet-general-use","u2net"):
        try:
            generated=remove(source,session=new_session(name))
            verdict=inspect_cutout(source,generated)
            restored=bool(old and meaningful_head_extension(source,old,generated))
            findings.append({"model":name,"passed":verdict.ok,"reason":verdict.reason,"face_retained":verdict.face_retained,"restored_head":restored})
            if verdict.ok and (verdict.face_retained is True or restored):
                accepted=generated
                break
        except Exception as exc:
            findings.append({"model":name,"error":type(exc).__name__})
    if accepted:
        from PIL import ImageChops
        image=Image.open(io.BytesIO(accepted)).convert("RGBA")
        image.thumbnail((2000,2000))
        bbox=image.getchannel("A").point(lambda a:255 if a>10 else 0).getbbox()
        if bbox: image=image.crop(bbox)
        image.thumbnail((1400,1000))
        result=io.BytesIO();image.save(result,"WEBP",quality=82,method=4)
        if not DRY:
            put(cut_key,accepted,"image/png")
            put(web_key,result.getvalue(),"image/webp")
            if head(reject_key): S3.delete_object(Bucket=BUCKET,Key=reject_key)
        print(json.dumps({"player":pid,"kind":kind,"result":"repaired","findings":findings}))
        return
    if not DRY:
        stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        for key in (cut_key,web_key):
            if head(key):
                backup=f"players/quarantined-cutouts/{kind}/{pid}/{stamp}/{key.rsplit('/',1)[-1]}"
                S3.copy_object(Bucket=BUCKET,CopySource={"Bucket":BUCKET,"Key":key},Key=backup)
                S3.delete_object(Bucket=BUCKET,Key=key)
        report={"status":"rejected","source_key":source_key,"source_etag":source_meta["ETag"].strip('"'),"findings":findings}
        put(reject_key,json.dumps(report).encode(),"application/json")
    print(json.dumps({"player":pid,"kind":kind,"result":"original_fallback","findings":findings}))

for item in REQUESTS: repair(item)
