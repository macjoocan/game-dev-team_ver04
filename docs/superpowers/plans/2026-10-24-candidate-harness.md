# Candidate Harness Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. User approved the design and requested execution; proceed inline.

**Goal:** 기획·개발의 기준안/대안과 작업 방식의 실행 증거를 같은 계약으로 비교한다.
**Architecture:** 표준 Node CLI + 계약/해시 모듈 + 프로세스 실행/증거 모듈. 게임 시뮬레이션과 QA는 기존 프로젝트 명령을 호출한다.
**Tech Stack:** Node 20+, node:test, 외부 의존성 없음, Windows/Linux.
**Spec:** ../specs/2026-10-24-planning-development-harness-design.md

## Global Constraints

- 기존 0/1/3 판정·사람 승인·task-observer 정본 유지.
- 자동 LLM 호출·스킬 자기수정·유료 실행·외부 모델 의존성 없음.
- 해시·raw stdout/stderr·commit/dirty 기록. 같은 입력/평가 계약의 증거만 재사용.
- fixture는 합성 예제로 표시. 실제 재미/게임 성능 향상을 주장하지 않는다.
- 승인된 구현 요청에 따라 인라인 실행. 워크트리에서 검증 후 로컬 main에 ff 반영·공식 설치. 원격 push는 하지 않는다.

## Review Focus

1. timeout/중단 후 살아 있는 자식: 프로세스 트리 정리·retrySafe 재시도 제한.
2. 후보/평가/기존 증거 변경: 해시 검증으로 비교·채택 거부.
3. 누락·오래된 JSON: 새 실행에서 이전 출력으로 통과하지 않음.
4. 측정 불가·확인된 실패 혼합: 개별 결과 전부 노출, 집계 1 우선.
5. Windows 경로·공백·동시 실행: args 배열/경계 검사/배타 lock.

## Task 1 — 계약과 판정

Files: scripts/candidate-contract.mjs, scripts/candidate-adapters.mjs, test/candidate-harness.test.mjs.
Interfaces: loadContract(file) -> context; digest(path) -> SHA256; normalize(check, process, output) -> {code, metrics, gaps}.

- [ ] 실패 테스트: 유효 계약, 후보 ID 중복, 경로/해시 오류, 목표 출처 누락, workflow 실행 증거 누락.
- [ ] 테스트 실행: `node --test test/candidate-harness.test.mjs` (모듈 없음으로 실패).
- [ ] 계약·검증 JSON·balance-sim 어댑터 구현. `node --test test/candidate-harness.test.mjs` 통과.

## Task 2 — 실행·재개·보고

Files: scripts/candidate-run.mjs, scripts/candidate-executor.mjs; same test.
Interfaces: CLI init/check/run/report/record; run(ctx,{resume}) -> {runDir,code}; report -> 원시 증거 검증 후 표/5섹션.

- [ ] 기준안/대안 반대 결과, missing output, timeout, 중단·안전 재개, lock, hash tamper 테스트 추가·실패 확인.
- [ ] 순차 spawn·로그·atomic journal·예산·프로세스 cleanup·재개 구현.
- [ ] report/record는 실행 증거를 검증하고 무효면 3. 사람 승인을 변경하지 않음.
- [ ] 같은 테스트 통과 확인.

## Task 3 — 예제·사용 지침·배포

Files: samples/candidate-harness/*, skills/balance-sim/references/candidate-harness.md, 관련 기존 SKILL.md/ORCHESTRATION.md/README/USAGE, plugin manifests, .github/workflows/validate.yml.
Interfaces: documented `node scripts/candidate-run.mjs init --domain ... --out ...`; `--demo`는 로컬 fixture만 생성.

- [ ] init planning/development 데모와 미완료 템플릿 테스트 추가·실패 확인 후 구현.
- [ ] fresh shell에서 문서 명령 실행. raw 출력은 docs evidence에 보관.
- [ ] 스킬 변경은 최신 파일에서 staging 후 승인된 범위로 적용; mirror sync; 0.48.0 버전 갱신.
- [ ] validate-plugin 및 ci-local 실행, fresh reviewer 한 번 수행·중요 결함 수정.
- [ ] 지정 경로만 커밋 후 로컬 main fast-forward·공식 installer·버전 확인. 미관련 파일 보존.

## Self-review

설계의 두 비교 축·lesson intake·외부 작업 재전송 제한은 Task 1/2, 기존 스킬/배포는 Task 3에 배정. 자동 workflow 실행은 범위 밖이며 수동 실행 증거 검사만 구현. 기존 review-loop 판정에 쓰지 않음.
