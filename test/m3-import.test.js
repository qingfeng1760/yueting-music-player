// M3 导入相关测试：文件名兜底解析、音频识别、导入编排的去重语义
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter } from '../js/core/memoryAdapter.js';
import { store } from '../js/core/store.js';
import { parseFileName } from '../js/core/util.js';
import { isAudioFile, AUDIO_EXTS } from '../js/core/meta.js';

test('parseFileName：歌手 - 歌名 格式', () => {
  assert.deepEqual(parseFileName('周杰伦 - 晴天.mp3'), { artist: '周杰伦', title: '晴天' });
  assert.deepEqual(parseFileName('My Heart Will Go On - Titanic 版.m4a'), { artist: 'My Heart Will Go On', title: 'Titanic 版' });
});

test('parseFileName：无歌手时整体作为歌名', () => {
  assert.deepEqual(parseFileName('晴天.mp3'), { artist: '', title: '晴天' });
  assert.deepEqual(parseFileName('My Heart Will Go On (Titanic).m4a'), { artist: '', title: 'My Heart Will Go On (Titanic)' });
});

test('parseFileName：多段分隔只按第一段切', () => {
  assert.deepEqual(parseFileName('A - B - C.mp3'), { artist: 'A', title: 'B - C' });
});

test('isAudioFile：按扩展名与 MIME 识别', () => {
  assert.equal(isAudioFile({ name: 'a.mp3', type: '' }), true);
  assert.equal(isAudioFile({ name: 'b.flac', type: '' }), true);
  assert.equal(isAudioFile({ name: 'c.xyz', type: 'audio/mpeg' }), true);
  assert.equal(isAudioFile({ name: 'note.txt', type: 'text/plain' }), false);
  assert.ok(AUDIO_EXTS.includes('opus'));
});

test('导入编排语义：同文件名但不同标题不被误判重复', async () => {
  await store.init(new MemoryAdapter());
  const { added } = await store.importSongs([
    { fileName: '01.mp3', title: '晴天', artist: '周杰伦', duration: 269 },
    { fileName: '02.mp3', title: '晴天', artist: '别的歌手', duration: 200 },
    { fileName: '03.mp3', title: '  晴天 ', artist: ' 周杰伦 ', duration: 269 }, // 大小写/空格视为同一首
  ]);
  assert.equal(added.length, 2);
});
