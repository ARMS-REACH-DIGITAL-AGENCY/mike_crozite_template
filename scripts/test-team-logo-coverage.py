#!/usr/bin/env python3
"""Focused regression tests; no network, credentials, or production writes."""
import ast
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent

def load_function(filename, name):
    source = ast.parse((ROOT / filename).read_text())
    node = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == name)
    return compile(ast.Module(body=[node], type_ignores=[]), filename, "exec")

class LogoTests(unittest.TestCase):
    def test_historical_guard(self):
        namespace = {}
        exec(load_function("import-mlb-team-logos-s3.py", "is_historical_team"), namespace)
        guard = namespace["is_historical_team"]
        self.assertTrue(guard({"teamid":"9","successor_teamid":"35"}))
        self.assertTrue(guard({"teamid":"18","successor_teamid":"32"}))
        self.assertFalse(guard({"teamid":"8","successor_teamid":"8"}))
        self.assertFalse(guard({"teamid":"20054","successor_teamid":""}))
        self.assertFalse(guard({"teamid":"15","successor_teamid":None}))

    def test_webp_builder_discovers_raw_and_cutout(self):
        src = (ROOT / "build-web-cutouts-s3.py").read_text()
        self.assertIn('Prefix="teams/"', src)
        self.assertIn('Prefix=src_prefix', src)
        self.assertIn('if "/" in name or not name.lower().endswith(PHOTO_EXTENSIONS):', src)
        self.assertIn('obj["LastModified"] > previous["LastModified"]', src)
        self.assertIn('not OVERWRITE and out["LastModified"] >= src["LastModified"]', src)

    def test_historical_asset_backfill_is_non_destructive(self):
        src = (ROOT / "backfill-historical-team-logos.py").read_text()
        self.assertIn('IfNoneMatch="*"', src)
        self.assertIn('if present(s3,dest) or present(s3,f"teams-web/{tid}.webp")', src)
        self.assertIn('DRY_RUN=os.getenv("DRY_RUN","true")', src)
        self.assertNotIn("delete_object(", src)

    def test_period_accurate_draft_team_mapping(self):
        src = (ROOT / "import-player-draft-picks.ts").read_text()
        self.assertIn("tbc_pro_teams_map_raw p", src)
        self.assertIn("lower(trim(p.teamname)) = lower(trim(d.draft_team_name))", src)
        self.assertIn("ORDER BY priority,teamid LIMIT 1", src)

    def test_audit_is_read_only_and_uses_all_season_sources(self):
        src = (ROOT / "audit-team-logo-coverage.py").read_text()
        for table in ("tbc_batting_raw", "tbc_pitching_raw", "tbc_batting_2026_season_raw", "tbc_pitching_2026_season_raw"):
            self.assertIn(table, src)
        self.assertNotIn("put_object(", src)
        self.assertNotIn("UPDATE public.", src)
        self.assertIn("historical_artwork_needed", src)

if __name__ == "__main__":
    unittest.main()
