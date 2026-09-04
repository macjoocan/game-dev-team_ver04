// personas.mjs - 플레이어 페르소나. **평균 1명을 시뮬하면 안 되는 이유가 여기 있다.**
//
// "평균 플레이어"는 존재하지 않는다. 무과금 그라인더와 하이브리드 과금자는 같은 경제 안에서
// 완전히 다른 곡선을 그린다 - 업계 모델링에서 하이브리드가 무과금 대비 파워 +60% 수준이
// 나오는 게 흔하다. 평균으로 뭉개면 그 격차가 사라지고, "무과금도 완주 가능한가"라는
// 게이트 질문 자체에 답할 수 없다.
//
// 각 페르소나는 **행동 파라미터의 묶음**이다. 여기 숫자를 게임 데이터로 맞춰라.

/**
 * @typedef {object} Persona
 * @property {string}  name          표시 이름
 * @property {string}  segment       'f2p' | 'light' | 'hybrid' | 'whale' - 공정성 판정에 쓴다
 * @property {number}  share         전체 유저 중 비중 (합이 1 이 되게)
 * @property {number}  sessionsPerDay 하루 접속 횟수
 * @property {number}  minutesPerSession 세션 길이
 * @property {number}  adWatchRate   제안된 보상형 광고를 보는 비율 (0~1)
 * @property {number}  spendPerWeek  주당 과금액 (통화 단위는 프로젝트가 정한다)
 * @property {number}  grindTolerance 반복 인내도 (0~1). 낮으면 진행이 막히면 빨리 이탈
 * @property {number}  baseChurnPerDay 하루 이탈 기본 확률 (진행 막힘으로 가중된다)
 */

/** @type {Persona[]} */
export const PERSONAS = [
  {
    name: '무과금 그라인더',
    segment: 'f2p',
    share: 0.90,
    sessionsPerDay: 2.0,
    minutesPerSession: 12,
    adWatchRate: 0.65,      // 무과금은 광고를 가장 많이 본다 - 그게 유일한 가속 수단이다
    spendPerWeek: 0,
    grindTolerance: 0.75,
    baseChurnPerDay: 0.035,
  },
  {
    name: '소과금',
    segment: 'light',
    share: 0.075,
    sessionsPerDay: 2.5,
    minutesPerSession: 15,
    adWatchRate: 0.35,
    spendPerWeek: 3,
    grindTolerance: 0.6,
    baseChurnPerDay: 0.022,
  },
  {
    name: '하이브리드 (광고+과금)',
    segment: 'hybrid',
    share: 0.02,
    sessionsPerDay: 3.5,
    minutesPerSession: 20,
    adWatchRate: 0.5,
    spendPerWeek: 15,
    grindTolerance: 0.5,
    baseChurnPerDay: 0.015,
  },
  {
    name: '고래',
    segment: 'whale',
    share: 0.005,
    sessionsPerDay: 4.0,
    minutesPerSession: 25,
    adWatchRate: 0.1,       // 돈으로 해결하므로 광고를 안 본다
    spendPerWeek: 120,
    grindTolerance: 0.35,
    baseChurnPerDay: 0.012,
  },
];

/** 비중 합이 1 이 아니면 정규화한다(경고와 함께). */
export function normalizedShares(personas = PERSONAS) {
  const sum = personas.reduce((a, p) => a + p.share, 0);
  return { personas: personas.map((p) => ({ ...p, share: p.share / sum })), sum };
}
