import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from plan_hs_logo_batches import build_plan

class PlanTests(unittest.TestCase):
    def test_skip_live_and_staged_and_keep_real_ids(self):
        schools = [
            {"hsid": str(i), "name": "School", "state": "AZ"}
            for i in [4, 5, 6, 100, 8000]
        ]
        plan = build_plan(schools, {"4", "100"}, {"5"}, batch_size=2)
        self.assertEqual(plan["remaining"], 2)
        self.assertEqual(plan["batch_count"], 1)
        self.assertEqual(plan["batches"][0]["hsids"], "6,8000")
    def test_many_batches_no_manual_limit(self):
        schools = [
            {"hsid": str(i), "name": "School", "state": "AZ"}
            for i in range(1, 7001)
        ]
        plan = build_plan(schools, set(), set(), batch_size=100)
        self.assertEqual(plan["batch_count"], 70)
        self.assertEqual(plan["batches"][-1]["last_hsid"], "7000")
    def test_duplicate_id_fails(self):
        schools = [{"hsid": "4", "name": "X", "state": "AZ"}] * 2
        with self.assertRaises(ValueError):
            build_plan(schools, set(), set())
if __name__ == "__main__":
    unittest.main()
