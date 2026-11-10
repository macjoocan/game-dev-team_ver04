# Unity 기본 파티클로 VFX를 만드는 경로

2026-11-10 · 활용 가능성 검토. Unity 구현·컴파일·실기기 검증 전.

## 결론과 확인 범위

우리 GPT 이펙트 이미지를 재료로 쓰고, Unity Particle System으로 움직임을 구성할 수 있다. 외부 영상 생성 호출 없이 에디터에서 조립하는 경로다. 이번 조사에서는 Unity 프로젝트나 프리팹을 변경하지 않았다.

대상은 Archions의 [Create VFX & animations with Unity’s particle system](https://www.youtube.com/watch?v=mJ3k_DLxRU0&t=2s)이다. 직접 영상 재생은 확인하지 못했다. [공개 자막 사본](https://videodb.org/create-vfx-animations-with-unity%E2%80%99s-particle-system/mJ3k_DLxRU0)으로 내용을 파악하고, 기술 판단은 아래 Unity 공식 문서와 대조했다. 자막에는 Allin1VFX 팩의 예시를 사용했다고 적혀 있다. 그 팩의 소스를 확보하거나 사용 권리를 검증한 것은 아니다.

## 사용할 기술

| 구성 요소 | 역할 | 공식 근거 |
|---|---|---|
| Burst | 정한 순간에 여러 입자를 함께 방출한다 | [Emission](https://docs.unity3d.com/6000.0/Documentation/Manual/PartSysEmissionModule.html) |
| Start Lifetime·Delay·Speed | 입자가 살아 있는 시간, 시작 시점, 이동 속도를 정한다 | [Main](https://docs.unity3d.com/6000.0/Documentation/Manual/PartSysMainModule.html) |
| Size over Lifetime | 시간이 지나며 커지거나 작아지는 곡선을 준다 | [Size](https://docs.unity3d.com/6000.0/Documentation/Manual/PartSysSizeOverLifeModule.html) |
| Color over Lifetime | 시간에 따른 색 변화를 준다 | [Color](https://docs.unity3d.com/6000.0/Documentation/Manual/PartSysColorOverLifeModule.html) |
| C# 설정·프리팹 저장 | 스펙에서 효과 묶음을 자동 제작한다 | [SetBursts](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/ParticleSystem.EmissionModule.SetBursts.html), [SaveAsPrefabAsset](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/PrefabUtility.SaveAsPrefabAsset.html) |

`Duration`만으로 최종 소멸 시점을 정하지 않는다. 마지막 방출 이후에도 살아 있는 입자가 있기 때문이다. 재사용하는 오브젝트는 자식 효과까지 끝난 시점에 풀로 돌려보내야 한다. 이 수명 계산과 정리는 구현 시 검증할 항목이다.

## 우리 파이프라인에 붙이는 설계안

GPT가 검 궤적·불꽃·충격파의 투명 텍스처를 만들고, 기존 규격 도구가 알파·크기·피벗을 정리한다. 엔진 공통 FX 스펙을 Unity용 C# 제작기가 읽도록 확장한다. 제작기는 머티리얼과 자식 Particle System을 묶어 프리팹으로 저장한다. 이 연결은 공식 API를 바탕으로 한 설계 제안이며 구현 완료 사실이 아니다.

첫 시험은 은발 검사의 베기로 잡는다. 아래 수치는 시작 후보이며 실측 최적값이 아니다.

| 레이어 | 시작 후보 | 게임과 연결할 사건 |
|---|---|---|
| 큰 검 궤적 | Burst 1개, 0.13초, 크기·회전 변화 | 검이 움직이는 순간. 헛스윙에도 표시 |
| 타격 불꽃 | Burst 6~10개, 0.12~0.18초, 바깥 방향 속도 | 명중 판정 성공 때만 표시 |
| 작은 충격파 | Burst 1개, 0.10~0.16초, 확장 후 소멸 | 강한 명중 때만 표시 |

피해 계산은 전투 코드에 둔다. 입자 충돌로 피해를 중복 계산하지 않는다. 현재 `feel.json`의 명중 정지와 소리 시점을 함께 이식한다. 정지 중에도 효과를 진행할지, 같이 멈출지는 하나의 규칙으로 정해 검사한다.

## 비용과 적용 조건

이 설계의 움직임 제작에는 유료 영상 생성 API나 영상 예시 팩이 필요하지 않다. 직접 만든 GPT 텍스처를 사용한다. GPT 이미지 생성 비용과 Unity 사용 라이선스 조건까지 모두 무료라고 주장하지 않는다. 이번 조사에서 결제·팩 다운로드·유료 생성 호출은 하지 않았다.

현재 게임은 Canvas 웹 샘플이다. Unity Particle System 프리팹을 HTML에서 직접 실행할 수는 없다. Unity 프로젝트로 옮기거나, Unity에서 렌더링한 결과를 투명 프레임으로 굽는 별도 과정이 필요하다.

실제 제작 전 대상 Unity 버전, 렌더 파이프라인, 2D 카메라와 픽셀 배율을 확인한다. URP/Built-in 머티리얼 호환성, 앞뒤 정렬, 투명도 중첩 비용, 명중 타이밍, 풀 재사용, 감소 옵션과 플래시 검사를 진행한다. 이 검토는 VFX Graph 구현 완료나 Unity에서의 품질 보장을 뜻하지 않는다.
