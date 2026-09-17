// 生成应用图标源图（1024x1024 PNG，无需第三方库）
// 图案：蓝色渐变底 + 白色八分音符，供 `npx tauri icon` 生成各尺寸图标
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 1024;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'icon-src.png');

const FROM = [30, 136, 229];   // #1e88e5
const TO = [17, 82, 156];      // 更深的蓝，右下

const inEllipse = (x, y, cx, cy, rx, ry) => {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
};

// 白色音符的各个部件
const noteHead = (x, y) => inEllipse(x, y, 424, 648, 112, 88);
const stem = (x, y) => x >= 516 && x <= 556 && y >= 196 && y <= 648;
const flag = (x, y) => {
  if (x < 556 || x > 812) return false;
  const progress = (x - 556) / (812 - 556);        // 0 -> 1
  const top = 200;
  const bottom = 200 + 190 * (1 - progress * progress); // 向下收窄的旗帜
  return y >= top && y <= bottom;
};
const noteDot = (x, y) => inEllipse(x, y, 560, 200, 44, 44) && !stem(x, y);

const pixels = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const t = (x + y) / (2 * (S - 1));
    let r = FROM[0] + (TO[0] - FROM[0]) * t;
    let g = FROM[1] + (TO[1] - FROM[1]) * t;
    let b = FROM[2] + (TO[2] - FROM[2]) * t;
    if (noteHead(x, y) || stem(x, y) || flag(x, y) || noteDot(x, y)) {
      r = 255; g = 255; b = 255;
    }
    pixels[i] = Math.round(r);
    pixels[i + 1] = Math.round(g);
    pixels[i + 2] = Math.round(b);
    pixels[i + 3] = 255;
  }
}

// 组装 PNG：IHDR + IDAT + IEND
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // 过滤器：None
  pixels.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;   // 位深
ihdr[9] = 6;   // 颜色类型：RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(OUT, png);
console.log(`已生成图标源图：${OUT}（${S}x${S}，${(png.length / 1024).toFixed(0)} KB）`);