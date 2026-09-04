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
