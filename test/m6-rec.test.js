// M6/M7 推荐算法测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSong, reasonFor, rankSongs, pickDaily } from '../js/core/rec.js';

const DAY = 86400000;
const NOW = new Date('2026-09-17T12:00:00').getTime();

const mk = (id, title, playCount, daysAgo) => ({
  id, title, artist: '歌手' + id, duration: 200,
  playCount, lastPlayedAt: daysAgo === null ? 0 : NOW - daysAgo * DAY, cover: '', blob: null,
});

// 10 首歌：2 首常听、2 首收藏（含常听）、2 首怀旧、4 首没听过
const SONGS = [
  mk('s1', '常听A', 5, 1),
  mk('s2', '常听B', 4, 3),
  mk('s3', '收藏C', 0, null),
  mk('s4', '收藏D', 2, 2),
  mk('s5', '怀旧E', 3, 60),
  mk('s6', '怀旧F', 1, 90),
  mk('s7', '新歌G', 0, null),
  mk('s8', '新歌H', 0, null),
  mk('s9', '新歌I', 0, null),
  mk('s10', '新歌J', 0, null),
];
const FAVS = new Set(['s3', 's4']);
const OPTS = { favoriteIds: FAVS, now: NOW };

test('scoreSong：收藏加成、播放次数越多分越高、越久没听衰减越多', () => {
  const recent = scoreSong(mk('a', 'a', 5, 1), OPTS);
  const old = scoreSong(mk('b', 'b', 5, 60), OPTS);
  assert.ok(recent > old, '最近听过的同播放次数分数更高');
  const favNoPlay = scoreSong(mk('c', 'c', 0, null), { favoriteIds: new Set(['c']), now: NOW });
  assert.ok(favNoPlay >= 6, '收藏加成至少 6 分');
  assert.ok(scoreSong(mk('d', 'd', 10, 1), OPTS) > scoreSong(mk('e', 'e', 2, 1), OPTS));
});

test('reasonFor：优先级 收藏 > 常听 > 怀旧 > 探索', () => {
  assert.equal(reasonFor(SONGS[2], OPTS), '♥收藏');       // 收藏且没听过
  assert.equal(reasonFor(SONGS[0], OPTS), '常听');        // 常听
  assert.equal(reasonFor(SONGS[4], OPTS), '怀旧');        // 很久没听
  assert.equal(reasonFor(SONGS[6], OPTS), '为你探索');    // 从未播放
  // 收藏优先于常听
  assert.equal(reasonFor({ ...SONGS[0], id: 's4' }, OPTS), '♥收藏');
});

test('rankSongs：同一 seed 顺序稳定，不同 seed 顺序不同', () => {
  const a = rankSongs(SONGS, { ...OPTS, seed: 'seed-1' });
  const b = rankSongs(SONGS, { ...OPTS, seed: 'seed-1' });
  const c = rankSongs(SONGS, { ...OPTS, seed: 'seed-2' });
  assert.deepEqual(a.map((x) => x.song.id), b.map((x) => x.song.id));
  assert.notDeepEqual(a.map((x) => x.song.id), c.map((x) => x.song.id));
  assert.equal(a.length, SONGS.length);
  assert.ok(a.every((x) => x.reason));
});

test('rankSongs：收藏与高播放的歌曲排在前面（不受抖动主导）', () => {
  const top = rankSongs(SONGS, { ...OPTS, seed: 'any', n: 5 });
  const ids = top.map((x) => x.song.id);
  assert.ok(ids.includes('s1') || ids.includes('s2'), '常听歌曲应在前列');
});

test('pickDaily：同一天同一批次结果完全一致', () => {
  const a = pickDaily(SONGS, { ...OPTS, dateStr: '2026-9-17', batch: 0 });
  const b = pickDaily(SONGS, { ...OPTS, dateStr: '2026-9-17', batch: 0 });
  assert.deepEqual(a.map((x) => x.song.id), b.map((x) => x.song.id));
  assert.equal(a.length, 8);
});

test('pickDaily：换一批（batch+1）结果发生变化', () => {
  const a = pickDaily(SONGS, { ...OPTS, dateStr: '2026-9-17', batch: 0 });
  const b = pickDaily(SONGS, { ...OPTS, dateStr: '2026-9-17', batch: 1 });
  assert.notDeepEqual(a.map((x) => x.song.id), b.map((x) => x.song.id));
});

test('pickDaily：日期变化结果发生变化', () => {
  const a = pickDaily(SONGS, { ...OPTS, dateStr: '2026-9-17', batch: 0 });
  const b = pickDaily(SONGS, { ...OPTS, dateStr: '2026-9-18', batch: 0 });
  assert.notDeepEqual(a.map((x) => x.song.id), b.map((x) => x.song.id));
});

test('pickDaily：收藏歌曲优先纳入，无重复条目', () => {
  const picks = pickDaily(SONGS, { ...OPTS, dateStr: '2026-9-17', batch: 0 });
  const ids = picks.map((x) => x.song.id);
  assert.equal(new Set(ids).size, ids.length, '不应有重复');
  assert.ok(ids.includes('s3') && ids.includes('s4'), '两首收藏都应被推荐');
  const favCount = picks.filter((x) => x.reason === '♥收藏').length;
  assert.ok(favCount >= 2, '收藏至少占 2 首');
});

test('pickDaily：曲库不足 n 首时按实际数量返回；空库返回空数组', () => {
  const picks = pickDaily(SONGS.slice(0, 3), { ...OPTS, dateStr: '2026-9-17', batch: 0, n: 8 });
  assert.equal(picks.length, 3);
  assert.deepEqual(pickDaily([], { ...OPTS, dateStr: 'x', batch: 0 }), []);
});

test('pickDaily：混合了常听/收藏/探索三类，不是单一来源', () => {
  const picks = pickDaily(SONGS, { ...OPTS, dateStr: '2026-9-17', batch: 0 });
  const reasons = new Set(picks.map((x) => x.reason));
  assert.ok(reasons.has('♥收藏'));
  assert.ok(reasons.has('常听'));
  assert.ok(reasons.size >= 3, `应包含至少 3 类理由，实际：${[...reasons]}`);
});