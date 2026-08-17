---
paths:
  - "plugins/**"
---

# 미러 직접 수정 금지

`plugins/game-dev-team/`은 루트(정본)의 미러다. 이 경로의 파일을 직접 수정하지 마라.
1. 루트의 대응 파일(`agents/`, `skills/`, 문서, 매니페스트)을 수정한다.
2. `scripts/sync-plugin.ps1`을 실행해 미러를 재생성한다.
3. `scripts/sync-plugin.ps1 -Check`로 동기화를 확인한다.
