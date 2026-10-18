import hashlib
import os
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from publish_verified_hs_logos import can_auto_publish, put_live_if_missing
from plan_hs_logo_batches import build_plan
from fetch_hs_logos_expanded import school_selection_sql


def png():
    im=Image.new("RGBA",(64,64),(0,0,0,0))
    for x in range(10,54):
        for y in range(10,54):
            im.putpixel((x,y),(50,80,90,255))
    out=io.BytesIO()
    im.save(out,format="PNG")
    return out.getvalue()


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.data=png()
        self.digest=hashlib.sha256(self.data).hexdigest()
        self.school={"hsid":"4","name":"Melbourne","nickname":"Bulldogs","city":"Melbourne","state":"FL"}
        self.row={"score":100,"runner_up":45,"image_sha256":self.digest}
        self.verified={"status":"VERIFIED_PENDING_VISUAL_REVIEW","failures":"","review_flags":"","sha256":self.digest}

    def test_verification_allows_high_confidence_exact_source(self):
        self.assertEqual((True,""),can_auto_publish(self.verified,self.row,False))

    def test_uncertain_source_never_publishes(self):
        for warning in ("source_page_mascot_unavailable","source_url_school_name_not_exact",
                        "source_match_ambiguous"):
            self.assertFalse(can_auto_publish({**self.verified,"review_flags":warning},self.row,False)[0])

    def test_failed_verification_never_publishes(self):
        self.assertFalse(can_auto_publish({**self.verified,"status":"FAILED","failures":"wrong_school"},self.row,False)[0])

    def test_legacy_requires_fresh_source_hash(self):
        r={**self.verified,"review_flags":"legacy_s3_object_without_provenance_metadata",
           "status":"REVIEW_REQUIRED"}
        self.assertTrue(can_auto_publish(r,self.row,True)[0])
        self.assertFalse(can_auto_publish(r,{**self.row,"image_sha256":""},True)[0])

    def test_publish_conditional_and_readback(self):
        client=MagicMock()
        client.get_object.return_value={"Body":io.BytesIO(self.data),"ContentType":"image/png"}
        result=put_live_if_missing(client,"yatstats-assets","schools/4.png",self.data,self.school,"https://www.maxpreps.com/fl/melbourne/melbourne-bulldogs/")
        self.assertEqual(result,"published")
        kw=client.put_object.call_args.kwargs
        self.assertEqual(kw["IfNoneMatch"],"*")
        self.assertEqual(kw["Key"],"schools/4.png")
        self.assertEqual(kw["Metadata"]["hsid"],"4")
        self.assertEqual(kw["Metadata"]["source-sha256"],self.digest)

    def test_checksum_mismatch_fails_closed(self):
        client=MagicMock()
        client.get_object.return_value={"Body":io.BytesIO(b"corrupt"),"ContentType":"image/png"}
        with self.assertRaises(RuntimeError):
            put_live_if_missing(client,"yatstats-assets","schools/4.png",self.data,self.school,"")

    def test_linked_scope_is_player_join(self):
        sql = school_selection_sql("linked")
        self.assertIn("JOIN public.tbc_schools_raw", sql)
        self.assertIn("public.player_hsids", sql)

    def test_all_scope_is_every_master_school(self):
        sql = school_selection_sql("all")
        self.assertIn("FROM public.tbc_schools_raw", sql)
        self.assertNotIn("player_hsids", sql)
        self.assertIn("ORDER BY t.hsid", sql)

    def test_invalid_scope_rejected(self):
        with self.assertRaises(ValueError):
            school_selection_sql("unknown")

    def test_plan_includes_previously_staged_for_approval(self):
        schools=[{"hsid":str(i),"name":"x","state":"AZ"} for i in range(1,103)]
        p=build_plan(schools,{"1" },set(),100)
        self.assertEqual(p["batch_count"],2)
        self.assertIn("2",p["batches"][0]["hsids"].split(","))


if __name__=="__main__":
    unittest.main()
