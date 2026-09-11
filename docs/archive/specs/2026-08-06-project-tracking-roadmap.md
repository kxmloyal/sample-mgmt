# 项目追踪子系统 — 后续迭代路线

- 日期：2026-08-06
- 状态：待实施（记录 UI/UX 修复闭环后的后续可选迭代）
- 所属子系统：项目追踪（projects）
- 前置基线：commit `2bc2980`（P0/P1/P2 排版布局 UI 修复已闭环并回归）
- 关联文档：`2026-08-05-project-tracking-design.md`（已完成实现）

> 本文档仅登记**已识别但未实施**的后续项，每项实施前 MUST 按 AGENTS.md §5 流程
> （brainstorming → 设计文档 → writing-plans → subagent → 回归）执行，完成后归档至 `docs/archive/`。

## 一、P3 项（UI/UX 修复明确排除，下一迭代优先）

### P3-1 prompt → modal 统一重构
- **现状**：新建/编辑项目、任务编辑、子任务、添加依赖、添加关联等 **10 处**使用原生 `prompt()` 输入
  （[projects.js](file:///www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/views/projects.js) 4 处 +
  [task-detail.js](file:///www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/views/task-detail.js) 6 处），
  仅成员管理使用共享 `openModal`（[modal.js](file:///www/wwwroot/sample-mgmt/shared/frontend/modal.js)），风格不一致。
- **目标**：全部输入弹窗统一为 `openModal` 表单（名称/描述/优先级/下拉选择），
  表单校验（必填、H/M/L 枚举、数字 ID）内聚在弹窗内，错误就地提示而非二次 prompt。
- **注意**：不改变后端接口出入参；改造后 MUST 重建 bundle。

### P3-2 附件下载鉴权
- **现状**：任务附件下载链接前缀 `/uploads/projects/`（静态服务挂载点），当前为**公开静态访问**，未校验登录态/项目成员身份。
- **目标**：附件下载（或列表）增加鉴权——至少 requireAuth；如需项目隔离，下载走受控路由（如
  `GET /api/projects/tasks/:tid/files/:fid/download` 校验成员后 `res.download`），静态目录不再直接暴露。
- **兼容**：改造期间保留旧静态路径（兼容已外发链接），灰度后再下线。

### P3-3 空态占位
- **现状**：任务列表/看板列/详情页子任务/评论/关联等空数据时直接渲染空容器，无友好提示。
- **目标**：统一空态组件（图标 + 文案 + 可选引导按钮，如「去创建」），样式写入 module.css（`.pk-empty`）。

## 二、UI 布局 / 交互分析候选方向（优先级低于 P3）

| 方向 | 内容 | 说明 |
|---|---|---|
| 任务详情页布局优化 | 7 区块（主信息/子任务/依赖/评论/附件/关联/日志）当前纵向堆叠，可评估 XL 断点三栏布局或区块折叠 | 需遵守 5 断点响应式体系 |
| 移动端适配专项 | 各视图在 <576px 下走查（筛选区换行、看板列横向滚动、详情区块堆叠） | 看板已含按钮流转兜底，移动端可用性已具备基础 |
| 看板拖拽增强（可选） | 拖拽已实现（START/COMPLETE 白名单 + 非法回弹），可扩展拖拽排序/跨项目拖拽 | 需先评估后端是否引入排序字段 |

## 三、技术债 / 工程维护项

### T-1 测试连接池未清理（Jest teardown 报 TCPWRAP）
- **现状**：`db.js` 无 `close()` 导出、`tests/*.test.js` 无 `afterAll` 关闭连接池，
  Jest teardown 阶段检测到未清理的数据库 TCP 连接报 `● TCPWRAP`（projects 套件被计为 1 failed，samples 套件偶发但不计失败）。
  **与业务代码无关**（断言级用例全部通过），但会污染 CI/本地测试结果判定。
- **目标**：`db.js` 增加 `close(pool)`（幂等），测试文件 `afterAll` 中调用；确认后 TCPWRAP 消失。

## 四、迭代执行约定

1. 每项实施前 MUST 走 AGENTS.md §5 完整流程（含设计文档/实现计划）；
2. 涉及共享文件（app.css/modal.js 等）MUST 双/三系统回归（样品、治具、工作台）；
3. 前端 JS 改动后 MUST 重建 bundle（`node tools/build-bundles.js` + 复制 + 更新版本号）；
4. 每迭代完成后：文件臃肿检测报告 + 回归清单 + 文档同步，设计文档/计划归档至 `docs/archive/`；
5. 上线后监控 1~3 周期（如附件鉴权改造关注外发链接可用性、下载鉴权拦截日志）。
