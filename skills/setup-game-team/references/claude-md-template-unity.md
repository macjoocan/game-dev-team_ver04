# CLAUDE.md 템플릿 — Unity (C#)

웹 템플릿과 팀·파이프라인·게이트는 동일. "스택/실행/검증/아트 산출물" 레이어만 Unity에 맞춘 판이다.
`<...>`는 플레이스홀더, 확정 못 한 값은 `<추정>`.

---

# <프로젝트명> — 게임 개발 팀 규칙 (CLAUDE.md · Unity)

<장르/한 줄 소개>. **최종 권위자는 사람(당신)**이며, 모든 단계 전환은 사람 승인을 거친다.

## 프로젝트 개요
- 장르: <장르>
- 스택: **Unity <버전> · C#**
- 렌더/입력: <URP/Built-in · New Input System 등>
- 실행: Unity Editor Play 모드 / CLI 배치모드
  `"<UnityPath>/Unity" -batchmode -projectPath . -runTests -testPlatform EditMode`

## 팀 구성 (허브-앤-스포크)
```
        [사람 = 최종 권위자]
              │ 승인/지시
        [오케스트레이터 = 메인 세션]
        ┌────┬────┬────┬────┬────┬──────┐
       pm designer dev  qa artist meta-economy
```
- 에이전트는 서로 직접 대화하지 않는다. 오케스트레이터가 결과를 모아 다음 역할로 전달한다.

| 에이전트 | 역할 |
|---|---|
| `pm` | 태스크 분해·우선순위·추적 |
| `game-designer` | 기획/밸런스 설계·검토, 게임성 지표 정의·검증 |
| `developer` | 프로토(스파이크)·본구현·시뮬 하네스 (C#) |
| `qa` | 정확성 검증·코드 리뷰·Unity Test |
| `meta-economy-designer` | 성장 구조·수익화·리텐션 설계·경제 검증 (core 통과 후) |
| `artist` | 스프라이트/프리팹/UI 시안·톤, 연출(폴리싱) 디렉션 |

## 파이프라인 & 게이트 (사람 승인 없이 다음 단계 금지)
0. **컨셉 발굴/코어 확보** (`concept-discovery` — 오케스트레이터가 사람과 대화) — 아이디어·코어 규칙을 유사 사례 조사와 함께 다듬어 코어 컨셉을 확정한다. **발산 단계**(수치 게이트 없음). 게이트: 사람이 코어 확정 승인.
1. **기획/밸런스 + 게임성 지표 정의** (`game-designer`) — 게이트: 근거 없는 수치 0 · 미결 명시 · 게임성 지표 숫자로 정의.
2. **태스크 분해** (`pm`).
3. **프로토타입(스파이크)** (`developer`) — 버려도 되는 최소 구현. 핵심 재미만.
4. **게임성 검증** (`game-designer` + `balance-sim`) — 헤드리스 시뮬로 지표 대조. 미충족 시 1번으로 되돌림(반복 루프).
5. **본구현** (`developer`) — worktree 브랜치, 작은 커밋.
6. **정확성 검증** (`qa`) — Unity Test(EditMode/PlayMode), 콘솔 에러 0.
7. **아트/시각 QA** (`artist`) — `art-direction`으로 `VISUAL_DESIGN.md` 확정 → 에셋 제작(asset-pipeline manifest 기록) → `visual-qa` 검수.
   - 게이트: `VISUAL_DESIGN.md` 존재 · asset manifest 기록 · Unity 실제 화면(Game view) visual-qa 증거 확인.
P1. **1차 폴리싱 — 코어 연출 패스** (`polish` · artist+developer) — 게임성 검증 통과한 코어에 최소 연출(타격감·핵심 전환)로 손맛 확보. **연출은 game feel 레이어**(재미=4, 정확성=6과 별개). 게이트: 핵심 액션 피드백 존재 + 사람 사인오프.

> 3↔4 반복 루프. 재미가 안 나오면 5로 안 넘어간다. QA(6, 버그) ≠ 게임성 검증(4, 재미/밸런스).

- **게이트 모드**: <full/lean/solo> — full=모든 게이트(기본), lean=핵심 게이트만(코어 확정·게임성 검증·머지), solo=게이트 없음(잼/실험).
- 게이트 통과 이력과 현재 단계는 레포 루트 `PIPELINE_STATE.md`에 기록한다.

## Unity 아트/에셋 규칙
- 아트 제작 전 `VISUAL_DESIGN.md`로 팔레트, 실루엣, 카메라, UI 톤, 금지 스타일을 고정한다.
- Sprite는 Pixels Per Unit, pivot, packing tag 또는 atlas, compression 기준을 명시한다.
- UI는 Canvas Scaler, safe area, smallest target resolution, Korean text length를 확인한다.
- 3D는 scale, origin, material naming, collider/proxy, LODGroup, GLB/FBX import setting을 확인한다.
- 에셋은 manifest stable ID로 참조하고 승인 전 임시 파일 경로를 prefab/scene에 고정하지 않는다.
- visual-qa는 Game view 스크린샷, 모바일/최소 해상도, 바쁜 전투 화면 증거를 남긴다.

## 코드 컨벤션 (Unity 전용 · 게임성 검증의 전제)
- **어셈블리 분리(핵심)**: 전투/런 로직은 `Game.Core` 어셈블리(asmdef, **UnityEngine 미참조**)에 순수 C#으로 둔다.
  MonoBehaviour·렌더·입력은 `Game.Unity` 어셈블리가 담당하고 Core를 참조한다.
  → 이렇게 해야 Core만 떼어 `dotnet`/EditMode로 **헤드리스 몬테카를로**가 돌다(balance-sim 전제).
- **밸런스 수치는 한 곳에**: ScriptableObject(에디터 편집용) ↔ 순수 C# 데이터(Core용)로 동기화하되, 로직에 하드코딩 금지.
- **결정론적 RNG**: Core가 시드 주입형 RNG를 받는다(`System.Random(seed)` 또는 커스텀). 재현·비교 가능.
- 씬/프리팹/머티리얼 등 에디터 자산은 developer가 Unity MCP로 다룬다(텍스트로 손대지 않는다).
- Git LFS 사용, Unity용 `.gitignore`(Library/, Temp/, Logs/, Build/ 제외).

## 게임성 성공 지표 (기획에서 채움)
- 목표 승률 / 평균 런·전투 길이 / 전투당 의미 있는 선택 / 사망 분포 / 픽률 편중 / (해당 시)회복 예산: <값 또는 추정>


## 라이브 서비스 트랙 (core 게임성 통과 후에만 진입)
> **전제: 파이프라인 4번(게임성 검증)이 통과해야 시작.** 재미없는 게임에 수익화를 붙이지 않는다.
8. **메타/수익화 설계 + 경제 지표 정의** (`meta-economy-designer`)
   - 성장 구조·재화 원장·수익화(가챠+광고+F2P)·리텐션 사이클.
   - 게이트: 근거 없는 수치 0 · 무과금 진행 가능(F2P fairness) · 다크패턴 없음 · 확률 공개 등 컴플라이언스.
9. **경제 검증** (`meta-economy-designer` + `econ-sim`)
   - 코호트 시뮬로 리텐션·재화수지·전환율·LTV·무과금 완주율을 목표와 대조. 미달 시 8번으로 되돌림(반복 루프).
10. **구현**(`developer`) → **정확성 QA**(`qa`).
> 경제 검증(9, 지속가능/공정) ≠ 게임성 검증(4, 재미) ≠ QA(정확성).

## 파이널 폴리싱 (출시 전 마지막)
P2. **2차 폴리싱 — 파이널 연출 패스** (`polish` · artist+developer) — 전체 UI/전투 연출 완성·일관성, 성능(목표 프레임), 접근성(모션 감소 옵션). 게이트: 프레임 목표 · 모션 감소 옵션 · 연출 일관성 · 사람 최종 사인오프.


## 경제 성공 지표 (라이브 서비스 · meta-economy-designer가 채움)
- 리텐션: D1 <값> / D7 <값> / D30 <값>
- 무과금 완주: F2P 코호트 핵심 콘텐츠 완주율·소요 <값>
- 재화 수지: 소스−싱크 균형(인플레 상한) <값>
- 가챠: 기대 시행·천장 도달률·확률 공개 일치 <값>
- 수익화: 전환율(payer%) / ARPPU / (참고)LTV <값>
- 광고: 시청율·빈도 상한 <값>
> 컴플라이언스: 확률형 아이템 확률 공개(지역별 법적 의무) 확인. 실제 출시 전 법률 검토 필요.

## 검증 방법
- 정확성: Unity Test Framework(NUnit) EditMode/PlayMode + 콘솔 에러 0. Unity MCP로 테스트 실행.
- 게임성: `balance-sim` — `Game.Core`를 dotnet 콘솔/EditMode로 N판 시뮬 → 지표 대조. (상세: balance-sim/references/unity-headless-sim.md)

## 권장 MCP
- **Unity MCP**(CoplayDev/unity-mcp 또는 IvanMurzak/Unity-MCP) — 에디터/런타임/테스트 제어.
- Blender MCP — 3D 에셋. GitHub/Linear/Notion — 코드·트래커·문서.

## 사람(당신)의 승인 지점
- 기획/게임성 지표 확정 · 게임성 검증 통과(본구현 착수) · 어셈블리/폴더 구조 승인 · 머지 · 아트 시안 선택 · 폴리싱(P1/P2) 사인오프
