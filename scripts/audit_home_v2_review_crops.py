#!/usr/bin/env python3
"""Temporary in-memory review crops for eye-outline and chin annotation.

This emits base64 JPEG-in-log from *existing* assets, never overwrites assets,
and is purely a reviewer inspection utility. The source pixels remain untouched.
Coordinates are source-image pixels. Use only on public character art.
"""
import base64
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
ASSETS={
 "gym/smile":"public/assets/shiori/gim/v1/shiori-gim-story-smile-alt1.webp",
 "gym/normal":"public/assets/shiori/gim/v1/shiori-gim-story-normal-alt1-before.webp",
 "gym/thinking":"public/assets/shiori/gim/v1/shiori-gim-story-thinking-alt1.webp",
 "gym/surprised":"public/assets/shiori/gim/v1/shiori-gim-story-surprised-alt1.webp",
 "gym/playful":"public/assets/shiori/gim/v1/shiori-gim-story-playful-alt1.webp",
 "private/normal":"public/assets/shiori/home/v2/shiori-private-home-normal-r1.webp",
 "private/thinking":"public/assets/shiori/home/v2/shiori-private-home-thinking-r1.webp",
 "private/surprised":"public/assets/shiori/home/v2/shiori-private-home-surprised-r1.webp",
 "private/smile":"public/assets/shiori/home/v2/shiori-private-home-smile-r1.webp",
 "private/playful":"public/assets/shiori/home/v2/shiori-private-home-playful-r1.webp"
}
# Three fixed ROIs; no content-sensitive recentering that would obscure differences.
ROIS=[("screen-left-eye",(320,370,520,520)),("screen-right-eye",(520,270,700,440)),("chin",(490,480,700,660))]

def patch(im,title,rect):
    x0,y0,x1,y1=rect
    original=im.crop(rect).convert("RGB")
    original.thumbnail((450,360))
    base=Image.new("RGB",(450,380),"white")
    from PIL import ImageOps
    output=ImageOps.pad(im.crop(rect).convert("RGB"),(420,336),method=Image.Resampling.NEAREST,color="white")
    canvas=Image.new("RGB",(460,390),"white")
    canvas.paste(output,(25,30))
    d=ImageDraw.Draw(canvas)
    for x in range((x0+9)//10*10,x1,10):
        u=25+(x-x0)*420/(x1-x0)
        d.line((u,30,u,366),fill=(50,80,100),width=1)
        if x%20==0:d.text((u+1,14),str(x),fill=(10,10,10))
    for y in range((y0+9)//10*10,y1,10):
        v=30+(y-y0)*336/(y1-y0)
        d.line((25,v,445,v),fill=(50,80,100),width=1)
        if y%20==0:d.text((0,v+1),str(y),fill=(10,10,10))
    d.text((2,1),title,fill=(10,10,10))
    return canvas

for name,path in ASSETS.items():
    im=Image.open(ROOT/path)
    canvas=Image.new("RGB",(1380,420),"#f3f3f3")
    for idx,(label,rect) in enumerate(ROIS):
        canvas.paste(patch(im,f"{name}: {label}",rect),(460*idx,0))
    blob=BytesIO()
    canvas.save(blob,format="WEBP",quality=78,method=4)
    encoded=base64.b64encode(blob.getvalue()).decode("ascii")
    print(f"REVIEW_CROP:{name}:{encoded}",flush=True)
