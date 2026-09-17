// 首页搜索匹配逻辑的单元测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchAll, songScore, playlistScore } from '../js/core/search.js';

const SONGS = [
  { id: 'a', title: '晴天', artist: '周杰伦', album: '叶惠美', addedAt: 10 },
  { id: 'b', title: '夜曲', artist: '周杰伦', album: '十一月的萧邦', addedAt: 20 },
  { id: 'c', title: '晴天娃娃', artist: '其他歌手', album: '', addedAt: 30 },
  { id: 'd', title: 'Roar', artist: 'Katy Perry', album: 'Prism', addedAt: 40 },
];
const PLAYLISTS = [
  { id: 'p1', name: '通勤路上', updatedAt: 5 },
  { id: 'p2', name: '睡前', updatedAt: 8 },
];

test('空查询：返回 empty，不返回任何结果', () => {
  for (const q of ['', '   ', undefined, null]) {
    const r = searchAll({ songs: SONGS, playlists: PLAYLISTS, query: q });
    assert.equal(r.empty, true);
    assert.deepEqual(r.songs, []);
    assert.deepEqual(r.playlists, []);
    assert.equal(r.total, 0);
  }
});

test('匹配歌名（完全一致 > 前缀 > 包含）', () => {
  assert.equal(songScore(SONGS[0], '晴天'), 100);
  assert.equal(songScore(SONGS[2], '晴天'), 80, '「晴天娃娃」是前缀匹配');
  assert.equal(songScore(SONGS[0], '天'), 60, '中间包含算包含匹配');
  assert.equal(songScore(SONGS[0], '不存在'), 0);
});

test('匹配歌手与专辑', () => {
  assert.equal(songScore(SONGS[1], '周杰伦'), 50);
  assert.equal(songScore(SONGS[1], '萧邦'), 15, '专辑命中得分最低');
  assert.ok(songScore(SONGS[0], '周杰伦') > songScore(SONGS[0], '叶惠美'));
});

test('大小写与空格不敏感', () => {
  assert.equal(songScore(SONGS[3], 'roar'), 100);
  assert.equal(songScore(SONGS[3], '  ROAR  '), 100);
  const r = searchAll({ songs: SONGS, playlists: [], query: '  katy  ' });
  assert.deepEqual(r.songs.map((s) => s.id), ['d']);
  assert.equal(r.query, 'katy', '返回的 query 应是去除首尾空格后的');
});

test('结果排序：歌名命中排在歌手命中之前', () => {
  const r = searchAll({ songs: SONGS, playlists: [], query: '晴天' });
  assert.deepEqual(r.songs.map((s) => s.id), ['a', 'c'], '完全命中在前，前缀命中在后');
});

test('歌单按名称匹配', () => {
  assert.equal(playlistScore(PLAYLISTS[0], '通勤'), 80);
  assert.equal(playlistScore(PLAYLISTS[1], '睡前'), 100);
  const r = searchAll({ songs: SONGS, playlists: PLAYLISTS, query: '睡' });
  assert.deepEqual(r.playlists.map((p) => p.id), ['p2']);
  assert.equal(r.songs.length, 0);
  assert.equal(r.total, 1);
});

test('同时命中歌曲与歌单时 total 为两者之和', () => {
  const songs = [{ id: 'x', title: '通勤歌单同款', artist: 'A', album: '' }];
  const r = searchAll({ songs, playlists: PLAYLISTS, query: '通勤' });
  assert.equal(r.total, 2);
  assert.equal(r.songs.length, 1);
  assert.equal(r.playlists.length, 1);
});

test('无匹配：empty 为 false 但结果为空（用于区分「没输入」和「没找到」）', () => {
  const r = searchAll({ songs: SONGS, playlists: PLAYLISTS, query: 'zzz不存在' });
  assert.equal(r.empty, false);
  assert.equal(r.total, 0);
  assert.deepEqual(r.songs, []);
});

test('空曲库与空歌单不会报错', () => {
  const r = searchAll({ query: '任何' });
  assert.equal(r.total, 0);
  assert.equal(r.empty, false);
  assert.deepEqual(searchAll().songs, []);
});

test('同分时按加入/更新时间倒序，结果稳定', () => {
  const same = [
    { id: 'old', title: '同名歌', artist: '', album: '', addedAt: 1 },
    { id: 'new', title: '同名歌', artist: '', album: '', addedAt: 2 },
  ];
  const r = searchAll({ songs: same, query: '同名歌' });
  assert.deepEqual(r.songs.map((s) => s.id), ['new', 'old']);
});