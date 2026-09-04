---
name: sprite-pipeline
description: >
  2D 스프라이트를 프레임 간 일관성이 유지되게 만든다. seed 프레임 승인 → 시트/스트립 생성 →
  캔버스 크기·피벗·baseline 통일 → 알파 정리 → 아틀라스/엔진 반영.
  "스프라이트 만들어줘", "캐릭터 시트", "애니메이션 스트립", "아틀라스", "피벗 맞춰줘",
  "프레임 정규화" 같은 요청에 사용. 소유: artist + developer.
  주의: 개별 프레임을 따로 뽑지 않는다 — 프레임마다 캐릭터 정체성이 흔들린다.
---

# 스프라이트 파이프라인

깔끔하게 움직이고 프레임 간 일관성이 유지돼야 하는 2D 게임 스프라이트에 쓴다.

## 핵심 규칙
**seed 프레임 하나를 먼저 승인한다.** 그 seed에서 스트립/시트를 만들어야 정체성·팔레트·의상·
실루엣·방향이 흔들리지 않는다. 프레임을 하나씩 따로 뽑으면 프레임마다 다른 캐릭터가 나온다.

## 필요한 스펙
- 게임플레이 표시 크기와 카메라 거리.
- 프레임 크기와 프레임 수.
- 방향과 액션 목록.
- 피벗/앵커 — 캐릭터는 보통 bottom-center.
- 배경: 엔진이 다른 키를 요구하지 않으면 투명.
- 명명: `<entity>_<action>_<direction>_<frame>.png`.

## 절차
1. 승인된 seed 포즈를 만들거나 고른다.
2. 액션 전체를 **스트립/시트로** 생성한다 — 서로 무관한 단일 프레임을 모으지 않는다.
3. 모든 프레임을 같은 캔버스 크기로 정규화한다.
4. 발/baseline과 피벗을 프레임 간 정렬한다.
5. 알파 경계를 정리하고 떠 있는 픽셀을 지운다.
6. 프리뷰 콘택트 시트나 GIF를 낸다.
7. manifest ID로 임포트하고 **게임플레이 크기에서** 엔진 안에서 확인한다.

## 도구 — 3~6단계는 손으로 하지 않는다

절차 3~6은 기계가 하는 일이다. 실체는 `char-art-system/scripts/`에 있다(생성 축과 같은 스킬에
모여 있어서, 이 스킬만 열면 안 보인다 — `Skill` 툴로 `char-art-system`을 함께 열어라):

```bash
# 시트/스트립을 프레임으로 쪼갠다 (2단계 산출물 -> 개별 프레임)
node skills/char-art-system/scripts/sheet-split.mjs <시트.png> --out frames

# 캔버스 크기·피벗·baseline 통일 (3~4단계)
node skills/char-art-system/scripts/sprite-normalize.mjs frames --out normalized

# 배경 제거·알파 정리 (5단계)
node skills/char-art-system/scripts/cutout.mjs <이미지폴더> --out cut

# 아틀라스로 묶는다 (7단계 입력)
node skills/char-art-system/scripts/atlas-pack.mjs normalized --out atlas.png --max 2048 --pad 2 --trim

# 프리뷰 격자 (6단계)
node skills/art-direction/scripts/contact-sheet.mjs normalized --out sheet.png
```

정규화를 눈으로 맞추면 애니메이션에서 캐릭터가 떨린다. **`sprite-normalize`를 건너뛰지 마라.**

## 스프라이트 QA
- 캐릭터 정체성·팔레트·의상·실루엣이 동일한가.
- 프레임이 잘리거나 baseline이 밀리지 않는가.
- 투명 배경이 깨끗한가.
- 100%·75%·50% 축소에서 동작이 읽히는가.
- 공격/피격/대기 프레임이 게임플레이 타이밍과 맞는가.

## 흔한 실수
| 실수 | 교정 |
|---|---|
| 프레임마다 정체성이 흔들림 | seed 프레임 + 스트립 통째 생성 |
| 애니메이션 중 캐릭터가 떨림 | 캔버스·baseline 정규화 (`sprite-normalize`) |
| 프리뷰는 좋은데 게임에선 나쁨 | 실제 카메라 줌에서 확인 |
| 아틀라스 임포트에서 의미가 사라짐 | manifest ID와 프레임 배치 메모를 유지 |
| 정규화를 손으로 함 | 도구를 쓴다. 눈으로는 1픽셀 밀림을 못 잡는다 |

## 이 레포에서의 위치
- **소유**: artist(방향) + developer(엔진 반영).
- `art-direction` 승인 → seed 프레임 승인 → 시트 생성 순서를 건너뛰지 않는다.
- 산출물은 `asset-pipeline`의 manifest에 ID로 등록한다.
- 애니메이션 **타이밍·타격감**은 이 스킬이 아니라 `polish` 소관이다. 여기선 프레임 정합만 본다.
