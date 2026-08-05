# 治具双人验证权限修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended). Steps use checkbox syntax.

**Goal:** VERIFY_ORG 开放给申请单位人员 + 双人验证防同一人重复

**Architecture:** 2 文件 3 处修改：allowedActions 条件、doVerifyRD 同人校验、doVerifyOrg 权限+同人校验

**Tech Stack:** Node.js + Express + MariaDB

---

### Task 1: fixture-helpers.js — VERIFY_ORG 权限修正

**Files:**
- Modify: `routes/fixture-helpers.js:28`

- [ ] **Step 1: 改 VERIFY_ORG 条件**

当前（第 28 行）：
```js
if (isMECustodyQA(role) && (status === 'VERIFY_PENDING' || status === 'VERIFY_RD_OK')) actions.push('VERIFY_ORG');
```

改为：
```js
if ((isMECustodyQA(role) || user.dept === fixture.requested_dept) && (status === 'VERIFY_PENDING' || status === 'VERIFY_RD_OK')) actions.push('VERIFY_ORG');
```

- [ ] **Step 2: 删除未使用的 isVerifyOrg 函数**

如果 `isVerifyOrg` 不再被任何地方调用，删除它（第 13-16 行）。Grep 确认无调用方后删除。

- [ ] **Step 3: 验证语法**

Run: `node -c routes/fixture-helpers.js`

---

### Task 2: fixture-actions-make.js — 双人验证防同一人

**Files:**
- Modify: `routes/fixture-actions-make.js:17-18,26-28`

- [ ] **Step 1: doVerifyRD 末尾追加同人校验**

在第 18 行 `updated.status = ...` 之后，在 if(updated.status === 'TRANSFERRED') 之前，添加：

```js
if (f.verified_me && f.verified_me === u.id) throw { status: 400, message: '您已完成申请单位确认，不能再次作为RD验证。请另一位RD同事操作' };
```

完整上下文：
```js
async function doVerifyRD(updated, u, ts, f, note) {
  updated.verified_rd = u.id; updated.verified_rd_at = ts; updated.verify_note = note || '';
  if (f.verified_me && f.verified_me === u.id) throw { status: 400, message: '您已完成申请单位确认，不能再次作为RD验证。请另一位RD同事操作' };
  updated.status = f.status === 'VERIFY_ORG_OK' ? 'TRANSFERRED' : 'VERIFY_RD_OK';
  // ... 后续不变
```

- [ ] **Step 2: doVerifyOrg 改权限校验 + 追加同人校验**

当前第 27-28 行：
```js
  if (u.role !== 'RD' && u.dept !== f.requested_dept) {
    throw { status: 403, message: '验证需要 RD 与 申请单位（' + f.requested_dept + '）共同完成' };
  }
```

改为：
```js
  var canVerify = u.dept === f.requested_dept || u.role === 'ME' || u.role === 'QA' || u.role === 'CUSTODY';
  if (!canVerify) throw { status: 403, message: '需要申请单位(' + f.requested_dept + ')或治具管理方(ME/QA/CUSTODY)执行验证' };
  if (f.verified_rd && f.verified_rd === u.id) throw { status: 400, message: '您已完成RD验证，不能再次作为申请单位确认。请另一位同事操作' };
```

- [ ] **Step 3: 验证语法**

Run: `node -c routes/fixture-actions-make.js`

---

### Task 3: 最终验证

- [ ] **Step 1: 全量语法检查**

```bash
node -c routes/fixture-helpers.js && node -c routes/fixture-actions-make.js && echo 'all OK'
```

- [ ] **Step 2: 重启服务**

```bash
pm2 restart sample-mgmt
```

- [ ] **Step 3: 手动验证**

| 用例 | 预期 |
|---|---|
| 申请单位普通用户扫描 VERIFY_PENDING 治具 | 出现「确认治具」按钮 |
| 申请单位普通用户扫描 VERIFY_RD_OK 治具 | 出现「确认治具」按钮 |
| RD 先做 VERIFY_RD，同一 RD 再做 VERIFY_ORG | 拒绝「您已完成RD验证」 |
| 申请单位先做 VERIFY_ORG，同一人再做 VERIFY_RD | 拒绝「您已完成申请单位确认」 |
| ME 扫描 VERIFY_PENDING | 出现「确认治具」按钮（治具管理方） |
| 非申请单位非管理方扫描 VERIFY_PENDING | 仅出现 RD 的「RD验证」按钮 |
