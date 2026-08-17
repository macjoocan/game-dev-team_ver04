# Unity 헤드리스 balance-sim 설계 스케치

목적: Unity 프로젝트에서도 전투/런을 **에디터 없이 수천 판** 돌려 게임성 지표(G1~G13류)를 뽑는다.
핵심은 단 하나 — **전투 로직을 UnityEngine에서 완전히 떼어낸다.**

## 1. 어셈블리 분리 (가장 중요)
```
Assets/
├─ Game.Core/                 ← 순수 C#. UnityEngine 참조 금지(결정론적 로직)
│   ├─ Game.Core.asmdef        (noEngineReferences: true)
│   ├─ Combat/  (State, Card, Resolver, StatusEffect …)
│   ├─ Run/     (RunState, NodeMap, RewardTable …)
│   ├─ Data/    (BalanceData 순수 C# 구조체/POCO)
│   ├─ Rng/     (IRng, SeededRng)
│   └─ Ai/      (IPolicy, RandomPolicy, HeuristicPolicy)
├─ Game.Unity/                ← MonoBehaviour·렌더·입력. Game.Core 참조
│   └─ Game.Unity.asmdef       (references: ["Game.Core"])
└─ Game.Sim/                  ← 헤드리스 러너(EditMode 테스트 or 콘솔)
    └─ Game.Sim.asmdef         (references: ["Game.Core"], editor/test only)
```
`Game.Core.asmdef` 예시:
```json
{ "name": "Game.Core", "noEngineReferences": true, "autoReferenced": true }
```
→ Core는 `UnityEngine`을 못 쓰므로 자연히 렌더/입력/시간에 의존하지 않는 순수 로직이 된다.

## 2. 밸런스 데이터 동기화
- 에디터 편집용은 ScriptableObject로 두되, **Core는 순수 C# POCO만** 안다.
- `BalanceData ToPoco()` 어댑터를 Game.Unity(또는 에디터 코드)에 두고, Core는 POCO를 입력으로 받는다.
- 시뮬은 ScriptableObject 없이 POCO를 JSON/코드로 로드 → CI·콘솔에서도 동작.

## 3. 결정론적 RNG
```csharp
public interface IRng { int Next(int maxExclusive); double NextDouble(); }
public sealed class SeededRng : IRng {           // 재현·비교의 핵심
    readonly System.Random r; public SeededRng(int seed){ r = new System.Random(seed); }
    public int Next(int m)=>r.Next(m); public double NextDouble()=>r.NextDouble();
}
```
Core의 모든 무작위는 주입된 `IRng`로만. `UnityEngine.Random` 직접 호출 금지(비결정·비헤드리스).

## 4. AI 정책 (상·하한 측정)
```csharp
public interface IPolicy { Move Choose(BattleState s); }
public sealed class RandomPolicy   : IPolicy { /* 무작위 → 하한(P-R) */ }
public sealed class HeuristicPolicy : IPolicy { /* 우선도·타입상성 → 목표(P-H) */ }
```

## 5. 러너 — 두 가지 실행 경로
### (A) EditMode 테스트 (Unity 안, CI 쉬움) — 권장
```csharp
[Test] public void BalanceSim_1000Runs() {
    var agg = new MetricsAggregator();
    for (int seed = 0; seed < 1000; seed++) {
        var sim = new RunSimulator(BalanceData.Default(), new SeededRng(seed), new HeuristicPolicy());
        agg.Add(sim.PlayFullRun());
    }
    var report = agg.Report();                 // 승률·런길이·픽률·사망분포…
    System.IO.File.WriteAllText("sim-report.json", report.ToJson());
    Assert.IsTrue(report.WinRate is >=0.45 and <=0.55, $"승률 {report.WinRate:P0} 목표 이탈");
}
```
CLI 실행:
```
"<Unity>" -batchmode -projectPath . -runTests -testPlatform EditMode -testResults results.xml
```
### (B) 순수 dotnet 콘솔 (가장 빠름, Unity 불필요)
`Game.Core`를 별도 .csproj로도 컴파일되게 두면(에디터 밖) `dotnet run`으로 수만 판을 초 단위에 돌린다.
가장 빠른 반복 루프. Core가 UnityEngine 무참조이므로 그대로 참조 가능.

## 6. 지표 산출 & 판정
`MetricsAggregator` → `지표 | 목표 | 실측 | 판정(충족/미달/과다)` 표 + JSON.
미달이면 "어떤 수치를 얼마로" 조정 가설을 붙여 game-designer/기획 단계로 반환(임의 수정 금지).

## 7. 웹 대비 차이 요약
| | 웹(card_rog) | Unity |
|---|---|---|
| 로직 분리 | DOM과 함수 분리 → node 실행 | asmdef `Game.Core`(UnityEngine 무참조) |
| 러너 | `node sim.js` | dotnet 콘솔 or EditMode 테스트 |
| RNG | 시드형 JS | 주입 `IRng`(UnityEngine.Random 금지) |
| 데이터 | JS 객체 | POCO ↔ ScriptableObject 어댑터 |
개념·지표·게이트는 동일하다. 바뀌는 건 실행 메커니즘뿐.
