import copy
import json
from pathlib import Path
import unittest

from scripts.verify_home_calibration import validate

REFERENCE = Path(__file__).resolve().parents[1] / "docs/shiori/home-portrait-standard-v1.json"


class ProjectionTest(unittest.TestCase):
    def setUp(self):
        self.reference=json.loads(REFERENCE.read_text(encoding="utf-8"))

    def test_approved_display(self):
        errors,_=validate(self.reference)
        self.assertEqual(errors,[])

    def test_eye_shift_is_rejected(self):
        self.reference["anchors"]["eyeCenter"][0]+=6
        errors,_=validate(self.reference)
        self.assertTrue(any("eyeX" in e for e in errors))

    def test_head_top_shift_is_rejected(self):
        self.reference["anchors"]["headTopY"]+=7
        errors,_=validate(self.reference)
        self.assertTrue(any("headTopY" in e for e in errors))

    def test_uncalibrated_status_is_rejected(self):
        self.reference["status"]="provisional"
        errors,_=validate(self.reference)
        self.assertTrue(any("calibrated" in e for e in errors))


if __name__=="__main__":
    unittest.main()
