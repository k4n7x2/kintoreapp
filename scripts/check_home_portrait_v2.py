#!/usr/bin/env python3
"""Technical-only file validator for Home Portrait Standard v2.

Validates structural properties that can be objectively checked: image decode,
actual format, exact canvas dimensions, and real alpha including both transparent
and visible pixels. It does not compute or gate facial coordinates.

A successful check means TECHNICAL PASS ONLY; human review of identity,
expression, hair, pose, head framing, outfit, transparent edge aesthetics,
and Android switching is still required. See
docs/shiori/home-portrait-v2-generation-rules.md.

Use: python scripts/check_home_portrait_v2.py IMAGE
"""
import argparse
import json
from pathlib import Path
import sys

from PIL import Image, UnidentifiedImageError

DEFAULT_STANDARD = (Path(__file__).resolve().parents[1]
                    / "docs/shiori/home-portrait-standard-v2.json")
VALID_FORMATS = {"PNG", "WEBP"}


def validate(image_path, standard_path=DEFAULT_STANDARD):
    problems = []
    try:
        spec = json.loads(Path(standard_path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"cannot read v2 standard: {exc}"]
    if spec.get("standardId") != "home-portrait-v2-trial":
        return ["invalid v2 standard ID"]
    canvas = spec.get("geometry", {}).get("canvas", {})
    width, height = canvas.get("width"), canvas.get("height")
    if (type(width) is not int or type(height) is not int
            or width <= 0 or height <= 0):
        return ["invalid v2 standard canvas"]
    try:
        with Image.open(image_path) as im:
            if im.format not in VALID_FORMATS:
                problems.append(f"image format {im.format}, expected PNG or WEBP")
            if im.size != (width, height):
                problems.append(f"canvas {im.size}, expected ({width}, {height})")
            # Photoshop-like transparent headers are not sufficient:
            # the decoded image must contain both fully transparent and visible pixels.
            if "A" not in im.getbands() and "transparency" not in im.info:
                problems.append("image has no alpha/transparency information")
            rgba = im.convert("RGBA")
            a_min, a_max = rgba.getchannel("A").getextrema()
            if a_min != 0:
                problems.append("no completely transparent pixels (alpha 0)")
            if a_max <= 32:
                problems.append("no visible artwork (alpha > 32)")
            im.verify()
    except (OSError, ValueError, UnidentifiedImageError) as exc:
        return problems + [f"image unreadable or corrupted: {exc}"]
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--standard", type=Path, default=DEFAULT_STANDARD)
    args = parser.parse_args()
    issues = validate(args.image, args.standard)
    if issues:
        print("TECHNICAL FAIL:", args.image)
        for issue in issues:
            print(" -", issue)
        return 1
    print("TECHNICAL PASS ONLY:", args.image)
    print("Required separately: human comparison with private five references,")
    print("expression and head-framing review, and Android same-viewport check.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
