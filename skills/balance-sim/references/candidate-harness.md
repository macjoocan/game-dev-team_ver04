# 기획·개발 후보 비교 실행

Harness²의 Propose–Probe–Compose 방법을 게임 작업에 적용한 로컬 비교 도구다. 기준안과 대안 1~2개를 같은 과제·평가 조건에서 검증하고 원시 증거·채택 제안·교훈 제안을 남긴다. 게임 로직·테스트를 새로 만들거나 모델을 호출하지 않는다.

출처: [Google Research Harness²](https://github.com/google-research/harness2), 조사 리비전 `1cfe254e8d25b15f37048c3730134686abe60335`. 방법을 참고한 독립 구현이며 원본 코드·의존성은 포함하지 않는다.

## 언제 사용하는가

- 기획 규칙·밸런스·난이도 또는 개발 구현에 의미 있는 대안이 있을 때.
- 스킬·도구 안내·작업 순서를 바꾼 `workflow` 후보의 실제 실행 증거를 비교할 때.
- 단순 수정·정답이 있는 설정·측정 근거를 만들 수 없는 결정에는 사용하지 않는다.
- 기획 회차당 조정 노브 최대 2개, GDD·사람 플레이·QA·merge 승인 등 기존 게이트를 유지한다.

## 빠른 사용

플러그인 루트에서 다음 명령으로 비용 없는 합성 데모를 생성한다. 프로젝트에서 사용할 때는 `scripts/candidate-run.mjs`를 설치된 플러그인의 절대경로로 지정한다.

```powershell
node scripts/candidate-run.mjs init --domain planning --out out/planning-comparison --demo
node scripts/candidate-run.mjs check out/planning-comparison/experiment.json
node scripts/candidate-run.mjs run out/planning-comparison/experiment.json
node scripts/candidate-run.mjs report out/planning-comparison/experiment.json
```

`run`·`report`의 exit 1은 합성 기준안의 의도한 미달이다. 실제 게임 결과가 아니다. `--demo` 없이 init하면 pending 템플릿만 만들고, 필수 계약을 채우기 전 check/run은 3이다. init은 기존 experiment.json·예제 입력을 덮어쓰지 않는다.

## 계약을 실제 과제에 맞추기

experiment.json 경로 기준 `projectRoot`를 실제 프로젝트 루트로 지정한다. 후보별 cwd는 프로젝트 아래의 별도 스냅샷 폴더다. cwd 전체와 declared inputs를 고정하므로 검증 산출물은 후보 소스에 쓰지 말고 `{output}`에 쓴다. 후보 cwd를 프로젝트 루트로 잡으면 out과 겹치므로 거부된다. 다른 체크아웃의 소스를 쓸 때는 프로젝트 아래 별도 후보 스냅샷을 준비한다.

| 필드 | 계약 |
|---|---|
| version/id/domain/axis/purpose | version=1, stable ID, planning/development, artifact/workflow, 실제 판단 질문 |
| references | 목표·요구·필러 출처의 `{path, sha256}`. projectRoot 기준 |
| candidates | 2~3개. id/cwd/difference/subject/inputs. subject는 사람이 검수할 대상 파일·폴더 |
| conditions | 시드·정책·판수·기기·엔진 등 실제 비교 조건. 해당 없으면 이유 명시 |
| budget | maxAttempts, maxDurationMs. 명령 수·누적 실행 시간을 제한 |
| checks | 같은 실행 명령과 평가 파일을 모든 후보에 적용 |
| lessonIntake | searched 경로와 uses 목록. 없으면 빈 uses와 조회 경로를 명시 |
| metrics | id/check/unit/direction(min/max/observe)/source. required=true이면 유한 threshold 필수 |

lesson uses는 id/path/sha256/status/reason, 원래 evidence의 path/sha256을 요구한다. accepted이면 사람 결정 approval의 path/sha256도 필요하다. 승인 파일의 사람 신원은 자동 인증하지 않는다. task-observer의 전역 로그·검토 절차는 메인 세션이 그대로 따른다.

원본·설정·검증 파일의 SHA-256은 실제 바이트에서 계산한다. 디렉터리 해시는 이 도구의 `digest(path)`를 사용한다. 심볼릭 링크는 거부한다.

### 검증 명령

```json
{
  "id": "tests", "required": true, "adapter": "exit",
  "executable": "$NODE", "args": ["{project}/evaluation/test-runner.mjs", "{candidate}", "{output}"],
  "timeoutMs": 30000, "retrySafe": true, "failureCodes": [1],
  "files": [{"path": "evaluation/test-runner.mjs", "sha256": "실제 64자리 해시"}]
}
```

shell=false이며 executable은 `$NODE`, PATH의 실행 파일 이름 또는 절대경로다. 실제 실행 파일 경로·바이너리 해시도 fingerprint에 포함한다. Windows의 npm.cmd 같은 셸 래퍼는 직접 실행하지 말고 Node로 실제 JS CLI를 호출한다. args의 `{project}`·`{candidate}`·`{output}`만 경로로 치환한다. 입력/평가의 간접 의존성도 files 또는 inputs로 고정한다. PATH·패키지·GPU·네트워크 응답까지 격리하는 샌드박스는 아니다.

### 어댑터

- `exit`: 0 충족, failureCodes에 명시한 비0 코드만 미달. 그 외 오류는 3. 테스트의 failureCodes=[1]은 프로젝트 테스트 계약을 확인한 뒤 설정한다.
- `json`: `result: "{output}/result.json"`. 새 실행 디렉터리에 `{"verdict":"pass|fail|unknown","metrics":{"name":1},"reason":"..."}`를 생성한다. 프로세스 종료 코드도 각각 0/1/3과 일치해야 한다.
- `balance-sim`: 기존 sim/run.mjs의 `--out {output}` results.json을 읽는다. 고정 target=[하한,상한]과 conditions={seed,runs,policy}를 넣고 experiment.conditions와 일치시킨다. 원본 JSON의 a.n·a.winRate.p로 Wilson 구간을 재계산한다. fixture의 a.wins도 지원한다. PLACEHOLDER의 exit 3, 표본 부족, 조건/목표/종료 코드 불일치는 3이다. 다른 목표 지표는 별도 check로 연결한다. 승률 판정으로 기획 전체를 승인하지 않는다.
- `evidence`: 후보 cwd의 evidencePath를 읽는다. id/type/reviewer/at/subjectHash/code와 raw={path,sha256}를 요구한다. subjectHash는 candidate.subject의 내용 해시와 같아야 한다. 누락·오래된 증거는 3. 검수 메모·플레이 기록은 raw 증거로 보존한다.

GDD 검수·사람 플레이·QA 결과는 evidence 어댑터로 각각 연결한다. 입력 evidence를 이전 대상에 맞춘 채로 복사해 통과시키지 않는다.

### workflow 비교

메인 세션이 후보별로 실제 작업을 수행하고 executionEvidence={path,sha256}를 후보에 넣는다. 파일은 session/model/startedAt/endedAt/tools/subjectHash와 workflowSpec·trace의 path/sha256을 포함한다. 모델을 모르면 unknown으로 남긴다. 실행기가 지침을 읽고 작업을 자동 수행하는 기능은 없다. 기준 과제·평가·게임 데이터를 유지한 상태에서 작업 방식만 비교한다.

## 보고·재개·채택

- 후보별 raw stdout/stderr, process.json, 계약 스냅샷, commit/dirty·런타임·fingerprint, report.md·comparison.json을 보존한다.
- report는 가장 최근 실행을 읽는다. resume는 같은 fingerprint의 단일 미완료 실행 또는 가장 최근 완료 실행을 찾는다. 여러 미완료 실행은 자동 선택하지 않는다.
- 완료 증거는 해시로 재확인한다. 새 실행은 별도 run-id를 만들어 이전 결과를 보존한다. 입력·평가·실행기·도구 코드가 바뀌면 기존 증거 재사용을 거부한다.
- 중단된 명령은 retrySafe=true일 때만 새 attempt 폴더에서 다시 실행한다. 외부 쓰기/결제/배포 명령은 retrySafe로 선언하지 않는다. 실행 ID는 외부 중복 실행을 막지 않는다.
- 강제 종료로 .lock이 남으면 소유 pid/host를 확인하고 실행이 멈춘 것을 확인한 후 수동 제거한다. 도구는 오래된 잠금을 자동 탈취하지 않는다.
- timeout/취소 시 Windows taskkill /T /F, POSIX process group으로 자식을 정리한다. 별도 세션·detached로 빠져나간 프로세스까지 회수한다고 보장하지 않는다.
- 필수 검증 중 확인된 미달이 있으면 1, 미달은 없으나 필수 증거가 부족하면 3, 모두 충족이면 0. 선택 검증의 공백도 보고한다.
- `record ... --candidate ID --reason TEXT`는 해당 후보의 필수 검증이 모두 충족일 때만 decision.json·lesson-proposal.json을 proposed 상태로 남긴다. 자동 승인·merge·스킬 수정은 하지 않는다.
- lesson을 다음 과제에 쓸지는 메인 세션이 조건·반례·증거를 읽고 lessonIntake에 기록한다. 전체 스킬 개선은 task-observer 검토로 넘긴다.

## 출고 전 확인

실제 명령·원시 로그·대상 커밋·기준 출처·공백·잔여 위험을 보고한다. 합성 fixture와 실제 게임 결과, 기술 검증과 사람 승인을 구분한다. review-loop·state.json·PIPELINE_STATE.md의 기존 판정은 자동으로 바꾸지 않는다.
