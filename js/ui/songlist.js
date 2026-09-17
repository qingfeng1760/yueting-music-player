// 歌曲列表组件：库/收藏/歌单/推荐/历史共用
import { fmtTime, escapeHtml } from '../core/util.js';

/**
 * @param {HTMLElement} el
 * @param {Array} songs
 * @param {Object} opts
 *  - playingId: 正在播放的歌曲 id
 *  - hearts: Set<songId> 已收藏集合
 *  - onToggleHeart(song)
 *  - onMore(song)
 *  - onPlay(song, index)
 *  - selectable: 多选模式
 *  - selected: Set<songId>
 *  - onCheck(song, checked)
 *  - trailing(song): 额外尾部 DOM 字符串
 *  - coverSize: 'md'|'sm'
 *  - emptyText: 空状态文案
 *  - coverFor(song): 自定义封面（如历史/推荐页需 song.cover）
 */
export function renderSongList(el, songs, opts = {}) {
  const {
    playingId = null, hearts = new Set(), onToggleHeart, onMore, onPlay,
    selectable = false, selected = new Set(), onCheck,
    trailing, emptyText = '这里还没有歌曲', coverFor,
  } = opts;
  el.classList.add('song-list');
  if (!songs.length) {
    el.innerHTML = `<div class="empty"><span class="empty-icon">🎧</span>${escapeHtml(emptyText)}</div>`;
    return;
  }
  el.innerHTML = songs.map((s, i) => {
    const coverInner = coverFor
      ? coverFor(s)
      : (s.cover ? `<img src="${s.cover}" alt="">` : '🎵');
    const checked = selected.has(s.id) ? 'checked' : '';
    return `
    <div class="song-item ${s.id === playingId ? 'playing' : ''}" data-id="${s.id}" data-idx="${i}">
      ${selectable ? `<input type="checkbox" class="song-check" data-id="${s.id}" ${checked} aria-label="选择 ${escapeHtml(s.title)}">` : ''}
      <div class="song-cover">${coverInner}</div>
      <div class="song-meta">
        <div class="song-title">${escapeHtml(s.title)}</div>
        <div class="song-sub">${escapeHtml(s.artist)}${s.duration ? ' · ' + fmtTime(s.duration) : ''}</div>
      </div>
      ${trailing ? trailing(s, i) : ''}
      ${onToggleHeart ? `<button class="song-heart ${hearts.has(s.id) ? 'active' : ''}" data-heart="${s.id}" aria-label="收藏 ${escapeHtml(s.title)}">${hearts.has(s.id) ? '♥' : '♡'}</button>` : ''}
      ${onMore ? `<button class="icon-btn" data-more="${s.id}" aria-label="更多操作 ${escapeHtml(s.title)}">⋮</button>` : ''}
    </div>`;
  }).join('');

  el.onclick = (e) => {
    const check = e.target.closest('.song-check');
    if (check) {
      const song = songs.find((s) => s.id === check.dataset.id);
      onCheck?.(song, check.checked);
      return;
    }
    const heart = e.target.closest('[data-heart]');
    if (heart) {
      const song = songs.find((s) => s.id === heart.dataset.heart);
      onToggleHeart?.(song);
      return;
    }
    const more = e.target.closest('[data-more]');
    if (more) {
      e.stopPropagation();
      const song = songs.find((s) => s.id === more.dataset.more);
      onMore?.(song);
      return;
    }
    const row = e.target.closest('.song-item');
    if (row && !selectable) {
      const song = songs[Number(row.dataset.idx)];
      onPlay?.(song, Number(row.dataset.idx));
    } else if (row && selectable) {
      const box = row.querySelector('.song-check');
      if (box) { box.checked = !box.checked; onCheck?.(songs[Number(row.dataset.idx)], box.checked); }
    }
  };
}
