import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path('.art-tools/marearts-moim-pose').resolve()))
from marearts_moim_pose.comfy import MaComfy
from marearts_moim_pose.gait import PRESETS, ma_frame_phases, ma_walk_points
from marearts_moim_pose.mannequin import ma_depth
from marearts_moim_pose.pipeline import MaRequest, ma_video_starts

root = Path('out/moim-silver-pilot')
raw = root / 'video-probe/raw'
raw.mkdir(parents=True, exist_ok=True)
Image.open(root / 'one-frame-equipment-test.png').save(raw / 'walk_0.png')
req = MaRequest(reference=Path('out/silver-walk-keys/frames/frame_00.png'), out=raw.parent,
                name='silver_probe', look='silver-haired swordswoman in dark armor and brown boots, long teal cape, holding a silver sword with gold hilt',
                frames=12, seed=7, video_model='14b')
gait = PRESETS['relaxed']
depths = [ma_depth(ma_walk_points(t, gait)) for t in ma_frame_phases(12, gait)]
print('Starting experimental video probe; frame checks were not passed', flush=True)
result = ma_video_starts(req, MaComfy('http://127.0.0.1:8191'), depths, raw, print)
print('Uploaded video starts:', len(result), flush=True)
