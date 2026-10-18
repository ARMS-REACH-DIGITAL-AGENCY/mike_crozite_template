#!/usr/bin/env python3
import hashlib
import io
import sys
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from verify_hs_logo_staging import (
    inspect_png, verify_identity, verify_source, verify_s3_row, school_signature
)

SCHOOL = {"hsid":"4", "name":"Melbourne", "nickname":"Bulldogs",
          "city":"Melbourne", "state":"FL"}
ROW = {**SCHOOL, "key":"schools-candidates/4.png",
       "page":"https://www.maxpreps.com/fl/melbourne/melbourne-bulldogs/",
       "page_seen":"Melbourne / Bulldogs", "score":100, "runner_up":45}


def png_bytes(alpha=True):
    im = Image.new("RGBA" if alpha else "RGB", (128, 128),
                   (0, 0, 0, 0) if alpha else (255, 255, 255))
    if alpha:
        for x in range(16, 112):
            for y in range(16,112):
                im.putpixel((x,y),(10,40,80,255))
    buf=io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


class DummyS3:
    def __init__(self, data, metadata=None):
        self.data=data
        self.metadata=metadata or {}

    def get_object(self, Bucket, Key):
        assert Bucket=="yatstats-assets"
        assert Key=="schools-candidates/4.png", Key
        return {"Body":io.BytesIO(self.data), "ContentType":"image/png",
                "Metadata":self.metadata}


class Tests(unittest.TestCase):
    def test_canonical_hsid_filename(self):
        self.assertEqual([],verify_identity(ROW,SCHOOL))
        bad={**ROW, "key":"schools-candidates/1.png"}
        self.assertIn("s3_key_not_canonical_hsid",verify_identity(bad,SCHOOL))

    def test_identity_mismatch_fails(self):
        bad={**ROW, "city":"Chicago"}
        self.assertIn("neon_city_mismatch",verify_identity(bad,SCHOOL))

    def test_correct_source(self):
        self.assertEqual(([], []), verify_source(ROW,SCHOOL))

    def test_wrong_mascot_is_hard_failure(self):
        bad={**ROW, "page_seen":"Melbourne / Lions"}
        self.assertIn("source_page_mascot_mismatch",verify_source(bad,SCHOOL)[0])

    def test_wrong_city_is_hard_failure(self):
        bad={**ROW, "page":"https://www.maxpreps.com/fl/orlando/melbourne-bulldogs/"}
        self.assertIn("source_url_city_mismatch",verify_source(bad,SCHOOL)[0])

    def test_ambiguous_name_requires_review(self):
        bad={**ROW, "page":"https://www.maxpreps.com/fl/melbourne/melbourne-school-bulldogs/"}
        self.assertIn("source_url_school_name_not_exact", verify_source(bad,SCHOOL)[1])

    def test_real_alpha_channel_and_pixels(self):
        failures,stats=inspect_png(png_bytes())
        self.assertEqual([],failures)
        self.assertGreater(stats["transparent_percent"],1)

    def test_opaque_background_rejected(self):
        failures,_=inspect_png(png_bytes(alpha=False))
        self.assertIn("missing_alpha_channel",failures)

    def test_corrupt_png_rejected(self):
        failures,_=inspect_png(b"\x89PNG\r\n\x1a\nbroken")
        self.assertTrue(any(v.startswith("invalid_png") for v in failures))

    def test_sha_mismatch_rejected(self):
        failures,_=inspect_png(png_bytes(),"deadbeef")
        self.assertIn("s3_bytes_differ_from_processed_source",failures)

    def test_s3_round_trip_correct_with_provenance(self):
        data=png_bytes()
        r={**ROW,"image_sha256":hashlib.sha256(data).hexdigest()}
        s3=DummyS3(data,{"hsid":"4","source-sha256":hashlib.sha256(data).hexdigest(),
                         "school-signature":school_signature(SCHOOL)})
        report,_=verify_s3_row(s3,"yatstats-assets","schools-candidates/",r,SCHOOL)
        self.assertEqual("VERIFIED_PENDING_VISUAL_REVIEW",report["status"], report)

    def test_legacy_staged_file_requires_review(self):
        report,_=verify_s3_row(DummyS3(png_bytes()),"yatstats-assets",
                               "schools-candidates/",ROW,SCHOOL)
        self.assertEqual("REVIEW_REQUIRED",report["status"])

    def test_bad_s3_metadata_blocks(self):
        data=png_bytes()
        report,_=verify_s3_row(DummyS3(data,{"hsid":"999"}),"yatstats-assets",
                               "schools-candidates/",ROW,SCHOOL)
        self.assertEqual("FAILED",report["status"])


if __name__=="__main__":
    unittest.main()
