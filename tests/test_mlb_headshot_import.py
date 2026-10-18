"""Importer regressions; all database, MLB, and S3 access is mocked."""

import csv
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError
from PIL import Image
import requests

SPEC = importlib.util.spec_from_file_location(
    "mlb_headshot_import", Path(__file__).resolve().parents[1] / "scripts/import-mlb-headshots-s3.py"
)
importer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = importer
SPEC.loader.exec_module(importer)

PLAYER = {"playerid": "123", "mlb_player_id": "456", "mlb_id_candidates": "456",
          "name": "Test Player", "level": "AA", "hsid": "5004"}
NOW = "players/now/123.jpg"
THUMB = "players/now-thumb/123.webp"
SEASON = f"players/season-headshots/123_{importer.SEASON}.jpg"


def image_bytes(color="blue", size=(600, 720), mode="RGB"):
    out = io.BytesIO()
    Image.new(mode, size, color).save(out, format="PNG")
    return out.getvalue()


def http(status, body=b"", content_type="image/jpeg"):
    return MagicMock(status_code=status, ok=200 <= status < 400,
                     content=body, headers={"content-type": content_type})


def s3_error(code, status=403):
    return ClientError({"Error": {"Code": code}, "ResponseMetadata": {"HTTPStatusCode": status}}, "Test")


class FetchTests(unittest.TestCase):
    @patch.object(importer.time, "sleep")
    def test_only_two_404s_mean_no_published_headshot(self, _sleep):
        session = MagicMock()
        session.get.side_effect = [http(404), http(404)]
        result = importer.fetch_headshot("456", "AA", session)
        self.assertEqual(result.status, "no_headshot")
        self.assertEqual(session.get.call_count, 2)
        urls = [c.args[0] for c in session.get.call_args_list]
        self.assertTrue(urls[0].endswith("/headshot/milb/current"))
        self.assertTrue(urls[1].endswith("/headshot/67/current"))
        self.assertTrue(all("d_" not in url for url in urls))
        _sleep.assert_not_called()

    def test_access_denied_is_not_no_headshot(self):
        session = MagicMock()
        session.get.side_effect = [http(403), http(404)]
        result = importer.fetch_headshot("456", "MLB", session)
        self.assertEqual(result.status, "fetch_error")
        self.assertIn("mlb:http_403", result.detail)
        self.assertEqual(session.get.call_count, 2)

    @patch.object(importer.time, "sleep")
    def test_temporary_http_failure_is_retried_then_validated(self, _sleep):
        session = MagicMock()
        session.get.side_effect = [http(503), http(200, image_bytes())]
        result = importer.fetch_headshot("456", "MLB", session)
        self.assertEqual((result.status, result.origin), ("found", "mlb"))
        self.assertEqual(Image.open(io.BytesIO(result.jpeg)).format, "JPEG")
        self.assertEqual(session.get.call_count, 2)
        self.assertEqual(session.get.call_args_list[0].args, session.get.call_args_list[1].args)

    @patch.object(importer.time, "sleep")
    def test_network_retry_is_bounded_and_not_called_missing(self, _sleep):
        session = MagicMock()
        session.get.side_effect = [requests.Timeout(), requests.Timeout(), http(404)]
        result = importer.fetch_headshot("456", "AA", session)
        self.assertEqual(result.status, "fetch_error")
        self.assertIn("milb:Timeout", result.detail)
        self.assertEqual(session.get.call_count, 3)

    def test_invalid_image_is_not_saved_or_called_missing(self):
        session = MagicMock()
        session.get.side_effect = [http(200, b"an upstream error"), http(404)]
        result = importer.fetch_headshot("456", "AA", session)
        self.assertEqual(result.status, "fetch_error")
        self.assertIn("invalid_image", result.detail)

    def test_tiny_or_non_image_responses_fall_back(self):
        session = MagicMock()
        session.get.side_effect = [http(200, image_bytes(size=(20, 20))), http(200, image_bytes())]
        result = importer.fetch_headshot("456", "AA", session)
        self.assertEqual((result.status, result.origin), ("found", "mlb"))


class StorageTests(unittest.TestCase):
    def test_only_object_missing_errors_mean_absent(self):
        s3 = MagicMock()
        for code in ("404", "NoSuchKey", "NotFound"):
            with self.subTest(code=code):
                s3.head_object.side_effect = s3_error(code, 404)
                self.assertFalse(importer.exists(s3, NOW))
        for code in ("AccessDenied", "SlowDown", "NoSuchBucket"):
            with self.subTest(code=code):
                s3.head_object.side_effect = s3_error(code)
                with self.assertRaises(ClientError):
                    importer.exists(s3, NOW)

    def test_paginated_inventory_and_failure_are_not_empty_bucket(self):
        s3 = MagicMock()
        paginator = s3.get_paginator.return_value
        paginator.paginate.return_value = [{"Contents": [{"Key": NOW}]}, {}, {"Contents": [{"Key": "other"}]}]
        self.assertEqual(importer.list_keys(s3, "players/now/"), {NOW, "other"})
        paginator.paginate.side_effect = s3_error("AccessDenied")
        with self.assertRaises(ClientError):
            importer.list_keys(s3, "players/now/")

    def test_conditional_write_keeps_concurrent_photo_but_raises_other_errors(self):
        s3 = MagicMock()
        s3.put_object.side_effect = s3_error("PreconditionFailed", 412)
        self.assertFalse(importer.put(s3, NOW, b"photo", only_if_missing=True))
        self.assertEqual(s3.put_object.call_args.kwargs["IfNoneMatch"], "*")
        s3.put_object.side_effect = s3_error("AccessDenied")
        with self.assertRaises(ClientError):
            importer.put(s3, NOW, b"photo", only_if_missing=True)

    def test_thumbnail_matches_gallery_size_and_preserves_alpha(self):
        data = image_bytes((25, 50, 75, 0), mode="RGBA")
        thumb = Image.open(io.BytesIO(importer.to_now_thumb(data)))
        self.assertEqual((thumb.format, thumb.size), ("WEBP", (400, 480)))
        self.assertEqual(thumb.getpixel((0, 0))[3], 0)


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.jpeg = importer.to_jpeg(image_bytes())
        self.s3 = MagicMock()
        self.s3.head_object.side_effect = s3_error("404", 404)
        self.fetch_patch = patch.object(importer, "fetch_headshot", return_value=importer.HeadshotResult(self.jpeg, "milb", "found"))
        self.fetch = self.fetch_patch.start()
        self.addCleanup(self.fetch_patch.stop)

    def run_player(self, now=(), thumbs=(), dry=False, replace=False, player=None):
        return importer.process_player(player or PLAYER, self.s3, MagicMock(), set(now), set(thumbs),
                                       dry_run=dry, replace_now=replace)

    def writes(self):
        return {c.kwargs["Key"]: c.kwargs for c in self.s3.put_object.call_args_list}

    def test_fill_new_photo_and_thumbnail_without_other_photo_roles(self):
        row = self.run_player()
        self.assertEqual((row["status"], row["now"], row["now_thumb"]), ("saved", "filled", "filled"))
        writes = self.writes()
        self.assertEqual(set(writes), {SEASON, NOW, THUMB})
        self.assertEqual(writes[NOW]["IfNoneMatch"], "*")
        self.assertEqual(writes[THUMB]["IfNoneMatch"], "*")
        self.assertNotIn("IfNoneMatch", writes[SEASON])
        self.assertEqual(writes[THUMB]["ContentType"], "image/webp")
        self.assertEqual(Image.open(io.BytesIO(writes[THUMB]["Body"])).size, (400, 480))
        self.s3.copy_object.assert_not_called()

    def test_existing_current_photos_and_thumbnails_are_kept_for_every_supported_format(self):
        for ext in importer.PHOTO_EXTENSIONS:
            with self.subTest(ext=ext):
                self.s3.reset_mock()
                row = self.run_player(now={f"players/now/123.{ext}"}, thumbs={THUMB})
                self.assertEqual((row["now"], row["now_thumb"]), ("kept_existing", "kept_existing"))
                self.assertEqual(set(self.writes()), {SEASON})
                self.s3.head_object.assert_not_called()
                self.s3.copy_object.assert_not_called()

    def test_manual_dry_run_does_not_upload_or_copy(self):
        row = self.run_player(dry=True)
        self.assertEqual((row["status"], row["now"], row["now_thumb"]), ("would_save", "would_fill", "would_fill"))
        self.s3.put_object.assert_not_called()
        self.s3.copy_object.assert_not_called()
        self.s3.get_object.assert_not_called()

    def test_denied_existence_check_stops_before_any_write(self):
        self.s3.head_object.side_effect = s3_error("AccessDenied")
        row = self.run_player()
        self.assertEqual(row["status"], "storage_error")
        self.assertIn("check_current_photo:AccessDenied", row["detail"])
        self.s3.put_object.assert_not_called()

    def test_ambiguous_identity_skips_download_and_all_writes(self):
        row = self.run_player(player={**PLAYER, "mlb_player_id": "", "mlb_id_candidates": "456;789"})
        self.assertEqual(row["status"], "ambiguous_mlb_ids")
        self.fetch.assert_not_called()
        self.s3.put_object.assert_not_called()
        self.s3.head_object.assert_not_called()

    def test_no_published_photo_does_not_touch_storage(self):
        self.fetch.return_value = importer.HeadshotResult(None, "", "no_headshot", "mlb:http_404; milb:http_404")
        row = self.run_player()
        self.assertEqual(row["status"], "no_headshot")
        self.s3.put_object.assert_not_called()
        self.s3.head_object.assert_not_called()

    def test_missing_thumbnail_uses_preserved_photo_not_new_mlb_choice(self):
        self.s3.get_object.return_value = {"Body": io.BytesIO(image_bytes("red"))}
        row = self.run_player(now={NOW})
        self.assertEqual((row["now"], row["now_thumb"]), ("kept_existing", "filled"))
        self.assertEqual(set(self.writes()), {SEASON, THUMB})
        pixel = Image.open(io.BytesIO(self.writes()[THUMB]["Body"])).getpixel((10, 10))
        self.assertGreater(pixel[0], 240)
        self.assertLess(pixel[2], 15)

    def test_current_photo_race_preserves_winner_and_derives_its_thumbnail(self):
        def write(**kwargs):
            if kwargs["Key"] == NOW:
                raise s3_error("PreconditionFailed", 412)
        self.s3.put_object.side_effect = write
        self.s3.get_object.return_value = {"Body": io.BytesIO(image_bytes("red"))}
        row = self.run_player()
        self.assertEqual((row["now"], row["now_thumb"]), ("kept_existing", "filled"))
        self.s3.get_object.assert_called_once_with(Bucket=importer.BUCKET, Key=NOW)
        pixel = Image.open(io.BytesIO(self.writes()[THUMB]["Body"])).getpixel((10, 10))
        self.assertGreater(pixel[0], 240)
        self.assertLess(pixel[2], 15)

    def test_thumbnail_failure_is_reported_and_next_run_repairs_it(self):
        def fail_thumbnail(**kwargs):
            if kwargs["Key"] == THUMB:
                raise s3_error("AccessDenied")
        self.s3.put_object.side_effect = fail_thumbnail
        first = self.run_player()
        self.assertEqual((first["status"], first["now"], first["season_photo"]), ("storage_error", "filled", "saved"))
        self.assertIn("save_current_thumbnail:AccessDenied", first["detail"])
        self.s3.put_object.side_effect = None
        self.s3.get_object.return_value = {"Body": io.BytesIO(self.jpeg)}
        second = self.run_player(now={NOW})
        self.assertEqual((second["status"], second["now"], second["now_thumb"]), ("saved", "kept_existing", "filled"))

    def test_explicit_replacement_backs_up_current_photo_first(self):
        row = self.run_player(now={NOW}, thumbs={THUMB}, replace=True)
        self.assertEqual(row["now"], "replaced")
        self.assertEqual(row["now_thumb"], "kept_existing")
        self.s3.copy_object.assert_called_once_with(
            Bucket=importer.BUCKET, Key="players/replaced-now/123.jpg",
            CopySource={"Bucket": importer.BUCKET, "Key": NOW})
        mutations = [c[0] for c in self.s3.method_calls if c[0] in ("copy_object", "put_object")]
        self.assertEqual(mutations, ["put_object", "copy_object", "put_object"])


class CandidateAndReportTests(unittest.TestCase):
    def test_query_keeps_multiple_eligible_ids_for_review(self):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = [
            (123, ["456", "789"], "Source Name", "Display Name", "aa", 5004),
            (124, ["456"], "Source Name", None, None, None),
        ]
        rows = importer.players(conn)
        self.assertEqual(rows[0]["mlb_player_id"], "")
        self.assertEqual(rows[0]["mlb_id_candidates"], "456;789")
        self.assertEqual(rows[1]["mlb_player_id"], "456")
        self.assertIn("match_method IS DISTINCT FROM 'rejected_bad_identity_match'", cursor.execute.call_args.args[0])

    @patch.object(importer.time, "sleep")
    def test_fetch_failures_produce_report_and_failed_exit(self, _sleep):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"DATABASE_URL": "mock-only"}), \
                patch.object(importer, "REPORT_PATH", str(Path(tmp) / "report.csv")), \
                patch.object(importer, "MAX_PLAYERS", 0), patch.object(importer, "ONLY_PLAYERIDS", set()), \
                patch.object(importer.psycopg, "connect"), patch.object(importer.boto3, "client"), \
                patch.object(importer, "players", return_value=[PLAYER]), \
                patch.object(importer, "list_keys", return_value=set()), \
                patch.object(importer, "fetch_headshot", return_value=importer.HeadshotResult(None, "", "fetch_error", "mlb:http_403")):
            self.assertEqual(importer.main(), 1)
            with open(importer.REPORT_PATH) as fh:
                rows = list(csv.DictReader(fh))
            self.assertEqual(rows[0]["status"], "fetch_error")
            self.assertEqual(rows[0]["detail"], "mlb:http_403")


if __name__ == "__main__":
    unittest.main()
