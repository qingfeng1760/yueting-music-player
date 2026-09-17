// 通用工具函数（纯函数，可在 Node 测试中运行）

/** 秒 -> m:ss */
export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Date/时间戳 -> 'YYYY-MM-DD'（本地时区） */
export function dateKey(input, now = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 时间戳 -> 历史分组标签：今天 / 昨天 / YYYY-MM-DD */
export function dateLabel(ts, now = new Date()) {
  const d = ts instanceof Date ? ts : new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ONE = 86400000;
  if (day === today) return '今天';
  if (day === today - ONE) return '昨天';
  return dateKey(d, now);
}

/** 文件名解析兜底："歌手 - 歌名.mp3" -> {artist, title} */
export function parseFileName(name) {
  const base = String(name).replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.{1,60}?)\s*[-–—]\s*(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: '', title: base };
}

/** 按时段问候 */
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return '早上好';
  if (h >= 12 && h < 18) return '下午好';
  return '晚上好';
}

export function uid() {
  return (crypto?.randomUUID?.() ||
    'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/* ===== 主题 ===== */
const THEME_KEY = 'yt_theme';

export function getThemePref() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

export function applyTheme(pref) {
  localStorage.setItem(THEME_KEY, pref);
  let dark = pref === 'dark';
  if (pref === 'system') {
    dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function initTheme() {
  applyTheme(getThemePref());
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => { if (getThemePref() === 'system') applyTheme('system'); });
}
