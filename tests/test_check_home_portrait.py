import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw
from scripts.check_home_portrait import check


class TestPortraitGate(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir=Path(self.temp.name)
        self.standard=self.dir/'standard.json'
        self.config={
            'id':'home-portrait-v1','status':'calibrated',
            'canvas':{'width':941,'height':1672},
            'minimumHorizontalMargin':0.10,
            'tolerances':{'eyePositionPx':4,'headPositionPx':6,
                          'headHeightPercent':1.5,'shoulderPositionPx':6},
            'anchors':{'eyeCenter':[449,321],'headTopY':27,'chinY':449}}
        self.saveconfig()
        self.file=self.dir/'portrait.webp'
        self.side=self.dir/'portrait.webp.anchors.json'
        self.annotation={'standard':'home-portrait-v1','reviewed':True,
            'review':{'reviewer':'QA','method':'manual pixel landmarks',
                      'evidence':'viewed overlay against matching image SHA256'},
            'samePoseAsReference':False,
            'anchors':{'eyeCenter':[449,321],'headTopY':27,'chinY':449}}
        self.render()
        self.saveannotation()

    def saveconfig(self):
        self.standard.write_text(json.dumps(self.config))

    def render(self, *, left=150,alpha=255,top=25,fmt='WEBP'):
        image=Image.new('RGBA',(941,1672),(0,0,0,0))
        ImageDraw.Draw(image).rectangle((left,top,790,1671),fill=(130,110,170,alpha))
        image.save(self.file,format=fmt,quality=85)

    def saveannotation(self):
        self.annotation['imageSha256']=hashlib.sha256(self.file.read_bytes()).hexdigest()
        self.side.write_text(json.dumps(self.annotation))

    def assertbad(self,fragment):
        self.assertTrue(any(fragment in i for i in check(self.file,self.standard,self.side)),
                        check(self.file,self.standard,self.side))

    def test_valid(self):
        self.assertEqual([],check(self.file,self.standard,self.side))

    def test_provisional_fails_closed(self):
        self.config['status']='provisional';self.saveconfig()
        self.assertbad('calibrated')

    def test_sha_catches_replaced_image(self):
        self.render(left=160)
        self.assertbad('SHA-256')

    def test_sham_review_is_not_accepted(self):
        self.annotation['review']['evidence']='';self.saveannotation()
        self.assertbad('reviewer')

    def test_alpha_1_edge(self):
        im=Image.open(self.file).convert('RGBA');im.putpixel((0,750),(1,2,3,1));im.save(self.file,format='WEBP',quality=85)
        self.saveannotation();self.assertbad('left transparency')

    def test_alpha_32_edge(self):
        im=Image.open(self.file).convert('RGBA');im.putpixel((0,750),(1,2,3,32));im.save(self.file,format='WEBP',quality=85)
        self.saveannotation();self.assertbad('left transparency')

    def test_corner_one_transparent_pixel(self):
        im=Image.new('RGBA',(941,1672),(120,100,120,32));im.putpixel((400,500),(0,0,0,0));im.save(self.file,format='WEBP',quality=85)
        self.saveannotation();self.assertbad('left transparency')

    def test_left_margin(self):
        self.render(left=94);self.saveannotation();self.assertbad('left transparency')

    def test_nan_tolerance(self):
        self.config['tolerances']['eyePositionPx']=float('nan');self.saveconfig();self.assertbad('finite')

    def test_nonobject_reference(self):
        self.standard.write_text('[]');self.assertbad('root')

    def test_nonobject_annotation(self):
        self.side.write_text('[]');self.assertbad('root')

    def test_eye_shift(self):
        self.annotation['anchors']['eyeCenter']=[455,321];self.saveannotation();self.assertbad('eyeCenter.x')

    def test_head_stretch(self):
        self.annotation['anchors']['chinY']=470;self.saveannotation();self.assertbad('head-height')

    def test_no_alpha(self):
        Image.new('RGB',(941,1672),'white').save(self.file,format='WEBP');self.saveannotation();self.assertbad('lacks alpha')

    def test_wrong_format_suffix(self):
        self.render(fmt='PNG');self.saveannotation();self.assertbad('format mismatch')

    def test_distribution_mode(self):
        self.assertEqual([],check(self.file,self.standard,self.side,distribution=True))
        self.file=self.dir/'portrait.png';self.side=self.dir/'portrait.png.anchors.json'
        self.render(fmt='PNG');self.saveannotation()
        self.assertTrue(any('distribution' in x for x in check(self.file,self.standard,self.side,distribution=True)))

    def test_animated_webp(self):
        frame1=Image.open(self.file).convert('RGBA')
        frame2=Image.new('RGBA',(941,1672),'white')
        frame1.save(self.file,format='WEBP',save_all=True,append_images=[frame2],duration=100,loop=0)
        self.saveannotation();self.assertbad('multi-frame')

    def test_unreviewed(self):
        self.annotation['reviewed']=False;self.saveannotation();self.assertbad('manually reviewed')

    def test_no_pose_base(self):
        self.annotation['samePoseAsReference']=True;self.saveannotation();self.assertbad('pose-base')

    def test_tiny_speck(self):
        im=Image.new('RGBA',(941,1672),(0,0,0,0));im.putpixel((500,700),(200,200,255,255))
        im.save(self.file,format='WEBP');self.saveannotation();self.assertbad('bounding box')

if __name__=='__main__':unittest.main()
