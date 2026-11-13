#!/usr/bin/env python3
"""Replace flip-card back action photos from data/flip-card-back-swaps/{id}.jpg.

For each file: archive the current players/back/{id}.jpg and
players/back-card/{id}.webp to players/back-archive/ (once), then upload the
new back JPG and its 1200x420 card WebP (the same crop the site's own upload
makes). Skips a player whose back JPG already matches the file. Cutouts are
not touched. DRY_RUN=true prints what it would do.
"""
import hashlib, io, os, pathlib, sys
import boto3
from botocore.exceptions import ClientError
from PIL import Image, ImageOps

BUCKET = 'yatstats-assets'
CC = 'public, max-age=86400, stale-while-revalidate=604800'
DRY = os.environ.get('DRY_RUN', 'false').lower() == 'true'
s3 = boto3.client('s3', region_name='us-west-2')

def exists(key):
    try:
        return s3.head_object(Bucket=BUCKET, Key=key)
    except ClientError:
        return None

def main():
    files = sorted(pathlib.Path('data/flip-card-back-swaps').glob('*.jpg'))
    for f in files:
        pid = f.stem
        if not pid.isdigit():
            continue
        data = f.read_bytes()
        cur = exists(f'players/back/{pid}.jpg')
        if cur and cur.get('Metadata', {}).get('sha256') == hashlib.sha256(data).hexdigest():
            print(pid, 'already current'); continue
        for k, ext in (('back', 'jpg'), ('back-card', 'webp')):
            src, arc = f'players/{k}/{pid}.{ext}', f'players/back-archive/{k}-{pid}-before-swap.{ext}'
            if exists(src) and not exists(arc):
                print('archive', src, '->', arc)
                if not DRY:
                    s3.copy_object(Bucket=BUCKET, Key=arc, CopySource={'Bucket': BUCKET, 'Key': src})
        img = Image.open(io.BytesIO(data)).convert('RGB')
        card = io.BytesIO()
        ImageOps.fit(img, (1200, 420), Image.LANCZOS).save(card, 'WEBP', quality=85)
        print('upload', pid, len(data), 'bytes;', 'card', card.tell(), 'bytes')
        if not DRY:
            s3.put_object(Bucket=BUCKET, Key=f'players/back/{pid}.jpg', Body=data, ContentType='image/jpeg', CacheControl=CC,
                          Metadata={'sha256': hashlib.sha256(data).hexdigest()})
            s3.put_object(Bucket=BUCKET, Key=f'players/back-card/{pid}.webp', Body=card.getvalue(), ContentType='image/webp', CacheControl=CC)
    return 0

if __name__ == '__main__':
    sys.exit(main())
