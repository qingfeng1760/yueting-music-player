// 极简事件总线：页面/播放器/存储之间解耦通信
const listeners = new Map();

export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => bus.off(event, fn);
  },
  off(event, fn) {
    listeners.get(event)?.delete(fn);
  },
  emit(event, data) {
    listeners.get(event)?.forEach((fn) => {
      try { fn(data); } catch (e) { console.error(`[bus] ${event} 处理出错`, e); }
    });
  },
};
