// 歌曲通用操作菜单（曲库/收藏/歌单/推荐共用）
import { actionSheet } from './sheet.js';
import { confirmDialog } from './confirm.js';
import { showToast } from './toast.js';
import { playlistPicker } from './playlistPicker.js';
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { fmtTime } from '../core/util.js';

async function getPlayer() {
  try {
    const { player } = await import('../core/player.js');
    return player;
  } catch {
    showToast('播放器暂不可用');
    return null;
  }
}

export async function showSongActions(song, { canDelete = true, extraActs = [], onExtra, onChanged } = {}) {
  const fav = await store.isFavorite(song.id);
  const acts = [
    { label: '▶ 播放', value: 'play' },
    { label: '⏭ 下一首播放', value: 'next' },
    { label: '＋ 加入歌单', value: 'pl' },
    { label: fav ? '♥ 取消收藏' : ' 收藏', value: 'fav' },
    ...extraActs,
    { label: 'ℹ 歌曲信息', value: 'info' },
  ];
  if (canDelete) acts.push({ label: ' 从曲库删除', value: 'del', danger: true });

  const v = await actionSheet(song.title, acts);
  if (!v) return;
  if (extraActs.some((a) => a.value === v)) { await onExtra?.(v, song); return; }
  switch (v) {
    case 'play': {
      const player = await getPlayer();
      if (player) { await player.playAll([song], 0, true); }
      break;
    }
    case 'next': {
      const player = await getPlayer();
      if (player) { player.queueNext(song); }
      break;
    }
    case 'pl': {
      const ids = await playlistPicker(1);
      if (ids?.length) {
        const n = await store.addToPlaylists([song.id], ids);
        showToast(`已加入 ${n} 个歌单`);
        onChanged?.();
      }
      break;
    }
    case 'fav': {
      const r = await store.toggleFavorite(song.id);
      showToast(r.fav ? '已收藏 ♥' : '已取消收藏');
      bus.emit('favorites:changed');
      onChanged?.();
      break;
    }
    case 'info': {
      const size = song.size ? `${(song.size / 1048576).toFixed(1)} MB` : '未知';
      await actionSheet(`《${song.title}》`, [
        { label: `歌手：${song.artist}`, value: 'noop' },
        { label: `专辑：${song.album || '未知专辑'}`, value: 'noop' },
        { label: `时长：${fmtTime(song.duration)}`, value: 'noop' },
        { label: `文件：${song.mime || '未知格式'} · ${size}`, value: 'noop' },
        { label: '关闭', value: 'close' },
      ]);
      break;
    }
    case 'del': {
      const ok = await confirmDialog({
        title: '删除歌曲',
        text: `将从曲库删除《${song.title}》，并同步清理它在收藏、歌单和历史中的记录。`,
        danger: true, okText: '删除',
      });
      if (ok) {
        await store.deleteSongs([song.id]);
        showToast('已删除');
        bus.emit('songs:changed');
        onChanged?.();
      }
      break;
    }
  }
}
