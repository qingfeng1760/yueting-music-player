// 首页总览：问候 / 随机播放 / 今日推荐 / 模块摘要
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { greeting, escapeHtml, debounce } from '../core/util.js';
import { pickDaily } from '../core/rec.js';
import { searchAll } from '../core/search.js';
import { showSongActions } from '../ui/songActions.js';
import { renderSongList } from '../ui/songlist.js';
import { showToast } from '../ui/toast.js';

async function getPlayer() {
  try {
    const { player } = await import('../core/player.js');
    return player;
  } catch {
    showToast('播放器暂不可用');
    return null;
  }
}

export async function render(root) {
  const state = { query: '' };
  const unsubs = [bus.on('songs:changed', draw), bus.on('favorites:changed', draw), bus.on('playlists:changed', draw)];
  const now = new Date();
  const dateText = `${now.getMonth() + 1}月${now.getDate()}日`;

  root.innerHTML = `
    <div class="home-head">
      <button class="home-avatar" id="home-avatar" aria-label="进入我的">🎧</button>
      <div class="home-head-main">
        <h1 class="page-title" style="margin:0">${greeting(now)} </h1>
        <div class="home-head-sub">本地用户 · ${dateText}</div>
      </div>
    </div>
    <div class="home-search">
      <span class="home-search-icon" aria-hidden="true"></span>
      <input class="home-search-input" id="home-search" type="search"
             placeholder="搜索歌名、歌手、专辑或歌单" aria-label="搜索音乐">
      <button class="icon-btn" id="home-search-clear" hidden aria-label="清空搜索">✕</button>
    </div>
    <div id="home-body"></div>`;

  const body = root.querySelector('#home-body');
  const searchInput = root.querySelector('#home-search');
  const clearBtn = root.querySelector('#home-search-clear');
  root.querySelector('#home-avatar').onclick = () => { location.hash = '#/me'; };

  /** 按当前是否有关键字，决定展示搜索结果还是首页总览 */
  async function draw() {
    if (state.query.trim()) await drawSearch();
    else await drawHome();
  }

  /* ---------- 搜索结果 ---------- */
  async function drawSearch() {
    const [songs, playlists, favoriteIds] = await Promise.all([
      store.listSongs(), store.listPlaylists(), store.listFavoriteIds(),
    ]);
    const res = searchAll({ songs, playlists, query: state.query });
    if (!res.total) {
      body.innerHTML = `<div class="empty"><span class="empty-icon">🔍</span>没有找到与「${escapeHtml(res.query)}」相关的音乐<br>换个歌名或歌手试试</div>`;
      return;
    }
    body.innerHTML = `
      <div class="page-sub" style="margin:0 0 8px">找到 ${res.total} 个结果</div>
      ${res.playlists.length ? `
        <div style="margin-bottom:12px">
          <div class="search-group-title">歌单</div>
          <div class="search-playlists">
            ${res.playlists.map((p) => `
              <a class="search-playlist" href="#/playlist/${p.id}">
                <span class="search-playlist-dot" style="background:${p.color}"></span>
                <span class="search-playlist-name">${escapeHtml(p.name)}</span>
                <span class="search-playlist-count">${p.songCount} 首</span>
              </a>`).join('')}
          </div>
        </div>` : ''}
      ${res.songs.length ? `
        <div class="search-group-title">歌曲</div>
        <div id="search-songs"></div>` : ''}`;

    const listEl = body.querySelector('#search-songs');
    if (!listEl) return;
    renderSongList(listEl, res.songs, {
      hearts: new Set(favoriteIds),
      onPlay: async (song, idx) => {
        const player = await getPlayer();
        if (player) await player.playAll(res.songs, idx);
      },
      onToggleHeart: async (song) => {
        const r = await store.toggleFavorite(song.id);
        showToast(r.fav ? '已收藏 ♥' : '已取消收藏');
        await drawSearch();
      },
      onMore: (song) => showSongActions(song, { onChanged: drawSearch }),
    });
  }

  /* ---------- 首页总览 ---------- */
  async function drawHome() {
    const songs = await store.listSongs();
    if (!songs.length) {
      body.innerHTML = `
        <div class="empty">
          <span class="empty-icon"></span>
          欢迎使用悦听！<br>把电脑里的音乐导入进来，就能开始听了
        </div>
        <button class="btn btn-primary btn-block" id="home-import">＋ 导入本地音乐</button>`;
      body.querySelector('#home-import').onclick = () => { location.hash = '#/library/songs'; };
      return;
    }

    const [favoriteIds, playlists, historyGroups] = await Promise.all([
      store.listFavoriteIds(),
      store.listPlaylists(),
      store.getHistoryGrouped(),
    ]);
    const favSet = new Set(favoriteIds);
    const seedInfo = await store.getDailySeed();
    const daily = pickDaily(songs, {
      favoriteIds: favSet,
      now: Date.now(),
      dateStr: seedInfo.dateStr,
      batch: seedInfo.batch,
      n: Math.min(10, songs.length),
    });
    const recent = songs
      .filter((s) => s.lastPlayedAt)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, 3);
    const todayItems = historyGroups.find((g) => g.label === '今天')?.items.length || 0;
    const yesterdayItems = historyGroups.find((g) => g.label === '昨天')?.items.length || 0;
    const lastPlaylist = [...playlists].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];

    body.innerHTML = `
      <button class="btn btn-primary btn-block" id="home-shuffle" style="padding:16px;font-size:15.5px;margin-bottom:16px">
        🎲 随机播放全部（${songs.length} 首）
      </button>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b style="font-size:15.5px">今日推荐</b>
        <button class="btn" id="home-refresh" style="padding:5px 12px;font-size:12.5px">换一批 ↻</button>
      </div>
      <div class="daily-row" id="home-daily">
        ${daily.map((d) => `
          <div class="daily-card" data-id="${d.song.id}">
            <div class="daily-cover">${d.song.cover ? `<img src="${d.song.cover}" alt="">` : '🎵'}</div>
            <div class="daily-title">${escapeHtml(d.song.title)}</div>
            <div class="daily-artist">${escapeHtml(d.song.artist)}</div>
            <span class="chip daily-chip">${d.reason}</span>
          </div>`).join('')}
      </div>

      <b style="font-size:15.5px;display:block;margin:18px 0 8px">模块摘要</b>
      <div class="card summary-card" data-go="#/library/songs">
        <span class="summary-icon"></span>
        <div class="summary-main">
          <div class="summary-title">最近在听</div>
          <div class="summary-sub">${recent.length ? recent.map((s) => escapeHtml(s.title)).join(' · ') : '还没有播放记录'}</div>
        </div>
        <span class="summary-arrow">▸</span>
      </div>
      <div class="card summary-card" data-go="#/library/favorites">
        <span class="summary-icon">♥</span>
        <div class="summary-main">
          <div class="summary-title">我收藏的音乐</div>
          <div class="summary-sub">${favoriteIds.length ? `已收藏 ${favoriteIds.length} 首` : '还没收藏歌曲，点 ♡ 即可收藏'}</div>
        </div>
        <span class="summary-arrow">▸</span>
      </div>
      <div class="card summary-card" data-go="#/library/playlists">
        <span class="summary-icon"></span>
        <div class="summary-main">
          <div class="summary-title">我的歌单</div>
          <div class="summary-sub">${playlists.length ? `${playlists.length} 个歌单${lastPlaylist ? `，最近编辑「${escapeHtml(lastPlaylist.name)}」` : ''}` : '还没有歌单，去音乐库创建'}</div>
        </div>
        <span class="summary-arrow"></span>
      </div>
      <div class="card summary-card" data-go="#/history">
        <span class="summary-icon">📈</span>
        <div class="summary-main">
          <div class="summary-title">收听历史</div>
          <div class="summary-sub">今天 ${todayItems} 条 · 昨天 ${yesterdayItems} 条</div>
        </div>
        <span class="summary-arrow">▸</span>
      </div>`;

    body.querySelector('#home-shuffle').onclick = async () => {
      const player = await getPlayer();
      if (player) await player.playAll(songs, Math.floor(Math.random() * songs.length), 'shuffle');
    };
    body.querySelector('#home-refresh').onclick = async () => {
      await store.bumpDailySeed();
      await draw();
      showToast('已换一批');
    };
    body.querySelectorAll('.daily-card').forEach((card) => {
      card.onclick = async (e) => {
        const song = songs.find((s) => s.id === card.dataset.id);
        if (!song) return;
        if (e.target.closest('.daily-chip')) { await showSongActions(song, { onChanged: draw }); return; }
        const player = await getPlayer();
        if (player) await player.playAll(daily.map((d) => d.song), daily.findIndex((d) => d.song.id === song.id));
      };
      card.oncontextmenu = (e) => { e.preventDefault(); };
    });
    body.querySelectorAll('.summary-card').forEach((card) => {
      card.onclick = () => { location.hash = card.dataset.go; };
    });
  }

  searchInput.addEventListener('input', debounce(() => {
    state.query = searchInput.value;
    clearBtn.hidden = !state.query;
    draw();
  }, 200));
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    clearBtn.hidden = true;
    draw();
    searchInput.focus();
  });

  await draw();
  return () => unsubs.forEach((u) => u());
}