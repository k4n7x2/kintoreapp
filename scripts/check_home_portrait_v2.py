#!/usr/bin/env python3
"""Fail-closed QA for new Home Portrait Standard v2 close-up images.

The script validates PNG/WebP dimensions, alpha, annotated eye/chin placement,
and binding of annotations to exact image bytes. It does NOT detect facial
landmarks automatically or certify character likeness and natural edge crops.

Use: python scripts/check_home_portrait_v2.py IMAGE
     python scripts/check_home_portrait_v2.py IMAGE --allow-provisional  # diagnostics only
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

from PIL import Image, UnidentifiedImageError

DEFAULT_STANDARD = (
    Path(__file__).resolve().parents[1]
    / "docs/shiori/home-portrait-standard-v2.json"
)


def point(value, label, width, height, problems):
    if (not isinstance(value, (list, tuple)) or len(value) != 2
            or any(isinstance(n, bool) or not isinstance(n, (int, float))
                   or not math.isfinite(n) for n in value)):
        problems.append(f"{label}: expected finite numeric [x,y]")
        return None
    x, y = value
    if not (0 <= x < width and 0 <= y < height):
        problems.append(f"{label}: {value} is outside {width}x{height}")
        return None
    return (float(x), float(y))


def validate(image_path, standard_path=DEFAULT_STANDARD, landmarks_path=None,
             allow_provisional=False):
    problems = []
    try:
        spec = json.loads(Path(standard_path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"cannot read standard: {exc}"]
    w = spec.get("geometry", {}).get("canvas", {}).get("width")
    h = spec.get("geometry", {}).get("canvas", {}).get("height")
    if not (type(w) is int and type(h) is int and w > 0 and h > 0):
        return ["invalid standard canvas"]
    if spec.get("status") != "calibrated" and not allow_provisional:
        problems.append("v2 anchors not calibrated; release PASS is forbidden")
    image_path = Path(image_path)
    try:
        image_bytes = image_path.read_bytes()
        image_sha = hashlib.sha256(image_bytes).hexdigest()
        with Image.open(image_path) as im:
            if im.format not in ("PNG", "WEBP"):
                problems.append(f"format {im.format}: only PNG and WebP allowed")
            if im.size != (w, h):
                problems.append(f"canvas {im.size}, expected ({w}, {h})")
            if "A" not in im.getbands() and "transparency" not in im.info:
                problems.append("image has no actual alpha channel")
            rgba = im.convert("RGBA")
            alpha = rgba.getchannel("A")
            alpha_min, alpha_max = alpha.getextrema()
            if alpha_min != 0:
                problems.append("no fully transparent pixels (alpha=0)")
            if alpha_max <= 32:
                problems.append("no visible artwork (alpha>32)")
            # Unlike v1, v2 intentionally allows visible pixels touching all edges.
            # Edge quality and natural cropping require separate human review.
    except (OSError, ValueError, UnidentifiedImageError) as exc:
        return problems + [f"cannot inspect image: {exc}"]
    sidecar = Path(landmarks_path or (str(image_path) + ".anchors.json"))
    try:
        data = json.loads(sidecar.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return problems + [f"missing/invalid landmark sidecar: {exc}"]
    if data.get("standard") != spec.get("standardId"):
        problems.append("sidecar standardId mismatch")
    if data.get("reviewed") is not True:
        problems.append("landmarks require human review before acceptance")
    if data.get("imageSHA256") != image_sha:
        problems.append("sidecar imageSHA256 does not match exact image bytes")
    if not data.get("reviewerNote") or not isinstance(data.get("reviewerNote"), str):
        problems.append("sidecar must explain the human annotation review")
    raw = data.get("anchors", {})
    if not isinstance(raw, dict):
        return problems + ["sidecar anchors must be an object"]
    baseline = spec.get("geometry", {}).get("anchors", {})
    thresholds = spec.get("proposedThresholdsAfterCalibration", {})
    mapping = ("screenLeftEyeOutlineCenter", "screenRightEyeOutlineCenter", "chinTip")
    refs = {name: point(baseline.get(name), "reference." + name, w, h, problems)
            for name in mapping}
    actuals = {name: point(raw.get(name), "image." + name, w, h, problems)
               for name in mapping}
    if all(refs.values()) and all(actuals.values()):
        left, right = mapping[:2]
        ref_mid = tuple((refs[left][i] + refs[right][i]) / 2 for i in (0, 1))
        img_mid = tuple((actuals[left][i] + actuals[right][i]) / 2 for i in (0, 1))
        # Baseline midpoint stored in JSON must agree with the baseline eye points.
        saved_mid = baseline.get("eyeMidpoint")
        if (not isinstance(saved_mid, list) or len(saved_mid) != 2
                or any(abs(ref_mid[i] - saved_mid[i]) > 0.5 for i in (0, 1))):
            problems.append("reference eyeMidpoint conflicts with eye anchors")
        eye_tolerance = thresholds.get("eyeMidpointPerAxisPx")
        chin_tolerance = thresholds.get("chinTipPerAxisPx")
        sep_tolerance = thresholds.get("eyeSeparationPercent")
        if not all(type(n) in (int, float) and n > 0 and math.isfinite(n)
                   for n in (eye_tolerance, chin_tolerance, sep_tolerance)):
            return problems + ["invalid tolerance configuration"]
        for axis, i in (("x", 0), ("y", 1)):
            deviation = img_mid[i] - ref_mid[i]
            if abs(deviation) > eye_tolerance:
                problems.append(f"eye midpoint {axis}: delta {deviation:+.2f}px exceeds ±{eye_tolerance}px")
            chin_diff = actuals["chinTip"][i] - refs["chinTip"][i]
            if abs(chin_diff) > chin_tolerance:
                problems.append(f"chin {axis}: delta {chin_diff:+.2f}px exceeds ±{chin_tolerance}px")
        ref_sep = math.dist(refs[left], refs[right])
        img_sep = math.dist(actuals[left], actuals[right])
        if ref_sep <= 0:
            problems.append("reference eye separation must be positive")
        elif abs(img_sep / ref_sep - 1) * 100 > sep_tolerance:
            problems.append(f"eye separation: delta {(img_sep/ref_sep-1)*100:+.2f}% exceeds ±{sep_tolerance}%")
    if data.get("samePoseAsReference") is True:
        for name in ("leftShoulder", "rightShoulder"):
            # Shoulder placement must never be silently passed when unmeasured.
            if point(baseline.get(name), "reference." + name, w, h, problems) is None:
                continue
            point(raw.get(name), "image." + name, w, h, problems)
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--standard", type=Path, default=DEFAULT_STANDARD)
    parser.add_argument("--landmarks", type=Path)
    parser.add_argument("--allow-provisional", action="store_true",
                        help="diagnostic only; NEVER enable in GitHub PR gate")
    args = parser.parse_args()
    issues = validate(args.image, args.standard, args.landmarks, args.allow_provisional)
    if issues:
        print("FAIL:", args.image)
        for issue in issues:
            print(" -", issue)
        return 1
    label = "DIAGNOSTIC ONLY" if args.allow_provisional else "PASS"
    print(f"{label}: {args.image} — format, alpha, canvas and reviewed anchors")
    print("Separate human checks: likeness, hair, outfit, natural edge crops, Android UI.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
