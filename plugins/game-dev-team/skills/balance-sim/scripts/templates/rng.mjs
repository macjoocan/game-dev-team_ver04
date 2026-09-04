// rng.mjs - 시드 고정 난수. 재현되지 않는 수치는 게이트 근거가 아니다.
//
// mulberry32: 32비트 상태, 통계 품질 충분, 코드 6줄. Math.random() 을 쓰면 안 되는 이유는
// 하나다 - 같은 시드로 같은 결과가 안 나오면 이전 측정치와 비교할 수 없다.

/** 시드 하나로 [0,1) 난수 함수를 만든다. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n);
  rng.pick = (arr) => arr[rng.int(arr.length)];
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.chance = (p) => rng() < p;
  /** 배열을 제자리 섞기 (Fisher-Yates). */
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return rng;
}

/**
 * 기본 시드 + 판 번호 -> 그 판의 시드.
 *
 * 이게 A/B 비교의 핵심이다. 기능 OFF 와 ON 을 **같은 판 시드 목록**으로 돌리면
 * 게임 자체의 편차가 상쇄돼(공통 난수) 훨씬 적은 판수로 효과를 잡는다.
 * 그래서 run.mjs 는 항상 이 함수로 판 시드를 만든다 - 시드를 즉석에서 뽑지 않는다.
 */
export function runSeed(baseSeed, runIndex) {
  let h = (baseSeed >>> 0) ^ Math.imul(runIndex + 1, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}
