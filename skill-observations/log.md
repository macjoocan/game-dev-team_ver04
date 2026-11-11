# Skill Observation Log

Observations captured during task-oriented work.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = skill updated/created | DECLINED (YYYY-MM-DD) = user decided not to pursue

---

## [OBS-20260914-001] correction

**Logged**: 2026-09-14T14:27:00+09:00
**Priority**: P1
**Status**: OPEN
**Area**: tooling

### What Happened
Blender MCP connection checks run inside the workspace sandbox reported `CONNECTION_CLOSED` because `uvx` could not access its user cache. The same registered command connected successfully outside the sandbox.

### Generalizable Insight
For user-scoped MCP servers launched through `uvx`, distinguish an MCP failure from a sandboxed cache-access failure. Re-run the client connection check with normal user permissions before changing a valid MCP configuration.

### Suggested Action
Add a troubleshooting note to the 3D asset pipeline: if `uvx` reports cache initialization or access errors only in a sandbox, verify once outside the sandbox and preserve the existing configuration when that succeeds.

### Evidence
- Source: tool-error
- Related Files: skills/asset-3d-pipeline/SKILL.md
- Tags: blender-mcp, uvx, sandbox, false-negative

---

### Observation 1: Check service access and visibility before a generation pilot

**Status:** OPEN
**Date:** 2026-10-16
**Session context:** Comparing a local motion asset workflow with hosted art tools
**Skill:** char-art-system
**Type:** open-source
**Phase/Area:** External backend comparison

**Issue:** A new sprite feature was web-only even though the vendor offered APIs elsewhere. A second service exposed free-tier generations publicly, and its trial balance could not cover both planned actions. These conditions affect whether a same-reference pilot is feasible before model quality is considered.

**Suggested improvement:** Before uploading or generating, record feature-specific API availability, account access, output visibility, reference import support, and the displayed cost of the full comparison matrix. Preserve a common hashed reference and existing baseline while access is being resolved.

**Principle:** Validate the actual feature, account and output-sharing conditions before treating a hosted generator as a comparable production backend.

### Observation 2: Static sequences can pass sprite consistency QA

**Status:** OPEN
**Date:** 2026-10-16
**Session context:** A same-reference motion generation comparison
**Skill:** sprite-pipeline
**Type:** open-source
**Phase/Area:** Motion validation versus structural consistency

**Issue:** A downloaded walk sequence passed the existing sprite consistency checker with exit 0, while the user immediately noticed that there was no walking motion. A contact sheet confirmed almost fixed leg poses, and lower-body silhouette IoU to the first frame stayed above 0.99. File and canvas consistency did not establish action completion.

**Suggested improvement:** Keep structural QA and motion-success evidence separate. A walk pilot should show planted support, alternating feet, knee articulation and weight transfer. Low temporal change can flag human inspection, but a universal movement threshold should not reject deliberately subtle idle animation.

**Principle:** Consistency measures can reward a static failure; validate whether the requested action actually occurs before accepting a generated animation.

**Reference file:** samples/art-comparison-2026-10-16/README.md

### Observation 3: Loop quality needs boundary inspection even when motion exists

**Status:** OPEN
**Date:** 2026-10-16
**Session context:** Repairing a hosted sprite walk cycle after human feedback
**Skill:** sprite-pipeline
**Type:** open-source
**Phase/Area:** Loop boundary validation

**Issue:** A recognizable walk passed structural QA yet the user noticed an abrupt reset. A vendor loop-repair pass reduced boundary change while re-rendering details. Frame consistency, action completion and seamless repetition are distinct checks.

**Suggested improvement:** Keep the original and repaired outputs, compare their last-to-first frames at a common playback period, and report boundary change relative to internal changes as a diagnostic rather than a universal gate. Preserve service timing assumptions, export scaling, watermarks and quoted versus settled credit observations.

**Principle:** Validate the transition back to the first frame, and do not trade identity preservation for a smaller seam metric without human review.

### Observation 4: 같은 버전의 설치본에도 최신 도구가 없을 수 있다

**Status:** ACTIONED
**Date:** 2026-11-05
**Session context:** 데브팀 기능 강화 전 변경 이력과 설치 상태 확인
**Skill:** setup-game-team
**Type:** open-source
**Phase/Area:** 설치본 최신성 확인

**Issue:** 소스와 설치본이 모두 0.50.0이라 버전 검사기는 최신으로 표시했다. 그러나 현재 Codex 캐시에는 소스에 추가된 blender-rig-check.py가 없었다. 같은 캐시의 team-work.mjs와 trace-check.mjs는 소스와 해시가 같았다. 버전 일치만으로 전체 내용의 일치를 확인할 수 없었다.

**Suggested improvement:** 설치 확인 절차에서 하네스별 대상 경로를 밝힌다. 버전뿐 아니라 배포 파일 목록과 해시를 대조한다. 이번에는 관찰만 기록하며 검사기와 설치본은 변경하지 않는다.

**Principle:** 배포 버전이 같다는 사실과 설치된 파일 내용이 같다는 사실을 구분한다.

**Reference file:** scripts/check-plugin-version.mjs

**Resolution (2026-11-05):** 사용자 요청에 따라 배포 파일 해시 검사를 구현했다. Claude·Codex 0.51.0 설치본 각각 213개 파일 일치와 전체 CI 21/21 통과를 확인했다. 근거: out/devteam-upgrade/REPORT.md.

### Observation 5: 자동 발견한 테스트에도 직접 의존성을 선언해야 한다

**Status:** OPEN
**Date:** 2026-11-06
**Session context:** 원격 변경 통합 뒤 전체 CI 검증
**Skill:** ci-cd-pipelines
**Type:** open-source
**Phase/Area:** 테스트 환경과 의존성 준비

**Issue:** 테스트 자동 탐지로 Python 검사 2개가 실행됐지만 CI 설치 목록에는 두 검사 대상이 import하는 requests가 없었다. 로컬의 다른 Python에는 설치돼 있었으나 CI가 선택한 Python에서는 ModuleNotFoundError가 났다.

**Suggested improvement:** 테스트 실행 대상을 늘릴 때 직접 의존성과 실제 선택된 인터프리터를 함께 확인한다. 이번 저장소의 CI 설치 목록은 수정했으며, 공용 스킬 변경은 다음 검토로 남긴다.

**Principle:** 파일을 모두 발견하는 것과 같은 환경에서 실행할 수 있는 것은 별도 조건이다. 개발 PC에 우연히 설치된 패키지에 기대지 않는다.

**Reference file:** out/integration-20261106/tests-final.txt

### Observation 6: 생성 요청 ID는 완료 전에 저장해야 한다

**Status:** OPEN
**Date:** 2026-11-06
**Session context:** 로컬 ComfyUI의 대형 모델 검증
**Skill:** char-art-system
**Type:** open-source
**Phase/Area:** 실행 기록과 중단 복구

**Issue:** comfy-run.mjs는 요청 ID를 받은 뒤 생성 완료를 기다리고, 모든 결과를 받은 뒤에야 run-log.json을 쓴다. 대형 모델의 초기 적재가 길어지는 동안 프로세스가 종료되면 실행 중인 요청 ID가 로컬 기록에 남지 않는다. 이번에는 서버의 queue·history를 별도 저장해 추적했다.

**Suggested improvement:** 제출 직후 요청 ID·그래프 해시·시드를 먼저 저장하고, 상태를 submitted/running/completed/failed로 갱신한다. 재개 시 기존 요청을 조회한 뒤 재제출 여부를 판단한다. 공용 도구 수정은 검토 뒤 진행한다.

**Principle:** 결과가 늦게 나오는 작업은 완료 기록뿐 아니라 실행 중인 작업을 찾을 기록도 필요하다.

**Reference file:** skills/char-art-system/scripts/comfy-run.mjs

### Observation 7: 관절 연결과 렌더된 장비의 형태를 따로 검사해야 한다

**Status:** OPEN
**Date:** 2026-11-06
**Session context:** GPT 캐릭터의 뼈대·시트 생성 방식 비교
**Skill:** sprite-pipeline / visual-qa
**Type:** open-source
**Phase/Area:** 장비 보존 검수

**Issue:** 손과 검의 뼈대 연결 간격은 0px이고 검 뼈대 길이도 일정했지만, 혼합 가중치로 변형한 픽셀 칼날은 휘었다. 자동 스프라이트 QA도 이 결과를 충족으로 판정했다.

**Suggested improvement:** 장비가 보이는지, 손을 따라가는지, 장비 자체의 형태가 유지되는지를 나눠 검사한다. 뼈대 좌표 검증과 실제 프레임 시각 검수를 함께 남긴다. 공용 규칙 승격은 별도 검토로 남긴다.

**Principle:** 데이터 연결이 맞아도 렌더된 형상이 맞는 것은 아니다.

**Reference file:** out/experiments/gpt-walk-20261106/REPORT.md

### Observation 8: 주기적인 색 변화는 디코딩 방식도 대조해야 한다

**Status:** OPEN
**Date:** 2026-11-06
**Session context:** 로컬 은발 걷기의 칼 잘림과 색 변화 수정
**Skill:** char-art-system / sprite-pipeline
**Type:** open-source
**Phase/Area:** 영상 디코딩과 생성 입력 여백

**Issue:** Wan Animate 2 결과의 12·24번 구간에서 색 변화와 다리 잔상이 생겼다. 같은 latent에 시간축 타일 디코딩을 적용하면 문제가 재현됐고, 전체 디코딩에서는 개선됐다. 칼 잘림은 입력과 출력의 캔버스 여백을 넓혀 해결했다.

**Suggested improvement:** 주기적인 영상 결함은 같은 latent로 디코딩 방식만 바꿔 비교한다. 장비가 화면을 벗어나면 이미 잘린 출력을 축소하지 말고 생성 입력 여백부터 확보한다. 공용 스킬 수정은 별도 검토로 남긴다.

**Principle:** 생성 결과의 문제를 전부 생성 모델 탓으로 돌리지 않는다. 변환 단계와 화면 경계도 독립적으로 확인한다.

**Reference file:** out/experiments/local-motion-20261106/REPORT.md

### Observation 9: 프레임 재생 시간은 패킹 순서가 아니라 이름에 연결한다

**Status:** OPEN
**Date:** 2026-11-06
**Session context:** 은발 베기의 비균등 타이밍 내보내기
**Skill:** sprite-pipeline
**Type:** open-source
**Phase/Area:** 아틀라스와 애니메이션 메타데이터

**Issue:** atlas-pack은 높이순으로 패킹한 배열에 duration 목록을 순서대로 붙인다. 입력 파일 순서로 만든 공격 타이밍은 다른 프레임에 연결될 수 있다.

**Suggested improvement:** 프레임 이름으로 duration을 매핑하고 재생 순서를 별도로 보존한다. 이번 실험의 export 어댑터에서 매핑을 검사했다. 공용 도구 변경은 별도 검토로 남긴다.

**Principle:** 공간에 담는 순서와 시간에 재생하는 순서를 구분한다.

**Reference file:** out/experiments/silver-slash-20261106/export.mjs

### Observation 10: 배경 제거 뒤 타격 프레임의 칼날을 다시 확인한다

**Status:** OPEN
**Date:** 2026-11-06
**Session context:** 베기 7번의 칼날 투명도 복구
**Skill:** char-art-system / visual-qa
**Type:** open-source
**Phase/Area:** 얇고 흐릿한 장비의 알파 검수

**Issue:** 생성 원본에는 칼날이 있었지만 의미 기반 배경 제거가 흐릿한 칼날을 지웠다. 파일 개수·캔버스 검사만으로는 발견되지 않았다.

**Suggested improvement:** 타격 프레임의 RGB 원본과 투명본을 나란히 확인한다. 원본에 형태가 남았을 때만 제한된 영역의 알파를 복구하고, 범위 밖 픽셀·나머지 프레임 불변을 검증한다.

**Principle:** 생성에서 보존된 장비도 후처리에서 사라질 수 있다.

**Reference file:** out/experiments/silver-slash-20261106/alpha-repaired/repair.json


### Observation 11: 하단 윤곽 지표는 발 움직임과 분리해 검증한다

**Status:** OPEN
**Date:** 2026-11-11
**Session context:** 스프라이트 모션 판정 설계 검토
**Skill:** sprite-pipeline
**Type:** open-source
**Phase/Area:** 계측 지표의 의미와 반례

**Issue:** 발을 고정한 합성 입력에서 망토만 움직여도 liftRange가 0에서 0.111702로 증가했다. 잘림 탐침은 빈 이미지 묶음을 충족으로 판정했고, 두 탐침의 알파 경계 정의도 달랐다.

**Suggested improvement:** 지표가 의도한 신체 부위를 직접 측정하는지 대조 입력으로 확인한다. 이름은 실제 계산 범위를 드러내고, 빈 내용물과 알파 경계값은 공통 입력 검사로 묶는다. 공용 도구 변경은 설계 승인 뒤 진행한다.

**Principle:** 수치가 움직임에 반응한다는 사실만으로 그 움직임의 원인을 측정한다고 볼 수 없다.

**Reference file:** out/resume-20261111/REVIEW.md

### Observation 12: 알파 기준이 다른 경계 수치를 발 이동량으로 해석하지 않는다

**Status:** OPEN
**Date:** 2026-11-11
**Session context:** 새 GPT 은발 시트 생성과 팔·다리 수정
**Skill:** sprite-pipeline
**Type:** open-source
**Phase/Area:** 실제 생성물 검사와 측정값 설명

**Issue:** v1은 정합성 검사에 통과했지만 사용자가 다리 교차 부족과 칼 든 팔 고정을 지적했다. 수정한 v2의 기존 baseline 경고는 34px였으나, 알파 128 이상인 피사체 하단 범위는 6px였다. 처음 보고에서 34px를 발 높이 변화로 설명했다가 정정했다.

**Suggested improvement:** 경계값마다 사용하는 알파 기준을 결과에 드러낸다. 낮은 알파까지 포함한 외곽과 피사체 마스크를 구분한다. 일반 정합성 통과로 보행 교차·팔 동작을 승인하지 않는다.

**Principle:** 이미지 외곽의 변화는 관절 이동량과 다르다. 사용자 모션 피드백은 자동 검사와 별도로 보존한다.

**Reference file:** out/experiments/silver-gpt-qa-20261111/REPORT.md
