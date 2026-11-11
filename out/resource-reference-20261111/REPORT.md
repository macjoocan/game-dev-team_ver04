# 로컬 액션 레퍼런스 조사 — 2026-11-11

## 주장

은발 캐릭터의 새 베기 포즈를 만드는 데 참고할 자료가 있다.
첫 실험에는 Soulbound의 동쪽 검 공격과 WizardOfLegend의 기사 포즈를 추천한다.
타이밍 데이터 구조는 CatGunner, 방향별 공격 곡선은 OnceUponATower가 후속 후보다.
이번 작업은 자료 조사다. 새 스프라이트 생성과 게임 반영은 하지 않았다.

## 증거

대상 커밋: `bba068ca03a2511c47b4b2a96bc8d97190e41419`.
`D:\99.기타`의 `out_` 폴더 32개에서 파일 목록과 ZIP 내부 목록을 조사했다.
DKBI 두 폴더는 대규모 하위 번들 탐색을 생략하고 최상위 파일만 확인했다.
나머지 목록의 수량에는 압축본과 풀린 파일이 중복된다. 고유 에셋 수가 아니다.

| 후보 | 직접 확인한 자료 | 활용 |
|---|---|---|
| Soulbound | `sprite_metadata.json`의 `sDCMobResurrectedPioneerSword_Attack_E`: 5프레임, 원점 (48,80), 캔버스 96×96, speed 30 / unit 0 | 검을 들고 내리치는 포즈와 큰 베기 궤적. E/N/S/W 공격 목록도 존재 |
| WizardOfLegend | `WizardOfLegend_sprites/Sprite/KnightAttack0.png`~`4.png`, `KnightForehand0/1`, `KnightLunge0`, `KnightCharge0/1` | 공격 준비·상체 회전·휘두르기·돌진의 자세 차이 |
| CatGunner | `CatGunner_assets.zip`의 `spine/*.txt` 13개가 Spine 4.1.24 JSON. 각 자료에 Attack/Busking/Idle/Walk가 있음 | 관절별 키 시간·보간·공격 이벤트 구조. 검 캐릭터의 관절을 그대로 대응할 수 있다는 뜻은 아님 |
| OnceUponATower | `_reference/animations_decoded/`에 Attack_left/right/Up/Down, Run, hit 등 | 공격 방향별 곡선 분석. 확인한 Attack 표본은 sample_rate 60, stop 1.4666666984558105 |
| SlayerLegend | `Demon_AttackStyle_1_01/02/03` 시트와 SlashBasic 계열 | 확인한 표본은 몸동작보다 베기·폭발 이펙트 형태 참고에 적합 |
| IdleMoonRabbit | `IdleMoonRabbit_assets.zip`에 Spine `.skel`·`.atlas`, SwordBoss 관련 파일 | 후속 관절 모션 후보. 바이너리 내부 모션은 아직 해석하지 않음 |

CatGunner의 `spine/BlackCat.txt`를 직접 읽었다.
Attack에는 몸통·꼬리·얼굴 등의 시간별 값이 있으며 `Attack` 이벤트 시간은 0.1667초다.
이벤트 이름과 시점의 존재를 확인한 것이며 실제 게임의 피해 적용 시점까지 검증한 것은 아니다.

`reference-contact.png`에서 WizardOfLegend 기사 포즈 10장, Soulbound 검 공격 5장,
SlayerLegend 시트 3장을 직접 확인했다. 원본 픽셀을 바꾸지 않고 검토용으로 확대·배치했다.
Soulbound 표본은 잘린 이미지 영역을 나란히 놓은 것으로, 원점 복원 후의 동작 재생 화면은 아니다.
WizardOfLegend 표본의 붉은 바탕과 회색 표현은 현재 추출 이미지 상태다. 완성 게임 화풍으로 해석하지 않는다.

근거 파일: `inventory.json`, `scan.stdout.log`, `findings.json`, `reference-contact.png`.

## 기준

파일 이름만으로 동작 품질이나 완전성을 확정하지 않는다.
이미지의 자세, 프레임 순서 근거, 원점, 시간값, 이벤트를 각각 구분한다.
Soulbound는 메타데이터 프레임 배열을 사용했다. WizardOfLegend는 이름의 숫자 순서다.
정렬된 파일 목록이 원작의 실제 재생 순서·재생 시간과 같다고 단정하지 않는다.

## 공백

- Soulbound의 저장 speed는 실행 중 속도·공격 속도 보정과 다를 수 있다. sequence 본문도 해석하지 않았다.
- WizardOfLegend의 해당 클립별 재생 시간과 타격 이벤트는 확보하지 않았다.
- OnceUponATower의 곡선 path 해시와 관절 계층 연결, 실제 렌더링은 검증하지 않았다.
- IdleMoonRabbit 바이너리 Spine는 이름·존재만 확인했다.
- 전체 이미지 육안 검수와 게임 플레이 대조는 하지 않았다.
- `out_goodshunt/_reference/failed_hierarchy_memory.zip`과 `out_pixelflow/PixelFlow_hierarchy.zip`은 유효 ZIP으로 읽히지 않았다.

## 잔여 위험과 다음 작업

추천은 Soulbound 검 공격 5장을 원점에 맞춰 복원하고, 핵심 자세를 은발 캐릭터용 가이드로 만드는 것이다.
WizardOfLegend의 준비 자세·상체 회전을 비교 후보로 둔다.
이후 준비·베기·회수 시간을 따로 조절해 같은 캐릭터와 같은 화면 크기에서 A/B 비교한다.
원작의 포즈와 시간 구조를 참고하되 우리 캐릭터의 체형·검 길이에 맞춰 다시 설계한다.
이번에 읽은 D 드라이브 원본은 수정하지 않았고, 조사 결과는 로컬 `out/`에만 저장했다.
