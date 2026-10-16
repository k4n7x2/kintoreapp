#!/usr/bin/env python3
"""Display pixel coordinate grids cut directly from the PINNED GitHub reference WebP.

Internal QA only; never modifies the asset. '--inline' emits base64 of PNG
raster crops to CI logs for temporary review. Never pass private screenshots.
"""
from pathlib import Path
from PIL import Image, ImageDraw
from io import BytesIO
import hashlib
import base64
import argparse

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'public/assets/shiori/home/v1/shiori-home-roomwear-fun-r1.webp'
EXPECTED_SHA256='1e055d3096baf1f0f4514d0219c271a429c265fb8a784ae15867fbe4a506e74a'
REGIONS={
 'head-top':(245,0,655,135,2),
 'face-overview':(270,170,665,535,2),
 'left-eye':(300,288,473,415,4),
 'right-eye':(448,213,600,345,4),
 'chin':(410,379,610,522,3),
}

def make_crop(source,region):
    x0,y0,x1,y1,scale=region
    area=source.crop((x0,y0,x1,y1)).convert('RGBA')
    canvas=Image.new('RGB',area.size,(50,48,55))
    canvas.paste(area,mask=area.getchannel('A'))
    display=canvas.resize(((x1-x0)*scale,(y1-y0)*scale),Image.Resampling.NEAREST)
    d=ImageDraw.Draw(display,'RGBA')
    for x in range(((x0+9)//10)*10,x1,10):
        xx=(x-x0)*scale
        d.line((xx,0,xx,display.height),fill=(40,240,200,100),width=1)
        if x%20==0:d.text((xx+1,1),str(x),fill=(255,255,0,255))
    for y in range(((y0+9)//10)*10,y1,10):
        yy=(y-y0)*scale
        d.line((0,yy,display.width,yy),fill=(40,240,200,100),width=1)
        if y%20==0:d.text((1,yy+1),str(y),fill=(255,255,0,255))
    # nominal guide (not a measured landmark)
    for x,y in ((449,321),(449,27),(490,449)):
        if x0<=x<x1 and y0<=y<y1:
            xx=(x-x0)*scale
            yy=(y-y0)*scale
            d.ellipse((xx-4,yy-4,xx+4,yy+4),outline=(255,0,30,255),width=2)
    return display

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--inline',action='store_true')
    args=ap.parse_args()
    raw=SOURCE.read_bytes()
    sha=hashlib.sha256(raw).hexdigest()
    if sha!=EXPECTED_SHA256:
        raise RuntimeError('Source WebP SHA256 differs from audit-pinned source: '+sha)
    with Image.open(SOURCE) as im:
        print(f'ANCHOR_SOURCE {SOURCE.relative_to(ROOT)} {im.size} sha256={sha}',flush=True)
        if im.size!=(941,1672):raise RuntimeError('Unexpected reference raster dimensions')
        alpha=im.convert('RGBA').getchannel('A')
        for th in (0,32,128,240):
            a=alpha.point(lambda p:255 if p>th else 0)
            roi=a.crop((200,0,700,80))
            counts=[]
            for y in range(80):
                row=roi.crop((0,y,500,y+1))
                counts.append(sum(1 for p in row.getdata() if p))
            candidate=next((y for y,n in enumerate(counts) if n>=10),None)
            print(f'ANCHOR_HAIRTOP alpha>{th} >=10px in x200:700 starts y={candidate}',flush=True)
        for name,rect in REGIONS.items():
            crop=make_crop(im,rect)
            if args.inline:
                mem=BytesIO()
                crop.save(mem,format='PNG',optimize=True)
                encoded=base64.b64encode(mem.getvalue()).decode('ascii')
                print(f'ANCHOR_CROP_BEGIN:{name}',flush=True)
                for i in range(0,len(encoded),3000):print(encoded[i:i+3000],flush=True)
                print(f'ANCHOR_CROP_END:{name}',flush=True)
            else:
                print('ANCHOR_CROP',name,'pixels',crop.size,flush=True)

if __name__=='__main__':
    main()
