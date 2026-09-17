// 底部动作弹层：actionSheet([{label, value, danger}]) -> Promise<value|null>
export function actionSheet(title, items) {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const t = document.createElement('div');
    t.className = 'sheet-title';
    t.textContent = title;
    sheet.appendChild(t);
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'sheet-item' + (it.danger ? ' danger' : '');
      b.textContent = it.label;
      b.addEventListener('click', () => { mask.remove(); resolve(it.value); });
      sheet.appendChild(b);
    });
    mask.appendChild(sheet);
    mask.addEventListener('click', (e) => { if (e.target === mask) { mask.remove(); resolve(null); } });
    document.getElementById('app').appendChild(mask);
  });
}
