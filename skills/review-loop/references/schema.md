# Review Loop data contract

`.review-loop/`은 양쪽 하네스가 공유하는 정본이다.

- `config.json`: 대시보드 이름과 스키마 버전.
- `items.json`: stable ID별 버전, 프리뷰·산출물·QA 경로와 상태.
- `reviews.jsonl`: 사람 판정 append-only 기록. 과거 판정을 덮어쓰지 않는다.
- `rules.json`: 사람이 명시적으로 승격한 반복 피드백 규칙.

상태는 `review` → `approved` 또는 `revise`/`rejected`다. 수정본은 기존 행을 바꾸지 않고 같은 ID의
새 version으로 등록한다. 점수는 `style`, `identity`, `readability`, `motion`의 1~5 값이며 적용되지
않는 축은 생략할 수 있다. `tags`는 짧고 재사용 가능한 원인명으로 기록한다.

동시 실행 시 `items.json`과 `rules.json`은 임시 파일을 rename하는 방식으로 갱신하며,
`reviews.jsonl`은 한 줄 단위로 append한다. 저장소에 포함할 때 `.review-loop/*.lock`과 `*.tmp-*`는 제외한다.

