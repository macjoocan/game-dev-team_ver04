# 엔진 공통 2D·3D 이펙트 제작

같은 색·시간·좌표 규격으로 재료를 만들고, 실제 파일을 검사한 뒤 사람에게 넘긴다. 엔진을 선택하기 전에도 사용할 수 있는 제작 단계다.

## 제작과 확인

1. 프로젝트의 시각 기준과 팔레트를 지정한다. 동봉 예제는 밝은 캐주얼 스타일의 시험용이다.
2. `fx-pipeline-spec.json`에서 ID·색 토큰·프레임·fps·세계 크기와 예산을 정한다. 동봉 예산은 시험값이며 프로젝트 목표가 아니다.
3. `fx-build.mjs`로 새 폴더에 생성한다. 같은 스펙·팔레트·시드·도구에서는 에셋 바이트가 같다. 실행 경로가 담긴 로그는 별도다.
4. `fx-check.mjs`로 해시·프레임·시트·모션·메시·예산을 검사한다. 누락·형식 오류는 측정 불가, 변경·규격 불일치·예산 초과는 미달이다.
5. `preview.html`을 열어 실제 동작을 확인한다. 기본은 정지 상태다. 재생·속도·프레임·배경을 바꿀 수 있다.
6. 엔진 연결 뒤 작은 화면·복잡한 배경·여러 효과가 겹친 장면에서 가독성·플래시·성능을 검수한다. 사람 승인 전까지 `concept`를 유지한다.

```bash
node skills/fx-art-system/scripts/fx-build.mjs skills/fx-art-system/references/fx-pipeline-spec.json --out out/fx-v1
node skills/fx-art-system/scripts/fx-check.mjs out/fx-v1/manifest.json --out out/fx-v1-qa
node skills/polish/scripts/flash-check.mjs out/fx-v1/fx.impact.2d/manifest.json --out out/fx-v1-flash
```

3D 폴더에는 시트·텍스처도 있으므로 폴더 전체를 프레임으로 검사하지 않는다. 다음처럼 정확한 프리뷰 시트를 지정한다.

```bash
node skills/polish/scripts/flash-check.mjs out/fx-v1/fx.burst.3d/preview_sheet.png --frames 24 --fps 24 --out out/fx-v1-flash-3d
```

위 검사는 해당 배경·카메라의 에셋 수준 결과다. 실제 화면의 겹침·크기·플래시 안전을 보장하지 않는다. 반복형은 `--loop`를 함께 준다.

## 스펙

경로는 스펙 파일 기준이다. `palette`와 `visualReference`는 실제 파일이어야 한다. 색은 `@group.key`만 허용하며 없는 토큰이나 중복 ID는 생성 전에 거부한다.

| 항목 | 뜻 |
|---|---|
| `schemaVersion` | 현재 1 |
| `seed` | 결정론적 파티클 배치용 정수 |
| `license` | 사용 조건. 동봉 예제는 미확정이므로 출시 권한을 주장하지 않음 |
| `budgets` | `textureBytes`, `particles`, `triangles` 상한. 모든 효과를 1개씩 동시 사용하는 가정 |
| `id` | 파일 경로에도 쓰는 stable ID. 영문·숫자·점·밑줄·하이픈 |
| `dimension`, `type` | 2d: impact/pop/pulse/sparkle. 3d: burst/orbit |
| `frames`, `fps`, `loop` | 프레임 수·초당 프레임·반복 여부. 기간은 frames/fps |
| `worldSize` | 미터 기준 시각 크기. 2D도 엔진에서 이 크기로 배치 |
| `size` | 2D 정사각 프레임 픽셀 크기 |
| `particles`, `speed`, `gravity`, `segments` | 3D 파티클 수·속도·중력·링 분할 수. burst의 speed는 m/s, orbit는 한 루프의 회전 수(1~4 정수) |

2D 반복은 pulse, 3D 반복은 orbit만 지원한다. orbit의 gravity는 0으로 둔다. burst는 일회성이다. 현재 블렌드는 additive만 지원한다. 연기·리본·액체·볼륨·충돌 기반 효과는 이 버전의 제작 범위가 아니다.

## 산출물과 엔진 연결 계약

| 파일 | 용도 |
|---|---|
| `manifest.json` | ID·상태·색·블렌드·프레임·피벗·예산·출처·파일 SHA-256 |
| `source-spec.json`, `palette.json`, `VISUAL_DESIGN.md` | 제작 당시 입력 사본 |
| 2D `texture_sheet.png`, `texture/*.png` | 가로 시트와 개별 RGBA 프레임 |
| 3D `ring.gltf`, `particle.png`, `motion.json` | 링 메시, 파티클 텍스처, 시간별 위치·크기·알파·링 반지름 |
| 3D `frame_*.png`, `preview_sheet.png` | 고정 카메라 투영 프리뷰. 런타임 텍스처가 아님 |
| `preview.html`, `preview.png` | 재생 검수 화면과 대표 프레임 모음 |

- 좌표는 오른손계, Y 위, +Z 앞, 미터 단위다. [glTF 2.0 좌표 규격](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units)을 따른다.
- 3D 링은 원점 중심이며 반지름 1인 기본 메시다. `motion.json`의 `ringRadius`로 크기를 바꾸고 `alpha`를 적용한다. 파티클은 로컬 좌표의 `position`, 미터 크기의 `size`, 0~1 `alpha`를 적용한다.
- 2D 피벗은 중앙 `[0.5, 0.5]`다. 시트를 `size × size`로 나누어 fps대로 재생한다. RGBA는 straight alpha다. additive 구현은 RGB에 alpha를 한 번 곱해 배경에 더한다.
- glTF의 `alphaMode: BLEND`는 일반 알파 합성이다. additive와 동일하지 않다. 엔진 어댑터는 manifest의 `blend`와 `depthWrite:false`를 재질에 적용해야 한다. [glTF 알파 규격](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#alpha-coverage)
- 모션은 표본 데이터다. 엔진은 표본 사이를 보간하고, 일회성은 종료 후 제거하며 반복형만 순환한다. 충돌·바닥 접지·부착 대상·풀링은 엔진에서 결정한다.
- 텍스처 메모리는 RGBA32 추정치다. 압축·밉맵·다중 인스턴스·실제 GPU 점유는 포함하지 않는다. 삼각형과 파티클 수는 비용의 일부일 뿐이다.

## 검수 기록

규격 검사 리포트와 별도로 시각 검수에 화면 크기·배경·동시 효과 수·빌드·프레임레이트를 남긴다. 플래시가 미달이면 출하를 막고, 면적 조건부나 엔진 미검증을 자동 승인으로 바꾸지 않는다. 정본이 바뀌면 새 버전 폴더로 만들고 이전 검수와 비교한다.
