# 项目追踪子系统 v2 迭代设计

> 日期：2026-08-06 · 状态：已确认 · 后续：writing-plans

## 1. 背景

项目追踪子系统（projects）2026-08-05 上线（multi-project 问题/任务追踪：看板、子任务、依赖、评论、附件、留痕、导出）。全维度评审发现：功能骨架扎实（状态机/乐观锁/权限/留痕完整），但**交互层停留在原型级**（6 处 `prompt()`），且存在关键功能入口缺失（任务创建入口、我的任务视图、依赖/关联实质不可用、OVERDUE 显示滞后、详情页 N+1 补查）。

## 2. 评审发现摘要（六维度）

| 维度 | 核心问题 |
|---|---|
| 功能 | 任务创建入口缺失（API 有、UI 无）；无「我的任务」视图；依赖/关联需手输对象 ID 不可用；任务编辑仅 2 字段；OVERDUE 无自动触发（显示滞后）；子任务完成不联动父任务进度 |
| 交互 | 6 处 prompt()/confirm()，与样品/治具 fluent-modal 表单风格不一致；无校验/下拉/日期选择 |
| UI | 详情 7 面板纵向堆叠超长；看板卡无进度/项目标识；workflow 管理页裸输入无校验 |
| 性能 | 详情页 2~3 次请求补查 project_name/assignee_name；列表/看板全量加载无分页；详情每次操作全量重渲染 |
| 权限 | 相对完善（ADMIN/PM 全局 + owner/member 项目内 + assignee 放宽 + 乐观锁 + 伪角色），无高危 |
| 测试文档 | projects.test.js 存在；README/操作手册已同步基础功能 |

## 3. 澄清记录

- 迭代范围：**全维度**（功能补全 + 交互现代化 + 性能优化 + UI 增强，用户全选）
- 迭代组织：**单次全量升级**（A 方案），7 个 Task 顺序实施
- 执行方式：**subagent 驱动**（每 Task 独立派发，任务间审查）

## 4. 设计方案

### 4.1 架构与数据模型（零结构变更，向后兼容）

- 无新表、无字段增删，完全复用现有 10 张表
- **OVERDUE 动态判定**：查询层（任务列表/详情/看板/统计）统一返回 `status_eff`：`planned_date < CURDATE() 且 status ∈ (NOT_STARTED, IN_PROGRESS) → 视作 OVERDUE`。前端渲染/分组/筛选/统计一律用 `status_eff`。**不动存量 status 数据**，保留现有手动流转时 CAS 回写逻辑作兼容。
- **子任务→父任务进度联动**：子任务 COMPLETE 时同事务统计完成比例，回写父任务 `progress`（覆盖式）；父任务 DONE 仍 progress=100。
- **详情接口 JOIN**：新增 `getTaskDetail` DAO（JOIN projects.name + users.display_name），消除前端补查。

### 4.2 功能补全

| 缺失/不可用项 | 方案 |
|---|---|
| 任务创建入口缺失 | 看板页 + 列表页顶部「新建任务」按钮（看板选中项目自动带入；全部项目时表单必选项目） |
| 无「我的任务」 | 列表页「只看我的」开关 + 看板页「我的」切换（复用 assignee_id 过滤） |
| 依赖不可用 | 弹窗下拉选择同项目任务（显示标题+状态），后端补校验 `depends_on_id` 必须同项目 |
| 关联不可用 | 弹窗下拉 ref_type（样品/治具）+ 编号前缀搜索选择（`/api/samples?q=` / `/api/fixtures?search=`，限 10 条） |
| 编辑仅 2 字段 | 编辑表单补全：title/description/category/priority/assignee/planned_date/progress/solution/notes |
| 子任务受限 | 创建弹窗（标题/assignee/日期）+ 行内编辑/删除按钮 |
| 无任务删除入口 | 详情页「删除任务」按钮（confirm，后端已有级联+权限） |

### 4.3 交互现代化（prompt → 弹窗表单）

- 复用共享 `openModal()`（modal.js）+ fluent 组件（text-field/select/textarea/checkbox/button），带字段校验与错误行内提示
- 弹窗清单：新建任务 / 编辑任务（全字段）/ 加子任务 / 加依赖 / 关联对象 / 项目新建与编辑 / 成员管理（可搜索用户下拉）
- 全部替换 6 处 prompt()/confirm()（confirm 场景改用模态确认框）

### 4.4 性能优化

- 详情接口 JOIN：`GET /api/projects/tasks/:tid` 返回 `project_name`/`assignee_name`，删除前端补查（3 请求 → 1）
- 列表分页：`/api/projects/tasks` 支持 `limit/offset`（默认 50），**无参调用保持旧裸数组格式**（兼容第三方）；加参返回 `{rows,total}`；前端加分页器；导出 CSV 保持全量（§21 语义）
- 详情局部刷新：`tdLoad` 拆分区加载 `tdLoadSection(kind)`，评论/流转/子任务操作后仅刷新对应面板

### 4.5 UI 增强

- 看板卡片：进度条（progress%）+ 项目名标签（跨项目时显示所属项目）+ OVERDUE 红色左边框
- 详情页 tab 化：主信息卡常驻顶部，下方 tabs（子任务/评论/附件/关联/日志），每 tab 徽章计数
- workflow 管理页表单化（label/color 输入 + 保存校验 + 说明文案）
- 列表行内操作：行尾「流转」快捷按钮（开始/完成，按状态动态显示）

## 5. Task 拆分与执行顺序

| Task | 内容 | 依赖 |
|---|---|---|
| 1 | 后端数据层：getTaskDetail JOIN DAO + status_eff 动态判定 + 子任务进度联动 + 同项目依赖校验 | — |
| 2 | 后端分页兼容（limit/offset，无参保持裸数组）+ 详情接口接入 JOIN | 1 |
| 3 | 测试增补：status_eff / 联动 / 同项目校验 / JOIN / 分页 / 我的任务（projects.test.js） | 1,2 |
| 4 | 前端交互现代化：新建/编辑任务、项目、子任务、依赖、关联、成员管理弹窗（prompt 全替换） | 2 |
| 5 | 前端功能入口：看板/列表「新建任务」+「我的」筛选 + 详情删除任务 | 4 |
| 6 | 前端性能+UI：详情分区加载 + 列表分页器 + 看板进度/项目标签 + 详情 tab 化 + workflow 表单化 | 4,5 |
| 7 | bundle 重建 + E2E 回归 + 文档同步（README/操作手册 + 容量报告） | 4,5,6 |

## 6. 测试策略

- 后端：projects.test.js 增补（status_eff 动态判定、子任务进度联动、同项目依赖校验、详情 JOIN 字段、分页结构、我的任务过滤）
- 前端：bundle 重建（§19）+ browser_use E2E（新建任务→编辑→依赖→关联→流转→我的任务→分页→小屏响应式）
- 上线保护：projects 未上线（manifest 无 deployed），测试可全量执行

## 7. 风险与兼容

- `status_eff` 仅新增返回字段，不删旧值，旧调用方不受影响
- `/api/projects/tasks` 无参调用保持裸数组格式，加参才返回分页结构（兼容第三方）
- 前端改动全量 rebuild bundle（§19.4）
- 仅改 projects 子系统，samples/fixtures/workbench 不动（§6.1 隔离），共享文件（modal.js/app.css 若引用）需双系统回归

## 8. 变更记录

| 版本 | 日期 | 内容 |
|---|---|---|
| v1 | 2026-08-06 | 初稿：全维度评审 + 全量升级方案（用户确认范围/组织/执行方式） |
