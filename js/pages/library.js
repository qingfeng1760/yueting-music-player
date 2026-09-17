// 音乐库：本地音乐 / 收藏 / 歌单 三个子页签
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { escapeHtml, debounce } from '../core/util.js';
import { importFiles } from '../core/importer.js';
import { showToast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm.js';
import { actionSheet } from '../ui/sheet.js';
import { playlistPicker } from '../ui/playlistPicker.js';
import { showSongActions } from '../ui/songActions.js';
import { renderSongList } from '../ui/songlist.js';
import { setDock, clearDock, dockEl } from '../ui/dock.js';

async function getPlayer() {
  try {
    const { player } = await import('../core/player.js');
    return player;
  } catch {
    showToast('播放器暂不可用');
    return null;
  }
}

export async function render(root, tab = 'songs') {
  root.innerHTML = `
    <h1 class="page-title">音乐库</h1>
    <div class="subtabs">
      <a class="subtab ${tab === 'songs' ? 'active' : ''}" href="#/library/songs">本地音乐</a>
      <a class="subtab ${tab === 'favorites' ? 'active' : ''}" href="#/library/favorites">收藏</a>
      <a class="subtab ${tab === 'playlists' ? 'active' : ''}" href="#/library/playlists">歌单</a>
    </div>
    <div id="lib-body"></div>`;

  const unsubs = [
    bus.on('songs:changed', renderBody),
    bus.on('favorites:changed', renderBody),
    bus.on('playlists:changed', renderBody),
  ];
  const body = root.querySelector('#lib-body');

  async function renderBody() {
    if (tab === 'songs') await renderSongsTab(body);
    else {
      clearDock(); // 收藏/歌单页签不需要导入悬浮按钮
      if (tab === 'favorites') await renderFavoritesTab(body);
      else await renderPlaylistsTab(body);
    }
  }
  await renderBody();
  return () => unsubs.forEach((u) => u());
}

/* ============ 子页签：本地音乐 ============ */
async function renderSongsTab(body) {
  const state = { query: '', sortBy: 'addedAt', selectable: false, selected: new Set() };
  body.innerHTML = `
    <div class="toolbar">
      <input class="search-input" id="lib-search" placeholder="搜索歌名 / 歌手">
      <select class="sort-select" id="lib-sort" aria-label="排序">
        <option value="addedAt">最近添加</option>
        <option value="title">歌名</option>
        <option value="artist">歌手</option>
        <option value="duration">时长</option>
        <option value="playCount">播放次数</option>
      </select>
      <button class="btn" id="lib-multi" style="padding:8px 14px">多选</button>
    </div>
    <div id="import-panel"></div>
    <div id="lib-count" class="page-sub" style="margin:0 0 8px"></div>
    <div id="lib-list"></div>
    <input type="file" id="f-files" multiple accept="audio/*,.mp3,.m4a,.flac,.ogg,.wav,.aac" hidden>
    <input type="file" id="f-folder" webkitdirectory hidden>`;

  const listEl = body.querySelector('#lib-list');
  const countEl = body.querySelector('#lib-count');
  const importPanel = body.querySelector('#import-panel');
  let hearts = new Set(await store.listFavoriteIds());
  let playingId = null;
  try { const { player } = await import('../core/player.js'); playingId = player.currentSongId; } catch { /* 未就绪 */ }

  async function reload() {
    hearts = new Set(await store.listFavoriteIds());
    const songs = await store.listSongs({ query: state.query, sortBy: state.sortBy });
    countEl.textContent = songs.length ? `共 ${songs.length} 首` : '';
    renderSongList(listEl, songs, {
      playingId, hearts, selectable: state.selectable, selected: state.selected,
      emptyText: state.query ? '没有找到匹配的歌曲' : '还没有歌曲，点右下角「导入音乐」开始吧',
      onPlay: async (song, idx) => {
        const player = await getPlayer();
        if (player) await player.playAll(songs, idx);
      },
      onToggleHeart: async (song) => {
        const r = await store.toggleFavorite(song.id);
        showToast(r.fav ? '已收藏 ♥' : '已取消收藏');
        await reload();
      },
      onMore: (song) => showSongActions(song, { onChanged: reload }),
      onCheck: (song, checked) => {
        if (checked) state.selected.add(song.id); else state.selected.delete(song.id);
        paintBatch();
      },
    });
    paintBatch();
  }

// 悬浮按钮挂到底部悬浮层（位于迷你播放条与 Tab 栏之上，不会遮挡它们）
  const paintFab = () => {
    setDock('<button class="fab" id="lib-import">＋ 导入音乐</button>');
    dockEl()?.querySelector('#lib-import')?.addEventListener('click', async () => {
      const v = await actionSheet('导入本地音乐', [
        { label: '📄 选择音乐文件', value: 'files' },
        { label: '📁 选择整个文件夹', value: 'folder' },
      ]);
      if (v === 'files') fileInput.click();
      if (v === 'folder') folderInput.click();
    });
  };

  function paintBatch() {
    if (!state.selectable) { paintFab(); return; }
    setDock(`
      <div class="batchbar">
        <button data-b="all">☑ 全选</button>
        <button data-b="play">▶ 播放</button>
        <button data-b="pl">＋ 歌单</button>
        <button data-b="fav">♥ 收藏</button>
        <button data-b="del" class="danger">🗑 删除</button>
        <button data-b="cancel">✕</button>
      </div>`);
    const bar = dockEl()?.querySelector('.batchbar');
    if (!bar) return;
    bar.onclick = async (e) => {
      const act = e.target.closest('[data-b]')?.dataset.b;
      if (!act) return;
      if (act === 'cancel') { state.selectable = false; state.selected.clear(); body.querySelector('#lib-multi').textContent = '多选'; await reload(); return; }
      if (act === 'all') {
        const songs = await store.listSongs({ query: state.query, sortBy: state.sortBy });
        const allOn = state.selected.size === songs.length;
        state.selected = allOn ? new Set() : new Set(songs.map((s) => s.id));
        await reload(); return;
      }
      const ids = [...state.selected];
      if (!ids.length) { showToast('先勾选歌曲'); return; }
      if (act === 'play') {
        const songs = await store.getSongs(ids);
        const player = await getPlayer();
        if (player) await player.playAll(songs, 0);
        state.selectable = false; state.selected.clear(); await reload();
      } else if (act === 'pl') {
        const plIds = await playlistPicker(ids.length);
        if (plIds?.length) {
          const n = await store.addToPlaylists(ids, plIds);
          showToast(`已加入 ${n} 个歌单`);
        }
      } else if (act === 'fav') {
        for (const id of ids) {
          if (!hearts.has(id)) await store.toggleFavorite(id);
        }
        showToast('已收藏所选歌曲');
        bus.emit('favorites:changed');
        await reload();
      } else if (act === 'del') {
        const ok = await confirmDialog({ title: '删除所选', text: `将删除选中的 ${ids.length} 首歌，并清理相关收藏、歌单和历史记录。`, danger: true, okText: '删除' });
        if (ok) { await store.deleteSongs(ids); showToast('已删除'); bus.emit('songs:changed'); await reload(); }
      }
    };
  }

  body.querySelector('#lib-search').addEventListener('input', debounce((e) => {
    state.query = e.target.value; reload();
  }, 250));
  body.querySelector('#lib-sort').addEventListener('change', (e) => {
    state.sortBy = e.target.value; reload();
  });
  body.querySelector('#lib-multi').addEventListener('click', () => {
    state.selectable = !state.selectable;
    if (!state.selectable) state.selected.clear();
    body.querySelector('#lib-multi').textContent = state.selectable ? '取消' : '多选';
    reload();
  });

  // 导入
  const fileInput = body.querySelector('#f-files');
  const folderInput = body.querySelector('#f-folder');
  const handleFiles = async (e) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files?.length) return;
    importPanel.innerHTML = `
      <div class="import-panel">
        <div style="font-weight:600;font-size:14px">正在导入音乐…</div>
        <div class="progress-bar"><div style="width:0%"></div></div>
        <div class="import-log" id="imp-log"></div>
      </div>`;
    const bar = importPanel.querySelector('.progress-bar > div');
    const log = importPanel.querySelector('#imp-log');
    const result = await importFiles(files, {
      onProgress: ({ current, total, name }) => {
        bar.style.width = `${Math.round((current / total) * 100)}%`;
        log.textContent = `[${current}/${total}] ${name}`;
      },
    });
    const parts = [`新增 ${result.added} 首`];
    if (result.skipped) parts.push(`跳过重复 ${result.skipped} 首`);
    if (result.unsupported) parts.push(`不支持格式 ${result.unsupported} 个`);
    if (result.failed) parts.push(`读取失败 ${result.failed} 个`);
    showToast(parts.join('，'));
    bus.emit('songs:changed');
    importPanel.innerHTML = `<div class="import-panel" style="font-size:13px">✅ ${parts.join('，')}</div>`;
    setTimeout(() => { importPanel.innerHTML = ''; }, 4000);
    await reload();
  };
  fileInput.addEventListener('change', handleFiles);
  folderInput.addEventListener('change', handleFiles);

  await reload();
}

/* ============ 子页签：收藏 ============ */
async function renderFavoritesTab(body) {
  body.innerHTML = `<div id="fav-head"></div><div id="fav-list"></div>`;
  const listEl = body.querySelector('#fav-list');
  const headEl = body.querySelector('#fav-head');
  let playingId = null;
  try { const { player } = await import('../core/player.js'); playingId = player.currentSongId; } catch { /* 未就绪 */ }

  async function reload() {
    const songs = await store.listFavoriteSongs();
    headEl.innerHTML = songs.length ? `
      <div class="card" style="display:flex;gap:10px;align-items:center">
        <div style="flex:1"><b>♥ 共 ${songs.length} 首</b>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px">点歌曲旁的 ♡ 可取消收藏</div></div>
        <button class="btn btn-primary" id="fav-play" style="padding:8px 16px">▶ 播放全部</button>
        <button class="btn" id="fav-shuffle" style="padding:8px 16px">🎲 随机</button>
      </div>` : '';
    if (songs.length) {
      headEl.querySelector('#fav-play').onclick = async () => {
        const player = await getPlayer();
        if (player) await player.playAll(songs, 0);
      };
      headEl.querySelector('#fav-shuffle').onclick = async () => {
        const player = await getPlayer();
        if (player) await player.playAll(songs, Math.floor(Math.random() * songs.length), 'shuffle');
      };
    }
    renderSongList(listEl, songs, {
      playingId,
      emptyText: '点歌曲旁边的 ♡，喜欢的歌都会集中在这里',
      onPlay: async (song, idx) => {
        const player = await getPlayer();
        if (player) await player.playAll(songs, idx);
      },
      onToggleHeart: async (song) => {
        const r = await store.toggleFavorite(song.id);
        showToast(r.fav ? '已收藏 ♥' : '已取消收藏');
        await reload();
      },
      onMore: (song) => showSongActions(song, { canDelete: false, onChanged: reload }),
    });
  }
  await reload();
}

/* ============ 子页签：歌单 ============ */
async function renderPlaylistsTab(body) {
  body.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn btn-primary" id="pl-create" style="padding:8px 16px">＋ 新建歌单</button>
    </div>
    <div id="pl-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"></div>`;
  const grid = body.querySelector('#pl-grid');

  async function reload() {
    const playlists = await store.listPlaylists();
    if (!playlists.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="empty-icon">📂</span>还没有歌单<br>点上方「新建歌单」，把音乐按场景整理起来</div>`;
      return;
    }
    grid.innerHTML = playlists.map((p) => `
      <a class="card" href="#/playlist/${p.id}" style="text-decoration:none;color:inherit;padding:0;overflow:hidden">
        <div style="height:86px;background:${p.color};display:flex;align-items:center;justify-content:center;font-size:30px">🎵</div>
        <div style="padding:10px 12px">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px">${p.songCount} 首</div>
        </div>
      </a>`).join('');
  }

  body.querySelector('#pl-create').addEventListener('click', async () => {
    const name = await inputDialog('新建歌单', '歌单名称', '例如：通勤路上');
    if (name === null) return;
    if (!name.trim()) { showToast('名称不能为空'); return; }
    await store.createPlaylist(name);
    showToast('歌单已创建');
    await reload();
  });

  await reload();
}

/** 输入对话框：返回输入值；取消返回 null */
function inputDialog(title, label, placeholder = '') {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'dialog-mask';
    mask.innerHTML = `
      <div class="dialog">
        <h3></h3>
        <input class="search-input" id="dlg-input" style="width:100%;margin-bottom:16px">
        <div class="dialog-actions">
          <button class="btn" data-act="cancel">取消</button>
          <button class="btn btn-primary" data-act="ok">确定</button>
        </div>
      </div>`;
    mask.querySelector('h3').textContent = title;
    const input = mask.querySelector('#dlg-input');
    input.placeholder = placeholder;
    input.setAttribute('aria-label', label);
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
