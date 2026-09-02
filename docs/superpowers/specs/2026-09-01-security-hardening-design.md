# 安全专项设计（S1 静态收敛 / S2 会话治理 / S3 CSV 注入）

- 日期：2026-09-01
- 依据：安全审计（评级 D）——静态源码暴露、匿名枚举、会话治理缺失、CSV 公式注入
- 状态：已评审（用户确认范围与两个判断）

## 1. 范围

| 批次 | 项 | 文件 |
|---|---|---|
| S1 | ① 静态服务收敛（只暴露 frontend） | `server.js` |
| S1 | ② `/api/subsystems/:id` 加鉴权 | `routes/subsystems.js` |
| S1 | ③ `/card/:sample_no` 匿名限流 | `subsystems/samples/backend/routes-cards.js` |
| S1 | ④ 错误信息统一 generic（日志保留） | `server.js` |
| S2 | ⑤ 会话版本失效（改密/登出全会话失效） | `db/migrations.js`、`db/users.js`、`shared/middleware/auth.js`、`routes/auth.js` |
| S3 | ⑥ CSV 公式注入防护 | `shared/csv.js` |

## 2. 明确排除（用户决策）

- 种子账号改密/停用（暂缓）
- NODE_ENV 不设 production（内网 HTTP，secure cookie 会破坏登录）
- CSP 强化跳过（inline 脚本过多，破坏风险高）
- `/card` token 化 URL（QR 明文 sample_no 为已决策取舍，仅加限流缓解）

## 3. 详细设计

### S1-① 静态服务收敛（server.js:104）
现状：`app.use('/subsystems', express.static(subsystems))` 暴露 backend/*.js、db/schema.sql、seed/*.js、manifest.json。
改法：遍历 `subsystems/` 下各子系统目录，仅挂载其 `frontend/` 子目录：
```js
// 只暴露各子系统 frontend 目录（安全：后端源码/schema/seed/manifest 不再可下载）
fs.readdirSync(path.join(__dirname, 'subsystems')).forEach(function (id) {
  var fe = path.join(__dirname, 'subsystems', id, 'frontend');
  if (fs.existsSync(fe)) app.use('/subsystems/' + id + '/frontend', express.static(fe, { maxAge: '7d' }));
});
```
URL 不变（`/subsystems/samples/frontend/index.html` 仍可访问）。`/shared/frontend` 已只暴露 frontend，不动。

### S1-② /api/subsystems/:id 加鉴权（routes/subsystems.js:67）
`app.get('/api/subsystems/:id', requireAuth, ...)`。与列表接口 `/api/subsystems`（未登录返回空数组）语义对齐。

### S1-③ /card 匿名限流（routes-cards.js）
新增独立限流器（如 60 次/分钟/IP），仅作用于 `/card/:sample_no`（匿名接口，防枚举爬取）。复用 express-rate-limit（server.js 已引入）。

### S1-④ 错误信息统一 generic（server.js:159）
`error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message` → 改为始终 `'服务器内部错误'`，err.message 写入日志（logger 已有）。不依赖 NODE_ENV。

### S2-⑤ 会话版本失效
- 迁移：`users` 表加 `session_version INT NOT NULL DEFAULT 0`（幂等）
- `db/users.js`：`getUserById` 返回含 session_version；新增 `bumpSessionVersion(userId)`（`UPDATE users SET session_version=session_version+1 WHERE id=?`）
- `shared/middleware/auth.js`：`currentUser`/`requireAuth` 校验 `req.session.userId` 对应用户的 `session_version === req.session.sessionVersion`，不一致 → 视为未登录（销毁会话）
- 登录时：`req.session.sessionVersion = user.session_version`
- 改密（routes/auth.js change-password）与登出：`bumpSessionVersion(userId)` 使该用户**所有**会话失效（登出只失效当前会话即可，但为一致性可同样 bump——登出仅 destroy 当前会话，其他会话保留；改密必须 bump 全部）
- 兼容：存量会话无 sessionVersion → 视为有效（首次登录后写入）；或强制重新登录（更安全，但会踢掉所有在线用户——上线时需评估）。**决策：存量会话 sessionVersion 缺失时视为有效**（避免上线即踢全部在线用户），新登录写入。

### S3-⑥ CSV 公式注入（shared/csv.js esc）
`esc(v)` 对字符串值：若以 `=`、`+`、`-`、`@`、`\t`、`\r` 开头，前置单引号 `'` 中和。仅影响导出文件内容，不影响数据。

## 4. 兼容性

- 静态收敛：URL 不变，前端无感知；仅后端源码不再可下载
- /api/subsystems/:id 加鉴权：前端调用处已登录（门户/管理面板），无影响
- /card 限流：正常扫码查看不受影响（60/min 足够）
- 错误 generic：前端 toast 显示更通用文案，无破坏
- 会话版本：存量会话兼容（缺失视为有效）；改密后旧会话失效（预期行为）
- CSV：导出内容前缀中和，Excel 打开不再执行公式

## 5. 回归

- 共享层改动（server.js、routes/subsystems.js、shared/middleware/auth.js、shared/csv.js、db/users.js、db/migrations.js）→ **全子系统回归**：portal + 5 子系统页面、登录/登出/改密、各子系统列表/导出 CSV、扫码台
- samples 内（routes-cards.js）→ samples 回归
- 验证：匿名访问 `/subsystems/samples/backend/routes-scan.js` → 404；`/card` 高频请求 → 429；改密后旧会话 → 401

## 6. 部署

- 涉及共享层 + DB 迁移 → 需重启（宝塔运维）；迁移随启动自动执行
- 回滚：git revert + 重启；session_version 列保留无害

## 7. 文档同步

- README 安全章节（静态服务范围、/card 限流、会话失效机制）
- AGENTS.md §14 技术债（如适用）
