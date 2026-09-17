// M7 喜欢页：推荐会随播放行为变化（播放反哺推荐）
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter } from '../js/core/memoryAdapter.js';
import { store } from '../js/core/store.js';
import { rankSongs } from '../js/core/rec.js';

const SONGS = [
  { fileName: 'a.mp3', title: '甲', artist: '歌手A', duration: 100 },
  { fileName: 'b.mp3', title: '乙', artist: '歌手B', duration: 100 },
  { fileName: 'c.mp3', title: '丙', artist: '歌手B', duration: 100 },
  { fileName: 'd.mp3', title: '丁', artist: '歌手C', duration: 100 },
];

async function rankList(seed = 'x') {
  const songs = await store.listSongs();
  const favoriteIds = new Set(await store.listFavoriteIds());
  return rankSongs(songs, { favoriteIds, now: Date.now(), seed });
}

beforeEach(async () => {
  await store.init(new MemoryAdapter());
  await store.importSongs(SONGS);
});

test('播放反哺：多次播放后该歌曲排到推荐列表首位', async () => {
  const before = (await rankList()).map((x) => x.song.title);
  const songs = await store.listSongs();
  const target = songs.find((s) => s.title === '丁');
  const rankBefore = before.indexOf('丁');
  for (let i = 0; i < 5; i++) await store.recordPlay(target.id);
  const after = (await rankList()).map((x) => x.song.title);
  const rankAfter = after.indexOf('丁');
  // 5 次播放的得分（约 5 分）远高于抖动上限（3 分），必然排到首位
  assert.equal(after[0], '丁', `多次播放后应排到首位，实际顺序：${after}`);
  assert.ok(
    rankAfter <= rankBefore,
    `排名不应下降：前 ${rankBefore} → 后 ${rankAfter}（列表：${after}）`,
  );
});

test('收藏反哺：收藏后带「♥收藏」标签且进入前列', async () => {
  const songs = await store.listSongs();
  const target = songs.find((s) => s.title === '丙');
  await store.toggleFavorite(target.id);
  const list = await rankList();
  const item = list.find((x) => x.song.title === '丙');
  assert.equal(item.reason, '♥收藏');
  assert.ok(list.indexOf(item) <= 1, '收藏歌曲应在前两位');
});

test('未播放歌曲标「为你探索」，播放过的标「常听」', async () => {
  const songs = await store.listSongs();
  const played = songs.find((s) => s.title === '甲');
  await store.recordPlay(played.id);
  await store.recordPlay(played.id);
  const list = await rankList();
  assert.equal(list.find((x) => x.song.title === '甲').reason, '常听');
  assert.equal(list.find((x) => x.song.title === '乙').reason, '为你探索');
});

test('刷新（换 seed）后列表仍包含全部歌曲且无重复', async () => {
  const a = (await rankList('s1')).map((x) => x.song.id);
  const b = (await rankList('s2')).map((x) => x.song.id);
  assert.equal(new Set(b).size, b.length, '不应有重复');
  assert.deepEqual([...b].sort(), [...a].sort(), '换 seed 只改顺序，不改成员');
});