#!/usr/bin/env python3
"""Produce ephemeral anonymous source-grid review panels without prior coordinates.

Images are *cropped views* only, never source edits. Fixed absolute ROIs and
unchanged pixels guarantee cross-image comparability. No existing landmark
JSON, previous annotations or automatic recentering are loaded.
"""
import base64
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
FILES=[
("A1", "public/assets/shiori/home/v2/shiori-private-home-thinking-r1.webp"),
("A2", "public/assets/shiori/gim/v1/shiori-gim-story-playful-alt1.webp"),
("A3", "public/assets/shiori/home/v2/shiori-private-home-normal-r1.webp"),
("A4", "public/assets/shiori/gim/v1/shiori-gim-story-surprised-alt1.webp"),
("A5", "public/assets/shiori/home/v2/shiori-private-home-smile-r1.webp"),
("A6", "public/assets/shiori/gim/v1/shiori-gim-story-normal-alt1-before.webp"),
("A7", "public/assets/shiori/home/v2/shiori-private-home-surprised-r1.webp"),
("A8", "public/assets/shiori/gim/v1/shiori-gim-story-smile-alt1.webp"),
("A9", "public/assets/shiori/home/v2/shiori-private-home-playful-r1.webp"),
("A10","public/assets/shiori/gim/v1/shiori-gim-story-thinking-alt1.webp")
]
CROPS=[
("EYE-SCREEN-LEFT",(345,390,505,515),3),
("EYE-SCREEN-RIGHT",(540,295,665,415),3),
("CHIN",(545,540,655,645),3)
]
def grid(img, name, box, scale):
    x0,y0,x1,y1=box
    cw,ch=(x1-x0)*scale,(y1-y0)*scale
    result=Image.new("RGB",(cw+58,ch+48),"#eeeeee")
    raw=img.crop(box).convert("RGBA")
    back=Image.new("RGBA",raw.size,"white")
    back.alpha_composite(raw)
    result.paste(back.convert("RGB").resize((cw,ch),Image.Resampling.NEAREST),(50,35))
    d=ImageDraw.Draw(result)
    d.text((4,1),name,fill="#111111")
    for x in range((x0+4)//5*5,x1,5):
        X=50+(x-x0)*scale
        d.line((X,35,X,35+ch),fill=(58,84,98) if x%10==0 else (155,165,171),width=1)
        if x%10==0:d.text((X-4,19),str(x),fill="#111111")
    for y in range((y0+4)//5*5,y1,5):
        Y=35+(y-y0)*scale
        d.line((50,Y,50+cw,Y),fill=(58,84,98) if y%10==0 else (155,165,171),width=1)
        if y%10==0:d.text((3,Y-5),str(y),fill="#111111")
    return result
for code,filename in FILES:
    im=Image.open(ROOT/filename)
    sub=[grid(im,name,box,scale) for name,box,scale in CROPS]
    out=Image.new("RGB",(sum(x.width for x in sub), max(x.height for x in sub)+32),"#eeeeee")
    dx=0
    for x in sub:
        out.paste(x,(dx,32))
        dx+=x.width
    ImageDraw.Draw(out).text((8,7),f"ANONYMOUS REVIEW {code} / original pixel coordinates / 5px grid / no prior landmarks",fill="#111111")
    stream=BytesIO()
    out.save(stream,"WEBP",quality=82,method=4)
    print(f"STEP5_PANEL:{code}:{base64.b64encode(stream.getvalue()).decode('ascii')}",flush=True)
