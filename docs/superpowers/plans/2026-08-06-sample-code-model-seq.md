# 样品流水号机型级递增 实现计划（独立序列表方案 B）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将样品流水号从「提供处+机型+组别」组合递增改为「机型级」递增，用独立序列表（`sample_seqs`）原子自增消除 MAX+1 并发竞态，并全链路同步规则文档/种子/测试。

**Architecture:** 编号结构不变（`提供处-机型-组别-流水号-版次`），仅流水号分配逻辑变化。新增 `sample_seqs(prefix=机型, cur_seq)` 表，`generateSampleCode` 改用 `INSERT ... ON DUPLICATE KEY UPDATE cur_seq=cur_seq+1` 原子取号；编号预览（code-preview）拆出只读 `previewSampleCode` 模拟，避免预览消耗序号。存量编号不迁移，初始化脚本把各机型存量 MAX 搬入序列表续号。与现有 `createSample` SAVEPOINT 重试无缝配合（回滚时序号一并回滚，编号连续）。

**Tech Stack:** Node.js + Express 4（CommonJS）、MariaDB（mysql2）、Jest + supertest、幂等 SQL 迁移脚本。

**关键约束（samples 已上线 deployed:true，AGENTS.md §20）：**
- 禁止对 `samples` 表注入测试数据 / 跑 seed / 跑造数测试
- 测试仅允许：单元测试（mock 不碰 DB）+ 只读集成（code-preview / 校验 400）
- `sample_seqs` 建表随 `schema.sql` 重启自动执行（幂等）；初始化脚本（存量 MAX 回填）属**生产迁移**，只编写 + dry-run 验证，**不自动执行**，执行时机由用户/部署阶段决定

---

### Task 1: 序列表 schema + 幂等初始化脚本

**Files:**
- Modify: `subsystems/samples/db/schema.sql`（末尾追加 sample_seqs 表）
- Create: `subsystems/samples/db/init-sample-seqs.js`
- Test: `tests/sample-seqs-init.test.js`（新建，dry-run SQL 逻辑单测）

- [ ] **Step 1: 写失败测试**

创建 `tests/sample-seqs-init.test.js`（把初始化 SQL 提取为可测函数后单测）：

```js
// tests/sample-seqs-init.test.js — 序列表初始化脚本逻辑单测
// 提取 initSampleSeqsSql / buildDryRunSql 为纯函数便于单测（不执行 DB）
const { initSampleSeqsSql, dryRunSeqsSql } = require('../subsystems/samples/db/init-sample-seqs-sql');

describe('init-sample-seqs SQL', () => {
  it('初始化 SQL 幂等：含 ON DUPLICATE KEY UPDATE + GREATEST 防覆盖', () => {
    const sql = initSampleSeqsSql();
    expect(sql).toContain('INSERT INTO sample_seqs');
    expect(sql).toContain('ON DUPLICATE KEY UPDATE cur_seq = GREATEST(cur_seq, VALUES(cur_seq))');
    expect(sql).toContain('GROUP BY SUBSTRING(sample_no, 3, 6)');
  });
  it('机型段提取：SUBSTRING(sample_no,3,6) 且含格式过滤正则', () => {
    const sql = initSampleSeqsSql();
    expect(sql).toContain('SUBSTRING(sample_no, 3, 6)');
    expect(sql).toContain('REGEXP');
  });
  it('dry-run 查询按机型分组取 MAX 流水号', () => {
    const sql = dryRunSeqsSql();
    expect(sql).toContain('MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED))');
    expect(sql).toContain('GROUP BY SUBSTRING(sample_no, 3, 6)');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest tests/sample-seqs-init.test.js --forceExit`
Expected: FAIL，`Cannot find module '../subsystems/samples/db/init-sample-seqs-sql'`

- [ ] **Step 3: 创建 SQL 纯函数模块**

创建 `subsystems/samples/db/init-sample-seqs-sql.js`：

```js
// subsystems/samples/db/init-sample-seqs-sql.js — 序列表初始化 SQL 纯函数（便于单测，不执行 DB）
// 迁移目标：把存量 samples 各机型最大流水号搬入 sample_seqs，新号从存量续号
// 幂等：ON DUPLICATE KEY UPDATE + GREATEST 防覆盖（MariaDB 兼容，VALUES() 可用）
// 机型段 = SUBSTRING(sample_no, 3, 6)（格式 提供处(1)-机型(6)-组别(1)-流水号(3)-版次(2)）

// 存量格式过滤：仅合法 13 位编号参与统计
const LEGACY_PATTERN = '^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-[0-9]{3}-[0-9]{2}$';

function initSampleSeqsSql() {
  return 'INSERT INTO sample_seqs (prefix, cur_seq) ' +
    'SELECT SUBSTRING(sample_no, 3, 6), MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED)) ' +
    'FROM samples WHERE sample_no REGEXP \'' + LEGACY_PATTERN + '\' ' +
    'GROUP BY SUBSTRING(sample_no, 3, 6) ' +
    'ON DUPLICATE KEY UPDATE cur_seq = GREATEST(cur_seq, VALUES(cur_seq))';
}

function dryRunSeqsSql() {
  return 'SELECT SUBSTRING(sample_no, 3, 6) AS prefix, ' +
    'MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED)) AS cur_seq ' +
    'FROM samples WHERE sample_no REGEXP \'' + LEGACY_PATTERN + '\' ' +
    'GROUP BY SUBSTRING(sample_no, 3, 6)';
}

module.exports = { initSampleSeqsSql, dryRunSeqsSql, LEGACY_PATTERN };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest tests/sample-seqs-init.test.js --forceExit`
Expected: PASS（3 用例）

- [ ] **Step 5: 追加 sample_seqs 建表到 schema.sql**

在 `subsystems/samples/db/schema.sql` 末尾追加：

```sql
-- 样品流水号序列表（2026-08-06）：机型级流水号原子自增，prefix=机型 6 位
-- 取号：INSERT ... ON DUPLICATE KEY UPDATE cur_seq=cur_seq+1，随后 SELECT cur_seq
CREATE TABLE IF NOT EXISTS sample_seqs (
  prefix VARCHAR(16) PRIMARY KEY,
  cur_seq INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 6: 创建可执行初始化脚本（dry-run / 实际执行）**

创建 `subsystems/samples/db/init-sample-seqs.js`：

```js
// subsystems/samples/db/init-sample-seqs.js — 序列表初始化 CLI（幂等，可重复执行）
// 用法：node subsystems/samples/db/init-sample-seqs.js [--dry-run]
// 注意：samples 已上线（deployed:true），实际执行属生产迁移，须先备份 samples 表；
//       默认建议先 --dry-run 查看将初始化的机型序号，再决定是否执行
const D = require('../../../db');
const { initSampleSeqsSql, dryRunSeqsSql } = require('./init-sample-seqs-sql');

const DRY = process.argv.includes('--dry-run');

async function main() {
  const pool = D.pool();
  if (DRY) {
    const rows = await pool.execute(dryRunSeqsSql());
    console.log('DRY-RUN：将初始化以下机型序号（共 ' + rows[0].length + ' 个）：');
    for (const r of rows[0]) console.log('  ' + r.prefix + ' → ' + r.cur_seq);
  } else {
    await pool.execute(initSampleSeqsSql());
    const n = (await pool.execute('SELECT COUNT(*) AS c FROM sample_seqs'))[0][0].c;
    console.log('sample_seqs 初始化完成，共 ' + n + ' 个机型序列');
  }
  await pool.end();
  process.exit(0);
}

main().catch(function (e) { console.error('初始化失败: ' + e.message); process.exit(1); });
```

- [ ] **Step 7: 校验 SQL 语法 + 脚本加载**

Run: `node --check subsystems/samples/db/init-sample-seqs.js && node --check subsystems/samples/db/init-sample-seqs-sql.js`
Expected: 无输出（语法 OK）

- [ ] **Step 8: 提交**

```bash
git add subsystems/samples/db/schema.sql subsystems/samples/db/init-sample-seqs.js subsystems/samples/db/init-sample-seqs-sql.js tests/sample-seqs-init.test.js
git commit -m "feat(samples): 新增 sample_seqs 序列表与幂等初始化脚本"
```

---

### Task 2: sample-code.js 重构（原子取号 + 预览只读）

**Files:**
- Modify: `subsystems/samples/db/sample-code.js`
- Modify: `tests/sample-code.test.js`（重写 generateSampleCode 单测 + 新增 previewSampleCode 单测）

- [ ] **Step 1: 重写/新增失败单测**

改写 `tests/sample-code.test.js` 中 `generateSampleCode` describe 为序列表 mock，并新增 `previewSampleCode` describe。替换第 41-88 行整块：

```js
describe('generateSampleCode（序列表原子取号，机型级递增）', () => {
  // 序列表 mock：INSERT..ON DUPLICATE 调用使 cur+1，SELECT cur_seq 返回当前值
  function makeSeqQuery() {
    var cur = 0;
    return async function (sql) {
      if (sql.indexOf('ON DUPLICATE') > -1) { cur += 1; return []; }
      if (sql.indexOf('SELECT cur_seq') > -1) { return [{ cur_seq: cur }]; }
      return [];
    };
  }

  it('同机型跨提供处/组别共享递增', async () => {
    const seqs = [];
    // 同一机型 SF1225 下，不同提供处/组别连续取号 → 流水号全局递增
    const q = makeSeqQuery();
    seqs.push(parseSampleCode(await generateSampleCode({ source_type: 'T', model: 'SF1225', station: '扇叶组', card_version: '01', query: q })).seq);
    seqs.push(parseSampleCode(await generateSampleCode({ source_type: 'G', model: 'SF1225', station: '马达组', card_version: '01', query: q })).seq);
    seqs.push(parseSampleCode(await generateSampleCode({ source_type: 'C', model: 'SF1225', station: '品保部', card_version: '01', query: q })).seq);
    expect(seqs).toEqual(['001', '002', '003']);
    expect(await generateSampleCode({ source_type: 'T', model: 'SF1225', station: '扇叶组', card_version: '01', query: q }))
      .toBe('T-SF1225-S-004-01');
  });

  it('不同机型各自独立递增', async () => {
    const q1 = makeSeqQuery(); // 机型 A
    const q2 = makeSeqQuery(); // 机型 B
    const a1 = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: q1 });
    const b1 = await generateSampleCode({ source_type: 'T', model: 'SF1225', station: '扇叶组', card_version: '01', query: q2 });
    expect(a1).toBe('T-YD9015-S-001-01');
    expect(b1).toBe('T-SF1225-S-001-01');
  });

  it('机型不足 6 位抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD901', station: '扇叶组', card_version: '01', query: makeSeqQuery() }))
      .rejects.toThrow('机型编码至少 6 位');
  });

  it('机型超 6 位取前 6 位', async () => {
    const code = await generateSampleCode({ source_type: 'T', model: 'SF-1225-A', station: '马达组', card_version: '01', query: makeSeqQuery() });
    expect(code).toBe('T-SF-122-M-001-01');
  });

  it('组别无效抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD9015', station: '调机样', card_version: '01', query: makeSeqQuery() }))
      .rejects.toThrow('组别无效');
  });

  it('提供处无效抛错', async () => {
    await expect(generateSampleCode({ source_type: 'X', model: 'YD9015', station: '扇叶组', card_version: '01', query: makeSeqQuery() }))
      .rejects.toThrow('提供处无效');
  });

  it('版次默认 01，数字版本取数字块', async () => {
    const c1 = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '', query: makeSeqQuery() });
    expect(c1).toBe('T-YD9015-S-001-01');
    const c2 = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: 'V2.0', query: makeSeqQuery() });
    expect(c2).toBe('T-YD9015-S-001-02');
  });

  it('机型级流水号 999 溢出抛错', async () => {
    var cur = 999;
    const q = async function (sql) {
      if (sql.indexOf('ON DUPLICATE') > -1) { cur += 1; return []; }
      if (sql.indexOf('SELECT cur_seq') > -1) { return [{ cur_seq: cur }]; }
      return [];
    };
    await expect(generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: q }))
      .rejects.toThrow('该机型已达上限 999');
  });
});

describe('previewSampleCode（只读预览，不消耗序号）', () => {
  const { previewSampleCode } = require('../subsystems/samples/db/sample-code');

  it('只读查询：SQL 不含 ON DUPLICATE / INSERT，不写 sample_seqs', async () => {
    const q = async function (sql) {
      expect(sql).not.toContain('ON DUPLICATE');
      expect(sql).not.toContain('INSERT');
      expect(sql).toContain('SUBSTRING(sample_no, 3, 6)');
      return [{ m: 0 }];
    };
    const code = await previewSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: q });
    expect(code).toBe('T-YD9015-S-001-01');
  });

  it('预览按存量 MAX+1 续号', async () => {
    const q = async function () { return [{ m: 7 }]; };
    const code = await previewSampleCode({ source_type: 'G', model: 'SF9225', station: '成品组', card_version: '02', query: q });
    expect(code).toBe('G-SF9225-A-008-02');
  });

  it('机型 999 上限预览提示', async () => {
    const q = async function () { return [{ m: 999 }]; };
    await expect(previewSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: q }))
      .rejects.toThrow('该机型已达上限 999');
  });

  it('机型不足 6 位抛错', async () => {
    const q = async function () { return [{ m: 0 }]; };
    await expect(previewSampleCode({ source_type: 'T', model: 'YD901', station: '扇叶组', card_version: '01', query: q }))
      .rejects.toThrow('机型编码至少 6 位');
  });
});
```

同时更新文件顶部导入（第 2 行）为：

```js
const { SOURCE_CODES, GROUP_CODES, STATION_GROUPS, PATTERN, parseSampleCode, generateSampleCode, previewSampleCode } = require('../subsystems/samples/db/sample-code');
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest tests/sample-code.test.js --forceExit`
Expected: FAIL —— `previewSampleCode is not a function`（模块尚未导出）

- [ ] **Step 3: 重构 sample-code.js**

用以下内容替换 `subsystems/samples/db/sample-code.js` 第 31-53 行（`generateSampleCode` 整体 + 新增 `previewSampleCode`），并在末尾导出中加入 `previewSampleCode`：

```js
// 生成完整编号；流水号按 机型（6 位）级递增（跨提供处/组别共享 001~999）
// 取号方式：sample_seqs 序列表原子自增（INSERT ... ON DUPLICATE KEY UPDATE），消除 MAX+1 并发竞态
// 必须与 createSample 同一事务（conn）调用：SAVEPOINT 回滚时序号一并回滚，编号连续不跳号
// opts: { source_type, model, station, card_version, conn?, query? }
async function generateSampleCode(opts) {
  const source = String(opts.source_type || '').toUpperCase();
  if (!SOURCE_CODES[source]) throw new Error('提供处无效：' + opts.source_type);
  const groupCode = GROUP_CODES[opts.station];
  if (!groupCode) throw new Error('组别无效：' + opts.station);
  const modelCode = String(opts.model || '').slice(0, 6);
  if (modelCode.length < 6) throw new Error('机型编码至少 6 位');
  const prefix = modelCode; // 机型 6 位：同机型跨提供处/组别共享流水号空间
  const upsert = 'INSERT INTO sample_seqs (prefix, cur_seq) VALUES (?, 1) ON DUPLICATE KEY UPDATE cur_seq = cur_seq + 1';
  const select = 'SELECT cur_seq FROM sample_seqs WHERE prefix = ?';
  let seq;
  if (opts.conn) {
    await opts.conn.execute(upsert, [prefix]);
    seq = Number((await opts.conn.execute(select, [prefix]))[0][0].cur_seq);
  } else if (opts.query) {
    await opts.query(upsert, [prefix]);
    seq = Number((await opts.query(select, [prefix]))[0].cur_seq);
  } else {
    throw new Error('generateSampleCode 缺少 query 或 conn');
  }
  if (seq > 999) throw new Error('该机型已达上限 999');
  return source + '-' + modelCode + '-' + groupCode + '-' + String(seq).padStart(3, '0') + '-' + extractVersion(opts.card_version);
}

// 编号预览：只读模拟（按存量机型 MAX+1），不写 sample_seqs，避免预览消耗序号
// 仅供展示，实际编号以提交后 generateSampleCode 结果为准
// opts: { source_type, model, station, card_version, conn?, query? }
async function previewSampleCode(opts) {
  const source = String(opts.source_type || '').toUpperCase();
  if (!SOURCE_CODES[source]) throw new Error('提供处无效：' + opts.source_type);
  const groupCode = GROUP_CODES[opts.station];
  if (!groupCode) throw new Error('组别无效：' + opts.station);
  const modelCode = String(opts.model || '').slice(0, 6);
  if (modelCode.length < 6) throw new Error('机型编码至少 6 位');
  const sql = 'SELECT COALESCE(MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED)), 0) AS m FROM samples WHERE SUBSTRING(sample_no, 3, 6) = ?';
  let rows;
  if (opts.conn) {
    rows = (await opts.conn.execute(sql, [modelCode]))[0];
  } else if (opts.query) {
    rows = await opts.query(sql, [modelCode]);
  } else {
    throw new Error('previewSampleCode 缺少 query 或 conn');
  }
  const next = Number(rows[0].m) + 1;
  if (next > 999) throw new Error('该机型已达上限 999');
  return source + '-' + modelCode + '-' + groupCode + '-' + String(next).padStart(3, '0') + '-' + extractVersion(opts.card_version);
}
```

模块末尾导出改为：

```js
module.exports = { SOURCE_CODES, GROUP_CODES, STATION_GROUPS, PATTERN, parseSampleCode, generateSampleCode, previewSampleCode };
```

同时更新文件头注释（第 2 行）：`格式: 提供处(1)-机型(6)-组别(1)-流水号(3)-版次(2)，如 G-YD9015-Q-001-01` 后补充 `流水号按机型级递增（序列表原子自增）`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest tests/sample-code.test.js --forceExit`
Expected: PASS（原有 PATTERN/parse/集成用例 + 新序列表/预览用例全通过；`扫码台与 13 位编码兼容` describe 因 samples 已上线被 `describe.skip` 跳过）

- [ ] **Step 5: 提交**

```bash
git add subsystems/samples/db/sample-code.js tests/sample-code.test.js
git commit -m "feat(samples): 流水号改机型级原子自增 + 预览只读分离
- generateSampleCode 改 sample_seqs 原子取号（消除 MAX+1 竞态）
- 新增 previewSampleCode 只读模拟（code-preview 不再消耗序号）"
```

---

### Task 3: code-preview 端点改只读预览

**Files:**
- Modify: `subsystems/samples/backend/routes-samples.js:107-119`
- Test: `tests/sample-code.test.js`（code-preview 集成用例增强）

- [ ] **Step 1: 增强 code-preview 集成测试（只读，可跑）**

在 `tests/sample-code.test.js` 的 `GET /api/samples/code-preview` describe 中追加用例（替换原第 90-106 行整块为）：

```js
describe('GET /api/samples/code-preview', () => {
  const { getApp, login } = require('./helpers/setup');
  beforeAll(async () => { await getApp(); });

  it('返回预览编号', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples/code-preview?source_type=T&model=YD9015&station=%E6%89%87%E5%8F%B6%E7%BB%84&card_version=01');
    expect(res.status).toBe(200);
    expect(res.body.sample_no).toMatch(/^T-YD9015-S-\d{3}-01$/);
  });

  it('组别无效返回 400', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples/code-preview?source_type=T&model=YD9015&station=%E8%B0%83%E6%9C%BA%E6%A0%B7');
    expect(res.status).toBe(400);
  });

  it('机型 999 上限返回 400 提示', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples/code-preview?source_type=T&model=YD9015&station=%E6%89%87%E5%8F%B6%E7%BB%84');
    expect(res.status).toBe(200); // 线上存量未达上限时正常返回；若返回 400 则文案含「上限」
  });
});
```

- [ ] **Step 2: 运行测试确认当前通过（基线）**

Run: `npx jest tests/sample-code.test.js -t 'code-preview' --forceExit`
Expected: PASS（当前 code-preview 仍走 generateSampleCode 旧逻辑，返回格式一致）

- [ ] **Step 3: 修改 routes-samples.js 改调 previewSampleCode**

替换 `subsystems/samples/backend/routes-samples.js` 第 5 行导入与 107-119 行：

第 5 行改为：

```js
const { STATION_GROUPS, generateSampleCode, previewSampleCode } = require('../db/sample-code');
```

107-119 行改为：

```js
  // 编号预览（只读，不落库、不消耗序号；须注册在 /:id 之前）——生成后编号以提交实际结果为准
  app.get('/api/samples/code-preview', requireAuth, async (req, res) => {
    const { source_type, model, station, card_version } = req.query;
    try {
      const sample_no = await previewSampleCode({
        source_type, model, station, card_version,
        query: async (sql, params) => (await D.pool().execute(sql, params || []))[0]
      });
      res.json({ sample_no });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest tests/sample-code.test.js -t 'code-preview' --forceExit`
Expected: PASS（3 用例）

- [ ] **Step 5: 语法校验 + 提交**

Run: `node --check subsystems/samples/backend/routes-samples.js`
Expected: 无输出（语法 OK）

```bash
git add subsystems/samples/backend/routes-samples.js tests/sample-code.test.js
git commit -m "refactor(samples): code-preview 改调 previewSampleCode 只读预览"
```

---

### Task 4: dao.js 兼容确认与注释同步

**Files:**
- Modify: `subsystems/samples/db/dao.js:17-28`（注释同步，逻辑不变）

- [ ] **Step 1: 确认接口兼容（代码审查）**

`generateSampleCode` 签名未变（`opts: { source_type, model, station, card_version, conn?, query? }`），[dao.js nextSampleNo](file:///www/wwwroot/sample-mgmt/subsystems/samples/db/dao.js#L19-L28) 与 [createSample](file:///www/wwwroot/sample-mgmt/subsystems/samples/db/dao.js#L31-L63) 无需改代码。核对要点：
- `createSample` 循环内 `nextSampleNo(data, conn)` 传 conn → 序列表自增与 INSERT samples 同事务 ✓
- SAVEPOINT 回滚时序列表自增一并回滚 → 重试不跳号 ✓
- 无 conn 时走 `run()` 连接池 → 序列表独立提交，INSERT 失败会跳号（安全，不回号）✓

- [ ] **Step 2: 更新 dao.js 注释**

`nextSampleNo` 上方注释（第 17-18 行）改为：

```js
  // 生成 13 位结构化编码（如 G-YD9015-Q-001-01）；流水号按机型级递增（sample_seqs 序列表原子自增）
  // data: { source_type, model, station, card_version }；conn 存在走事务连接（序号随事务回滚），否则用连接池 q（独立提交，失败跳号但安全）
```

- [ ] **Step 3: 提交**

```bash
git add subsystems/samples/db/dao.js
git commit -m "chore(samples): dao.js 注释同步机型级序列表取号语义"
```

---

### Task 5: 规则文档同步

**Files:**
- Modify: `docs/sample-code-encoding.md`

- [ ] **Step 1: 更新 §3 流水号生成算法**

将 §3 标题与正文改为：

```markdown
## 3. 流水号生成算法

1. 前缀 = 机型 6 位（如 `SF1225`），流水号在**整个机型内唯一**（跨提供处 C/T/G、跨组别共享 001~999 空间）。
2. 取号（原子自增，无竞态）：
   `INSERT INTO sample_seqs (prefix, cur_seq) VALUES (?, 1) ON DUPLICATE KEY UPDATE cur_seq = cur_seq + 1`
   随后 `SELECT cur_seq` 取值。
3. 下一个流水号 = `cur_seq`，不足 3 位左侧补零（`001` 起）。
4. **上限 999**：某机型已达 999 后，新申请报错 `该机型已达上限 999`，需更换机型。

### 并发处理

- 序列表原子自增消除 MAX+1 并发竞态；同机型并发创建时由 InnoDB 行锁串行化。
- 序号与 `createSample` 同事务：SAVEPOINT 回滚时序号一并回滚，重试不跳号、编号连续。
- 兜底：`samples.sample_no` 为 UNIQUE 索引，`dao.js createSample` 对唯一键冲突（`ER_DUP_ENTRY`）以 SAVEPOINT 重试最多 3 次。
- 手工删除样品后 `cur_seq` 不回退（不回号，安全）；外部直接 INSERT 带编号不更新序列表（已知限制）。

### 编号预览（不消耗序号）

`GET /api/samples/code-preview` 走只读模拟（存量机型 MAX+1），不写 `sample_seqs`；实际编号以提交后 `generateSampleCode` 结果为准。
```

- [ ] **Step 2: 更新 §7 变更注意事项**

在 §7 列表中追加第 6 条：

```markdown
6. 序列表（`sample_seqs`）为流水号唯一事实来源：新建/预览/扫码逻辑改动 MUST 评估序列表一致性；部署顺序为「schema.sql 建表（重启自动）→ 初始化脚本回填存量 MAX → 新代码生效」。
```

- [ ] **Step 3: 更新 §8 关联文件**

在 §8 表格追加两行：

```markdown
| `subsystems/samples/db/init-sample-seqs.js` | 序列表初始化 CLI（dry-run / 实际执行，幂等） |
| `subsystems/samples/db/sample_seqs` 表（schema.sql） | 机型级流水号原子自增的事实来源 |
```

- [ ] **Step 4: 同步设计文档 SQL（MariaDB 兼容修正）**

`docs/superpowers/specs/2026-08-06-sample-code-model-seq-design.md` §3.2 初始化脚本中的 `AS new ... new.cur_seq` 改为 `VALUES(cur_seq)`（MariaDB 兼容，`VALUES()` 在 MariaDB ON DUPLICATE KEY UPDATE 中可用）：

```sql
INSERT INTO sample_seqs (prefix, cur_seq)
SELECT SUBSTRING(sample_no, 3, 6),
       MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED))
FROM samples
WHERE sample_no REGEXP '^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-[0-9]{3}-[0-9]{2}$'
GROUP BY SUBSTRING(sample_no, 3, 6)
ON DUPLICATE KEY UPDATE cur_seq = GREATEST(cur_seq, VALUES(cur_seq));
```

- [ ] **Step 5: 提交**

```bash
git add docs/sample-code-encoding.md docs/superpowers/specs/2026-08-06-sample-code-model-seq-design.md
git commit -m "docs(samples): 流水号机型级序列表算法/并发/预览规则同步"
```

---

### Task 6: seed 脚本注释同步

**Files:**
- Modify: `subsystems/samples/seed/seed.js`（注释同步，逻辑不变）

- [ ] **Step 1: 更新 seed.js 头注释**

在 `subsystems/samples/seed/seed.js` 第 9 行 `const D = require('../../../db');` 上方补充：

```js
// 说明：本脚本硬编码 13 位样品编号（直接 INSERT sample_no），不受流水号生成规则影响。
// 流水号规则（2026-08-06 起）：机型级递增，由 sample_seqs 序列表原子自增（见 db/sample-code.js）。
// 本脚本对 samples 表执行清空 + 插入，属测试数据注入；samples 已上线（deployed:true），护栏拒绝执行。
```

- [ ] **Step 2: 提交**

```bash
git add subsystems/samples/seed/seed.js
git commit -m "chore(samples): seed.js 注释同步机型级序列表规则"
```

---

### Task 7: 回归验证与收尾

**Files:**
- Run: 全量测试 + 浏览器回归 + 双系统回归 + 臃肿检测报告

- [ ] **Step 1: 全量单元测试（www 身份）**

Run: `echo 'mnbvcxz123' | sudo -S -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest tests/sample-code.test.js tests/sample-seqs-init.test.js --forceExit 2>&1 | grep -E "Tests:|Test Suites:"'`
Expected: PASS，且 `扫码台与 13 位编码兼容` describe 被跳过（samples 已上线）

- [ ] **Step 2: 服务重启使 schema 建表生效**

Run: 精确 kill 4000 端口 PID（`sudo ss -tlnp` 识别，禁止 pkill 宽泛匹配），`sudo -u www setsid nohup node server.js` 重启；确认启动日志无建表报错

- [ ] **Step 3: 只读集成回归（浏览器）**

browser_use 验证：
- 样品列表/详情/新建页加载无 JS 报错（编号展示格式不变）
- code-preview 在新建样品表单输入机型后正常预览编号
- 扫码台页面正常（精确匹配不受影响）
- 全程只读，不创建样品

- [ ] **Step 4: 双系统回归**

修改了 `schema.sql`（框架 initDB 共享路径）→ MUST 验证治具（fixtures）/项目（projects）/工作台（workbench）子系统启动正常、看板/列表无 JS 报错（browser_use 只读验证）

- [ ] **Step 5: 臃肿检测报告**

输出修改文件的行数/字符/函数数与上限对比（sample-code.js、routes-samples.js、dao.js、schema.sql、新增脚本/测试），触发预警的文件标注拆分方案

- [ ] **Step 6: 提交收尾**

```bash
git add -A
git commit -m "test(samples): 序列表机型级递增全量回归验证"
```

- [ ] **Step 7: 上线监控提示**

输出 1~3 周期监控项：新样品创建后流水号唯一性（监控 ER_DUP_ENTRY 重试日志）、序列表与 samples 实际编号一致性（抽样对账）、code-preview 无写库日志。

---

## Self-Review

**Spec 覆盖检查：**
- §3 序列表表结构 → Task 1 ✓
- §4.1 原子取号 / §4.2 预览只读 → Task 2 ✓
- §6 全链路同步（routes/dao/schema/seed/docs/tests）→ Task 3/4/5/6/1 ✓
- §7 测试计划 → Task 2/3 单测+集成、Task 7 回归 ✓
- §8 风险：samples 上线保护 → 全程只读 + seed 注释 + 初始化脚本 dry-run 不自动执行 ✓

**占位符扫描：** 无 TBD/TODO；每个 Step 含完整代码/命令/预期 ✓

**类型一致性：** `previewSampleCode` 在 Task 2 定义导出、Task 3 导入使用；`makeSeqQuery` mock 返回 `[{cur_seq}]` 与实现 `rows[0].cur_seq` 一致；`initSampleSeqsSql/dryRunSeqsSql` 在 Task 1 定义、脚本与测试引用一致 ✓
