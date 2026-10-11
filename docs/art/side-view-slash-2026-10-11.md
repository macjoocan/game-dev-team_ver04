# 베기 v5 — 횡스크롤 시점 수정

## 주장

사용자가 v4의 동작은 좋지만 정면 베기라고 지적했다. 원본 `Sword_Attack_RM` 클립과 타이밍을 유지하고, 제어 영상을 오른쪽을 향한 옆모습으로 다시 렌더했다. 캐릭터 전이 결과는 concept이며 사람 검수 대기다.

## 증거

- 대상 HEAD: `48413a5` + 작업 트리 변경.
- 이전 코드가 armature 객체에 적용한 yaw는 action의 객체 회전 키가 프레임 평가 중 덮어썼다. 별도의 `authored-view-root` 부모에 yaw를 적용해 애니메이션의 회전 키와 분리했다.
- 새 입력: `out/sprite-lab/action-slash-v5-driver/frames/`, `motion.json`, `authored-driver.blend`.
- 원본 모션: v4와 같은 Quaternius CC0 GLB 및 같은 SHA-256. 새 manifest는 `view_yaw_degrees: 90`도 기록한다.
- 제어 contact sheet: `out/sprite-lab/action-slash-v5-control-review/contact.png`. 준비와 베기 자세 모두 측면으로 렌더되는 것을 확인했다.
- 생성 프롬프트·그래프·모델 해시 링크·참조 해시: `out/sprite-lab/action-slash-v5-scail/`.
- 프레임 수·규격·테두리·HTML 검사 원시 출력: `out/sprite-lab/action-slash-v5-qa.txt` 및 JSON. 이 출력은 기술 검사이며 모션 승인 판정이 아니다.
- 플러그인 검사 원시 출력: `out/sprite-lab/action-slash-v5-plugin-validation.txt`, exit 0.
- 실제 생성 시간: 94.78249559999676초. 25프레임·160px 규격·프리뷰 접근은 충족했으나 8·14번의 알파가 오른쪽 테두리에 닿아 기술 검사 exit 1이다.

## 기준

오른쪽으로 공격하는 2D 횡스크롤 카메라, 동일한 25프레임 및 원본 약 1.533초 타이밍. 프롬프트만으로 시점을 주장하지 않고 실제 렌더된 contact sheet를 확인한다.

## 공백

사람의 v5 승인, 실제 게임 내 공격 판정과 회복 시간, 실제 브라우저 조작 검수는 미실행이다. 동일 프레임 규격이나 화면 경계 여유는 캐릭터 형태·칼의 일관성을 증명하지 않는다.

## 잔여 위험

전이 모델은 원본의 작은 장비와 복잡한 옷·손을 왜곡할 수 있다. 생성 결과는 반드시 제어 영상과 함께 검수한다. 찌르기 v3의 칼끝 잘림은 이번 베기 시점 수정과 별도로 미해결이다.

v5는 contact sheet에서 오른쪽 측면 베기가 확인된다. 다만 8·14번의 검 끝이 화면 경계에 닿고 일부 중간 프레임의 색이 흔들린다. 이 결함을 모션 승인이나 규격 충족으로 숨기지 않는다. 기본 대시보드는 색 보정 시도본을 사용하지 않는다.
