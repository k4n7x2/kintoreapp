#!/usr/bin/env python3
"""Fail-closed inventory gate for Shiori assets, with pinned legacy Git blobs.

Every new standard portrait must appear in the registry and have a reviewed
landmark sidecar. Existing eight legacy images are immutable by blob ID.
"""
import json
from pathlib import Path
import subprocess
import sys

from scripts.check_home_portrait import check

ROOT=Path(__file__).resolve().parents[1]
REGISTRY=ROOT/'docs/shiori/home-portraits-registry-v1.json'
ASSET_PREFIX='public/assets/shiori/'


def run_git(*args):
    return subprocess.check_output(['git',*args], cwd=ROOT, stderr=subprocess.PIPE)


def check_registry():
    issues=[]
    try:
        registry=json.loads(REGISTRY.read_text(encoding='utf-8'))
        if not isinstance(registry,dict):return ['registry root must be an object']
        legacy=registry.get('legacy')
        portraits=registry.get('portraits')
        if not isinstance(legacy,dict) or not isinstance(portraits,list):
            return ['registry must contain legacy object and portraits list']
        paths=run_git('ls-files','-z','--',ASSET_PREFIX).decode('utf-8').strip('\0').split('\0')
    except (ValueError,OSError,subprocess.CalledProcessError,UnicodeDecodeError) as exc:
        return [f'cannot enumerate tracked portrait assets: {exc}']
    paths={x for x in paths if x}
    standard={}
    for item in portraits:
        if not isinstance(item,dict) or not isinstance(item.get('path'),str) or item.get('standard')!='home-portrait-v1':
            issues.append('registry portrait must specify path and home-portrait-v1');continue
        p=item['path']
        if p in standard:issues.append(f'duplicate registry portrait: {p}')
        standard[p]=item
    declared=set(legacy)|set(standard)
    if len(declared)!=len(legacy)+len(standard):issues.append('image in both legacy and new standard registry')
    for name in sorted(paths):
        if name.endswith('/.gitkeep'):continue
        if name.endswith('.anchors.json'):
            if name[:-len('.anchors.json')] not in standard:
                issues.append(f'orphan or legacy annotation: {name}')
            continue
        if name not in declared:
            issues.append(f'unregistered or unexpected portrait asset: {name}')
    for path,blob in legacy.items():
        if not path.startswith(ASSET_PREFIX) or not isinstance(blob,str) or len(blob)!=40:
            issues.append(f'invalid legacy registry entry: {path}');continue
        if path not in paths:
            issues.append(f'pinned legacy asset missing: {path}');continue
        try:
            actual=run_git('hash-object','--',path).decode('ascii').strip()
            if actual!=blob:issues.append(f'legacy asset modified, add a NEW version instead: {path}')
        except (OSError,subprocess.CalledProcessError,UnicodeDecodeError) as exc:
            issues.append(f'cannot hash legacy asset {path}: {exc}')
    for path,item in standard.items():
        if (not path.startswith(ASSET_PREFIX) or not path.endswith('.webp')
            or '/v' not in path):
            issues.append(f'invalid standard portrait path: {path}')
        if path not in paths:
            issues.append(f'registered standard portrait missing: {path}');continue
        if path+'.anchors.json' not in paths:
            issues.append(f'registered portrait missing tracked sidecar: {path}');continue
        issues.extend(f'{path}: {reason}' for reason in check(ROOT/path,landmarks_path=ROOT/(path+'.anchors.json'),distribution=True))
    return issues


if __name__=='__main__':
    errors=check_registry()
    if errors:
        print('FAIL: portrait registry\n'+'\n'.join(' - '+x for x in errors))
        sys.exit(1)
    print('PASS: all portrait assets accounted for; pinned legacy unchanged; all registered new images validated')
