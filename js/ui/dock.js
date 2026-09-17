// 悬浮层（dock）：位于迷你播放条与 Tab 栏之上，避免悬浮按钮遮挡底部导航。
// 页面把悬浮元素（导入按钮、多选条等）挂到这里，位置由 --bottom-bars 变量统一控制。

let host = null;

function el() {
  if (!host) host = document.getElementById('dock');
  return host;
}

/**
 * 计算底部固定条的总高度（迷你播放条 + Tab 栏），写入 --bottom-bars，
 * 供 dock 的定位使用；迷你条显示/隐藏或窗口尺寸变化时都需要重算。
 */
export function updateBottomBars() {
  const app = document.getElementById('app');
  if (!app) return 0;
  const mini = document.getElementById('miniplayer');
  const tabbar = document.getElementById('tabbar');
  const miniH = mini && getComputedStyle(mini).display !== 'none' ? mini.offsetHeight : 0;
  const tabH = tabbar ? tabbar.offsetHeight : 0;
  const total = miniH + tabH;
  app.style.setProperty('--bottom-bars', `${total}px`);
  return total;
}

/** 替换 dock 内容（传 HTML 字符串），返回容器供绑定事件 */
export function setDock(html) {
  const d = el();
  if (!d) return null;
  d.innerHTML = html;
  updateBottomBars();
  return d;
}

export function clearDock() {
  const d = el();
  if (d) d.innerHTML = '';
}

export function dockEl() {
  return el();
}