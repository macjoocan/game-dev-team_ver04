// lib-png-read.mjs - 의존성 없는 PNG 디코더 (Node 내장 zlib 만 사용).
// 레퍼런스 이미지를 읽어 팔레트·규격을 실측하는 데 쓴다(ref-analyze.mjs).
//
// 지원: 비트깊이 1/2/4/8/16, 컬러타입 0(gray) 2(rgb) 3(palette) 4(gray+a) 6(rgba), tRNS.
// 미지원: 인터레이스(Adam7) — 만나면 명시적으로 에러를 낸다. 조용히 틀린 픽셀을 주는 것보다 낫다.

import fs from 'node:fs';
import zlib from 'node:zlib';

const CH = { GRAY: 0, RGB: 2, PALETTE: 3, GRAY_A: 4, RGBA: 6 };
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** PNG 파일을 { width, height, data(RGBA8) } 로 읽는다. */
export function readPNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 시그니처가 아니다');

  let pos = 8, ihdr = null, plte = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        depth: data[8], color: data[9], interlace: data[12],
      };
    } else if (type === 'PLTE') plte = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('IHDR 없음');
  if (ihdr.interlace !== 0) throw new Error('인터레이스 PNG 는 지원하지 않는다');

  const { width: w, height: h, depth, color } = ihdr;
  const ch = CHANNELS[color];
  if (ch === undefined) throw new Error(`지원하지 않는 컬러타입: ${color}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bitsPerPixel = ch * depth;
  const bytesPerPixel = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((w * bitsPerPixel) / 8);

  // 스캔라인 언필터
  const lines = Buffer.alloc(stride * h);
  let off = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[off++];
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    raw.copy(cur, 0, off, off + stride);
    off += stride;
    const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bytesPerPixel ? cur[x - bytesPerPixel] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bytesPerPixel ? prev[x - bytesPerPixel] : 0;
      switch (ft) {
        case 0: break;
        case 1: cur[x] = (cur[x] + a) & 0xff; break;
        case 2: cur[x] = (cur[x] + b) & 0xff; break;
        case 3: cur[x] = (cur[x] + ((a + b) >> 1)) & 0xff; break;
        case 4: cur[x] = (cur[x] + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`알 수 없는 필터 타입: ${ft}`);
      }
    }
  }

  // 샘플 뽑기 (비트깊이별)
  const maxV = (1 << Math.min(depth, 8)) - 1;
  function sample(line, i) {
    if (depth === 16) return line[i * 2];            // 상위 바이트만 (8bit 로 낮춤)
    if (depth === 8) return line[i];
    const per = 8 / depth;                            // 1,2,4 비트
    const byte = line[Math.floor(i / per)];
    const shift = 8 - depth * ((i % per) + 1);
    return (byte >> shift) & maxV;
  }

  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const line = lines.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (color === CH.PALETTE) {
        const idx = sample(line, x);
        out[o] = plte[idx * 3]; out[o + 1] = plte[idx * 3 + 1]; out[o + 2] = plte[idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (color === CH.GRAY || color === CH.GRAY_A) {
        const g = depth < 8 ? Math.round((sample(line, x * ch) / maxV) * 255) : sample(line, x * ch);
        out[o] = out[o + 1] = out[o + 2] = g;
        out[o + 3] = color === CH.GRAY_A ? sample(line, x * ch + 1) : 255;
      } else {
        out[o] = sample(line, x * ch);
        out[o + 1] = sample(line, x * ch + 1);
        out[o + 2] = sample(line, x * ch + 2);
        out[o + 3] = color === CH.RGBA ? sample(line, x * ch + 3) : 255;
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** RGB -> HSV (h 0..360, s 0..1, v 0..1) */
export function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d > 0) {
    if (mx === r) hh = ((g - b) / d) % 6;
    else if (mx === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60;
    if (hh < 0) hh += 360;
  }
  return { h: hh, s: mx === 0 ? 0 : d / mx, v: mx };
}

export const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
