import importlib.util
import json
import hashlib
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('model_release',Path(__file__).resolve().parents[1]/'scripts/model-release.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ModelReleaseTests(unittest.TestCase):
    def test_slice_does_not_cross_part_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'data';file.write_bytes(b'abcdefgh')
            stream=module.SliceReader(file,2,3)
            try:
                self.assertEqual(len(stream),3);self.assertEqual(stream.read(2),b'cd')
                self.assertEqual(stream.read(9),b'e');self.assertEqual(stream.read(),b'')
            finally:stream.close()

    def test_verified_parts_restore_and_existing_model_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'models';dest=root/'diffusion/test.bin';dest.parent.mkdir(parents=True)
            data=b'model bytes';sha=hashlib.sha256(data).hexdigest();asset='model-00-000.bin'
            piece=dest.parent/(dest.name+'.'+asset+'.part');piece.write_bytes(data)
            catalog=Path(directory)/'catalog.json';catalog.write_text(json.dumps({'models':[{'path':'diffusion/test.bin',
                'sha256':sha,'parts':[{'asset':asset,'bytes':len(data),'sha256':sha}]}]}))
            args=SimpleNamespace(root=str(root),catalog=str(catalog))
            with patch.object(module.requests.Session,'get',side_effect=AssertionError('Unnecessary download')):
                module.restore(args);self.assertEqual(dest.read_bytes(),data);module.restore(args)
                dest.write_bytes(b'other bytes')
                with self.assertRaisesRegex(RuntimeError,'Existing model differs'):module.restore(args)

    def test_escape_target_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            catalog=Path(directory)/'catalog.json';catalog.write_text(json.dumps({'models':[{'path':'../escape'}]}))
            with self.assertRaisesRegex(ValueError,'Unsafe'):
                module.restore(SimpleNamespace(root=str(Path(directory)/'models'),catalog=str(catalog)))

if __name__=='__main__':unittest.main()
