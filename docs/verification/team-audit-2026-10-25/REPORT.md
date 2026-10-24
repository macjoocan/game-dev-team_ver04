# v0.50.0 구조 점검과 보강

## 주장

Hermes/Harness²에서 참고한 구조의 담당 범위를 정리하고, 실제로 재현된 상태 덮어쓰기·후보 폴더 중첩·종료 실패 복구 결함을 수정했다. 대상은 `b73e588` 위 v0.50.0 변경이다. 상세 판단은 `scripts/team-assessment.md`, 실행 구조는 `scripts/team-architecture.md`다. 설치 캐시도 공식 install.ps1로 갱신했다.

## 증거

전체 작업 트리 Node 테스트 종료 코드 0. [원본](full-tests.txt).

```text
ℹ tests 65
ℹ suites 0
ℹ pass 64
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 26021.5798
```

이 작업 트리 검사는 별도 Higgsfield 테스트 8건도 포함한다. 플러그인 워크플로 대상 검증은 아래 결과로 별도 확인했다.

`node scripts/ci-local.mjs` 종료 코드 0. Git Bash의 bash -e, Windows 로컬 실행. [원본](local-ci.txt).

```text
# 결과: 19/19 통과
```

제한 환경에서 최소 taskkill 재현은 exit 1이었다. 동일 재현과 기존 타임아웃 2개 테스트를 샌드박스 밖에서 실행하면 taskkill exit 0, 테스트 2건 통과였다. 이후 보강은 이 권한을 자동 확대하는 대신 실패 결과를 기록하고 대기·재시도를 차단한다. 종료 실패를 주입하는 결정론적 음성 테스트도 통과했다.

`node scripts/validate-plugin.mjs`와 공식 mirror Check는 exit 0. 공식 `install.ps1 -Harness both -Scope user` exit 0. 설치 후 출력:

```text
소스 출처: D:\00.project\GameDevTeam
소스 버전: 0.50.0
  user: 0.50.0

전부 최신이다.
```

위 설치 비교는 로컬 소스를 기준으로 한다. Claude CLI 목록은 game-dev-team@game-dev-team Version 0.50.0, Scope user, enabled로 표시했다. Codex cache의 team-work.mjs, team-boundaries.mjs, candidate-contract.mjs, candidate-executor.mjs, team-architecture.md, team-assessment.md SHA-256을 소스와 비교해 전부 같았다.

## 기준

오래된 revision은 원장을 바꾸지 않는다. 후보는 정본 및 다른 후보와 분리한다. 종료 실패는 unknown으로 처리하고 lock·cleanupRequired를 보존하며 자동 resume을 허용하지 않는다. 제안·완료·해시 일치와 사람 승인을 구분한다. 도구/경계 변경은 재개 fingerprint에 반영한다.

## 공백

심볼릭 링크 생성 권한으로 1개 테스트가 생략됐다. 실제 게임 품질·생산성 개선, 장기간 여러 PC 운영, 원본 Hermes와 Harness² 동시 실행, Windows 정상 종료 후 독립 백그라운드 프로세스의 완전한 정리는 미검증이다. 로컬 CI는 원격 Ubuntu Actions 결과를 대신하지 않는다. 설치된 최신 코드와 현재 세션이 이미 읽은 지침은 다르므로 새 세션 또는 플러그인 재로드가 필요하다.

## 잔여 위험

검증 실행기는 OS 샌드박스가 아니다. actor는 자기 신고이며 권한 인증이 아니다. 정리 실패 뒤에는 실제 프로세스 종료를 사람이 확인해야 한다. 원장·검수 파일의 공동 정본은 별도 소유권 계약을 지켜야 한다. 효과 측정이 필요한 공백을 코드 테스트 통과로 덮지 않는다.

관찰 점검: 신규 없음. 기존 #23 환경/출처 표기, #43 재시도 계약, #66 전체 검사, #68 검증 후 변경 원칙 적용.
