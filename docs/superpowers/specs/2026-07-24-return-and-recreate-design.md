# 样品二次操作与退回重发流程 — 设计文档

> 创建日期：2026-07-24 | 状态：已确认

## 一、需求背景

当前状态机仅支持「正向流转」：`NEW → PRODUCED → RELEASED → IN_CUSTODY`。RELEASED 之后的二次操作（修正标示卡、提前复检、退回重发、作废替换）完全缺失。

## 二、新增状态

| 状态 | 含义 | 谁触发 | 下一状态 |
|---|---|---|---|
| `RETURNING` | 退回审核中 | 保管申请退回 | 品保审核后分流 |
| `RETIRED` | 已作废（生命周期结束） | 品保确认作废 | 终态 |

## 三、完整状态机

```
正向流转（不变）：
  NEW ──PRODUCE(RD/ME)──→ PRODUCED ──RELEASE(QA)──→ RELEASED ──CUSTODY(保管)──→ IN_CUSTODY

新增路径：
  RELEASED ──INSPECT(QA,不限到期)──→ RELEASED（复检日顺延）
  RELEASED ──EDIT_CARD(QA)──→ RELEASED（修正标示卡+打印）
  IN_CUSTODY ──EDIT_STORAGE(保管)──→ IN_CUSTODY（修改储位，不经过品保）
  IN_CUSTODY ──RETURN_REQ(保管)──→ RETURNING（退回待品保审核）
    RETURNING ──RE_RELEASE(QA)─────→ RELEASED（修改标示卡+新周期后重新发行）
    RETURNING ──RETIRE_RECREATE(QA)─→ RETIRED（指派RD建替代品）
    RETURNING ──RETIRE_ONLY(QA)─────→ RETIRED（直接作废，不建替代品）
    RETURNING ──REJECT(QA)──────────→ IN_CUSTODY（拒绝退回，恢复原状）
    RETURNING(已指派RD) ──RECREATE(RD)──→ 新建替代样品(SM-XXXXXX, NEW)
```

## 四、actionForRole 映射表

```js
function actionForRole(role, status, next_inspect_at, retire_assigned_rd) {
  // 正向流转（不变）
  if ((role === 'RD' || role === 'ME') && status === 'NEW') return 'PRODUCE';
  if (role === 'QA' && status === 'PRODUCED') return 'RELEASE';
  if (role === 'CUSTODY' && status === 'RELEASED') return 'CUSTODY';

  // 新增：复检（不限到期）
  if (role === 'QA' && status === 'RELEASED') return 'INSPECT';

  // 新增：QA 扫 RELEASED 可选择修正标示卡（前端多选）
  // 新增：保管修改储位
  if (role === 'CUSTODY' && status === 'IN_CUSTODY') return 'EDIT_STORAGE';

  // 新增：保管申请退回
  if (role === 'CUSTODY' && status === 'IN_CUSTODY') return 'RETURN_REQ';
  //   ↑ 注意：与 EDIT_STORAGE 冲突，前端需给 CUSTODY 扫 IN_CUSTODY 时提供两个按钮选择

  // 新增：品保审核退回（多分支，通过 req.body.action 区分）
  if (role === 'QA' && status === 'RETURNING') return 'REVIEW_RETURN';

  // 新增：RD 重做替代品
  if ((role === 'RD' || role === 'ME') && status === 'RETURNING' && retire_assigned_rd == currentUserId) return 'RECREATE';

  return null;
}
```

### 前端二级选择

| 扫码结果 | 按钮 |
|---|---|
| QA + RELEASED | **「复检」** / **「修正标示卡」** |
| CUSTODY + IN_CUSTODY | **「修改储位」** / **「申请退回」** |

## 五、各 Action 详细设计

### 5.1 INSPECT（去到期限制）

**改动**：`actionForRole` 中删除 `&& new Date(next_inspect_at) <= now` 条件。

**前端**：复用现有 INSPECT 表单。未到期时增加黄色提示：
> ⚠ 提前复检 — 距下次复检到期还有 X 天

**后端**：逻辑不变（照片必填 + 标示卡选填 + 周期顺延 + `valid_until = next_inspect_at`）。

日志：到期→`INSPECT`，未到期→`INSPECT_EARLY`。

### 5.2 EDIT_CARD（修正标示卡）

**触发**：QA 扫 RELEASED → 选择「修正标示卡」。

**前端**：复用 `buildCardFieldTable` 组件，解除锁定（RELEASED 状态下所有字段可编辑）。底部按钮：「保存修正 + 重新打印标示卡」。

**后端**：`POST /api/scan` body 中 `{ code, action: 'EDIT_CARD', sample_type, limit_item, source_type, card_version, test_data }`。仅更新标示卡字段，`status` 保持 RELEASED。日志 `EDIT_CARD`。

### 5.3 EDIT_STORAGE（保管修改储位）

**触发**：保管扫 IN_CUSTODY → 选择「修改储位」。

**前端**：显示当前储位 + 新储位输入框 + 确认按钮。

**后端**：`POST /api/scan` body `{ code, action: 'EDIT_STORAGE', location }`。仅更新 `storage_location`，状态不变。日志 `EDIT_STORAGE`。

### 5.4 RETURN_REQ（保管申请退回）

**触发**：保管扫 IN_CUSTODY → 选择「申请退回」。

**前端**：退回原因输入框（必填）+「提交退回申请」按钮。

**后端**：`POST /api/scan` body `{ code, action: 'RETURN_REQ', note }`。状态变化 `IN_CUSTODY → RETURNING`，记录退回原因到 `notes`。日志 `RETURN_REQUEST`。

### 5.5 REVIEW_RETURN（品保审核退回 — 多分支）

**触发**：QA 扫 RETURNING。

**前端**：显示退回原因 + 4 个操作按钮：

| 按钮 | action 值 | 表单 |
|---|---|---|
| 重新发行 | `RE_RELEASE` | 标示卡字段（可编辑）+ 复检周期 |
| 退回研发重做 | `RETIRE_RECREATE` | 选择 RD 人员（下拉）+ 备注 |
| 直接作废 | `RETIRE_ONLY` | 备注（必填） |
| 拒绝退回 | `REJECT` | 拒绝理由（必填） |

**后端**：`POST /api/scan` body `{ code, action, ... }`。

各分支处理：
- `RE_RELEASE`：更新标示卡字段 + 签名 + 周期 → `RETURNING → RELEASED` + 打印。日志 `RE_RELEASE`。
- `RETIRE_RECREATE`：指派 RD（`retire_assigned_rd`）→ `RETURNING → RETIRED`。日志 `RETIRE_RECREATE`。
- `RETIRE_ONLY`：`RETURNING → RETIRED`。日志 `RETIRE_ONLY`。
- `REJECT`：`RETURNING → IN_CUSTODY`（恢复原保管信息）。日志 `RETURN_REJECT`。

### 5.6 RECREATE（RD 建替代品）

**触发**：RD 扫 RETURNING（`retire_assigned_rd` == 自己）。

**前端**：显示旧样品摘要 + 「确认创建替代品」按钮。点击后 → POST `/api/scan` → 返回 `{ sample: newSample }` → 弹出标签打印。

**后端**：`POST /api/scan` body `{ code, action: 'RECREATE' }`。
1. 从旧样品复制标示卡字段 + `replaces = old.sample_no`
2. 调用 `D.createSample({ ... })` 创建新样品（编号自动分配 `SM-XXXXXX`）
3. 更新旧样品：`replaced_by = new.sample_no`
4. 日志：旧样 `RECREATE_REPLACED`，新样 `CREATE`

## 六、数据库变更

### 6.1 samples 表新增列

| 列名 | 类型 | 说明 |
|---|---|---|
| `retired_reason` | TEXT | 作废原因 |
| `replaced_by` | TEXT | 替代品编号（新样 SM-XXXXXX） |
| `replaces` | TEXT | 替代的原样编号 |
| `retire_assigned_rd` | TEXT | 指派的 RD 用户 display_name |

### 6.2 迁移

```sql
ALTER TABLE samples ADD COLUMN retired_reason TEXT;
ALTER TABLE samples ADD COLUMN replaced_by TEXT;
ALTER TABLE samples ADD COLUMN replaces TEXT;
ALTER TABLE samples ADD COLUMN retire_assigned_rd TEXT;
```

## 七、首页概览变更

### 7.1 byStatus 统计补充

```js
const byStatus = { NEW:0, PRODUCED:0, RELEASED:0, IN_CUSTODY:0, RETURNING:0, RETIRED:0 };
```

### 7.2 我的待办新增筛选

```js
if (u.role === 'QA') {
  myPending = [
    ...all.filter(s => s.status === 'PRODUCED'),
    ...all.filter(s => s.status === 'RETURNING')  // 新增：待审核退回
  ];
}
if (u.role === 'RD' || u.role === 'ME') {
  myPending = [
    ...all.filter(s => s.status === 'NEW'),
    ...all.filter(s => s.status === 'RETURNING' && s.retire_assigned_rd === u.display_name)  // 新增：待重做
  ];
}
```

## 八、文件变更清单

| 文件 | 变更类型 | 内容 |
|---|---|---|
| `db.js` | 改 | 新增 4 列迁移 |
| `db/samples.js` | 改 | `createSample` 支持 `replaces` 参数 |
| `routes/scan.js` | **重点** | `actionForRole` 重写 + 新增 6 个 action 处理 |
| `routes/misc.js` | 改 | 看板补充 RETURNING 统计 + 待办筛选扩展 |
| `public/js/scan.js` | **重点** | `CUSTODY + IN_CUSTODY` 双按钮 + `QA+RELEASED` 双按钮 + `REVIEW_RETURN` 4分支渲染 + `RECREATE` 渲染 |
| `public/js/scan-wizard.js` | 改 | `RE_RELEASE` 分支复用 RELEASE 向导 |
| `public/js/card-fields.js` | 改 | `buildCardFieldTable` 支持 `forceEditable` 参数（EDIT_CARD 时强制可编辑） |
| `public/js/dashboard.js` | 改 | 待办类型 label 补充「待审核退回」「待重做」 |
| `public/js/constants.js` | 改 | `STATUS` 对象补充 RETURNING/RETIRED label |

**无新增文件**。

## 九、兼容性

| 项 | 处理 |
|---|---|
| 旧数据无新列 | SQLite ALTER TABLE 自动 NULL，`retire_assigned_rd` NULL 时不匹配 |
| `actionForRole` 签名变更 | 新增参数 `retire_assigned_rd`（可选，默认 null） |
| `/api/resolve` 返回 | 新增 `retire_assigned_rd` 字段 |
| 前端多按钮 | `ACTION_LABEL` 扩展，不破坏现有单按钮逻辑 |

## 十、验证清单

- [ ] QA 扫已到期 RELEASED → INSPECT（正常复检，不改已有行为）
- [ ] QA 扫未到期 RELEASED → 双按钮 → 选「复检」→ INSPECT_EARLY
- [ ] QA 扫未到期 RELEASED → 双按钮 → 选「修正标示卡」→ EDIT_CARD → 打印
- [ ] 保管扫 IN_CUSTODY → 双按钮 → 选「修改储位」→ 储位更新
- [ ] 保管扫 IN_CUSTODY → 双按钮 → 选「申请退回」→ RETURNING
- [ ] QA 扫 RETURNING → 4 按钮：RE_RELEASE / RETIRE_RECREATE / RETIRE_ONLY / REJECT
- [ ] RD 看首页待办 → 点「待重做」→ 扫码台 → RECREATE → 新样品创建 + 打印
- [ ] 新样品 replaces = 旧编号，旧样品 replaced_by = 新编号
- [ ] `db.js` 新列迁移执行无误（含幂等，重复迁移不报错）
