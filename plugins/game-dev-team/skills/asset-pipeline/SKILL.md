---
name: asset-pipeline
description: >
  에셋을 일회성 목업이 아니라 양산 가능한 상태로 관리한다. 요청 접수·폴더 구조(_source/raw/final)·
  manifest(안정 ID·승인 상태·출처/라이선스)·엔진 반영 핸드오프를 다룬다.
  "에셋 정리해줘", "manifest 만들어줘", "에셋 승인 상태", "이 아트 출처가 뭐야", "엔진에 반영해줘"
  같은 요청에 사용. 소유: artist.
  주의: 승인(approved) 이전 에셋은 프로덕션 씬·프리팹·빌드에 쓰지 않는다.
---

# 에셋 파이프라인

아트가 일회성 목업을 넘어 프로덕션에서 살아남아야 할 때 쓴다.

## 폴더 규약
대상 게임 레포 안에 이 구조를 기본으로 한다:

```text
Assets/
  Art/
    _source/
    raw/
    final/
    previews/
    manifest/
```

웹 게임이면 `public/assets/art/` 처럼 가장 가까운 대응 구조를 쓴다.

## 에셋 manifest
**안정 ID**를 가진 manifest를 유지한다. 템플릿: `references/asset-manifest-template.json`

```json
{
  "id": "ui.button.primary",
  "type": "ui",
  "status": "approved",
  "owner": "artist",
  "source": "original",
  "license": "project-owned",
  "files": {
    "source": "Assets/Art/_source/ui/button-primary.psd",
    "final": "Assets/Art/final/ui/button-primary.png"
  },
  "constraints": {
    "size": "256x64",
    "pivot": "center",
    "background": "transparent"
  }
}
```

## 상태 흐름
`requested` → `concept` → `approved` → `production` → `imported` → `verified`

**`approved` 이상만** 프로덕션 씬·프리팹·UI·빌드에 쓴다. 이게 이 스킬의 게이트다.

생성 도구(`ui-kit-gen`·`fx-gen`·`char-art-system`)로 뽑은 에셋도 예외가 아니다 —
자동 생성이라 손이 덜 갔다는 게 승인을 건너뛸 이유는 아니다.

## 도구 — 재생성이 다른 걸 같이 바꿨는지 잡는다

```bash
node skills/asset-pipeline/scripts/asset-baseline.mjs snap  <에셋폴더> --out baseline.json
node skills/asset-pipeline/scripts/asset-baseline.mjs check <에셋폴더> --baseline baseline.json
```

생성 도구(`ui-kit-gen`·`fx-gen`·스프라이트 파이프라인)로 에셋을 재생성하면 스펙을 조금 고쳤을 때
**의도한 것 외의 것도 같이 바뀐다.** 크기가 1px 달라지거나 피벗이 밀리면 엔진에서 정렬이 깨지는데
눈으로는 안 보인다. `baseline.json`을 커밋해두고 재생성 후 대조한다.

두 종류를 구분해 판정한다:

| 변화 | 판정 | 뜻 |
|---|---|---|
| 크기 · 알파 경계 · 무게중심 · 9-slice · 피벗 · 프레임 수 · fps | **미달** | 엔진 정렬·애니메이션이 깨진다 |
| 픽셀 해시만 | **조건부** | 규격은 그대로, 그림만 바뀜(팔레트 수정이면 정상) |
| 파일 추가·삭제 | 보고 | 삭제된 에셋을 코드가 참조하면 런타임에 깨진다 |

**범위를 정직하게 그어둔다**: 화면 수준 비주얼 회귀(스크린샷 diff)는 게임이 실제로 돌아야 하므로
**프로젝트 몫**이다(Playwright·엔진 테스트). 플러그인이 엔진 무관하게 할 수 있는 건 에셋 파일
수준의 불변식뿐이다. 그리고 **보기 좋은가는 판정하지 않는다** — 그건 `visual-qa` 소관이다.

## 핸드오프 체크리스트
- 안정 에셋 ID와 파일명.
- 용도와 게임 내 위치.
- 출처/레퍼런스 메모와 라이선스.
- 익스포트 크기, 스케일, 피벗/앵커, 투명도.
- 엔진 임포트 경로와 압축/설정 메모.
- 프리뷰 이미지 또는 콘택트 시트.

## 흔한 실수
| 실수 | 교정 |
|---|---|
| 파일을 교체하니 코드 경로가 깨짐 | 안정 ID를 쓰고 final 경로를 보존한다 |
| 소스 아트가 사라짐 | `_source/`를 최종 익스포트와 분리해 둔다 |
| 미승인 아트가 빌드에 나감 | 프로덕션 사용을 manifest 상태로 막는다 |
| 라이선스/출처를 모름 | 반입 **전에** 출처를 기록한다 |
| R 트랙 추출물이 섞여 들어감 | 추출본은 `_reference/`에만. R7 게이트에서 잡는다 |

## 이 레포에서의 위치
- **소유**: artist. `art-direction`으로 기준이 선 뒤에 돈다.
- manifest의 `status`가 **게이트**다. `approved` 미만인 에셋이 빌드에 들어가면 QA에서 잡는다.
- 출처·라이선스를 기록하지 않은 에셋은 반입하지 않는다 — 나중에 추적이 불가능해진다.
