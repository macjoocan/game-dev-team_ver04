import pathlib,json,hashlib,re,datetime
b=pathlib.Path(__file__).resolve().parent
root=b.parents[2]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
selection={'selected':'gpt-sheet','scope':'preferred candidate for next improvement, not final approval','humanApproved':False,'quote':'ㅋㅋㅋㅋㅋㅋㅋ B가 젤 나은데? ㅋㅋ','recordedBy':'codex','date':'2026-11-06'}
(b/'user-selection.json').write_text(json.dumps(selection,ensure_ascii=False,indent=2),encoding='utf-8')
html=(b/'review.html').read_text(encoding='utf-8').replace('B · GPT 걷기 시트','B · GPT 걷기 시트 (사용자 선호)')
(b/'review.html').write_text(html,encoding='utf-8')
for kind in ['rig','gpt-sheet','rigid']:
    folder=b/kind
    files=[{'path':p.relative_to(folder).as_posix(),'sha256':digest(p),'bytes':p.stat().st_size} for p in sorted(folder.rglob('*')) if p.is_file() and p.name!='manifest.json']
    meta={'id':'chr.silver.gpt-walk.'+kind,'version':1,'status':'concept','humanApproved':False,'preferred':kind=='gpt-sheet','input':'../input/master.png','inputSha256':digest(b/'input/master.png'),'generator':'GPT image_gen + sprite-gen slice-sheet' if kind=='gpt-sheet' else 'sprite-maker native Rust core; manual rig','license':'source code MIT / Apache-2.0; production rights of artwork not reviewed','files':files}
    (folder/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
evidence={'sourceCommits':{'sprite-maker':'9de73a6136a1a045af2e8769349fbadc17dbef69','sprite-gen':'4f5ccd55c7cf06685a41f954acc1e476b7772ece'},'selection':selection,'nativeSourceFiles':{},'inputs':{},'candidateManifests':{},'reportSha256':digest(b/'REPORT.md')}
for name in ['types.rs','ik.rs','mesh.rs','skin.rs','ik_tests.rs']:
    evidence['nativeSourceFiles'][name]=digest(b/'sources/sprite-maker/src-tauri/src/rig'/name)
for name in ['input/master.png','rig.json','sheet-prompt.txt','gpt-sheet/raw.png']:
    evidence['inputs'][name]=digest(b/name)
for kind in ['rig','gpt-sheet','rigid']:evidence['candidateManifests'][kind]=digest(b/kind/'manifest.json')
(b/'final-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
log=root/'skill-observations/log.md'
old=log.read_text(encoding='utf-8')
title='관절 연결과 렌더된 장비의 형태를 따로 검사해야 한다'
if title not in old:
    number=max([int(n) for n in re.findall(r'^### Observation (\d+):',old,re.M)]+[0])+1
    entry=f'''\n### Observation {number}: {title}\n\n**Status:** OPEN\n**Date:** 2026-11-06\n**Session context:** GPT 캐릭터의 뼈대·시트 생성 방식 비교\n**Skill:** sprite-pipeline / visual-qa\n**Type:** open-source\n**Phase/Area:** 장비 보존 검수\n\n**Issue:** 손과 검의 뼈대 연결 간격은 0px이고 검 뼈대 길이도 일정했지만, 혼합 가중치로 변형한 픽셀 칼날은 휘었다. 자동 스프라이트 QA도 이 결과를 충족으로 판정했다.\n\n**Suggested improvement:** 장비가 보이는지, 손을 따라가는지, 장비 자체의 형태가 유지되는지를 나눠 검사한다. 뼈대 좌표 검증과 실제 프레임 시각 검수를 함께 남긴다. 공용 규칙 승격은 별도 검토로 남긴다.\n\n**Principle:** 데이터 연결이 맞아도 렌더된 형상이 맞는 것은 아니다.\n\n**Reference file:** out/experiments/gpt-walk-20261106/REPORT.md\n'''
    assert f'### Observation {number}:' not in old
    with log.open('a',encoding='utf-8') as f:f.write(entry)
    assert log.read_text(encoding='utf-8').count(f'### Observation {number}:')==1
print('Sealed 3 candidate manifests, source/input hashes, and user preference.')
