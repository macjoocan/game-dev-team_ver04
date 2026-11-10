# 4종 게임 아트 도구 연결 가이드

선택 도구 소스는 프로젝트 `.art-tools/`에 둔다. Git에 포함되지 않으며 각 `GAMDEV_SOURCE.json`과 LICENSE에 출처를 남긴다. 신뢰한 소스만 실행한다. 생성 모델 호출과 사람 승인은 별도 단계다.

프로젝트 루트에서 `python <플러그인>/scripts/setup-art-tools.py`를 실행하면 세 저장소의 고정 리비전을 내려받는다. 다른 checkout이 있으면 덮어쓰지 않는다. sprite-gen의 20MB 초과 홍보 GIF는 제외한다. PixelOE는 기존 Sprite Lab 설치를 사용한다. 다운로드에는 네트워크가 필요하다.

## PixelFX

```powershell
node scripts/pixelfx-export.mjs .art-tools/pixelfx melee/sword-slash out/fx-slash 7
```

원본 straight RGBA 프레임을 시트에 직접 복사해 원본 렌더러의 알파 곱셈 문제를 피한다. 기존 출력은 덮어쓰지 않는다. PNG 프레임·sheet.png·manifest.json의 상태는 concept다. 몸을 직접 그리는 `act.onBody` 효과는 분리 연동 전 거부한다. 그 외 효과도 실제 프레임, 피벗, 팔레트와 배경별 합성을 검수하고 flash-check와 review-loop를 거친다. MIT 원본 출처 및 NOTICE를 유지한다.

## sprite-gen

```powershell
& 'D:/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe' -s scripts/sprite-gen-local.py --help
```

각 기능의 인자는 해당 명령의 `--help`로 확인한다. 걷기 접지 검사는 사람이 접지 구간과 한쪽 발 ROI를 지정해야 한다. 불확실한 양발 분리는 미검증으로 남기고 방향 자동 뒤집기를 승인으로 취급하지 않는다. 루프와 정체성은 게임 크기·확대 크기에서 사람이 검수한다. 생성 명령은 제공자 인증·비용 확인 후 별도 실행한다. Apache-2.0 출처를 유지한다.

현재 작업 폴더와 체크아웃 위치가 다르면 `--checkout <sprite-gen-체크아웃>`을 추가한다. `inspect-motion`의 `--source`는 분석할 에셋 경로다. 버전 마커는 출처 기록이지 파일 무결성 검사가 아니다.

## 2dimg2motion

원본 `.art-tools/2dimg2motion/SKILL.md`는 참고 자료다. 승인된 원화에서 얼굴·의상·무기와 화면 좌우 팔다리 소유 관계를 명세하고, 걷기의 양쪽 contact 또는 공격의 준비·타격·후속 키 포즈를 먼저 검수한다. 실패한 키 포즈에 중간 프레임을 채우지 않는다. 원본 14프레임/처음=끝 계약은 비루프 액션에 강제하지 않는다. validator는 구조만 검사하며 자연스러움은 별도 시각 검수가 필요하다. MIT 출처를 유지한다.

## PixelOE

기존 `skills/char-art-system/scripts/sprite-lab.py export --pixel --pixeloe`를 사용한다. 시퀀스 공통 팔레트를 쓰며 on/off를 같은 프레임과 크기로 비교한다. PixelOE는 발 교차나 무기 위치를 새로 만드는 도구가 아니다. Apache-2.0 출처를 유지한다.

## 2026-11-06 쇼츠: 선택 도구 세 가지

설치 스크립트는 Agent Sprite Forge, Codixel, Pixelbolt도 고정 리비전으로 프로젝트 `.art-tools/`에 내려받는다. 원격 저장소의 코드를 실행하므로 출처·라이선스와 리비전을 확인한다. `GAMDEV_SOURCE.json`은 출처 기록이지 파일 무결성 증명이 아니다.

### Pixelbolt: 수정 가능한 도트·FX 레시피

Node.js 20 이상. 자체 예제를 복사하지 않고 기존 체크아웃에서 읽는 예:

```powershell
node .art-tools/pixelbolt/bin/pixelbolt.js compile .art-tools/pixelbolt/examples/hero.poses.json --out out/pixelbolt/hero.json --metadata out/pixelbolt/hero-meta.json
node .art-tools/pixelbolt/bin/pixelbolt.js render out/pixelbolt/hero.json --out out/pixelbolt/render
node .art-tools/pixelbolt/bin/pixelbolt.js inspect .art-tools/pixelbolt/examples/hero.poses.json --motion walk --speed 48 --out out/pixelbolt/walk-review.png
```

레시피 작성·시트·플레이어·접지 검사에 쓴다. 단순 예제 캐릭터의 숫자 판정은 사람이 움직임을 검수한 결과가 아니고, 기존 회화풍 이미지를 자동으로 자연스럽게 걷게 만드는 기능도 아니다. MIT.

### Agent Sprite Forge: 영상 → 후처리

```powershell
python .art-tools/agent-sprite-forge/skills/video2dsprite/scripts/video2dsprite.py --help
python .art-tools/agent-sprite-forge/skills/video2dsprite/scripts/retime.py --frames-dir <번호순-PNG-폴더> --fps 8 --output-dir <새-폴더> --kind walk --range 0:8 --duration 1000
```

위 `--range 0:8`은 0부터 7까지 8장이다. 타이밍 도구는 이미 있는 프레임의 순서와 길이를 기록할 뿐 새 중간 자세를 그리지 않는다. 영상 분석·추출에는 ffmpeg와 ffprobe가 필요하다. 배경 제거는 틈·의상·무기가 뚫리지 않았는지 실물 대조가 필요하다. 영상 생성 명령은 외부 서비스·비용·업로드를 수반할 수 있어 사용자 승인과 별도로 실행한다. MIT.

### Codixel: 레퍼런스 기반 도트 및 파츠 실험

`.art-tools/codixel/SKILL.md`와 `core/pixel.js`의 격자, 팔레트, 파츠 소유권 시각화를 선택적으로 사용한다. 리그를 적용하기 전 뼈 위치와 각 픽셀의 소유권을 사람이 검수한다. 이전에 다리가 겹치거나 끊어진 경험이 있으므로 자동 분리 결과를 전신 모션 완성으로 취급하지 않는다. MIT.

### Sprite Sheet Diffusion: 연구 보류

`chenganhsieh/Sprite-Sheet-Diffusion`은 확인한 저장소에 명시된 코드 라이선스가 없고, 별도 사전학습 모델도 필요하다. 상업적 사용·배포 조건과 8 GB 실행 가능성을 확인하기 전에는 설치하거나 양산 경로에 포함하지 않는다.
