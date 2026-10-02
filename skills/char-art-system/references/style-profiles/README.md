# 상용 게임 화풍 프로필 — 측정값 라이브러리

상용 게임 스프라이트를 `dot-rules.mjs` 로 재서 뽑은 **수치**다.
**스프라이트도 팔레트도 들어 있지 않다** — 분위수만 있다.

```bash
node ../../scripts/dot-rules.mjs --list                          # 목록
node ../../scripts/dot-rules.mjs <우리결과> --against stardewvalley   # 이름으로 대조
```

## 가장 중요한 발견 — "상용 도트의 규칙"이라는 단일 기준은 없다

처음에는 Wizard of Legend **하나만** 재고 그걸 "상용 기준"이라 불렀다.
13개를 재보니 **게임마다 다르다.** 특히 외곽선:

| | 외곽선 어두움 |
|---|---|
| Wizard of Legend | **-0.007** (거의 없음) |
| Stardew Valley | **-0.203** (확실히 어둡다) |

같은 "상용 도트"인데 정반대다. **목표 게임을 정하고 그 프로필에 맞춰야 한다.**

## 색군당 명암 단계가 도트와 HD 를 가른다

| 부류 | 단계 | 게임 |
|---|---|---|
| **dot** | 2~26 | 20minutestilldawn(2) · stardewvalley(4) · wizardoflegend(14) · slayerlegend(26) |
| **hd2d** | 82~606 | idlemoonrabbit(82) · ninjaskyfight(98) · randomdicewars(110) · royalmatch(297) · clashofcritters(300) · royalkingdom(351) · catgunner(408) · cookierun(415) · royalsmash(606) |

**경계가 26 과 82 사이에서 깨끗하게 갈린다.** 한 색상 계열에 몇 단계를 쓰느냐가
도트냐 아니냐를 정한다 — 색 수나 해상도가 아니다.

프로필 JSON 의 `class` 필드가 이 분류다.

## 전체 비교 (중앙값)

```
게임              장수  계단cv  평균런  고립런  외곽어둠  외곽색  단색율  색군  단계
wizardoflegend     223   0.647   1.667   0.043   -0.007     13   0.239     5    14
20minutestilldawn  249   0.723   1.901   0.036   -0.094      7   0.361     5     2
stardewvalley      247   0.818   1.984   0.067   -0.203      8   0.505    10     4
royalkingdom       227   0.901   1.743   0.050   -0.101      3   0.898     1   351
cookierun          161   1.027   1.618   0.048    0.000     82   0.088     6   415
catgunner          241   1.206   2.000   0.031   -0.211     29   0.326     5   408
clashofcritters    248   1.219   2.073   0.035   -0.297     46   0.278     5   300
royalsmash         250   1.222   1.957   0.036   -0.071    181   0.070    10   606
idlemoonrabbit     228   1.240   2.306   0.000   -0.013     12   0.675     1    82
ninjaskyfight       55   1.312   1.974   0.043    0.000      7   0.504     6    98
royalmatch         238   1.985   3.094   0.029   -0.123    113   0.097     5   297
slayerlegend       250   2.121   5.818   0.000   -0.046      4   0.776     3    26
randomdicewars     248   3.220   3.608   0.069   -0.296     16   0.455     9   110
```

각 게임 250장 내외 표본. 분위수(p25/median/p75/p95)는 JSON 에 있다.

## 프로젝트에서 고르는 법

1. `--list` 로 부류와 수치를 본다
2. 만들려는 게임과 결이 비슷한 쪽을 고른다 — **눈으로 비교할 레퍼런스가 있으면 그게 제일 빠르다**
3. 프로젝트 `VISUAL_DESIGN.md` 에 목표 프로필 이름을 적는다
4. 산출물마다 `--against <이름>` 으로 대조한다

**O/~/X 는 합격·불합격이 아니다.** X 는 "그 게임과 다르다"일 뿐 화풍 선택일 수 있다.
게이트로 승격할지는 사람이 정한다.

## 프로필을 추가하려면

```bash
node ../../scripts/dot-rules.mjs <그게임_스프라이트폴더> --sample 250 --out <이름>.json
```
`measuredFrom`(로컬 추출 경로)은 지우고 `game` · `class` 필드를 넣어 이 폴더에 둔다.
