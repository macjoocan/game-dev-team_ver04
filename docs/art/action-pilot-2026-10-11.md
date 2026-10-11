# 판타지 검사 액션 파일럿

## [주장]

좋아진 걷기 샘플에 이어 칼 베기·찌르기·피격을 같은 캐릭터의 concept 액션으로 추가한다. 25프레임, 512px 생성, 128px RGBA 검수, 24 FPS다. 액션 제어와 실제 생성 품질은 별개다. 최종 사람 승인을 받은 액션이나 엔진에 삽입한 애니메이션으로 취급하지 않는다.

## [증거]

대상 커밋 `48413a5` + 작업 트리 변경.

- [액션 검수 화면](../../out/sprite-lab/actions.html), [실행 코드](../../out/sprite-lab/run-action-pilot.py).
- [Blender 도구](../../skills/char-art-system/scripts/blender-walk-driver.py)에 `--action slash|thrust|hit`를 추가했다. 준비·실행·복귀 곡선, 고정 지지발, 손 앵커에 연결한 강체 칼을 사용한다.
- [제어 기하 검사 원문](../../out/sprite-lab/action-control-qa.json): 3종의 팔다리 길이·칼 길이·손잡이 거리·복귀 오차를 측정한다. 베기는 칼 방향, 찌르기는 칼끝 전진, 피격은 머리 후퇴 폭을 확인한다. 생성 결과를 검증하는 수치가 아니다.
- 생성 스펙·프롬프트는 `out/sprite-lab/specs/action-*.json`, API 그래프·prompt_id·seed·생성 파일 해시는 각 `action-*-scail/`에 저장된다. [설치 모델 해시와 출처](../../out/sprite-lab/models-manifest.json)를 함께 보관한다.
- [첫 베기 QA 원문](../../out/sprite-lab/action-slash-qa/sprite-qa.md), [첫 찌르기 QA 원문](../../out/sprite-lab/action-thrust-qa/sprite-qa.md), [피격 QA 원문](../../out/sprite-lab/action-hit-qa/sprite-qa.md): 모두 exit 1. 색·형태 미달과 알파 경고가 있다.
- 첫 공격 2종은 칼 중복이 보여 재검토했다. 내장 `image_gen`으로 칼 없는 [비교 레퍼런스](../../out/sprite-lab/reference-weaponless/reference.png)를 만들었다. 편집 지시: 검·손잡이·가드를 제거하고 오른손을 같은 위치의 빈 주먹으로 복원하며 나머지 의상·포즈·캐릭터 구도를 유지한다. 출력은 1254² RGBA로 원본 1280²와 다르며, 픽셀 단위 동일성을 주장하지 않는다.
- [플러그인 검사 원문](../../out/sprite-lab/actions-plugin-validation.txt): exit 0. 작업 시작 [아트 게이트](../../out/action-baseline/art-gate-report.md)는 기존 hex 샘플 검사이며 신규 액션 통과 근거로 쓰지 않는다.
- 공격 2종을 칼 없는 레퍼런스로 다시 생성했다. [최종 생성 기록·prompt_id·시간](../../out/sprite-lab/actions-results.json): 베기 120.63초, 찌르기 120.57초, 피격 120.70초. 첫 공격 2종과 재생성 2종·피격 1종으로 로컬 ComfyUI 총 5건, 레퍼런스 편집은 내장 image_gen 1건이다. PixelLab 요청은 없다.
- 개선 공격 시트에서는 첫 시안의 별도 고정 칼이 크게 줄었다. 레퍼런스 편집 과정에서 크기와 일부 세부도 바뀌었으므로 칼 제거만이 개선 원인이라고 단정하지 않는다. 베기의 들어 올림 구간에서는 칼끝이 캔버스에 걸리는 프레임이 있다.
- 3종 모두 13~17번의 중간 밝기를 기존 걷기 곡선 방식으로 보정했다. [베기 보존 검사](../../out/sprite-lab/action-slash-v2-color/color-qa.json), [찌르기 보존 검사](../../out/sprite-lab/action-thrust-v2-color/color-qa.json), [피격 보존 검사](../../out/sprite-lab/action-hit-color/color-qa.json): 512px·128px 알파 변경 각각 0, 해당 구간 외 원본 파일 해시 동일. 새 색 곡선은 픽셀 위치를 바꾸지 않는다.
- 최종 [베기 QA 원문](../../out/sprite-lab/action-slash-v2-color-qa/sprite-qa.md) **exit 1**, [찌르기 QA 원문](../../out/sprite-lab/action-thrust-v2-color-qa/sprite-qa.md) **exit 0**, [피격 QA 원문](../../out/sprite-lab/action-hit-color-qa/sprite-qa.md) **exit 1**. 찌르기의 기술 검사 통과는 모션·장비의 사람 승인을 대신하지 않는다.
- 비교 화면에서 걷기와 액션 3종, 개선본/첫 시안, 반복/한 번 재생, 프레임 넘기기, 전체 25장 시트를 확인할 수 있다. [최종 검증 원문](../../out/sprite-lab/actions-verification.json): exit 0. HTML 내 JavaScript 4개 구문 검사, 3종의 25개 PNG 파일 해시, 512px·128px 알파 보존, 비교 페이지·재생기·시트 HTTP 200을 확인했다. 실제 UI 조작 검증은 아니다.

## [기준]

기존 캐릭터의 오른쪽 방향, 깃털 모자·붉은 망토·흰 셔츠·갈색 부츠를 유지한다. 칼은 한 자루이고 손에 연결되어야 한다. 준비·실행·복귀가 읽혀야 하며 프레임 수·캔버스·피벗을 통일한다. 걷기 검수에서 좋아진 색과 장비 기준을 비교 기준으로 삼는다.

## [공백]

게임 내 이동·공격 판정·무적 시간·피격 상자·타격감·사운드·VFX는 구현하지 않았다. 실제 브라우저 재생 조작과 엔진 검수는 미실행이다. 사람이 액션 시트의 동작과 장비를 승인해야 한다. `docs/pipeline/state.json`과 프로젝트 `VISUAL_DESIGN.md`는 이 저장소에 없어 이번 문서의 시각 기준으로 concept 검수한다.

## [잔여 위험]

움직임이 커질수록 의상·손·칼·밝기가 바뀐다. 제어 칼의 길이가 일정해도 생성 칼이 일정하다는 뜻은 아니다. 첫 생성은 승인 수준으로 보고하지 않는다. 칼 없는 레퍼런스로 비교해도 안정성이 보장되지 않으므로 두 결과를 보관하고 다음 수정 기준을 사람이 정한다.
