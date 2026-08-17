# 품질 훅 가이드 — 커밋 전 자동 검사 (선택)

문서 규칙("밸런스 수치는 데이터 테이블에", "근거 없는 수치 0")을 **자동으로 강제**하고 싶을 때
게임 레포에 pre-commit 훅을 둔다. 게이트 모드와 무관하게 항상 도는 기계적 검사다.

## 검사 항목 (게임 레포 상황에 맞게 골라 적용)

### 1. 밸런스 수치 하드코딩 검출
전투/런 로직 파일(예: `src/core/`, `Game.Core/`)에서 매직 넘버를 찾는다.
데이터 파일(예: `data/balance.*`, ScriptableObject)은 제외한다.

```bash
# 예: 로직 파일에서 2자리 이상 숫자 리터럴 검출 (허용 목록 제외)
git diff --cached --name-only -- 'src/core/*' | while read f; do
  grep -nE '(damage|hp|heal|cost|rate|chance)\s*[=:]\s*[0-9]{2,}' "$f" \
    && { echo "밸런스 수치 하드코딩 의심: $f — 데이터 테이블로 옮기세요"; exit 1; }
done
```

### 2. 데이터 파일 유효성
밸런스 JSON/CSV가 스키마에 맞는지(필드 누락, 음수 HP 등) 파싱 검사.

```bash
git diff --cached --name-only -- 'data/*.json' | while read f; do
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" \
    || { echo "JSON 파싱 실패: $f"; exit 1; }
done
```

### 3. 에셋 네이밍/manifest 규칙
- 에셋 파일명이 `VISUAL_DESIGN.md`/manifest의 네이밍 규칙과 일치하는지.
- manifest에 없는 에셋이 `assets/final/`에 추가되지 않았는지.

### 4. RNG 시드 규칙
`Math.random()`/`Random.Range()` 직접 호출이 Core 로직에 새로 들어오면 경고
(시드 주입형 RNG 래퍼를 쓰도록).

## 설치 — 방법 A: git pre-commit (커밋 시점 검사)

게임 레포에서:
```bash
# .git/hooks/pre-commit 에 검사 스크립트를 넣거나,
# 팀 공유가 필요하면 husky(웹) / core.hooksPath(범용) 사용
git config core.hooksPath .githooks
```

## 설치 — 방법 B: Claude Code 훅 (편집 즉시 검사)

Claude Code로 작업하는 레포면 `PostToolUse` 훅으로 **파일이 수정되는 순간** 검사할 수 있다
(커밋까지 기다리지 않음). 게임 레포 `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check-balance-hardcoding.sh"
          }
        ]
      }
    ]
  }
}
```

훅 스크립트(`.claude/hooks/check-balance-hardcoding.sh`)는 stdin으로 받은 JSON에서
`tool_input.file_path`를 읽어 코어 로직 경로일 때만 1번 검사를 수행하고, 위반 시
비-0 종료로 Claude에게 피드백을 준다. 상세: https://code.claude.com/docs/en/hooks

## 원칙
- 훅은 **기계적으로 판별 가능한 것만** 검사한다(재미/밸런스 판단은 balance-sim·사람 게이트 몫).
- 오탐이 잦은 검사는 경고로 낮추고, 차단은 확실한 위반(파싱 실패 등)에만 쓴다.
- 훅 우회(`--no-verify`)가 필요했다면 그 사유를 커밋 메시지에 남긴다.
