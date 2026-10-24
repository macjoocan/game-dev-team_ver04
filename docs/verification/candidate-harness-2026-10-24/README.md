# 기획·개발 후보 비교 하네스 검증

## 주장

승인 설계의 로컬 비교 도구·기존 스킬 연결·0.48.0 mirror를 구현했다. 테스트 23/23, 전체 ci-local 18/18, validate-plugin 충족. 실제 게임의 재미·성능 향상이나 사람의 merge/아트 승인으로 해석하지 않는다.

## 증거

대상은 base `712e3f3` 위의 이 변경 파일이다. 측정 시 아직 미커밋 상태였으며 정확한 실행 도구·플랫폼은 원시 로그에 있다. 파일 내용은 같은 디렉터리의 implementation-hashes.json으로 식별한다.

- `node --test test/candidate-harness.test.mjs` → [원시 출력](tests.txt), 23/23.
- `node scripts/ci-local.mjs` → [원시 출력](ci-local.txt), 18/18. Windows에서 Git Bash의 bash -e로 실행했다.
- 새 PowerShell에서 samples/candidate-harness/README의 기획·개발 check/run/report/record/resume 실행 → [원시 출력](examples.txt). 합성 기준안 미달로 run/report=1, 대안 채택 제안=0을 기대한다.
- `node scripts/validate-plugin.mjs`: `✓  검사 통과 — 에이전트 6 · 스킬 25 · 훅 4 · 커맨드 1`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sync-plugin.ps1 -Check`: `OK - root and plugins/game-dev-team are in sync.`

## 기준

[승인 설계](../../superpowers/specs/2026-10-24-planning-development-harness-design.md)의 계약·증거·복구·기존 게이트 보존과 [계획](../../superpowers/plans/2026-10-24-candidate-harness.md)을 기준으로 했다. 판정은 0/1/3을 구분한다.

## 공백

- 실제 게임·Unity·Blender·ComfyUI·유료 API·모델 호출은 수행하지 않았다.
- 원격 Ubuntu GitHub Actions는 아직 실행하지 않았다. 로컬 ci-local 통과와 구분한다.
- workflow 생성·교훈 적용은 메인 세션의 책임이며 자동 모델 실행·자기수정은 구현 범위가 아니다.

## 잔여 위험

- 명시 입력 밖의 간접 의존성·환경·외부 응답은 프로젝트에서 고정해야 한다. 실행기는 샌드박스가 아니다.
- 사람이 제공한 증거의 대상 해시는 검사하나 사람 신원을 인증하지 않는다.
- 강제 종료 후 잠금은 소유자가 중지됐음을 확인한 후 수동 제거한다. 별도 detached 프로세스까지 정리한다고 보장하지 않는다.
- 디렉터리 전체·실행기 바이너리를 해시하므로 큰 후보에서는 검사 비용이 발생한다.

독립 검토에서 보고 선택·stale lock 경합·외부 실행기 fingerprint를 점검했다. 보고 선택과 잠금 회귀는 RED→GREEN으로 수정했고, 실행기 바이트 변경 감지 테스트를 추가했다. 원래 source에 있던 상태·사람 검수 장부는 수정하지 않았다.
