# Multi 손가락·어깨 독립 보정 연구 — 2026-10-16

**판정: 이번 후보는 적용하지 않는다. 원본 OriginalRetry 보정본을 유지한다.** 손가락 10개를 분리하고 고정 70본에 맞춰 움직이는 데에는 성공했으나, 손바닥 접힘·경계 늘어남을 해결하지 못했다. 어깨 단순 재가중치는 기존 모션과 극단 자세 모두에서 회귀했다. 연구용 Blend/GLB는 성공본이 아니다.

Multi 코드·라이브 Blender·C: 원본은 읽기 전용으로 취급했다. 모든 변경은 이 D: 폴더의 복사본이다. 새 생성·외부 과금·원본 리그 rest 변경·DQ 사용은 없었다. Workbench 렌더는 표면 결함 검토용 단색 실제 렌더이며 원본 머티리얼/웹 픽셀 정합 근거가 아니다.

## 검사 범위와 결과

39,946 정점/79,999 삼각형, 고정 70본. 후보마다 원본 5개 클립을 각 25시점(소수 프레임 포함), 총 125 스킨으로 평가했다. 기존 Multi 155스킨 검사와 샘플 일정은 다르다. 숫자가 같은 최대값을 포함해도 동일 검사로 취급하지 않는다.

| 후보 | 최대 팔 영역 엣지 늘어남 | 최대 손가락 영역 엣지 늘어남 | 판단 |
|---|---:|---:|---|
| baseline | 21.59mm | 2.32mm | 손가락이 손바닥 강체를 따르는 현행 기준 |
| finger_weights_only | 40.62mm | 60.35mm | 형상과 관절 위치가 안 맞는 상태에서 가중치만 주면 크게 악화 |
| finger_fit | 21.59mm | 14.43mm | 손가락 움직임은 있으나 손바닥 접힘; 불합격 |
| finger_fit_smooth | 21.59mm | 12.49mm | 근위 경계 두 번 평활화로 일부 완화, 해결 아님 |
| finger_continuous_probe | 29.69mm | 7.85mm | 변위/가중치 경계 35회 평활화, 손바닥 형상 여전히 부적합 |
| shoulder_local_probe | 75.09mm | 2.32mm | 국소 spine/upper-arm 재분배는 회귀; 불합격 |

엣지 지표는 정의된 ROI만 검사하며 모든 찢어짐/교차를 보장하지 않는다. 형상 보정의 최대 정점 이동은 약 98.15mm이다. 관절 위치 보존이 곧 생성 메시 외형 보존이라는 뜻은 아니다. `validation.json`에 가중치 최대 4개·누락 0·finite·rest 비교가 있다. 수치 통과와 시각 합격은 별개다.

## 실제 렌더와 극단 자세

`stress_review.py`는 rest, 손가락 65/80도 굽힘, 팔 올림 120도, 가슴 가로지르기 130도, 상완 비틀림 180도를 별도로 만들었다. **원작 클립이 아닌 합성 스트레스 자세**다. 원본 액션 키를 고치지 않는다.

- baseline/finger_curl.png: 현행 손가락은 움직이지 않는다.
- finger_fit/finger_curl.png: 굽힘은 구현되나 손바닥이 찌그러진다.
- finger_continuous_probe/finger_curl.png: 경계가 부드러워져도 손바닥 결함은 남는다.
- baseline/cross_chest130.png 및 shoulder_local_probe/cross_chest130.png: 몸통·옷 교차를 직접 검토할 수 있다.
- shoulder_local_probe/upperarm_twist180.png: 국소 가중치 교체의 비틀림 회귀.

baseline 팔-몸통의 비인접 삼각형 교차 쌍은 rest 0, overhead120 46, cross_chest130 593이다. shoulder probe는 각각 0/43/605다. 팔과 몸통 ROI를 분리하고 BVH 후보에 선분-삼각형 검사를 추가했다. 관절 이웃과 공면 접촉은 제외하므로 **전신 무관통 판정이나 관통 깊이가 아니다**. 교차 쌍 수가 작은 차이로 줄었다고 개선으로 채택하지 않는다.

상완 정점 공분산 타원체의 부피 **대리지표**는 baseline 180도 비틀림 0.972, shoulder probe 0.681(각자 rest=1)이다. 열린 옷/메시를 실제 폐곡면 부피로 오인하지 않기 위한 지표이며 물리적 부피가 아니다.

## 산출물과 재현

- `input_manifest.json`: 읽기 전용 원본 경로/선별 복사/해시.
- `inspection.json`, `hand_sections.json`: 원본 고정 뼈대와 손가락별 메시 연결 성분/정점 IDs.
- 각 후보 폴더 `candidate.blend`, `candidate.glb`, `validation.json`: **실험 전용, 배포/현재 씬 적용 금지**. 후보 Blend에는 5개 원본 액션이 보존되지만 자동 재생 액션은 비워 놓았다. 액션의 HatKidBody_Rig 슬롯을 OriginalRetry_Body70에 명시 배선하여 본다.
- `stress_comparison.json`: 6종×5개 합성 자세의 수치 검사. 4종×5자세 실제 PNG 20장.
- `preservation_validation.json`: C: 원본/복사본 SHA, 후보 Blend save/reopen, 70본 rest/계층과 5개 커브 해시 비교, GLB skin/clip 구조 검사. GLB 브라우저 실제 디코딩·웹 픽셀 검사는 이번 범위에서 하지 않았다.
- `fit_candidates.py -- --initial`: 초기 네 보정 후보와 baseline 재현. 인자 없이 실행하면 baseline+연속성 후보만 만든다.
- `stress_review.py`, `verify_preservation.py`: 렌더/교차/보존 검사.

Blender 5.2.1을 headless 독립 프로세스로 순차 실행했다. 외부 `../guard.py`로 프로세스 트리 private commit 2.5GiB 제한, 로그/receipt는 부모 폴더의 `skin_*.log`, `skin_*_receipt.json`이다. 이번 후보·스트레스 실행은 피크 약 0.81~0.95GiB였다. 검사 결과는 각 receipt를 정본으로 본다.

## 다음 개선 방향과 적용 조건

1. **손:** 생성 손바닥과 두 마디 손가락의 실제 굴곡선부터 맞춰야 한다. 현재 seed/geodesic 분류는 손끝 5분리를 식별하는 데 유효하지만 손바닥 전체의 해부학적 대응을 대신하지 못한다. 고정 원본 관절에 맞춘 손바닥·손가락 기저부의 연속 cage/표면 대응과 관절 주변 edge loop 검사가 선행돼야 한다. 단순 최근접 본 가중치, 일괄 smoothing으로 해결됐다고 표시하지 않는다.
2. **어깨:** 기존 heat 가중치를 기준선으로 보존한다. 팔·옷·몸통을 분리한 검사를 유지하고, 가중치 후보는 기존 5클립 최대 늘어남을 악화시키면 즉시 탈락시킨다. 극단 자세를 무조건 skin만으로 무관통으로 만드는 것은 불가능한 경우가 있다. 뼈대 경로가 몸통을 가로지르는 자세는 IK/포즈 수정이 필요하며 원본 모션 보존 계약과 별도 결정이다.
3. **부피 보정:** 필요하면 자세 조건부 corrective shape/morph를 별도 실험한다. 이를 쓰려면 웹에서 동일 corrective 가중치를 구동하고 GLB 재수입·실제 브라우저 LBS 결과까지 검증해야 한다. 이번에는 corrective나 DQ 해결을 구현/승인했다고 주장하지 않는다.
4. **채택 게이트:** 기준/후보 동일 시점 비교, 4 weights/finite/rest+곡선 exact, 손가락·손바닥 접힘 검토, 원작 전체 라이브러리 확장 검사, 웹 실제 스킨 검증을 모두 거친다. 이번 결과는 원본 278 unique 파일 전체 포즈에 대한 보장이 아니다.

**반환 상태:** 연구용 비교·실패 재현·검사기는 완성, 안전한 개별 손가락 스킨/극단 어깨 개선은 미해결. 기존 원본 보정본을 덮어쓰지 않는다.
