---
name: art-direction
description: >
  게임의 비주얼 방향(아트 스타일·팔레트·실루엣 규칙·UI 톤·카메라/가독성)을 정하고
  `VISUAL_DESIGN.md`로 고정한다. 개별 에셋을 만들기 시작하기 전에 먼저 한다.
  레퍼런스 이미지가 있으면 팔레트·규격을 실측해 근거 있는 기준으로 바꾼다.
  "아트 방향 잡자", "비주얼 컨셉", "톤 정해줘", "팔레트 정리", "VISUAL_DESIGN 만들어줘",
  "레퍼런스 분석해줘", "스타일 프로필 만들어줘" 같은 요청에 사용. 소유: artist.
  주의: 방향을 정하는 단계다. 실제 제작은 sprite-pipeline·ui-art-system·asset-3d-pipeline 소관.
---

# 아트 디렉션

에셋을 만들거나 들여오기 **전에** 한다. 목표는 에셋이 불어나기 전에 게임이 알아볼 수 있고,
읽히고, 일관되게 만드는 것이다.

## 입력
- 게임 판타지, 장르, 타깃 플랫폼, 카메라, 엔진, 대상 유저.
- 기존 스크린샷·레퍼런스·브랜드 색·UI 샘플, 또는 금지 스타일.
- 제약: 해상도, 스프라이트 크기, 폴리 예산, 판독 거리, 파일 포맷.

## 산출물
`VISUAL_DESIGN.md`를 만들거나 갱신한다:
- **비주얼 필러**: 모든 에셋이 지켜야 할 짧은 규칙 3개.
- **팔레트**: primary, accent, danger, neutral, background, disabled.
- **형태 언어**: 플레이어, 적, 상호작용 대상, 위험 요소, 보상.
- **카메라/가독성**: 실루엣 크기, 대비, 외곽선, 라이팅, 목표 줌.
- **UI 톤**: 버튼, 패널, 아이콘, 타이포 느낌, 희귀도/상태 표현.
- **에셋 규칙**: 명명, 피벗/앵커, 투명 배경, 익스포트 포맷.
- **금지 목록**: 피할 스타일·색·모티프, IP 유사 룩.

## 절차
1. 용도·크기·카메라·톤이 빠져 있으면 에셋을 만들기 전에 먼저 묻는다.
2. 승인된 방향이 아직 없는 프로젝트에서만 방향 2~3개를 낸다.
3. 하나를 권하고, 게임플레이 가독성에 걸린 이유를 한 줄로 붙인다.
4. 승인 후 규칙을 `VISUAL_DESIGN.md`에 고정한다.

## 도구 — 레퍼런스에서 기준을 실측한다

`VISUAL_DESIGN.md`의 "버튼 라운드는 높이의 28%", "채도는 이 정도" 같은 값이 감으로 정해지면
나중에 다툰다. 레퍼런스 이미지가 있으면 **측정한 숫자로 대체한다.** 전부 Node 내장만 쓰고
외부 API·패키지가 없다(PNG 전용).

체인은 순서가 있다 — **분류 → 검수 → 측정 → 생성 → 채점**:

```bash
# 1) 분류: 스프라이트 덤프 수만 장을 용도별 라벨로 나눈다
node skills/art-direction/scripts/ref-classify.mjs <폴더> --out classify --sort sorted
#    -> classify.md · classify.json · samples/<라벨>/  (경로+크기+mtime 캐시라 재실행이 싸다)

# 2) 검수: 라벨이 맞는지 한 장의 격자로 즉시 확인 (하위 폴더당 한 줄)
node skills/art-direction/scripts/contact-sheet.mjs sorted --out sheet.png --cell 128

# 3) 측정: 분류된 폴더에서 팔레트·규격을 뽑는다
node skills/art-direction/scripts/ref-analyze.mjs sorted/<라벨> --out ref-analysis
#    -> profile.json(스타일 계약서) · palette-draft.json · ref-report.md/.json

# 4) 생성: 같은 profile.json 을 생성 쪽에 물린다 (char-art-system 소관)
node skills/char-art-system/scripts/comfy-run.mjs <워크플로>.api.json --style ref-analysis/profile.json

# 5) 채점: 생성물을 규격으로 자동 탈락시킨다 (--palette 로 프로젝트 톤 준수도 함께)
node skills/art-direction/scripts/style-score.mjs <생성폴더> --profile ref-analysis/profile.json \
  --palette references/starter-kit/palette.json --pass 70
#    -> score.json · passed/  (사람은 통과분만 본다)

# 6) 접근성: 색 신호가 색각이상에서 살아 있나 (visual-qa 소관)
node skills/visual-qa/scripts/cvd-check.mjs palette.json
```

| 스크립트 | 하는 일 | 판정 범위 |
|---|---|---|
| `ref-classify.mjs` | 파일명 토큰 + 픽셀 지표(크기·비율·단일피사체·배경순도·채도·명도·대비)로 자동 분류 | 용도 라벨 |
| `contact-sheet.mjs` | 여러 장을 격자 한 장으로 합침 | 분류 검수 |
| `ref-analyze.mjs` | 대표색·규격 실측 → `profile.json`·`palette-draft.json` | 수치 근거 |
| `style-score.mjs` | 생성물을 `profile.json`의 target과 대조해 점수·탈락. `--palette`를 주면 **프로젝트 톤 준수**(CIE Lab dE)를 함께 채점 | **규격만** |

- **`profile.json`은 생성과 채점이 공유하는 한 파일이다.** 생성에 쓴 프로필과 채점에 쓴 프로필이
  다르면 그 점수는 근거가 아니다.
- **`ref-classify`를 건너뛰지 마라.** 덤프를 통째로 측정하면 "이 게임의 그림"이 아니라
  "리소스 폴더 평균"이 나온다. 실제로 그렇게 만든 프로필로 생성했더니 캐릭터 뒤에 퍼즐 보드가
  깔렸다(2026-08-21 실측).
- **여러 게임을 고르게 섞어라.** 특정 한 게임에 쏠리면 결과물이 그 게임처럼 보인다.
- `style-score`는 **규격** 채점이다. 그림이 좋은지는 판정하지 않는다 — 그건 사람이 본다.
- 레퍼런스에 PNG가 없고 JPG만 있으면 **측정 불가**다(디코더 미구현). 감으로 채우지 말고 그렇게 보고해라.

## starter-kit — 처음부터 백지로 시작하지 않는다

`references/starter-kit/`에 바로 쓸 수 있는 뼈대가 있다. 새 프로젝트는 이걸 복사해 값만 바꾼다.

| 파일 | 쓰임 |
|---|---|
| `VISUAL_DESIGN.md` | 위 산출물 구조가 채워진 템플릿 |
| `palette.json` | 역할별 색 정의. `fx-art-system`·`ui-art-system`이 이 파일을 읽는다 |
| `ui-spec.json` | 버튼·패널·프레임·바 스펙 → `ui-art-system`의 `ui-kit-gen.mjs` 입력 |
| `fx-spec.json` | 이펙트 스펙 → `fx-art-system`의 `fx-gen.mjs` 입력 |

**팔레트를 확정하면 그 값을 `palette.json`에 넣는다.** 그 한 파일이 UI·이펙트 생성의 색 정본이
되므로, 여기서 색이 갈리면 아래 트랙 전체가 갈린다.

**팔레트를 확정하거나 고칠 때마다 `visual-qa`의 `cvd-check.mjs`를 돌려라.** 색각이상에서
의미가 다른 색이 구분되는지는 눈으로 판정할 수 없다. 동봉 starter 팔레트도 이 검사에서
`danger`와 `primary.base`의 휘도가 겹쳐 전색맹에서 붕괴(dE 4.1)하는 걸 잡아 고쳤다.

## 흔한 실수
| 실수 | 교정 |
|---|---|
| 예쁜데 안 읽히는 에셋 | 실제 게임플레이 크기에서 실루엣을 확인한다 |
| 에셋마다 팔레트가 다름 | 팔레트를 고정하고 허용 예외를 명시한다 |
| UI가 게임플레이와 따로 놀아 보임 | accent 색·형태 규칙·피드백 언어를 공유한다 |
| 기존 IP를 모방한 스타일 | 레퍼런스를 베끼는 게 아니라 **제약 수치**로 변환한다 |
| 레퍼런스를 감으로 요약 | `ref-analyze`로 측정한다. 숫자가 있으면 다툴 일이 없다 |

## 이 레포에서의 위치
- **소유**: artist. 파이프라인 ⑦ 아트 단계의 **입구** — 여기서 기준을 안 잡으면 뒤의 스킬이 전부 흔들린다.
- `VISUAL_DESIGN.md`는 아트의 정본이다. 이후 모든 아트 스킬이 이 문서를 참조한다.
- 게임성(④)·경제(⑨) 검증과 무관한 축이다. 아트 방향이 재미를 판정하지 않는다.
