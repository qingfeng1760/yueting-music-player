// 历史记录：按日期分组、搜索、单条删除、清空
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { escapeHtml, fmtTime, debounce } from '../core/util.js';
import { showToast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm.js';
import { actionSheet } from '../ui/sheet.js';

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
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h1 class="page-title" style="margin:0">历史记录</h1>
      <button class="btn btn-danger" id="his-clear" style="padding:7px 14px">清空</button>
    </div>
    <div class="toolbar">
      <input class="search-input" id="his-search" placeholder="搜索历史中的歌名 / 歌手">
    </div>
    <div id="his-body"></div>`;
  const bodyEl = root.querySelector('#his-body');
  const unsubs = [bus.on('songs:changed', draw)];

  async function draw() {
    const groups = await store.getHistoryGrouped({ query: state.query });
    const total = groups.flatMap((g) => g.items).length;
    if (!total) {
      bodyEl.innerHTML = `<div class="empty"><span class="empty-icon">🕘</span>${
        state.query ? '没有匹配的历史记录' : '还没有播放记录<br>播放过的歌会按时间出现在这里'}</div>`;
      return;
    }
    bodyEl.innerHTML = groups.map((g) => `
      <div style="margin-bottom:14px">
        <div class="page-sub" style="margin:0 0 6px;font-weight:600">${escapeHtml(g.label)} · ${g.items.length} 条</div>
        ${g.items.map((it) => `
          <div class="song-item" data-id="${it.id}" data-sid="${it.song.id}">
            <div class="song-cover">${it.song.cover ? `<img src="${it.song.cover}" alt="">` : '🎵'}</div>
            <div class="song-meta">
              <div class="song-title">${escapeHtml(it.song.title)}</div>
              <div class="song-sub">${escapeHtml(it.song.artist)} · ${fmtTime(it.song.duration)} · ${new Date(it.playedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <button class="icon-btn" data-more="${it.id}" aria-label="更多操作">⋮</button>
          </div>`).join('')}
      </div>`).join('');

    bodyEl.onclick = async (e) => {
      const more = e.target.closest('[data-more]');
      const row = e.target.closest('.song-item');
      if (!row) return;
      const songId = row.dataset.sid;
      if (more) {
        const v = await actionSheet('历史记录', [
          { label: '▶ 播放这首歌', value: 'play' },
          { label: '➖ 从历史中删除这条', value: 'del', danger: true },
        ]);
        if (v === 'play') {
          const song = await store.getSong(songId);
          const player = await getPlayer();
          if (song && player) await player.playAll([song], 0);
        } else if (v === 'del') {
          await store.deleteHistoryEntry(more.dataset.more);
          showToast('已删除该条记录');
          await draw();
        }
        return;
      }
      const song = await store.getSong(songId);
      const player = await getPlayer();
      if (song && player) await player.playAll([song], 0);
    };
  }

  root.querySelector('#his-search').addEventListener('input', debounce((e) => {
    state.query = e.target.value;
    draw();
  }, 250));
  root.querySelector('#his-clear').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '清空历史记录',
      text: '将删除全部播放历史。歌曲、收藏、歌单和播放次数不受影响。',
      danger: true, okText: '清空',
    });
    if (ok) { await store.clearHistory(); showToast('历史已清空'); await draw(); }
  });

  await draw();
  return () => unsubs.forEach((u) => u());
}