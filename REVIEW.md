# 리뷰: 스킬 트리거 정확도 & 에이전트 정의 품질

목표 렌즈: **다양한 게임을 만드는 범용 팀.** 특정 게임/장르/엔진에 종속되지 않아야 한다.

## A. 스킬 트리거 정확도
현재 스킬 description은 대체로 잘 분리돼 있으나, 아래를 점검·명시했다.
- `balance-sim`(전투 재미) ↔ `econ-sim`(경제) : "구분된다" 문구로 오발동 방지. OK.
- `polish`(연출) ↔ `artist`(정적 비주얼) : artist description에 연출 디렉션을 명시해 경계 정리.
- `concept-discovery`(0단계 발산) ↔ game-designer(1단계 수렴) : "정식 기획 이전" 명시. OK.
- `pr-review`(정확성) ↔ `balance-sim`(재미) : 둘 다 "리뷰/검증"이지만 대상이 다름(코드 vs 밸런스).

### 권장 검증 방법 (지속)
`skill-creator`로 각 스킬의 트리거 eval을 돌린다:
- 양성 예시(떠야 함) + 음성 예시(뜨면 안 됨)를 5~10개씩.
- 오발동·미발동을 세고 description을 조정. "무엇이 아닌지"(negative scope)를 넣을수록 정확해진다.

## B. 에이전트 정의 품질 (수정 반영)
| 에이전트 | model | 발견/조치 |
|---|---|---|
| pm | inherit | **Write 추가** — 트래커 MCP 없을 때 `docs/tasks/`에 태스크 문서 기록 |
| game-designer | inherit | **경계 명시** — core 담당, 경제는 meta-economy-designer 소관 |
| developer | inherit | **polish 스킬 추가** — 연출 구현(artist+developer 공동) |
| qa | inherit | 정확성 전담 명시 OK. 변경 없음 |
| artist | inherit | **description 정본 통일** — 연출(폴리싱) 디렉션 반영(드리프트 수정) |
| meta-economy-designer | inherit | core 통과 후 진입 명시 OK. 변경 없음 |

모델 배정: 역할 파일의 `model:`은 로더 호환성을 위해 전부 `inherit`. 실제 라우팅 기준은 `AGENTS.md`에서 관리 —
창작·판단 밀도 높은 작업(designer/dev/meta 성격)은 높은 추론 설정, 실행·검증형 작업(pm/qa/artist 성격)은 중간 추론 설정.
역할 경계: 재미(designer) / 정확성(qa) / 경제(meta) / 연출(polish=artist+dev) 4축이 겹치지 않게 분리 확인.

## C. 드리프트 방지 (프로세스 교훈)
GitHub push를 손수 작성한 내용으로 하다 소스와 어긋난 사례가 있었다.
→ **항상 소스(플러그인 디렉터리)를 정본으로 두고, 그 내용을 그대로 push**한다. 손으로 다른 내용을 push하지 않는다.
