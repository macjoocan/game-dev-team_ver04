import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const root='out/experiments/silver-reference-slash-20261111';
for(const f of ['build-historical.mjs','build-historical-review.mjs']){
 let s=fs.readFileSync(`${root}/${f}`,'utf8').replaceAll('일반 QA 미달도 유지합니다.','일반 정합성 검사는 충족했지만, 반투명 테두리·작은 고아 픽셀·구멍 경고가 남았습니다.').replaceAll('shape IoU failure and alpha warnings retained','sprite QA passed with orphan, hole and fringe warnings');
 fs.writeFileSync(`${root}/${f}`,s);
}
const r=spawnSync(process.execPath,[`${root}/build-historical-review.mjs`],{encoding:'utf8'});console.log(r.stdout,r.stderr);if(r.status!==0)process.exit(r.status);
const ev=JSON.parse(fs.readFileSync(`${root}/historical-evidence.json`));
ev.research={author:'Joachim Meyer',year:1570,chapter:'Dusack Chapter 3, passages 19.1-19.4',source:'https://sprechfenster.org/meyer/1570/dusack-chapter-3-the-four-cuts/',translationCredit:'Rebecca L. R. Garber, as credited on the page',plate:'https://sprechfenster.org/scans/meyer/Meyer_1570_Dussack_B.png',scope:'High guard plate and cut-through text inform an original game adaptation; not a reconstructed historical sequence.'};
ev.sourceRights={historicalWork:'1570 historical work',hostedScan:'Modern hosted scan/color reproduction terms not independently verified; retained as local research reference, not a production game asset',generatedCharacter:'GPT generated study, review only'};
fs.writeFileSync(`${root}/historical-evidence.json`,JSON.stringify(ev,null,2));
const report=`# 검술 교본을 참고한 베기 시안 v5

## [주장]
은발 캐릭터의 새 베기 8포즈와 v4 비교 화면을 만들었다. 교본의 높은 준비 자세와 끝까지 통과하는 베기를 참고했다. 마무리에서 검이 몸 반대편 아래로 빠지는 모습을 넣었다. 실제 검술을 정확히 복원했다는 뜻은 아니다.

## [출처와 각색 범위]
- Joachim Meyer, 1570, 두삭 제3장, 19.1~19.4: https://sprechfenster.org/meyer/1570/dusack-chapter-3-the-four-cuts/
- 페이지의 번역자 표기: Rebecca L. R. Garber.
- B 도판: https://sprechfenster.org/scans/meyer/Meyer_1570_Dussack_B.png
- 확인한 자료: 제3장 원문·번역, 제3장 첫 원문 페이지 스캔, B 도판. 다른 교본의 검색 결과를 이 동작의 근거로 섞지 않았다.

교본은 대각선 하향 베기와 각 베기 선을 설명한다. 반쯤 멈추는 연습과 선을 끝까지 통과하는 연습도 구분한다. 끝까지 베는 설명에는 몸의 오른쪽을 왼쪽으로 돌려 검을 따라가게 하는 내용이 있다. B 도판 왼쪽 전경 인물은 높은 준비 자세의 참고로 썼다.

우리 시안은 이 내용을 직선 한손검과 게임 시점에 맞춰 각색했다. 도판은 연속 프레임이 아니다. 8포즈의 연결, 전방 보폭, 460ms 재생 시간과 100ms 마무리 정지는 제작 선택이다. 현대 스캔·채색본의 재배포 조건은 별도 확인하지 않았다. 참고 파일은 로컬 연구용이며 게임 에셋에 포함하지 않는다.

## [증거]
- 대상 커밋: bba068ca03a2511c47b4b2a96bc8d97190e41419. 이후 로컬 실험이다.
- 원본: raw/silver-slash-v5.png. 생성 프롬프트: prompt-v5.txt.
- 1024×1536 원본을 2열×4행으로 나누었다. RGBA 값을 유지한 채 투명 여백을 넣어 512×512 프레임 8장을 만들었다.
- v5/manifest.json에 원본·프레임 해시, 분할 영역, 이동량, 검사 명령과 종료 코드가 있다.
- sprite-qa 종료 코드 0, 판정 충족. 고아 섬·구멍·프린지 경고 3종은 남아 있다.
- motion-qa --gait other 종료 코드 0. 공격 동작의 멋이나 고증을 보증하지 않는다.
- 알파 128 기준 캔버스 경계 접촉 0/8. 정렬 뒤 foreground bottom range 0은 가공 결과이며 발 접지 검증이 아니다.
- 비교: historical-review.html. 양쪽 동작 460ms, 준비 자세의 표시 높이 270px. v4·v5 프레임 시간표는 historical-feel.json에 기록했다.

검사 원문: [sprite-qa](v5/qa/sprite-qa.md). 아래는 실행 원시 출력이다.

~~~text
${fs.readFileSync(`${root}/v5/sprite-qa.stdout.log`,'utf8')}
${fs.readFileSync(`${root}/v5/motion-qa.stdout.log`,'utf8')}
~~~

## [기준]
검이 앞쪽 아래에서 멈추지 않고 반대편까지 이어지는지 본다. 찌르기로 읽히는 중간 자세, 손목 연결, 몸 회전, 원본 캐릭터 유지 여부를 사람 검수로 확인한다. QA 충족을 멋이나 사람 승인으로 바꾸지 않는다.

## [공백]
실제 게임 반영, 충돌 판정, 프레임별 손목·검끝 추적, 검술 전문가 검수는 하지 않았다. 도판과 텍스트만으로 실제 속도와 관절 움직임을 복원할 수 없다. 원장에 프로젝트 state.json이 없어 열린 게이트 상태는 미확인이다.

## [잔여 위험]
4번 자세는 팔을 전방으로 뻗어 찌르기로 읽힐 수 있다. 검과 손목의 각도 변화, 얼굴·장식의 작은 변화도 남는다. 반투명 배경 잔여물 경고가 커서 최종 게임용 알파 정리는 별도 필요하다. 이 시안은 검수 후보이며 승인·출시 판정이 아니다.
`;
fs.writeFileSync(`${root}/HISTORICAL-STUDY.md`,report);
console.log('Research report and preview updated');
