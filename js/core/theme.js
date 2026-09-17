// 主题配色：纯函数，可在 Node 中测试。
// 负责校验自定义颜色、派生深浅色与前景色，保证任意颜色下文字都可读。

export const DEFAULT_ACCENT = '#1e88e5';

/** 校验并规范化 #RRGGBB / #RGB / 不带 # 的写法；非法返回 null */
export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return `#${s.toLowerCase()}`;
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function toHex(n) {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}

export function rgbToHex({ r, g, b }) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** 相对亮度（WCAG 2.0） */
export function relLuminance(hex) {
  const { r, g, b } = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** 对比度 1~21 */
export function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** amount < 0 变暗，> 0 变亮，范围 -1 ~ 1 */
export function shade(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  return rgbToHex({
    r: rgb.r + (t - rgb.r) * p,
    g: rgb.g + (t - rgb.g) * p,
    b: rgb.b + (t - rgb.b) * p,
  });
}

export function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 半透明色叠加在底色上的实际颜色（用于按真实观感计算对比度） */
export function compositeOver(hex, alpha, bgHex) {
  const f = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
  const b = hexToRgb(bgHex) || { r: 255, g: 255, b: 255 };
  return rgbToHex({
    r: f.r * alpha + b.r * (1 - alpha),
    g: f.g * alpha + b.g * (1 - alpha),
    b: f.b * alpha + b.b * (1 - alpha),
  });
}

export const MIN_READABLE_CONTRAST = 4.5;

/**
 * 主色上的文字颜色：优先用白色（符合按钮的视觉习惯），
 * 只有当白色文字对比度不足 3:1（即主色偏浅）时才改用深色文字。
 */
export function pickOnPrimary(hex) {
  const c = normalizeHex(hex) || DEFAULT_ACCENT;
  return contrastRatio(c, '#ffffff') >= 3 ? '#ffffff' : '#1c1e21';
}

/** 标签（chip）配色：淡色底 + 同色系文字，文字会自动调整明度直到满足可读对比度 */
export function chipColors(hex, isDark) {
  const c = normalizeHex(hex) || DEFAULT_ACCENT;
  const alpha = isDark ? 0.22 : 0.14;
  const surface = isDark ? '#1b1e22' : '#ffffff';
  const bgSolid = compositeOver(c, alpha, surface); // 实际呈现的底色
  let amount = isDark ? 0.45 : -0.22;
  let text = shade(c, amount);
  for (let i = 0; i < 40 && contrastRatio(text, bgSolid) < MIN_READABLE_CONTRAST; i++) {
    amount += isDark ? 0.05 : -0.05;
    if (amount > 1 || amount < -1) break;
    text = shade(c, amount);
  }
  return { bg: rgba(c, alpha), bgSolid, text };
}

/**
 * 由强调色派生出一整套主题变量
 * @param {string} input 用户选择的颜色
 * @param {'light'|'dark'} theme
 */
export function deriveAccent(input, theme = 'light') {
  const primary = normalizeHex(input) || DEFAULT_ACCENT;
  const chip = chipColors(primary, theme === 'dark');
  return {
    primary,
    primaryStrong: shade(primary, -0.18),
    onPrimary: pickOnPrimary(primary),
    chipBg: chip.bg,
    chipText: chip.text,
  };
}

/** 预设色板（首项为默认色） */
export const PRESET_ACCENTS = [
  '#1e88e5', // 默认蓝
  '#00897b', // 青绿
  '#43a047', // 绿
  '#fb8c00', // 橙
  '#e53935', // 红
  '#d81b60', // 玫红
  '#8e24aa', // 紫
  '#5c6bc0', // 靛蓝
  '#546e7a', // 蓝灰
  '#795548', // 棕
];