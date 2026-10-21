#!/usr/bin/env python3
"""Read-only comparison of ten currently deployed 1086x1448 home portraits.

Measures ALPHA silhouette, iris-purple color centroid proxies, flower-color
centroid proxy, and changes outside the expected face-expression region.
These are heuristic image diagnostics, NOT certified eye-outline landmarks.
Nothing is changed or re-encoded. Run from the repository root:
  python scripts/audit_existing_home_v2.py
"""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GYM = "public/assets/shiori/gim/v1/shiori-gim-story-"
PRIVATE = "public/assets/shiori/home/v2/shiori-private-home-"
PATHS = {
    "gym": {
        "normal": GYM + "normal-alt1-before.webp",
        "thinking": GYM + "thinking-alt1.webp",
        "surprised": GYM + "surprised-alt1.webp",
        "smile": GYM + "smile-alt1.webp",
        "playful": GYM + "playful-alt1.webp",
    },
    "private": {
        name: PRIVATE + name + "-r1.webp"
        for name in ("normal", "thinking", "surprised", "smile", "playful")
    }
}
ROIS = {
    "screen_left_iris_proxy": (350, 375, 515, 525),
    "screen_right_iris_proxy": (530, 285, 690, 430),
    "flower_proxy": (670, 170, 820, 335),
}
# The outer face/eye/mouth area where expressions are *allowed* to differ.
# A changed pixel outside this ROI does not necessarily prove a drawing error,
# but large disagreement means a "face-only layer replacement" did not occur.
FACE_BOX = (330, 265, 725, 630)


def find_purple_centroid(arr, roi):
    x0, y0, x1, y1 = roi
    section = arr[y0:y1, x0:x1]
    rgb = section[:, :, :3].astype(np.float32)
    a = section[:, :, 3]
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mask = ((a > 128) & (blue > red * 1.05) &
            (blue > green * 1.15) & (blue > 110) &
            (red < 235) & (green < 195))
    ys, xs = np.nonzero(mask)
    if len(xs) < 75:
        return {"detected": False, "pixels": int(len(xs))}
    return {"detected": True, "xy": [round(float(xs.mean() + x0), 2),
                                     round(float(ys.mean() + y0), 2)],
            "pixels": int(len(xs))}


def inspect(path):
    p = ROOT / path
    raw = p.read_bytes()
    with Image.open(p) as im:
        fmt = im.format
        bands = im.getbands()
        arr = np.array(im.convert("RGBA"))
    alpha = arr[:, :, 3]
    yy, xx = np.nonzero(alpha > 32)
    if not len(xx):
        raise ValueError(f"no nontransparent pixels: {path}")
    height, width = alpha.shape
    sides = {
        "top": int(np.count_nonzero(alpha[0, :] > 32)),
        "bottom": int(np.count_nonzero(alpha[-1, :] > 32)),
        "left": int(np.count_nonzero(alpha[:, 0] > 32)),
        "right": int(np.count_nonzero(alpha[:, -1] > 32)),
    }
    info = {
        "path": path,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "format": fmt,
        "dimensions": [width, height],
        "native_alpha": "A" in bands,
        "has_fully_transparent_pixels": bool(np.any(alpha == 0)),
        "bbox_alpha_gt32": [int(xx.min()), int(yy.min()),
                            int(xx.max()) + 1, int(yy.max()) + 1],
        "edge_contact_pixels_alpha_gt32": sides,
        "anchors_color_proxies": {
            key: find_purple_centroid(arr, roi) for key, roi in ROIS.items()
        },
    }
    return arr, info


def diff_metrics(reference, image):
    if reference.shape != image.shape:
        return {"error": "different image dimensions"}
    aa = reference[:, :, 3].astype(np.float32) / 255
    ba = image[:, :, 3].astype(np.float32) / 255
    # White compositing avoids hidden garbage pixels counting as drawing changes.
    ar = reference[:, :, :3].astype(np.float32)
    br = image[:, :, :3].astype(np.float32)
    c1 = ar * aa[:, :, None] + 255 * (1 - aa[:, :, None])
    c2 = br * ba[:, :, None] + 255 * (1 - ba[:, :, None])
    amask = reference[:, :, 3] > 32
    bmask = image[:, :, 3] > 32
    inter = np.count_nonzero(amask & bmask)
    union = np.count_nonzero(amask | bmask)
    outside = np.ones(amask.shape, dtype=bool)
    x0, y0, x1, y1 = FACE_BOX
    outside[y0:y1, x0:x1] = False
    working = outside & (amask | bmask)
    change = np.mean(np.abs(c1 - c2), axis=2)
    difference = np.count_nonzero(working & (change > 35))
    working_px = np.count_nonzero(working)
    return {
        "mask_iou": round(inter / max(union, 1), 4),
        "outside_face_union_pixels": int(working_px),
        "outside_face_changed_pixels_mean_rgb_gt35": int(difference),
        "outside_face_changed_percent": round(difference / max(working_px, 1) * 100, 2),
        "interpretation": "heuristic, includes shading and re-drawing, NOT direct eye anchor or anatomical validation"
    }


def main():
    report = {
        "name": "Existing v2 close-up portrait comparative diagnostics",
        "referenceCommit": "f7148b56734f76faef386c97b4482c9c3e2f3508",
        "status": "diagnostic-not-calibrated",
        "faceRegionExcludedFromDrawDifference": list(FACE_BOX),
        "assets": {},
        "groupComparisons": {},
        "warnings": [],
    }
    cache = {}
    for group, variants in PATHS.items():
        for expression, path in variants.items():
            arr, info = inspect(path)
            cache[(group, expression)] = arr
            report["assets"][f"{group}/{expression}"] = info
            if info["dimensions"] != [1086, 1448] or not info["native_alpha"]:
                report["warnings"].append(f"{group}/{expression}: unexpected size/alpha")
        for expression in variants:
            if expression == "normal":
                continue
            ref = cache[(group, "normal")]
            im = cache[(group, expression)]
            report["groupComparisons"][f"{group}/{expression} vs normal"] = diff_metrics(ref, im)
    for expression in PATHS["gym"]:
        g = report["assets"][f"gym/{expression}"]["anchors_color_proxies"]
        p = report["assets"][f"private/{expression}"]["anchors_color_proxies"]
        for key in ROIS:
            ga, pa = g[key], p[key]
            if ga.get("detected") and pa.get("detected"):
                dx = round(pa["xy"][0] - ga["xy"][0], 2)
                dy = round(pa["xy"][1] - ga["xy"][1], 2)
                report.setdefault("crossGroupColorCentroidProxyDelta", {}).setdefault(expression, {})[key] = [dx, dy]
    print("BEGIN_HOME_V2_AUDIT_JSON")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("END_HOME_V2_AUDIT_JSON")
    print("NOTICE: iris COLOR centroids are not anatomical eye-outline centers,")
    print("and clothing silhouettes differ legitimately across groups.")
    return 0 if not report["warnings"] else 1


if __name__ == "__main__":
    sys.exit(main())
