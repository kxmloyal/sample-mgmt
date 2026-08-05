# 样品列表筛选功能优化 — 设计文档

> 状态：已确认 | 日期：2026-07-23

## 1. 目标

增强样品列表筛选能力，从当前"搜索+状态下拉"扩展为完整筛选面板，覆盖用户选定的 4 项优化方向：**debounce 搜索体验 / 更多筛选维度 / 排序 / 快捷预设**。采用**展开型（方案 B）**布局。

## 2. 筛选栏布局（方案 B：展开型）

### 第一行：筛选控件（始终可见）

| 控件 | 类型 | 选项 | 触发方式 |
|---|---|---|---|
| 搜索框 | input | 自由输入 | debounce 300ms 自动搜索 |
| 状态下拉 | select | 全部 / 待制作 / 制作完成 / 已发行 / 保管中 | onChange 即搜 |
| 部门下拉 | select | 全部 / 研发中心 / 品保文管中心 / 制造部 / FQC / 生技部 | onChange 即搜 |
| 排序下拉 | select | 最新优先 / 最早优先 / 编号升序 / 编号降序 | onChange 即搜 |
| 查询按钮 | button | — | 手动触发（兜底） |

### 第二行：快捷预设 + 激活标签（始终可见）

- **快捷预设**（点击即搜，角色感知）：
  - "待处理" → 根据当前用户角色设定状态：RND→NEW / QA→PRODUCED / CUSTODY→RELEASED / ADMIN→不传（看全部）
  - "逾期" → overdue=1（status=IN_CUSTODY 且 next_inspect_at < now）
  - "近7天" → overdue=7（next_inspect_at 距现在 ≤7 天，含逾期）
- **激活标签**（动态 chip）：显示当前激活的筛选条件，点击 × 移除并刷新

## 3. 后端 API 扩展

```
GET /api/samples?q=&status=&dept=&sort=&overdue=
```

| 参数 | 类型 | 说明 | 兼容性 |
|---|---|---|---|
| q | string | 已有：模糊搜索 sample_no/name/spec | 不变 |
| status | string | 已有：单状态筛选 | 不变 |
| dept | string | **新增**：按 custody_dept 筛选 | 可选，不传不过滤 |
| sort | string | **新增**：排序（-created_at / created_at / -sample_no / sample_no） | 可选，默认 -id |
| overdue | string | **新增**：逾期筛选（1=已逾期 / 7=7天内到期） | 可选，不传不过滤 |

## 4. 数据库层变更（db.js → listSamples）

`listSamples` 函数新增 3 个参数支持：

```js
function listSamples({ status, dept, search, sort, overdue } = {}) {
  // dept 筛选：WHERE custody_dept = ?
  // overdue 筛选：WHERE status='IN_CUSTODY' AND next_inspect_at < now() / < now()+7d
  // sort 排序：ORDER BY 动态替换
}
```

## 5. 前端变更（public/index.html）

### 5.1 viewSamples 函数重写

- 渲染两行筛选栏（控件行 + 快捷预设行）
- 绑定 debounce 搜索（300ms setTimeout）
- select onChange 直接调 loadSamples
- 快捷预设点击 → 设置对应参数 → loadSamples

### 5.2 loadSamples 函数增强

- 读取所有筛选参数构建 API URL
- 渲染激活标签 chip（如 "NEW"、"研发中心"）
- chip 点击 × → 清除对应筛选 → reload

### 5.3 代码增量估计

| 函数 | 增量 |
|---|---|
| viewSamples（重写） | ~30 行 |
| loadSamples（增强） | ~15 行 |
| 新增 debounce 工具 | ~5 行 |
| 新增芯片渲染 | ~10 行 |
| **合计** | **~60 行** |

## 6. 容量警告

`public/index.html` 当前 ~552 行（92%），新增 60 行后将达 **~612 行（102%）**，超出 600 行上限。

**必须在变更前精简**，精简方案：
1. 合并冗余 CSS 规则（单行化、去重）：预计回收 20 行
2. 压缩 HTML 模板字符串（减少换行）：预计回收 10 行
3. 删除未使用的 CSS 类和注释：预计回收 10 行
4. 精简 router/NAV 初始化逻辑：预计回收 10 行

目标：先精简 ~50 行 → 腾出空间 → 再新增 ~60 行 → 最终 ~562 行（93%）。

## 7. 修改清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| public/index.html | 修改 | 筛选栏重写 + debounce + 芯片 + 精简 |
| server.js | 修改 | /api/samples 路由新增参数解析 |
| db.js | 修改 | listSamples 新增 dept/sort/overdue 支持 |
| tests/samples.test.js | 修改 | 新增筛选/排序测试用例 |
