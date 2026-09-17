// 加入歌单弹层：歌单多选 + 快捷新建；返回选中的歌单id数组（取消返回 null）
import { store } from '../core/store.js';
import { escapeHtml } from '../core/util.js';

export function playlistPicker(songCount = 1) {
  return new Promise(async (resolve) => {
    const playlists = await store.listPlaylists();
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = `
      <div class="sheet">
        <div class="sheet-title">添加 ${songCount} 首歌到歌单</div>
        <div class="pl-picker-list" style="max-height:40vh;overflow-y:auto">
          ${playlists.length ? playlists.map((p) => `
            <label class="sheet-item" style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input type="checkbox" class="pl-check" value="${p.id}" style="accent-color:var(--primary)">
              <span style="width:14px;height:14px;border-radius:4px;background:${p.color};display:inline-block"></span>
              <span style="flex:1">${escapeHtml(p.name)}（${p.songCount}）</span>
            </label>`).join('') : '<div class="empty" style="padding:16px">还没有歌单，先新建一个吧</div>'}
        </div>
        <div style="display:flex;gap:8px;padding:6px 4px 4px">
          <input class="search-input" id="pl-new-name" placeholder="新建歌单名称">
          <button class="btn" id="pl-new-btn">新建</button>
        </div>
        <div style="display:flex;gap:8px;padding:6px 4px 2px">
          <button class="btn btn-block" id="pl-cancel">取消</button>
          <button class="btn btn-primary btn-block" id="pl-ok" ${playlists.length ? '' : 'disabled'}>添加</button>
        </div>
      </div>`;
    mask.addEventListener('click', (e) => { if (e.target === mask) { mask.remove(); resolve(null); } });
    mask.querySelector('#pl-cancel').onclick = () => { mask.remove(); resolve(null); };
    mask.querySelector('#pl-new-btn').onclick = async () => {
      const name = mask.querySelector('#pl-new-name').value.trim();
      if (!name) return;
      await store.createPlaylist(name);
      mask.remove();
      const more = await playlistPicker(songCount);
      resolve(more);
    };
    mask.querySelector('#pl-ok').onclick = () => {
      const ids = [...mask.querySelectorAll('.pl-check:checked')].map((c) => c.value);
      mask.remove();
      resolve(ids);
    };
    document.getElementById('app').appendChild(mask);
  });
}
