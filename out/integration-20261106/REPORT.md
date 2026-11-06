# 원격 변경 통합과 검증 — 2026-11-06

## [주장]

원격 main의 16205c5까지 네 커밋을 로컬에 통합했다. 병합 커밋은 4c43b68이며 기존 리그 검사 커밋 d763e1c도 보존했다. 지난번 미커밋 작업을 다시 적용하고 REVIEW.md 충돌을 해결했다. 통합본 버전은 0.52.0이다.

원격의 테스트 자동 탐지를 채택했다. 로컬에서 추가한 개별 테스트 스텝 3개는 자동 탐지와 중복되므로 제거했다. 재검증 중 Python 테스트 두 개에 필요한 requests 누락을 발견해 CI 설치 목록에 추가했다.

Claude·Codex 설치본도 공식 설치 스크립트로 갱신했다. 두 설치본 모두 0.52.0이며 각각 214/214 파일이 소스와 일치했다.

## [증거]

- [원본 백업 목록](backup-manifest.json)과 [Git 검증](git-verification.json). 충돌 0개, diff --check exit 0. 원격 문서·샘플 12개 보존.
- [최초 전체 CI 원문](ci-full.txt): 15/16 단계 통과. 실패한 단계는 requests가 없던 전체 테스트다.
- [수정 뒤 실제 CI 명령](test-stage.sh) · [전체 테스트 원문](tests-final.txt) · [종료 코드](tests-final-result.json): exit 0.
- [설치 원문](install-final.txt) · [설치 비교 JSON](installed-after.json).
- [검증한 파일 해시](tested-files.json). 병합 뒤 로컬 기능과 수정은 미커밋 상태이므로 이 해시로 작업본을 구분한다.

테스트 출력 원문:

```text
ℹ tests 70
ℹ suites 0
ℹ pass 69
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 110400.5336

## python (2)
verified model-00-000.bin
restored diffusion/test.bin
verified diffusion/test.bin

# 결과: 13개 전부 통과
```

Python 검사는 각 파일에서 3건씩, 합계 6건 통과했다. Node는 70건 중 69건 통과, 1건 생략이다. 생략 사유 원문은 다음과 같다.

```text
﹣ refuses linked state files even inside the project (17.2246ms) # Windows symlink privilege unavailable
```

## [기준]

전체 CI에서 통과한 15단계를 유지하고, 수정한 테스트 단계의 명령을 그대로 bash -e로 다시 실행했다. 최초 실패 로그를 지우거나 전체 CI가 한 번에 통과했다고 바꾸지 않았다. 플러그인 무결성과 원본·미러 일치도 수정 뒤 다시 확인했다.

병합 전에 변경 파일 75개와 바이너리 패치를 보존했다. stash는 복구용으로 남겼다. Git 적용 과정에서 줄바꿈만 달라진 22개 파일은 백업 바이트로 복원했다. 기존 검수 기록과 실험 출력도 유지했다.

## [공백]

- Windows 심볼릭 링크 생성 권한이 없어 연결된 상태 파일 거부 테스트 1건은 생략됐다. 통과로 세지 않았다.
- 원격 Ubuntu CI는 실행하지 않았다. 이번 검증은 Windows와 Git Bash에서 수행했다.
- 기존 art-gate는 샘플 경로가 없어 측정 불가다. [시작 시 보고서](../integration-baseline/art-gate-report.md)를 보존했다. docs/pipeline/state.json도 없어 열린 게이트는 미확인이다.
- 스프라이트 실험은 인수인계·샘플을 보존하고 Python 파일 3개의 문법과 모델 목록 8개 항목을 읽었다. ComfyUI 생성, 대용량 모델 다운로드, 게임 화면 검수는 이번 통합에서 실행하지 않았다. 원격 문서의 정체성 미달·미승인 상태를 유지한다.

## [잔여 위험]

실제 엔진 성능·아트 품질·사람 승인은 자동 테스트 범위 밖이다. 미승인 샘플을 프로덕션으로 승격하지 않았다. 설치 파일은 갱신됐지만 현재 세션의 재로드 여부는 확인하지 않았다.

원격으로 push하지 않았다. 로컬 main에는 병합 커밋과 미커밋 기능 변경이 함께 남아 있다. 복구용 stash는 integration-20261106-local-tracked-backup이며 백업은 이 보고서 폴더에 있다.
