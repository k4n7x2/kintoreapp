#!/usr/bin/env python3
"""Check NEW standard home portraits; existing images are not retroactively certified.

Usage: python scripts/check_home_portrait.py IMAGE [--landmarks IMAGE.anchors.json]
The landmarks sidecar is a reviewed, image-pixel annotation, NOT auto face detection.
"""
import argparse
import json
from pathlib import Path
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("ERROR: Pillow is required (python -m pip install Pillow)")

DEFAULT_STANDARD = Path(__file__).resolve().parents[1] / "docs/shiori/home-portrait-standard-v1.json"


def error(out, message):
    out.append(message)


def valid_point(value, name, width, height, issues):
    if (not isinstance(value, list) or len(value) != 2 or
            any(isinstance(n, bool) or not isinstance(n, (int, float)) for n in value)):
        error(issues, f"{name}: expected [x, y] numeric coordinates")
        return None
    x, y = value
    if not (0 <= x < width and 0 <= y < height):
        error(issues, f"{name}: point {value} outside {width}x{height} canvas")
        return None
    return (x, y)


def check(image_path, standard_path, landmarks_path, allow_provisional=False):
    issues = []
    try:
        standard = json.loads(Path(standard_path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"cannot read standard JSON: {e}"]
    dims = standard.get("canvas", {})
    width, height = dims.get("width"), dims.get("height")
    if not (isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0):
        return ["standard JSON has invalid canvas dimensions"]
    if standard.get("status") != "calibrated" and not allow_provisional:
        error(issues, "standard has no verified pixel anchors (status must be 'calibrated')")
    try:
        with Image.open(image_path) as im:
            fmt, size, bands = im.format, im.size, im.getbands()
            if fmt not in ("PNG", "WEBP"):
                error(issues, f"format must be PNG or WebP, got {fmt}")
            if size != (width, height):
                error(issues, f"canvas mismatch: {size}, expected {(width, height)}")
            if "A" not in bands and "transparency" not in im.info:
                error(issues, "no alpha channel / palette transparency")
            rgba = im.convert("RGBA")
            alpha = rgba.getchannel("A")
            if alpha.getextrema()[0] != 0:
                error(issues, "background is not truly transparent (no alpha=0 pixels)")
            threshold = standard.get("alphaThreshold", 32)
            opaque = alpha.point(lambda a: 255 if a > threshold else 0)
            bbox = opaque.getbbox()
            if bbox is None:
                error(issues, "image has no visible character pixels")
            else:
                min_margin = standard.get("minimumHorizontalMargin", 0.10)
                left = bbox[0] / size[0]
                right = (size[0] - bbox[2]) / size[0]
                if left < min_margin:
                    error(issues, f"left transparency {left:.1%} < {min_margin:.0%}")
                if right < min_margin:
                    error(issues, f"right transparency {right:.1%} < {min_margin:.0%}")
                if bbox[1] == 0:
                    error(issues, "hair/head touches the top edge")
    except (OSError, ValueError, ZeroDivisionError) as e:
        return issues + [f"cannot inspect image: {e}"]

    try:
        annotations = json.loads(Path(landmarks_path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return issues + [f"missing/unreadable landmark sidecar: {landmarks_path} ({e})"]
    if annotations.get("standard") != standard.get("id"):
        error(issues, "sidecar standard ID does not match the manifest")
    if annotations.get("reviewed") is not True:
        error(issues, "landmarks were not marked as manually reviewed")
    anchors = standard.get("anchors")
    measured = annotations.get("anchors", {})
    if not isinstance(anchors, dict) or not all(k in anchors for k in ("eyeCenter", "headTopY", "chinY")):
        return issues + ["reference anchors not calibrated; no comparison can be made"]
    if not isinstance(measured, dict):
        return issues + ["invalid sidecar anchors"]
    reference_eye = valid_point(anchors["eyeCenter"], "reference.eyeCenter", width, height, issues)
    image_eye = valid_point(measured.get("eyeCenter"), "image.eyeCenter", width, height, issues)
    if reference_eye and image_eye:
        tolerance = standard["tolerances"]["eyePositionPx"]
        for axis, a, b in zip("xy", image_eye, reference_eye):
            if abs(a - b) > tolerance:
                error(issues, f"eyeCenter.{axis} delta {a-b:+g}px exceeds +/-{tolerance}px")
    for name in ("headTopY", "chinY"):
        ref, actual = anchors[name], measured.get(name)
        if not isinstance(actual, (int, float)) or isinstance(actual, bool) or not 0 <= actual < height:
            error(issues, f"{name}: missing/invalid image-pixel y coordinate")
        elif abs(actual - ref) > standard["tolerances"]["headPositionPx"]:
            error(issues, f"{name} delta {actual-ref:+g}px exceeds head-position tolerance")
    if all(isinstance(measured.get(k), (int, float)) for k in ("headTopY", "chinY")):
        head = measured["chinY"] - measured["headTopY"]
        baseline = anchors["chinY"] - anchors["headTopY"]
        if baseline <= 0 or head <= 0:
            error(issues, "head height must be positive")
        elif abs(head-baseline) / baseline * 100 > standard["tolerances"]["headHeightPercent"]:
            error(issues, f"head-height difference {100*(head-baseline)/baseline:+.2f}% exceeds tolerance")
    if annotations.get("samePoseAsReference"):
        for name in ("leftShoulder", "rightShoulder"):
            ref = valid_point(anchors.get(name), f"reference.{name}", width, height, issues)
            measured_pt = valid_point(measured.get(name), f"image.{name}", width, height, issues)
            if ref and measured_pt and any(abs(a-b) > standard["tolerances"]["shoulderPositionPx"] for a, b in zip(ref, measured_pt)):
                error(issues, f"{name} differs from same-pose reference")
    return issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path, help="new PNG or WebP portrait")
    parser.add_argument("--standard", type=Path, default=DEFAULT_STANDARD)
    parser.add_argument("--landmarks", type=Path, help="reviewed coordinate sidecar (default: IMAGE.anchors.json)")
    parser.add_argument("--allow-provisional", action="store_true", help="development diagnosis only: skip status gate, never use in PR gate")
    args = parser.parse_args()
    sidecar = args.landmarks or Path(str(args.image) + ".anchors.json")
    issues = check(args.image, args.standard, sidecar, args.allow_provisional)
    if issues:
        print(f"FAIL {args.image}\n" + "\n".join(" - " + i for i in issues))
        return 1
    print(f"PASS {args.image}: geometry, alpha, margins and reviewed anchors conform")
    print("NOTE: art/face identity, clothing, natural crop and in-app appearance still need human review")
    return 0


if __name__ == "__main__":
    sys.exit(main())
