// 歌单详情：播放/改名/换色/删除/移除/拖动排序/多选
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { escapeHtml } from '../core/util.js';
import { showToast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm.js';
import { actionSheet } from '../ui/sheet.js';
import { playlistPicker } from '../ui/playlistPicker.js';
import { showSongActions } from '../ui/songActions.js';
import { renderSongList } from '../ui/songlist.js';
import { setDock, clearDock, dockEl } from '../ui/dock.js';
import { PLAYLIST_COLORS } from '../core/store.js';

async function getPlayer() {
  try {
    const { player } = await import('../core/player.js');
    return player;
  } catch {
    showToast('播放器暂不可用');
    return null;
  }
}

function inputDialog(title, value = '') {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'dialog-mask';
    mask.innerHTML = `
      <div class="dialog">
        <h3>${escapeHtml(title)}</h3>
        <input class="search-input" id="dlg-input" style="width:100%;margin-bottom:16px" aria-label="歌单名称">
        <div class="dialog-actions">
          <button class="btn" data-act="cancel">取消</button>
          <button class="btn btn-primary" data-act="ok">确定</button>
        </div>
      </div>`;
    const input = mask.querySelector('#dlg-input');
    input.value = value;
    const close = (v) => { mask.remove(); resolve(v); };
    mask.addEventListener('click', (e) => {
      if (e.target === mask) close(null);
      if (e.target.closest('[data-act=cancel]')) close(null);
      if (e.target.closest('[data-act=ok]')) close(input.value);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(input.value); });
    document.getElementById('app').appendChild(mask);
    input.focus();
  });
}

export async function render(root, playlistId) {
  const state = { selectable: false, selected: new Set() };
  let detail = await store.getPlaylistDetail(playlistId);
  if (!detail) {
    root.innerHTML = `<div class="empty"><span class="empty-icon"></span>歌单不存在或已被删除</div>`;
    return;
  }

  root.innerHTML = `
    <div id="pd-head"></div>
    <div class="toolbar" id="pd-tools"></div>
    <div id="pd-list"></div>`;
  const headEl = root.querySelector('#pd-head');
  const toolsEl = root.querySelector('#pd-tools');
  const listEl = root.querySelector('#pd-list');

  let playingId = null;
  try { const { player } = await import('../core/player.js'); playingId = player.currentSongId; } catch { /* 未就绪 */ }

  async function reload() {
    detail = await store.getPlaylistDetail(playlistId);
    if (!detail) { location.hash = '#/library/playlists'; return; }
    const { playlist: pl, songs } = detail;
    headEl.innerHTML = `
      <div class="card" style="display:flex;gap:12px;align-items:center">
        <div style="width:64px;height:64px;border-radius:12px;background:${pl.color};display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:17px">${escapeHtml(pl.name)}</div>
          <div style="font-size:12.5px;color:var(--text-2);margin-top:3px">${songs.length} 首</div>
        </div>
        <button class="icon-btn" id="pd-edit" aria-label="歌单设置">⋮</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-primary btn-block" id="pd-play" ${songs.length ? '' : 'disabled'}>▶ 播放全部</button>
        <button class="btn btn-block" id="pd-shuffle" ${songs.length ? '' : 'disabled'}>🎲 随机</button>
      </div>`;
    headEl.querySelector('#pd-play').onclick = async () => {
      const player = await getPlayer();
      if (player) await player.playAll(songs, 0);
    };
    headEl.querySelector('#pd-shuffle').onclick = async () => {
      const player = await getPlayer();
      if (player) await player.playAll(songs, 0, 'shuffle');
    };
    headEl.querySelector('#pd-edit').onclick = async () => {
      const v = await actionSheet(pl.name, [
        { label: '✏️ 重命名', value: 'rename' },
        { label: '🎨 更换颜色', value: 'color' },
        { label: '＋ 添加歌曲到歌单', value: 'add' },
        { label: '🗑 删除歌单（保留歌曲）', value: 'del', danger: true },
      ]);
      if (v === 'rename') {
        const name = await inputDialog('重命名歌单', pl.name);
        if (name?.trim()) { await store.updatePlaylist(pl.id, { name: name.trim() }); showToast('已重命名'); await reload(); }
      } else if (v === 'color') {
        const idx = PLAYLIST_COLORS.indexOf(pl.color);
        const color = PLAYLIST_COLORS[(idx + 1) % PLAYLIST_COLORS.length];
        await store.updatePlaylist(pl.id, { color });
        showToast('已更换颜色');
        await reload();
      } else if (v === 'add') {
        await addSongsFlow();
      } else if (v === 'del') {
        const ok = await confirmDialog({
          title: '删除歌单', text: `将删除歌单「${pl.name}」，歌单里的歌曲仍保留在曲库中。`,
          danger: true, okText: '删除歌单',
        });
        if (ok) { await store.deletePlaylist(pl.id); showToast('歌单已删除'); bus.emit('playlists:changed'); location.hash = '#/library/playlists'; }
      }
    };

    toolsEl.innerHTML = `
      <span class="page-sub" style="margin:0;flex:1">${songs.length ? '长按拖动可调整顺序' : ''}</span>
      <button class="btn" id="pd-multi" style="padding:7px 14px">${state.selectable ? '取消' : '多选'}</button>`;
    toolsEl.querySelector('#pd-multi').onclick = async () => {
      state.selectable = !state.selectable;
      state.selected.clear();
      await reload();
    };

    const hearts = new Set(await store.listFavoriteIds());
    renderSongList(listEl, songs, {
      playingId, hearts, selectable: state.selectable, selected: state.selected,
      emptyText: '这个歌单还是空的，点右上角 ⋮ 添加歌曲',
      onPlay: async (song, idx) => {
        const player = await getPlayer();
        if (player) await player.playAll(songs, idx);
      },
      onToggleHeart: async (song) => {
        const r = await store.toggleFavorite(song.id);
        showToast(r.fav ? '已收藏 ♥' : '已取消收藏');
        await reload();
      },
onMore: (song) => showSongActions(song, {
        canDelete: false,
        extraActs: [{ label: '➖ 从本歌单移除', value: 'rmFromPlaylist', danger: true }],
        onExtra: async (val) => {
          if (val === 'rmFromPlaylist') {
            await store.removeFromPlaylist(pl.id, song.id);
            showToast('已从歌单移除');
            await reload();
          }
        },
        onChanged: reload,
      }),
      onCheck: async (song, checked) => {
        if (checked) state.selected.add(song.id); else state.selected.delete(song.id);
        paintBatch();
      },
      trailing: () => '<span class="drag-handle" title="拖动排序">⠿</span>',
    });
    enableDragSort(listEl, songs.map((s) => s.id), pl.id);
    paintBatch();
  }

  function paintBatch() {
    let bar = root.querySelector('.batchbar');
    if (!state.selectable) { clearDock(); bar?.remove(); return; }
    setDock(`
      <div class="batchbar">
        <button data-b="play">▶ 播放</button>
        <button data-b="rm">➖ 移出歌单</button>
        <button data-b="fav">♥ 收藏</button>
        <button data-b="cancel">✕ 取消</button>
      </div>`);
    bar = dockEl()?.querySelector('.batchbar');
    if (!bar) return;
    bar.onclick = async (e) => {
      const act = e.target.closest('[data-b]')?.dataset.b;
      if (!act) return;
      const ids = [...state.selected];
      if (act === 'cancel') { state.selectable = false; state.selected.clear(); await reload(); return; }
      if (!ids.length) { showToast('先勾选歌曲'); return; }
      if (act === 'play') {
        const songs = await store.getSongs(ids);
        const player = await getPlayer();
        if (player) await player.playAll(songs, 0);
        state.selectable = false; state.selected.clear(); await reload();
      } else if (act === 'rm') {
        for (const id of ids) await store.removeFromPlaylist(playlistId, id);
        showToast(`已移除 ${ids.length} 首`);
        state.selected.clear();
        await reload();
      } else if (act === 'fav') {
        for (const id of ids) await store.toggleFavorite(id);
        showToast('已收藏所选歌曲');
        await reload();
      }
    };
  }

  async function addSongsFlow() {
    const all = await store.listSongs({ sortBy: 'title' });
    const inList = new Set(detail.songs.map((s) => s.id));
    const candidates = all.filter((s) => !inList.has(s.id));
    if (!candidates.length) { showToast('曲库里没有可添加的歌曲'); return; }
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = `
      <div class="sheet queue-sheet">
        <div class="sheet-title">添加歌曲（可多选）</div>
        <div id="add-list">
          ${candidates.map((s) => `
            <label class="queue-item">
              <input type="checkbox" class="add-check" value="${s.id}" style="accent-color:var(--primary)">
              <span style="flex:1">${escapeHtml(s.title)}</span>
              <span style="color:var(--text-2);font-size:12px">${escapeHtml(s.artist)}</span>
            </label>`).join('')}
        </div>
        <div style="display:flex;gap:8px;padding:8px 6px 2px">
          <button class="btn btn-block" id="add-cancel">取消</button>
          <button class="btn btn-primary btn-block" id="add-ok">添加</button>
        </div>
      </div>`;
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    mask.querySelector('#add-cancel').onclick = () => mask.remove();
    mask.querySelector('#add-ok').onclick = async () => {
      const ids = [...mask.querySelectorAll('.add-check:checked')].map((c) => c.value);
      if (!ids.length) { showToast('请先勾选歌曲'); return; }
      await store.addToPlaylists(ids, [detail.playlist.id]);
      mask.remove();
      showToast(`已添加 ${ids.length} 首`);
      await reload();
    };
    document.getElementById('app').appendChild(mask);
  }

  await reload();
}

/** HTML5 拖动排序 */
function enableDragSort(listEl, ids, playlistId) {
  let dragId = null;
  listEl.querySelectorAll('.song-item').forEach((row) => {
    row.draggable = true;
    row.addEventListener('dragstart', () => { dragId = row.dataset.id; row.style.opacity = '.4'; });
    row.addEventListener('dragend', () => { row.style.opacity = ''; });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      const target = e.target.closest('.song-item');
      if (target && target.dataset.id !== dragId) {
        row.classList.toggle('drag-over', true);
      }
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const target = e.target.closest('.song-item');
      if (!target || !dragId || target.dataset.id === dragId) return;
      const order = [...ids];
      order.splice(order.indexOf(dragId), 1);
      order.splice(order.indexOf(target.dataset.id), 0, dragId);
      await store.reorderPlaylist(playlistId, order);
      showToast('顺序已保存');
      bus.emit('playlists:changed');
      // 重新渲染
      const evt = new HashChangeEvent('hashchange');
      window.dispatchEvent(evt);
    });
  });
}