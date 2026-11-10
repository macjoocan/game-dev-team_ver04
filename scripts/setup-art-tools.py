import io, json, pathlib, urllib.request, zipfile

base = pathlib.Path('.art-tools').resolve()
base.mkdir(exist_ok=True)
repos = {
    '2dimg2motion': ('WU-HAOTIAN34/2dimg2motion','d4d73e243b6ff64b7cbb3879e45e951f972a7e62'),
    'sprite-gen': ('aldegad/sprite-gen','4f5ccd55c7cf06685a41f954acc1e476b7772ece'),
    'pixelfx': ('patch-gg/pixelfx','a84159688af3ca37a4be05a0d422b94451b2e24e'),
    'agent-sprite-forge': ('0x0funky/agent-sprite-forge','5324342fdfab72430f4e9604f3fe427009f8596d'),
    'codixel': ('mankidev/codixel','604a9dcbcc4e386bc48188b5f7f49099f5d04db7'),
    'pixelbolt': ('skulitom/Pixelbolt','b458f86f05bd846f9fdc72bf6a51763e64fc35dc'),
}
for name,(repo,revision) in repos.items():
    folder = base / name
    if folder.exists():
        marker=folder/'GAMDEV_SOURCE.json'
        if not marker.exists() or json.loads(marker.read_text(encoding='utf8')) != {'repo':repo,'revision':revision}:
            raise RuntimeError(f'{name}: existing checkout is incomplete or uses another revision; preserved')
        print(name, 'already exists: recorded revision preserved', flush=True)
        continue
    req=urllib.request.Request(f'https://codeload.github.com/{repo}/zip/{revision}',headers={'User-Agent':'GameDevTeam-art-pilot'})
    with urllib.request.urlopen(req,timeout=90) as response: data=response.read(100_000_001)
    if len(data)>100_000_000: raise RuntimeError('archive exceeds limit')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for e in z.infolist():
            parts=pathlib.PurePosixPath(e.filename).parts[1:]
            if not parts or e.is_dir(): continue
            if '..' in parts: raise RuntimeError('unsafe archive entry')
            if e.file_size>20_000_000:
                print(name, 'skipped large example:', '/'.join(parts), flush=True)
                continue
            target=folder.joinpath(*parts)
            target.parent.mkdir(parents=True,exist_ok=True)
            with target.open('xb') as f: f.write(z.read(e))
    (folder/'GAMDEV_SOURCE.json').write_text(json.dumps({'repo':repo,'revision':revision},indent=2),encoding='utf8')
    print(name, revision, flush=True)
