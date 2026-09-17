// M5 收藏与歌单测试：多对多、排序、删除语义
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter } from '../js/core/memoryAdapter.js';
import { store } from '../js/core/store.js';

const SONGS = [
  { fileName: 'a.mp3', title: 'A', artist: 'X', duration: 100 },
  { fileName: 'b.mp3', title: 'B', artist: 'Y', duration: 200 },
  { fileName: 'c.mp3', title: 'C', artist: 'Z', duration: 300 },
];

let ids;
beforeEach(async () => {
  await store.init(new MemoryAdapter());
  const { added } = await store.importSongs(SONGS);
  ids = added.map((s) => s.id);
});

test('收藏：toggle 切换、按收藏时间倒序、可重复收藏回来', async () => {
  assert.deepEqual(await store.toggleFavorite(ids[0]), { fav: true });
  assert.deepEqual(await store.toggleFavorite(ids[1]), { fav: true });
  assert.equal(await store.isFavorite(ids[0]), true);
  let favs = await store.listFavoriteSongs();
  assert.deepEqual(favs.map((s) => s.title), ['B', 'A']);
  await store.toggleFavorite(ids[0]);
  assert.equal(await store.isFavorite(ids[0]), false);
  favs = await store.listFavoriteSongs();
  assert.deepEqual(favs.map((s) => s.title), ['B']);
});

test('歌单：一首歌可同时在多个歌单（多对多）', async () => {
  const p1 = await store.createPlaylist('通勤');
  const p2 = await store.createPlaylist('睡前');
  const n = await store.addToPlaylists([ids[0], ids[1]], [p1.id, p2.id]);
  assert.equal(n, 4);
  const d1 = await store.getPlaylistDetail(p1.id);
  const d2 = await store.getPlaylistDetail(p2.id);
  assert.deepEqual(d1.songs.map((s) => s.title), ['A', 'B']);
  assert.deepEqual(d2.songs.map((s) => s.title), ['A', 'B']);
  assert.deepEqual(d2.songs.map((s) => s.id), [ids[0], ids[1]]);
});

test('歌单：重复添加不会产生重复条目', async () => {
  const p = await store.createPlaylist('去重');
  assert.equal(await store.addToPlaylists([ids[0]], [p.id]), 1);
  assert.equal(await store.addToPlaylists([ids[0], ids[1]], [p.id]), 1);
  const d = await store.getPlaylistDetail(p.id);
  assert.equal(d.songs.length, 2);
  const list = await store.listPlaylists();
  assert.equal(list.find((x) => x.id === p.id).songCount, 2);
});

test('歌单：reorderPlaylist 保存自定义顺序', async () => {
  const p = await store.createPlaylist('排序');
  await store.addToPlaylists(ids, [p.id]);
  await store.reorderPlaylist(p.id, [ids[2], ids[0], ids[1]]);
  const d = await store.getPlaylistDetail(p.id);
  assert.deepEqual(d.songs.map((s) => s.title), ['C', 'A', 'B']);
});

test('歌单：删除歌单不删除歌曲，也不影响其他歌单', async () => {
  const p1 = await store.createPlaylist('要删的');
  const p2 = await store.createPlaylist('保留的');
  await store.addToPlaylists([ids[0]], [p1.id, p2.id]);
  await store.deletePlaylist(p1.id);
  assert.equal(await store.getPlaylistDetail(p1.id), null);
  assert.equal((await store.listSongs()).length, 3, '歌曲仍在曲库');
  const d2 = await store.getPlaylistDetail(p2.id);
  assert.deepEqual(d2.songs.map((s) => s.title), ['A']);
});

test('歌单：移除单曲不影响收藏状态', async () => {
  const p = await store.createPlaylist('移除');
  await store.addToPlaylists([ids[0], ids[1]], [p.id]);
  await store.toggleFavorite(ids[0]);
  await store.removeFromPlaylist(p.id, ids[0]);
  const d = await store.getPlaylistDetail(p.id);
  assert.deepEqual(d.songs.map((s) => s.title), ['B']);
  assert.equal(await store.isFavorite(ids[0]), true);
});

test('歌单：改名与换色持久化，列表按创建顺序返回', async () => {
  const p1 = await store.createPlaylist('一');
  const p2 = await store.createPlaylist('二');
  await store.updatePlaylist(p1.id, { name: '新名字', color: '#123456' });
  const list = await store.listPlaylists();
  assert.deepEqual(list.map((x) => x.name), ['新名字', '二']);
  assert.equal(list[0].color, '#123456');
  assert.notEqual(p1.color, p2.color, '默认颜色按创建顺序轮换');
});