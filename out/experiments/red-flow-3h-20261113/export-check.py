import subprocess,json,sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
root=Path('out/experiments/red-flow-3h-20261113')
subprocess.run(['python',str(root/'export.py')],check=True)
subprocess.run(['node',str(root/'verify-flash.mjs')],check=True)
for name in ['evade-pixel','guard-pixel']:
    print(name,(root/f'qa/{name}.stdout.log').read_text(encoding='utf8')[-2500:])
