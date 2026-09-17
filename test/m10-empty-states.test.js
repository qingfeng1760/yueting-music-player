// M10 收尾：空库与边界数据的健壮性（所有页面在空状态下都不应报错）
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter } from '../js/core/memoryAdapter.js';
import { store } from '../js/core/store.js';
import { pickDaily, rankSongs } from '../js/core/rec.js';

beforeEach(async () => {
  await store.init(new MemoryAdapter());
});

test('空库：所有读取接口返回空集合而不抛错', async () => {
  assert.deepEqual(await store.listSongs(), []);
  assert.deepEqual(await store.listFavoriteSongs(), []);
  assert.deepEqual(await store.listFavoriteIds(), []);
  assert.deepEqual(await store.listPlaylists(), []);
  assert.deepEqual(await store.getHistoryGrouped(), []);
  assert.deepEqual(await store.getSongs([]), []);
  assert.equal(await store.getSong('nope'), null);
  assert.equal(await store.getPlaylistDetail('nope'), null);
  assert.equal(await store.loadPlayerState(), undefined);
  const stats = await store.getStats();
  assert.deepEqual(stats, { songCount: 0, totalPlays: 0, totalListenSec: 0, listenCount: 0, top10: [] });
});

test('空库：备份/清理/设置等写操作安全可用', async () => {
  const backup = await store.exportBackup();
  assert.equal(backup.songs.length, 0);
  assert.equal(backup.playlists.length, 0);
  assert.deepEqual(await store.cleanOrphans(), { removed: 0 });
  assert.equal(await store.getSetting('theme', 'system'), 'system');
  assert.deepEqual(pickDaily([], {}), []);
  assert.deepEqual(rankSongs([]), []);
});

test('空库：导入备份（空备份）不会报错，可正常恢复', async () => {
  const empty = { app: 'yueting', version: 1, songs: [], playlists: [], playlist_songs: [], favorites: [], history: [], settings: [] };
  await store.importBackup(empty);
  assert.deepEqual(await store.listSongs(), []);
  assert.deepEqual(await store.listPlaylists(), []);
});

test('缺失可选字段的歌曲不会让列表与推荐崩溃', async () => {
  await store.importSongs([
    { fileName: 'x.mp3', title: '只有标题', artist: '', duration: 0 },
    { fileName: 'y.mp3', title: '', artist: '' },
  ]);
  const songs = await store.listSongs();
  assert.equal(songs.length, 2);
  assert.ok(songs.every((s) => typeof s.title === 'string' && s.title.length > 0));
  const ranked = rankSongs(songs, { favoriteIds: new Set(), seed: 's' });
  assert.equal(ranked.length, 2);
  const daily = pickDaily(songs, { dateStr: '2026-9-17', batch: 0 });
  assert.equal(daily.length, 2);
});

test('历史记录开关关闭时，统计数据不增长', async () => {
  const { added } = await store.importSongs([{ fileName: 'a.mp3', title: 'A', artist: 'B', duration: 120 }]);
  await store.setSetting('recordHistory', false);
  await store.recordPlay(added[0].id);
  const stats = await store.getStats();
  assert.equal(stats.totalPlays, 0);
  assert.equal(stats.listenCount, 0);
});