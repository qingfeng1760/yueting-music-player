// M4 播放队列测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Queue, mulberry32, MODES } from '../js/core/queue.js';

const IDS = ['a', 'b', 'c', 'd', 'e'];

test('顺序模式：到队尾返回 null（停止）', () => {
  const q = new Queue(IDS, 0, 'order');
  assert.equal(q.nextIndex(), 1);
  assert.equal(q.nextIndex(), 2);
  assert.equal(q.nextIndex(), 3);
  assert.equal(q.nextIndex(), 4);
  assert.equal(q.nextIndex(), null);
});

test('循环模式：到队尾回到第一首', () => {
  const q = new Queue(IDS, 4, 'loop');
  assert.equal(q.nextIndex(), 0);
  assert.equal(q.prevIndex(), 4);
});

test('prevIndex 顺序模式在第一首时停在第一首', () => {
  const q = new Queue(IDS, 0, 'order');
  assert.equal(q.prevIndex(), 0);
});

test('随机模式：一轮内不重复，覆盖全部歌曲', () => {
  const q = new Queue(IDS, 0, 'shuffle');
  q.shuffleSeed = 'fixed-seed-1';
  const seen = [q.index];
  for (let i = 0; i < IDS.length - 1; i++) {
    const n = q.nextIndex();
    assert.ok(!seen.includes(n), `重复出现索引 ${n}`);
    seen.push(n);
  }
  assert.equal(seen.length, IDS.length);
});

test('随机模式：同 seed 序列确定，不同 seed 序列不同', () => {
  const r1 = mulberry32('s1'), r2 = mulberry32('s1'), r3 = mulberry32('s2');
  const a = [r1(), r1(), r1()];
  const b = [r2(), r2(), r2()];
  const c = [r3(), r3(), r3()];
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('insertNext：下一首播放插到当前位置后面', () => {
  const q = new Queue(IDS, 1, 'order');
  q.insertNext('x');
  assert.deepEqual(q.ids, ['a', 'b', 'x', 'c', 'd', 'e']);
  assert.equal(q.nextIndex(), 2);
  assert.equal(q.ids[2], 'x');
});

test('serialize / deserialize 往返一致，越界索引被夹紧', () => {
  const q = new Queue(IDS, 2, 'shuffle');
  const back = Queue.deserialize(q.serialize());
  assert.deepEqual(back.ids, IDS);
  assert.equal(back.index, 2);
  assert.equal(back.mode, 'shuffle');
  const bad = Queue.deserialize({ ids: IDS, index: 99, mode: 'loop' });
  assert.equal(bad.index, IDS.length - 1);
  const empty = Queue.deserialize(null);
  assert.equal(empty.ids.length, 0);
});

test('非法模式回退为 order；MODES 常量齐全', () => {
  const q = new Queue(IDS, 0, 'weird');
  assert.equal(q.mode, 'order');
  assert.deepEqual(MODES, ['order', 'loop', 'shuffle']);
});
