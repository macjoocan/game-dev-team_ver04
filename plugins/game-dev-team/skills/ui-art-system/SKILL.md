---
name: ui-art-system
description: >
  HUD·버튼·카드·아이콘·희귀도 프레임·데미지 숫자 같은 UI 아트를 상태별 변형까지 포함해 설계하고,
  버튼·패널·프레임·바는 스펙에서 **9-slice 보더까지 든 PNG로 바로 생성한다**.
  "UI 아트", "HUD 만들어줘", "버튼 상태", "아이콘 세트", "카드 프레임", "희귀도 표현",
  "UI 스프라이트 뽑아줘", "9-slice", "버튼 이미지 생성" 같은 요청에 사용. 소유: artist + developer.
  주의: 색은 `palette.json`에 묶는다. 한국어·영어 텍스트가 모두 들어가는지 확인한다.
---

# UI 아트 시스템

UI가 게임의 일부처럼 느껴지고, 따로 얹은 오버레이처럼 보이지 않게 만들 때 쓴다.

## 필요한 컴포넌트
게임이 실제로 쓰는 것만 정의한다:
- **버튼**: default, hover/focus, pressed, disabled.
- **패널/카드**: normal, selected, locked, reward, warning.
- **HUD**: 체력, 재화, 타이머, 점수, 웨이브, 목표.
- **아이콘**: 아이템, 스킬, 상태, 재화, 내비게이션.
- **피드백**: 데미지 숫자, 회복 숫자, 크리티컬, 미스, 방어됨.
- **희귀도/상태 프레임**: common부터 최고 희귀도까지, 디버프/버프.

## 규칙
- UI 색은 `art-direction`의 `palette.json`에 묶는다. 스펙에는 **토큰만** 쓰고 hex를 박지 않는다.
- accent는 주 액션 하나, danger는 위험 하나로 예약한다.
- 아이콘은 **게임 내 최소 크기**에서 읽혀야 한다.
- 한국어와 영어가 둘 다 들어가는 자리는 양쪽 다 맞는지 확인한다.
- 터치 타깃과 세이프에어리어를 타깃 플랫폼 기준으로 잡는다.

## 도구 — 스펙에서 UI 스프라이트를 생성한다

버튼·프레임은 "예쁜 한 장"이 아니라 **규격**이 결과물이다. 상태 변형(normal/pressed/disabled)이
픽셀 단위로 정합해야 하고, 9-slice 보더가 정확해야 늘려도 안 깨진다. 생성 모델은 매번 다른 그림을
주므로 이 조건을 못 맞춘다. **톤은 사람이 정하고(art-direction), 그 값을 스펙에 넣어 여기서 양산한다.**

```bash
node skills/ui-art-system/scripts/ui-kit-gen.mjs <spec.json> [--out <dir>] [--palette <palette.json>]
```

외부 API·패키지 없이 돈다(Node 내장 zlib만). 산출물은 알파 있는 RGBA PNG + `manifest.json`
(9-slice 보더·피벗 포함 — Unity 임포트 때 그대로 쓴다).

뼈대 스펙이 `art-direction/references/starter-kit/ui-spec.json`에 있다. 복사해서 값만 바꾼다:

```json
{
  "sprites": [{
    "name": "btn_primary_normal", "w": 320, "h": 112, "pad": 8, "radius": 32,
    "fill":      { "from": "@primary.light", "to": "@primary.base" },
    "stroke":    { "color": "@primary.outline", "width": 5 },
    "shadow":    { "dy": 7, "blur": 7, "color": "@ink.shadow", "alpha": 0.45 },
    "highlight": { "color": "@surface.white", "alpha": 0.45, "height": 0.42 },
    "nineSlice": { "left": 44, "top": 44, "right": 44, "bottom": 48 }
  }]
}
```

**색은 `@group.key` 토큰으로만 쓴다.** 팔레트 탐색 순서는 `--palette` 인자 → 스펙의 `"palette"`
경로 → **스펙 파일 옆의 `palette.json`**. 토큰이 팔레트에 없으면 조용히 넘어가지 않고 에러가 난다.
`palette.json` 하나만 고치면 UI와 이펙트가 같이 바뀐다 — hex를 박으면 그 연결이 끊어진다.

- 상태 변형은 **같은 스펙에서 값만 바꿔** 뽑는다. 따로 그리면 픽셀 정합이 깨진다.
- 아이콘·일러스트처럼 절차적으로 못 만드는 것은 이 도구 밖이다 → `char-art-system`.
- 생성 후 `visual-qa`로 실제 화면 크기·겹침·세이프에어리어를 확인하고, `asset-budget`으로
  용량·텍스처 메모리를 대조한다. 둘 다 통과 전엔 프로덕션 경로에 넣지 않는다.

## 산출물
- 상태가 붙은 UI 컴포넌트 목록.
- 컴포넌트별 익스포트 스펙(= 위 `spec.json`).
- 라이트/다크/게임플레이 배경에 올린 프리뷰 시트.
- 구현 노트: 9-slice, 앵커, 반응형 동작, 애니메이션 힌트.

## 흔한 실수
| 실수 | 교정 |
|---|---|
| 장식적인 UI가 조작 속도를 해침 | 시선 순서와 터치 타깃을 먼저 잡는다 |
| 희귀도 색이 게임플레이 위험 색과 충돌 | danger를 희귀도와 분리한다 |
| 아이콘마다 라벨이 필요함 | 작은 크기에서 실루엣을 다시 설계한다 |
| 카드/패널 스타일이 조금씩 어긋남 | 보더·코너·섀도·accent를 공유한다 (= 같은 스펙에서 생성) |
| 스펙에 hex를 직접 박음 | 팔레트 토큰으로 바꾼다. 안 그러면 톤 변경이 전량 수작업이 된다 |

## 이 레포에서의 위치
- **소유**: artist(디자인) + developer(구현·생성 실행).
- 색·톤은 `art-direction`의 `VISUAL_DESIGN.md`/`palette.json`에 묶인다. 여기서 새 팔레트를 만들지 않는다.
- UI **전환 애니메이션·입력 피드백**은 `polish` 소관이다. 여기선 정적 컴포넌트와 상태 변형까지.
