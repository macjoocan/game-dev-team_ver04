# 데브팀 작업 재개·인계

Hermes 설치나 별도 모델/API 없이 기존 Codex·Claude Code에서 사용한다. 모든 명령은 Node.js 기본 기능으로 실행되며 비용이 드는 모델 호출을 하지 않는다. 역할별 에이전트 실행, 정기 실행, Git push 기능은 없다.

## 시작과 재개

```powershell
node scripts/team-work.mjs brief --project "D:\00.project\GameDevTeam"
```

프로젝트 작업 원장, 다음 행동·담당 역할·블로커, 첨부 증거의 현재 해시, 교훈 제안을 함께 읽는다. 프로젝트 상태·열린 게이트·검수 피드백·공통 규칙도 기존 수집기로 합친다. 출력은 JSON이다. 원본이 없거나 손상됐으면 `unknown`으로 남긴다. 처음 사용하는 프로젝트에서 원장이 없는 것은 정상이며 아래 `add`로 첫 작업을 등록한다.

작업 원장은 프로젝트의 `.team-work/state.json`이다. Codex와 Claude Code가 **같은 파일**을 사용한다. 프로젝트 간에는 분리되며 세션이 종료되어도 남는다. 이 레포에서는 Git에서 제외된다. 다른 게임 프로젝트에서도 `.team-work/`를 해당 프로젝트 `.gitignore`에 추가한다. 회사 기획·피드백이나 비밀 키를 공개 저장소에 커밋하지 않는다. PC 간 자동 동기화는 제공하지 않는다.

## 작업 등록과 체크포인트

```powershell
node scripts/team-work.mjs add --project . --id hero.walk --title "걷기 모션 개선" --role artist --next "03~06 프레임 확인" --actor codex
node scripts/team-work.mjs checkpoint --project . --id hero.walk --status blocked --reason "승인된 원화 필요" --next "검수 피드백 확인" --note "발 방향부터 수정" --actor codex
```

역할: `pm`, `game-designer`, `developer`, `qa`, `artist`, `meta-economy-designer`.
상태: `todo`, `active`, `blocked`, `review`, `done`. blocked에는 이유가 필요하다. 모든 상태에 다음 행동을 남긴다. 바뀐 내용과 배우 이름은 이벤트로 남는다. `--actor`는 `codex`, `claude-code`, `human` 중 하나이며 감사용 자기 신고다. 인증이나 사람 승인 증명이 아니다.

다른 PC에서도 기록 자체가 필요하다면 민감 내용을 확인한 뒤 원장을 별도로 전달해야 한다. 소스를 push해도 로컬 작업 기록은 전송되지 않는다.

## 역할 인계

```powershell
node scripts/team-work.mjs handoff --project . --id hero.walk --role qa --next "같은 배경에서 루프 확인" --note "상체와 칼 위치 유지, 발 방향 검사" --actor codex
```

역할과 인계 메모를 바꾸고 이전/새 역할을 이벤트에 남긴다. blocked 원인이 해결되기 전에는 역할을 바꿔도 blocked 상태를 유지한다. 실제 에이전트를 실행하거나 정본 파일의 쓰기 소유권을 강제로 부여하는 기능은 아니다. 파일 소유권은 ORCHESTRATION.md의 기존 계약을 따른다.

## 기존 검증 도구 연결

기획은 GDD 검사·candidate harness, 개발은 프로젝트 테스트·candidate harness, 아트는 art-gate·sprite-qa·review-loop를 그대로 사용한다. 먼저 해당 도구를 실행해 원시 로그와 리포트를 남긴 후 그 파일을 첨부한다.

```powershell
node scripts/team-work.mjs evidence --project . --id hero.walk --file "out/walk-qa/report.json" --actor codex
node scripts/team-work.mjs checkpoint --project . --id hero.walk --status review --next "사람 검수 대기" --note "검수 보드에 등록됨" --actor codex
```

`evidence`는 **파일 경로·SHA-256을 첨부하는 기능**이다. 검사 실행·통과를 주장하지 않으며 `validationExecuted: false`를 명시한다. 증거 파일은 프로젝트 내부 일반 파일, 최대 2MiB만 허용한다. 연결 경로·`.secrets`·`.git`·`.env`는 거부한다. 검증 로그에는 비밀을 남기지 않는다.

`brief`는 첨부 파일을 다시 읽어 `same`, `changed`, `missing`, `unknown`과 실제 해시를 보여준다. 이것은 파일 내용의 최신성이지, 검사 대상 코드나 아트까지 그대로라는 보장이 아니다. 대상 커밋과 산출물 해시는 기존 검증 도구의 리포트로 확인한다. 여러 파일을 하나의 트랜잭션으로 읽지는 않는다.

`done`을 기록하려면 현재 해시가 같은 첨부 파일이 최소 1개 필요하다. 이것은 증거 없는 완료 기록을 막기 위한 최소 조건이다. **done도 기획 게이트 통과·아트 승인·출시 승인으로 해석하지 않는다.** 승인 정본은 기존 state.json, PIPELINE_STATE.md, `.review-loop/`다.

## 경험 축적

```powershell
node scripts/team-work.mjs lesson --project . --id hero.walk --file "out/walk-qa/report.json" --note "시트 공통 팔레트를 적용하면 색 흔들림을 줄였다" --actor codex
```

교훈은 `proposed` 상태로만 저장된다. 출처 증거가 변경·누락되면 brief에서 표시한다. 사람이 기존 review-loop에서 공통 규칙으로 승격한 기록만 `.review-loop/rules.json`을 통해 재사용한다. 작업 교훈 제안이나 한 번의 피드백을 공용 스킬에 자동 반영하지 않는다.

## 실패와 복구

- 종료 코드 0: 변경 또는 필수 원본 수집 완료. 게이트 판정이 아니다.
- 종료 코드 1: 잘못된 인자, 중복 작업, 잠금, 연결 경로, 조건 미충족 등.
- 종료 코드 3: brief 수집 불완전, 낡은 증거, 손상/지원하지 않는 원장 등. 미달과 구분한다.

짧은 쓰기 구간에는 `.team-work/write.lock`으로 동시 기록을 막는다. 새 세션도 잠금을 자동 탈취하지 않는다. 충돌하면 기존 작업이 끝난 뒤 재시도한다. 세션 강제 종료로 잠금/임시 파일이 남으면 원본을 보존하고 실제로 실행 중인 작성자가 없는지 확인한 뒤 수동 복구한다. JSON 손상을 새 빈 원장으로 덮어쓰지 않는다. 원장 최대 2MiB를 넘으면 보존·분리 후 다시 시작한다. 파일 권한은 OS 설정을 따르며 이 명령은 보안 샌드박스가 아니다.

## 호환

읽기 전용 인계만 필요하면 `team-handoff.mjs --project <경로>`를 사용한다. 기존 `hermes-handoff.mjs`도 같은 수집기를 호출하는 호환 진입점으로 유지한다. 둘 다 Hermes 없이 실행된다. 기존 Hermes 설정 예시는 선택적 참고 자료다.

## Windows 권한과 테스트

파일 심볼릭 링크 테스트가 `Windows symlink privilege unavailable`로 생략됐다면 Windows 개발자 모드 또는 관리자 권한을 확인한다. 이 생략은 테스트 통과가 아니다.

1. Windows 설정에서 **개발자 모드**를 검색한다.
2. 개발자 모드를 켜고 관리자 승인을 완료한다. Windows 11 25H2 이상은 **시스템 → 고급 → 개발자용**, 이전 Windows 11은 **시스템 → 개발자용**에 있다.
3. 새 터미널에서 아래 테스트를 실행한다. 필요한 권한이 여전히 없다면 테스트용 PowerShell을 **관리자 권한으로 실행**해 같은 명령을 확인한다.

```powershell
node --test test/team-work.test.mjs test/hermes-handoff.test.mjs
```

위 명령은 이 저장소 루트 기준이다. 개발자 모드는 비관리자 프로세스에서 지원되는 API를 통해 심볼릭 링크를 생성할 수 있도록 한다. 조직 관리 PC에서는 설정이 정책으로 제한될 수 있다.

권한 종류를 구분한다:

| 증상 | 확인할 대상 |
|---|---|
| 심볼릭 링크 생성 EPERM, 해당 테스트 생략 | Windows 개발자 모드·실행 토큰의 링크 생성 권한 |
| 에이전트의 허용 작업 폴더 밖 읽기/쓰기 거절 | 에이전트 작업 공간·샌드박스·작업별 승인 |
| 후보 하네스 타임아웃 테스트의 `null !== 3` | Windows 프로세스 종료·자식 프로세스 정리 동작. 권한 변경만으로 해결됐다고 판단하지 않는다 |

개발자 모드는 에이전트 샌드박스나 조직 정책을 해제하지 않는다. 작업 재개 명령 자체는 일반 파일을 사용하므로 심볼릭 링크 생성 권한 없이도 동작한다. 권한 관련 설정은 이 도구가 자동 변경하지 않는다.

공식 근거: [Microsoft 개발자 모드 안내](https://learn.microsoft.com/en-us/windows/advanced-settings/developer-mode), [Windows 심볼릭 링크 안내](https://blogs.windows.com/windowsdeveloper/2016/12/02/symlinks-windows-10/).
