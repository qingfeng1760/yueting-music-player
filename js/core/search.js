// 搜索匹配（纯函数，可测试）：在本地歌曲与歌单中查找关键字

/** 归一化：小写、去首尾空白 */
function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

/**
 * 计算单首歌的匹配得分：歌名命中得分最高，其次歌手，最后专辑。
 * 查询串内部会做去空格/小写归一化。返回 0 表示不匹配。
 */
export function songScore(song, query) {
  const q = norm(query);
  const title = norm(song.title);
  const artist = norm(song.artist);
  const album = norm(song.album);
  if (!q) return 0;
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (artist === q) return 50;
  if (artist.startsWith(q)) return 40;
  if (artist.includes(q)) return 30;
  if (album.includes(q)) return 15;
  return 0;
}

/** 歌单按名称匹配（查询串内部归一化） */
export function playlistScore(playlist, query) {
  const q = norm(query);
  const name = norm(playlist.name);
  if (!q) return 0;
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  return 0;
}

/**
 * 综合搜索：返回按相关度排序的歌曲与歌单
 * @returns {{empty:boolean, query:string, songs:Array, playlists:Array, total:number}}
 */
export function searchAll({ songs = [], playlists = [], query = '' } = {}) {
  const q = norm(query);
  if (!q) return { empty: true, query: '', songs: [], playlists: [], total: 0 };

  const matchedSongs = songs
    .map((song) => ({ song, score: songScore(song, q) }))
    .filter((x) => x.score > 0)
    // 同分时最新的排在前面，保证结果稳定
    .sort((a, b) => b.score - a.score || (b.song.addedAt || 0) - (a.song.addedAt || 0))
    .map((x) => x.song);

  const matchedPlaylists = playlists
    .map((pl) => ({ pl, score: playlistScore(pl, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.pl.updatedAt || 0) - (a.pl.updatedAt || 0))
    .map((x) => x.pl);

  return {
    empty: false,
    query: String(query).trim(),
    songs: matchedSongs,
    playlists: matchedPlaylists,
    total: matchedSongs.length + matchedPlaylists.length,
  };
}