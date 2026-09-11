# 实现计划：安全专项（S1/S2/S3）

> 关联 spec：[2026-09-01-security-hardening-design.md](../specs/2026-09-01-security-hardening-design.md)
> 覆盖：共享层（server.js/routes/subsystems.js/shared/middleware/auth.js/shared/csv.js/db/users.js/db/migrations.js）+ samples（routes-cards.js）
> 执行方式：Subagent 驱动
> 关键约束：禁止重启；共享层改动须全子系统回归；samples 已上线只读验证

## 任务总览（6 个 Task）

| # | 任务 | 文件 | 要点 |
|---|---|---|---|
| S1-T1 | 静态服务收敛 | `server.js` | 只暴露各子系统 frontend 目录 |
| S1-T2 | /api/subsystems/:id 加鉴权 | `routes/subsystems.js` | requireAuth |
| S1-T3 | /card 匿名限流 | `subsystems/samples/backend/routes-cards.js` | 独立限流器 60/min |
| S1-T4 | 错误信息 generic | `server.js` | 不依赖 NODE_ENV |
| S2-T5 | 会话版本失效 | `db/migrations.js`、`db/users.js`、`shared/middleware/auth.js`、`routes/auth.js` | session_version 机制 |
| S3-T6 | CSV 公式注入 | `shared/csv.js` | esc 中和 = + - @ 前缀 |

---

## S1-T1 · 静态服务收敛

### Files
- `server.js`

### Steps
1. 读 server.js 静态服务段（约 :91-116）。
2. 将 `app.use('/subsystems', express.static(subsystems))` 替换为遍历各子系统仅挂 frontend：
```js
// 只暴露各子系统 frontend 目录（安全：后端源码/schema/seed/manifest 不再可下载）
fs.readdirSync(path.join(__dirname, 'subsystems')).forEach(function (id) {
  var fe = path.join(__dirname, 'subsystems', id, 'frontend');
  if (fs.existsSync(fe)) app.use('/subsystems/' + id + '/frontend', express.static(fe, { maxAge: '7d' }));
});
```
3. 确认 `fs` 已 require（无则补）。
4. 保留 `/shared/frontend` 与 `public/` 静态不变。

### 验证
- `node --check server.js`
- 匿名 GET：`/subsystems/samples/frontend/index.html` → 200；`/subsystems/samples/backend/routes-scan.js` → 404；`/subsystems/samples/db/schema.sql` → 404；`/subsystems/samples/manifest.json` → 404；`/subsystems/control/frontend/index.html` → 200
- 5 个子系统 frontend 全部可访问

### Commit
`fix(security): serve only subsystem frontend dirs (stop source exposure)`

---

## S1-T2 · /api/subsystems/:id 加鉴权

### Files
- `routes/subsystems.js`

### Steps
1. 读 :67 附近。
2. `app.get('/api/subsystems/:id', function (req, res) {...})` → 加 `requireAuth` 参数。
3. 确认前端调用处已登录（门户/管理面板）。

### 验证
- 匿名 GET `/api/subsystems/samples` → 401；登录后 → 200

### Commit
`fix(security): require auth on subsystem manifest detail`

---

## S1-T3 · /card 匿名限流

### Files
- `subsystems/samples/backend/routes-cards.js`

### Steps
1. 读文件顶部与 `/card/:sample_no` 路由（:65）。
2. 新增独立限流器（复用 express-rate-limit，server.js 已引入，此处 require）：
```js
var cardLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: '请求过于频繁，请稍后再试' } });
```
3. `/card/:sample_no` 挂 `cardLimiter`。

### 验证
- 匿名连续请求 `/card/G-BD7620-S-001-01` 61 次 → 第 61 次 429
- 正常访问不受影响

### Commit
`fix(security): rate-limit anonymous card endpoint`

---

## S1-T4 · 错误信息 generic

### Files
- `server.js`

### Steps
1. 读 :159 附近错误处理。
2. 改为始终 `'服务器内部错误'`，err.message 写日志（logger 已有 error 记录，确认不重复）。

### 验证
- 触发一个 500（如非法请求）→ 响应体为 generic，日志含 err.message

### Commit
`fix(security): generic error message regardless of NODE_ENV`

---

## S2-T5 · 会话版本失效

### Files
- `db/migrations.js`、`db/users.js`、`shared/middleware/auth.js`、`routes/auth.js`

### Steps
1. 迁移：`migrateUsersSessionVersion`（幂等 `ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0`），注册。
2. `db/users.js`：`getUserById` 返回含 session_version（若 SELECT * 则天然含）；新增 `bumpSessionVersion(userId)`。
3. `shared/middleware/auth.js`：读现状（requireAuth/currentUser 如何取用户）。在取到用户后校验 `req.session.sessionVersion === user.session_version`，不一致 → 销毁会话并视为未登录（401）。
4. 登录（routes/auth.js）：成功后 `req.session.sessionVersion = user.session_version`。
5. 改密（change-password）：成功后 `bumpSessionVersion(userId)`（使该用户所有旧会话失效）。
6. 登出：仅 destroy 当前会话（不 bump，避免影响该用户其他设备会话——按设计文档决策）。
7. 兼容：存量会话无 sessionVersion → 视为有效（不强制重登）。

### 验证
- 测试库：登录 → 改密 → 旧会话请求 → 401；新登录 → 200
- 存量会话（无 sessionVersion）→ 仍有效
- 全子系统登录/登出回归

### Commit
`feat(security): session version invalidation on password change`

---

## S3-T6 · CSV 公式注入

### Files
- `shared/csv.js`

### Steps
1. 读 `esc(v)`（:5）。
2. 字符串值若以 `=`、`+`、`-`、`@`、`\t`、`\r` 开头 → 前置 `'`。
3. 保持数字/其他类型不变。

### 验证
- `esc('=cmd')` → `'=cmd`；`esc('正常')` → `正常`；数字不变
- 各子系统导出 CSV 回归（samples/fixtures/control/projects/workbench 导出接口）

### Commit
`fix(security): neutralize CSV formula injection`

---

## S7 · 回归 + 文档 + 部署申请

### Steps
1. 全子系统回归：portal + 5 子系统页面、登录/登出/改密、各导出 CSV、扫码台
2. 匿名安全验证：源码 404、/card 429、/api/subsystems/:id 401
3. 文档：README 安全章节、AGENTS §14
4. 《重启申请》草稿（共享层+DB 迁移需重启）

### Commit
`docs(security): hardening notes`
