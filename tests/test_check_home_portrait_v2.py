"""Synthetic regression tests for v2 QA; do not certify a real portrait."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw

from scripts.check_home_portrait_v2 import validate


class HomePortraitV2Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.standard = {
            "standardId": "home-portrait-v2-trial",
            "status": "calibrated",
            "geometry": {
                "canvas": {"width": 1086, "height": 1448},
                "anchors": {
                    "screenLeftEyeOutlineCenter": [423, 448],
                    "screenRightEyeOutlineCenter": [583, 356],
                    "eyeMidpoint": [503, 402],
                    "chinTip": [592, 585],
                },
            },
            "proposedThresholdsAfterCalibration": {
                "eyeMidpointPerAxisPx": 6,
                "eyeSeparationPercent": 2,
                "chinTipPerAxisPx": 8,
            },
        }
        self.std_path = self.root / "standard.json"
        self.img_path = self.root / "portrait.webp"
        self.sidecar_path = self.root / "portrait.webp.anchors.json"
        image = Image.new("RGBA", (1086, 1448), (0, 0, 0, 0))
        # Deliberately touch all 4 edges: this is valid for close-up v2.
        ImageDraw.Draw(image).rectangle((0, 0, 1085, 1447), fill=(190, 160, 210, 255))
        ImageDraw.Draw(image).rectangle((20, 20, 200, 200), fill=(0, 0, 0, 0))
        self.save(image)
        self.sidecar = {
            "standard": "home-portrait-v2-trial",
            "reviewed": True,
            "reviewerNote": "Manually marked centers; synthetic image fixture",
            "samePoseAsReference": False,
            "anchors": {
                "screenLeftEyeOutlineCenter": [423, 448],
                "screenRightEyeOutlineCenter": [583, 356],
                "chinTip": [592, 585],
            },
        }
        self.persist()

    def save(self, image):
        image.save(self.img_path, "WEBP", quality=85)

    def persist(self):
        self.std_path.write_text(json.dumps(self.standard), encoding="utf-8")
        self.sidecar["imageSHA256"] = hashlib.sha256(self.img_path.read_bytes()).hexdigest()
        self.sidecar_path.write_text(json.dumps(self.sidecar), encoding="utf-8")

    def check(self, **kw):
        return validate(self.img_path, self.std_path, self.sidecar_path, **kw)

    def test_closeup_with_edge_contacts_is_valid(self):
        self.assertEqual([], self.check())

    def test_provisional_spec_refuses_release_pass(self):
        self.standard["status"] = "candidate-anchoring-pending"
        self.persist()
        self.assertTrue(any("not calibrated" in e for e in self.check()))
        self.assertEqual([], self.check(allow_provisional=True))

    def test_missing_image_landmarks_fail(self):
        self.sidecar_path.unlink()
        self.assertTrue(any("sidecar" in e for e in self.check()))

    def test_sidecar_bound_to_exact_image_bytes(self):
        self.sidecar["imageSHA256"] = "0" * 64
        self.persist()
        self.sidecar["imageSHA256"] = "0" * 64
        self.sidecar_path.write_text(json.dumps(self.sidecar), encoding="utf-8")
        self.assertTrue(any("imageSHA256" in e for e in self.check()))

    def test_unreviewed_fail(self):
        self.sidecar["reviewed"] = False
        self.persist()
        self.assertTrue(any("human review" in e for e in self.check()))

    def test_wrong_dimensions_fail(self):
        self.save(Image.new("RGBA", (600, 800), (0, 0, 0, 0)))
        self.persist()
        self.assertTrue(any("canvas" in e for e in self.check()))

    def test_no_real_alpha_fails(self):
        Image.new("RGB", (1086, 1448), "white").save(self.img_path, "WEBP")
        self.persist()
        self.assertTrue(any("alpha" in e for e in self.check()))

    def test_eye_shift_fails(self):
        for name in ("screenLeftEyeOutlineCenter", "screenRightEyeOutlineCenter"):
            self.sidecar["anchors"][name][0] += 7
        self.persist()
        self.assertTrue(any("midpoint x" in e for e in self.check()))

    def test_eye_distance_fails(self):
        self.sidecar["anchors"]["screenRightEyeOutlineCenter"][0] += 12
        self.persist()
        self.assertTrue(any("eye separation" in e for e in self.check()))

    def test_chin_shift_fails(self):
        self.sidecar["anchors"]["chinTip"][1] += 9
        self.persist()
        self.assertTrue(any("chin y" in e for e in self.check()))

    def test_shoulder_same_pose_fails_when_reference_missing(self):
        self.sidecar["samePoseAsReference"] = True
        self.persist()
        self.assertTrue(any("reference.leftShoulder" in e for e in self.check()))

    def test_inconsistent_reference_midpoint_fails(self):
        self.standard["geometry"]["anchors"]["eyeMidpoint"] = [490, 390]
        self.persist()
        self.assertTrue(any("conflicts" in e for e in self.check()))


if __name__ == "__main__":
    unittest.main()
