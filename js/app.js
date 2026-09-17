import { initTheme, applyAccent, getAccentPref } from './core/util.js';
import { store } from './core/store.js';
import { IDBAdapter } from './core/db.js';
import { clearDock, updateBottomBars } from './ui/dock.js';
import { recordNav } from './ui/nav.js';

const routes = [
  { re: /^#\/home$/, tab: 'home', load: () => import('./pages/home.js') },
  { re: /^#\/library\/(songs|favorites|playlists)$/, tab: 'library', load: () => import('./pages/library.js') },
  { re: /^#\/playlist\/([A-Za-z0-9-]+)$/, tab: 'library', load: () => import('./pages/playlistDetail.js') },
  { re: /^#\/liked$/, tab: 'me', load: () => import('./pages/liked.js') },
  { re: /^#\/games$/, tab: 'me', load: () => import('./pages/games.js') },
  { re: /^#\/me$/, tab: 'me', load: () => import('./pages/me.js') },
  { re: /^#\/history$/, tab: 'me', load: () => import('./pages/history.js') },
  { re: /^#\/settings$/, tab: 'me', load: () => import('./pages/settings.js') },
  { re: /^#\/playing$/, tab: null, load: () => import('./pages/playing.js') },
];

const pageEl = document.getElementById('page');
let currentUnmount = null;

function setActiveTab(tab) {
  document.querySelectorAll('#tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });
}

async function render() {
  const hash = location.hash || '#/home';
  const route = routes.find((r) => r.re.test(hash)) || routes[0];
  const params = hash.match(route.re)?.slice(1) || [];
  recordNav(hash);
  try {
    if (typeof currentUnmount === 'function') currentUnmount();
    currentUnmount = null;
    clearDock(); // 换页时清掉上一页的悬浮元素
    const mod = await route.load();
    pageEl.innerHTML = '';
    pageEl.scrollTop = 0;
    const ret = await mod.render(pageEl, ...params);
    if (typeof ret === 'function') currentUnmount = ret;
  } catch (err) {
    console.error('页面渲染失败', err);
    pageEl.innerHTML = `<div class="empty"><span class="empty-icon">⚠️</span>页面加载失败：<br>${String(err?.message || err)}</div>`;
  }
  clearTimeout(window.__dockTimer);
  window.__dockTimer = setTimeout(updateBottomBars, 0); // 等布局稳定后再定位悬浮层
  setActiveTab(route.tab);
}

initTheme();
// 支持 ?db=xxx 指定数据库名：UI 自动化测试用独立数据库，避免污染真实音乐数据
const dbName = new URLSearchParams(location.search).get('db') || undefined;
const adapter = new IDBAdapter(dbName);
await store.init(adapter);
applyAccent(await store.getSetting('accent', getAccentPref())); // 自定义界面颜色
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.__adapter = adapter; // 本地开发/验收时便于清库
}
const { mountMiniPlayer } = await import('./ui/miniplayer.js');
mountMiniPlayer();
window.addEventListener('hashchange', render);
window.addEventListener('resize', updateBottomBars);
render();
