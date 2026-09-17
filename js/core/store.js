// 业务存储层：所有页面通过这里读写数据，不直接接触底层适配器。
// 将来接云同步时，只需把这里的实现换成云接口，页面代码不变。
import { uid } from './util.js';

let db = null;

// 歌曲去重键：标题+歌手（小写）
const songKey = (s) => `${(s.title || '').trim().toLowerCase()}|${(s.artist || '').trim().toLowerCase()}`;

export const PLAYLIST_COLORS = ['#1e88e5', '#8e24aa', '#e53935', '#43a047', '#fb8c00', '#00897b', '#3949ab', '#d81b60'];

export const store = {
  /** 初始化：传入适配器（浏览器 IDBAdapter / 测试 MemoryAdapter） */
  async init(adapter) {
    db = adapter;
    await db.open?.();
  },

  /* ================= 歌曲 ================= */

  /** 批量导入；按 标题+歌手 去重。返回 {added, skipped} */
  async importSongs(items) {
    const existing = await db.getAll('songs');
    const seen = new Map(existing.map((s) => [songKey(s), s]));
    const added = [];
    const skipped = [];
    for (const it of items) {
      const k = songKey(it);
      if (it.title && seen.has(k)) { skipped.push(it.fileName || it.title); continue; }
      const song = {
        id: uid(),
        fileName: it.fileName || '',
        title: it.title || it.fileName || '未知歌名',
        artist: it.artist || '未知歌手',
        album: it.album || '',
        duration: it.duration || 0,
        cover: it.cover || '',
        mime: it.mime || '',
        size: it.size || 0,
        blob: it.blob || null,
        addedAt: Date.now(),
        playCount: 0,
        lastPlayedAt: 0,
      };
      await db.put('songs', song);
      seen.set(k, song);
      added.push(song);
    }
    return { added, skipped };
  },

  /** 歌曲列表：搜索 + 排序（addedAt/title/artist/duration/playCount） */
  async listSongs({ query = '', sortBy = 'addedAt', desc = true } = {}) {
    let songs = await db.getAll('songs');
    const q = query.trim().toLowerCase();
    if (q) {
      songs = songs.filter((s) =>
        (s.title || '').toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q));
    }
    const dir = desc ? -1 : 1;
    const collator = new Intl.Collator('zh-Hans-CN');
    songs.sort((a, b) => {
      switch (sortBy) {
        case 'title': return collator.compare(a.title || '', b.title || '') * dir;
        case 'artist': return collator.compare(a.artist || '', b.artist || '') * dir;
        case 'duration': return ((a.duration || 0) - (b.duration || 0)) * dir;
        case 'playCount': return ((a.playCount || 0) - (b.playCount || 0)) * dir;
        default: return ((a.addedAt || 0) - (b.addedAt || 0)) * dir;
      }
    });
    return songs;
  },

  async getSong(id) { return (await db.get('songs', id)) ?? null; },

  /** 按 ids 顺序取歌曲（跳过不存在的） */
  async getSongs(ids) {
    const all = await db.getAll('songs');
    const map = new Map(all.map((s) => [s.id, s]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  },

  /** 删除歌曲并级联清理收藏/歌单条目/历史 */
  async deleteSongs(ids) {
    const idSet = new Set(ids);
    await db.bulkDelete('songs', ids);
    const favs = await db.getAll('favorites');
    await db.bulkDelete('favorites', favs.filter((f) => idSet.has(f.songId)).map((f) => f.songId));
    const plSongs = await db.getAll('playlist_songs');
    await db.bulkDelete('playlist_songs', plSongs.filter((p) => idSet.has(p.songId)).map((p) => [p.playlistId, p.songId]));
    const history = await db.getAll('history');
    await db.bulkDelete('history', history.filter((h) => idSet.has(h.songId)).map((h) => h.id));
  },

  async updateSong(id, patch) {
    const song = await db.get('songs', id);
    if (!song) return null;
    const next = { ...song, ...patch };
    await db.put('songs', next);
    return next;
  },

  /* ================= 收藏 ================= */

  /** 切换收藏，返回 {fav:boolean} */
  async toggleFavorite(songId) {
    const existing = await db.get('favorites', songId);
    if (existing) {
      await db.delete('favorites', songId);
      return { fav: false };
    }
    // addedAt 保持单调递增，保证同一毫秒内的收藏也有稳定先后顺序
    const favs = await db.getAll('favorites');
    const maxAt = favs.reduce((m, f) => Math.max(m, f.addedAt || 0), 0);
    await db.put('favorites', { songId, addedAt: Math.max(Date.now(), maxAt + 1) });
    return { fav: true };
  },

  async isFavorite(songId) {
    return !!(await db.get('favorites', songId));
  },

  async listFavoriteIds() {
    return (await db.getAll('favorites')).map((f) => f.songId);
  },

  /** 收藏歌曲列表（按收藏时间倒序） */
  async listFavoriteSongs() {
    const favs = (await db.getAll('favorites')).sort((a, b) => b.addedAt - a.addedAt);
    return this.getSongs(favs.map((f) => f.songId));
  },

  /* ================= 歌单 ================= */

  async createPlaylist(name) {
    const all = await db.getAll('playlists');
    const pl = {
      id: uid(),
      name: name.trim() || '新建歌单',
      color: PLAYLIST_COLORS[all.length % PLAYLIST_COLORS.length],
      createdAt: Date.now(),
      order: all.length,
    };
    await db.put('playlists', pl);
    return pl;
  },

  async updatePlaylist(id, patch) {
    const pl = await db.get('playlists', id);
    if (!pl) return null;
    const next = { ...pl, ...patch };
    await db.put('playlists', next);
    return next;
  },

  /** 删除歌单（不删除歌曲本身） */
  async deletePlaylist(id) {
    await db.delete('playlists', id);
    const rels = await db.getAll('playlist_songs');
    await db.bulkDelete('playlist_songs', rels.filter((r) => r.playlistId === id).map((r) => [r.playlistId, r.songId]));
  },

  /** 歌单列表（含歌曲数、最近更新时间） */
  async listPlaylists() {
    const [pls, rels] = await Promise.all([db.getAll('playlists'), db.getAll('playlist_songs')]);
    return pls
      .map((pl) => {
        const mine = rels.filter((r) => r.playlistId === pl.id);
        return {
          ...pl,
          songCount: mine.length,
          updatedAt: mine.length ? Math.max(...mine.map((r) => r.addedAt)) : pl.createdAt,
        };
      })
      .sort((a, b) => a.order - b.order);
  },

  /** 歌单详情：歌单信息 + 按歌内顺序排列的歌曲 */
  async getPlaylistDetail(id) {
    const pl = await db.get('playlists', id);
    if (!pl) return null;
    const rels = (await db.getAll('playlist_songs'))
      .filter((r) => r.playlistId === id)
      .sort((a, b) => a.order - b.order);
    const songs = await this.getSongs(rels.map((r) => r.songId));
    return { playlist: pl, songs };
  },

  /** 把歌曲加入多个歌单（已存在的跳过），返回实际新增条数 */
  async addToPlaylists(songIds, playlistIds) {
    const rels = await db.getAll('playlist_songs');
    let added = 0;
    for (const plId of playlistIds) {
      const inList = rels.filter((r) => r.playlistId === plId);
      const have = new Set(inList.map((r) => r.songId));
      let nextOrder = inList.length; // 每个歌单内 order 独立递增
      for (const songId of songIds) {
        if (have.has(songId)) continue;
        await db.put('playlist_songs', {
          playlistId: plId, songId,
          addedAt: Date.now(), order: nextOrder++,
        });
        have.add(songId);
        added++;
      }
    }
    return added;
  },

  async removeFromPlaylist(playlistId, songId) {
    await db.delete('playlist_songs', [playlistId, songId]);
  },

  /** 按传入顺序重排歌单内歌曲 */
  async reorderPlaylist(playlistId, orderedSongIds) {
    for (let i = 0; i < orderedSongIds.length; i++) {
      const rel = await db.get('playlist_songs', [playlistId, orderedSongIds[i]]);
      if (rel) await db.put('playlist_songs', { ...rel, order: i });
    }
  },

  /* ================= 历史 ================= */

  /** 记录一次播放：写历史 + 更新播放次数/最近播放（受设置开关控制） */
  async recordPlay(songId, playedAt = Date.now()) {
    const settings = await this.getAllSettings();
    if (settings.recordHistory === false) return null;
    await db.put('history', { songId, playedAt });
    const song = await db.get('songs', songId);
    if (song) {
      await db.put('songs', { ...song, playCount: (song.playCount || 0) + 1, lastPlayedAt: playedAt });
    }
    return playedAt;
  },

  /** 历史分组：[{label:'今天', items:[{id, playedAt, song}]}...]，可选关键字过滤 */
  async getHistoryGrouped({ query = '', dateLabelFn } = {}) {
    const [history, songs] = await Promise.all([db.getAll('history'), db.getAll('songs')]);
    const map = new Map(songs.map((s) => [s.id, s]));
    const q = query.trim().toLowerCase();
    const labelFn = dateLabelFn || ((ts) => dateLabelDefault(ts));
    const rows = history
      .map((h) => ({ ...h, song: map.get(h.songId) }))
      .filter((r) => r.song)
      .filter((r) => !q || (r.song.title || '').toLowerCase().includes(q) || (r.song.artist || '').toLowerCase().includes(q))
      .sort((a, b) => b.playedAt - a.playedAt);
    const groups = [];
    for (const row of rows) {
      const label = labelFn(row.playedAt);
      let g = groups.find((x) => x.label === label);
      if (!g) { g = { label, items: [] }; groups.push(g); }
      g.items.push(row);
    }
    return groups;
  },

  async deleteHistoryEntry(id) { await db.delete('history', id); },
  async clearHistory() { await db.clear('history'); },

  /* ================= 统计与存储 ================= */

  async getStats() {
    const [songs, history] = await Promise.all([db.getAll('songs'), db.getAll('history')]);
    const map = new Map(songs.map((s) => [s.id, s]));
    const totalPlays = songs.reduce((n, s) => n + (s.playCount || 0), 0);
    const totalListenSec = history.reduce((n, h) => n + (map.get(h.songId)?.duration || 0), 0);
    const top = [...songs]
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0) || (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
      .filter((s) => (s.playCount || 0) > 0)
      .slice(0, 10);
    return {
      songCount: songs.length,
      totalPlays,
      totalListenSec,
      listenCount: history.length,
      top10: top.map((s) => ({ id: s.id, title: s.title, artist: s.artist, playCount: s.playCount })),
    };
  },

  /** 存储占用（字节）：优先 navigator.storage.estimate，退化按 blob size 估算 */
  async getStorageUsage() {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        return { usage: est.usage || 0, quota: est.quota || 0, source: 'estimate' };
      } catch { /* 忽略，走退化路径 */ }
    }
    const songs = await db.getAll('songs');
    return { usage: songs.reduce((n, s) => n + (s.size || 0), 0), quota: 0, source: 'sum' };
  },

  /** 清理未引用数据：指向不存在歌曲的收藏/歌单条目/历史 */
  async cleanOrphans() {
    const songs = new Set((await db.getAll('songs')).map((s) => s.id));
    let removed = 0;
    const favs = await db.getAll('favorites');
    const badFavs = favs.filter((f) => !songs.has(f.songId));
    await db.bulkDelete('favorites', badFavs.map((f) => f.songId));
    removed += badFavs.length;
    const rels = await db.getAll('playlist_songs');
    const playlistIds = new Set((await db.getAll('playlists')).map((p) => p.id));
    const badRels = rels.filter((r) => !songs.has(r.songId) || !playlistIds.has(r.playlistId));
    await db.bulkDelete('playlist_songs', badRels.map((r) => [r.playlistId, r.songId]));
    removed += badRels.length;
    const history = await db.getAll('history');
    const badHist = history.filter((h) => !songs.has(h.songId));
    await db.bulkDelete('history', badHist.map((h) => h.id));
    removed += badHist.length;
    return { removed };
  },

  /* ================= 备份与恢复 ================= */

  /** 导出备份 JSON（不含音频本体） */
  async exportBackup() {
    const [songs, playlists, playlist_songs, favorites, history, settings] = await Promise.all([
      db.getAll('songs'), db.getAll('playlists'), db.getAll('playlist_songs'),
      db.getAll('favorites'), db.getAll('history'), db.getAll('settings'),
    ]);
    return {
      app: 'yueting', version: 1, exportedAt: Date.now(),
      songs: songs.map(({ blob, ...meta }) => meta),
      playlists, playlist_songs, favorites, history,
      settings: settings.map((s) => ({ key: s.key, value: s.value })),
    };
  },

  /**
   * 导入备份（覆盖恢复）：设置/歌单/收藏/历史整体替换；
   * 歌曲按 id 或 标题+歌手 匹配现有曲库，匹配不到的仅记录元数据（无音频，播放时会提示重新导入）。
   */
  async importBackup(data) {
    if (!data || data.app !== 'yueting') throw new Error('不是有效的悦听备份文件');
    const existingSongs = await db.getAll('songs');
    const byId = new Map(existingSongs.map((s) => [s.id, s]));
    const byKey = new Map(existingSongs.map((s) => [songKey(s), s]));
    for (const meta of data.songs || []) {
      const found = byId.get(meta.id) || byKey.get(songKey(meta));
      if (!found) await db.put('songs', { ...meta, blob: null });
    }
    await db.clear('playlists');
    await db.bulkPut('playlists', data.playlists || []);
    await db.clear('playlist_songs');
    await db.bulkPut('playlist_songs', data.playlist_songs || []);
    await db.clear('favorites');
    await db.bulkPut('favorites', data.favorites || []);
    await db.clear('history');
    await db.bulkPut('history', data.history || []);
    await db.clear('settings');
    await db.bulkPut('settings', (data.settings || []).map((s) => ({ key: s.key, value: s.value })));
    await this.cleanOrphans();
    return { ok: true };
  },

  /* ================= 设置 ================= */

  async getSetting(key, def = undefined) {
    const row = await db.get('settings', key);
    return row === undefined || row === null ? def : row.value;
  },

  async setSetting(key, value) {
    await db.put('settings', { key, value });
  },

  async getAllSettings() {
    const rows = await db.getAll('settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },

  /* ================= 播放状态记忆 ================= */

  async savePlayerState(state) {
    await db.put('player_state', { id: 'current', ...state, updatedAt: Date.now() });
  },

  async loadPlayerState() {
    return db.get('player_state', 'current');
  },

  /* ================= 今日推荐种子 ================= */

  /** 获取今天有效的推荐种子；换一批时 batch+1 */
  async getDailySeed() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    let { daily_date: d, daily_batch: b } = await this.getAllSettings();
    if (d !== dateStr) { d = dateStr; b = 0; await this.setSetting('daily_date', d); await this.setSetting('daily_batch', 0); }
    return { dateStr: d, batch: b || 0, seed: `${d}#${b || 0}` };
  },

  async bumpDailySeed() {
    const { dateStr, batch } = await this.getDailySeed();
    await this.setSetting('daily_batch', batch + 1);
    return { dateStr, batch: batch + 1, seed: `${dateStr}#${batch + 1}` };
  },
};

function dateLabelDefault(ts) {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ONE = 86400000;
  if (day === today) return '今天';
  if (day === today - ONE) return '昨天';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
