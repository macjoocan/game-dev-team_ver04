# 전신 모션 규칙·회사 PC 배포 기록

2026-10-11 · Codex · source base `3861cdd` + 전송 안정화 패치.

## [주장]

v0.46.1은 승인 reference/전신 authored 리그/장비 가이드/측면 평가/연속 생성/알파/색 보정/루프/root 이동/별도 FX/idle 전환을 재사용 규칙과 도구로 제공한다. 사용자가 현재 샘플을 수용했으며 양산 상태는 concept로 유지한다. 회사용 HTML 샘플·CC0 모션 원본·reference·idle job을 함께 제공한다.

## [증거]

- [CI 원문](motion-workflow-2026-10-11/ci.txt): 17/17, exit 0.
- [게임 회귀 원문](motion-workflow-2026-10-11/game-tests.json): headless 28 checks.
- [모델 복원 테스트 원문](motion-workflow-2026-10-11/model-restore-tests.txt): 3 tests, exit 0.
- `models/company-models.json`: 39개 파일, 88,666,936,803 bytes, 686개 분할 SHA-256.
- GitHub 모델 업로드는 별도 숨김 프로세스에서 진행 중이며 이 기록 시점에 완료되지 않았다. 완료 시 모든 가중치·catalog·모델 카드/라이선스를 포함한 Release를 자동 공개한다. 로컬 상태는 `out/model-release/progress.json`, 로그는 같은 폴더의 `upload.stdout.log`·`upload.stderr.log`.

## [기준]

[전신 모션 워크플로](../../skills/char-art-system/references/motion-sprite-workflow.md). Frame mapping/FPS/seed/graph/model hash/장비/root/alpha를 분리해 기록한다. 개별 사용자 피드백은 해당 에셋에 적용하고 다른 캐릭터를 자동 승인하지 않는다.

## [공백]

이 PC의 실제 브라우저 스크린샷·입력 자동 검수는 미실행이다. headless 전투 검증은 사람의 모션 품질 검수가 아니다. 모든 모델의 회사 PC 추론·전체 Release 업로드/다운로드는 아직 검증되지 않았다. 초기 art-gate는 누락된 기존 sample 경로 때문에 exit 3(측정 불가)였다. SSD 전용 pose guider는 미확보이며 legacy 가중치를 포함한 것과 SSD 추론 성공은 다르다.

## [잔여 위험]

88.7GB 전송에는 시간이 필요하고 PC 종료·네트워크 실패로 중단될 수 있다. 업로드 도구는 서버 asset 크기/해시를 확인하고 재시도·재개한다. 모델 Release 완료 전에도 회사는 `--source upstream --skip-unverified`로 31개 정확한 원본 파일을 복원할 수 있다. portable VAE preview 8개는 exact upstream origin 미검증이며 GitHub Release로 동일 로컬 바이트를 제공한다. 모델의 각 라이선스와 OpenRAIL 사용 조건은 플러그인 라이선스와 별개다.
