// 开发辅助：合成测试数据（仅手动调用，不参与应用逻辑）
import { store } from '../core/store.js';
import { readMeta } from '../core/meta.js';
import { player } from '../core/player.js';

window.__readMeta = readMeta;
window.__player = player;

/** 构造一个带 ID3v2.3 标签（UTF-8）的 MP3 文件，用于验证元数据解析 */
window.__makeId3Mp3 = function (title = '标签歌名', artist = '标签歌手', album = '标签专辑') {
  const utf8 = (s) => [...new TextEncoder().encode(s)];
  const textFrame = (id, text) => {
    const body = [0x03, ...utf8(text)]; // 0x03 = UTF-8 编码
    const size = body.length;
    return [...utf8(id), (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff, 0, 0, ...body];
  };
  // 1x1 PNG 作为封面
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='),
    (c) => c.charCodeAt(0),
  );
  const picBody = [0x00, ...utf8('image/png'), 0, 0x03, 0x00, ...png]; // encoding=ISO, mime\0, type=cover, desc\0, data
  const picSize = picBody.length;
  const apic = [...utf8('APIC'), (picSize >>> 24) & 0xff, (picSize >>> 16) & 0xff, (picSize >>> 8) & 0xff, picSize & 0xff, 0, 0, ...picBody];

  const frames = [...textFrame('TIT2', title), ...textFrame('TPE1', artist), ...textFrame('TALB', album), ...apic];
  const size = frames.length;
  const syncsafe = [(size >>> 21) & 0x7f, (size >>> 14) & 0x7f, (size >>> 7) & 0x7f, size & 0x7f];
  const header = [...utf8('ID3'), 3, 0, 0, ...syncsafe];
  const audio = new Uint8Array(1024);
  return new File([new Uint8Array([...header, ...frames]), audio], '标签测试 - 文件名兜底.mp3', { type: 'audio/mpeg' });
};

window.__seed = async function () {
  const mk = (title, artist, dur, i) => ({
    fileName: `${i}.mp3`, title, artist, album: '测试专辑', duration: dur,
    mime: 'audio/mpeg', size: 1000 + i,
    blob: new Blob([new Uint8Array(64)], { type: 'audio/mpeg' }),
  });
  const res = await store.importSongs([
    mk('晴天', '周杰伦', 269, 1), mk('海阔天空', 'Beyond', 326, 2),
    mk("C'mon", 'Kehlani', 200, 3), mk('夜曲', '周杰伦', 226, 4),
    mk('Roar', 'Katy Perry', 229, 5), mk('七里香', '周杰伦', 299, 6),
  ]);
  return { added: res.added.length, skipped: res.skipped.length };
};

window.__store = store;

/** 清空全部本地数据（仅用于验收空状态） */
window.__wipe = async function () {
  const adapter = window.__adapter;
  for (const t of ['songs', 'playlists', 'playlist_songs', 'favorites', 'history', 'settings', 'player_state']) {
    await adapter.clear(t);
  }
  return 'wiped';
};

// 生成一段真实可播放的 WAV（正弦波），用于播放引擎验收
window.__seedTone = async function (title = '测试音', artist = '合成器', seconds = 3) {
  const rate = 44100, n = rate * seconds;
  const data = new DataView(new ArrayBuffer(44 + n * 2));
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
  wstr(36, 'data'); data.setUint32(40, n * 2, true);
  const freq = 330 + Math.floor(Math.random() * 3) * 110;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 8, (seconds - t) * 8); // 淡入淡出防爆音
    data.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * freq * t) * 0.25 * env * 32767), true);
  }
  const blob = new Blob([data.buffer], { type: 'audio/wav' });
  const res = await store.importSongs([{
    fileName: `${title}.wav`, title, artist, album: '合成测试', duration: seconds,
    mime: 'audio/wav', size: blob.size, blob,
  }]);
  return { added: res.added.length, skipped: res.skipped.length };
};
