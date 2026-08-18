# 用户自助修改密码 设计文档

> 日期：2026-08-13
> 状态：已确认（方案 A）
> 关联：AGENTS.md §11 API 约定、§22 门户个性化

## 1. 背景与目标

系统目前只有管理员可在「用户管理」页修改/重置密码（`PUT /api/users/:id`、`POST /api/users/batch reset-password`），普通用户（如批量导入的 J02977 等 16 个新用户）**无法自行修改初始密码**（初始密码默认 `123456`）。

目标：新增「用户自助修改密码」能力，登录用户可在门户修改本人密码，改密后需重新登录。

## 2. 方案选型（已确认方案 A）

| 方案 | 说明 | 结论 |
|---|---|---|
| **A. 后端 API + 门户内联弹窗（推荐）** | `POST /api/change-password`（登录态）+ portal.html 用户区「修改密码」链接 + 内联弹窗 | ✅ 采用 |
| B. 四个子系统各加改密入口 | 入口重复、需改 4 个 SPA + 重建 4 个 bundle | 不采用（维护成本高） |
| C. 仅后端 API 无 UI | 普通用户无法操作 | 不采用 |

## 3. 接口规范

### POST /api/change-password（需登录，全员可用含 ADMIN）

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| old_password | string | 是 | 当前登录密码（bcrypt 校验） |
| new_password | string | 是 | 新密码：字符串、长度 ≥6、与旧密码不同 |

**校验与错误**

| 场景 | HTTP | error |
|---|---|---|
| 未登录 | 401 | 未登录 |
| 新密码缺失/非字符串/长度 <6 | 400 | 新密码长度至少 6 位 |
| 新密码与旧密码相同 | 400 | 新密码不能与旧密码相同 |
| 旧密码错误 | 401 | 原密码错误 |

**成功响应**：`200 { ok: true }`，同时**销毁当前 session**（前端提示重新登录）。

**实现位置**：`routes/auth.js` register() 内新增路由，复用 `app.locals.requireAuth`、`D.getUserByUsername`（取 password_hash）、`D.updateUser(id, { password_hash })`（安全字段返回，不含 hash）。

**安全说明**
- 不在响应中返回 password_hash；session 销毁后旧会话立即失效
- 不改动管理员重置密码逻辑与 `/api/me`、登录等既有接口

## 4. 前端交互（portal.html）

- 登录后 user-info 区（`退出` 链接旁）新增 `修改密码` 链接
- 点击弹出内联弹窗（复用登录框视觉，`.login-box` 样式）：
  - 输入：原密码（password）、新密码（password）、确认新密码（password）
  - 前端校验：新密码 ≥6 位、两次输入一致（防呆）
  - Enter 回车可提交；提交中禁用按钮；成功提示后 `location.reload()`（会话已销毁，回到登录框）
  - 失败展示后端 error 文案
- 保持门户单文件内联实现（不引入 modal.js），避免共享文件依赖面扩大

## 5. 测试策略

新增 `tests/change-password.test.js`（复用 tests/helpers/setup.js）：
1. 未登录 POST → 401
2. 新密码长度不足（<6）→ 400
3. 新密码与旧密码相同 → 400
4. 旧密码错误 → 401
5. 改密成功 → 200 且旧密码登录失败、新密码登录成功
6. 改密后原 session 失效（原 agent 再请求 /api/me → 401）
7. ADMIN 角色同样可用（admin 改密后再改回，避免影响其他测试）

## 6. 全链路影响与回归

**依赖排查（5 维度）**
- 代码：`routes/auth.js`（新增路由，不改既有路由）；`db/users.js`（复用 updateUser，无改动）；`portal.html`（user-info 渲染 + 内联弹窗）
- SQL：无新表/字段
- 配置：无
- 接口：新接口无既有调用方；不改动 /api/login、/api/me、/api/logout 行为
- 文档：docs/operation-manual.md 用户操作说明书新增「修改密码」章节（AGENTS.md §13）

**回归清单**
- [ ] 门户：登录后「修改密码」入口可见、弹窗交互正常
- [ ] 改密成功后需重新登录（会话销毁）
- [ ] 双系统回归（§6.1 共享文件 portal.html 变更）：样品/治具子系统从门户进入均正常
- [ ] 管理员重置密码功能不受影响
- [ ] 新增单元测试全绿；既有 auth 测试不回归
- [ ] 上线后 1~3 周期监控：登录失败日志、改密接口 4xx 异常

**部署/回滚**：改后重启服务（kill 4000 PID + www 身份重启）；回滚即还原 routes/auth.js 与 portal.html（git revert），无需数据迁移。
