# 기획·개발 비교 예제

두 예제 모두 **합성 fixture**다. 실제 게임·LLM·외부 API를 실행하지 않는다. 일부러 기준안은 미달, 대안은 충족하도록 준비해 보고·재개·채택 제안을 확인한다.

저장소 루트 또는 설치된 플러그인 루트에서 Node 20+로 실행한다.

```powershell
node scripts/candidate-run.mjs check samples/candidate-harness/planning/experiment.json
node scripts/candidate-run.mjs run samples/candidate-harness/planning/experiment.json
node scripts/candidate-run.mjs report samples/candidate-harness/planning/experiment.json
node scripts/candidate-run.mjs record samples/candidate-harness/planning/experiment.json --candidate alternative --reason "합성 기준 충족; 실제 게임 검증은 별도"

node scripts/candidate-run.mjs check samples/candidate-harness/development/experiment.json
node scripts/candidate-run.mjs run samples/candidate-harness/development/experiment.json
node scripts/candidate-run.mjs run samples/candidate-harness/development/experiment.json --resume
```

`run`·`report`는 기준안의 의도한 미달 때문에 **exit 1**이다. 예제 검증에서는 이를 성공적인 실패 감지로 기대한다. `record`는 대안이 필수 검증을 충족하면 exit 0이며, decision/lesson은 proposed로만 남긴다. 같은 실행의 decision을 덮어쓰지 않는다.

결과는 예제 폴더 안의 `out/experiments/demo/<run-id>/report.md`에 있다. 사람 승인이나 프로덕션 승격을 만들지 않는다.

플러그인 설치본에는 이 samples 폴더가 없어도 CLI의 `init --demo`로 동일 예제를 생성할 수 있다.

```powershell
node scripts/candidate-run.mjs init --domain planning --out out/planning-comparison --demo
node scripts/candidate-run.mjs init --domain development --out out/development-comparison --demo
```

실제 프로젝트 계약·어댑터·재개 제한은 [사용 지침](../../skills/balance-sim/references/candidate-harness.md)을 따른다.
