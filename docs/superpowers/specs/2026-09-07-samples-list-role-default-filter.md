# 样品列表角色相关置顶（2026-09-07，排序版 v3）

## 演进

1. v1（方案A+B 角色列集，c10b0af）：全员全量仅呈现差异化 → 用户指出理解偏差，revert（8713175）。
2. v2（scope=role 服务端筛选，429f1d1）：角色相关数据 WHERE 过滤 → 用户反馈**空态问题**（QA/新研发打开列表空白但实际有待办），不符合"优先显示"本意。
3. **v3（当前，排序置顶版）**：scope 条件从 WHERE 挪到 ORDER BY——相关样品置顶、其余最新跟后，**数据全可见、空态不可能**。用户确认去掉提示芯片（更简洁）。

## 最终口径（ORDER BY 置顶表达式）

| 角色 | 置顶条件 | 其余 |
|---|---|---|
| RD | `created_by = uid DESC` | 最新优先 |
| QA | `status IN (PRODUCED,RETURNING) OR (IN_CUSTODY 且复检<7天) DESC` | 最新优先 |
| CUSTODY / ME | `status IN (IN_CUSTODY,CHECKED_OUT,RETURNING) DESC` | 最新优先 |
| ADMIN / 未知 | 不加 | 最新优先 |

## 设计

- **dao-list.js**：`role_scope_role/role_scope_uid` 从 `_listWhere`（已移除）迁至 `_listOrderBy`，表达式内联安全值（uid parseInt 强转，其余为常量字符串），`_listWhere`/`countAllSamples` 恢复与拆分前一致（计数口径=全量）。
- **routes-samples.js**：`_sampleFilterOpts` 照旧注入 `role_scope_*`（仅注释更新语义）；无 scope 参数行为与旧版完全一致；导出同口径。
- **前端**：list.js 进入列表（非 ADMIN、无深链）发 `scope=role` 一次；不再有芯片/粘性/清除逻辑（`loadSamples()` 主动加载即回默认最新优先）；list-filter.js 删除角色芯片块，保留 `_roleStatusLabel` 供多状态芯片显示。

## 验证

- E2E（真实 DB 只读）：五角色 total 恒=全量 60（数据不隐藏）、置顶前缀断言全过、无 scope 回归通过。
- 上线：前端 bundle v=bmtqt4ot2 硬刷新生效；后端需宝塔重启。
- 回滚：单 commit revert + 重建 bundle；或 git revert 429f1d1 退回筛选版（保留在历史）。
