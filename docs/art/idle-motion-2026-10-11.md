# 훈련장 v5 — 서 있는 아이들

## 주장

서 있을 때 검을 든 대기 모션을 자동 재생한다. 모자·깃털·칼을 포함한 가이드로 생성했고, 몸의 작은 움직임과 망토 변화를 2초 루프로 구성했다. 이동·공격·피격·회피에서 대기로 복귀하며 입력 시 바로 해당 동작으로 전환한다.

## 증거

- 대상 HEAD `48413a5` + 작업 트리 변경. 실행 `http://127.0.0.1:8788/motion-game/index.html`.
- Quaternius CC0 GLB의 `Sword_Idle`, 40/24초 원본 동작. 머리 관절에 깃털 모자, 손에 검을 고정했다. 출처·SHA-256·관절·장비·투영은 `out/sprite-lab/action-idle-driver/motion.json`에 기록했다.
- SCAIL-2 25프레임, seed 42, CFG 3, 8 steps. prompt ID `2a2fbbb5-12c2-441d-bb6c-00f15599a6e4`. `action-idle-scail/`에 프롬프트·그래프·참조·모델 정보를 보존했다. BiRefNet 알파 단계와 export를 분리했다.
- 이전 승인된 RGB 보정으로 1-based 13~17번의 색만 보정했다. `action-idle-color-review/color-qa.json`: 알파 변경 0, 비보정 프레임 바이트 동일.
- 생성 25프레임을 0→24→1로 왕복 재생하는 48프레임/24FPS 루프로 내보냈다. `action-idle-loop-review/manifest.json`의 `frame_selection`과 파일 해시가 매핑을 기록한다. 픽셀을 다시 그리거나 형태를 변형하지 않고 기존 PNG를 복사했다. `driverFrameMap`을 정렬 도구에 전달해 뒤쪽 프레임도 동일한 발 기준을 사용한다.
- 게임 검사 원문 `out/sprite-lab/motion-game/qa-output.txt`: **exit 0, 34개**. 아이들 진행·반복·좌표/방향 유지·이동/공격 전환·회피 후 복귀·무공격을 확인했다.
- 스프라이트 검사 원문 `out/sprite-lab/action-idle-sprite-qa.txt`: **exit 0, 경고 3건**. contact/sheet를 제외한 실제 48프레임만 검사했다.

## 기준

서 있는 동안 세계 좌표와 방향을 유지하고 발 기준을 고정한다. 빨간 모자 챙·흰 깃털·한 자루의 검이 프레임에 남는다. 아이들 입력 잠금이나 피해 판정은 없다. 2초 재생은 샘플용 타이밍이며 사람 평가 전 확정값으로 보지 않는다.

## 공백

실제 브라우저 화면 캡처·키보드/터치 검수는 미실행이다. PNG 전체 프레임과 엔진/HTTP 검사만 수행했다. 아이들의 자연스러움과 다른 동작 사이의 시각적 연결은 사람 검수 대기다.

## 잔여 위험

알파의 고아 섬·작은 구멍·프린지 경고가 남고 얼굴 세부가 원화보다 부드럽다. 망토 왕복 재생은 실제 물리 시뮬레이션이 아니다. concept 상태를 유지하며 production 승격은 하지 않았다.
