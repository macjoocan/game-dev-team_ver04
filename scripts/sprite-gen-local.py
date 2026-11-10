"""Run the pinned optional sprite-gen checkout using this Python interpreter."""
import json
import pathlib
import sys
if '--checkout' in sys.argv:
    position = sys.argv.index('--checkout')
    if position + 1 >= len(sys.argv):
        print('--checkout requires a path', file=sys.stderr)
        raise SystemExit(2)
    root = pathlib.Path(sys.argv[position + 1]).resolve()
    del sys.argv[position:position + 2]
else:
    root = pathlib.Path.cwd() / '.art-tools' / 'sprite-gen'
try:
    source = json.loads((root / 'GAMDEV_SOURCE.json').read_text(encoding='utf8'))
    if source != {'repo':'aldegad/sprite-gen','revision':'4f5ccd55c7cf06685a41f954acc1e476b7772ece'}:
        raise ValueError('unexpected revision')
except (OSError, ValueError):
    print('sprite-gen checkout missing or revision marker invalid', file=sys.stderr)
    raise SystemExit(3)
sys.path.insert(0, str(root))
from sprite_gen.cli import main
raise SystemExit(main())
