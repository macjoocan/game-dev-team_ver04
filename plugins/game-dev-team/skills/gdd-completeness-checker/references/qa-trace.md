# 기획–QA 추적

정본 Markdown에 명시적 표를 작성한다. 각 칸은 한 줄이며 `|`를 포함하지 않는다. 표 밖의 문장은 추출하지 않으므로 사람이 누락을 확인한다.

```markdown
| ID | 규칙 | 수용 기준 |
| --- | --- | --- |
| R1 | 보상은 한 번 지급 | 재접속해도 중복 지급되지 않음 |
```

`node skills/gdd-completeness-checker/scripts/trace-draft.mjs design.md trace.json`은 덮어쓰기 없이 초안을 만든다. 각 행은 `reviewed: false`, 사례는 빈 배열이다. 사람이 정본을 대조하고 `reviewed: true`로 변경한 뒤 사례를 작성한다.

`node skills/gdd-completeness-checker/scripts/trace-check.mjs trace.json`은 정본 행과 요구사항, 관련 사례 및 결과를 확인한다. 요구사항을 검토한 뒤 도구가 출력하는 `requirementHash`를 사례에 기록한다. 사례는 `id`, `requirementId`, `steps`, `expected`, `status`(`pass`, `fail`, `not_run`)를 가진다. 실행 사례는 추가로 `build`(git 커밋), `evidence`(추적 파일 기준 상대 JSON 경로), `evidenceHash`(결과 파일의 SHA-256)를 기록한다. 결과 JSON은 `caseId`, 전체 커밋 SHA인 `build`, `status`, `requirementHash`를 포함해야 한다.

정본 행이 바뀌거나 사라지면 연결된 사례를 재검토로 표시한다. 다른 줄에 있는 기획 변경은 감지하지 못한다. 종료 코드 0은 기록과 연결이 일치함, 1은 근거가 연결된 실패 기록, 3은 누락·미실행·재검토다. 결과 파일의 실제 실행 여부, 진위, 사례의 충분성과 사람 승인은 이 검사로 증명할 수 없다. 실패와 공백이 함께 있으면 1이며 둘 다 출력한다.
