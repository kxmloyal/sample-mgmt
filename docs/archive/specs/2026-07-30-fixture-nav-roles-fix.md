# 治具导航菜单角色权限修复 — 设计文档

> 日期：2026-07-30 | 状态：已确认

## 问题

`buildFixtureNav()` 中角色判断逻辑有误：
- QA/CUSTODY 与 ME 同权，但后端 `allowedActions` 未覆盖
- ADMIN 被排除在新建申请之外
- 导航菜单未按角色权限正确显示

## 修复

### 1. 菜单 (fixture-api.js `buildFixtureNav`)

所有角色统一显示：看板 | 治具清单 | 新建申请 | 扫码台，ADMIN 额外显示操作日志。

```js
// 去掉 me.role !== 'ADMIN' 条件，所有角色都有新建申请
```

### 2. 操作权限 (routes/fixtures.js `allowedActions`)

`role === 'ME'` 扩展为 `role === 'ME' 或 role === 'QA' 或 role === 'CUSTODY'`。

## 影响范围

| 文件 | 改动 |
|---|---|
| `public/js/fixture-api.js` | `buildFixtureNav()` 去除 ADMIN 排除条件 |
| `routes/fixtures.js` | `allowedActions()` ME → ME/QA/CUSTODY |

不影响样品子系统。
