// game.mjs - **프로젝트가 구현하는 계약.** 하네스가 유일하게 게임을 만지는 지점이다.
//
// 규칙 세 가지:
//   1) 순수 함수로 유지한다. 렌더링·DOM·엔진 API 를 부르지 않는다(헤드리스여야 수천 판이 돈다).
//   2) 난수는 **반드시 인자로 받은 rng 만** 쓴다. Math.random() 을 부르면 재현이 깨진다.
//   3) 밸런스 수치는 config 로 받는다. 여기에 숫자를 박으면 스윕이 불가능하다
//      (프로젝트 밸런스 데이터 테이블을 import 해서 넘기는 게 정석이다).

/**
 * **자리표시자 표시.** simulateRun 을 실제 런 로직으로 바꿨으면 `false` 로 내려라.
 *
 * true 인 동안 run.mjs 는 어떤 수치가 나와도 판정을 **측정 불가**로 강제한다.
 * 이게 없으면 자리표시자가 만든 "승률 3.7%"가 게이트 리포트에 미달로 올라가고,
 * 기획이 멀쩡한 수치를 흔들기 시작한다 - 원인은 게임이 아니라 하네스인데.
 */
export const PLACEHOLDER = true;

/**
 * 한 판을 끝까지 시뮬레이션한다.
 *
 * @param {object} ctx
 * @param {Function} ctx.rng     시드 고정 난수 (rng(), rng.int(n), rng.pick(a), rng.chance(p))
 * @param {object}   ctx.config  밸런스 수치 (데이터 테이블)
 * @param {object}   ctx.policy  봇 정책 { name, choose(state, options, rng) }
 * @returns {{
 *   win: boolean,          // 승패. 필수
 *   length: number,        // 런/전투 길이 (턴·웨이브·분 - 단위는 프로젝트가 정한다)
 *   exitStage?: string,    // 끝난 지점 (스테이지·층 이름). 이탈 분포에 쓴다
 *   choices?: number,      // 의미 있는 선택 횟수 (선택 밀도)
 *   picks?: string[],      // 고른 선택지 ID 목록 (픽률 편중 계산에 쓴다)
 *   deathAt?: number,      // 사망 시점 (length 단위). 승리면 생략
 *   extra?: object,        // 프로젝트 고유 지표
 * }}
 */
export function simulateRun({ rng, config, policy }) {
  // ─────────────────────────────────────────────────────────────────────────
  // TODO: 여기에 게임의 런 로직을 넣어라. 아래는 하네스가 도는지 확인하는 자리표시자다.
  //       실제 로직으로 바꾸기 전까지 측정치는 **의미가 없다**(측정 불가로 보고해라).
  // ─────────────────────────────────────────────────────────────────────────
  let hp = config.playerHp;
  let stage = 0;
  let choices = 0;
  const picks = [];

  while (hp > 0 && stage < config.stageCount) {
    const options = ['a', 'b', 'c'];
    const chosen = policy.choose({ hp, stage }, options, rng);
    picks.push(chosen);
    choices++;
    hp -= rng.range(config.damageMin, config.damageMax);
    stage++;
  }

  const win = hp > 0;
  return {
    win,
    length: stage,
    exitStage: 'stage' + stage,
    choices,
    picks,
    deathAt: win ? undefined : stage,
  };
}

/**
 * 밸런스 수치. **프로젝트 데이터 테이블로 교체해라.**
 *
 * 정석: 기존 밸런스 테이블을 import 해서 그대로 내보낸다.
 *   import { BALANCE } from '../src/data/balance.js';
 *   export const defaultConfig = BALANCE;
 *
 * 아래 값은 자리표시자 게임을 돌리기 위한 것이고, 실제 수치가 아니다.
 */
export const defaultConfig = {
  playerHp: 100,
  stageCount: 10,
  damageMin: 5,
  damageMax: 20,
};
