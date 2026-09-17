// 浏览器自检：在真实 IndexedDB（独立库）上验证存储层与推荐逻辑
import { IDBAdapter } from '../core/db.js';
import { store } from '../core/store.js';
import { rankSongs, pickDaily } from '../core/rec.js';
import { Queue } from '../core/queue.js';
import { parseFileName, fmtTime, dateLabel } from '../core/util.js';

const results = [];
const casesEl = document.getElementById('cases');
const summaryEl = document.getElementById('summary');

function ok(name, fn) { return { name, fn }; }

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}
function eq(a, b, msg) {
  assert(JSON.stringify(a) === JSON.stringify(b), msg || `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
}

const TESTS = [
  ok('适配器：写入 / 读取 / 计数 / 删除', async (a) => {
    await a.put('songs', { id: 'x1', title: '临时' });
    eq((await a.get('songs', 'x1')).title, '临时');
    await a.delete('songs', 'x1');
    eq(await a.get('songs', 'x1'), undefined);
  }),
  ok('导入去重：同 标题+歌手 只保留一首', async () => {
    await store.importSongs([
      { fileName: '1.mp3', title: '去重测试', artist: '甲', duration: 10 },
      { fileName: '2.mp3', title: '去重测试', artist: '甲', duration: 10 },
    ]);
    const songs = await store.listSongs({ query: '去重测试' });
    eq(songs.length, 1);
  }),
  ok('歌单：一首歌可同时在多个歌单', async () => {
    const { added } = await store.importSongs([{ fileName: 'm.mp3', title: '多单测试', artist: '乙', duration: 10 }]);
    const p1 = await store.createPlaylist('自检A');
    const p2 = await store.createPlaylist('自检B');
    await store.addToPlaylists([added[0].id], [p1.id, p2.id]);
    const d1 = await store.getPlaylistDetail(p1.id);
    const d2 = await store.getPlaylistDetail(p2.id);
    eq(d1.songs.length, 1);
    eq(d2.songs.length, 1);
  }),
  ok('歌单：重排顺序被保存', async () => {
    const { added } = await store.importSongs([
      { fileName: 'r1.mp3', title: '排序甲', artist: '丙', duration: 10 },
      { fileName: 'r2.mp3', title: '排序乙', artist: '丙', duration: 10 },
    ]);
    const p = await store.createPlaylist('自检排序');
    await store.addToPlaylists(added.map((s) => s.id), [p.id]);
    await store.reorderPlaylist(p.id, [added[1].id, added[0].id]);
    const d = await store.getPlaylistDetail(p.id);
    eq(d.songs.map((s) => s.title), ['排序乙', '排序甲']);
  }),
  ok('删除歌曲：级联清理收藏与歌单条目', async () => {
    const { added } = await store.importSongs([{ fileName: 'c.mp3', title: '级联测试', artist: '丁', duration: 10 }]);
    const p = await store.createPlaylist('自检级联');
    await store.addToPlaylists([added[0].id], [p.id]);
    await store.toggleFavorite(added[0].id);
    await store.deleteSongs([added[0].id]);
    const d = await store.getPlaylistDetail(p.id);
    eq(d.songs.length, 0);
    assert(!(await store.isFavorite(added[0].id)), '收藏应被清理');
  }),
  ok('历史：写入与分组、可清空', async () => {
    const { added } = await store.importSongs([{ fileName: 'h.mp3', title: '历史测试', artist: '戊', duration: 10 }]);
    await store.recordPlay(added[0].id);
    const groups = await store.getHistoryGrouped();
    eq(groups[0].label, '今天');
    assert(groups.flatMap((g) => g.items).length >= 1, '应有历史记录');
  }),
  ok('统计：播放次数累加', async () => {
    const songs = await store.listSongs({ query: '历史测试' });
    const stats = await store.getStats();
    assert(stats.totalPlays >= 1, `totalPlays=${stats.totalPlays}`);
    assert(songs.length >= 1);
  }),
  ok('备份：导出不含音频本体，导入可恢复歌单', async () => {
    const backup = await store.exportBackup();
    assert(backup.songs.every((s) => s.blob === undefined), '备份不应包含音频');
    const playlistCount = backup.playlists.length;
    await store.importBackup(backup);
    eq((await store.listPlaylists()).length, playlistCount);
  }),
  ok('推荐：同种子稳定、换种子变化', async () => {
    const songs = await store.listSongs();
    const a = rankSongs(songs, { seed: 'k1' }).map((x) => x.song.id);
    const b = rankSongs(songs, { seed: 'k1' }).map((x) => x.song.id);
    const c = rankSongs(songs, { seed: 'k2' }).map((x) => x.song.id);
    eq(a, b);
    assert(JSON.stringify(a) !== JSON.stringify(c), '不同种子应改变顺序');
    const d1 = pickDaily(songs, { dateStr: '2026-9-17', batch: 0 });
    const d2 = pickDaily(songs, { dateStr: '2026-9-17', batch: 1 });
    assert(JSON.stringify(d1.map((x) => x.song.id)) !== JSON.stringify(d2.map((x) => x.song.id)), '换一批应变化');
  }),
  ok('播放队列：随机模式一轮内不重复', () => {
    const q = new Queue(['a', 'b', 'c', 'd'], 0, 'shuffle');
    q.shuffleSeed = 'fixed';
    const seen = [0];
    for (let i = 0; i < 3; i++) {
      const n = q.nextIndex();
      assert(!seen.includes(n), '出现重复索引');
      seen.push(n);
    }
    eq(seen.length, 4);
  }),
  ok('工具函数：文件名解析与格式化', () => {
    eq(parseFileName('周杰伦 - 晴天.mp3'), { artist: '周杰伦', title: '晴天' });
    eq(fmtTime(269), '4:29');
    eq(fmtTime(0), '0:00');
    assert(['今天', '昨天'].includes(dateLabel(Date.now())), 'dateLabel 今天');
  }),
  ok('清理：自检产生的数据可被清空', async (a) => {
    await a.clear('songs');
    await a.clear('playlists');
    await a.clear('playlist_songs');
    await a.clear('favorites');
    await a.clear('history');
    eq((await store.listSongs()).length, 0);
    eq((await store.listPlaylists()).length, 0);
  }),
];

(async () => {
  const adapter = new IDBAdapter('yueting-selftest');
  await adapter.open();
  await store.init(adapter);
  // 从干净状态开始
  for (const t of ['songs', 'playlists', 'playlist_songs', 'favorites', 'history', 'settings', 'player_state']) {
    await adapter.clear(t);
  }

  for (const t of TESTS) {
    try {
      await t.fn(adapter);
      results.push({ name: t.name, pass: true });
    } catch (e) {
      results.push({ name: t.name, pass: false, error: e?.message || String(e) });
    }
  }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  summaryEl.textContent = fail
    ? `❌ ${pass}/${results.length} 通过，${fail} 项失败`
    : `✅ 全部通过（${pass}/${results.length}）`;
  summaryEl.style.color = fail ? 'var(--danger)' : 'var(--success)';
  casesEl.innerHTML = results.map((r) => `
    <div class="case ${r.pass ? 'pass' : 'fail'}">
      <span class="tag">${r.pass ? 'PASS' : 'FAIL'}</span>
      <span>${r.name}${r.error ? `<span class="err">${r.error}</span>` : ''}</span>
    </div>`).join('');
  window.__selftest = { pass, fail, total: results.length, results };
})();