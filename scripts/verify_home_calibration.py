#!/usr/bin/env python3
"""Check the calibrated screenshot-to-image placement recorded in the standard JSON.

This is a geometry verification, not automatic eye detection. Original screenshots
stay private; approved SCREEN landmarks are inverted to nominal source coordinates.
"""
import json
import math
from pathlib import Path

DEFAULT = Path(__file__).resolve().parents[1] / "docs/shiori/home-portrait-standard-v1.json"


def project(data):
    c=data["calibration"]
    inp=c["input"]
    css=c["cssSnapshot"]
    vw=inp["cssViewportWidthPx"]
    pixel_per_css=inp["screenshotSize"][0] / vw
    vh=(inp["webPageBottomPx"]-inp["webPageTopPx"])/pixel_per_css
    width,height=data["canvas"]["width"],data["canvas"]["height"]
    stage_width=vw-2*css["appHorizontalPadding"]
    stage_height=vh-css["headerHeight"]-css["stageHeightReduction"]
    scene_width=stage_width+css["sceneWidthExtra"]
    scene_height=stage_height+css["sceneHeightExtra"]
    layer_width=scene_width*css["layerWidthRatio"]
    touch_height=layer_width*height/width
    touch_left=(css["appHorizontalPadding"]+stage_width+css["sceneWidthExtra"]
                -layer_width-css["characterRightOffset"])
    touch_top=(css["dateMarginTop"]+css["dateHeight"]+css["sceneTopOffset"]
               +scene_height-touch_height-css["bottom"])
    scale=css["scale"]
    ox,oy=css["transformOrigin"]
    left=pixel_per_css*(touch_left+(1-scale)*ox*layer_width)
    top=inp["webPageTopPx"]+pixel_per_css*(css["headerHeight"]+touch_top+(1-scale)*oy*touch_height)
    px_per_image=pixel_per_css*layer_width*scale/width
    return left,top,px_per_image


def validate(data, tolerance_screen_px=2):
    errors=[]
    if data.get("status")!="calibrated":
        errors.append("reference must be calibrated")
    left,top,k=project(data)
    a=data["anchors"]
    s=data["calibration"]["screenLandmarks"]
    pred={"eyeX":left+k*a["eyeCenter"][0],"eyeY":top+k*a["eyeCenter"][1],
          "headTopY":top+k*a["headTopY"],"chinY":top+k*a["chinY"]}
    observed={"eyeX":s["eyeCenter"][0],"eyeY":s["eyeCenter"][1],
              "headTopY":s["headTopY"],"chinY":s["chinY"]}
    for key in pred:
        diff=pred[key]-observed[key]
        if not math.isfinite(diff) or abs(diff)>tolerance_screen_px:
            errors.append(f"{key} differs from approved display by {diff:+.3f} screen px")
    return errors,pred


if __name__=="__main__":
    import argparse,sys
    parser=argparse.ArgumentParser()
    parser.add_argument("--standard",type=Path,default=DEFAULT)
    args=parser.parse_args()
    try:
        ref=json.loads(args.standard.read_text(encoding="utf-8"))
        failures,points=validate(ref)
    except (OSError,ValueError,KeyError,TypeError,ZeroDivisionError) as ex:
        sys.exit(f"FAIL: reference unavailable or invalid: {ex}")
    for name,position in points.items():
        print(f"{name}: {position:.3f} screen px")
    if failures:sys.exit("FAIL: "+"; ".join(failures))
    print("PASS: calibrated image-coordinate anchors match the approved screen geometry")
    print("Note: face identity, shoulder landmarks and actual new-image rendering still need review")
