import json
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from scripts import check_home_registry as reg


class RegistryChecks(TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.registry=self.root/'registry.json'
        self.legacy='public/assets/shiori/home/v1/old.webp'
        self.new='public/assets/shiori/gim/v2/shiori-gim-home-normal-r1.webp'
        self.data={'legacy':{self.legacy:'a'*40},'portraits':[]}
        self.registry.write_text(json.dumps(self.data))
        self.filenames=[self.legacy]
        self.blob='a'*40

    def fakegit(self,*parts):
        if parts[0]=='ls-files':
            return ('\0'.join(self.filenames)+'\0').encode()
        if parts[0]=='hash-object':
            return (self.blob+'\n').encode()
        raise ValueError(parts)

    def verify(self):
        with patch.object(reg,'REGISTRY',self.registry),patch.object(reg,'ROOT',self.root),\
             patch.object(reg,'run_git',self.fakegit),patch.object(reg,'check',return_value=[]):
            return reg.check_registry()

    def test_legacy_unchanged(self):
        self.assertEqual([],self.verify())

    def test_legacy_mutation_rejected(self):
        self.blob='b'*40
        self.assertTrue(any('modified' in x for x in self.verify()))

    def test_missing_legacy_rejected(self):
        self.filenames=[]
        self.assertTrue(any('missing' in x for x in self.verify()))

    def test_unregistered_new_image_rejected(self):
        self.filenames.append(self.new)
        self.assertTrue(any('unregistered' in x for x in self.verify()))

    def test_orphan_annotations_rejected(self):
        self.filenames.append(self.new+'.anchors.json')
        self.assertTrue(any('orphan' in x for x in self.verify()))

    def test_registered_new_portrait_accepts_sidecar(self):
        self.filenames += [self.new,self.new+'.anchors.json']
        self.data['portraits']=[{'path':self.new,'standard':'home-portrait-v1'}]
        self.registry.write_text(json.dumps(self.data))
        self.assertEqual([],self.verify())

    def test_registered_portrait_missing_sidecar_rejected(self):
        self.filenames += [self.new]
        self.data['portraits']=[{'path':self.new,'standard':'home-portrait-v1'}]
        self.registry.write_text(json.dumps(self.data))
        self.assertTrue(any('sidecar' in x for x in self.verify()))
