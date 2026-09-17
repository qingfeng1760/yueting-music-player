// 全屏播放页
import { player } from '../core/player.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { fmtTime, escapeHtml } from '../core/util.js';
import { showToast } from '../ui/toast.js';
import { actionSheet } from '../ui/sheet.js';
import { MODES } from '../core/queue.js';

const MODE_LABEL = { order: '顺序播放', loop: '列表循环', shuffle: '随机播放' };
const MODE_ICON = { order: '➡️', loop: '🔁', shuffle: '🔀' };

export async function render(root) {
  root.innerHTML = `
    <div class="playing-page" id="pp">
      <div class="playing-top">
        <button class="icon-btn" id="pp-close" aria-label="收起">▾</button>
        <span class="chip" id="pp-mode-chip"></span>
        <button class="icon-btn" id="pp-more" aria-label="更多">⋮</button>
      </div>
      <div class="playing-cover-wrap">
        <div class="playing-cover" id="pp-cover">🎵</div>
      </div>
      <div class="playing-info">
        <div style="flex:1;min-width:0">
          <div class="playing-title" id="pp-title">尚未播放</div>
          <div class="playing-sub" id="pp-sub"></div>
        </div>
        <button class="playing-heart" id="pp-heart" aria-label="收藏">♡</button>
      </div>
      <div class="playing-seek">
        <input type="range" class="seek-bar" id="pp-seek" min="0" max="100" value="0" step="0.1" aria-label="播放进度">
        <div class="playing-times"><span id="pp-cur">0:00</span><span id="pp-dur">0:00</span></div>
      </div>
      <div class="playing-controls">
        <button class="pc-btn" id="pp-mode" aria-label="播放模式"></button>
        <button class="pc-btn" id="pp-prev" style="font-size:30px" aria-label="上一首">⏮</button>
        <button class="pc-main" id="pp-toggle" aria-label="播放/暂停">▶</button>
        <button class="pc-btn" id="pp-next" style="font-size:30px" aria-label="下一首">⏭</button>
        <button class="pc-btn" id="pp-queue" aria-label="播放队列">☰</button>
      </div>
      <button class="playing-queue-bar" id="pp-queue-bar">☰ 播放队列（<span id="pp-queue-count">0</span>）· <span id="pp-queue-mode"></span></button>
    </div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  let seeking = false;

  async function paintHeart() {
    const btn = $('pp-heart');
    if (!player.currentSongId) { btn.textContent = '♡'; btn.classList.remove('active'); return; }
    const fav = await store.isFavorite(player.currentSongId);
    btn.textContent = fav ? '♥' : '♡';
    btn.classList.toggle('active', fav);
  }

  function paintTrack() {
    const s = player.currentSong;
    $('pp-title').textContent = s ? s.title : '尚未播放';
    $('pp-sub').textContent = s ? `${s.artist}${s.album ? ' · ' + s.album : ''}` : '';
    $('pp-cover').innerHTML = s?.cover ? `<img src="${s.cover}" alt="">` : '🎵';
    $('pp-dur').textContent = fmtTime(player.audio.duration || s?.duration || 0);
    paintMode();
    paintHeart();
  }

  function paintMode() {
    $('pp-mode').textContent = MODE_ICON[player.queue.mode];
    $('pp-mode-chip').textContent = MODE_LABEL[player.queue.mode];
    $('pp-queue-mode').textContent = MODE_LABEL[player.queue.mode];
    $('pp-queue-count').textContent = player.queue.ids.length;
  }

  function paintState() {
    $('pp-toggle').textContent = player.playing ? '⏸' : '▶';
    root.querySelector('.playing-page').classList.toggle('paused', !player.playing);
  }

  function paintTime() {
    if (seeking) return;
    const a = player.audio;
    const d = a.duration || player.currentSong?.duration || 0;
    $('pp-seek').value = d > 0 ? String((a.currentTime / d) * 100) : '0';
    $('pp-cur').textContent = fmtTime(a.currentTime);
    $('pp-dur').textContent = fmtTime(d);
  }

  $('pp-close').onclick = () => history.back();
  $('pp-toggle').onclick = () => player.toggle();
  $('pp-prev').onclick = () => player.prev();
  $('pp-next').onclick = () => player.next();
  $('pp-mode').onclick = () => { const m = player.cycleMode(); showToast(MODE_LABEL[m]); };
  $('pp-heart').onclick = async () => {
    if (!player.currentSongId) return;
    const r = await store.toggleFavorite(player.currentSongId);
    showToast(r.fav ? '已收藏 ♥' : '已取消收藏');
    bus.emit('favorites:changed');
    paintHeart();
  };
  $('pp-more').onclick = async () => {
    if (!player.currentSong) return;
    const { showSongActions } = await import('../ui/songActions.js');
    showSongActions(player.currentSong, {});
  };

  const seek = $('pp-seek');
  seek.addEventListener('input', () => { seeking = true; $('pp-cur').textContent = fmtTime((Number(seek.value) / 100) * (player.audio.duration || 0)); });
  seek.addEventListener('change', () => {
    const d = player.audio.duration || player.currentSong?.duration || 0;
    player.seek((Number(seek.value) / 100) * d);
    seeking = false;
  });

  const showQueue = async () => {
    const { queue } = player;
    const songs = await store.getSongs(queue.ids);
    const items = songs.map((s, i) => ({
      label: `${i === queue.index ? '▶ ' : ''}${s.title} - ${s.artist}`,
      value: i,
    }));
    items.push({ label: `当前模式：${MODE_LABEL[queue.mode]}（点击切换）`, value: '__mode' });
    const v = await actionSheet(`播放队列（${songs.length} 首）`, items);
    if (v === '__mode') { const m = player.cycleMode(); showToast(MODE_LABEL[m]); return; }
    if (typeof v === 'number') player._playIndex(v);
  };
  $('pp-queue').onclick = showQueue;
  $('pp-queue-bar').onclick = showQueue;

  const unsubs = [
    bus.on('player:track', paintTrack),
    bus.on('player:state', paintState),
    bus.on('player:time', paintTime),
    bus.on('player:queue', paintMode),
    bus.on('favorites:changed', paintHeart),
  ];

  paintTrack(); paintState(); paintTime();
  return () => unsubs.forEach((u) => u());
}
