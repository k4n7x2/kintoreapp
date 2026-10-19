#!/usr/bin/env python3
"""Validate only the five frozen v2 TRIAL blobs, without granting any v1/v2 position PASS.

All other new home portraits continue to use check_home_portrait.py (PR #14).
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/shiori/proposals/home-private-v2-trial-registration.json"


def check(path_arg: str) -> list[str]:
    issues: list[str] = []
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("status") != "trial-unapproved" or manifest.get("canvas") != [1086, 1448]:
        return ["invalid trial-only manifest status or canvas"]
    path = Path(path_arg).resolve()
    try:
        relative = path.relative_to(ROOT).as_posix()
    except ValueError:
        return ["asset path outside repository"]
    entries = [a for a in manifest["assets"] if a.get("path") == relative]
    if len(entries) != 1:
        return [f"unregistered trial asset: {relative}"]
    expected = entries[0]
    content = path.read_bytes()
    if len(content) != expected["bytes"]:
        issues.append("byte size differs from PR #28")
    if hashlib.sha256(content).hexdigest() != expected["sha256"]:
        issues.append("SHA-256 differs from PR #28")
    blob_hash = hashlib.sha1(b"blob " + str(len(content)).encode("ascii") + bytes([0]) + content).hexdigest()
    if blob_hash != expected["gitBlobSHA"]:
        issues.append("Git blob SHA differs from PR #28")
    try:
        with Image.open(path) as img:
            img.load()
            if img.format != "WEBP" or list(img.size) != manifest["canvas"]:
                issues.append("image format or dimensions differ")
            if "A" not in img.getbands():
                issues.append("alpha channel missing")
            else:
                alpha = img.getchannel("A")
                lo, hi = alpha.getextrema()
                if lo != 0 or hi == 0:
                    issues.append("real transparent and visible pixels are required")
    except (OSError, ValueError) as exc:
        issues.append(f"invalid image: {exc}")
    return issues


def main():
    if len(sys.argv) != 2:
        print("usage: check_home_v2_trial.py IMAGE", file=sys.stderr)
        return 2
    issues = check(sys.argv[1])
    if issues:
        print("TRIAL REJECTED: " + sys.argv[1] + ": " + "; ".join(issues))
        return 1
    print("TRIAL ASSET VERIFIED (hash, alpha, canvas). Landmark certification NOT granted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
