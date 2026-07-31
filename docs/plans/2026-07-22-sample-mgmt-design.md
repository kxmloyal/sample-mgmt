# 制造品质管理系统 — 设计文档

日期：2026-07-22
状态：MVP 实施中

## 1. 业务背景
样品在三个责任主体之间流转，需要二维码作为唯一身份，扫码驱动状态变更并全程留痕：
1. **研发工程**：制作样品 → 生成并打印二维码 → 贴样 → 扫码确认「制作完成」（记录制作日期与状态）。
2. **品保文管中心**：收到样品 → 扫码确认「正式发行」→ 启动计时，可设定复检周期（天）。
3. **分发各部门保管**：接收部门 → 扫码确认「接收」→ 记录保管储位。

## 2. 技术栈
- 后端：Node.js + Express
- 会话：express-session；密码：bcrypt 哈希
- 数据库：SQLite（better-sqlite3，单文件 `data/sample.db`）；后续可迁 MySQL/Postgres
- 二维码：后端 `qrcode` 生成，码内容 = 样品短码 `SM-XXXXXX`
- 扫码：手机端 `html5-qrcode` 调摄像头；桌面扫码枪「键盘输入+回车」进输入框
- 前端：原生 HTML/JS 单页，角色自适应

## 3. 数据模型
- `users`(id, username, password_hash, role[RND|QA|CUSTODY], dept, display_name)
- `samples`(id, sample_no, name, spec, qr_token, status, created_by,
  produced_at, released_at, release_cycle_days, next_inspect_at,
  custody_dept, storage_location, notes, created_at, updated_at)
- `scan_logs`(id, sample_id, action, role, user_id, dept, location, note, created_at)

### 状态机
```
NEW → PRODUCED(制作完成)      研发扫码
PRODUCED → RELEASED(已发行)   品保扫码(设复检周期，启动计时)
RELEASED → IN_CUSTODY(保管中) 部门扫码(记储位)
周期到点 → INSPECT_DUE(待复检)/OVERDUE(逾期)  ← 看板预警
```
状态为派生：IN_CUSTODY 且 now > next_inspect_at 时标记为逾期。

## 4. 角色权限
| 角色 | 可执行动作 |
|------|-----------|
| 研发 RND | 新建样品、生成/打印二维码、扫码置「制作完成」 |
| 品保 QA | 扫码置「已发行」、设定复检周期 |
| 保管 CUSTODY | 扫码置「保管中」、记录储位 |
越权动作在后端拦截并返回错误。

## 5. 页面
登录 · 角色首页(待办概览) · 样品列表/详情 · 新建样品+二维码打印(RND) · 统一扫码台(手机/扫码枪) · 复检/生命周期看板 · 操作日志 · 用户管理(种子)

## 6. 交付范围（MVP）
登录鉴权 → 研发建样打印码 → 三方扫码改状态 → 复检周期计时与逾期看板 → 操作日志追溯。

## 7. 迁移路径
SQLite 通过统一数据访问层封装，未来切换 MySQL 只需替换 `db.js` 实现，API/前端不变。
