"""Shared quality gate for automatic player cutouts.

No player or school IDs appear in the rules. Reject uncertain masks and keep
original photos; a transparent but headless person is not a successful cutout.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Callable

import numpy as np
from PIL import Image, ImageOps


@dataclass(frozen=True)
class Verdict:
    ok: bool
    reason: str
    foreground_fraction: float
    top: int
    face_count: int
    face_retained: bool | None


def image_rgba(raw: bytes) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGBA')


def face_boxes(image: Image.Image) -> list[tuple[int, int, int, int]]:
    """High-confidence face detection; no model download, fail open to shape QC."""
    try:
        import cv2  # Installed by the player-cutout workflow.
        model = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        if model.empty():
            return []
        rgb = np.asarray(image.convert('RGB'))
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        boxes = model.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=6, minSize=(25, 25))
        return [tuple(map(int, box)) for box in boxes]
    except (ImportError, OSError, ValueError):
        return []


def inspect_cutout(source: bytes, candidate: bytes,
                   detect_faces: Callable[[Image.Image], list[tuple[int, int, int, int]]] = face_boxes) -> Verdict:
    try:
        original, result = image_rgba(source), image_rgba(candidate)
        if original.size != result.size:
            return Verdict(False, 'output_dimensions_changed', 0.0, 0, 0, None)
        a = np.asarray(result.getchannel('A'))
        foreground = a >= 128
        fraction = float(foreground.mean())
        ys, xs = np.where(foreground)
        if len(xs) == 0 or fraction < 0.008 or fraction > 0.88:
            return Verdict(False, 'empty_or_opaque_mask', fraction, 0, 0, None)
        top, bottom = int(ys.min()), int(ys.max()) + 1
        left, right = int(xs.min()), int(xs.max()) + 1
        if bottom - top < max(32, int(a.shape[0] * 0.1)) or right - left < max(24, int(a.shape[1] * 0.08)):
            return Verdict(False, 'foreground_too_small', fraction, top, 0, None)
        faces = detect_faces(original)
        retained: bool | None = None
        if faces:
            coverages = []
            for x, y, w, h in faces:
                x0, x1 = max(0, x), min(a.shape[1], x + w)
                y0, y1 = max(0, y), min(a.shape[0], y + h)
                if x1 > x0 and y1 > y0:
                    coverages.append(float(foreground[y0:y1, x0:x1].mean()))
            if coverages:
                retained = max(coverages) >= 0.38
                if not retained:
                    return Verdict(False, 'source_face_missing_in_cutout', fraction, top, len(faces), False)
        height = bottom - top
        width_by_row = np.count_nonzero(foreground[top:bottom, left:right], axis=1)
        near_start = max(1, int(0.012 * height))
        near_end = max(near_start + 1, int(0.075 * height))
        middle_start = int(0.18 * height)
        middle_end = max(middle_start + 1, int(0.55 * height))
        top_width = float(np.median(width_by_row[near_start:near_end]))
        core_width = float(np.percentile(width_by_row[middle_start:middle_end], 75))
        if core_width > 0 and top_width / core_width > 0.84 and top_width > 0.30 * a.shape[1]:
            return Verdict(False, 'flat_wide_top_suspected_missing_head', fraction, top, len(faces), retained)
        return Verdict(True, 'passed', fraction, top, len(faces), retained)
    except (OSError, ValueError, TypeError) as error:
        return Verdict(False, 'image_decode_error_' + type(error).__name__, 0.0, 0, 0, None)


def meaningful_head_extension(original: bytes, bad_mask: bytes, candidate: bytes) -> bool:
    """Confirm a replacement restores upper-body pixels the bad mask lost."""
    src = image_rgba(original)
    bad, new = image_rgba(bad_mask), image_rgba(candidate)
    if src.size != bad.size or src.size != new.size:
        return False
    old_fg = np.asarray(bad.getchannel('A')) >= 128
    new_fg = np.asarray(new.getchannel('A')) >= 128
    y_old = np.where(old_fg)[0]
    y_new = np.where(new_fg)[0]
    if not len(y_old) or not len(y_new):
        return False
    h, w = old_fg.shape
    new_top, old_top = int(y_new.min()), int(y_old.min())
    if old_top - new_top < max(12, int(0.07 * h)):
        return False
    restored = new_fg[:old_top] & ~old_fg[:old_top]
    if int(restored.sum()) < max(80, int(0.002 * h * w)):
        return False
    overlap = float((new_fg & old_fg).sum()) / max(1, int(old_fg.sum()))
    return overlap >= 0.65
