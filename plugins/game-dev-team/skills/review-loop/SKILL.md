---
name: review-loop
description: >
  Codex와 Claude Code가 만든 2D·3D 아트와 기타 산출물을 같은 로컬 대시보드에 등록하고,
  사람의 승인·수정·거절과 구조화된 피드백을 공유해 다음 작업과 규칙 개선에 반영한다.
  "검수 대시보드", "결과 올려서 평가", "A/B 검토", "피드백 반영", "승인 목록" 요청에 사용.
---

# Review Loop

사람의 판정을 Codex와 Claude Code가 함께 읽는 로컬 검수 루프로 만든다. 데이터 정본은 대상
프로젝트의 `.review-loop/`이며 대화 메모리는 정본으로 쓰지 않는다.

## 공통 명령

```bash
node <플러그인>/skills/review-loop/scripts/review-loop.mjs init --project <프로젝트>
node <플러그인>/skills/review-loop/scripts/review-loop.mjs add --project <프로젝트> \
  --id chr.hero.walk --type sprite-animation --title "Hero walk" \
  --preview art/previews/hero-walk.png --artifact art/final/hero-walk.png --harness codex
node <플러그인>/skills/review-loop/scripts/review-loop.mjs summary --project <프로젝트>
node <플러그인>/skills/review-loop/scripts/review-loop.mjs serve --project <프로젝트> --port 4177
```

`add`의 경로는 프로젝트 상대 경로로 기록한다. 3D는 `--artifact`에 GLB/BLEND를 두고
`--preview`에는 턴테이블 이미지나 영상을 둔다. `--compare`로 이전 버전 프리뷰를 연결하면 A/B로 보인다.

## 작업 계약

1. 산출물을 만든 세션은 같은 stable ID의 새 버전을 `add`한다. `--harness codex|claude-code|human`을 남긴다.
2. 작업 시작 전과 피드백 반영 전 `summary`를 읽는다.
3. `revise` 피드백의 태그·점수·의견을 다음 버전에서 처리하고 새 버전으로 다시 등록한다.
4. `approve`가 있어야 manifest의 프로덕션 상태로 승격한다. 대시보드 승인은 파일을 자동 배포하지 않는다.
5. 한 번의 취향 피드백은 해당 에셋만 고친다. 반복 피드백은 대시보드의 규칙 후보로 모으고,
   사람이 직접 승격한 항목만 `.review-loop/rules.json`의 공통 규칙으로 사용한다.

## 판정 분리

- 자동 QA는 규격·회귀·접근성을 판정한다.
- 사람 검수는 스타일·정체성·가독성·동작과 최종 승인을 판정한다.
- 두 결과가 다르면 둘 다 보존한다. 자동 통과를 사람 승인으로 바꾸거나 사람 승인을 자동 QA 통과로 쓰지 않는다.

세부 데이터 형식은 [references/schema.md](references/schema.md)를 필요할 때 읽는다.

