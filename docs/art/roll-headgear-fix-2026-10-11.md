# 구르기 v4 — 모자·머리 정체성 수정

## 주장

사용자가 구르기 도중 대머리처럼 변한다고 지적했다. 흰 깃털이 머리카락처럼 생성되고 빨간 모자가 사라진 v3를 교체했다. 머리 관절에 모자 챙·크라운·깃털을 고정한 제어 영상으로 재생성했다. 게임은 `action-roll-v4-clean-review`를 사용한다.

## 증거

- HEAD `48413a5` + 작업 트리 변경. `http://127.0.0.1:8788/motion-game/index.html`.
- `blender-authored-driver.py --headgear feathered-hat` 옵션. 기본 none이며 기존 사용법을 보존한다. 소스/번들 미러 동일하게 수정했다. 25프레임에 headgear bounds가 있고 원본 root travel이 기존 Roll_RM과 동일한 것을 검사했다.
- 출처·모션·모자 bounds: `out/sprite-lab/action-roll-v4-driver/motion.json`. SCAIL 그래프/설정/참조/모델 정보: `action-roll-v4-scail/`. prompt ID `04759ebf-4657-40c3-a701-a8e092b251aa`, seed 42, 25프레임, CFG 3, 8 steps.
- 기존 승인된 RGB 보정 재사용. `action-roll-v4-color-review/color-qa.json`: alphaDiff 0, 비보정 프레임 바이트 동일. 잘린 0-based 생성 프레임 14를 제외하고 이전 정상 프레임 13을 33ms 유지했다. PNG 픽셀을 다시 그리지 않고 기존 파일을 복사했다. 선택 매핑과 해시는 최종 manifest에 기록했다.
- 최종 contact sheet 25프레임에서 모자 챙과 깃털을 확인했다. 구부린/뒤집힌 자세는 망토와 몸에 일부 가려진다. 먼지는 캐릭터에 없다.
- 게임 검사 원문 `out/sprite-lab/motion-game/qa-output.txt`: **exit 0, 28개**. 플러그인 검사 원문 `out/sprite-lab/roll-hat-plugin-validation.txt`: **exit 0**.
- 프레임 전용 sprite QA 원문 `out/sprite-lab/action-roll-v4-sprite-qa.txt`: **exit 1**, 색·형태 미달. 이 판정은 통과로 바꾸지 않았다.

## 기준

빨간 모자 챙·흰 깃털·갈색 머리 정체성을 원화와 대조한다. 먼지 없는 캐릭터, 170px 이동·30FPS·기존 무적 창은 유지한다. 모자 실루엣을 카메라 fit bounds에 포함해 가이드의 머리 장비가 잘리지 않게 한다.

## 공백

실제 브라우저 입력·화면 캡처는 미실행이다. 엔진/HTTP 검사와 PNG 검수는 사람의 게임 화면 평가를 대체하지 않는다. 신규 구르기의 사람 승인은 대기다.

## 잔여 위험

깃털 형태와 모자 비율이 원화와 완전히 동일하지 않고 중간 장비·색 디테일이 흔들린다. 33ms 프레임 유지가 접합 느낌에 영향을 줄 수 있다. concept이며 production으로 승격하지 않았다.
