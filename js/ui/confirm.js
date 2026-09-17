// 确认对话框：返回 Promise<boolean>
export function confirmDialog({ title = '确认操作', text = '', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'dialog-mask';
    mask.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true">
        <h3></h3><p></p>
        <div class="dialog-actions">
          <button class="btn" data-act="cancel"></button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok"></button>
        </div>
      </div>`;
    mask.querySelector('h3').textContent = title;
    mask.querySelector('p').textContent = text;
    mask.querySelector('[data-act=cancel]').textContent = cancelText;
    mask.querySelector('[data-act=ok]').textContent = okText;
    const close = (val) => { mask.remove(); resolve(val); };
    mask.addEventListener('click', (e) => {
      if (e.target === mask) close(false);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'ok') close(true);
      if (act === 'cancel') close(false);
    });
    document.getElementById('app').appendChild(mask);
  });
}
