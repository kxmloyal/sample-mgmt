# 技术债务修复 — 后端+前端模块拆分设计

> 日期：2026-07-23 | 方案：B（均衡拆分）

## 1. 背景与目标

### 当前状态

| 文件 | 行数 | 字符 | 顶层函数 | 上限 | 问题 |
|---|---|---|---|---|---|
| `server.js` | 553 | 27381 | 5 | 400行/20000字符 | 行数+字符双超限 |
| `db.js` | 198 | 8922 | 20 | 200行/≤10函数 | 函数数超限 |
| `public/js/scan.js` | 140 | 8894 | 11 | 300行/≤10函数 | 函数数超限 |
| `public/js/api.js` | 65 | 3624 | 10 | 200行/≤10函数 | 临界 |

### 目标

全部文件降至上限以下，**对外接口完全兼容**：
- `require('./db')` / `require('./server')` 路径不变
- API 出入参不变
- 前端零改动（仅新增 script 标签加载常量模块）

---

## 2. 后端拆分方案

### 2.1 server.js → 1主入口 + 5路由模块

```
server.js              (~120行)  入口：imports、中间件、静态服务、错误处理、启动
routes/auth.js         (~50行)   requireAuth/currentUser + /api/login|logout|me
routes/samples.js      (~120行)  /api/samples CRUD（列表/详情/新建/删除/更新）含 saveSampleImage
routes/scan.js         (~100行)  /api/resolve + /api/scan 状态机（actionForRole/fmtCard/STATUS_LABEL）
routes/cards.js        (~140行)  /card/:sample_no（匿名）+ /api/samples/:id 打印/二维码/标签下载
routes/misc.js         (~70行)   /api/dashboard|logs|users + /health
```

**约定**：
- 每个路由模块导出 `register(app)` 函数
- `D`（db）和 `logger` 在模块内直接 `require`
- `server.js` 末尾按序调用 `register(app)`

### 2.2 db.js → 1主入口 + 3实体模块

```
db.js              (~80行)  初始化（SQL.js wasm）、建表、迁移、persist/nowISO/q/one/rowToObj
db/users.js        (~35行)  createUser / getUserById / getUserByUsername / listUsers
db/samples.js      (~70行)  nextSampleNo / createSample / get*Sample / listSamples / updateSample / deleteSample
db/logs.js         (~30行)  addLog / listLogsBySample / listLogs
```

**工厂模式**：子模块接收 `{ q, one, persist }` 工具函数，返回方法集合。

```js
// db/users.js
module.exports = function({ q, one, persist }) {
  function createUser({ username, password_hash, role, dept, display_name }) { ... }
  // ... 3 more functions
  return { createUser, getUserById, getUserByUsername, listUsers };
};
```

**db.js 组装**：
```js
const users = require('./db/users')({ q, one, persist });
const samples = require('./db/samples')({ q, one, persist, nowISO });
const logs = require('./db/logs')({ q, persist });
module.exports = { ready, db: () => db, nowISO, ...users, ...samples, ...logs };
```

对外完全兼容，`D.createUser()` 等调用路径不变。

---

## 3. 前端拆分方案

### 3.1 scan.js → 抽摄像头辅助模块

```
public/js/scan.js            (~100行)  扫码台核心：initScanPage/handleScanCode + 事件绑定
public/js/camera-helper.js   (~40行)   startCamera / stopCamera / scanFromCamera
```

`camera-helper.js` 直接操作 DOM（`#cam`/`#scan-code`），`scan.js` 通过全局函数调用。

### 3.2 api.js → 抽常量模块

```
public/js/api.js             (~50行)  全局函数：api/boot/doLogin/doLogout/toast/statusBadge/overdue/fmt/goScan
public/js/constants.js       (~50行)  STATUS/ROLE/STATIONS/LIMIT_ITEMS/SOURCE_TYPES + $/el 工具函数
```

**index.html 加载顺序**：`constants.js` → `api.js` → ...（其他不变）

---

## 4. 拆分前后对比

| 文件 | 拆分前 | 拆分后 | 预估行数 | 预估函数数 |
|---|---|---|---|---|
| `server.js` | 553行/5函数 | 入口+5路由 | ~120行/~3 | OK |
| `routes/auth.js` | — | 新建 | ~50行/~3 | OK |
| `routes/samples.js` | — | 新建 | ~120行/~6 | OK |
| `routes/scan.js` | — | 新建 | ~100行/~3 | OK |
| `routes/cards.js` | — | 新建 | ~140行/~3 | OK |
| `routes/misc.js` | — | 新建 | ~70行/~4 | OK |
| `db.js` | 198行/20函数 | 主入口+3实体 | ~80行/~3 | OK |
| `db/users.js` | — | 新建 | ~35行/~4 | OK |
| `db/samples.js` | — | 新建 | ~70行/~8 | OK |
| `db/logs.js` | — | 新建 | ~30行/~3 | OK |
| `js/scan.js` | 140行/11函数 | 减函数 | ~100行/~8 | OK |
| `js/camera-helper.js` | — | 新建 | ~40行/~3 | OK |
| `js/api.js` | 65行/10函数 | 减函数 | ~50行/~8 | OK |
| `js/constants.js` | — | 新建 | ~50行/0 | OK |

---

## 5. 兼容性保证

| 维度 | 承诺 |
|---|---|
| 后端 `require` 路径 | `require('./db')` / `require('./server')` 不变 |
| API 路径/出入参 | 全部不变 |
| 前端全局函数 | 全部保留，调用方式不变 |
| 数据库结构 | 不变 |
| 测试 | `npm test` 全部通过（适配 TEST_MODE） |
| 部署脚本 | `sample_mgmt_start.sh` 入口不变 |
| seed 脚本 | `seed.js` / `seed-rich.js` 入口不变 |

---

## 6. 验证清单

- [ ] `npm test` 40条用例全部通过
- [ ] `node test_flow.js` 端到端流程正常
- [ ] `npm run seed` 初始化正常
- [ ] `node seed-rich.js` 丰富数据导入正常
- [ ] 前端页面：登录→概览→列表→详情→新建→扫码→看板→日志→用户 全部正常
- [ ] 响应式断点：XS/SM/MD/LG/XL 弹窗布局正常
