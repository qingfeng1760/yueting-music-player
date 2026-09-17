// M2 存储层测试：适配器接口 + 业务 CRUD 基础
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { IDBAdapter } from '../js/core/db.js';
import { MemoryAdapter } from '../js/core/memoryAdapter.js';
import { store } from '../js/core/store.js';

const SONGS = [
  { fileName: 'a.mp3', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, mime: 'audio/mpeg', size: 1000 },
  { fileName: 'b.mp3', title: "C'mon", artist: 'Kehlani', duration: 200, mime: 'audio/mpeg', size: 1001 },
  { fileName: 'c.flac', title: '海阔天空', artist: 'Beyond', duration: 326, mime: 'audio/flac', size: 1002 },
];

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory(); // 每个用例全新的 fake IndexedDB
  await store.init(new IDBAdapter());
});

test('IDBAdapter：建库建表 + 基本CRUD + 重开持久化', async () => {
  const a = new IDBAdapter();
  await a.open();
  await a.put('songs', { id: 's1', title: 'x' });
  await a.bulkPut('songs', [{ id: 's2', title: 'y' }, { id: 's3', title: 'z' }]);
  assert.equal((await a.getAll('songs')).length, 3);
  assert.equal((await a.get('songs', 's1')).title, 'x');
  await a.delete('songs', 's1');
  assert.equal(await a.get('songs', 's1'), undefined);
  await a.bulkDelete('songs', ['s2', 's3']);
  assert.equal(await a.count('songs'), 0);

  // 新适配器实例重开同一数据库，数据仍然在（持久化语义）
  await a.put('settings', { key: 'k', value: 1 });
  const b = new IDBAdapter();
  await b.open();
  assert.deepEqual(await b.get('settings', 'k'), { key: 'k', value: 1 });
  await b.clear('settings');
  assert.equal(await b.count('settings'), 0);
});

test('MemoryAdapter：与 IDBAdapter 同接口', async () => {
  const m = new MemoryAdapter();
  await m.put('favorites', { songId: 's1', addedAt: 1 });
  await m.put('favorites', { songId: 's2', addedAt: 2 });
  assert.equal((await m.getAll('favorites')).length, 2);
  await m.delete('favorites', 's1');
  assert.deepEqual(await m.getAll('favorites'), [{ songId: 's2', addedAt: 2 }]);
  await m.clear('favorites');
  assert.equal(await m.count('favorites'), 0);
});

test('store：导入歌曲并按 标题+歌手 去重', async () => {
  const r1 = await store.importSongs(SONGS);
  assert.equal(r1.added.length, 3);
  assert.equal(r1.skipped.length, 0);
  const r2 = await store.importSongs([{ ...SONGS[0], fileName: 'copy.mp3' }]);
  assert.equal(r2.added.length, 0);
  assert.deepEqual(r2.skipped, ['copy.mp3']);
});

test('store：listSongs 搜索与排序', async () => {
  await store.importSongs(SONGS);
  const byTitle = await store.listSongs({ sortBy: 'title', desc: false });
  // zh-Hans-CN 排序规则：按拼音，中文在前、拉丁字母在后
  assert.deepEqual(byTitle.map((s) => s.title), ['海阔天空', '晴天', "C'mon"]);
  const q = await store.listSongs({ query: '周杰' });
  assert.equal(q.length, 1);
  assert.equal(q[0].title, '晴天');
  const byDuration = await store.listSongs({ sortBy: 'duration', desc: true });
  assert.equal(byDuration[0].title, '海阔天空');
});

test('store：deleteSongs 级联清理收藏/歌单/历史', async () => {
  const { added } = await store.importSongs(SONGS);
  const [a, b] = added;
  const pl = await store.createPlaylist('测试歌单');
  await store.addToPlaylists([a.id, b.id], [pl.id]);
  await store.toggleFavorite(a.id);
  await store.recordPlay(a.id);
  await store.deleteSongs([a.id]);
  assert.equal(await store.getSong(a.id), null);
  assert.deepEqual(await store.listFavoriteIds(), []);
  const detail = await store.getPlaylistDetail(pl.id);
  assert.deepEqual(detail.songs.map((s) => s.id), [b.id]);
  const items = (await store.getHistoryGrouped()).flatMap((g) => g.items);
  assert.equal(items.length, 0);
});

test('store：settings 读写与默认值', async () => {
  assert.equal(await store.getSetting('theme', 'system'), 'system');
  await store.setSetting('theme', 'dark');
  assert.equal(await store.getSetting('theme', 'system'), 'dark');
  assert.deepEqual(await store.getAllSettings(), { theme: 'dark' });
});

test('store：getDailySeed 同一天稳定、换一批递增', async () => {
  const s1 = await store.getDailySeed();
  const s2 = await store.getDailySeed();
  assert.equal(s1.seed, s2.seed);
  const s3 = await store.bumpDailySeed();
  assert.equal(s3.batch, s1.batch + 1);
  const s4 = await store.getDailySeed();
  assert.equal(s4.seed, s3.seed);
});

test('store：cleanOrphans 清理指向不存在歌曲的收藏', async () => {
  const adapter = new MemoryAdapter();
  await store.init(adapter);
  const { added } = await store.importSongs(SONGS.slice(0, 1));
  const song = added[0];
  await store.toggleFavorite(song.id);
  // 直接从底层删歌曲，制造悬挂收藏
  await adapter.delete('songs', song.id);
  assert.deepEqual(await store.listFavoriteIds(), [song.id]);
  const r = await store.cleanOrphans();
  assert.equal(r.removed, 1);
  assert.deepEqual(await store.listFavoriteIds(), []);
});
