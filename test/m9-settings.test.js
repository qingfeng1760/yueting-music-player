// M9 数据与设置测试：统计、备份导出/导入往返、导入校验
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter } from '../js/core/memoryAdapter.js';
import { store } from '../js/core/store.js';

const SONGS = [
  { fileName: 'a.mp3', title: '晴天', artist: '周杰伦', duration: 269, size: 1000 },
  { fileName: 'b.mp3', title: '海阔天空', artist: 'Beyond', duration: 326, size: 2000 },
  { fileName: 'c.mp3', title: '夜曲', artist: '周杰伦', duration: 226, size: 3000 },
];

let ids;
beforeEach(async () => {
  await store.init(new MemoryAdapter());
  const { added } = await store.importSongs(SONGS);
  ids = added.map((s) => s.id);
});

async function seedActivity() {
  const pl = await store.createPlaylist('通勤路上');
  await store.addToPlaylists([ids[0], ids[1]], [pl.id]);
  await store.toggleFavorite(ids[2]);
  await store.recordPlay(ids[0]);
  await store.recordPlay(ids[0]);
  await store.recordPlay(ids[1]);
  await store.setSetting('theme', 'dark');
  await store.setSetting('defaultMode', 'shuffle');
  return pl;
}

test('统计：歌曲数、播放次数、累计听歌时长、Top10', async () => {
  await seedActivity();
  const s = await store.getStats();
  assert.equal(s.songCount, 3);
  assert.equal(s.totalPlays, 3);
  assert.equal(s.listenCount, 3);
  // 晴天播放2次(269s) + 海阔天空1次(326s) = 864s
  assert.equal(s.totalListenSec, 269 * 2 + 326);
  assert.equal(s.top10[0].title, '晴天');
  assert.equal(s.top10[0].playCount, 2);
  assert.ok(s.top10.length <= 10);
});

test('存储占用：无 navigator.storage 时按文件大小求和', async () => {
  const usage = await store.getStorageUsage();
  assert.equal(usage.usage, 6000);
  assert.equal(usage.source, 'sum');
});

test('备份导出：包含元数据与关系，但不含音频 blob', async () => {
  const pl = await seedActivity();
  const backup = await store.exportBackup();
  assert.equal(backup.app, 'yueting');
  assert.equal(backup.songs.length, 3);
  assert.ok(backup.songs.every((s) => s.blob === undefined), '不得包含音频本体');
  assert.ok(backup.songs.every((s) => s.title && s.duration));
  assert.equal(backup.playlists.length, 1);
  assert.equal(backup.playlist_songs.length, 2);
  assert.equal(backup.favorites.length, 1);
  assert.equal(backup.history.length, 3);
  assert.equal(backup.settings.find((s) => s.key === 'theme').value, 'dark');
  assert.ok(backup.exportedAt > 0);
});

test('备份往返：清空数据后导入，歌单/收藏/历史/设置恢复一致', async () => {
  const pl = await seedActivity();
  const backup = JSON.parse(JSON.stringify(await store.exportBackup()));

  // 模拟灾难：换一个全新的空数据库
  await store.init(new MemoryAdapter());
  assert.equal((await store.listSongs()).length, 0);

  await store.importBackup(backup);
  const detail = await store.getPlaylistDetail(pl.id);
  assert.equal(detail.playlist.name, '通勤路上');
  // 歌曲元数据被还原（无音频），歌单关联仍然有效
  assert.deepEqual(detail.songs.map((s) => s.title).sort(), ['晴天', '海阔天空']);
  assert.equal((await store.listFavoriteIds()).length, 1);
  assert.equal((await store.getHistoryGrouped()).flatMap((g) => g.items).length, 3);
  assert.equal(await store.getSetting('theme'), 'dark');
  assert.equal(await store.getSetting('defaultMode'), 'shuffle');
  const s = await store.getStats();
  assert.equal(s.songCount, 3);
  assert.equal(s.totalPlays, 3);
});

test('备份往返：音频本体不在备份中，歌曲标记为待重新导入（blob 为空）', async () => {
  await store.importSongs(SONGS);
  const backup = await store.exportBackup();
  await store.init(new MemoryAdapter());
  await store.importBackup(backup);
  const songs = await store.listSongs();
  assert.ok(songs.every((s) => s.blob === null));
});

test('导入校验：非悦听备份文件抛出明确错误', async () => {
  await assert.rejects(() => store.importBackup({ app: 'other' }), /不是有效的悦听备份文件/);
  await assert.rejects(() => store.importBackup(null), /不是有效的悦听备份文件/);
});

test('备份导入后 cleanOrphans 不会误删有效关系', async () => {
  await seedActivity();
  const backup = await store.exportBackup();
  await store.init(new MemoryAdapter());
  await store.importBackup(backup);
  const r = await store.cleanOrphans();
  assert.equal(r.removed, 0, '导入的数据不应被判为悬挂引用');
});

test('设置项：默认播放模式与历史开关可持久化读取', async () => {
  await store.setSetting('defaultMode', 'loop');
  await store.setSetting('recordHistory', false);
  const all = await store.getAllSettings();
  assert.equal(all.defaultMode, 'loop');
  assert.equal(all.recordHistory, false);
  assert.equal(await store.getSetting('theme', 'system'), 'system', '未设置的项返回默认值');
});