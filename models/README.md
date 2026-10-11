# 회사 PC 모델 복원

가중치는 GitHub Release `sprite-models-2026-10-11`의 1GiB 이하 분할 파일로 제공한다.
`company-models.json`에 원본 상대 경로, 바이트 수, 모델/분할 SHA-256, upstream revision,
모델별 라이선스와 출처를 기록한다. 원본 모델 카드·LICENSE도 Release에 함께 제공한다.
가중치는 플러그인 자체 라이선스와 별개이며 OpenRAIL 사용 제한을 따른다.

```powershell
python -m pip install requests
python scripts/model-release.py restore --catalog models/company-models.json --root D:/ComfyUI/ComfyUI_windows_portable/ComfyUI/models
```

기존 파일이 동일 해시면 건너뛴다. 다른 파일은 덮어쓰지 않고 오류를 낸다.
중간 다운로드 파일은 검증 후 재사용하며, 복원한 전체 모델 해시도 검사한다.
총 용량 외에 가장 큰 모델의 분할 파일과 조립 파일을 동시에 둘 공간이 필요하다.
ComfyUI와 Python 의존성, custom nodes, Blender는 별도 설치한다. custom node 의존성은 서버가 실제 쓰는 interpreter와 실행 flags에서 설치한다. 아래 예시는 이 PC의 portable Python과 -s를 사용한다. 회사 경로가 다르면 interpreter 경로도 함께 바꾼다. 설치 후 ComfyUI를 재시작하고 doctor/노드 registry로 활성화를 확인한다.

GitHub 업로드가 진행 중일 때는 동일 해시의 공식 원본에서 필요한 가중치를 먼저 받는다:

```powershell
python scripts/model-release.py restore --catalog models/company-models.json --root D:/ComfyUI/ComfyUI_windows_portable/ComfyUI/models --source upstream --skip-unverified
```

이 모드에서는 고정 revision과 byte range를 사용해 동일한 분할·전체 해시를 검증한다.
로컬 portable에 들어 있던 작은 VAE preview 8개는 정확한 원본 파일 매칭이 없어 명시적으로
건너뛴다. 생성용 diffusion/text/vision/VAE 가중치는 정확한 원본 파일이 기록돼 있다.
8개 preview의 로컬 바이트는 GitHub Release에 포함된다.

```powershell
& D:/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe -s skills/char-art-system/scripts/sprite-lab-setup.py --root D:/ComfyUI/ComfyUI_windows_portable/ComfyUI --nodes animatediff controlnet pixel alpha sam2 --dependencies --out out/company-nodes
& D:/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe -s skills/char-art-system/scripts/sprite-lab.py doctor --out out/company-doctor
```

모델 복원만으로 모든 backend 실행을 보장하지 않는다. `sprite-lab.md`의 backend 조건과
SSD 전용 pose guider 미확보 상태를 확인한다. PixelLab 키는 회사 PC에서 따로 설정한다.

프리뷰: `python -m http.server 8788` 실행 후
`http://127.0.0.1:8788/samples/motion-court/index.html`을 연다.
