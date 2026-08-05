# 治具管理系统设计文档

> 日期：2026-07-30 | 状态：已实现 | 最后更新：2026-07-30（同步代码实际状态）

## 1. 需求概述

为「制造品质管理系统」新增治具管理子系统，覆盖治具从申请到报废的全生命周期。

## 2. 设计决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 实现方案 | A — 独立子应用 fixture.html | 与样品系统解耦，文件小巧，边界清晰 |
| 角色体系 | 共用现有角色 | RD/ME/QA/CUSTODY/ADMIN，QA和CUSTODY权限等同ME |
| 技术栈 | 原生 HTML/CSS/JS + Express + MariaDB | 与现有系统一致 |
| 登录 | 共用 session cookie | 同一域名，登录态自动共享 |

## 3. 状态机

```
申请 ─→ 制作 ─→ 验证移交(RD+ME双人扫码)
                      │
   ┌──────────────────┤
   ↓                  ↓
 领用 ←───────────  移交
   │                 ↑
   ├─ ME自行维修 ────┤
   └─ 退回RD→RD修→ME确认 ┘
   │
   ↓
 报废
```

**状态枚举**（10 态，实际实现中移除了未使用的 IN_PROGRESS）：
- `REQUESTED` — 已申请，待制作
- `VERIFY_PENDING` — 制作完成，待双人验证移交
- `VERIFY_RD_OK` — RD已确认，待ME确认
- `VERIFY_ME_OK` — ME已确认，待RD确认
- `TRANSFERRED` — 已移交，可领用
- `IN_USE` — 领用中
- `REPAIRING_ME` — ME自行维修中
- `REPAIRING_RD` — 退回RD维修中
- `REPAIR_DONE` — 维修完成，待ME确认
- `RETIRED` — 已报废

## 4. 角色操作权限

> QA 和 CUSTODY 在实际实现中权限等同于 ME（共同负责验证移交/领用/报修/维修确认）。

| 状态 | RD | ME / QA / CUSTODY | ADMIN |
|---|---|---|---|
| REQUESTED | 制作 | — | — |
| VERIFY_PENDING | 确认验证 | 确认验证 | — |
| VERIFY_RD_OK | — | 确认验证 | — |
| VERIFY_ME_OK | 确认验证 | — | — |
| TRANSFERRED | — | 领用 | — |
| IN_USE | — | 自行维修/退回RD | 报废 |
| REPAIRING_ME | — | 维修完成 | — |
| REPAIRING_RD | 维修完成 | — | — |
| REPAIR_DONE | — | 确认 | 报废 |
| RETIRED | — | — | —（终态） |

## 5. 数据表设计

### fixtures 表

```sql
CREATE TABLE fixtures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fixture_no VARCHAR(20) NOT NULL UNIQUE,    -- FJ-000001
  name VARCHAR(200) NOT NULL,                 -- 治具名称
  spec VARCHAR(200),                          -- 规格
  model VARCHAR(100),                         -- 型号
  station VARCHAR(100),                       -- 对应工站
  category VARCHAR(50),                       -- 类型
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  -- 申请
  requested_by INT,                           -- 申请人 user.id
  requested_dept VARCHAR(50),                 -- 申请部门
  request_note TEXT,                          -- 申请说明
  request_image VARCHAR(300),                 -- 申请附图
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 制作
  made_by INT,                                -- 制作人
  made_at DATETIME,
  made_note TEXT,
  made_image VARCHAR(300),
  -- 验证移交
  verified_rd INT,                            -- RD确认人
  verified_rd_at DATETIME,
  verified_me INT,                            -- ME确认人
  verified_me_at DATETIME,
  transferred_at DATETIME,
  verify_note TEXT,
  -- 领用
  used_by INT,                                -- 领用人
  used_at DATETIME,
  use_location VARCHAR(100),                  -- 使用位置
  expected_return_days INT DEFAULT NULL,      -- 预计使用天数（领用时必填）
  expected_return_at DATETIME DEFAULT NULL,   -- 预计归还时间（由天数自动计算）
  use_note TEXT,                              -- 领用说明
  -- 维修
  repair_type VARCHAR(10),                    -- 'ME' / 'RD'
  repair_requested_by INT,                    -- 报修人
  repair_requested_at DATETIME,
  repair_note TEXT,
  repaired_by INT,                            -- 维修人
  repaired_at DATETIME,
  repair_done_image VARCHAR(300),
  repair_confirmed_by INT,                    -- ME确认人
  repair_confirmed_at DATETIME,
  -- 报废
  retired_by INT,                             -- 报废操作人
  retired_at DATETIME,
  retired_reason TEXT,
  -- 通用
  notes TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### fixture_logs 表

```sql
CREATE TABLE fixture_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fixture_id INT NOT NULL,
  action VARCHAR(30) NOT NULL,
  role VARCHAR(20),
  user_id INT,
  dept VARCHAR(50),
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 6. 文件结构

| 文件 | 操作 | 实际行数 | 说明 |
|---|---|---|---|
| `public/fixture.html` | 新建 | 58 | 治具 SPA 入口（侧栏导航 + 主内容区 + toast） |
| `public/js/fixture-api.js` | 新建 | 78 | API 封装 + 鉴权 + 常量 + 导航构建 + ACTION_CN 字典 |
| `public/js/fixture-dashboard.js` | 新建 | 36 | 看板（统计 + 逾期 + 待办） |
| `public/js/fixture-list.js` | 新建 | 90 | 清单（筛选/搜索/逾期高亮）+ 新建表单 + 详情弹窗 |
| `public/js/fixture-scan.js` | 新建 | 86 | 扫码台（解析 + 状态机 + 操作日志） |
| `public/js/fixture-router.js` | 新建 | 36 | 页面哈希路由（5 个视图） |
| `routes/fixtures.js` | 新建 | 245 | 后端路由（7 API + 完整状态机 + 用户名解析） |
| `db/fixtures.js` | 新建 | 57 | 数据访问层（工厂模式 8 方法） |
| `server.js` | 修改 | — | 注册 fixtures 路由 |
| `db.js` | 修改 | — | 新增 fixtures + fixture_logs 建表 |
| `public/portal.html` | 修改 | — | 治具卡片从 disabled 改为可点击 |

## 7. API 端点

```
POST   /api/fixtures              — 新建申请
GET    /api/fixtures              — 清单（支持筛选）
GET    /api/fixtures/:id          — 详情
POST   /api/fixtures/scan         — 扫码状态机（统一入口）
GET    /api/fixtures/dashboard    — 看板数据
GET    /api/fixtures/logs         — 操作日志
```

## 8. 双人扫码逻辑

验证移交需 RD + ME 双人扫码：

1. 治具状态 `VERIFY_PENDING` → RD 扫码 → 状态变为 `VERIFY_RD_OK`
2. 治具状态 `VERIFY_RD_OK` → ME 扫码 → 状态变为 `TRANSFERRED`
3. 反之亦然：ME 先扫 → `VERIFY_ME_OK` → RD 补扫 → `TRANSFERRED`

## 9. 维修分支

- **ME 自行维修**：ME 扫码 IN_USE → 填写维修说明 → `REPAIRING_ME` → ME 修完扫码 → `TRANSFERRED`
- **退回 RD 维修**：ME 扫码 IN_USE → 选择「退回RD」→ `REPAIRING_RD` → RD 修完扫码 → `REPAIR_DONE` → ME 确认 → `TRANSFERRED`

## 10. 领用逾期提醒

- 领用时强制填写「预计使用天数」（≥1天）
- 系统自动计算 `expected_return_at = used_at + expected_return_days`
- 看板待办中展示逾期未归还的治具（`expected_return_at < NOW()` 且状态为 `IN_USE`）
- 治具清单列表中逾期行高亮标红，与样品复检逾期逻辑一致

## 11. 验收标准

- [x] 门户页治具卡片可点击进入 fixture.html
- [x] 新建申请 → 填写名称/规格/部门/说明
- [x] RD 扫码制作 → 上传照片
- [x] RD + ME 双人扫码完成验证移交
- [x] ME/QA/CUSTODY 扫码领用（强制填写预计使用天数，到点逾期高亮提醒）
- [x] 领用中可报修（自行/退回RD）
- [x] 维修后 ME/QA/CUSTODY 确认回到移交
- [x] ADMIN 可执行报废
- [x] 操作日志完整记录（含中文 ACTION_CN 字典）
- [x] 响应式：手机/平板/桌面正常

## 12. 实现后追加功能（超出原始设计）

| 功能 | 说明 |
|---|---|
| 操作日志中文显示 | ACTION_CN 前端字典，REPAIR_RD_DONE/CANCEL 等显示为中文 |
| 治具详情弹窗 | 清单行点击弹出 modal，显示完整字段 + 关联用户真实姓名 |
| 部门筛选 | 清单筛选栏支持按申请部门过滤 |
| 返回门户链接 | 侧栏底部「← 返回门户」跳转 portal.html |
| 用户姓名解析 | 详情接口自动将 created_by/verified_rd 等 ID 转为 display_name |
| 导航菜单对齐 | 与样品系统统一使用 button 标签 + CSS 高亮 |
| E2E 回归测试 | 全流程 13 用例通过 |
