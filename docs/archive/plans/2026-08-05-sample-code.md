# 样品 13 位结构化编码实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有新建样品编号从 `SM-XXXXXX` 改为 13 位结构化编码（如 `G-YD9015-Q-001-01`），并同步适配新建表单（提供处/机型/组别）、种子数据与测试。

**Architecture:** 新增独立编码模块 `subsystems/samples/db/sample-code.js`（纯函数 + 查询注入，可单测）；`dao.js` 的 `nextSampleNo` 改为调用该模块；`routes-samples.js` 增加 POST 必填校验与只读 `code-preview` 接口；前端新建表单改为 提供处/机型/组别 三必填 + 编号实时预览；seed 与测试数据机械适配为 6 位机型码 + 有效组别 + 补齐 source_type。

**Tech Stack:** Node.js + Express 4.x（CommonJS）、MariaDB（mysql2）、原生 HTML/JS 单页、Jest 单测。

**关联设计文档:** `docs/superpowers/specs/2026-08-05-limit-sample-code-design.md`（已确认并提交 `0a0fb3b`）

---

## 执行前提（MUST 先读，本环境特殊约束）

1. **文件属主 www**：`/www/wwwroot/sample-mgmt` 下文件归 `www` 所有，普通用户直接 Edit/Write 会 EACCES。统一走协议：
   ```bash
   # 1) 用 Write 工具写 /tmp 下的临时副本
   # 2) 覆盖目标文件（askpass 密码：mnbvcxz123，必要时先重建 askpass）
   echo 'mnbvcxz123' > /tmp/askpass.sh && chmod 700 /tmp/askpass.sh
   SUDO_ASKPASS=/tmp/askpass.sh sudo -A cp /tmp/<file> /www/wwwroot/sample-mgmt/<目标路径>
   sudo chown www:www /www/wwwroot/sample-mgmt/<目标路径>
   ```
   新增文件同样：写 /tmp → sudo cp → chown www:www。
2. **测试**：必须用 www 用户执行（sudo 会清空 NODE_PATH，所有临时脚本放项目根目录）：
   ```bash
   cd /www/wwwroot/sample-mgmt && sudo -A -u www npx jest tests/<file> --runInBand
   ```
   全量：`sudo -A -u www npx jest --runInBand`（当前基线 116/116 PASS）。
3. **git commit**（仓库 .git 归 www）：
   ```bash
   sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add <files>
   sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "<type>(<scope>): <subject>"
   ```
4. **服务**：端口 4000 为本项目。**禁止** `pkill -f 'node server.js'` 等宽泛操作（3500 端口是别的项目）。重启用 `sudo ss -tlnp` 精确识别 4000 PID。
5. **bundle**：修改 `subsystems/samples/frontend/js/` 下任何 JS 后 MUST 重建（Task 7）。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `subsystems/samples/db/sample-code.js` | 新增 | 编码规则常量 + 解析 + 生成（纯函数 + query 注入） |
| `subsystems/samples/db/dao.js` | 修改 | `nextSampleNo` 改调 `generateSampleCode`；`createSample` 传新字段 |
| `subsystems/samples/backend/routes-samples.js` | 修改 | POST 必填校验 + 新增 `GET /api/samples/code-preview` |
| `subsystems/samples/frontend/js/constants.js` | 修改 | `STATIONS` 4 项 → 6 项组别 |
| `subsystems/samples/frontend/js/views/new.js` | 修改 | 表单重构（提供处/机型/组别）+ 编号实时预览 |
| `subsystems/samples/seed/seed.js` | 修改 | 15 条数据适配（6 位机型码/有效组别/source_type） |
| `seed-samples.js` | 修改 | 同上（与 seed.js 内容一致） |
| `tests/sample-code.test.js` | 新增 | 编码模块纯函数单测 + code-preview 接口测试 |
| `tests/samples.test.js` | 修改 | seedSample/seedSampleWithLimit 及直接 POST 用例补必填字段 |
| `subsystems/samples/frontend/index.html` | 修改（Task 7） | bundle 版本号 |

**明确不改**：`subsystems/samples/frontend/js/views/detail.js`（无站别编辑控件，仅只读展示站别中文，数据库值直显，无需改）；`routes-scan.js`（RECREATE 走 `createSample` 内部统一生成）；`routes/misc.js`（SOURCE_TYPES 不变）；`list-render.js` / `card-page.js` / `card-html.js`（站别中文直显不变）。

> 注：设计文档第 4 节表格中「detail.js 站别编辑下拉同步 6 组别」为描述误差——已核实 detail.js 无站别编辑控件（[detail.js](file:///www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/views/detail.js#L59-L68) 仅 `_cardInfo` 只读展示 `s.station`），本计划不修改 detail.js。

---

### Task 1: 编码模块 sample-code.js（纯函数）+ 单测

**Files:**
- Create: `subsystems/samples/db/sample-code.js`
- Test: `tests/sample-code.test.js`（Task 1 先建纯函数测试部分）

- [ ] **Step 1: 写失败测试**（tests/sample-code.test.js，先写纯函数用例，接口用例 Task 3 补）

将下列内容写入 `/tmp/sample-code.test.js`，再按执行前提第 1 条复制到 `/www/wwwroot/sample-mgmt/tests/sample-code.test.js`：

```js
// tests/sample-code.test.js — 样品 13 位编码模块单测
const { SOURCE_CODES, GROUP_CODES, STATION_GROUPS, PATTERN, parseSampleCode, generateSampleCode } = require('../subsystems/samples/db/sample-code');

describe('SOURCE_CODES / GROUP_CODES', () => {
  it('提供处映射 C/T/G', () => {
    expect(SOURCE_CODES).toEqual({ C: '客供', T: '元山', G: '元将五金塔岗分厂' });
  });
  it('组别映射 6 项全覆盖', () => {
    expect(GROUP_CODES).toEqual({ 扇叶组: 'S', 马达组: 'M', 成品组: 'A', 品保部: 'Q', SMT: 'E', 供应商: 'I' });
    expect(STATION_GROUPS).toEqual(['扇叶组', '马达组', '成品组', '品保部', 'SMT', '供应商']);
  });
});

describe('PATTERN 格式校验', () => {
  it('合法编号通过', () => {
    expect(PATTERN.test('G-YD9015-Q-001-01')).toBe(true);
    expect(PATTERN.test('C-ABCDEF-S-999-99')).toBe(true);
    expect(PATTERN.test('T-SF1225-M-001-01')).toBe(true);
  });
  it('非法编号拒绝', () => {
    expect(PATTERN.test('SM-000001')).toBe(false);          // 旧格式
    expect(PATTERN.test('G-YD9015-X-001-01')).toBe(false);  // 组别不在 S/M/A/Q/E/I
    expect(PATTERN.test('G-YD901-Q-001-01')).toBe(false);   // 机型仅 5 位
    expect(PATTERN.test('G-YD9015-Q-1000-01')).toBe(false); // 流水号超 3 位
    expect(PATTERN.test('G-YD9015-Q-001-100')).toBe(false); // 版次超 2 位
  });
});

describe('parseSampleCode', () => {
  it('解析各段', () => {
    expect(parseSampleCode('G-YD9015-Q-001-01'))
      .toEqual({ source_type: 'G', model: 'YD9015', group: 'Q', seq: '001', version: '01' });
  });
  it('非法编号返回 null', () => {
    expect(parseSampleCode('SM-000001')).toBeNull();
    expect(parseSampleCode(null)).toBeNull();
  });
});

describe('generateSampleCode', () => {
  const fakeQuery = (max) => async () => [{ m: max }];

  it('同组合流水号递增', async () => {
    const seqs = [];
    async function dbQuery() {
      const max = seqs.length ? Math.max(...seqs.map(Number)) : 0;
      return [{ m: max }];
    }
    for (let i = 0; i < 3; i++) {
      const code = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: dbQuery });
      seqs.push(parseSampleCode(code).seq);
    }
    expect(seqs).toEqual(['001', '002', '003']);
  });

  it('机型不足 6 位抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD901', station: '扇叶组', card_version: '01', query: fakeQuery(0) }))
      .rejects.toThrow('机型编码至少 6 位');
  });

  it('机型超 6 位取前 6 位', async () => {
    const code = await generateSampleCode({ source_type: 'T', model: 'SF-1225-A', station: '马达组', card_version: '01', query: fakeQuery(0) });
    expect(code).toBe('T-SF-122-M-001-01');
  });

  it('组别无效抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD9015', station: '调机样', card_version: '01', query: fakeQuery(0) }))
      .rejects.toThrow('组别无效');
  });

  it('提供处无效抛错', async () => {
    await expect(generateSampleCode({ source_type: 'X', model: 'YD9015', station: '扇叶组', card_version: '01', query: fakeQuery(0) }))
      .rejects.toThrow('提供处无效');
  });

  it('版次默认 01，数字版本取数字块', async () => {
    const c1 = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '', query: fakeQuery(0) });
    expect(c1).toBe('T-YD9015-S-001-01');
    const c2 = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: 'V2.0', query: fakeQuery(0) });
    expect(c2).toBe('T-YD9015-S-001-02');
  });

  it('流水号 999 溢出抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: fakeQuery(999) }))
      .rejects.toThrow('已达上限');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /www/wwwroot/sample-mgmt && sudo -A -u www npx jest tests/sample-code.test.js --runInBand
```
Expected: FAIL（`Cannot find module '../subsystems/samples/db/sample-code'`）

- [ ] **Step 3: 实现 sample-code.js**

写入 `/tmp/sample-code.js`，按执行前提复制到 `/www/wwwroot/sample-mgmt/subsystems/samples/db/sample-code.js`：

```js
// subsystems/samples/db/sample-code.js — 样品 13 位结构化编码模块
// 格式: 提供处(1)-机型(6)-组别(1)-流水号(3)-版次(2)，如 G-YD9015-Q-001-01
// 查询注入：generateSampleCode 接受 { conn, query }，conn 存在用事务连接，否则用 query(sql, params) 返回 rows

// 提供处代码 → 中文（客供维持 C，沿用 source_type C/T/G）
const SOURCE_CODES = { C: '客供', T: '元山', G: '元将五金塔岗分厂' };

// 组别中文 → 代码（站别字段存储中文，编码时映射）
const GROUP_CODES = { 扇叶组: 'S', 马达组: 'M', 成品组: 'A', 品保部: 'Q', SMT: 'E', 供应商: 'I' };

// 前端站别/组别下拉数据源
const STATION_GROUPS = Object.keys(GROUP_CODES);

// 完整编号正则：^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-\d{3}-\d{2}$
const PATTERN = /^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-\d{3}-\d{2}$/;

// 解析编号各段；非法返回 null
function parseSampleCode(no) {
  if (!no || typeof no !== 'string' || !PATTERN.test(no)) return null;
  const p = no.split('-');
  return { source_type: p[0], model: p[1], group: p[2], seq: p[3], version: p[4] };
}

// 版次提取：取 card_version 首个数字块，无则 01，上限 99
function extractVersion(cardVersion) {
  const m = String(cardVersion || '').match(/(\d+)/);
  if (!m) return '01';
  return String(Math.min(parseInt(m[1], 10), 99)).padStart(2, '0');
}

// 生成完整编号；流水号按 提供处+机型+组别 组合独立递增（001~999）
// opts: { source_type, model, station, card_version, conn?, query? }
async function generateSampleCode(opts) {
  const source = String(opts.source_type || '').toUpperCase();
  if (!SOURCE_CODES[source]) throw new Error('提供处无效：' + opts.source_type);
  const groupCode = GROUP_CODES[opts.station];
  if (!groupCode) throw new Error('组别无效：' + opts.station);
  const modelCode = String(opts.model || '').slice(0, 6);
  if (modelCode.length < 6) throw new Error('机型编码至少 6 位');
  const prefix = source + '-' + modelCode + '-' + groupCode + '-';
  const sql = 'SELECT COALESCE(MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED)), 0) AS m FROM samples WHERE LEFT(sample_no, 11) = ?';
  let rows;
  if (opts.conn) {
    rows = (await opts.conn.execute(sql, [prefix]))[0]; // conn.execute 返回 [rows, fields]
  } else if (opts.query) {
    rows = await opts.query(sql, [prefix]);              // query 直接返回 rows
  } else {
    throw new Error('generateSampleCode 缺少 query 或 conn');
  }
  const next = Number(rows[0].m) + 1;
  if (next > 999) throw new Error('该 提供处+机型+组别 组合已达上限 999');
  return prefix + String(next).padStart(3, '0') + '-' + extractVersion(opts.card_version);
}

module.exports = { SOURCE_CODES, GROUP_CODES, STATION_GROUPS, PATTERN, parseSampleCode, generateSampleCode };
```

> 编码段位与字符位置：`X-XXXXXX-X-XXX-XX` → 第 1 位提供处、第 3~8 位机型、第 10 位组别、第 12~14 位流水号、第 16~17 位版次，故 `SUBSTRING(sample_no, 12, 3)` 取流水号、`LEFT(sample_no, 11)` 取组合前缀。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /www/wwwroot/sample-mgmt && sudo -A -u www npx jest tests/sample-code.test.js --runInBand
```
Expected: PASS（纯函数用例全部通过）

- [ ] **Step 5: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/db/sample-code.js tests/sample-code.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(sample-code): add 13-digit structured sample code module"
```

---

### Task 2: dao.js 接入 generateSampleCode

**Files:**
- Modify: `subsystems/samples/db/dao.js:16-19`（nextSampleNo）、`:22-29`（createSample 调用）

- [ ] **Step 1: 修改 dao.js**

在文件顶部 `const crypto = require('crypto');` 后新增引用：

```js
const { generateSampleCode } = require('./sample-code');
```

将 `nextSampleNo`（现 L16-19）替换为：

```js
// 生成 13 位结构化编码（如 G-YD9015-Q-001-01）；旧 SM-XXXXXX 逻辑已废弃，保留注释
// data: { source_type, model, station, card_version }；conn 存在走事务连接，否则用连接池 q
async function nextSampleNo(data, conn) {
  return await generateSampleCode({
    source_type: data.source_type,
    model: data.model,
    station: data.station,
    card_version: data.card_version || '01',
    conn: conn,
    query: q
  });
}
```

将 `createSample` 中 L28 `var ns = await nextSampleNo(conn);` 替换为：

```js
var ns = await nextSampleNo({
  source_type: data.source_type || '',
  model: data.model || '',
  station: data.station || '',
  card_version: data.card_version || '01'
}, conn);
```

`createSample` 其余逻辑不变（SAVEPOINT 重试 ER_DUP_ENTRY 机制保留——并发冲突时重算流水号重试 3 次）。

- [ ] **Step 2: 语法检查**

```bash
cd /www/wwwroot/sample-mgmt && node -e "require('./subsystems/samples/db/dao.js'); console.log('dao ok')"
```
Expected: `dao ok`（不触发 DB 连接）

- [ ] **Step 3: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/db/dao.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "refactor(dao): generate sample_no via sample-code module"
```

---

### Task 3: routes-samples.js 必填校验 + code-preview 接口（TDD）

**Files:**
- Modify: `subsystems/samples/backend/routes-samples.js:60-85`（POST）、新增 code-preview 路由
- Test: `tests/sample-code.test.js`（追加接口用例）

- [ ] **Step 1: 追加失败测试**（code-preview 接口 + POST 校验）

在 `tests/sample-code.test.js` 末尾追加（文件在 www 属主下，用 /tmp 副本 + sudo cp 覆盖）：

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
});

describe('POST /api/samples 必填校验', () => {
  const { getApp, login } = require('./helpers/setup');
  beforeAll(async () => { await getApp(); });

  it('缺 source_type 返回 400', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples').send({ name: '无来源样品', model: 'YD9015', station: '扇叶组' });
    expect(res.status).toBe(400);
  });

  it('机型不足 6 位返回 400', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples').send({ name: '短机型样品', model: 'YD901', station: '扇叶组', source_type: 'T' });
    expect(res.status).toBe(400);
  });

  it('组别无效返回 400', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples').send({ name: '旧站别样品', model: 'YD9015', station: '调机样', source_type: 'T' });
    expect(res.status).toBe(400);
  });
});
```

> 注：`%E6%89%87%E5%8F%B6%E7%BB%84` = 扇叶组，`%E8%B0%83%E6%9C%BA%E6%A0%B7` = 调机样。若 login/agent 不可用（该测试文件顶部未引用 setup），改为在 `tests/samples.test.js` 中追加同名 describe（该文件已 import setup），并在 Step 4 中运行该文件。

- [ ] **Step 2: 运行确认失败**

```bash
cd /www/wwwroot/sample-mgmt && sudo -A -u www npx jest tests/sample-code.test.js --runInBand
```
Expected: FAIL（404 — code-preview 路由不存在；POST 校验未生效）

- [ ] **Step 3: 修改 routes-samples.js**

顶部 `const D = require('../../../db');` 后新增：

```js
const { STATION_GROUPS, generateSampleCode } = require('../db/sample-code');
```

在 `app.get('/api/samples/:id', ...)`（现 L53-57）**之前**插入 code-preview 路由（必须在 `:id` 前注册，否则被 `:id` 拦截）：

```js
// 编号预览（只读，不落库；须注册在 /:id 之前）——生成后编号以提交实际结果为准
app.get('/api/samples/code-preview', requireAuth, async (req, res) => {
  const { source_type, model, station, card_version } = req.query;
  try {
    const sample_no = await generateSampleCode({
      source_type, model, station, card_version,
      query: async (sql, params) => (await D.pool().execute(sql, params || []))[0]
    });
    res.json({ sample_no });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

将 POST `/api/samples`（现 L60-85）的角色校验之后、`createSample` 之前加入必填校验，并同步 `createSample` 参数：

```js
  app.post('/api/samples', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (!['RD', 'ADMIN'].includes(u.role))
        return res.status(403).json({ error: '无权限：仅研发可新建样品' });
      const { name, spec, model, station, notes,
        sample_type, limit_item, source_type, valid_until, card_version,
        test_standard, test_data } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: '请填写样品名称' });
      const src = (source_type || '').toUpperCase();
      if (!['C', 'T', 'G'].includes(src)) return res.status(400).json({ error: '请选择有效的提供处（C/T/G）' });
      if (!model || model.trim().length < 6) return res.status(400).json({ error: '机型编码至少 6 位' });
      if (!STATION_GROUPS.includes(station)) return res.status(400).json({ error: '请选择有效的组别' });
      const s = await D.createSample({
        name: name.trim(), spec: spec || '', model: model.trim(), station,
        notes: notes || '', image: '', created_by: u.id,
        sample_type: sample_type || '', limit_item: limit_item || '',
        source_type: src, valid_until: valid_until || '',
        card_version: (card_version || '').trim() || '01', test_standard: test_standard || '',
        test_data: test_data || '',
        signed_by_rd: u.display_name || u.username,
        signed_by_qa: ''
      });
      await D.addLog({ sample_id: s.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '新建样品' });
      res.json(s);
    } catch (err) {
      // 流水号达 999 上限等运行时编码错误降级为 400
      if (err.message && err.message.includes('上限')) return res.status(400).json({ error: err.message });
      logger.error('新建样品失败: ' + (err.message || String(err)));
      res.status(500).json({ error: '新建样品失败：' + (err.message || '服务器内部错误') });
    }
  });
```

> 路径校验：`routes-samples.js` 位于 `subsystems/samples/backend/`，`../db/sample-code` 即 `subsystems/samples/db/sample-code.js`。`D.pool()` 已由 `db.js` 导出（返回 mysql2/promise 连接池，`execute` 返回 `[rows]`）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /www/wwwroot/sample-mgmt && sudo -A -u www npx jest tests/sample-code.test.js tests/samples.test.js --runInBand
```
Expected: 编码模块用例 PASS；code-preview / POST 校验用例 PASS。若 samples.test.js 因缺必填字段 FAIL，属预期——Task 6 统一修复，本步只确认 sample-code.test.js 全过。

- [ ] **Step 5: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/backend/routes-samples.js tests/sample-code.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(api): add code-preview endpoint and POST /api/samples required-field validation"
```

---

### Task 4: 前端适配 — constants.js + new.js

**Files:**
- Modify: `subsystems/samples/frontend/js/constants.js:4`
- Modify: `subsystems/samples/frontend/js/views/new.js`

- [ ] **Step 1: 修改 constants.js 站别常量为 6 项组别**

`constants.js` L4：

```js
const STATIONS=['马达组','扇叶组','成品组','品保部','SMT','供应商'];
```

（原 `['马达组','扇叶组','成品组','调机样']`，删除「调机样」。此常量同时是 `data/source-types.json` 之外的站别数据源，供 `new.js` 组别下拉使用。）

- [ ] **Step 2: 重构 new.js 表单**

`viewNew()` 整体替换为（完整文件内容）：

```js
// new.js — 新建样品、打印标签、下载二维码、删除样品
function viewNew(){
  const v=$('#view');
  const groupOpts='<fluent-option value="">请选择组别</fluent-option>'+STATIONS.map(x=>'<fluent-option value="'+x+'">'+x+'</fluent-option>').join('');
  const sourceOpts='<fluent-option value="">请选择提供处</fluent-option><fluent-option value="C">客供(C)</fluent-option><fluent-option value="T">元山(T)</fluent-option><fluent-option value="G">塔岗(G)</fluent-option>';
  const limitOpts='<fluent-option value="">不适用</fluent-option>'+(typeof LIMIT_ITEMS!=='undefined'?LIMIT_ITEMS:[]).map(x=>'<fluent-option value="'+x.code+'">'+x.label+'</fluent-option>').join('');
  v.innerHTML='<div class="card" style="max-width:960px">'+
    '<div class="new-grid">'+
    '<div class="new-col">'+
    '<div class="new-col-title">基础信息</div>'+
    '<label>样品名称 *</label><fluent-text-field id="n-name" placeholder="如 1225震动样"></fluent-text-field>'+
    '<label>提供处 *</label><fluent-select id="n-source">'+sourceOpts+'</fluent-select>'+
    '<label>机型 *（6位编码，自动取前6位）</label><fluent-text-field id="n-model" maxlength="10" placeholder="如 YD9015"></fluent-text-field>'+
    '<label>组别 *</label><fluent-select id="n-station">'+groupOpts+'</fluent-select>'+
    '<label>规格/型号</label><fluent-text-field id="n-spec" placeholder="如 容量/尺寸等"></fluent-text-field>'+
    '<label>备注</label><textarea id="n-notes" rows="3"></textarea>'+
    '</div>'+
    '<div class="new-col">'+
    '<div class="new-col-title">限度样品信息（选填）</div>'+
    '<label>样品类型</label><fluent-select id="n-type"><fluent-option value="">不适用</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select>'+
    '<label>限度项目</label><fluent-select id="n-limit-item">'+limitOpts+'</fluent-select>'+
    '<label>版次（01~99，默认01）</label><fluent-text-field id="n-card-version" value="01" maxlength="2" style="width:80px"></fluent-text-field>'+
    '<span class="muted" style="font-size:11px">样品编号生成后固定，不再随版次变化</span>'+
    '<label>标准范围</label><textarea id="n-test-standard" rows="3"></textarea>'+
    '</div>'+
    '</div>'+
    '<div id="n-preview" class="muted" style="margin-top:12px;font-size:13px"></div>'+
    '<div style="margin-top:16px"><fluent-button appearance="accent" onclick="submitNew()">创建样品并生成条码</fluent-button></div>'+
    '<div id="n-msg" class="muted" style="margin-top:10px"></div></div>';
  _bindPreview();
}

// ═══ 编号实时预览（防抖 300ms，只读接口，不落库）═══
var _previewTimer=null;
function _bindPreview(){
  ['n-source','n-station'].forEach(function(id){
    const el=$('#'+id);
    if(el) el.addEventListener('change',_schedulePreview);
  });
  const m=$('#n-model');
  if(m) m.addEventListener('input',_schedulePreview);
}
function _schedulePreview(){
  clearTimeout(_previewTimer);
  _previewTimer=setTimeout(_refreshPreview,300);
}
async function _refreshPreview(){
  const box=$('#n-preview');
  if(!box) return;
  const src=$('#n-source').value, model=$('#n-model').value, station=$('#n-station').value;
  if(!src||!station){ box.textContent=''; return; }
  if(model.length>0&&model.length<6){ box.textContent='机型编码至少 6 位'; return; }
  try{
    const r=await api('GET','/api/samples/code-preview?source_type='+encodeURIComponent(src)+'&model='+encodeURIComponent(model)+'&station='+encodeURIComponent(station));
    box.textContent='编号预览：'+r.sample_no;
  }catch(e){ box.textContent=''; }
}
async function submitNew(){
  $('#n-msg').textContent='';
  try{
    const payload={
      name:$('#n-name').value,
      model:$('#n-model').value,
      station:$('#n-station').value,
      source_type:$('#n-source').value,
      card_version:$('#n-card-version').value||'01',
      spec:$('#n-spec').value,
      notes:$('#n-notes').value,
      sample_type:$('#n-type').value,
      limit_item:$('#n-limit-item').value,
      test_standard:$('#n-test-standard').value
    };
    const s=await api('POST','/api/samples',payload);
    openPrintLabel(s);
    toast('已创建 '+s.sample_no+'，可到样品列表补打条码','ok');
  }catch(e){$('#n-msg').textContent=e.message;}
}
function openPrintLabel(s){
  var sz=getPrintSize();
  window.open('/api/samples/'+s.id+'/label/print?size='+sz,'_blank');
}
async function printSampleLabel(id){
  const s=await api('GET','/api/samples/'+id);
  openPrintLabel(s);
}
function downloadQR(id){
  var a=document.createElement('a');
  a.href='/api/samples/'+id+'/label/download';
  a.download='';
  a.click();
}
```

> 要点：提供处/机型/组别上移至基础信息区并加 `*`；版次默认 `01`、`maxlength=2`；编号预览只读展示；预览与实际提交可能有并发差异，以提交后 toast 显示为准（设计文档 9 节）。`submitNew` 不再发送 `source_type` 之外的旧「来源」位置（原基础区无来源，现提供处即来源）。

- [ ] **Step 3: 语法自检（bundle 构建会暴露语法错误，此处先 node 检查）**

```bash
cd /www/wwwroot/sample-mgmt && node --check subsystems/samples/frontend/js/views/new.js && node --check subsystems/samples/frontend/js/constants.js
```
Expected: 无输出（通过）

- [ ] **Step 4: Commit（bundle 重建统一放 Task 7）**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/frontend/js/constants.js subsystems/samples/frontend/js/views/new.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(new): restructure create-sample form with source/model/group and live code preview"
```

---

### Task 5: 种子数据适配（seed.js / seed-samples.js）

**Files:**
- Modify: `subsystems/samples/seed/seed.js`
- Modify: `seed-samples.js`

两个文件内容一致（15 个样品），对每个 `D.createSample({...})` 按下表机械适配：**model 改为 6 位机型码、station 改为 6 组别之一、缺失 source_type 补齐**。

适配表（15 条）：

| 样品 | 原 model | 新 model | station | source_type |
|---|---|---|---|---|
| s1 | SF-1225-A | SF1225 | 马达组 | 补 T |
| s2 | SF-9225-Q | SF9225 | 扇叶组 | 补 T |
| s3 | SF-12025-L | SF1202 | 成品组 | C（已有） |
| s4 | SF-1225-A | SF1225 | 马达组 | T（已有） |
| s5 | SF-9225-C | SF9225 | 成品组 | 补 C |
| s6 | SF-12025-P | SF1202 | **调机样→成品组** | G（已有） |
| s7 | SF-1225-A | SF1225 | 成品组 | C（已有） |
| s8 | SF-1225-A | SF1225 | 马达组 | 补 T |
| s9 | SF-1225-A | SF1225 | 马达组 | T（已有） |
| s10 | SF-1225-A | SF1225 | 成品组 | C（已有） |
| s11 | SF-9225-Y | SF9225 | 成品组 | G（已有） |
| s12 | SF-12025-P | SF1202 | 成品组 | T（已有） |
| s13 | SF-1225-A | SF1225 | 马达组 | T（已有） |
| s14 | SF-9225-C | SF9225 | 成品组 | G（已有） |
| s15 | SF-9225-Q | SF9225 | 扇叶组 | C（已有） |

- [ ] **Step 1: 修改 seed.js**（每个 createSample 按表替换 model/station/source_type）

以 s1 为例（其余按表同样处理，s1/s2/s5/s8 需在 `created_by` 前补 `source_type`）：

```js
  var s1 = await D.createSample({
    name: '散热风扇·标准型A', spec: 'DC12V·0.35A·3000RPM·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '首批试模样品，待研发贴码确认', created_by: rd.id, source_type: 'T'
  });
```

s6 示例（station 改为 成品组，source_type G 保留）：

```js
  var s6 = await D.createSample({
    name: '调机验证风扇·量产版', spec: 'DC24V·0.45A·IP55·Φ120×38mm', model: 'SF1202', station: '成品组',
    notes: '调机工艺验证样品', created_by: rd.id,
    sample_type: 'OK', limit_item: 'X', source_type: 'G', card_version: 'V1.5',
    test_standard: 'Q/YS-调机-003', test_data: '调机参数OK', signed_by_rd: '研发工程师'
  });
```

- [ ] **Step 2: 修改 seed-samples.js**（同样的 15 处替换，与 Step 1 完全一致）

- [ ] **Step 3: 校验两份文件语法**

```bash
cd /www/wwwroot/sample-mgmt && node --check subsystems/samples/seed/seed.js && node --check seed-samples.js
```
Expected: 无输出（通过）

- [ ] **Step 4: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/seed/seed.js seed-samples.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "test(seed): adapt sample seed data to 13-digit code fields"
```

---

### Task 6: tests/samples.test.js 适配

**Files:**
- Modify: `tests/samples.test.js`

- [ ] **Step 1: 修改 seedSample / seedSampleWithLimit helper（核心，覆盖大部分用例）**

```js
async function seedSample() {
  const { agent } = await login('rd01', 'rd123');
  const res = await agent
    .post('/api/samples')
    .send({ name: '测试样品', spec: '规格A', model: 'SF1225', station: '马达组', source_type: 'T', notes: 'test' });
  expect(res.status).toBe(200);
  return { agent, sample: res.body };
}

async function seedSampleWithLimit() {
  const { agent } = await login('rd01', 'rd123');
  const res = await agent
    .post('/api/samples')
    .send({
      name: '限度测试样', spec: 'T-SPEC', model: 'SF9225', station: '成品组',
      sample_type: 'OK', limit_item: 'A', source_type: 'T',
      valid_until: '2027-06-01', card_version: 'A1',
      test_standard: '标准V1', test_data: ''
    });
  expect(res.status).toBe(200);
  return { agent, sample: res.body };
}
```

- [ ] **Step 2: 修改直接 POST 用例 body**（补 model 6 位 / station 有效组别 / source_type）

| 位置 | 原 body | 新 body |
|---|---|---|
| L41-44（ADMIN 创建） | `{ name:'新建样品1', spec:'规格X', model:'MX', station:'SX', notes:'test' }` | `{ name:'新建样品1', spec:'规格X', model:'MX1234', station:'马达组', source_type:'T', notes:'test' }` |
| L52-54（RD 创建） | `{ name:'新建样品2', spec:'规格Y', model:'MY', station:'SY', notes:'test' }` | `{ name:'新建样品2', spec:'规格Y', model:'MY1234', station:'马达组', source_type:'T', notes:'test' }` |
| L63（QA 创建，403） | `{ name:'新建样品3', spec:'规格Z', notes:'test' }` | 保持原样（角色校验在必填校验之前，403 语义不变） |
| L69（空 name，400） | `{ name:'', spec:'X' }` | 保持原样（name 校验在前） |
| L272-281（limit fields） | `model:'LM', station:'站OK'` | `model:'LM1234', station:'马达组'`（source_type 'T' 已有，card_version 'A1' 保留——保存值不变，仅编码取数字块） |
| L293（无 limit 字段） | `{ name:'普通样品', spec:'ordinary', notes:'no limit' }` | `{ name:'普通样品', spec:'ordinary', model:'SF1225', station:'马达组', source_type:'T', notes:'no limit' }` |

> L63/L69 不改的边界说明：POST 路由顺序为 角色校验(L62-64) → name 校验 → source/model/station 校验，QA 与空 name 场景在前两步即被拦截，必填校验不会影响原断言。

- [ ] **Step 3: 运行 samples 全量测试**

```bash
cd /www/wwwroot/sample-mgmt && sudo -A -u www npx jest tests/samples.test.js --runInBand
```
Expected: PASS（35 项，含 Task 3 新增用例与既有用例）

- [ ] **Step 4: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add tests/samples.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "test(samples): adapt test fixtures to 13-digit code required fields"
```

---

### Task 7: bundle 重建 + 全量回归 + 文档同步 + 收尾

**Files:**
- Modify: `subsystems/samples/frontend/index.html`（bundle 版本号，由构建脚本产出）
- Modify: `README.md`（新建样品说明：13 位编码 + 提供处/机型/组别）— 如 README 有对应章节

- [ ] **Step 1: 重建 samples bundle**

```bash
cd /www/wwwroot/sample-mgmt && node tools/build-bundles.js
cat tools/.bundle-ver
SUDO_ASKPASS=/tmp/askpass.sh sudo -A cp /tmp/bundle-samples.js subsystems/samples/frontend/js/bundle.js
sudo chown www:www subsystems/samples/frontend/js/bundle.js
```

按 `tools/.bundle-ver` 输出更新 `subsystems/samples/frontend/index.html` 中 `bundle.js?v=<ver>` 的版本号（用 /tmp 副本 + sudo cp 覆盖）。

> bundle 只重建 samples（fixtures/workbench 未改 JS；若 build-bundles.js 一次产出三个，仅复制 samples 一个即可）。修改 JS 后 MUST 重建（AGENTS.md 19.4）。

- [ ] **Step 2: 全量回归测试**

```bash
cd /www/wwwroot/sample-mgmt && sudo -A -u www npx jest --runInBand
```
Expected: 全量 PASS（基线 116 项 + 新增 ~10 项）。重点确认：fixtures / workbench 用例无回归（共享文件 `routes/misc.js` 未改，子系统隔离原则）。

- [ ] **Step 3: 文档同步**（README.md，若含「新建样品」章节则更新；操作手册 docs/operation-manual.md 中「站别」措辞改「组别」可选）

- [ ] **Step 4: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/frontend/js/bundle.js subsystems/samples/frontend/index.html README.md
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "chore(samples): rebuild bundle and sync docs for 13-digit sample code"
```

- [ ] **Step 5: 重启服务验证**（如服务运行中，后端 routes/dao 改动需重启生效；按执行前提第 4 条精确操作）

```bash
sudo ss -tlnp | grep 4000        # 精确识别 4000 PID，勿触碰 3500
# kill 精确 PID 后：
sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && setsid nohup node server.js > /tmp/sample-mgmt.log 2>&1 < /dev/null &'
```

- [ ] **Step 6: 前端手动验证清单**（可交 browser_use subagent 或人工）
1. 新建页：提供处/机型/组别三必填渲染正常，输入触发 300ms 后编号预览
2. 提交创建：toast 显示 `X-XXXXXX-X-XXX-XX` 格式编号
3. 列表/详情：编号正确展示；站别列显示组别中文
4. 标示卡编辑（NEW/PRODUCED 状态）：来源 C/T/G、版次仍可编辑，保存不改变 sample_no
5. 扫码 PRODUCE/RELEASE/CUSTODY 全链路正常
6. 打印标签 / 下载二维码正常
7. 旧数据（SM- 编号、调机样）列表展示不受影响

---

## 验证清单（完成后自检）

- [ ] 全链路 5 维度排查：代码（sample-code/dao/routes-samples/new/constants/seed/seed-samples/tests）✓；SQL（无结构变更，查询走 LEFT+SUBSTRING 索引前缀）✓；配置（STATIONS 常量变更，SOURCE_TYPES 不变）✓；接口（POST 出入参语义 + 新增 code-preview）✓；文档（README/操作手册）✓
- [ ] 子系统隔离：未改 samples 之外文件；fixtures/workbench 单测通过
- [ ] 兼容性：存量 `SM-` 编号与 `调机样` 数据零迁移零重生成；POST 旧调用方（缺 source_type/model/station）将收到 400 明确提示——外部对接方需同步
- [ ] 文件臃肿检测：每文件修改后输出 3 项报告（类型/有效行数/字符/距上限余量 + 函数数 + 冗余清单）
- [ ] 部署/回滚：重启 4000 服务生效；回滚仅还原代码重启（无 DB 变更）
- [ ] 上线监控：1~3 周期观察新建编号格式与同组合流水号连续性
