// 喜欢（最近喜欢听）：按播放与收藏习惯自动生成的推荐列表
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { escapeHtml } from '../core/util.js';
import { rankSongs } from '../core/rec.js';
import { showToast } from '../ui/toast.js';
import { showSongActions } from '../ui/songActions.js';
import { renderSongList } from '../ui/songlist.js';
import { pageHeader, bindBack } from '../ui/nav.js';

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
  let seedCounter = 0;
  root.innerHTML = `
    ${pageHeader('喜欢', { sub: '根据你的播放次数和收藏习惯自动生成，多听几次就会更准' })}
    <div id="liked-head"></div>
    <div id="liked-list"></div>`;
  bindBack(root, '#/me');
  const headEl = root.querySelector('#liked-head');
  const listEl = root.querySelector('#liked-list');
  const unsubs = [bus.on('favorites:changed', draw), bus.on('songs:changed', draw)];

  async function draw() {
    const songs = await store.listSongs();
    if (!songs.length) {
      headEl.innerHTML = '';
      listEl.innerHTML = `<div class="empty"><span class="empty-icon"></span>曲库还是空的<br>先去音乐库导入音乐，这里就会有你专属的推荐</div>`;
      return;
    }
    const favoriteIds = new Set(await store.listFavoriteIds());
    const ranked = rankSongs(songs, { favoriteIds, now: Date.now(), seed: `liked-${seedCounter}`, n: songs.length });
    const hasHistory = ranked.some((x) => x.song.playCount > 0);

    headEl.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center">
        <div style="flex:1">
          <b>${ranked.length} 首推荐</b>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px">
            ${hasHistory ? '播放和收藏都会让推荐更贴合你的口味' : '还没有播放记录，先听听看，推荐会逐渐变化'}
          </div>
        </div>
        <button class="btn" id="liked-refresh" style="padding:8px 14px">↻ 刷新</button>
        <button class="btn btn-primary" id="liked-play" style="padding:8px 14px">▶ 播放</button>
      </div>`;
    headEl.querySelector('#liked-refresh').onclick = async () => { seedCounter++; await draw(); showToast('推荐已刷新'); };
    headEl.querySelector('#liked-play').onclick = async () => {
      const player = await getPlayer();
      if (player) await player.playAll(ranked.map((x) => x.song), 0);
    };

    const hearts = favoriteIds;
    renderSongList(listEl, ranked.map((x) => x.song), {
      hearts,
      trailing: (song) => {
        const item = ranked.find((x) => x.song.id === song.id);
        return `<span class="chip" style="margin-right:4px">${escapeHtml(item.reason)}</span>`;
      },
      emptyText: '暂无推荐',
      onPlay: async (song, idx) => {
        const player = await getPlayer();
        if (player) await player.playAll(ranked.map((x) => x.song), idx);
      },
      onToggleHeart: async (song) => {
        const r = await store.toggleFavorite(song.id);
        showToast(r.fav ? '已收藏 ♥' : '已取消收藏');
        await draw();
      },
      onMore: (song) => showSongActions(song, { onChanged: draw }),
    });
  }

  await draw();
  return () => unsubs.forEach((u) => u());
}