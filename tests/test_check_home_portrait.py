import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw

from scripts.check_home_portrait import check


class PortraitCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.standard_path = self.root / "standard.json"
        self.standard = {
            "id": "home-portrait-v1", "status": "calibrated",
            "canvas": {"width": 941, "height": 1672},
            "alphaThreshold": 32, "minimumHorizontalMargin": 0.10,
            "tolerances": {"eyePositionPx": 4, "headPositionPx": 6,
                           "headHeightPercent": 1.5, "shoulderPositionPx": 6},
            "anchors": {"eyeCenter": [460, 328], "headTopY": 22, "chinY": 455}
        }
        self.standard_path.write_text(json.dumps(self.standard))
        self.image_path = self.root / "new.webp"
        image = Image.new("RGBA", (941, 1672), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle((150, 25, 790, 1671), fill=(220, 180, 180, 255))
        image.save(self.image_path, "WEBP", quality=85)
        self.landmark_path = self.root / "new.webp.anchors.json"
        self.annotations = {"standard": "home-portrait-v1", "reviewed": True,
                            "anchors": {"eyeCenter": [460, 328], "headTopY": 22, "chinY": 455}}
        self.write_annotation()

    def write_annotation(self):
        self.landmark_path.write_text(json.dumps(self.annotations))

    def check(self):
        return check(self.image_path, self.standard_path, self.landmark_path)

    def test_pass(self):
        self.assertEqual([], self.check())

    def test_provisional_blocks(self):
        self.standard["status"] = "provisional"
        self.standard_path.write_text(json.dumps(self.standard))
        self.assertTrue(any("calibrated" in x for x in self.check()))

    def test_eye_shift_rejected(self):
        self.annotations["anchors"]["eyeCenter"] = [465, 328]
        self.write_annotation()
        self.assertTrue(any("eyeCenter.x" in x for x in self.check()))

    def test_head_height_rejected(self):
        self.annotations["anchors"]["chinY"] = 480
        self.write_annotation()
        self.assertTrue(any("head-height" in x for x in self.check()))

    def test_no_alpha_rejected(self):
        Image.new("RGB", (941, 1672), "white").save(self.image_path, "WEBP")
        self.assertTrue(any("alpha" in x or "transparent" in x for x in self.check()))

    def test_margin_rejected(self):
        im = Image.new("RGBA", (941, 1672), (0, 0, 0, 0))
        ImageDraw.Draw(im).rectangle((0, 25, 790, 1671), fill="red")
        im.save(self.image_path, "WEBP")
        self.assertTrue(any("left transparency" in x for x in self.check()))

    def test_missing_landmarks_rejected(self):
        self.landmark_path.unlink()
        self.assertTrue(any("sidecar" in x for x in self.check()))


if __name__ == "__main__":
    unittest.main()
