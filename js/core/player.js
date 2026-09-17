// 播放引擎：audio 元素 + 队列 + 状态持久化 + 历史记录
import { Queue } from './queue.js';
import { store } from './store.js';
import { bus } from './bus.js';

class Player {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.queue = new Queue();
    this.currentSong = null;      // 完整歌曲对象
    this._objUrl = null;
    this._saveTimer = null;
    this._restored = false;

    this.audio.addEventListener('timeupdate', () => {
      bus.emit('player:time', this.audio.currentTime);
      this._scheduleSave();
    });
    this.audio.addEventListener('ended', () => this._onEnded());
    this.audio.addEventListener('play', () => bus.emit('player:state', { playing: true }));
    this.audio.addEventListener('pause', () => {
      bus.emit('player:state', { playing: false });
      this._saveNow();
    });
    this.audio.addEventListener('loadedmetadata', () => bus.emit('player:track', this.currentSong));
  }

  get playing() { return !this.audio.paused && !this.audio.ended; }
  get currentSongId() { return this.currentSong?.id ?? null; }

  /* ===== 恢复上次状态（应用启动时调用，恢复但不自动出声） ===== */
  async restore() {
    if (this._restored) return;
    this._restored = true;
    const state = await store.loadPlayerState();
    if (!state?.queue?.ids?.length) return;
    this.queue = Queue.deserialize(state.queue);
    const song = await store.getSong(this.queue.currentId);
    if (!song?.blob) return;
    this.currentSong = song;
    this._loadBlob(song);
    if (state.position > 0 && Number.isFinite(state.position)) {
      const pos = state.position;
      this.audio.addEventListener('loadedmetadata', () => { try { this.audio.currentTime = pos; } catch { /* 忽略 */ } }, { once: true });
    }
    bus.emit('player:track', song);
    bus.emit('player:state', { playing: false });
  }

  _loadBlob(song) {
    if (this._objUrl) URL.revokeObjectURL(this._objUrl);
    this._objUrl = URL.createObjectURL(song.blob);
    this.audio.src = this._objUrl;
  }

  /* ===== 开播：替换整个队列 ===== */
  async playAll(songs, index = 0, mode = null) {
    if (!songs?.length) return;
    this.queue = new Queue(songs.map((s) => s.id), index, mode || (await store.getSetting('defaultMode', 'order')));
    bus.emit('player:queue', this.queue.serialize());
    await this._playIndex(index, songs[index]);
  }

  async _playIndex(index, knownSong = null) {
    this.queue.index = index;
    const song = knownSong || await store.getSong(this.queue.ids[index]);
    if (!song) return this.next();
    if (!song.blob) {
      bus.emit('player:error', song);
      return;
    }
    this.currentSong = song;
    this._loadBlob(song);
    try { await this.audio.play(); } catch { /* 自动播放策略：等待用户手势 */ }
    await store.recordPlay(song.id);
    bus.emit('player:track', song);
    bus.emit('player:queue', this.queue.serialize());
    this._saveNow();
  }

  async playSongById(id) {
    const i = this.queue.ids.indexOf(id);
    if (i >= 0) return this._playIndex(i);
    const song = await store.getSong(id);
    if (song) await this.playAll([song], 0);
  }

  queueNext(song) {
    this.queue.insertNext(song.id);
    bus.emit('player:queue', this.queue.serialize());
    this._saveNow();
  }

  async toggle() { this.playing ? this.audio.pause() : this._resume(); }
  async _resume() {
    if (!this.audio.src && this.currentSong?.blob) this._loadBlob(this.currentSong);
    try { await this.audio.play(); } catch { /* 需要手势 */ }
  }

  async next() {
    const i = this.queue.nextIndex();
    if (i === null) { this.audio.pause(); return; }
    await this._playIndex(i);
  }

  async prev() {
    // 播超过3秒按惯例回到本曲开头
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    const i = this.queue.prevIndex();
    await this._playIndex(i);
  }

  seek(sec) {
    if (Number.isFinite(sec)) this.audio.currentTime = Math.max(0, sec);
  }

  setMode(mode) {
    this.queue.setMode(mode);
    bus.emit('player:queue', this.queue.serialize());
    this._saveNow();
  }

  cycleMode() {
    const modes = ['order', 'loop', 'shuffle'];
    const next = modes[(modes.indexOf(this.queue.mode) + 1) % modes.length];
    this.setMode(next);
    return next;
  }

  async _onEnded() {
    const i = this.queue.nextIndex();
    if (i === null) { this._saveNow(); return; }
    await this._playIndex(i);
  }

  /* ===== 持久化：进度节流保存 ===== */
  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveNow(), 2000);
  }

  async _saveNow() {
    clearTimeout(this._saveTimer);
    if (!this.queue.ids.length) return;
    await store.savePlayerState({
      queue: this.queue.serialize(),
      songId: this.currentSongId,
      position: this.audio.currentTime || 0,
      duration: this.audio.duration || this.currentSong?.duration || 0,
    });
  }
}

export const player = new Player();
