# Motion Remap 0.2 수신 기록과 적용 범위

2026-10-16 · Levelscope 세션에서 전달받은 독립 구현의 사용법·릴리스·보정 노하우를 보존한다. Auto-Rig Pro 공개 Remap 문서의 기능 흐름을 참고했으며 ARP 코드·전용 프리셋·설치 의존은 포함하지 않는다는 제작 세션의 설명이다. 이 저장소의 플러그인 기능으로 설치하거나 통합한 것은 아니다.

## 주장

0.1에서 미구현이던 접지·발 잠금, 골반·지면 보정, 컨트롤 리그 어댑터, B-Bone 평가 스킨 변환은0.2에서 명시적 설정과 검증을 전제로 지원한다. 범용 자동 리깅이나 모든 게임·리그의 무설정 호환성을 주장하지 않는다.

## 증거

- [설치 ZIP](motion-remap-0.2-2026-10-16/Levelscope_Motion_Remap_0.2.0.zip): 코드·문서14파일, 게임 원본 자산 미포함.
- ZIP SHA-256: `219901de2cff2aa7456985c7ff255cbd99b09916e86eaf7c6d396dea8ace38f3`.
- [수신 README 원문](motion-remap-0.2-2026-10-16/README-source.txt), [보정 노하우 원문](motion-remap-0.2-2026-10-16/KNOWHOW-source.txt).
- [릴리스 manifest](motion-remap-0.2-2026-10-16/release_manifest_0.2.0.json), [수신 파일 출처·해시](motion-remap-0.2-2026-10-16/provenance.json).
- manifest에 열거된7개 [검증 보고서](motion-remap-0.2-2026-10-16/reports/)와 UTF-8 테스트 로그를 보존한다. ZIP 해시·CRC·파일 목록과 보고서 해시를 이 수신 작업에서 확인했다. 테스트·Blender 작업을 재실행한 결과와 구분한다.

전달된 검증은 Python556개·skip3·fail0, Blender5.2.1 LTS 합성 회귀와 신규 접지·골반·경사·루프·adaptive·FK/IK·B-Bone·복구·CLI 사례다. HatKid Body70본/5클립 identity1,050행렬 표본 최대 오차3.0518e-5, 저장 재열기 차이0이 기록됐다.

실제 HatKid Legs를 복제해 길이80%로 만든 타깃의 Idle1,080샘플은 설정한 접지 목표 기준 최종 평가 포즈 최대 오차7.3881e-6, 골반 이동5.1062, 유한 스킨과 원본 SHA/rest 불변을 기록했다. 단위는 원본 설정의 월드 수치단위이며 미터로 임의 환산하지 않는다. 원작 지면 복원이나 모든 걷기·뛰기 품질의 인증은 아니다.

B-Bone 합성 스킨 정점 오차 최대2.3889e-7, IK 끝점 약7.25e-7. 최종 Hat identity 최고커밋1.121GiB/50.21초, 접지0.885GiB/98.56초, 감시 상한2.5GiB·순차 실행으로 기록됐다.

## 기준과 보정 절차

1. 정확한 본 이름 기반 one-to-one 매핑을 검토하고 `approved=true`로 저장한다. 같은 이름을 쓰더라도 bind pose가 다른 Body/Head/Legs는 부품별 뼈대·스킨을 유지한다.
2. A/T 자세 보정은 원본 bind 수정 없이 별도 참조 quaternion으로 보존한다. 원본 소수 프레임 키와 정규 샘플의 합집합을 bake하고 GLB 강제 정수 샘플링을 끈다.
3. FK/IK 기준 bake → 루트 궤적 필터·루프 이음 → 접지 목표·정적 지면 → 골반 평활화 → 도달 범위 재투영 → 발 IK·회전 → 최종 스킨·오차 검사 순서를 적용한다. 평활화 후 하드 도달 제약을 다시 걸어 발 잠금이 풀리지 않게 한다.
4. 분석 단계의 IK 목표 오차와 matrix→TRS 후 실제 평가 포즈 오차를 구분한다. 거의 같은 quaternion의 회전 오차는 상대 quaternion의 atan2 기반 측정으로 확인한다.
5. 도달 불가능하면 residual과 `contact_satisfied=false`를 남긴다. strict 설정에서는 실패 처리하고 생성물을 회수한다.
6. 컨트롤 리그는 명시적 FK/IK/pole/IK-FK 속성 프로필을 검토하고 `verify_bones`의 위치·회전·scale을 검사한다. 복제 시 self-target·다중 Armature 제약·Object/Armature-data driver ID도 복제본으로 연결한다.
7. 중간 `deform_proxy`의 B-Bone 직선화를 곡선 스킨 보존으로 보고하지 않는다. 최종은 control adapter와 `deform_export` 경로로 평가 스킨을 일반 본에 bake하고 매 샘플 원본 평가 정점을 대조한다.

Blender 패널과 `batch.py`에서 사용하며 `--control-profile`, `--deform-export-only`를 제공한다. 실행 예시·프리셋은 보존한 README 원문을 따른다. `example_preset`과 control profile 예시는 특정 게임이나 Rigify 버전의 검증된 범용 프리셋이 아니다.

## 공백

소스 adaptive midpoint tolerance `.005`는 최종 타깃 전체시간 오차의 엄밀한 상한이 아니다. 별도81시점 최종 타깃 위치 오차 `.007172`도 함께 기록됐다. 원본 키·샘플을 보존해도 연속 전체시간·픽셀·원작 게임 런타임 동등성은 검증되지 않았다.

자동 접촉 구간은 추정이며 제자리 걷기나 불규칙 동작에서는 수동 구간·임계값·sole offset 검토가 필요하다. 실제 사용자 타깃의 걷기·뛰기에서 발끝·무릎·골반과 자연스러움을 대조하는 후속 검수가 남아 있다.

## 잔여 위험

지면 보정은 정적 월드Z 평면·명시 Mesh 기준이다. 움직이는 받침의 로컬 접지와 동적 물리는 지원 범위에 포함하지 않는다. 기본 리타기팅의 비균일·반사·shear와 평가 스킨의 Preserve Volume·envelope·shape key·추가 modifier·변하는 rest 형상은 명시적으로 거부한다.

이 수신 작업은 설치·유료 생성·원본 모델 수정·다른 프로젝트 변경·게임 게이트 승인을 수행하지 않았다. ZIP은 설치 전 검토할 수 있는 릴리스 자료로 보존하며, 사람의 최종 아트·모션 승인과 수치 검증 결과를 구분한다.
