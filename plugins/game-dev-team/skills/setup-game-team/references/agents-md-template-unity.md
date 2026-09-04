# AGENTS.md 템플릿 — Unity (C# · Codex/GPT)

아래를 뼈대로 프로젝트 값을 채워 Unity 프로젝트 루트 `AGENTS.md`로 저장한다.

---

# <프로젝트명> — 게임 개발 팀 규칙 (AGENTS.md · Unity)

## 모델 라우팅
- 기본 모델: GPT 계열 Codex 모델.
- 깊은 판단/장기 구현: 높은 추론 설정.
- 일반 실행/검증/브리핑: 중간 추론 설정.

## Unity 프로젝트 정보
- Unity 버전: <미결>
- 렌더 파이프라인: <미결>
- 주요 씬: <미결>
- 실행/테스트/빌드 명령: <미결>
- 패키지/의존성: <미결>
- 비주얼 방향/금지 스타일: <미결>
- 목표 화면비/최소 해상도: <미결>

## Unity 작업 원칙
- gameplay/domain logic은 MonoBehaviour UI 코드와 분리한다.
- ScriptableObject, JSON, CSV 등으로 밸런스 수치를 데이터화한다.
- PlayMode/EditMode 테스트 또는 헤드리스 시뮬레이션을 우선한다.
- RNG 시드 고정을 지원해 balance-sim 결과를 재현 가능하게 한다.
- Unity MCP가 연결되어 있으면 씬, 에셋, 테스트, 빌드 확인에 활용한다.
- 자동 플레이/강화학습 검증이 필요하면 Unity ML-Agents 도입을 검토한다.
- 아트 에셋은 manifest stable ID로 참조하고 승인 전 임시 파일 경로를 prefab/scene에 고정하지 않는다.

## 파이프라인
0. 컨셉 발굴: core fantasy, 30초 루프, 실패 조건.
1. 기획+게임성 지표: 숫자로 성공 기준 정의.
2. 태스크 분해.
3. Unity 프로토타입: 최소 씬/프리팹/스크립트만 구현.
4. 게임성 검증: balance-sim, PlayMode 테스트, 자동 플레이.
5. 본구현.
6. 정확성 QA: 콘솔 에러 0, 테스트 통과, 회귀 없음.
7. 아트/연출 P1.
8. core 통과 후 메타/수익화.
9. 경제 검증.
10. 출시 전 P2 polish.

## 사람 승인 게이트
- 게이트 모드: <lean/full/solo> — lean=핵심 게이트만(코어 확정·게임성 검증·머지, **기본**), full=모든 게이트(정식·출시 준비 시), solo=게이트 없음(잼/실험).
- 게이트 통과 이력과 현재 단계는 레포 루트 `PIPELINE_STATE.md`에 기록한다.
- 기획 게이트: 근거 없는 수치 0, 미결 명시, 핵심 수치 공란 0, 성공 지표 정의.
- 프로토/검증 루프: 반복 예산 기본 3회, 1회 조정 노브 최대 2개.
- 본구현 진입: 게임성 지표 충족 후.
- 경제 트랙 진입: core 재미 통과 후.
- 아트 게이트: `VISUAL_DESIGN.md`, asset manifest, Unity 실제 화면 visual-qa 증거 확인.

## Unity 아트/에셋 규칙
- 아트 제작 전 `VISUAL_DESIGN.md`로 팔레트, 실루엣, 카메라, UI 톤, 금지 스타일을 고정한다.
- Sprite는 Pixels Per Unit, pivot, packing tag 또는 atlas, compression 기준을 명시한다.
- UI는 Canvas Scaler, safe area, smallest target resolution, Korean text length를 확인한다.
- 3D는 scale, origin, material naming, collider/proxy, LODGroup, GLB/FBX import setting을 확인한다.
- visual-qa는 Game view 스크린샷, 모바일/최소 해상도, 바쁜 전투 화면 증거를 남긴다.

## 게임성 성공 지표
- 목표 승률/실패율: <미결>
- 평균 런 길이/세션 길이: <미결>
- 선택지/무기/카드 픽률 편중 허용치: <미결>
- 사망/이탈 분포: <미결>
- 프레임/입력 지연 허용치: <미결>

## 역할 라우팅
- `pm`: Unity 작업 단위, 우선순위, 리스크.
- `game-designer`: core loop, 밸런스, 게임성 검증.
- `developer`: C# 구현, 씬/프리팹 연결, 테스트, 시뮬 하네스.
- `qa`: 콘솔/빌드/회귀/정확성.
- `artist`: UI 톤, 에셋 파이프라인, VFX/SFX/연출 디렉션, 시각 QA.
- `meta-economy-designer`: 성장/수익화/리텐션.
