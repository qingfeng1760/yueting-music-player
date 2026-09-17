import { initTheme } from './core/util.js';
import { store } from './core/store.js';
import { IDBAdapter } from './core/db.js';

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
  try {
    if (typeof currentUnmount === 'function') currentUnmount();
    currentUnmount = null;
    const mod = await route.load();
    pageEl.innerHTML = '';
    pageEl.scrollTop = 0;
    const ret = await mod.render(pageEl, ...params);
    if (typeof ret === 'function') currentUnmount = ret;
  } catch (err) {
    console.error('页面渲染失败', err);
    pageEl.innerHTML = `<div class="empty"><span class="empty-icon">⚠️</span>页面加载失败：<br>${String(err?.message || err)}</div>`;
  }
  setActiveTab(route.tab);
}

initTheme();
const adapter = new IDBAdapter();
await store.init(adapter);
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.__adapter = adapter; // 本地开发/验收时便于清库
}
const { mountMiniPlayer } = await import('./ui/miniplayer.js');
mountMiniPlayer();
window.addEventListener('hashchange', render);
render();
