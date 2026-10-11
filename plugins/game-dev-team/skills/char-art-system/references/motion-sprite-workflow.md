# 전신 모션 스프라이트 워크플로

## 작업 계약

프로젝트 경로, 승인 reference와 해시, stable ID, 액션/방향, 표시 크기, 공통 canvas,
seed, backend/model 해시, upstream revision, Blender action/slot, evaluated yaw,
FPS, 프레임 선택, pivot, baseline, root 이동, 장비 목록을 명시한다.
모델·API 키는 스킬 본문에 넣지 않는다. 제작 결과는 검수 전 `concept`다.

## 제작 순서

1. 승인 reference를 고정하고 전신 리그의 동작을 먼저 본다. 사람이 만든 authored
   걷기/달리기/공격/구르기/대기 action을 우선 비교한다. 절차적 드라이버의 실행 성공이
   자연스러운 모션의 증거는 아니다. 다리 교차, 지지발 접지, 골반 이동을 확인한다.
2. `blender-authored-driver.py`에서 검의 grip·길이와 모자·깃털을 리그에 붙인다.
   keyed rotation을 덮어쓰지 않도록 방향은 별도 parent에 적용한다. 모든 evaluated
   frame의 장비를 포함해 카메라를 맞춘다. 측면 게임에서는 실제 렌더의 측면을 확인한다.
3. `sprite-lab.py`로 하나의 reference와 연속 driver를 사용한다. SCAIL-2에는 reference
   mask와 driver mask를 함께 제공한다. 가이드에 없던 장비를 prompt만으로 유지할 수
   있다고 가정하지 않는다. negative prompt 제외 조건은 실제 sampler/CFG에서 작동하는지
   확인한다. CFG 1의 결과를 negative 조건 준수로 간주하지 않는다.
4. 알파를 별도 단계로 추출한다. 다리 사이 배경과 검·깃털 경계를 확인한다. 가려진 신체와
   잘린 칼을 알파 처리로 복원하려 하지 않는다. 공통 canvas·clip scale을 유지하고
   프레임별 bbox 확대/축소를 하지 않는다.
5. 모션이 좋은데 일부 프레임의 색만 달라졌다면 재생성 전에 color-only 보정을 비교한다.
   아래 도구는 지정한 프레임의 RGB만 바꾸고 alpha·canvas를 보존한다. 원본을 덮어쓰지
   않으며 untouched frame 파일과 입력 hash를 기록한다. 검게 소실된 디테일은 복원하지 않는다.
6. loop는 closing duplicate 유지 여부를 결정한다. idle의 미세 호흡에는 pingpong을
   비교할 수 있다. 달리기·공격을 무조건 역재생하지 않는다. 잘린 한 프레임의 대체는
   명시적인 mapping과 사유를 남기고 hold 길이를 검수한다.
7. 게임에서 source root curve를 world position/충돌에 연결한다. 이미지에 이미 있는 이동은
   render anchor에서 빼서 이중 이동을 막는다. attack 끝→idle에서 actor를 시작점으로
   되돌리지 않는다. airborne 높이는 source에서 보존한다. 기준 frame과 clip scale을
   고정하고 생성된 baseline drift만 보정한다.
8. 먼지·잔상·발광은 캐릭터와 별도 layer로 재생한다. world 좌표, 수명, 범위,
   좌우 방향, spawn 시점, 끄기와 reduced-motion을 설정한다. sprite cell 경계로 FX를 자르지 않는다.

## 재사용 명령

```bash
node skills/char-art-system/scripts/motion-clip-tools.mjs color --source frames --out corrected --frames 13,14,15 --references 11,12,18,19 --id chr.example.walk
node skills/char-art-system/scripts/motion-clip-tools.mjs loop --source corrected --out idle-loop --mode pingpong --fps 24 --id chr.example.idle
node skills/char-art-system/scripts/motion-clip-tools.mjs loop --source corrected --out selected --map 0,1,2,2,4 --fps 30 --id chr.example.roll
node skills/char-art-system/scripts/motion-align.mjs samples/motion-court/config.json
```

color frame 번호는 **1부터**, loop map은 **0부터**다. frame 폴더에는 개별 PNG만 넣는다.
sheet와 contact 이미지를 같이 넣지 않는다. 결과 manifest에는 source hash, mapping,
보정 curve, FPS, concept 상태가 남는다. 반복 횟수·타이밍은 게임 스펙으로 정한다.

`motion-align.mjs <config.json> [출력폴더]`는 config 위치를 기준으로 clip/driver 경로를
해석하고 `alignment.json`·concept manifest·`feel.json`을 만든다. `world.characterHeight`,
`clips.<action>.folder`, 선택적인 `driver`, `driverFrameMap`, `sizeReferenceFrame`, `travelPx`를
명시한다. source의 evaluated root가 단조롭게 이동하는 파일럿에 사용한다. 되돌아오는 root
curve나 복잡한 다단 공격은 이 단순 종점 보정에 맡기지 않고 엔진 곡선을 별도로 검수한다.

## 검수와 증거

- 전 프레임: 검 존재/길이/grip/방향, 머리·모자·깃털, 좌우 facing, 의상·팔레트.
- 동작: 걷기 발 교차와 접지, 달리기 loop seam, 전방 베기 체중 이동, 찌르기 전진,
  구르기 뒤집힘과 회복, idle 호흡과 즉시 입력 전환.
- 게임: walk/run/idle/action 진입·회복, 양 방향, root 종점 유지, 칼·몸 크롭,
  FX on/off, 가장 작은 표시 크기와 바쁜 배경.
- `sprite-qa`, `pixel-contract`(도트일 때), `feel-audit`를 각각 기록한다.
  규격 QA는 형태·모션 자연스러움·장비 유지에 대한 사람 승인이 아니다.
- 원본/수정본/graph/모델 해시/driver/mapping/QA/preview를 `review-loop` stable ID로 등록한다.
  실제 브라우저를 검수하지 못했으면 HTTP·headless 검증과 구분해 미실행으로 보고한다.

완료 보고는 주장·도구 출력 증거·기준·미검증 공백·잔여 위험을 남긴다.
사용자가 현재 샘플을 수용한 것과 다른 캐릭터·모델·액션의 양산 승인은 구분한다.

장비 생성이 반복해서 흔들려 결정론적 장비 layer로 교체할 때는 기존 생성 장비를 먼저 제거한 수정본을 남긴다. 원래 칼과 새 칼이 겹치지 않도록 전 프레임을 확인하고 grip·장비 길이와 원본/수정본을 별도로 기록한다.
