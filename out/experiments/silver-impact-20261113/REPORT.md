# 은발 한손검 v8 검수 기록

## 주장

v7의 네 번째 자세에서 손목과 검이 꺾여 보이는 부분을 고쳤다. v8은 해당 프레임만 바뀌며 나머지 7장은 v7과 해시가 같다. 사용자의 “지금 괜찮네” 피드백은 이번 수정에 대한 긍정 의견으로 기록한다. 엔진 반영이나 프로덕션 승인으로 확대하지 않는다.

## 증거

- [v8 비교 화면](preview.html), [최종 GIF](impact-v8.gif), [프레임 기록](manifest-v8.json).
- [검증 실행 기록](qa/verification.json): 모델 테스트 7개, feel-audit, 일반·밝은 배경·모션 감소 flash-check 모두 exit 0. v6 원본 8장 해시 유지.
- [v8 브라우저 검사](qa/browser-v8.json): 적중 시 한 번 정지, 빗나가면 정지 없음. 모션 감소에서는 궤적·불꽃·흔들림이 없다. 한 번 재생은 1,200ms에 종료된다.
- 도구 원문은 `qa/*.stdout.log`와 검사 하위 폴더에 보존했다. GIF는 601×401, 60장, 프레임당 20ms다.

## 기준

기준 커밋: `cdd14a658c801bfa3d07a2492c3a2ecb4adbb6b0`.
공격 자세는 380ms, 적중 정지는 66.67ms다. 직접 정한 값이며 참고 영상에서 실측한 값이 아니다.

참고 자료는 사쿠라이 공식 영상 [Attack Poses](https://www.youtube.com/watch?v=99gdMDF7V2E), [Eight Hit Stop Techniques](https://www.youtube.com/watch?v=tycbMSjDDLg)와 [GDC Dead Cells 발표](https://media.gdcvault.com/gdc2019/presentations/Benard-Sebastian-DeepCells.pdf)다. 영상은 설명과 일부 자막 구간을 확인했다. 전체 영상을 시청하거나 공격 시간을 측정했다고 주장하지 않는다.

## 공백

sprite-qa는 frame_0001의 실루엣 IoU 0.45가 하한 0.5보다 낮아 exit 1이다. 이번 네 번째 자세 수정으로 이 항목까지 해결되지는 않았다. 브라우저의 수동 검 접촉 구간은 실제 게임의 연속 충돌 판정을 대신하지 않는다. 기존 1스테이지에는 반영하지 않았다.

## 잔여 위험

프레임 간 큰 실루엣 변화와 알파 구멍·떨림 경고를 추가 검수해야 한다. 이펙트 중첩과 실제 게임 화면의 깜빡임은 별도 검사 대상이다.
