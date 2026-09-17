// 应用内导航栈：为二级页面的「返回」按钮提供可靠的返回目标
const stack = [];

/** 每次路由渲染时记录；若目标在栈中已存在（浏览器前进/后退）则回退到该位置 */
export function recordNav(hash) {
  const i = stack.lastIndexOf(hash);
  if (i >= 0) stack.length = i + 1;
  else stack.push(hash);
}

export function navStack() {
  return [...stack];
}

/**
 * 返回上一页：栈里有上一页就用浏览器历史（保持与后退键一致），
 * 直接打开二级页面链接（没有上一页）时回退到兜底页面。
 */
export function goBack(fallback = '#/home') {
  if (stack.length > 1) {
    stack.pop();
    history.back();
  } else {
    location.hash = fallback;
  }
}

/** 绑定页面内所有 [data-back] 按钮 */
export function bindBack(root, fallback) {
  root.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => goBack(fallback));
  });
}

/** 二级页面统一标题栏（左上角带返回箭头） */
export function pageHeader(title, { back = true, rightHtml = '', sub = '' } = {}) {
  return `
    <div class="page-head">
      ${back ? '<button class="back-btn" data-back aria-label="返回上一页">‹</button>' : ''}
      <div class="page-head-main">
        <h1 class="page-title">${title}</h1>
        ${sub ? `<div class="page-head-sub">${sub}</div>` : ''}
      </div>
      ${rightHtml}
    </div>`;
}