// 音频元数据读取：标签（jsmediatags）+ 时长（Audio）+ 文件名兜底
import { parseFileName } from './util.js';

export const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wav', 'webm', 'mp4'];

export function isAudioFile(file) {
  if (file.type && file.type.startsWith('audio/')) return true;
  const ext = (file.name || '').split('.').pop().toLowerCase();
  return AUDIO_EXTS.includes(ext);
}

function readTags(file) {
  return new Promise((resolve, reject) => {
    if (!window.jsmediatags) return reject(new Error('jsmediatags 未加载'));
    window.jsmediatags.read(file, {
      onSuccess: (r) => resolve(r.tags || {}),
      onError: (e) => reject(e?.error || e || new Error('无标签')),
    });
  });
}

function readDuration(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (v) => { a.removeAttribute('src'); a.load(); URL.revokeObjectURL(url); resolve(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(0);
    a.src = url;
    setTimeout(() => done(0), 8000); // 兜底：坏文件不卡导入
  });
}

function pictureToDataUrl(pic) {
  if (!pic || !Array.isArray(pic.data)) return '';
  const bytes = new Uint8Array(pic.data);
  let bin = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${pic.format || 'image/jpeg'};base64,${btoa(bin)}`;
}

/** 读取单个音频文件元数据；标签缺失时用文件名兜底（"歌手 - 歌名"） */
export async function readMeta(file) {
  const fallback = parseFileName(file.name);
  let tags = {};
  try { tags = await readTags(file); } catch { /* 无标签或格式不支持标签 */ }
  return {
    fileName: file.name,
    blob: file,
    mime: file.type || '',
    size: file.size || 0,
    title: (tags.title || '').trim() || fallback.title,
    artist: (tags.artist || '').trim() || fallback.artist || '未知歌手',
    album: (tags.album || '').trim() || '',
    cover: pictureToDataUrl(tags.picture),
    duration: await readDuration(file),
  };
}
