# 베기 v4 — 제작된 모션으로 제어 입력 교체

## 주장

v3의 절차적으로 만든 베기는 사람이 베는 동작처럼 보이지 않는다는 사용자 피드백으로 반려됐다. v4는 Quaternius의 제작된 검술 클립을 Blender에서 렌더한 후 SCAIL-2로 기존 판타지 캐릭터에 전이했다. 모션캡처 자료라고 주장하지 않는다. 결과는 concept이며 완료된 게임용 애니메이션이 아니다.

## 증거

- 대상 HEAD: `48413a5` + 작업 트리 변경.
- 원본: [제작자 공식 안내](https://quaternius.com/packs/universalanimationlibrary.html), [제작자의 OpenGameArt 배포](https://opengameart.org/content/universal-animation-library).
- 다운로드: `out/sprite-lab/vendor/quaternius/library.zip`. 포함된 License.txt는 CC0-1.0. 최신 2026 배포본과 동일한 수정판인지는 확인하지 않았다.
- 원본 GLB SHA-256: `1b7bf67866360665426bb99e4c71bd619f19b408453c24e30f0c3071601eee5c`.
- 클립: `Sword_Attack_RM`, 원본 24FPS / 0~36.8, 약 1.533초. 25프레임을 15.652FPS로 재생한다.
- 모션·손·검 좌표·카메라: `out/sprite-lab/action-slash-v4-driver/motion.json`; Blender 파일도 같은 폴더에 보존했다.
- 실행 그래프·프롬프트·모델 manifest 링크·참조 해시는 `out/sprite-lab/action-slash-v4-scail/`에 기록했다. 생성 소요시간: 98.573455500009초.
- 원본과 변환본 contact sheet: `action-slash-v4-control-review/contact.png`, `action-slash-v4-review/contact.png`.
- 원시 검수 출력: `out/sprite-lab/action-slash-v4-qa.txt` 및 JSON. 기술 검사 exit 0; 시각 결함 포함 최종 exit 1.
- 플러그인 검증 원시 출력: `out/sprite-lab/action-slash-v4-plugin-validation.txt`, exit 0.

## 기준

준비 → 몸통 회전 → 전방 대각선 베기 → 회복의 전신 움직임을 원본에서 확인한다. 25개 동일 크기 RGBA 프레임, 원본 타이밍, 프리뷰 접근 가능 여부를 기술 검사한다. 기술 통과는 사람처럼 보이는 동작이나 장비 유지의 증거로 사용하지 않는다.

## 공백

사용자 모션 승인 없음. 실제 게임 화면, 공격 판정·회복 시간·입력 대응, 방향 반전, 반복 경계 품질은 검증하지 않았다. HTTP/JS 검사는 실제 브라우저 조작 검수가 아니다.

## 잔여 위험

변환본 9~13번에서 바지와 부츠 색이 흰색으로 바뀌고 형태 디테일이 무너진다. 원본의 몸통 회전 중 후면이 드러나는 구간을 모델이 안정적으로 유지하지 못한다. 단순 밝기 보정으로 손실된 형태를 복원할 수 없다. 검의 정확한 길이·손 부착 유지도 승인 전 점검 대상이다. 찌르기 v3의 칼끝 잘림은 그대로 미해결이다. 다음 작업은 원본 제어 모션에 대한 사람 평가와, 전면·후면 캐릭터 디자인을 유지하는 전이 방식 개선이다.
