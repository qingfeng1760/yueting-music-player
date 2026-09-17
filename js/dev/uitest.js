// 界面自检：在 iframe 中驱动真实 App，做 DOM/布局层面的断言
// 每个界面问题/功能都应有对应的检查项。

const results = [];
const casesEl = document.getElementById('cases');
const summaryEl = document.getElementById('summary');
const frame = document.getElementById('app');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}

function rect(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
}

/** 两个矩形是否相交（含 0.5px 容差，避免像素级边界误判） */
function overlaps(a, b, tol = 0.5) {
  return !(
    a.right <= b.left + tol || a.left >= b.right - tol ||
    a.bottom <= b.top + tol || a.top >= b.bottom - tol
  );
}

const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

/* ============ 通用操作辅助 ============ */
let doc = null;
let win = null;

async function appReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const d = frame.contentDocument;
      if (d && d.getElementById('tabbar') && d.getElementById('dock')) return true;
    } catch { /* 忽略跨域瞬间 */ }
    await sleep(100);
  }
  throw new Error('应用未在 8 秒内加载完成');
}

async function nav(hash) {
  win.location.hash = hash;
  await sleep(600);
}

/** 注入开发辅助模块（seed/player/wipe）到 iframe 应用里 */
async function injectDev() {
  if (win.__store) return;
  const s = doc.createElement('script');
  s.type = 'module';
  s.src = '/js/dev/seed.js';
  doc.head.appendChild(s);
  for (let i = 0; i < 60; i++) {
    if (win.__store && win.__seedTone && win.__player) return;
    await sleep(100);
  }
  throw new Error('开发辅助模块注入失败');
}

async function resetData() {
  await injectDev();
  for (const t of ['songs', 'playlists', 'playlist_songs', 'favorites', 'history', 'settings', 'player_state']) {
    await win.__adapter?.clear(t);
  }
  // 若当前已在首页，hash 赋值相同值不会触发重渲染，先绕一下强制刷新
  if (win.location.hash === '#/home') {
    win.location.hash = '#/me';
    await sleep(150);
  }
  win.location.hash = '#/home';
  await waitFor(() => doc.querySelector('#page .home-avatar'), 4000);
}

/* ============ 检查项 ============ */

check('悬浮按钮不遮挡底部 Tab 栏（无播放时）', async () => {
  await resetData();
  await nav('#/library/songs');
  const fab = doc.querySelector('#dock .fab');
  assert(fab, '音乐库页应有「导入音乐」悬浮按钮');
  const fabR = rect(fab);
  const tabR = rect(doc.getElementById('tabbar'));
  assert(!overlaps(fabR, tabR), `悬浮按钮与 Tab 栏重叠：${JSON.stringify(fabR)} / ${JSON.stringify(tabR)}`);
  const appR = rect(doc.getElementById('app'));
  assert(fabR.bottom <= appR.bottom, '悬浮按钮超出应用可视区域');
  assert(fabR.right <= appR.right, '悬浮按钮超出应用右边界');
});

check('悬浮按钮不遮挡迷你播放条（播放中）', async () => {
  await resetData();
  await injectDev();
  await win.__seedTone('界面自检音', '合成器', 30);
  const songs = await win.__store.listSongs();
  await win.__player.playAll(songs, 0);
  await sleep(900);
  await nav('#/library/songs');
  const mini = doc.getElementById('miniplayer');
  assert(getComputedStyle(mini).display !== 'none', '播放后迷你播放条应显示');
  const fab = doc.querySelector('#dock .fab');
  assert(fab, '应存在导入悬浮按钮');
  const fabR = rect(fab);
  const miniR = rect(mini);
  const tabR = rect(doc.getElementById('tabbar'));
  assert(!overlaps(fabR, miniR), `悬浮按钮与迷你播放条重叠：${JSON.stringify(fabR)} / ${JSON.stringify(miniR)}`);
  assert(!overlaps(fabR, tabR), '悬浮按钮与 Tab 栏重叠');
});

check('多选操作条不遮挡底部导航', async () => {
  await resetData();
  await injectDev();
  await win.__seed();
  await nav('#/library/songs');
  doc.querySelector('#lib-multi').click();
  await sleep(600);
  const bar = doc.querySelector('#dock .batchbar');
  assert(bar, '多选模式应出现批量操作条');
  const barR = rect(bar);
  assert(!overlaps(barR, rect(doc.getElementById('tabbar'))), '批量操作条与 Tab 栏重叠');
  const appR = rect(doc.getElementById('app'));
  assert(barR.bottom <= appR.bottom, '批量操作条超出应用区域');
  // 退出多选后应恢复导入按钮
  [...bar.querySelectorAll('[data-b]')].find((b) => b.textContent.includes('✕'))?.click();
  await sleep(600);
  assert(doc.querySelector('#dock .fab'), '退出多选后应恢复导入悬浮按钮');
});

/** 轮询等待条件成立（默认最多 4 秒），用于等待异步渲染/持久化生效 */
async function waitFor(fn, timeout = 4000, interval = 150) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('等待超时：条件未在期限内成立');
    await sleep(interval);
  }
}

/** 直接以某个地址重新加载 iframe（模拟直接打开二级页面链接） */
async function reloadAt(hash) {
  // 加时间戳参数：相同 URL 的 src 赋值会被浏览器忽略，导致「重载」失效
  frame.src = `index.html?db=yueting-uitest&t=${Date.now()}${hash}`;
  await sleep(1200);
  await appReady();
  doc = frame.contentDocument;
  win = frame.contentWindow;
  await sleep(300);
  await injectDev(); // 重载后页面上下文是新的，需要重新注入测试辅助模块
}

/* ============ 检查项 ============ */

check('二级页面左上角有返回按钮', async () => {
  await resetData();
  const pages = ['#/liked', '#/history', '#/games', '#/settings'];
  for (const h of pages) {
    await nav(h);
    const btn = doc.querySelector('#page [data-back]');
    assert(btn, `${h} 缺少返回按钮`);
    const b = rect(btn);
    const pageR = rect(doc.getElementById('page'));
    assert(b.left - pageR.left < 60, `${h} 返回按钮不在左侧（left=${Math.round(b.left - pageR.left)}px）`);
    assert(b.top - pageR.top < 60, `${h} 返回按钮不在顶部（top=${Math.round(b.top - pageR.top)}px）`);
  }
  // 歌单详情页
  await injectDev();
  const pl = await win.__store.createPlaylist('返回按钮自检');
  await nav('#/playlist/' + pl.id);
  assert(doc.querySelector('#page [data-back]'), '歌单详情页缺少返回按钮');
});

check('点返回按钮回到上一页（从「我的」进入的场景）', async () => {
  await reloadAt('#/me');
  await nav('#/settings');
  doc.querySelector('#page [data-back]').click();
  await sleep(700);
  assert(win.location.hash === '#/me', `期望回到 #/me，实际 ${win.location.hash}`);
});

check('直接打开二级页面时，返回按钮回退到兜底页面', async () => {
  await reloadAt('#/history'); // 栈里只有这一页，没有上一页
  assert(doc.querySelector('#page [data-back]'), '历史页缺少返回按钮');
  doc.querySelector('#page [data-back]').click();
  await sleep(700);
  assert(win.location.hash === '#/me', `深链打开时返回应回退到 #/me，实际 ${win.location.hash}`);
  await reloadAt('#/home');
});

check('自定义界面颜色：立即生效并持久化', async () => {
  await resetData();
  await nav('#/settings');
  const target = '#8e24aa';
  const swatch = doc.querySelector(`.swatch[data-color="${target}"]`);
  assert(swatch, '设置页应有预设色板');
  swatch.click();
  const primaryOf = () => win.getComputedStyle(doc.documentElement).getPropertyValue('--primary').trim();
  await waitFor(() => primaryOf().toLowerCase() === target, 3000);
  // 主按钮应跟着变色
  const primaryBtn = doc.querySelector('.btn-primary');
  if (primaryBtn) {
    const bg = win.getComputedStyle(primaryBtn).backgroundColor;
    assert(bg.includes('142, 36, 170'), `主按钮背景未跟随主色：${bg}`);
  }
  // 重新加载后仍保持（持久化）
  await reloadAt('#/settings');
  await waitFor(() => primaryOf().toLowerCase() === target, 4000);
  const saved = await win.__store.getSetting('accent');
  assert(saved === target, `设置未持久化：${saved}`);
});

check('自定义界面颜色：恢复默认色', async () => {
  await resetData();
  await nav('#/settings');
  doc.querySelector(`.swatch[data-color="#e53935"]`)?.click();
  const primaryOf = () => win.getComputedStyle(doc.documentElement).getPropertyValue('--primary').trim();
  await waitFor(() => primaryOf().toLowerCase() === '#e53935', 3000);
  doc.querySelector('#accent-reset').click();
  await waitFor(() => primaryOf().toLowerCase() === '#1e88e5', 3000);
});

check('自定义界面颜色：任意颜色下按钮文字保持可读', async () => {
  await resetData();
  await win.__store.setSetting('accent', '#ffeb3b');
  await reloadAt('#/settings');
  const varOf = (name) => win.getComputedStyle(doc.documentElement).getPropertyValue(name).trim();
  await waitFor(() => varOf('--primary').toLowerCase() === '#ffeb3b', 4000);
  assert(varOf('--on-primary') === '#1c1e21', `浅色主色上文字应转为深色，实际 ${varOf('--on-primary')}`);
  const chipText = varOf('--chip-text');
  assert(/^#[0-9a-f]{6}$/i.test(chipText), `标签文字色应为合法颜色，实际 ${chipText}`);
});

check('首页左上角显示用户头像，点击进入「我的」', async () => {
  await resetData();
  await nav('#/home');
  const avatar = doc.querySelector('#page .home-avatar');
  assert(avatar, '首页左上角应有头像');
  const a = rect(avatar);
  const pageR = rect(doc.getElementById('page'));
  assert(a.left - pageR.left < 24, `头像应贴左上角（left=${Math.round(a.left - pageR.left)}px）`);
  assert(a.top - pageR.top < 30, `头像应贴左上角（top=${Math.round(a.top - pageR.top)}px）`);
  assert(a.width >= 40 && a.height >= 40, '头像尺寸过小，不易点击');
  // 头像在问候语左侧
  const greet = doc.querySelector('#page .home-head-main .page-title');
  assert(greet, '首页应保留问候语');
  assert(a.right <= rect(greet).left + 1, '头像应位于问候语左侧');
  // 点击进入我的
  avatar.click();
  await sleep(700);
  assert(win.location.hash === '#/me', `点击头像应进入我的，实际 ${win.location.hash}`);
});

check('首页搜索：按歌名找到歌曲并可播放', async () => {
  await resetData();
  await injectDev();
  await win.__seed(); // 6 首合成歌曲（含「晴天」「海阔天空」「七里香」）
  await nav('#/home');
  const input = doc.querySelector('#home-search');
  assert(input, '首页应有搜索框');
  input.value = '晴天';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  const listOf = () => [...doc.querySelectorAll('#home-body .song-title')].map((e) => e.textContent);
  await waitFor(() => listOf().includes('晴天'), 4000);
  const titles = listOf();
  assert(titles.length === 1, `「晴天」应只匹配 1 首，实际 ${JSON.stringify(titles)}`);
  assert(doc.getElementById('home-body').textContent.includes('找到 1 个结果'), '应显示结果数量');
  // 首页总览内容应让位给搜索结果
  assert(!doc.querySelector('.daily-row'), '搜索时不应同时显示今日推荐');
  // 点击播放
  doc.querySelector('#home-body .song-item').click();
  await sleep(900);
  assert(doc.getElementById('mini-title')?.textContent === '晴天', '点击结果应开始播放该歌曲');
});

check('首页搜索：可搜到歌单', async () => {
  await resetData();
  await injectDev();
  await win.__store.createPlaylist('通勤路上的歌');
  await nav('#/home');
  const input = doc.querySelector('#home-search');
  input.value = '通勤';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  await waitFor(() => doc.querySelector('.search-playlist'), 4000);
  const name = doc.querySelector('.search-playlist .search-playlist-name').textContent;
  assert(name === '通勤路上的歌', `歌单结果不正确：${name}`);
  // 点击进入歌单详情
  doc.querySelector('.search-playlist').click();
  await waitFor(() => win.location.hash.startsWith('#/playlist/'), 3000);
});

check('首页搜索：无匹配时给出提示，清空后恢复首页', async () => {
  await resetData();
  await injectDev();
  await win.__seed();
  await nav('#/home');
  const input = doc.querySelector('#home-search');
  input.value = 'zzz不存在的歌';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  await waitFor(() => doc.getElementById('home-body').textContent.includes('没有找到'), 4000);
  // 清空
  input.value = '';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  await waitFor(() => !!doc.querySelector('.daily-row'), 4000);
  assert(!doc.getElementById('home-body').textContent.includes('没有找到'), '清空后应恢复首页总览');
});

check('快速连续切换页面不会显示错乱（渲染竞态）', async () => {
  await resetData();
  await injectDev();
  await win.__store.createPlaylist('竞态自检歌单');
  const pls = await win.__store.listPlaylists();
  // 连续切换三个页面，不等中间渲染完成
  win.location.hash = '#/playlist/' + pls[0].id;
  win.location.hash = '#/library/songs';
  win.location.hash = '#/home';
  await waitFor(() => doc.querySelector('#page .home-avatar'), 5000);
  await sleep(1500); // 给可能迟到的旧渲染留出覆盖窗口
  assert(win.location.hash === '#/home', `地址应停在首页，实际 ${win.location.hash}`);
  assert(doc.querySelector('#page .home-search'), '首页搜索框应存在（页面被旧渲染覆盖了）');
  assert(!doc.getElementById('page').textContent.includes('歌单不存在'), '不应残留歌单页内容');
});

/* ============ 运行 ============ */
(async () => {
  await appReady();
  doc = frame.contentDocument;
  win = frame.contentWindow;

  for (const c of checks) {
    try {
      await c.fn();
      results.push({ name: c.name, pass: true });
    } catch (e) {
      results.push({ name: c.name, pass: false, error: e?.message || String(e) });
    }
  }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  summaryEl.textContent = fail
    ? `❌ ${pass}/${results.length} 通过，${fail} 项失败`
    : `✅ 全部通过（${pass}/${results.length}）`;
  summaryEl.style.color = fail ? 'var(--danger)' : 'var(--success)';
  casesEl.innerHTML = results.map((r) => `
    <div class="case ${r.pass ? 'pass' : 'fail'}">
      <span class="tag">${r.pass ? 'PASS' : 'FAIL'}</span>
      <span>${r.name}${r.error ? `<span class="err">${r.error}</span>` : ''}</span>
    </div>`).join('');
  window.__uitest = { pass, fail, total: results.length, results };
})();