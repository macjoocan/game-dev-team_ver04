# 은발 검사 Ludo 생성 준비

> 아래 준비 기록 이후 크레딧 충전과 생성이 완료됐다. 현재 결과는 [결과 보고](RESULT.md)와 [비교 재생](index.html)에서 확인한다.

## [주장]

2026-11-06 로그인된 Ludo Sprite Generator에 은발 원화를 업로드했다. 이전 Ludo 걷기와 같은 Hydra 설정으로 생성 요청을 한 번 보냈다. 서버가 HTTP 402를 반환하고 Premium 안내를 표시해 생성 결과를 확보하지 못했다. 결제나 구독 변경은 하지 않았다.

## [증거]

- 원화: `out/2d-gpt-20261106/silver-swordswoman-gpt-v1.png`
- 원화 SHA-256: `3BF5B922FC29D833C3C3625E01EA401DEEDFE5816C4D8BBB20DA563C8D6AB822`
- 페이지: `https://app.ludo.ai/sprite-generator`
- 표시 잔액: 3. 생성 견적: 9 credits. 요청 뒤 큐: 0.
- 서버 오류 원문: `Failed to load resource: the server responded with a status of 402 () @ https://api.ludo.ai/api/jobs/generate-image-to-spritesheet:0`
- 화면 안내: `Upgrade to Ludo.ai Premium for just $20/month!`
- 대상 커밋: `4c43b68`. 로컬 실험이며 원격 반영하지 않았다.

## [기준]

Animate / Hydra / 최대 3초 / Max Frames 36 / Sprite Size Max / Animation Margin Auto / Loop On / Pixel Grid Off. 첫 프레임은 GPT 은발 원화이며 마지막 프레임은 지정하지 않았다.

입력 프롬프트:

```text
Right-facing side-view walk cycle, in place, seamless loop. Natural alternating steps, planted feet, bent knees and weight shift. Preserve her long silver high ponytail, face, dark armor with gold trim, teal cape and brown boots. Hold one straight sword securely in the same hand, moving naturally with that hand. Whole body, ponytail and sword inside a fixed canvas. No dust, glow or camera motion.
```

## [공백]

새 영상·프레임은 없다. 정체성·보행·접지·루프 QA는 미실행이다. 402의 상세 응답은 확인하지 않았으나, 표시 잔액은 견적보다 적고 Premium 안내가 나타났다.

## [잔여 위험]

계정의 크레딧 또는 플랜 조건을 해결해야 한다. 새 결제는 사용자 판단이 필요하다. 설정과 원화는 페이지에 남겨 두었다. 재개 시 잔액·큐·기존 결과부터 확인해 중복 요청을 피한다.
