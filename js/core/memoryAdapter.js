// 内存适配器：与 IDBAdapter 同接口，用于 Node 单元测试与浏览器测试页
export class MemoryAdapter {
  constructor() {
    this.data = new Map();
  }

  async open() { return null; }

  _store(name) {
    if (!this.data.has(name)) this.data.set(name, new Map());
    return this.data.get(name);
  }

  static KEY_PATHS = {
    songs: 'id', playlists: 'id', playlist_songs: ['playlistId', 'songId'],
    favorites: 'songId', history: 'id', settings: 'key', player_state: 'id',
  };

  _keyPath(name) { return MemoryAdapter.KEY_PATHS[name]; }

  /** 复合主键统一拼接成字符串，保证 put/get/delete 使用同一种键 */
  _key(name, value) {
    const kp = this._keyPath(name);
    return Array.isArray(kp) ? kp.map((k) => value[k]).join('§') : value[kp];
  }

  _normKey(name, key) {
    const kp = this._keyPath(name);
    return Array.isArray(kp) && Array.isArray(key) ? key.join('§') : key;
  }

  async getAll(name) { return [...this._store(name).values()]; }
  async get(name, key) { return this._store(name).get(this._normKey(name, key)); }
  async count(name) { return this._store(name).size; }

  async put(name, value) {
    if (name === 'history' && value.id === undefined) {
      const meta = this._store('history:seq');
      const next = (meta.get('seq') || 0) + 1;
      meta.set('seq', next);
      value = { ...value, id: next };
    }
    this._store(name).set(this._key(name, value), structuredClone(value));
    return value;
  }

  async bulkPut(name, values) {
    for (const v of values) await this.put(name, v);
    return values.length;
  }

  async delete(name, key) { this._store(name).delete(this._normKey(name, key)); }

  async bulkDelete(name, keys) {
    keys.forEach((k) => this._store(name).delete(this._normKey(name, k)));
  }

  async clear(name) { this._store(name).clear(); }
}