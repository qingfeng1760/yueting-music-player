// 我的：用户卡 + 功能入口（喜欢/历史/游戏/数据与设置/云同步占位）
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';

export async function render(root) {
  const unsubs = [
    bus.on('songs:changed', draw),
    bus.on('favorites:changed', draw),
    bus.on('playlists:changed', draw),
  ];
  root.innerHTML = `<h1 class="page-title">我的</h1><div id="me-body"></div>`;
  const body = root.querySelector('#me-body');

  async function draw() {
    const [songs, favIds, playlists] = await Promise.all([
      store.listSongs(), store.listFavoriteIds(), store.listPlaylists(),
    ]);
    body.innerHTML = `
      <div class="card" style="display:flex;align-items:center;gap:12px">
        <div class="me-avatar">🎧</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:16px">本地用户</div>
          <div style="font-size:12.5px;color:var(--text-2);margin-top:3px">
            本地 ${songs.length} 首 · 收藏 ${favIds.length} 首 · 歌单 ${playlists.length} 个
          </div>
        </div>
      </div>

      <div class="card" style="padding:6px 4px">
        <button class="me-item" data-go="#/liked">
          <span class="me-icon">❤️</span><span class="me-text">喜欢</span>
          <span class="me-hint">按你的口味自动推荐</span><span class="summary-arrow">▸</span>
        </button>
        <button class="me-item" data-go="#/history">
          <span class="me-icon">🕘</span><span class="me-text">历史记录</span>
          <span class="me-hint">看过的都在这里</span><span class="summary-arrow"></span>
        </button>
        <button class="me-item" data-go="#/games">
          <span class="me-icon">🎮</span><span class="me-text">游戏娱乐</span>
          <span class="me-hint">敬请期待</span><span class="summary-arrow"></span>
        </button>
      </div>

      <div class="card" style="padding:6px 4px">
        <button class="me-item" data-go="#/settings">
          <span class="me-icon">📊</span><span class="me-text">数据与设置</span>
          <span class="me-hint">统计 · 备份 · 主题</span><span class="summary-arrow">▸</span>
        </button>
        <button class="me-item" disabled style="opacity:.55">
          <span class="me-icon">☁️</span><span class="me-text">登录 / 云同步</span>
          <span class="me-hint">即将支持</span>
        </button>
        <button class="me-item" id="me-about">
          <span class="me-icon">ℹ️</span><span class="me-text">关于悦听</span>
          <span class="me-hint">v1.0 本地版</span><span class="summary-arrow">▸</span>
        </button>
      </div>`;

    body.querySelectorAll('.me-item[data-go]').forEach((btn) => {
      btn.onclick = () => { location.hash = btn.dataset.go; };
    });
    body.querySelector('#me-about').onclick = async () => {
      const { actionSheet } = await import('../ui/sheet.js');
      await actionSheet('关于悦听 v1.0', [
        { label: '本地音乐播放器 · 数据只存在这台电脑的浏览器里', value: 'noop' },
        { label: '建议固定使用同一浏览器，不要用无痕模式', value: 'noop' },
        { label: '关闭', value: 'close' },
      ]);
    };
  }

  await draw();
  return () => unsubs.forEach((u) => u());
}