// 실제 게임 테이블에서 공급·필수 소비량·잠금·선후 관계를 가져온다.
// require는 모두 소비되는 필수 요구의 합계다. 재사용 키나 선택 분기를 합치지 않는다.
// locks.needs는 AND 조건이며 시작점은 needs: []로 명시한다.
// 제공하지 않은 축은 미측정으로 남는다. 빈 모델은 통과하지 않는다.
export const PLACEHOLDER = true;
export function model() {
  return {
    supply: { damage: 600 },
    require: [{ id: 'boss', needs: { damage: 500 } }],
    locks: [{ id: 'key', needs: [] }, { id: 'door', needs: ['key'] }],
    order: [['tutorial', 'boss']],
  };
}
