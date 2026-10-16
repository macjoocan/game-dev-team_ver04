# 캐릭터 스키닝 보정과 native 모션 보존 기록

2026-10-16 · Multi 및 독립 연구 세션에서 전달받은 결과를 보관한다. 아래 모델·브라우저 검사 수치는 원본 세션의 보고이며, 이 저장소에서 다시 실행한 검사가 아니다. 이번 작업에서는 문서와 JSON 16파일을 복사하고 SHA-256 일치를 확인했다. 모델·게임 원본 자산은 포함하지 않는다.

## 주장

현행 OriginalRetry의 메시·가중치를 유지한다. 기본 5클립의 소수 프레임 시각을 보존한 최신 파일은 Multi의 `final/original-retry-native.glb`와 `.blend`다. 기존 `original-retry`도 보존한다. 독립 연구의 손·어깨 수정 후보 5종은 모두 미채택이다.

제작 순서는 원본 보존 → UV loop를 보존하며 원본 표면 weld → 메시 축소 → 고정 리그에 체형 맞춤 → 가중치 계산 → 동작·외형 검수다. 본 이름이 같아도 bind/rest와 체형 호환을 따로 확인한다. 실패 후보는 별도 복사본·씬에서 검사하고 사용자 씬의 동작·시각을 복구한다.

## 증거

### 원본 재사용과 스키닝

생성 1건을 재사용했다. 원본은 776,678정점·1,494,637삼각형이며, local `1e-5` weld 후 boundary edge가 58,189개에서 191개로 줄었다. 이후 39,946정점·79,999삼각형으로 축소했다. 실제 HatKid Body 70본의 rest·계층을 유지하고, heat 계산용 helper tail만 해부학적으로 조정했다. 가중치 누락은 0이다.

기존 5클립의 원본 키와 중간 시각을 합친 97,090본 행렬 표본 차이는 0, 스킨 155자세는 finite였다. 같은 어깨 영역의 최대 간선 늘어남은 46.08mm에서 21.59mm로 줄어 잠정 30mm 기준을 통과했다. 이전 결과와 삼각형 수 및 몸통 좁힘 적용 여부도 다르므로 weld 단독 효과로 해석하지 않는다.

축소 후 weld, 코트 최근접 가중치 전사, 분리 표면의 전역 heat/smoothing, 전체 voxel 후 UV 전사는 실패했다. 턱은 생성 형상의 돌출과 몸통 가중치 누출을 구분해 머리 강체·목 블렌드 및 국소 최대 약 29mm 뒤이동으로 보정했다. `skin.json`의 턱 보정 false는 후속 턱 보정 이전 단계 기록이다.

근거: [준비](character-skinning-motion-2026-10-16/multi/preparation.json), [가중치](character-skinning-motion-2026-10-16/multi/skin.json), [기존 동작 검사](character-skinning-motion-2026-10-16/multi/validation.json), [문서43 원문](character-skinning-motion-2026-10-16/multi/source-43.txt).

### 미채택 후보

| 후보 | 팔 간선 최대 늘어남 | 손가락 간선 최대 늘어남 | 판단 |
|---|---:|---:|---|
| 기준 OriginalRetry | 21.59mm | 2.32mm | 손가락은 강체 상태 |
| 손가락 가중치만 적용 | 40.62mm | 60.35mm | 미채택 |
| 손 형상 맞춤 | 21.59mm | 14.43mm | 손바닥 접힘, 미채택 |
| 형상 맞춤·평활화 | 21.59mm | 12.49mm | 손바닥 문제 잔존, 미채택 |
| 연속 변위 probe | 29.69mm | 7.85mm | 35회 평활화 후에도 손바닥 불량, 미채택 |
| 어깨 국소 probe | 75.09mm | 2.32mm | 기존 동작 회귀, 미채택 |

후보별 5클립×25시점=125스킨 검사는 Multi의 155자세 검사와 표본 일정이 다르다. 실제 스트레스 렌더 20장과 6종 합성 자세 검사를 수행했으며, 선별 원본 9파일 SHA·rest/계층·5원본 곡선 해시·저장 후 재열기를 보존했다. GLB는 각 70joints·5animations 구조를 확인했지만 웹 실행 검사는 아니다.

합성 cross-chest의 비인접 삼각형 교차 baseline 593/probe 605는 팔·몸통 영역 검사다. 전신 충돌·관통 깊이 측정이 아니다. 180도 twist의 covariance volume proxy 0.972/0.681도 실제 부피가 아니다.

근거: [연구 결론](character-skinning-motion-2026-10-16/research/README-source.txt), [후보 비교](character-skinning-motion-2026-10-16/research/candidate_comparison.json), [스트레스 비교](character-skinning-motion-2026-10-16/research/stress_comparison.json), [보존 검사](character-skinning-motion-2026-10-16/research/preservation_validation.json).

### 소수 키와 모션 대시보드

Blender 5.2.1의 `NLA_TRACKS` 내보내기는 `export_force_sampling=False`여도 실제 GLB가 24fps 시각으로 재샘플됐다. 옵션 설정만으로 소수 키 보존을 주장하지 않고 GLB sampler input을 원본 시각과 대조한다. 이번에는 raw MD5의 local TRS와 precise fps/scale sidecar에서 직접 모션 binary와 native GLB를 만들었다.

기본 5클립의 새 Blender Action `OriginalRetryNative__...`는 raw 대비 1,050본 행렬 표본 최대 오차 `2.6702880859375e-5`, 15자세의 모든 스킨 정점 finite였다. native GLB의 시각·TRS 597,870 float는 모션 binary와 exact 일치했다. 앞의 기존 동작 97,090행렬 차이 0 검사와 비교 기준이 다르다.

같은 70본 이름 집합의 309파일을 실제 TRS/time binary로 중복 제거해 278항목을 제공한다. 이 중 5항목은 정지 포즈다. 원본 Body/Head/Legs의 서로 다른 bind를 각각 유지하고 동일 local pose를 이름으로 연결하며, Root만 Z-up→Y-up 변환한다. 지연 로드·LRU 32MiB·이전 클립 uncache·선택 race token을 사용한다.

원본 세션은 브라우저에서 278×3=834자세의 전체 본 행렬과 스킨별 2표본 정점 finite, 디코드 오류 0을 보고했다. 검색·필터·비교·제자리·연속 재생·390px 화면·dist 다운로드도 확인했다. 다운로드 GLB/Blend는 기본 5클립이며 278항목 전체는 별도 라이브러리다. 화면 주소는 원본 프로젝트의 `http://127.0.0.1:5180/motion-first.html`이다.

근거: [native Blender 검사](character-skinning-motion-2026-10-16/multi/native-blender-validation.json), [native GLB 왕복](character-skinning-motion-2026-10-16/multi/native-glb-roundtrip.json), [모션 라이브러리](character-skinning-motion-2026-10-16/multi/motion-library-validation.json), [브라우저 QA](character-skinning-motion-2026-10-16/multi/qa-summary.json), [문서44 원문](character-skinning-motion-2026-10-16/multi/source-44.txt).

### 후속 공유: 단일 HTML 대시보드

Multi의 `web/exports/character-motion-dashboard.html`은 91,035,289바이트이며 모델 2종·278항목·기본 5종 native GLB/Blend 다운로드를 내장한다. gzip 282 assets, 브라우저 내 gunzip, inline Three ESM을 사용한다. 원본 세션은 네트워크 차단·`file://`에서 834자세 검사, 외부 요청 0, GLB 다운로드, 모델 해시 일치, 390px 넘침 없음을 보고했다. 이 저장소에서는 HTML의 크기·SHA-256이 manifest와 일치함을 확인했으며, 오프라인 브라우저 검사는 재실행하지 않았다. HTML 본체는 복사하지 않았다.

번들 생성 시 `require.resolve('three')`가 CJS를 선택해 브라우저에서 `process.emitWarning`으로 실패했다. 설치된 `three.module.js`를 명시해 해결했다. Blend 곡선 해시 보존과 실제 GLB 시간 키 보존은 별개 검사이며, 과거 70본·5클립 구조 확인만으로 native 키 보존을 주장하지 않는다. 현행 OriginalRetry/native 유지와 후보 5종 미채택은 동일하다.

후속 근거: [갱신 문서43](character-skinning-motion-2026-10-16/standalone/source-43.txt), [갱신 문서44](character-skinning-motion-2026-10-16/standalone/source-44.txt), [내장 manifest](character-skinning-motion-2026-10-16/standalone/manifest.json), [원본 세션의 오프라인 검사](character-skinning-motion-2026-10-16/standalone/validation.json), [수신 해시 및 로컬 HTML 대조](character-skinning-motion-2026-10-16/standalone/provenance.json).

## 기준

원본·rest·계층·키 시각 보존, 스킨 finite, 기존 클립의 동일 영역 간선 늘어남을 각각 확인한다. 수치 통과와 사람의 외형 승인을 구분한다. 다음 손 보정은 고정 관절에 맞춘 손바닥·손가락 기저부의 연속 cage와 굴곡 topology부터 검토한다. 어깨는 현행 heat를 유지하며 제한 corrective를 검토할 경우 웹에서도 동일 구동·GLB 재입력을 별도로 검사한다.

## 공백

손가락 개별 관절, 극단 자세 관통, 발 접지, 모든 정점의 전체 연속 시각, 추가 278항목 전체 외형, 게임 이벤트·런타임 동등성은 검증 완료가 아니다. 이 저장소에서는 Blender·브라우저 검사를 재실행하지 않았다. `study.motion-first.crew@1`은 사람 검수 대기이며 파티 서빙 P-0·반복 0/3은 변경하지 않는다.

## 잔여 위험

리그·동작 보존만으로 형상 보존이 보장되지 않는다. 미채택 후보를 현재 씬에 붙이지 않는다. 내보내기 성공·본 이름 일치·finite만으로 모션 품질을 승인하지 않는다. [출처·바이트 수·SHA-256](character-skinning-motion-2026-10-16/provenance.json)에 수신 시점을 남겼다. 보관한 원문 안의 상대 경로는 원본 Multi 또는 독립 연구 폴더를 기준으로 해석한다.
