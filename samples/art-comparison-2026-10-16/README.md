# 최신: 서비스 Fix Loop도 연결 실패 — 원본 한 주기 추출 후보 추가

사용자가 Fix Loop의 루프 연결을 미승인했다. [새 비교 화면](cycle.html)에서 원본36장·서비스보정36장·추출24장을 비교한다. [작업 근거](cycle-review.md). 추가 크레딧0. 아래 수치 개선 기록은 성공 판정이 아니다.

# 검객 아트 도구 비교 — 2026-10-16

최신 수정: Ludo Fix Loop 1회 보정본 36장을 추가했다. 경계 변화량은 감소했으며 최종 사람 검수 대기다. 상세는 [루프 보정 기록](loop-repair.md), 원본·보정 비교는 [대시보드](dashboard.html). 아래 최초 비교의 크레딧·판정은 보정 전 기록이다. 현재 잔액 화면 표시는 3, 보정 실행 견적은 3크레딧이다.

## [주장]

Ludo Hydra 일반 Animate는 실제 걷기가 보여 모션 시안 제작 후보로 검토할 만하다. 무료 내보내기에는 워터마크가 있어 프로덕션용 결과로 승인하지 않았다. Voidless는 이번 조건에서 다리 자세가 거의 고정되어 걷기 실패로 판단했다. Ludo 새 Directional Sprites는 서비스 화면 오류로 측정 불가다. 각 서비스의 일반 성능을 단일 시험으로 단정하지 않는다.

`dashboard.html`을 더블클릭하면 인터넷 없이 비교 재생할 수 있다. 원본·문서의 상대 링크까지 보려면 이 폴더를 함께 보관한다. 기존 주소 호환을 위해 `index.html`도 같은 대시보드다.

## [증거]

대상 커밋: `40f23f0` · 하네스: codex · 전 결과 concept.

| 경로 | 수행 및 결과 | 크레딧 |
|---|---|---:|
| 기존 SCAIL-2 | 기존 걷기 25장/24FPS, 베기 25장/15.652FPS 복사. 재생성하지 않음 | 이번 사용 없음 |
| Voidless Animate | 원화 업로드 → Animate → 16장/1024px RGBA. GIF 200ms × 16 = 5FPS. 걷기 실패 | 15 사용, 10 잔여 |
| Ludo Directional Sprites | Image to 3D Hero 생성 15 → Humanoid 리깅 요청 1 → 화면 오류. 방향별 프레임 미확보 | 16 |
| Ludo Hydra 일반 Animate | 동일 원화·동일 걷기 프롬프트. 36장/418×491 RGBA 내보내기. 다리 교차 확인, LUDO 워터마크 포함 | 9 추가, 총 25 사용, 5 잔여 |

추가 결제 없음. Voidless의 Multi Animator 100/200크레딧 경로는 실행하지 않았다. Voidless 서비스 이용내역 생성 시간 58.08초, 업로드 2.34초. Ludo 처리 시간은 정밀 측정하지 않았다.

Voidless 기본 종료 프레임은 원화가 선택되어 있어 루프 용도로 그대로 사용했다. 서비스가 1254px 입력을 1024px contain/pad로 맞췄으며, Animate Remove BG는 켬. 원화는 이미 투명하므로 업로드 단계 별도 배경 제거는 실행하지 않았다. Hydra는 최대 3초·36프레임·크기 Max·루프 켬·Auto margin. 종료 프레임은 지정하지 않았다. 두 경로의 실제 프롬프트는 `comparison.json`에 보존했다. 원화에는 칼이 없어 칼을 들도록 추가 요청했다.

Ludo Directional 오류 원문:

```
ReferenceError: setNoWalk is not defined
2026-10-16T05:34:13.529Z
```

전체 오류 기록은 `ludo/browser-error.json`. 리깅 완료 여부는 확인하지 못했다. 이 오류를 모션 품질 미달로 취급하지 않는다.

판정 도구 출력은 요약으로 대체하지 않고 다음 원문에 보존했다. 대시보드에도 원문을 내장했다.

- `qa/initial-art-gate.txt`: exit 3 — 기존 설정 대상 경로 부재로 측정 불가.
- `qa/walk.txt`, `qa/slash.txt`: 기존 결과 각각 exit 1.
- `qa/voidless-walk.txt`: exit 0. 정합성 충족이 걷기 성공을 뜻하지 않는다.
- `qa/ludo-walk.txt`: exit 0. 워터마크가 포함된 정규화본의 결과다.

원본 ZIP/GIF, 숫자 순서대로 정렬한 프레임, 128px 비교용 정규화본, contact sheet를 보존했다. 원본 해시와 각 프레임 해시는 `comparison.json`에 있다. 사용자 피드백 “아예 걷는 모션이 없음”을 Voidless 걷기 판정에 반영했다. 16장 접촉 시트와 하단 40% 알파 실루엣 IoU 0.990 이상이 해당 관찰을 뒷받침한다. IoU는 128px 비교본에서 alpha>128로 계산한 보조값이며 보편 합격선이 아니다.

## [기준]

깃털 모자·망토·얼굴·복장 정체성, 칼 보존과 잘림, 다리 교차·접지·무게 이동, 루프, 알파, 시간·크레딧을 확인한다. 구조 QA와 실제 동작, 사람 승인은 분리한다. 프레임별 개별 크기 맞춤은 하지 않고 클립 첫 프레임의 앵커·배율을 고정한다.

Hydra 비교 재생 13.5FPS는 36장 ÷ 페이지 원본 영상 길이 2.666667초로 계산한 균등 타이밍 가정이다. 서비스의 프레임별 원래 타이밍을 확인한 값은 아니다. 워터마크를 지우지 않았으며 워터마크가 알파 경계와 앵커에 포함되는 한계를 명시했다.

## [공백]

각 외부 생성 경로는 원화 1종·걷기 1회만 시험했다. 외부 베기와 방향 전환, 게임 엔진 연동, 워터마크 없는 내보내기, 장비 일관성 및 루프 품질의 최종 사람 검수는 미완료다. 새 Directional Sprites 품질은 판단 불가. Voidless 종료 프레임 조건 변경은 시험하지 않았다. 배경 제거 기능 자체의 우열을 이 모션 시험으로 평가하지 않았다.

## [잔여 위험]

Hydra는 걷기 시안 후보이며 현재 무료 출력물을 실게임 에셋으로 채택할 수 있다고 결론 내리지 않는다. Voidless 실패는 이번 기본 종료 프레임 조건의 단일 실행에 한정한다. 기존 기준도 QA 미달이므로 절대적인 완성품 기준이 아니다. 전 결과 프로덕션 승격 없이 공동 검수에 등록한다.

기능 조사 출처: [Dooray AI Brief](https://nhncorp.dooray.com/task/1711801813728010616/4444481027592477588), [Ludo Directional Sprites](https://ludo.ai/features/directional-sprites), [Voidless 릴리즈 노트](https://voidless.dev/release-notes), [Voidless MCP](https://voidless.dev/mcp). 실행 결과와 기능 소개의 주장을 구분한다.

재생성: `node samples/art-comparison-2026-10-16/build-dashboard.mjs`. 생성 원본은 `dashboard.template.html`, 프레임·메타데이터 정본은 `comparison.json`. 별도 서비스 재요청이나 크레딧 소비 없이 HTML만 조립한다.

추가 사람 검수 (2026-10-16): “ludo 가 깔끔한데 루프 되기 전에 뚝 끊기는게 아쉽네”. 그림과 보행의 긍정 평가 및 루프 경계 끊김을 해당 Hydra 결과의 피드백으로 기록했다. 채택 판단은 ‘모션 시안 후보·루프 접합 보정 필요’다. 원본은 변경하지 않았다. 사람의 최종 승인이나 공통 규칙으로 해석하지 않는다. 이 피드백은 comparison.json의 vendors.ludo.hydra.userFeedback에 구조화해 보존했다.
