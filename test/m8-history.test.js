// M8 历史记录测试：分组、搜索、删除、开关
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter } from '../js/core/memoryAdapter.js';
import { store } from '../js/core/store.js';

const DAY = 86400000;
let ids;
beforeEach(async () => {
  await store.init(new MemoryAdapter());
  const { added } = await store.importSongs([
    { fileName: 'a.mp3', title: '晴天', artist: '周杰伦', duration: 269 },
    { fileName: 'b.mp3', title: '海阔天空', artist: 'Beyond', duration: 326 },
  ]);
  ids = added.map((s) => s.id);
});

test('分组：按 今天/昨天/具体日期 归类，组内时间倒序', async () => {
  const now = Date.now();
  await store.recordPlay(ids[0], now - 1000);                    // 今天
  await store.recordPlay(ids[1], now - 1 * DAY);                 // 昨天
  await store.recordPlay(ids[0], now - 5 * DAY);                 // 5 天前
  const groups = await store.getHistoryGrouped();
  assert.equal(groups[0].label, '今天');
  assert.equal(groups[1].label, '昨天');
  assert.equal(groups.length, 3);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].items[0].song.title, '晴天');
});

test('分组：同一天多条按时间倒序排列', async () => {
  const now = Date.now();
  await store.recordPlay(ids[0], now - 3000);
  await store.recordPlay(ids[1], now - 1000);
  const today = (await store.getHistoryGrouped())[0];
  assert.deepEqual(today.items.map((i) => i.song.title), ['海阔天空', '晴天']);
});

test('搜索：按歌名或歌手过滤历史', async () => {
  await store.recordPlay(ids[0]);
  await store.recordPlay(ids[1]);
  const byTitle = await store.getHistoryGrouped({ query: '晴天' });
  assert.equal(byTitle.flatMap((g) => g.items).length, 1);
  const byArtist = await store.getHistoryGrouped({ query: 'beyond' });
  assert.equal(byArtist.flatMap((g) => g.items).length, 1);
  assert.equal((await store.getHistoryGrouped({ query: '不存在' })).length, 0);
});

test('删除单条：只移除该条记录', async () => {
  await store.recordPlay(ids[0]);
  await store.recordPlay(ids[1]);
  const before = (await store.getHistoryGrouped()).flatMap((g) => g.items);
  assert.equal(before.length, 2);
  await store.deleteHistoryEntry(before[0].id);
  const after = (await store.getHistoryGrouped()).flatMap((g) => g.items);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, before[1].id);
});

test('清空历史：全部移除，但播放次数与曲库不受影响', async () => {
  await store.recordPlay(ids[0]);
  await store.recordPlay(ids[1]);
  await store.clearHistory();
  assert.equal((await store.getHistoryGrouped()).flatMap((g) => g.items).length, 0);
  assert.equal((await store.listSongs()).length, 2);
  const song = await store.getSong(ids[0]);
  assert.equal(song.playCount, 1, '播放次数保留');
});

test('关闭「记录历史」后：不再新增记录，播放次数也不再增长', async () => {
  await store.setSetting('recordHistory', false);
  const r = await store.recordPlay(ids[0]);
  assert.equal(r, null);
  assert.equal((await store.getHistoryGrouped()).flatMap((g) => g.items).length, 0);
  assert.equal((await store.getSong(ids[0])).playCount, 0);
  // 重新打开后可继续记录
  await store.setSetting('recordHistory', true);
  await store.recordPlay(ids[0]);
  assert.equal((await store.getHistoryGrouped()).flatMap((g) => g.items).length, 1);
  assert.equal((await store.getSong(ids[0])).playCount, 1);
});

test('历史中歌曲被删除后，历史里不再出现该歌（级联清理）', async () => {
  await store.recordPlay(ids[0]);
  await store.recordPlay(ids[1]);
  await store.deleteSongs([ids[0]]);
  const items = (await store.getHistoryGrouped()).flatMap((g) => g.items);
  assert.equal(items.length, 1);
  assert.equal(items[0].song.title, '海阔天空');
});