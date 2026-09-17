// 导入编排：过滤音频 -> 逐个读元数据（带进度）-> 去重入库
import { isAudioFile, readMeta } from './meta.js';
import { store } from './store.js';

/**
 * @param {FileList|File[]} files
 * @param {{onProgress?: (p:{current:number,total:number,name:string})=>void}} opts
 * @returns {Promise<{added:number, skipped:number, unsupported:number, failed:number}>}
 */
export async function importFiles(files, { onProgress } = {}) {
  const all = [...files];
  const audios = all.filter(isAudioFile);
  const unsupported = all.length - audios.length;
  let failed = 0;
  const items = [];
  for (let i = 0; i < audios.length; i++) {
    try {
      items.push(await readMeta(audios[i]));
    } catch (e) {
      console.warn('读取元数据失败', audios[i].name, e);
      failed++;
    }
    onProgress?.({ current: i + 1, total: audios.length, name: audios[i].name });
  }
  const { added, skipped } = await store.importSongs(items);
  return { added, skipped, unsupported, failed };
}
