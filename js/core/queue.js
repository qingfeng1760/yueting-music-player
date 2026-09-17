// 播放队列纯逻辑：与 DOM/audio 无关，可独立测试
export const MODES = ['order', 'loop', 'shuffle']; // 顺序 / 列表循环 / 随机

/**
 * 确定性随机序列：mulberry32（同一 seed 产出同一序列）
 */
export function mulberry32(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Queue {
  /** @param {string[]} ids 歌曲id列表 @param {number} index 当前索引 @param {string} mode 播放模式 */
  constructor(ids = [], index = 0, mode = 'order') {
    this.ids = [...ids];
    this.index = index;
    this.mode = MODES.includes(mode) ? mode : 'order';
    this.shuffleSeed = `${Date.now()}-${Math.random()}`; // 每次换随机模式/开播重新洗牌
    this._shuffleOrder = null;
  }

  get currentId() {
    return this.ids[this.index] ?? null;
  }

  /** 随机模式下的播放顺序（不含当前已播的立即重复） */
  _buildShuffleOrder() {
    const rng = mulberry32(this.shuffleSeed);
    const order = this.ids.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // 把当前位置挪到队首，切随机时先播当前歌
    const pos = order.indexOf(this.index);
    if (pos > 0) { order.splice(pos, 1); order.unshift(this.index); }
    this._shuffleOrder = order;
    this._shufflePos = 0;
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    if (mode === 'shuffle' && this.mode !== 'shuffle') {
      this.shuffleSeed = `${Date.now()}-${Math.random()}`;
      this._shuffleOrder = null;
    }
    this.mode = mode;
  }

  /** 返回下一首索引；顺序模式到队尾返回 null */
  nextIndex() {
    if (!this.ids.length) return null;
    if (this.mode === 'shuffle') {
      if (!this._shuffleOrder) this._buildShuffleOrder();
      if (this._shufflePos + 1 < this._shuffleOrder.length) return this._shuffleOrder[++this._shufflePos];
      // 一轮播完：重新洗牌再播
      this._buildShuffleOrder();
      return this._shuffleOrder[0];
    }
    const n = this.index + 1;
    if (n < this.ids.length) { this.index = n; return n; }
    if (this.mode === 'loop') { this.index = 0; return 0; }
    return null; // order：播完停止
  }

  prevIndex() {
    if (!this.ids.length) return null;
    if (this.mode === 'shuffle') {
      if (!this._shuffleOrder) this._buildShuffleOrder();
      if (this._shufflePos > 0) return this._shuffleOrder[--this._shufflePos];
      return this._shuffleOrder[0];
    }
    const p = this.index - 1;
    this.index = p >= 0 ? p : (this.mode === 'loop' ? this.ids.length - 1 : 0);
    return this.index;
  }

  /** 插入为下一首 */
  insertNext(id) {
    this.ids.splice(this.index + 1, 0, id);
    if (this._shuffleOrder) {
      this._shuffleOrder.splice(this._shufflePos + 1, 0, this.index + 1);
    }
  }

  serialize() {
    return { ids: [...this.ids], index: this.index, mode: this.mode };
  }

  static deserialize(data) {
    if (!data || !Array.isArray(data.ids)) return new Queue();
    const q = new Queue(data.ids, Math.min(data.index ?? 0, Math.max(data.ids.length - 1, 0)), data.mode);
    return q;
  }
}
