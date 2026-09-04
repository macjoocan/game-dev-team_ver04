// policies.mjs - 봇 정책. 최소 2종으로 상·하한을 본다.
//
// 왜 2종인가: 무작위 봇의 승률은 **하한**, 휴리스틱 봇의 승률은 그보다 위다. 사람은 보통
// 휴리스틱보다 잘한다. 즉 어떤 정책으로 얻은 수치인지 밝히지 않으면 그 승률은 해석할 수 없다.
// 목표 지표도 "휴리스틱 봇 기준 35~55%" 처럼 정책을 붙여 정의해야 한다.
//
// 정책은 (상태, 선택지) -> 선택 함수다. 게임에 맞게 고쳐라.

/** 무작위 선택. 승률의 하한을 준다. */
export const randomPolicy = {
  name: 'random',
  choose(state, options, rng) {
    return rng.pick(options);
  },
};

/**
 * 탐욕적 휴리스틱. 각 선택지를 점수화해 최선을 고른다.
 *
 * TODO: scoreOption 을 게임에 맞게 구현해라. 여기가 비어 있으면 이 정책은 무작위와 같다.
 * 주의: 봇이 기능을 소극적으로 쓰면 측정치는 **하한 추정**이다 - 리포트에 그렇게 적어라.
 */
export const greedyPolicy = {
  name: 'greedy',
  choose(state, options, rng) {
    let best = null;
    let bestScore = -Infinity;
    for (const o of options) {
      const s = scoreOption(state, o) + rng() * 1e-6; // 동점은 무작위로
      if (s > bestScore) { bestScore = s; best = o; }
    }
    return best ?? rng.pick(options);
  },
};

function scoreOption(state, option) {
  // TODO: 게임의 가치 함수. 예) 기대 피해량 - 받을 피해량, 자원 효율 등
  return 0;
}

export const POLICIES = { random: randomPolicy, greedy: greedyPolicy };
