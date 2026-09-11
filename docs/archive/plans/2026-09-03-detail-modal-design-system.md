# 实现计划：详情弹窗设计系统（方案 B）

> 关联 spec：[2026-09-03-detail-modal-design-system.md](../specs/2026-09-03-detail-modal-design-system.md)
> 覆盖：共享层（app.css、shared/frontend）+ samples + fixtures
> 执行方式：orchestrator 直接执行（前端重构，无需重启，硬刷新生效）
> 关键约束：app.css/shared 变更须多系统回归；改前端 JS 后重建 bundle

## 任务总览（5 个任务）

| # | 任务 | 文件 |
|---|---|---|
| DM-1 | 共享 CSS 下沉 app.css | `public/css/app.css`、`subsystems/samples/frontend/css/module.css` |
| DM-2 | 新增 shared/frontend/detail-modal.js | `shared/frontend/detail-modal.js` |
| DM-3 | samples 改用共享组件 | `subsystems/samples/frontend/js/views/detail.js`、`detail-card.js`、`api.js` |
| DM-4 | fixtures 首用验证 | `subsystems/fixtures/frontend/js/views/detail.js` |
| DM-5 | bundle 重建 + 多系统回归 + 文档 | samples/fixtures bundle、README、AGENTS |

---

## DM-1 · 共享 CSS 下沉 app.css

### Steps
1. 读 samples module.css 中 `dm-`/`sk`/`detail-tabs-top`/`tl-`/`pv-`/`d-*` 类。
2. 迁移到 app.css（追加到详情弹窗段），类名保留（`.sk`/`.detail-tabs-top`/`.pv-actions`/`.pv-icon-btn`/`.dm-*`/`.tl-*`/`.d-pad`）。
3. samples module.css 移除已下沉的类（避免重复）。
4. 命名空间：用 `.dm-`/`.detail-` 前缀（不与现有 `.detail-tabs` 冲突）。

### 验证
- samples 页面仍正常（硬刷新后样式一致）
- 其它子系统 portal 冒烟

### Commit
`feat(ds): move detail-modal shared styles to app.css`

---

## DM-2 · 新增 shared/frontend/detail-modal.js

### Steps
1. 新建 `shared/frontend/detail-modal.js`，封装 `openDetailModal(opts)`（按设计文档 API）。
2. 内部：骨架屏（.sk）、Tab 置顶（.detail-tabs-top）、密度类切换、dirty 守卫、409 刷新、遮罩 document-capture。
3. 导出 `openDetailModal`。

### 验证
- `node --check`
- DOM 桩测试：骨架/置顶/密度/dirty/409

### Commit
`feat(ds): shared detail-modal component`

---

## DM-3 · samples 改用共享组件

### Steps
1. `detail.js`/`detail-card.js`：用 `openDetailModal` 替换手工 openModal + 骨架 + Tab + dirty 逻辑，保留业务渲染（概览/日志/标示卡/大图）。
2. `index.html` bundle 源清单加 `detail-modal.js`（在 detail.js 前）。
3. 移除 samples 内重复交互逻辑。

### 验证
- samples 详情弹窗四个 Tab 行为不变（骨架/置顶/密度/dirty/409）
- `node --check`

### Commit
`refactor(samples): adopt shared detail-modal`

---

## DM-4 · fixtures 首用验证

### Steps
1. `fixtures/detail.js` 接入 `openDetailModal`（fixture 详情：概览/附件/日志/大图）。
2. 移除 fixtures 内手工 modal 交互（如有重复）。

### 验证
- fixtures 详情弹窗与 samples 行为一致（骨架/置顶/密度）
- 复用验证：共享组件在不同子系统工作

### Commit
`refactor(fixtures): adopt shared detail-modal (first cross-subsystem reuse)`

---

## DM-5 · 收尾

### Steps
1. 重建 samples + fixtures bundle。
2. 多系统回归：portal + 5 子系统页面、各详情弹窗、登录/扫码。
3. 文档：README 详情弹窗描述、AGENTS 增补设计规则引用。

### Commit
`chore(ds): rebuild bundles + docs`

## 风险
| 风险 | 缓解 |
|---|---|
| app.css 共享变更影响其它子系统 | 多系统回归（DM-5） |
| 共享组件 API 设计调整 | samples 先行改，验证后 fixtures 复用 |
| bundle 源顺序 | 新增 detail-modal.js 须在 detail.js 前 |
