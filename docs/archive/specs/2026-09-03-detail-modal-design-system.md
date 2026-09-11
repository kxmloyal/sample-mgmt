# 详情弹窗设计系统规范（方案 B）

- 日期：2026-09-03
- 依据：样品详情弹窗（方案 B 交互优化）经认证的 UX，提炼为可复用设计规则 + 共享组件
- 状态：待评审
- 范围：共享层（app.css / shared/frontend）+ samples 采用 + fixtures 首用验证

## 1. 设计规则（8 条，各子系统详情弹窗统一遵循）

| # | 规则 | 说明 |
|---|---|---|
| DM-1 | 骨架屏加载 | 点击行立即开弹窗 + `.sk` 骨架，数据到达后替换 |
| DM-2 | Tab 栏置顶 | Tab 栏在 head 下方、内容上方；active 蓝色下划线（`.detail-tabs-top`） |
| DM-3 | 头部操作组 | 编号+徽章右侧放置图标操作按钮组（`.pv-actions`/`.pv-icon-btn`，下沉共享） |
| DM-4 | 密度自适应宽度 | 内容密度三档：信息 960 / 中部 800 / 窄 640px（作用于 `#fluent-modal::part(control)`） |
| DM-5 | 日志时间线 | 竖线+圆点+流向箭头+长备注折叠（`.tl-*`） |
| DM-6 | 未保存 dirty 拦截 | 切Tab/关闭/遮罩时 confirm（`_detailDirty` + `tryCloseDetail` + document-capture 遮罩拦截） |
| DM-7 | 内容自适应高度 | max-height 94vh，无冗余滚动条 |
| DM-8 | 409 自动刷新 | 冲突后自动重载详情（`onConflictRefresh` 回调） |

## 2. 共享层落地

### 2.1 app.css 新增（框架级，供所有子系统）
- `.sk` 骨架屏（pulse 动画）
- `.detail-tabs-top` 置顶 Tab 栏（border-bottom，active 蓝下划线）
- `.pv-actions`/`.pv-icon-btn` 头部操作组
- `#fluent-modal.dm-low/d-mid/d-high::part(control)` 密度宽度（含 max-width 覆盖）
- `.tl`/`.tl-item`/`.tl-act`/`.tl-flow`/`.tl-meta`/`.tl-note` 时间线系列
- `#fluent-modal.dm-modal` 观感（阴影/foot 白底/max-height 94vh）
- `.dm-pad` 内容呼吸感内边距

> 注：原 samples module.css 中的这些类迁移到 app.css，samples module.css 移除（避免重复）。§17.5 规定子系统样式写 module.css，但详情弹窗为框架级通用组件，故下沉 app.css。

### 2.2 新增 `shared/frontend/detail-modal.js`
通用详情弹窗组件，封装 DM-1/2/4/6/7/8：
```js
openDetailModal(opts)
// opts: {
//   id,                                    // 数据标识
//   fetchData: async () => {data, tabs},   // 获取详情+Tab 定义
//   buildHead: (data) => html,             // head 内容
//   buildTabContent: (data, key, ctx) => {html, onRendered?},  // 各 Tab 内容
//   getDensityClass: (key) => 'dm-high|dm-mid|dm-low',  // 密度映射
//   onConflict: () => ...                  // 409 刷新
// }
// 返回: { getData, switchTab, close }
```
- 内部实现骨架屏、Tab 置顶、密度类切换、dirty 守卫、409 刷新、遮罩 document-capture 拦截、内容自适应。
- 子系统只需提供渲染回调，无需重复实现交互骨架。

## 3. 采用验证

- **samples**：`detail.js`/`detail-card.js` 改用 `openDetailModal`（移除重复交互逻辑），保留业务渲染回调。
- **fixtures**（首用验证复用）：`detail.js` 接入 `openDetailModal`，验证共享组件能在不同子系统复用（行为一致）。

## 4. 兼容性 / 回归

- app.css 为共享变更 → **全子系统回归**（portal + 5 子系统页面、各详情弹窗、登录/扫码）
- shared/frontend/detail-modal.js 新增（无既有调用方，向后兼容）
- samples/fixtures bundle 重建
- §6.1 共享变更须多系统回归

## 5. 部署

- 纯前端（app.css/js/html），浏览器硬刷新即生效，无需重启

## 6. 文档同步

- AGENTS.md 增补「详情弹窗设计规则」小节（或引用本 spec）
- README 详情弹窗描述更新
