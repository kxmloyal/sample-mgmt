# 样品列表筛选功能修复 — 设计文档

日期：2026-07-28

## 1. 问题诊断

### Bug 1：「近7天到期」筛选包含已逾期样品
- 根因：`db/samples.js` 中 `overdue==='7'` 的 SQL 条件为 `next_inspect_at < datetime('now','+7 days')`，匹配所有过去+未来7天
- 影响：用户点击「近7天」快捷链接，看到的结果里混杂了已逾期的样品
- 修复：改为 `next_inspect_at >= datetime('now') AND next_inspect_at < datetime('now','+7 days')`

### Bug 2：QA 角色「待处理」遗漏 RETURNING 状态
- 根因：`samples.js` quickFilter('pending') 中 QA 只设 `status=PRODUCED`，但看板正确包含 RETURNING
- 影响：品保用户点「待处理」看不到退回审核中的样品
- 修复：QA 待处理传 `PRODUCED,RETURNING`

### Bug 3：逾期/近7天筛选不支持标示卡字段联动
- 根因：`loadSamplesOverdue` 函数只传 `overdue + q + sort`，未传 `sample_type/limit_item/source_type`
- 影响：用户在逾期列表中切换标示卡类型筛选无效果
- 修复：补传全部筛选参数

### Bug 4：Chips 栏不显示逾期/近7天/待处理激活态
- 根因：`renderChips` 未检测 overdue/soon/pending 状态
- 影响：用户无法直观看到当前筛选类型，也无法一键清除
- 修复：新增 overdue/soon/pending 的 chip 渲染

### Bug 5：/api/samples 不支持多状态查询
- 根因：后端 `status` 参数按单值 `WHERE status = ?` 处理
- 影响：前端无法同时筛选多个状态（如 QA 需 PRODUCED + RETURNING）
- 修复：后端支持逗号分隔多状态 → `WHERE status IN (?,?)`

## 2. 变更前依赖清单

| 维度 | 依赖项 | 关联文件 |
|------|--------|---------|
| 代码 | API 路由参数解析 | routes/samples.js |
| 代码 | 数据库查询过滤 | db/samples.js |
| 代码 | 前端筛选逻辑 | public/js/samples.js |
| 接口 | /api/samples 出入参 | 前端 6 个消费点 |
| 文档 | 操作手册筛选说明 | docs/operation-manual.md |

## 3. 具体改动

### 3.1 db/samples.js（2处）

**状态参数支持多值：**
```js
// 当前
if (status) { where.push('status = ?'); params.push(status); }
// 改为
if (status) {
  const statuses = status.split(',').filter(Boolean);
  if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); }
  else { where.push('status IN (' + statuses.map(()=>'?').join(',') + ')'); params.push(...statuses); }
}
```

**近7天 SQL 修正：**
```js
// 当前
else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < datetime('now','+7 days')"); }
// 改为
else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= datetime('now') AND next_inspect_at < datetime('now','+7 days')"); }
```

### 3.2 public/js/samples.js（3处）

**quickFilter 中 QA 待处理补 RETURNING：**
```js
// 当前
if(type==='pending'){$('#f-status').value=me.role==='RD'?'NEW':me.role==='QA'?'PRODUCED':...}
// 改为：直接调用 loadSamples 跳过下拉框，传逗号分隔多状态
```

新增辅助函数直接传参：

```js
function filterByStatus(statusStr, dept){
  $('#f-status').value=''; $('#f-dept').value=dept||'';
  loadSamplesWithStatus(statusStr);
}
function loadSamplesWithStatus(statusStr){
  // 读取当前筛选框值，但强制用指定status
  var q=$('#f-q').value, tp=$('#f-type').value, li=$('#f-limit-item').value,
      src=$('#f-source').value, sort=$('#f-sort').value;
  var params='status='+statusStr;
  if(q) params+='&q='+encodeURIComponent(q);
  if(tp) params+='&sample_type='+tp;
  if(li) params+='&limit_item='+li;
  if(src) params+='&source_type='+src;
  if(sort) params+='&sort='+sort;
  // 渲染列表...
}
```

**loadSamplesOverdue 补传全部筛选参数：**
```js
// 当前：只传 overdue + q + sort
// 改为：传 overdue + q + sort + sample_type + limit_item + source_type
```

**renderChips 新增 overdue/soon/pending 检测：**
```js
// 当前：只检测 #f-status, #f-dept, #f-type, #f-limit-item, #f-source, #f-sort
// 新增：新增 overdue/soon/pending 全局状态变量，renderChips 读取并渲染对应 chip
```

### 3.3 routes/samples.js

无需改动（已正确透传 query 参数给 D.listSamples）。

## 4. 兼容性说明

- `status` 参数向前兼容：单值 `PRODUCED` 继续走 `status = ?`，多值 `PRODUCED,RETURNING` 走 `status IN (?,?)`
- 已有 API 调用方无 Breaking Change
- 前端新增 `loadSamplesWithStatus` 辅助函数，不删除原有函数

## 5. 回归验证

- [ ] 样品列表页面各状态单选筛选正常
- [ ] 「待处理」快捷链接 — RD 看到 NEW、QA 看到 PRODUCED+RETURNING、CUSTODY 看到 RELEASED
- [ ] 「逾期」快捷链接 — 只显示已过复检日期的样品，切换类型/项目/来源筛选联动正常
- [ ] 「近7天」快捷链接 — 只显示未来7天内到期的样品，不包含已逾期
- [ ] Chips 栏显示逾期/近7天/待处理标签，点击 ✕ 可清除
- [ ] 各状态数量与看板数据一致

## 6. 文件改动量

| 文件 | 行数 | 当前行数 | 改动后 |
|------|------|---------|--------|
| db/samples.js | +5/-1 | 82 | ~86 |
| public/js/samples.js | +25/-10 | 85 | ~100 |
