"""Tests for shared palette/alpha and whole-body driver contracts."""
import importlib.util
import json
import tempfile
import unittest
from unittest.mock import patch
import base64
import io
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sprite_lab", ROOT / "skills/char-art-system/scripts/sprite-lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class ExportTests(unittest.TestCase):
    def test_global_palette_and_binary_alpha_keep_internal_hole(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, out = Path(tmp) / "source", Path(tmp) / "out"
            source.mkdir()
            for frame, color in enumerate(((255, 40, 10), (10, 80, 255))):
                data = np.zeros((16, 16, 4), dtype=np.uint8)
                data[2:14, 2:14] = (*color, 255)
                data[6:10, 6:10] = (255, 0, 255, 0)  # hidden color must not enter palette
                Image.fromarray(data).save(source / f"{frame:02d}.png")
            lab.export_stage(source, out, 16, 2, 12, True, False)
            colors = set()
            for file in out.glob("frame_*.png"):
                data = np.array(Image.open(file))
                self.assertEqual(int(data[7, 7, 3]), 0)
                self.assertEqual(set(np.unique(data[:, :, 3])), {0, 255})
                colors.update(map(tuple, data[data[:, :, 3] == 255, :3]))
            self.assertEqual(len(colors), 2)
            with Image.open(out / "sheet.png") as sheet:
                self.assertEqual(sheet.size, (32, 16))
            self.assertEqual(json.loads((out / "manifest.json").read_text())["status"], "concept")

    def test_mixed_canvas_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source"
            source.mkdir()
            Image.new("RGBA", (8, 8)).save(source / "0.png")
            Image.new("RGBA", (9, 8)).save(source / "1.png")
            with self.assertRaisesRegex(ValueError, "Mixed source canvases"):
                lab.export_stage(source, Path(tmp) / "out", 16, 2, 12, True, False)

    def test_existing_paid_job_is_polled_without_another_post(self):
        png = io.BytesIO()
        Image.new("RGBA", (2,2)).save(png, format="PNG")
        payload = base64.b64encode(png.getvalue()).decode()
        class Response:
            def raise_for_status(self): pass
            def json(self): return {"status":"completed", "last_response":{"images":[{"base64":payload}]}}
        class Session:
            headers = {}
            def post(self, *args, **kwargs):
                raise AssertionError("Existing paid job must not be resubmitted")
            def get(self, url, **kwargs):
                assert url.endswith("/background-jobs/approved-job")
                return Response()
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            lab.write_json(out / "job.json", {"operation":"animate-with-text-v3", "background_job_id":"approved-job"})
            with patch.object(lab.requests, "Session", Session), patch.dict(lab.os.environ, {"PIXELLAB_API_KEY":"test-only"}, clear=True):
                saved = lab.pixellab({"operation":"animate-with-text-v3"}, out, True, 10)
            self.assertEqual(len(saved), 1)


if __name__ == "__main__":
    unittest.main()
