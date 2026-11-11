# 스프라이트 입력 검사·잘림 경고·모션 관찰

## [주장]

2026-11-11 설계 검토 뒤 사용자가 추천 범위로 진행하도록 요청했다.
이번 구현 범위는 공통 입력 검사, 잘림 경고, 모션 관찰이다.
모션 품질의 자동 합격선이나 차단 등급은 도입하지 않는다.

## [증거]

- `skills/sprite-pipeline/scripts/sprite-qa.mjs`: 기존 검사에 경계 접촉 경고를 추가한다.
- `skills/sprite-pipeline/scripts/motion-qa.mjs`: 동작을 명시해서 윤곽 변화를 관찰한다.
- `skills/sprite-pipeline/scripts/lib-sprite-sequence.mjs`: 입력·알파·정렬·측정 설정을 공유한다.
- `test/sprite-motion-qa.test.mjs`: 입력 오류, 경계 접촉, 종료 코드와 윤곽 지표의 한계를 검증한다.

실행 명령과 결과 필드는 [sprite-pipeline 스킬](../../skills/sprite-pipeline/SKILL.md)을 따른다.
로컬 실행 증거는 `out/sprite-motion-implementation-20261111/`에 보관한다.
이 문서에 파일을 나열한 것만으로 테스트 통과를 주장하지 않는다.

### 이번 실행 결과

대상은 `4ceb944` 위의 미커밋 변경이다.
검사한 소스의 SHA-256과 명령·종료 코드는 [실행 기록](../../out/sprite-motion-implementation-20261111/validation.json)에 있다.
원시 로그는 아래 링크로 확인한다. 표는 결과 요약이며 원시 로그를 대신하지 않는다.

| 검사 | 결과 | 원시 출력 |
|---|---|---|
| 신규 검사·기존 모션 도구·은발 스테이지 테스트 | 45개 통과, 실패·생략 0개 | [테스트 로그](../../out/sprite-motion-implementation-20261111/tests.stdout.log) |
| 플러그인 구조와 소스·미러 일치 | 통과(exit 0) | [검사 로그](../../out/sprite-motion-implementation-20261111/plugin.stdout.log) |
| 은발 C 26장 스프라이트 QA | 형태 미달(exit 1), 경계 접촉 없음 | [현재](../../out/sprite-motion-implementation-20261111/silver-c-sprite.stdout.log) · [변경 전](../../out/sprite-motion-implementation-20261111/silver-c-before.stdout.log) |
| 비교용 rigid 8장 스프라이트 QA | 형태 미달(exit 1), 경계 접촉 없음 | [현재](../../out/sprite-motion-implementation-20261111/rigid-sprite.stdout.log) · [변경 전](../../out/sprite-motion-implementation-20261111/rigid-before.stdout.log) |
| 두 시퀀스의 모션 관찰 | 관찰 완료(exit 0) | [은발 C](../../out/sprite-motion-implementation-20261111/silver-c-motion.stdout.log) · [rigid](../../out/sprite-motion-implementation-20261111/rigid-motion.stdout.log) |
| 프로젝트 공통 아트 게이트 | 참조 폴더 없음으로 측정 불가(exit 3) | [실행 로그](../../out/sprite-motion-implementation-20261111/art-gate.stdout.log) |

두 실제 시퀀스의 형태 실패 항목·대상 프레임·메시지는 변경 전과 같다.
변경 전 코드는 `4ceb944`에서 읽었다. 실행에 필요한 import 경로만 바꿨다.
은발 C의 최소 여백은 위 46px, 아래 48px, 왼쪽 89px, 오른쪽 24px다.
새 모션 도구의 `liftRange`는 은발 C **0.3187374996902182**, rigid **0.2022484680418839**다.
예전 탐침의 알파 `>128`을 `>=128`로 맞췄으므로 당시 수치와 조금 다르다.
이 수치로 두 모션의 품질 순위를 판정하지 않는다.

공통 아트 게이트는 변경 전에도 `samples/hex-blender-sprite/walk`가 없어 측정 불가였다.
현재 설치된 플러그인 0.52.0은 갱신하지 않았다. 이번 검증은 저장소 소스로 실행했다.

## [기준]

피사체는 알파 128 이상, 배경은 알파 20 미만으로 정의한다.
프레임마다 피사체가 있어야 하고 배경은 2% 이상이어야 한다.
빈 이미지나 배경이 부족한 프레임을 버리고 나머지만 계산하지 않는다.
입력 오류가 있으면 exit 3이며 잘림·모션 결과는 생성하지 않는다.
JSON에는 입력 오류와 프레임 정보를 남긴다.

잘림 의심은 경고만 낸다. 일부 프레임만 닿는 경우와 전부 닿는 경우를 구분한다.
명시적인 `--tight-crop`은 해당 방향에 모든 프레임이 닿을 때만 면제한다.
경고는 기존 색·형태·아틀라스 실패를 면제하지 않는다.

`liftRange`는 하단 윤곽 변화량이다. 발만 추적하지 않는다.
각 프레임의 피사체 폭을 64구간으로 나눈다.
빈 구간은 0으로 채우지 않으며 절반 이상 프레임에서 값이 있는 구간만 쓴다.
프레임을 누락시키는 것과 빈 구간을 제외하는 것은 다르다.
후자는 측정 정의이며 구간별 원자료와 유효 구간 수를 함께 남긴다.

## [공백]

설계의 라벨 수집·중복 제거·보정 도구·자동 등급 승격은 이번 범위에 없다.
집의 잘림 자료 8묶음 중 7묶음은 현재 PC에 없다.
따라서 집에서 기록한 전체 오탐·누락 성능을 재현했다고 주장하지 않는다.
실제 발 접지와 공격 타이밍, 사람의 모션 선호도도 자동 판정하지 않는다.

## [잔여 위험]

- 망토가 움직여도 `liftRange`가 커진다. 높은 값이 좋은 걷기를 뜻하지 않는다.
- 알파 20 미만을 배경으로 간주해도 실제 합성에서 번짐이 남을 수 있다.
- 캔버스 경계에 닿지 않는 내부 손상이나 이미 잘린 원본은 검출하지 못한다.
- 배경 2% 조건은 입력 제한이다. 여백이 거의 없는 정상 컷도 측정을 거부할 수 있다.
- 빈 피사체·크기 혼합은 기존 exit 1에서 exit 3으로 바뀐다.
- 색 분포의 알파 하한이 200에서 128로 바뀐다. 반투명 입력의 이전 수치와 직접 비교하지 않는다.
- 플러그인 설치본은 별도 스냅샷이다. 소스 변경만으로 설치본이 갱신되지 않는다.
