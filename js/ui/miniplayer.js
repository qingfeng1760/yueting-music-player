// 全局迷你播放条：常驻 Tab 栏上方，点击进入播放页
import { player } from '../core/player.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { escapeHtml } from '../core/util.js';
import { updateBottomBars } from './dock.js';

let mounted = false;

export function mountMiniPlayer() {
  if (mounted) return;
  mounted = true;
  const host = document.getElementById('miniplayer');
  host.innerHTML = `
    <div class="mini" id="mini" role="button" aria-label="展开播放页">
      <div class="mini-progress"><div class="mini-progress-fill"></div></div>
      <div class="mini-main">
        <div class="mini-cover" id="mini-cover">🎵</div>
        <div class="mini-meta">
          <div class="mini-title" id="mini-title"></div>
          <div class="mini-artist" id="mini-artist"></div>
        </div>
        <button class="mini-btn" id="mini-play" aria-label="播放/暂停">⏯</button>
        <button class="mini-btn" id="mini-next" aria-label="下一首">⏭</button>
      </div>
    </div>`;

  const mini = host.querySelector('#mini');
  const playBtn = host.querySelector('#mini-play');

  const paint = () => {
    const s = player.currentSong;
    host.style.display = s ? 'block' : 'none';
    if (!s) { updateBottomBars(); return; }
    host.querySelector('#mini-title').textContent = s.title;
    host.querySelector('#mini-artist').textContent = s.artist;
    const cover = host.querySelector('#mini-cover');
    cover.innerHTML = s.cover ? `<img src="${s.cover}" alt="">` : '🎵';
    playBtn.textContent = player.playing ? '⏸' : '▶';
    if (player.playing) mini.classList.add('is-playing'); else mini.classList.remove('is-playing');
    updateBottomBars(); // 迷你条出现/消失会改变底部占位，悬浮层需要跟着挪
  };

  const paintProgress = () => {
    const d = player.audio.duration || player.currentSong?.duration || 0;
    const pct = d > 0 ? Math.min(100, (player.audio.currentTime / d) * 100) : 0;
    host.querySelector('.mini-progress-fill').style.width = `${pct}%`;
  };

  host.querySelector('#mini-play').addEventListener('click', (e) => { e.stopPropagation(); player.toggle(); });
  host.querySelector('#mini-next').addEventListener('click', (e) => { e.stopPropagation(); player.next(); });
  mini.addEventListener('click', () => { location.hash = '#/playing'; });

  bus.on('player:track', paint);
  bus.on('player:state', paint);
  bus.on('player:time', paintProgress);

  // 收藏状态不影响迷你条，但歌曲被删时刷新
  bus.on('songs:changed', async () => {
    if (player.currentSongId && !(await store.getSong(player.currentSongId))) {
      player.currentSong = null;
      player.audio.pause();
      player.audio.removeAttribute('src');
      host.style.display = 'none';
    }
  });

  player.restore().then(paint).catch((e) => console.warn('恢复播放状态失败', e));
  paint();
}
