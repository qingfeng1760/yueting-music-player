// 构建 dist：把运行所需的静态文件复制到 dist/（Tauri 打包时只嵌入这个目录）
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const files = ['css', 'js', 'vendor'];
for (const f of files) {
  cpSync(join(root, f), join(dist, f), { recursive: true });
  console.log(`  复制：${f}/`);
}

// index.html：注入启动诊断（仅打包版有）——加载/脚本错误会显示在窗口标题上，
// 用于打包后快速定位“白屏”问题；浏览器版不受影响。
const html = readFileSync(join(root, 'index.html'), 'utf8');
const probe = `<script>
window.__diag = [];
window.addEventListener('error', function (e) {
  var m = '⚠ ' + (e.message || '脚本错误') + (e.filename ? ' @' + e.filename.split('/').pop() : '');
  document.title = m.slice(0, 80); window.__diag.push(m);
});
window.addEventListener('unhandledrejection', function (e) {
  var r = e.reason && e.reason.message ? e.reason.message : String(e.reason);
  document.title = '⚠ Promise: ' + String(r).slice(0, 70); window.__diag.push('⚠ ' + r);
});
</script>`;
writeFileSync(join(dist, 'index.html'), html.replace('</head>', probe + '\n</head>'));
console.log('  index.html（已注入启动诊断）');
console.log('构建完成：dist/');
