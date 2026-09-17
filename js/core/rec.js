// 推荐算法（纯函数，可测试）：打分、理由标签、今日推荐
import { mulberry32 } from './queue.js';

const DAY = 86400000;
export const HALF_LIFE_DAYS = 14;

/** 稳定哈希抖动：同一 (seed, id) 恒为同一值，范围 [0, 1) */
function jitter(seed, id) {
  return mulberry32(`${seed}|${id}`)();
}

/**
 * 单曲评分：播放次数 × 时间衰减 + 收藏加成
 * @returns {number}
 */
export function scoreSong(song, { favoriteIds = new Set(), now = Date.now() } = {}) {
  const plays = song.playCount || 0;
  const days = song.lastPlayedAt ? (now - song.lastPlayedAt) / DAY : Infinity;
  const recency = Number.isFinite(days) ? Math.exp(-days / HALF_LIFE_DAYS) : 0;
  let score = plays * (0.3 + 0.7 * recency);
  if (favoriteIds.has(song.id)) score += 6;
  return score;
}

/** 推荐理由标签：收藏 > 常听 > 怀旧 > 探索 */
export function reasonFor(song, { favoriteIds = new Set(), now = Date.now() } = {}) {
  const plays = song.playCount || 0;
  const days = song.lastPlayedAt ? (now - song.lastPlayedAt) / DAY : Infinity;
  if (favoriteIds.has(song.id)) return '♥收藏';
  if (plays >= 2 && days <= 14) return '常听';
  if (plays >= 1 && days >= 30) return '怀旧';
  if (plays === 0) return '为你探索';
  return '常听';
}

/**
 * 推荐列表：评分 + 种子抖动（同一 seed 结果稳定，换 seed 会变化）
 * @returns {Array<{song, reason, score}>}
 */
export function rankSongs(songs, { favoriteIds = new Set(), now = Date.now(), seed = '', n = 30, jitterScale = 3 } = {}) {
  return songs
    .map((song) => {
      const base = scoreSong(song, { favoriteIds, now });
      const score = base + jitter(seed, song.id) * jitterScale;
      return { song, reason: reasonFor(song, { favoriteIds, now }), score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/**
 * 今日推荐：按「常听 / 收藏 / 怀旧探索」三类混合挑选
 * - 同一 (dateStr, batch) 结果完全一致
 * - batch 或日期变化则会变化
 */
export function pickDaily(songs, { favoriteIds = new Set(), now = Date.now(), dateStr = '', batch = 0, n = 8 } = {}) {
  if (!songs.length) return [];
  const seed = `${dateStr}#${batch}`;
  const withReason = songs.map((song) => ({
    song,
    reason: reasonFor(song, { favoriteIds, now }),
    j: jitter(seed, song.id),
  }));

  const favs = withReason.filter((x) => x.reason === '♥收藏').sort((a, b) => b.j - a.j);
  const familiar = withReason.filter((x) => x.reason === '常听').sort((a, b) => b.j - a.j);
  const nostalgia = withReason.filter((x) => x.reason === '怀旧').sort((a, b) => b.j - a.j);
  const explore = withReason.filter((x) => x.reason === '为你探索').sort((a, b) => b.j - a.j);

  const favQuota = Math.min(favs.length, Math.max(2, Math.round(n * 0.3)));
  const familiarQuota = Math.min(familiar.length, Math.max(2, Math.round(n * 0.35)));
  const nostalgiaQuota = Math.min(nostalgia.length, 1);
  const picks = [
    ...favs.slice(0, favQuota),
    ...familiar.slice(0, familiarQuota),
    ...nostalgia.slice(0, nostalgiaQuota),
  ];

  // 补足到 n：其余按抖动从大到小补
  const picked = new Set(picks.map((p) => p.song.id));
  const rest = withReason
    .filter((x) => !picked.has(x.song.id))
    .sort((a, b) => b.j - a.j);
  for (const item of rest) {
    if (picks.length >= n) break;
    // 探索类优先补充，避免全是老歌
    picks.push(item);
    picked.add(item.song.id);
  }

  return picks.slice(0, n).map(({ song, reason }) => ({ song, reason }));
}