// economy.mjs - **프로젝트가 구현하는 계약.** 하네스가 유일하게 경제를 만지는 지점이다.
//
// 규칙은 balance-sim 의 game.mjs 와 같다:
//   1) 순수 함수. 난수는 인자로 받은 rng 만 쓴다(Math.random() 금지).
//   2) 재화·확률·가격은 config 로 받는다. 경제 원장을 import 해서 넘기는 게 정석이다.
//   3) 페르소나의 행동 파라미터를 실제로 반영해라 - 안 쓰면 페르소나 비교가 무의미해진다.

/**
 * **자리표시자 표시.** 실제 경제 로직으로 바꿨으면 false 로 내려라.
 * true 인 동안 econ-run.mjs 는 어떤 수치가 나와도 판정을 측정 불가로 강제한다.
 */
export const PLACEHOLDER = true;

/**
 * 한 명의 플레이어를 days 일간 시뮬레이션한다.
 *
 * @param {object} ctx
 * @param {Function} ctx.rng      시드 고정 난수
 * @param {object}   ctx.config   경제 원장 (소스/싱크·가격·확률·천장)
 * @param {object}   ctx.persona  personas.mjs 의 Persona
 * @param {number}   ctx.days     시뮬 일수
 * @returns {{
 *   activeDays: number[],   // 접속한 일차 목록 (1-based). 리텐션 계산에 쓴다
 *   churnDay?: number,      // 이탈한 일차. 끝까지 남으면 생략
 *   spend: number,          // 누적 과금액
 *   progress: number,       // 최종 진행도 (파워·레벨 등 - 단위는 프로젝트가 정한다)
 *   completedDay?: number,  // 핵심 콘텐츠 완주 일차. 못 하면 생략
 *   earned: number,         // 누적 재화 획득 (소스)
 *   spentCurrency: number,  // 누적 재화 소비 (싱크)
 *   adsWatched: number,
 *   blockedDays: number,    // 재화가 없어 진행하지 못한 일수 (페이월 지표)
 * }}
 */
export function simulatePlayer({ rng, config, persona, days }) {
  // ─────────────────────────────────────────────────────────────────────────
  // TODO: 실제 경제 로직으로 바꿔라. 아래는 하네스가 도는지 보는 자리표시자다.
  // ─────────────────────────────────────────────────────────────────────────
  const activeDays = [];
  let progress = 0;
  let earned = 0;
  let spentCurrency = 0;
  let balance = 0;
  let adsWatched = 0;
  let spend = 0;
  let blockedDays = 0;
  let completedDay;
  let churnDay;

  for (let day = 1; day <= days; day++) {
    // 이탈 판정: 진행이 막히면 인내도에 반비례해 이탈 확률이 오른다
    const frustration = blockedDays > 0 ? (1 - persona.grindTolerance) * config.frustrationWeight : 0;
    if (rng.chance(persona.baseChurnPerDay + frustration)) { churnDay = day; break; }

    activeDays.push(day);

    // 소스: 플레이 보상 + 광고
    const sessions = Math.max(1, Math.round(persona.sessionsPerDay));
    let dayEarn = sessions * persona.minutesPerSession * config.currencyPerMinute;
    if (rng.chance(persona.adWatchRate)) { dayEarn += config.adReward; adsWatched++; }

    // 과금 -> 재화
    const daySpend = persona.spendPerWeek / 7;
    spend += daySpend;
    dayEarn += daySpend * config.currencyPerMoney;

    earned += dayEarn;
    balance += dayEarn;

    // 싱크: 다음 강화를 살 수 있으면 산다(탐욕 구매)
    const cost = config.upgradeBaseCost * Math.pow(config.upgradeCostGrowth, progress);
    if (balance >= cost) {
      balance -= cost;
      spentCurrency += cost;
      progress++;
    } else {
      blockedDays++;
    }

    if (completedDay === undefined && progress >= config.completionProgress) completedDay = day;
  }

  return { activeDays, churnDay, spend, progress, completedDay, earned, spentCurrency, adsWatched, blockedDays };
}

/**
 * 경제 원장. **프로젝트 데이터로 교체해라.**
 *
 * 정석: 기존 경제 원장을 import 해서 그대로 내보낸다.
 *   import { ECONOMY } from '../src/data/economy.js';
 *   export const defaultConfig = ECONOMY;
 */
export const defaultConfig = {
  currencyPerMinute: 8,
  adReward: 40,
  currencyPerMoney: 900,
  upgradeBaseCost: 220,
  upgradeCostGrowth: 1.22,
  completionProgress: 30,
  frustrationWeight: 0.05,
};
