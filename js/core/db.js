// IndexedDB 适配器：实现统一存储接口（getAll/get/put/bulkPut/delete/bulkDelete/clear/count）
export const DB_NAME = 'yueting';
export const DB_VERSION = 1;

export const SCHEMA = {
  songs: { keyPath: 'id' },
  playlists: { keyPath: 'id' },
  playlist_songs: { keyPath: ['playlistId', 'songId'] },
  favorites: { keyPath: 'songId' },
  history: { keyPath: 'id', autoIncrement: true },
  settings: { keyPath: 'key' },
  player_state: { keyPath: 'id' },
};

export class IDBAdapter {
  constructor(name = DB_NAME) {
    this.name = name;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, cfg] of Object.entries(SCHEMA)) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: cfg.keyPath, autoIncrement: !!cfg.autoIncrement });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    this.db.onversionchange = () => this.db.close();
    return this.db;
  }

  _tx(storeName, mode, fn) {
    // fn 里同步发起 IDB 请求并返回 _req Promise；tx 完成时该请求必然已成功/失败
    return this.open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const result = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) { return this._tx(storeName, 'readonly', (os) => this._req(os.getAll())); }
  async get(storeName, key) { return this._tx(storeName, 'readonly', (os) => this._req(os.get(key))); }
  async count(storeName) { return this._tx(storeName, 'readonly', (os) => this._req(os.count())); }
  async put(storeName, value) { return this._tx(storeName, 'readwrite', (os) => this._req(os.put(value))); }
  async delete(storeName, key) { return this._tx(storeName, 'readwrite', (os) => this._req(os.delete(key))); }
  async clear(storeName) { return this._tx(storeName, 'readwrite', (os) => this._req(os.clear())); }

  async bulkPut(storeName, values) {
    return this._tx(storeName, 'readwrite', (os) => {
      values.forEach((v) => os.put(v));
      return values.length;
    });
  }

  async bulkDelete(storeName, keys) {
    return this._tx(storeName, 'readwrite', (os) => {
      keys.forEach((k) => os.delete(k));
      return keys.length;
    });
  }
}
