// 主题自定义颜色的单元测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHex, hexToRgb, rgbToHex, contrastRatio, shade, rgba, relLuminance, compositeOver,
  pickOnPrimary, chipColors, deriveAccent, DEFAULT_ACCENT, PRESET_ACCENTS,
} from '../js/core/theme.js';

test('normalizeHex：接受 #RGB / #RRGGBB / 无#，非法输入返回 null', () => {
  assert.equal(normalizeHex('#1E88E5'), '#1e88e5');
  assert.equal(normalizeHex('1e88e5'), '#1e88e5');
  assert.equal(normalizeHex('#abc'), '#aabbcc');
  assert.equal(normalizeHex('  #ABC  '), '#aabbcc');
  assert.equal(normalizeHex('#12345'), null);
  assert.equal(normalizeHex('红色'), null);
  assert.equal(normalizeHex(''), null);
  assert.equal(normalizeHex(null), null);
  assert.equal(normalizeHex(123), null);
});

test('hexToRgb / rgbToHex 互转正确', () => {
  assert.deepEqual(hexToRgb('#ff8800'), { r: 255, g: 136, b: 0 });
  assert.equal(rgbToHex({ r: 255, g: 136, b: 0 }), '#ff8800');
  assert.equal(hexToRgb('乱写'), null);
});

test('contrastRatio：黑白对比度为 21，同色为 1', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#1e88e5', '#1e88e5'), 1);
  assert.ok(contrastRatio('#ffffff', '#eeeeee') < 2);
});

test('shade：变暗/变亮方向正确且有界', () => {
  const base = '#808080';
  assert.ok(hexToRgb(shade(base, -0.5)).r < 0x80, '负值应变暗');
  assert.ok(hexToRgb(shade(base, 0.5)).r > 0x80, '正值应变亮');
  assert.equal(shade('#ffffff', 0.5), '#ffffff', '白色再变亮仍是白色');
  assert.equal(shade('#000000', -0.5), '#000000', '黑色再变暗仍是黑色');
});

test('pickOnPrimary：主色偏浅时自动改用深色文字', () => {
  assert.equal(pickOnPrimary('#ffeb3b'), '#1c1e21', '亮黄应配深色文字');
  assert.equal(pickOnPrimary('#1b1b1b'), '#ffffff', '近黑应配白色文字');
  assert.equal(pickOnPrimary('#1e88e5'), '#ffffff', '默认蓝保持白字');
  assert.equal(pickOnPrimary('#43a047'), '#ffffff', '绿色配白字');
  assert.equal(pickOnPrimary('#fb8c00'), '#1c1e21', '橙色偏浅，应配深字');
});

test('pickOnPrimary：任意预设色上的文字对比度都达到可读标准（>=3）', () => {
  for (const c of PRESET_ACCENTS) {
    const on = pickOnPrimary(c);
    const ratio = contrastRatio(c, on);
    assert.ok(ratio >= 3, `${c} 配 ${on} 对比度仅 ${ratio.toFixed(2)}`);
  }
});

test('rgba：生成合法颜色字符串', () => {
  assert.equal(rgba('#1e88e5', 0.14), 'rgba(30, 136, 229, 0.14)');
  assert.equal(rgba('非法', 0.5), 'rgba(0, 0, 0, 0.5)');
});

test('chipColors：标签文字在真实底色上均可读（对比度 >= 4.5）', () => {
  for (const c of PRESET_ACCENTS) {
    const light = chipColors(c, false);
    const dark = chipColors(c, true);
    assert.ok(contrastRatio(light.text, light.bgSolid) >= 4.5,
      `${c} 浅色主题标签不可读：${contrastRatio(light.text, light.bgSolid).toFixed(2)}`);
    assert.ok(contrastRatio(dark.text, dark.bgSolid) >= 4.5,
      `${c} 深色主题标签不可读：${contrastRatio(dark.text, dark.bgSolid).toFixed(2)}`);
    assert.ok(relLuminance(dark.text) > relLuminance(light.text), `${c} 深色主题的标签文字应更亮`);
    assert.match(light.bg, /^rgba\(/);
  }
});

test('compositeOver：半透明叠加计算正确', () => {
  assert.equal(compositeOver('#000000', 0.5, '#ffffff'), '#808080');
  assert.equal(compositeOver('#ff0000', 1, '#000000'), '#ff0000');
  assert.equal(compositeOver('#ff0000', 0, '#ffffff'), '#ffffff');
});

test('deriveAccent：返回完整变量集；非法颜色回退默认色', () => {
  const a = deriveAccent('#43a047', 'light');
  assert.equal(a.primary, '#43a047');
  assert.equal(a.onPrimary, '#ffffff');
  assert.match(a.primaryStrong, /^#[0-9a-f]{6}$/);
  assert.ok(hexToRgb(a.primaryStrong).g < hexToRgb('#43a047').g, 'primaryStrong 应更深');
  const fallback = deriveAccent('这不是颜色', 'dark');
  assert.equal(fallback.primary, DEFAULT_ACCENT);
  const empty = deriveAccent(undefined);
  assert.equal(empty.primary, DEFAULT_ACCENT);
  assert.equal(empty.onPrimary, pickOnPrimary(DEFAULT_ACCENT));
});

test('deriveAccent：深浅主题得到不同的标签配色', () => {
  const l = deriveAccent('#8e24aa', 'light');
  const d = deriveAccent('#8e24aa', 'dark');
  assert.notEqual(l.chipBg, d.chipBg);
  assert.notEqual(l.chipText, d.chipText);
});

test('PRESET_ACCENTS：色板均为合法颜色且互不相同', () => {
  const set = new Set();
  for (const c of PRESET_ACCENTS) {
    assert.ok(normalizeHex(c), `${c} 非法`);
    set.add(c);
  }
  assert.equal(set.size, PRESET_ACCENTS.length);
  assert.ok(PRESET_ACCENTS.includes(DEFAULT_ACCENT));
  assert.ok(PRESET_ACCENTS.length >= 8);
});