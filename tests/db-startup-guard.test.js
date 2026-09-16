// 启动期加固护栏（2026-09-16，见 docs/RELEASE-v2.0.9.md）
// 覆盖：db.js 初始化单飞（消除同进程两套并发 DDL）、DDL 命名锁串行化、瞬时错误判定与退避重试。
// 背景：db.js 模块加载期的 ready = init() 与 server.js 的 await D.init() 各跑一遍初始化，
// 同进程两套并发 DDL 在 ALTER TABLE 上互锁（ER_LOCK_DEADLOCK），进程未 listen 即退出。
const { getApp } = require('./helpers/setup');

describe('启动期加固（单飞 init + DDL 锁 + 退避重试）', () => {
  test('init() 为单飞：并发/重复调用返回同一 promise（不再建第二个池、不再重跑一遍迁移）', async () => {
    await getApp();
    const D = require('../db');
    const p1 = D.init();
    const p2 = D.init();
    expect(p1).toBe(p2);
    await expect(p1).resolves.toBe(true);
  });

  test('isRetryableDdlError 仅对瞬时锁冲突判定为可重试', () => {
    const { isRetryableDdlError } = require('../db/migrations');
    expect(isRetryableDdlError({ code: 'ER_LOCK_DEADLOCK' })).toBe(true);
    expect(isRetryableDdlError({ code: 'ER_LOCK_WAIT_TIMEOUT' })).toBe(true);
    expect(isRetryableDdlError({ code: 'ER_DUP_FIELDNAME' })).toBe(false);
    expect(isRetryableDdlError({ code: 'ER_BAD_FIELD_ERROR' })).toBe(false);
    expect(isRetryableDdlError(null)).toBe(false);
    expect(isRetryableDdlError(new Error('无 code'))).toBe(false);
  });

  test('withDdlLock 串行化并发 DDL：后一段在首段释放锁之后才进入', async () => {
    await getApp();
    const D = require('../db');
    const { withDdlLock } = require('../db/migrations');
    const pool = D.pool();
    const seq = [];
    const block = (tag, ms) => withDdlLock(pool, async () => {
      seq.push(tag + ':in');
      await new Promise((r) => setTimeout(r, ms));
      seq.push(tag + ':out');
    });
    const first = block('A', 300);
    await new Promise((r) => setTimeout(r, 80)); // 确保 A 已取得锁
    const second = block('B', 10);
    await Promise.all([first, second]);
    expect(seq).toEqual(['A:in', 'A:out', 'B:in', 'B:out']);
  });

  test('runDdlWithRetry：瞬时错误重试后成功，确定性错误立即抛出且不重试', async () => {
    const { runDdlWithRetry } = require('../db/migrations');
    let tries = 0;
    const ok = await runDdlWithRetry(async () => {
      tries++;
      if (tries < 2) { const e = new Error('Deadlock found when trying to get lock'); e.code = 'ER_LOCK_DEADLOCK'; throw e; }
      return 'done';
    }, 3);
    expect(ok).toBe('done');
    expect(tries).toBe(2);

    let fatalTries = 0;
    await expect(runDdlWithRetry(async () => {
      fatalTries++;
      const e = new Error('Duplicate column name');
      e.code = 'ER_DUP_FIELDNAME';
      throw e;
    }, 3)).rejects.toThrow('Duplicate column name');
    expect(fatalTries).toBe(1);
  });
});
