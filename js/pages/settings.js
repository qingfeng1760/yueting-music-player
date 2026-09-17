// 数据与设置：统计 / 存储 / 备份 / 设置项 / 预留云同步
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { applyTheme, getThemePref, fmtTime, applyAccent } from '../core/util.js';
import { PRESET_ACCENTS, deriveAccent, normalizeHex, DEFAULT_ACCENT } from '../core/theme.js';
import { showToast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm.js';
import { pageHeader, bindBack } from '../ui/nav.js';

function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function fmtDuration(sec) {
  const s = Math.round(sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} 小时 ${m} 分`;
  return `${m} 分 ${s % 60} 秒`;
}

export async function render(root) {
  root.innerHTML = `
    ${pageHeader('数据与设置')}
    <div id="set-body"></div>
    <input type="file" id="set-import-file" accept=".json,application/json" hidden>`;
  bindBack(root, '#/me');
  const body = root.querySelector('#set-body');

  async function draw() {
    const [stats, usage, settings] = await Promise.all([
      store.getStats(),
      store.getStorageUsage(),
      store.getAllSettings(),
    ]);
    const theme = settings.theme || getThemePref() || 'system';
    const accent = normalizeHex(settings.accent) || ''; // 空 = 默认色
    const accentNow = accent || DEFAULT_ACCENT;
    const defaultMode = settings.defaultMode || 'order';
    const recordHistory = settings.recordHistory !== false;
    const maxPlay = Math.max(1, ...stats.top10.map((t) => t.playCount));

    body.innerHTML = `
      <div class="card">
        <b style="font-size:15px">📊 数据统计</b>
        <div class="stat-grid">
          <div class="stat-cell"><div class="stat-num">${stats.songCount}</div><div class="stat-label">本地歌曲</div></div>
          <div class="stat-cell"><div class="stat-num">${stats.totalPlays}</div><div class="stat-label">总播放次数</div></div>
          <div class="stat-cell"><div class="stat-num">${stats.listenCount}</div><div class="stat-label">播放记录</div></div>
          <div class="stat-cell"><div class="stat-num">${fmtDuration(stats.totalListenSec)}</div><div class="stat-label">累计听歌时长</div></div>
        </div>
        ${stats.top10.length ? `
          <div style="margin-top:14px">
            <div style="font-size:13px;color:var(--text-2);margin-bottom:8px">最常听的歌</div>
            ${stats.top10.map((t) => `
              <div class="top-row">
                <span class="top-name">${t.title}<span style="color:var(--text-2)"> · ${t.artist}</span></span>
                <span class="top-bar"><i style="width:${Math.round((t.playCount / maxPlay) * 100)}%"></i></span>
                <span class="top-count">${t.playCount} 次</span>
              </div>`).join('')}
          </div>` : '<div style="font-size:12.5px;color:var(--text-2);margin-top:12px">还没有播放记录，听几首歌后这里会出现统计</div>'}
      </div>

      <div class="card">
        <b style="font-size:15px">💾 存储管理</b>
        <div style="font-size:13px;color:var(--text-2);margin:8px 0 12px">
          本站数据占用约 <b style="color:var(--text)">${fmtBytes(usage.usage)}</b>
          <div style="margin-top:4px">由浏览器统一统计，包含音乐文件与全部本地数据；关闭浏览器不会丢失，清空浏览器站点数据则会一并清除。</div>
        </div>
        <button class="btn" id="set-clean">清理未引用数据</button>
      </div>

      <div class="card">
        <b style="font-size:15px">🗄 数据备份</b>
        <div style="font-size:12.5px;color:var(--text-2);margin:8px 0 12px">
          备份包含歌单、收藏、历史、设置和歌曲信息，<b>不包含音频文件本体</b>；恢复后需要重新导入音乐文件。
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-block" id="set-export">导出备份</button>
          <button class="btn btn-block" id="set-import">导入备份</button>
        </div>
      </div>

      <div class="card">
        <b style="font-size:15px">⚙️ 设置</b>
        <div class="setting-row">
          <span>主题外观</span>
          <select class="sort-select" id="set-theme">
            <option value="light" ${theme === 'light' ? 'selected' : ''}>浅色</option>
            <option value="dark" ${theme === 'dark' ? 'selected' : ''}>深色</option>
            <option value="system" ${theme === 'system' ? 'selected' : ''}>跟随系统</option>
          </select>
        </div>
        <div class="setting-col">
          <div class="setting-col-head">
            <span>界面颜色</span>
            <span class="accent-current" id="accent-current" style="background:${accentNow}"></span>
          </div>
          <div class="accent-swatches" id="accent-swatches">
            ${PRESET_ACCENTS.map((c) => `
              <button class="swatch ${c === accentNow ? 'active' : ''}" data-color="${c}"
                      style="background:${c}" aria-label="使用颜色 ${c}"></button>`).join('')}
            <label class="swatch swatch-custom" title="自定义颜色">
              <span>＋</span>
              <input type="color" id="accent-custom" value="${accentNow}" aria-label="自定义界面颜色">
            </label>
            <button class="btn" id="accent-reset" style="padding:6px 12px;font-size:12.5px;margin-left:auto">恢复默认</button>
          </div>
          <div class="setting-col-hint">整站按钮、标签和高亮都会使用这个颜色；文字会自动调整为可读的深浅。</div>
        </div>
        <div class="setting-row">
          <span>默认播放模式</span>
          <select class="sort-select" id="set-mode">
            <option value="order" ${defaultMode === 'order' ? 'selected' : ''}>顺序播放</option>
            <option value="loop" ${defaultMode === 'loop' ? 'selected' : ''}>列表循环</option>
            <option value="shuffle" ${defaultMode === 'shuffle' ? 'selected' : ''}>随机播放</option>
          </select>
        </div>
        <div class="setting-row">
          <span>记录播放历史</span>
          <label class="switch">
            <input type="checkbox" id="set-history" ${recordHistory ? 'checked' : ''}>
            <span class="switch-track"></span>
          </label>
        </div>
      </div>

      <div class="card" style="opacity:.6">
        <b style="font-size:15px">☁️ 账号与云同步</b>
        <div style="font-size:12.5px;color:var(--text-2);margin-top:6px">
          即将支持：登录后可在多设备同步歌单与收藏。当前所有数据仅保存在本机浏览器中。
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-block" disabled>登录</button>
          <button class="btn btn-block" disabled>云同步</button>
        </div>
      </div>`;

    body.querySelector('#set-theme').onchange = async (e) => {
      const v = e.target.value;
      await store.setSetting('theme', v);
      applyTheme(v);
      showToast(`主题已切换为${{ light: '浅色', dark: '深色', system: '跟随系统' }[v]}`);
      await draw(); // 深浅主题下标签配色变化，重绘预览
    };

    // 界面颜色：预设色板
    body.querySelectorAll('.swatch[data-color]').forEach((btn) => {
      btn.onclick = async () => {
        const color = btn.dataset.color;
        await store.setSetting('accent', color);
        applyAccent(color);
        await draw();
        showToast('界面颜色已更新');
      };
    });
    // 界面颜色：自定义取色
    body.querySelector('#accent-custom').onchange = async (e) => {
      const color = normalizeHex(e.target.value);
      if (!color) { showToast('颜色格式不正确'); return; }
      await store.setSetting('accent', color);
      applyAccent(color);
      await draw();
      showToast('已应用自定义颜色');
    };
    // 恢复默认色
    body.querySelector('#accent-reset').onclick = async () => {
      await store.setSetting('accent', '');
      applyAccent('');
      await draw();
      showToast('已恢复默认颜色');
    };
    body.querySelector('#set-mode').onchange = async (e) => {
      await store.setSetting('defaultMode', e.target.value);
      showToast('默认播放模式已保存');
    };
    body.querySelector('#set-history').onchange = async (e) => {
      await store.setSetting('recordHistory', e.target.checked);
      showToast(e.target.checked ? '已开启历史记录' : '已关闭历史记录，之后的播放不再记录');
    };
    body.querySelector('#set-clean').onclick = async () => {
      const ok = await confirmDialog({
        title: '清理未引用数据',
        text: '将清理指向已删除歌曲的收藏、歌单条目和历史记录。正常数据不会受影响。',
        okText: '开始清理',
      });
      if (!ok) return;
      const { removed } = await store.cleanOrphans();
      showToast(removed ? `已清理 ${removed} 条无效数据` : '没有发现无效数据');
      bus.emit('songs:changed');
      await draw();
    };
    body.querySelector('#set-export').onclick = async () => {
      const backup = await store.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      a.href = url;
      a.download = `悦听备份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast(`已导出备份（${backup.songs.length} 首歌的信息）`);
    };
    const fileInput = root.querySelector('#set-import-file');
    body.querySelector('#set-import').onclick = () => fileInput.click();
    fileInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        showToast('文件内容不是有效的 JSON');
        return;
      }
      const ok = await confirmDialog({
        title: '导入备份',
        text: `将用备份中的歌单、收藏、历史与设置覆盖当前数据（当前 ${(await store.getStats()).songCount} 首歌的音乐文件不受影响）。确定继续吗？`,
        danger: true, okText: '导入',
      });
      if (!ok) return;
      try {
        await store.importBackup(data);
        showToast('备份已导入');
        bus.emit('songs:changed');
        bus.emit('favorites:changed');
        bus.emit('playlists:changed');
        await draw();
      } catch (err) {
        showToast(err.message || '导入失败');
      }
    };
  }

  await draw();
}