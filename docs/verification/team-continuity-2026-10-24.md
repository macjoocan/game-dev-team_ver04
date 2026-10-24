# 데브팀 자체 작업 재개 검증

## 주장

Hermes 설치 없이 기존 Codex/Claude에서 사용할 로컬 작업 재개·역할 인계·증거 연결·교훈 제안을 구현했다. 기존 인계 수집기는 `team-handoff.mjs`로 옮겼고 `hermes-handoff.mjs` 호출은 호환된다. source와 배포 미러, AGENTS/CLAUDE 지침, pipeline-brief 진입 절차를 연결했다. HEAD `20d3e01` 위 미커밋 변경이며 설치 캐시와 원격 저장소는 변경하지 않았다.

설계: `docs/superpowers/specs/2026-10-24-team-continuity-design.md`. Builder check는 중요한 미결이 없다고 판정했고, done에 최소 1개 증거가 필요하며 이후 변경/누락은 미확인으로 보여야 한다는 조건을 확인했다.

## 증거

`node --test test/team-work.test.mjs test/hermes-handoff.test.mjs` 종료 코드 0. [원본 출력](team-continuity-2026-10-24/focused-tests.txt).

```text
ℹ tests 19
ℹ suites 0
ℹ pass 18
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 2757.5108
```

작업 재로딩, 역할 인계, 손상 원장/잠금 보존, 증거 변경/누락, 교훈 제안 격리, 연결 경로 차단, Unicode 보존과 brief 무변경을 검사했다. 테스트를 먼저 작성해 기능 부재로 실패한 것을 확인한 뒤 구현했다.

당시 작업 트리 전체 `test/*.test.mjs` 명시 목록을 Node에 전달한 결과는 종료 코드 1이다. [원본 출력](team-continuity-2026-10-24/full-workspace-tests.txt). 이 기록은 이번 커밋 범위에 포함하지 않은 별도 Higgsfield 테스트 8건도 포함한 작업 트리 검사다. 배포 대상의 워크플로 검증은 아래 릴리즈 항목에서 구분한다.

```text
ℹ tests 59
ℹ suites 0
ℹ pass 56
ℹ fail 2
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 64653.1751
```

실패 2건은 기존 `candidate-harness.test.mjs`의 `timeout is unknown; interrupted unsafe steps are not rerun`, `timeout kills spawned process tree`다. 둘 다 종료 상태 `null !== 3`이며 이번 변경 전 확인된 Windows 타임아웃 실패와 같다. 해당 실행기를 변경하지 않았다.

`node scripts/validate-plugin.mjs` 종료 코드 0:

```text
✓  검사 통과 — 에이전트 6 · 스킬 25 · 훅 4 · 커맨드 1
```

공식 미러 동기화 후 `sync-plugin.ps1 -Check` 종료 코드 0:

```text
OK - root and plugins/game-dev-team are in sync.
```

pipeline-brief 수정 전 별도 평가자는 영속 작업 체크포인트/증거 최신성을 수집하는 명령을 찾지 못했다. 수정 후 새 평가자는 `node scripts/team-work.mjs brief --project .`를 선택하고 unknown/done/same이 승인이 아님을 구분했다. 실제 동일 명령도 이 저장소에서 실행해 작업 기록을 읽고 파이프라인 상태 누락을 exit 3으로 표시하는 것을 확인했다.

이번 작업 자체를 로컬 원장 `team.continuity`로 등록하고 체크포인트→검증 로그 첨부→developer에서 qa로 인계하는 흐름을 실행했다. 원장은 `.team-work/`에 있으며 Git에서 제외된다.

## 기준

추가 모델/제공자 호출 0, 상태 원장과 검수 승인 정본 분리, 원시 파일의 해시 출처 표시, 손상 원장을 덮어쓰지 않음, 잠금 자동 탈취 없음. 완료 체크포인트는 새 게이트 승인으로 취급하지 않는다. 교훈은 proposed만 기록하고 사람 승인 공통 규칙은 기존 `.review-loop/rules.json`에서 읽는다.

## 공백

기존 파일 심볼릭 링크 테스트 1건은 Windows 권한 부족으로 생략했다. 부모 디렉터리 junction 차단 테스트는 통과했다. 사용자 게임 프로젝트에 대한 장기 운영, PC 간 기록 동기화, 새 Codex/Claude 세션의 자발적 호출은 검증하지 않았다. 별도 평가의 절차 선택과 실제 CLI 동작을 검증했을 뿐 자동 훅 실행을 주장하지 않는다. 모델 설치·인증·API 호출·스케줄러·Git push를 하지 않았다.

## 잔여 위험

증거 첨부는 파일 최신성 확인이며 검사 통과나 검사 대상 코드 최신성을 증명하지 않는다. 기존 검증 리포트의 대상 커밋/산출물 해시와 사람 검수가 필요하다. 작업 원장은 비밀 저장소가 아니며 회사 정보가 들어갈 수 있다. 다중 파일 수집은 원자적이지 않고 강제 종료로 남은 잠금은 사람이 복구해야 한다.

관찰 점검: 신규 기록 없음. 기존 #23 출처 명시, #43 재시도 계약 구분, #66 전체 검사 원칙을 적용했다.

## v0.49.0 배포 준비 검증

사용자가 Windows 권한 안내 갱신과 GitHub push를 요청해 안내를 `scripts/team-work.md`에 추가하고 양쪽 플러그인 버전을 0.49.0으로 올렸다. Windows 설정 자체는 변경하지 않았다. 개발자 모드/관리자 토큰, 에이전트 샌드박스, 프로세스 타임아웃을 구분한다.

새 회귀 테스트를 `.github/workflows/validate.yml`에 추가한 뒤 `node scripts/ci-local.mjs`를 Git Bash `bash -e` 환경에서 전체 실행했다. 종료 코드 1. [원본 출력](team-continuity-2026-10-24/local-ci.txt).

```text
# 결과: 18/19 통과
#   실패 4. 기획·개발 후보 비교 하네스 테스트 (exit 1)
```

새 작업 재개 테스트 단계, 기존 도구 스모크·게이트·훅·미러 검사는 통과했다. 실패한 4단계에는 위에서 설명한 기존 Windows 타임아웃 테스트 2건이 포함된다. 로컬 Windows 결과이며 원격 Ubuntu Actions 통과를 뜻하지 않는다. 기존 문제를 숨기기 위해 검사를 생략하거나 완화하지 않았다.

커밋 범위는 작업 재개·인계 구현, 관련 지침·설정 예시·설계·검증 기록, 버전과 CI 연결이다. 로컬 작업 원장, 기존 아트 검수 원장 변경, 생성 산출물, 비밀 파일, 별도 Higgsfield 작업은 제외한다. 추적 원격 `ver04/main`에 앞서 있던 후보 비교 하네스 커밋 2개도 일반 main push에 포함된다. 설치된 플러그인 캐시는 자동 갱신하지 않았다.
