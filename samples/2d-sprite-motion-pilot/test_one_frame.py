import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path('.art-tools/marearts-moim-pose').resolve()))
from marearts_moim_pose.comfy import MaComfy, ma_klein_depth_graph, ma_prompt
from marearts_moim_pose.pipeline import ma_reference

root = Path('out/moim-silver-pilot')
server = MaComfy('http://127.0.0.1:8191')
ref = ma_reference(Image.open('out/silver-walk-keys/frames/frame_00.png'))
depth = Image.open(root / 'mannequin/walk_0_depth.png')
ref_name = server.upload(ref, 'silver_test_reference.png')
depth_name = server.upload(depth, 'silver_test_depth.png')
prompt = ma_prompt('silver-haired fantasy swordswoman, dark armor and brown boots, long flowing teal cape, holding a long silver sword with gold hilt in her near hand, preserve the sword and cape visible in the reference image', 'walk')
graph = ma_klein_depth_graph(depth_name, ref_name, prompt, seed=7)
print('Running one local depth-controlled frame', flush=True)
print(server.run(graph, root / 'one-frame-equipment-test.png', retries=0), flush=True)
