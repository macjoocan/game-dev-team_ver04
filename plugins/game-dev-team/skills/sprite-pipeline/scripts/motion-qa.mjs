#!/usr/bin/env node
// Report only: input errors exit 3; a completed observation exits 0, not approval.
import fs from 'node:fs';
import path from 'node:path';
import { CONTRACT, loadSequence, inspectSequence, inputRecord, measureMotion } from './lib-sprite-sequence.mjs';

const args = process.argv.slice(2), source = args[0];
const options = {};
let report;
try {
  if (!source || source.startsWith('--')) throw new Error('프레임 폴더 또는 가로 시트를 지정한다.');
  for (let i = 1; i < args.length; i += 2) {
    if (!['--gait', '--frames', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || options[args[i]] !== undefined) {
      throw new Error(`잘못된 옵션: ${args[i]}`);
    }
    options[args[i]] = args[i + 1];
  }
  if (!['walk', 'slow-walk', 'run', 'other'].includes(options['--gait'])) {
    throw new Error('--gait walk|slow-walk|run|other를 직접 지정한다. 동작을 자동 추정하지 않는다.');
  }
  const inspected = inspectSequence(loadSequence(source, options['--frames']), 4);
  report = { schemaVersion: 1, algorithm: 'motion-outline-v1', source, gait: options['--gait'],
    verdict: inspected.valid ? '관찰 완료' : '측정 불가', input: inputRecord(inspected),
    motion: inspected.valid ? measureMotion(inspected.measurements) : null };
} catch (error) {
  report = { schemaVersion: 1, algorithm: 'motion-outline-v1', source, verdict: '측정 불가',
    input: { contract: CONTRACT, valid: false, issues: [{ code: 'input', message: error.message }] }, motion: null };
}
const lines = ['# 스프라이트 모션 관찰', '', '## [주장]', '',
  `**${report.verdict}**. 관찰 완료는 모션 품질 통과나 사람 승인이 아니다.`, '', '## [증거]', ''];
if (report.motion) {
  lines.push(`- 프레임: ${report.input.frames.length}장 · 동작: ${report.gait}`,
    `- 하단 윤곽 변화량(liftRange): ${report.motion.liftRange}`,
    `- 유효 구간: ${report.motion.validBins}/${CONTRACT.contourBins}`,
    `- 피사체 상단 위치 범위 / 높이 중위값: ${report.motion.bboxTopRangeRatio}`);
} else {
  for (const issue of report.input.issues) lines.push(`- ${issue.frame ? `${issue.frame}: ` : ''}${issue.message}`);
}
lines.push('', '## [기준]', '',
  '피사체는 알파 128 이상, 배경은 알파 20 미만으로 센다.',
  '각 프레임에 피사체와 배경 2% 이상이 필요하다. 크기가 다른 프레임은 계산하지 않는다.',
  '가로 64구간의 하단 윤곽을 비교한다. 절반 이상 프레임에 값이 있는 구간만 집계한다.',
  '임계값이나 품질 합격선은 없다. 인접 변화량에는 마지막→첫 프레임을 넣지 않는다.', '',
  '## [공백]', '', '발 접지·보폭·타이밍·장비의 잘림·실제 게임 화면은 판단하지 않았다.', '',
  '## [잔여 위험]', '', '망토·치마·무기도 수치에 영향을 준다. 값이 크다고 좋은 걷기가 아니다.',
  '투명하지 않은 배경 제거 전 이미지와 의도적으로 빈 프레임은 이 도구의 입력 대상이 아니다.', '');
const markdown = lines.join('\n');
console.log(markdown);
if (options['--out']) {
  fs.mkdirSync(options['--out'], { recursive: true });
  fs.writeFileSync(path.join(options['--out'], 'motion-qa.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(options['--out'], 'motion-qa.md'), markdown);
}
process.exitCode = report.motion ? 0 : 3;
