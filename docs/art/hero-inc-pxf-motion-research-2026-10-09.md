# 용사주식회사 PXF·모션 그래픽 영상 조사 — 2026-10-09

**상태: 조사/제안.** 공개 데모와 영상의 자막·대표 화면을 확인했다. 외부 에셋, 그래프 JSON, 영상, 코드를 이 저장소에 반입하거나 게임에 적용하지 않았다. 제작자의 품질·속도 주장은 우리 환경에서 재현한 측정값이 아니다.

## 핵심 판단

1. **게임 전투 FX:** PXF 공방의 강점은 예쁜 한 장보다 `기준 그래프 → 파라미터 변형 → 즉시 미리보기 → 시트/메타데이터 내보내기`에 있다. 현재 `fx-gen.mjs`의 네 타입(impact/pop/pulse/sparkle)보다 표현 폭이 넓다. 첫 실험은 참격·먼지·마법진 중 하나를 **우리 팔레트와 직접 작성한 규격**으로 만드는 것이 적절하다.
2. **게임 연출:** FX 텍스처와 hit-stop·카메라·사운드·UI 전환을 한 이벤트 타임라인에서 맞추는 설계가 중요하다. `fx-art-system`은 이미지 생성, `polish`는 `feel.json`의 타이밍과 안전 검수를 맡는다.
3. **모션 그래픽:** [추가 영상](https://www.youtube.com/watch?v=wOF1EDpWxQw)의 제작법은 대사 길이·음악 박자·참조 장면·이미지를 입력으로 주고 코드가 시간에 따라 화면을 그리게 하는 것이다. 게임의 프롤로그, 승리 화면, 스킬 소개, 홍보 영상에 적용할 수 있다. 영상 속 웹 광고풍 표현을 그대로 가져오면 현재 게임 아트 톤과 어긋날 수 있으므로 `VISUAL_DESIGN.md`와 실제 게임 화면을 기준으로 새로 디자인해야 한다.

## 직접 확인한 근거

| 자료 | 확인한 사실 | 가져올 방법 |
|---|---|
| [PXF 영상 04:24](https://www.youtube.com/watch?v=PqMle_luNX0&t=264s), [06:58](https://www.youtube.com/watch?v=PqMle_luNX0&t=418s) | 노드형 절차 FX를 JSON으로 표현하고, 목록의 기존 FX를 골라 매개변수를 바꾼다. | 승인된 기준 그래프를 먼저 만들고 색·크기·입자 수·수명·방향만 변형한다. |
| [PXF 영상 08:30](https://www.youtube.com/watch?v=PqMle_luNX0&t=510s), [11:24](https://www.youtube.com/watch?v=PqMle_luNX0&t=684s) | 공격·피격·대시 맥락에서 미리 보고 수정한다. 영상에서는 제작자 환경의 AI 연결을 시연한다. | 독립 프리뷰와 실제 게임 배경·실제 표시 크기 프리뷰를 모두 남긴다. AI의 자가 평가로 승인하지 않는다. |
| [PXF 공방](https://suile-21173.web.app/hero-inc/pxf), [먼지 FX 상세](https://suile-21173.web.app/hero-inc/pxf/assets/c43878da97be06bc50710260c938f481d509b63c79327ff3e9ae08897c27dd78) | 공개 예시 한 건은 64×64, 10프레임, 30fps, 비루프. JSON은 `pxf.graph@1`과 노드·링크·피벗·재생 길이·임팩트 프레임을 담는다. PNG 시트는 64px 셀의 격자형이다. | 내부 포맷도 `frames/fps/loop/pivot/blend/impactFrame`을 명시한다. 외부 격자 시트를 쓰게 될 경우 검증 후 가로 스트립으로 변환해야 한다. |
| [선행 영상 08:45](https://www.youtube.com/watch?v=SWtjWL5ipEM&t=525s) | 제작자가 노드형 FX 제작기를 만들게 된 배경을 설명한다. 캐릭터 애니메이션 일관성은 여전히 어렵다고 말한다. | FX 성공 사례를 캐릭터 애니메이션 해결로 일반화하지 않는다. |
| [특기 영상 04:48](https://www.youtube.com/watch?v=w7ttauqxjlo&t=288s) | 패시브·특기 효과를 전투 중 알아볼 수 있게 표현하는 필요를 설명한다. 당시 UI는 작업 전이라고 밝힌다. | 효과 이벤트에 의미, 우선순위, 시각·사운드 단서를 붙여 동시 발동 때 가독성을 평가한다. |
| [프롤로그 영상 05:21](https://www.youtube.com/watch?v=X0lMLJXU9Yk&t=321s) | 장면은 완성 영상 파일이 아니라 트랙 스크립트로 관리하며, 등장·이동·표정을 타임라인에서 조정한다. | 게임 내 컷신은 편집 가능한 이벤트 트랙과 재생 미리보기로 설계한다. |
| [배경 영상 01:18](https://www.youtube.com/watch?v=yzUjQj1YGyg&t=78s), [02:33](https://www.youtube.com/watch?v=yzUjQj1YGyg&t=153s) | 먼저 전체 전투 화면의 톤과 시점을 잡고, 채도·레이어·빛을 조정한 뒤 같은 규격으로 변형한다. | 작은 에셋을 양산하기 전에 기준 전투 화면 하나에서 캐릭터/FX 가독성을 고정한다. |
| [모션 영상 00:50](https://www.youtube.com/watch?v=wOF1EDpWxQw&t=50s), [04:21](https://www.youtube.com/watch?v=wOF1EDpWxQw&t=261s), [05:35](https://www.youtube.com/watch?v=wOF1EDpWxQw&t=335s) | 정확한 대사 길이, 음악·가사, 녹음 음성 및 소수의 이미지로 코드 기반 영상을 만든 여러 예시를 보여준다. | 대사·오디오의 큐 시각과 화면 요소·이징을 데이터로 정의해 재생성 가능하게 한다. |

### PXF 공개 예시의 형식 확인

- [참격](https://suile-21173.web.app/hero-inc/pxf/assets/9ee1ba785f03302348030440c35723db4cfa7daa9652547716d75619e85572cf): 64×64, 13프레임, 30fps. Arc·Particles·Blend·Palette·Outline·Tint·Output 계열 노드. PNG는 4×4 셀 시트에 13개 프레임을 담는다.
- [마법진](https://suile-21173.web.app/hero-inc/pxf/assets/f7b6ac773c81dc2f84e0c40690ca7ea3764e8312411ad1b539c9b80faa18a9cc): 64×64, 24프레임, 30fps. Shape·Particles·Blend 계열 조합.
- 이들은 **포맷과 작업 흐름을 관찰한 샘플**이다. 공개 갤러리 항목의 재사용 권리는 확인되지 않았다. [사이트 약관](https://suile-21173.web.app/terms)은 운영자 코드·디자인 권리를 명시하고 대량 자동 수집을 제한한다. 갤러리 에셋이나 사이트 구현을 제품에 복제하려면 별도 권한 확인이 필요하다.

## 이번 검색 범위

`용사 주식회사` 검색에서 해당 채널의 일반 영상 9편과 Shorts 7편을 식별했다. 일반 영상 5편은 한국어 자동 자막을 확보해 관련 구간을 읽었다. 아래의 나머지 4편은 제목·길이만 확인했고, 자동 자막 요청은 YouTube HTTP 429로 실패했으므로 내용에 관한 판단 근거로 쓰지 않았다. 별도 제공된 [모션 그래픽 영상](https://www.youtube.com/watch?v=wOF1EDpWxQw)은 자막과 화면을 확인했다.

| 일반 영상 | 확인 범위 | 관련성 |
|---|---|---|
| [PXF 이펙트 도구](https://www.youtube.com/watch?v=PqMle_luNX0) | 자막 + 대표 화면 | FX 파이프라인의 직접 근거 |
| [특기 5개](https://www.youtube.com/watch?v=w7ttauqxjlo) | 자막 | 효과 가독성·전투 맥락 |
| [며칠 만든 기능](https://www.youtube.com/watch?v=SWtjWL5ipEM) | 자막 | 노드 FX 제작 배경 |
| [AI 게임 배경](https://www.youtube.com/watch?v=yzUjQj1YGyg) | 자막 | 기준 장면과 변형 |
| [프롤로그 제작기](https://www.youtube.com/watch?v=X0lMLJXU9Yk) | 자막 | 게임 내 타임라인 연출 |
| [2D 전투를 2.5D로](https://www.youtube.com/watch?v=wOgbtZMhaxg) | 메타데이터만 | 시점·레이어 참고 후보 |
| [14 Hero Mechanics](https://www.youtube.com/watch?v=FXmBd6mgVVg) | 메타데이터만 | 전투 역할별 FX 참고 후보 |
| [GPT Astra로 왕국 만들기](https://www.youtube.com/watch?v=QMq_ughi-j4) | 메타데이터만 | 이번 FX 판단 근거 없음 |
| [AI로 RPG 제작](https://www.youtube.com/watch?v=ZIgAuSLlxas) | 메타데이터만 | 이번 FX 판단 근거 없음 |

채널 Shorts는 [Rampage Brew Crew](https://www.youtube.com/shorts/-pu8ZdR4lhI), [Five Orbs](https://www.youtube.com/shorts/ailjpZPaTMY), [Imperial Gunner](https://www.youtube.com/shorts/LbNkgd5wMzU), [Grappler](https://www.youtube.com/shorts/o2utN_pdzs8), [Cavalier](https://www.youtube.com/shorts/H658cqs1X8U), [Fire Mage](https://www.youtube.com/shorts/sPdxT7jq7vo), [Demon Sword](https://www.youtube.com/shorts/HkqRKCTumT4)를 식별했다. 개별 내용은 검증하지 않았고 캐스트 구분 및 스킬 FX의 후속 시각 참고 후보로만 둔다.

## GameDevTeam에 적용할 순서

1. **작은 FX 파일럿:** 우리 팔레트 토큰으로 참격 1종의 시드·프레임 수·fps·피벗·임팩트 프레임을 고정한다. 기준 그래프 또는 현재 `fx-gen`의 새 타입 하나를 작성하고 동일 구조에서 색/입자만 바꾼 변형 2종을 뽑는다. 결과는 기존 프레임 PNG·가로 스트립·manifest 계약에 맞춘다.
2. **재생 타임라인:** `feel.json` 이벤트가 `fxId`, `spawnFrame`, `impactFrame`, `soundId`, `camera`를 연결하게 설계한다. 영상 편집 결과물을 런타임에 통째로 넣기보다, 게임 엔진의 타임라인에서 수정·재생 가능해야 한다. 정확한 필드 계약은 엔진 사용처를 확인한 뒤 정한다.
3. **모션 그래픽 파일럿:** 기존 게임 UI·캐릭터·FX 원본으로 8~12초 분량의 스킬 소개 또는 승리 화면 하나를 만든다. 대사/음악의 큐 시각, 화면 비율, 프레임률, 텍스트 안전 영역, 모션 감소 버전을 명시하고 코드로 렌더한다. 가로·세로 홍보용 출력은 게임 내 연출과 별도 프리셋으로 관리한다.
4. **검수:** 실제 게임 배경, 최소 표시 크기, 바쁜 전투 화면에서 사람에게 보여준다. `flash-check`는 FX 시트와 최종 합성 화면을 모두 검사하고 `feel-audit`로 타이밍·모션 감소를 확인한다. 제작 시간·프레임 안정성은 이 PC에서 실측한다. 이 절차 전까지 결과는 `concept`이다.

**구현 경계:** PXF의 Claude 커넥터는 영상·사이트의 시연 기능이며 Codex에 설치된 통합 기능으로 확인되지 않았다. `pxf.graph@1`은 외부 서비스 형식이므로 내부 안정 계약으로 바로 채택하지 않는다. 우리 쪽은 색 토큰, 출처/라이선스, 승인 상태, 시트 형식을 유지하며 필요한 아이디어만 독립적으로 구현한다.
