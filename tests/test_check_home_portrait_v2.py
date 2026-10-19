"""Technical-only v2 QA: synthetic image tests, not visual approval."""
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw

from scripts.check_home_portrait_v2 import validate


class HomePortraitV2TechnicalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.spec_path = root / "v2.json"
        self.img_path = root / "test.webp"
        self.spec = {
            "standardId": "home-portrait-v2-trial",
            "status": "private-five-selected-generation-rules-active-draft",
            "geometry": {"canvas": {"width": 1086, "height": 1448}},
        }
        self.save_spec()
        self.save_image()

    def save_spec(self):
        self.spec_path.write_text(json.dumps(self.spec), encoding="utf-8")

    def save_image(self, size=(1086, 1448), rgb=False, alpha=True, fmt="WEBP"):
        if rgb:
            img = Image.new("RGB", size, "white")
        else:
            img = Image.new("RGBA", size, (0, 0, 0, 0) if alpha else (255, 255, 255, 255))
            ImageDraw.Draw(img).rectangle((90, 90, 900, 1400),
                                           fill=(100, 90, 190, 255))
        self.img_path = self.img_path.with_suffix("." + fmt.lower())
        img.save(self.img_path, fmt, quality=85)

    def check(self):
        return validate(self.img_path, self.spec_path)

    def test_valid_transparent_webp(self):
        self.assertEqual([], self.check())

    def test_valid_transparent_png(self):
        self.save_image(fmt="PNG")
        self.assertEqual([], self.check())

    def test_no_landmark_sidecar_required(self):
        self.assertFalse(Path(str(self.img_path) + ".anchors.json").exists())
        self.assertEqual([], self.check())

    def test_unapproved_standard_does_not_block_technical_check(self):
        self.spec["status"] = "uncalibrated"
        self.spec["geometry"]["anchors"] = {}
        self.save_spec()
        self.assertEqual([], self.check())

    def test_eye_and_chin_coordinates_are_not_compared(self):
        self.spec["geometry"]["anchors"] = {"eyeMidpoint": [0, 0], "chinTip": [0, 0]}
        self.save_spec()
        self.assertEqual([], self.check())

    def test_incorrect_dimensions_fail(self):
        self.save_image(size=(950, 1450))
        self.assertTrue(any("canvas" in x for x in self.check()))

    def test_missing_alpha_fails(self):
        self.save_image(rgb=True)
        self.assertTrue(any("alpha" in x for x in self.check()))

    def test_fully_opaque_fails(self):
        self.save_image(alpha=False)
        self.assertTrue(any("transparent" in x for x in self.check()))

    def test_fully_transparent_fails(self):
        img = Image.new("RGBA", (1086, 1448), (0, 0, 0, 0))
        img.save(self.img_path, "WEBP", quality=85)
        self.assertTrue(any("visible artwork" in x for x in self.check()))

    def test_no_failure_for_intentional_edge_contact(self):
        img = Image.new("RGBA", (1086, 1448), (240, 240, 240, 255))
        ImageDraw.Draw(img).rectangle((300, 300, 400, 400),
                                       fill=(0, 0, 0, 0))
        img.save(self.img_path, "WEBP", quality=85)
        self.assertEqual([], self.check())

    def test_corrupt_file_fails(self):
        self.img_path.write_bytes(b"invalid webp")
        self.assertTrue(any("unreadable" in x for x in self.check()))

    def test_unsupported_jpeg_fails(self):
        self.img_path = self.img_path.with_suffix(".jpg")
        Image.new("RGB", (1086, 1448), "white").save(self.img_path, "JPEG")
        self.assertTrue(any("image format" in x for x in self.check()))

    def test_wrong_standard_id_fails(self):
        self.spec["standardId"] = "wrong"
        self.save_spec()
        self.assertTrue(any("standard ID" in x for x in self.check()))

    def test_bad_standard_dimensions_fail(self):
        self.spec["geometry"]["canvas"]["width"] = "1086"
        self.save_spec()
        self.assertTrue(any("standard canvas" in x for x in self.check()))


if __name__ == "__main__":
    unittest.main()
