#!/usr/bin/env python3
"""Strict pre-registration validation of a portrait and its reviewed pixel annotations.

This checks image structure and human-supplied landmarks, NOT the truth of face
landmark positions. A reviewer must visually confirm an overlay against the
exact source bytes. Certification of the full artwork requires separate QA.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

from PIL import Image, ImageSequence

DEFAULT_STANDARD = Path(__file__).resolve().parents[1] / 'docs/shiori/home-portrait-standard-v1.json'


def _read_json(path):
    def reject_constant(value):
        raise ValueError(f'non-finite JSON constant {value}')
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'), parse_constant=reject_constant)
    except (OSError, ValueError) as exc:
        return None, [f'cannot read JSON {path}: {exc}']
    if not isinstance(data, dict):
        return None, [f'JSON root must be an object: {path}']
    return data, []


def _numeric(value, *, integer=False):
    return (not isinstance(value, bool) and isinstance(value, (int, float))
            and math.isfinite(value) and (not integer or isinstance(value, int)))


def _point(value, name, width, height, issues):
    if (not isinstance(value, list) or len(value) != 2 or
        not all(_numeric(k) for k in value) or
        not (0 <= value[0] < width and 0 <= value[1] < height)):
        issues.append(f'{name}: expected [x,y] finite coordinates inside canvas')
        return None
    return value


def _height(value, name, max_height, issues):
    if not _numeric(value) or not 0 <= value < max_height:
        issues.append(f'{name}: finite y-coordinate required inside canvas')
        return None
    return value


def _validate_standard(s, allow_provisional):
    errors=[]
    if s.get('id') != 'home-portrait-v1':
        errors.append('unsupported standard ID')
    if s.get('status') != 'calibrated' and not allow_provisional:
        errors.append("standard is not calibrated; cannot issue PASS")
    canvas=s.get('canvas')
    if not isinstance(canvas, dict):
        return None, errors + ['standard.canvas must be an object']
    w,h=canvas.get('width'),canvas.get('height')
    if not all(_numeric(v,integer=True) and 0<v<10000 for v in (w,h)):
        return None, errors + ['standard canvas dimensions invalid']
    margin=s.get('minimumHorizontalMargin')
    if not _numeric(margin) or not 0 < margin < 0.5:
        errors.append('minimumHorizontalMargin must be finite in (0,0.5)')
    tol=s.get('tolerances')
    if not isinstance(tol,dict):
        return None, errors + ['tolerances must be an object']
    for key in ('eyePositionPx','headPositionPx','headHeightPercent','shoulderPositionPx'):
        n=tol.get(key)
        if not _numeric(n) or not 0 < n <= 100:
            errors.append(f'tolerances.{key} must be finite, positive and <=100')
    anchors=s.get('anchors')
    if not isinstance(anchors,dict):
        return None, errors + ['reference anchors must be an object']
    eye=_point(anchors.get('eyeCenter'),'reference.eyeCenter',w,h,errors)
    top=_height(anchors.get('headTopY'),'reference.headTopY',h,errors)
    chin=_height(anchors.get('chinY'),'reference.chinY',h,errors)
    if top is not None and chin is not None and chin <= top:
        errors.append('reference head height must be positive')
    if errors:
        return None, errors
    return (w,h),errors


def check(image_path, standard_path=DEFAULT_STANDARD, landmarks_path=None, allow_provisional=False,
          distribution=False):
    errors=[]
    s,issues=_read_json(standard_path)
    if issues:return issues
    dims,issues=_validate_standard(s,allow_provisional)
    errors.extend(issues)
    if dims is None:return errors
    w,h=dims
    path=Path(image_path)
    expected_format='WEBP' if path.suffix == '.webp' else 'PNG' if path.suffix == '.png' else None
    if expected_format is None:
        errors.append('filename must use lowercase .png or .webp extension')
    if distribution and expected_format!='WEBP':
        errors.append('distribution image must be a .webp file')
    try:
        image_bytes=path.read_bytes()
        digest=hashlib.sha256(image_bytes).hexdigest()
        with Image.open(path) as im:
            if expected_format != im.format:
                errors.append(f'file format mismatch: suffix {path.suffix} contains {im.format}')
            if distribution and im.format!='WEBP':
                errors.append('distribution must contain real WebP bytes')
            if getattr(im,'n_frames',1)!=1 or getattr(im,'is_animated',False):
                errors.append('animated or multi-frame image is not allowed')
            if im.size!=(w,h):
                errors.append(f'canvas mismatch: {im.size} != {(w,h)}')
            if 'A' not in im.getbands() and 'transparency' not in im.info:
                errors.append('image lacks alpha/transparency channel')
            alpha=im.convert('RGBA').getchannel('A')
            if alpha.getextrema()[1]==0:
                errors.append('image is entirely transparent')
            elif alpha.getextrema()[0]!=0:
                errors.append('image has no fully transparent pixels')
            margin=s.get('minimumHorizontalMargin',0.10)
            if _numeric(margin) and 0 < margin < 0.5:
                band=math.ceil(w*margin)
                pix=alpha.load()
                if any(pix[x,y]!=0 for y in range(im.height) for x in range(band)):
                    errors.append(f'left transparency safety band ({band}px) must have alpha=0')
                if any(pix[x,y]!=0 for y in range(im.height) for x in range(w-band,w)):
                    errors.append(f'right transparency safety band ({band}px) must have alpha=0')
                if any(pix[x,0]!=0 for x in range(im.width)):
                    errors.append('visible character touches top image edge')
            # Reject a one-dot placeholder; visual QA is still required.
            bbox=alpha.getbbox()
            if bbox is None:
                errors.append('no visible portrait')
            elif (bbox[2]-bbox[0])*(bbox[3]-bbox[1]) < 0.08*w*h:
                errors.append('visible portrait has implausibly small bounding box')
    except (OSError,ValueError,IndexError) as exc:
        return errors+[f'cannot inspect image: {exc}']
    side=landmarks_path or Path(str(path)+'.anchors.json')
    ann,issues=_read_json(side)
    if issues:return errors+issues
    if ann.get('standard')!=s.get('id'):
        errors.append('annotation standard ID mismatch')
    if ann.get('reviewed') is not True:
        errors.append('annotation must be manually reviewed')
    if ann.get('imageSha256')!=digest:
        errors.append('annotation is stale or unbound: image SHA-256 mismatch')
    review=ann.get('review')
    if not isinstance(review,dict) or not all(isinstance(review.get(k),str) and review[k].strip() for k in ('reviewer','method','evidence')):
        errors.append('reviewer, measurement method and image-coordinate evidence are required')
    measured=ann.get('anchors')
    if not isinstance(measured,dict):return errors+['annotation anchors must be an object']
    anchors=s['anchors'];tol=s['tolerances']
    p=_point(measured.get('eyeCenter'),'image.eyeCenter',w,h,errors)
    q=_point(anchors.get('eyeCenter'),'reference.eyeCenter',w,h,errors)
    if p is not None and q is not None and _numeric(tol.get('eyePositionPx')):
        for i,axis in enumerate('xy'):
            if abs(p[i]-q[i])>tol['eyePositionPx']:
                errors.append(f'eyeCenter.{axis} difference {p[i]-q[i]:+g}px exceeds tolerance')
    top=_height(measured.get('headTopY'),'image.headTopY',h,errors)
    chin=_height(measured.get('chinY'),'image.chinY',h,errors)
    if top is not None and chin is not None:
        if chin<=top:errors.append('image head height must be positive')
        for value,key in ((top,'headTopY'),(chin,'chinY')):
            if _numeric(tol.get('headPositionPx')) and abs(value-anchors[key])>tol['headPositionPx']:
                errors.append(f'{key} differs by {value-anchors[key]:+g}px')
        baseline=anchors['chinY']-anchors['headTopY']
        if baseline>0 and _numeric(tol.get('headHeightPercent')) and abs(chin-top-baseline)/baseline*100>tol['headHeightPercent']:
            errors.append('head-height difference exceeds tolerance')
    if ann.get('samePoseAsReference') is True:
        # No global shoulders until there is a verified pose-base image.
        errors.append('samePoseAsReference requires a separately approved pose-base; not implemented')
    elif ann.get('samePoseAsReference') not in (False,None):
        errors.append('samePoseAsReference must be boolean')
    return errors


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image',type=Path)
    parser.add_argument('--standard',type=Path,default=DEFAULT_STANDARD)
    parser.add_argument('--landmarks',type=Path)
    parser.add_argument('--distribution',action='store_true',help='require actual static WebP output')
    parser.add_argument('--allow-provisional',action='store_true',help='local diagnostics only, never CI')
    args=parser.parse_args()
    issues=check(args.image,args.standard,args.landmarks,args.allow_provisional,args.distribution)
    if issues:
        print('FAIL '+str(args.image)+'\n'+'\n'.join(' - '+x for x in issues))
        return 1
    print('PASS: file structure, full transparent margins, bound reviewed annotations')
    print('HUMAN QA REQUIRED: check landmark overlay, character identity, pose, natural crop and app rendering')
    return 0


if __name__=='__main__':
    raise SystemExit(main())
