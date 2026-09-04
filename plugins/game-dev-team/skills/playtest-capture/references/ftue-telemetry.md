# FTUE 계측 — 무엇을 로그할 것인가

목표는 하나다: **어디서 떠나는지 단계별로 아는 것.** 평균 완료율 하나로는 고칠 곳을 모른다.

## 원칙

- **단계별로 로그한다.** `tutorial_complete` 하나만 찍으면 안 된다. 이탈은 단계 특정적이다 —
  첫 퀘스트도 못 끝내는 이탈이 20% 수준으로 흔하고, 그게 "완료율 65%"에 묶이면 안 보인다.
- **평균이 아니라 퍼널로 본다.** 각 단계의 도달 수와 통과 수를 따로 센다.
- **세션1 → 세션2 전환을 최우선 지표로 둔다.** D1 리텐션의 선행지표다. 첫 세션 내부 지표보다
  이게 먼저다 — 첫 세션을 끝까지 즐겼는데 안 돌아오는 것과, 첫 세션에서 막혀 떠난 것은
  완전히 다른 문제다.

## 첫 계측 이벤트 10종

이것만 있으면 퍼널이 그려진다. 더 늘리기 전에 이게 다 들어가 있는지 먼저 본다.

| # | 이벤트 | 언제 | 필수 속성 |
|---|---|---|---|
| 1 | `session_start` | 앱 진입 | `session_id`, `build_version`, `platform`, `device_class`, `session_index` |
| 2 | `session_end` | 이탈·백그라운드 | `session_length_sec`, `exit_reason`(quit/disconnect/crash) |
| 3 | `ftue_step` | 온보딩 각 단계 도달 | `step_id`, `step_index`, `time_since_session_start` |
| 4 | `ftue_step_complete` | 그 단계 통과 | `step_id`, `attempts`, `duration_sec` |
| 5 | `first_input` | 첫 유효 입력 | `time_since_session_start`, `input_device` |
| 6 | `run_start` | 런/스테이지 시작 | `stage_id`, `run_index` |
| 7 | `run_end` | 런 종료 | `stage_id`, `result`(win/lose/quit), `duration_sec`, `x`, `y` |
| 8 | `death` | 사망 | `stage_id`, `cause`, `x`, `y`, `elapsed_sec` |
| 9 | `currency_change` | 재화 증감 | `currency`, `delta`, `source_or_sink`, `balance_after` |
| 10 | `error` | 예외·크래시 | `message`, `stack_hash`, `stage_id` |

**`x`, `y`를 빼지 마라.** 좌표가 있으면 사망·이탈이 한 곳에 뭉치는지 볼 수 있고, 뭉쳐 있으면
원인이 셋 중 하나다 — **충돌 버그 / 과도한 난이도 / 동선 혼란.** 셋은 고치는 곳이 다르다.

## 세션 속성 (모든 이벤트에 붙인다)

`session_id` · `build_version` · `platform` · `device_class` · `session_index`

- **`build_version`이 없으면 회차 비교가 불가능하다.** 서로 다른 빌드의 퍼널을 합산하면
  수정 효과가 사라진다. 가능하면 커밋 해시를 쓴다.
- `device_class`(저사양/중간/고사양)는 이탈 원인이 성능인지 설계인지 가르는 데 쓴다.
- `session_index`가 있어야 세션1→2 전환을 계산할 수 있다.

## 포맷 — JSONL

한 줄에 한 이벤트. `funnel-report.mjs`가 그대로 읽는다.

```jsonl
{"event":"session_start","session_id":"a1","session_index":1,"build_version":"3f2a9c1","platform":"android","device_class":"mid","ts":1000}
{"event":"ftue_step","session_id":"a1","step_id":"move_tutorial","step_index":1,"ts":1004}
{"event":"ftue_step_complete","session_id":"a1","step_id":"move_tutorial","attempts":1,"duration_sec":6,"ts":1010}
{"event":"ftue_step","session_id":"a1","step_id":"first_combat","step_index":2,"ts":1011}
{"event":"session_end","session_id":"a1","session_length_sec":41,"exit_reason":"quit","ts":1041}
```

이 예시의 세션 `a1`은 `first_combat`에 도달했지만 통과하지 못하고 나갔다 — 퍼널에서
`first_combat` 이탈로 잡힌다.

## 단계 정의 (`steps.json`)

퍼널의 **순서**를 준다. 순서를 모르면 퍼널이 성립하지 않는다 —
`balance-sim`의 `stageOrder`와 같은 이유다.

```json
{
  "steps": [
    { "id": "move_tutorial",  "label": "이동 배우기" },
    { "id": "first_combat",   "label": "첫 전투" },
    { "id": "first_reward",   "label": "첫 보상 수령" },
    { "id": "first_upgrade",  "label": "첫 강화" },
    { "id": "run_1_complete", "label": "1런 완주" }
  ],
  "targets": {
    "stepPassRate": 0.85,
    "session1to2": [0.35, 0.60],
    "maxTimeToFirstInput": 20
  }
}
```

- `stepPassRate`: 각 단계의 통과율 하한. 이 밑으로 확실히 떨어지는 단계가 **막힘 지점**이다.
- `session1to2`: 세션1을 시작한 유저 중 세션2로 돌아온 비율의 목표 구간.
- `maxTimeToFirstInput`: 첫 입력까지 걸린 시간 상한(초). 길면 무엇을 해야 할지 모르는 것이다.

## 사람 관찰과 함께 봐야 한다

퍼널은 **어디서** 떠나는지 알려주고, **왜** 떠나는지는 알려주지 않는다.
그 답은 `session-protocol.md`의 think-aloud 기록에 있다.

퍼널에서 급락 단계를 찾고 → 그 단계의 관찰 기록을 읽어 분류(`이해실패`/`발견실패`/`조작`/
`난이도`/`버그`)를 확인하고 → 고친다. 순서가 반대면(관찰 없이 퍼널만 보면) 대개
난이도로 오진하고 숫자만 낮춘다.
