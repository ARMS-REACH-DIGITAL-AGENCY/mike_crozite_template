#!/usr/bin/env python3
"""
Import prototype images from the GitHub repo yatstats/hamilton-mvp into S3,
using the uploaded CSV mapping file to decide what each file becomes.

What it does
- Clones the source repo from GitHub (no local image folder needed)
- Reads the mapping CSV
- Looks for files in:
    assets/img/hs_players
    assets/img/now_players
- Normalizes output formats so the site code stays consistent:
    hs_players  -> players/then/{playerid}.png
    now_players -> players/now/{playerid}.jpg
- Uploads to S3
- Writes an audit CSV with status + final S3 keys

Default source repo:
    https://github.com/yatstats/hamilton-mvp.git

Default CSV path:
    /mnt/data/image mapping for script - Sheet1.csv

Examples
  Dry run:
    python import_hamilton_mvp_images_to_s3.py --dry-run

  Real upload:
    export AWS_ACCESS_KEY_ID=...
    export AWS_SECRET_ACCESS_KEY=...
    export AWS_DEFAULT_REGION=us-west-2
    python import_hamilton_mvp_images_to_s3.py --bucket yatstats-assets
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import boto3
import pandas as pd
from PIL import Image, UnidentifiedImageError

DEFAULT_REPO_URL = "https://github.com/yatstats/hamilton-mvp.git"
DEFAULT_BRANCH = "main"
DEFAULT_CSV = "/mnt/data/image mapping for script - Sheet1.csv"
DEFAULT_BUCKET = "yatstats-assets"
DEFAULT_REGION = os.environ.get("AWS_DEFAULT_REGION", "us-west-2")

SOURCE_DIRS = {
    "assets/img/hs_players": "hs",
    "assets/img/now_players": "now",
}

VALID_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".eps"}


@dataclass
class RowResult:
    row_number: int
    player_name: str
    playerid: str
    original_filename: str
    original_folder: str
    source_path: str
    final_s3_key: str
    final_local_file: str
    status: str
    note: str


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--csv", default=DEFAULT_CSV, help="Path to mapping CSV")
    p.add_argument("--repo-url", default=DEFAULT_REPO_URL, help="Git repo URL to clone")
    p.add_argument("--branch", default=DEFAULT_BRANCH, help="Git branch to clone")
    p.add_argument("--bucket", default=DEFAULT_BUCKET, help="Target S3 bucket")
    p.add_argument("--region", default=DEFAULT_REGION, help="AWS region")
    p.add_argument("--prefix", default="", help="Optional prefix before S3 keys, e.g. staging/")
    p.add_argument("--repo-dir", default="", help="Optional existing local repo directory instead of cloning")
    p.add_argument("--dry-run", action="store_true", help="Do everything except the S3 upload")
    p.add_argument("--limit", type=int, default=0, help="Process only first N rows (0 = all)")
    return p.parse_args()


def normalize_text(v: object) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    if s.lower() in {"nan", "none"}:
        return ""
    return s


def normalize_playerid(v: object) -> str:
    s = normalize_text(v)
    if not s or s == "-":
        return ""
    s = s.replace(",", "")
    return s if s.isdigit() else ""


def safe_slug(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def clone_repo(repo_url: str, branch: str, workdir: Path) -> Path:
    repo_dir = workdir / "source_repo"
    cmd = [
        "git",
        "clone",
        "--depth",
        "1",
        "--branch",
        branch,
        repo_url,
        str(repo_dir),
    ]
    subprocess.run(cmd, check=True)
    return repo_dir


def build_source_index(repo_dir: Path) -> dict[tuple[str, str], Path]:
    index: dict[tuple[str, str], Path] = {}
    for rel_dir in SOURCE_DIRS:
        full_dir = repo_dir / rel_dir
        if not full_dir.exists():
            continue
        for path in full_dir.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in VALID_IMAGE_EXTS:
                continue
            key = (rel_dir, path.name.lower())
            index[key] = path
    return index


def find_source_file(source_index: dict[tuple[str, str], Path], original_folder: str, original_filename: str) -> Optional[Path]:
    key = (original_folder, original_filename.lower())
    return source_index.get(key)


def build_s3_key(row: pd.Series) -> tuple[str, str]:
    """Returns (kind, s3_key). kind is 'then' or 'now'."""
    playerid = normalize_playerid(row.get("playerid"))
    if not playerid:
        raise ValueError("missing numeric playerid")

    original_folder = normalize_text(row.get("original_folder"))
    display_role_1 = normalize_text(row.get("display_role_1")).lower()

    if original_folder == "assets/img/hs_players":
        return "then", f"players/then/{playerid}.png"

    if original_folder == "assets/img/now_players":
        return "now", f"players/now/{playerid}.jpg"

    # Fallback based on role if the folder is odd but the row meaning is clear.
    if "anchor_left" in display_role_1 or "flip_front" in display_role_1:
        return "then", f"players/then/{playerid}.png"

    return "now", f"players/now/{playerid}.jpg"


def convert_image(src: Path, kind: str, out_dir: Path, basename_no_ext: str) -> Path:
    """Normalizes file format so the codebase can rely on stable extensions.

    kind='then' -> PNG
    kind='now'  -> JPEG
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    if kind == "then":
        out_path = out_dir / f"{basename_no_ext}.png"
    else:
        out_path = out_dir / f"{basename_no_ext}.jpg"

    try:
        with Image.open(src) as im:
            # Handle EXIF orientation where present.
            try:
                exif = im.getexif()
                orientation = exif.get(274)
                if orientation == 3:
                    im = im.rotate(180, expand=True)
                elif orientation == 6:
                    im = im.rotate(270, expand=True)
                elif orientation == 8:
                    im = im.rotate(90, expand=True)
            except Exception:
                pass

            if kind == "then":
                # Keep transparency if present.
                if im.mode not in ("RGBA", "LA") and "transparency" not in im.info:
                    im = im.convert("RGBA")
                im.save(out_path, format="PNG", optimize=True)
            else:
                # JPG requires RGB.
                if im.mode in ("RGBA", "LA"):
                    bg = Image.new("RGB", im.size, (255, 255, 255))
                    alpha = im.getchannel("A") if "A" in im.getbands() else None
                    bg.paste(im.convert("RGBA"), mask=alpha)
                    im = bg
                else:
                    im = im.convert("RGB")
                im.save(out_path, format="JPEG", quality=90, optimize=True)
            return out_path
    except UnidentifiedImageError as e:
        raise ValueError(f"unsupported image format: {src.name}") from e


def upload_file_to_s3(local_file: Path, bucket: str, key: str, region: str) -> str:
    s3 = boto3.client("s3", region_name=region)
    extra = {}
    ext = local_file.suffix.lower()
    if ext == ".png":
        extra["ContentType"] = "image/png"
    elif ext in {".jpg", ".jpeg"}:
        extra["ContentType"] = "image/jpeg"
    s3.upload_file(str(local_file), bucket, key, ExtraArgs=extra)
    return f"s3://{bucket}/{key}"


def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"ERROR: CSV not found: {csv_path}", file=sys.stderr)
        return 1

    df = pd.read_csv(csv_path)
    if args.limit and args.limit > 0:
        df = df.head(args.limit)

    tmp_root_obj = None
    if args.repo_dir:
        repo_dir = Path(args.repo_dir).expanduser().resolve()
        if not repo_dir.exists():
            print(f"ERROR: repo-dir does not exist: {repo_dir}", file=sys.stderr)
            return 1
        workdir = repo_dir.parent
    else:
        tmp_root_obj = tempfile.TemporaryDirectory(prefix="yatstats_import_")
        workdir = Path(tmp_root_obj.name)
        print(f"CLONE: {args.repo_url} [{args.branch}] -> {workdir}")
        repo_dir = clone_repo(args.repo_url, args.branch, workdir)

    print(f"INDEX: scanning source images in {repo_dir}")
    source_index = build_source_index(repo_dir)
    print(f"INDEX: found {len(source_index)} source image files")

    converted_dir = workdir / "converted"
    results: list[RowResult] = []

    prefix = normalize_text(args.prefix).strip("/")

    for row_number, (_, row) in enumerate(df.iterrows(), start=2):
        player_name = normalize_text(row.get("player_name"))
        playerid_raw = normalize_text(row.get("playerid"))
        playerid = normalize_playerid(row.get("playerid"))
        original_filename = normalize_text(row.get("original_filename"))
        original_folder = normalize_text(row.get("original_folder"))

        if not original_filename or not original_folder:
            results.append(RowResult(
                row_number, player_name, playerid_raw, original_filename, original_folder,
                "", "", "", "SKIPPED", "missing original_filename or original_folder"
            ))
            continue

        source_path = find_source_file(source_index, original_folder, original_filename)
        if not source_path:
            results.append(RowResult(
                row_number, player_name, playerid_raw, original_filename, original_folder,
                "", "", "", "UNMATCHED", "source file not found in repo"
            ))
            continue

        try:
            kind, s3_key = build_s3_key(row)
        except ValueError as e:
            results.append(RowResult(
                row_number, player_name, playerid_raw, original_filename, original_folder,
                str(source_path), "", "", "SKIPPED", str(e)
            ))
            continue

        if prefix:
            s3_key = f"{prefix}/{s3_key}"

        basename_no_ext = Path(s3_key).stem
        try:
            converted = convert_image(source_path, kind, converted_dir / kind, basename_no_ext)
        except Exception as e:
            results.append(RowResult(
                row_number, player_name, playerid_raw, original_filename, original_folder,
                str(source_path), s3_key, "", "ERROR", f"convert failed: {e}"
            ))
            continue

        note = "dry-run"
        status = "READY"
        if not args.dry_run:
            try:
                upload_file_to_s3(converted, args.bucket, s3_key, args.region)
                status = "UPLOADED"
                note = "ok"
            except Exception as e:
                status = "ERROR"
                note = f"upload failed: {e}"

        print(f"{status}: {source_path} -> s3://{args.bucket}/{s3_key}")
        results.append(RowResult(
            row_number, player_name, playerid_raw, original_filename, original_folder,
            str(source_path), s3_key, str(converted), status, note
        ))

    report_path = Path("hamilton_mvp_import_report.csv").resolve()
    with report_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "row_number",
            "player_name",
            "playerid",
            "original_filename",
            "original_folder",
            "source_path",
            "final_s3_key",
            "final_local_file",
            "status",
            "note",
        ])
        for r in results:
            writer.writerow([
                r.row_number,
                r.player_name,
                r.playerid,
                r.original_filename,
                r.original_folder,
                r.source_path,
                r.final_s3_key,
                r.final_local_file,
                r.status,
                r.note,
            ])

    uploaded = sum(1 for r in results if r.status == "UPLOADED")
    ready = sum(1 for r in results if r.status == "READY")
    skipped = sum(1 for r in results if r.status == "SKIPPED")
    unmatched = sum(1 for r in results if r.status == "UNMATCHED")
    errors = sum(1 for r in results if r.status == "ERROR")

    print("\nSUMMARY")
    print(f"  uploaded : {uploaded}")
    print(f"  ready    : {ready}")
    print(f"  skipped  : {skipped}")
    print(f"  unmatched: {unmatched}")
    print(f"  errors   : {errors}")
    print(f"  report   : {report_path}")

    if tmp_root_obj is not None:
        tmp_root_obj.cleanup()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
