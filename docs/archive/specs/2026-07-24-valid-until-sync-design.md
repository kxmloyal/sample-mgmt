# 有效期自动同步复检日 — 设计文档

> 日期：2026-07-24 | 状态：已确认

## 一、背景

当前系统存在两个独立日期：`valid_until`（标示卡有效期，手动填写）和 `next_inspect_at`（复检日，品保发行时自动计算）。两套日期容易不一致，例如：

- 实物已复检但标示卡仍显示过期
- 有效期填错→标示卡过期但复检日远未到

用户需求：**有效期等于复检日，自动同步，不再手动维护**。

## 二、设计方案

### 2.1 核心规则

1. `valid_until = next_inspect_at`，由后端自动填充，前端不再提供输入
2. 品保发行时，`valid_until` 自动设为计算出的 `next_inspect_at`
3. 品保复检时，`valid_until` 自动顺延到新的 `next_inspect_at`
4. 旧数据 `valid_until` 保留不动，下次复检时自动覆盖
5. 标示卡打印/显示逻辑不变（读 `valid_until`，过期红色标注）

### 2.2 数据流

```
品保发行(RELEASE)           品保复检(INSPECT)
  ↓                            ↓
cycleDays = 90        →  cycleDays(可选新值，默认沿用)
  ↓                            ↓
next_inspect_at               next_inspect_at
= today + 90天               = today + cycleDays
  ↓                            ↓
valid_until 自动覆盖          valid_until 自动覆盖
= next_inspect_at            = next_inspect_at
```

## 三、文件变更清单

### 3.1 前端：去掉有效期输入框

| 文件 | 变更 |
|---|---|
| `public/js/scan-wizard.js` | RELEASE Step2 标示卡字段表去掉「有效期」行 |
| `public/js/new.js` | 建样表单去掉有效期输入 |
| `public/js/detail.js` | 标示卡 Tab：有效期改为只读（显示复检日），仅当 `s.next_inspect_at` 存在时显示 |
| `public/js/card-fields.js` | `buildCardFieldTable` 移除有效期行 |

### 3.2 后端：自动填充 valid_until

| 文件 | 变更 |
|---|---|
| `routes/scan.js` RELEASE 分支 | `updated.valid_until = updated.next_inspect_at` |
| `routes/scan.js` INSPECT 分支 | 同上，复检后自动更新 valid_until |
| `routes/samples.js` PUT | 去掉 `valid_until` 参数消费，不再接受前端传值 |

### 3.3 不变

| 文件 | 说明 |
|---|---|
| `db/samples.js` | `valid_until` 列保留，CRUD SQL 不变 |
| `routes/cards.js` | 打印/查看页读取 `valid_until`，过期红色标注逻辑不变 |
| `db.js` | 迁移 SQL 不变 |

### 3.4 种子数据

| 文件 | 变更 |
|---|---|
| `seed.js` | 去掉手动 `valid_until`，建样时不传 |
| `seed-rich.js` | 同上 |

### 3.5 文档

| 文件 | 变更 |
|---|---|
| `docs/operation-manual.md` | 建样/标示卡相关章节去掉有效期手动填写说明 |

## 四、边缘情况

| 场景 | 处理 |
|---|---|
| 旧数据 valid_until 已有值 | 保留不动，下次复检自动覆盖 |
| valid_until 为空的历史样品 | 标示卡打印时不显示有效期行（不报错） |
| 发行后退回 PRODUCED→NEW | valid_until 保留，下次发行重新覆盖 |
| 没填复检周期 | 已有校验：周期 >0 必填，不会出现 null |
| 管理员修正 | 不再提供 UI。改周期→复检日变→有效期自动跟变 |

## 五、API 兼容性

| 接口 | 旧行为 | 新行为 |
|---|---|---|
| `POST /api/samples` | 可传 valid_until | 忽略传值，后端不存 |
| `PUT /api/samples/:id` | 可传 valid_until | 忽略传值 |
| `POST /api/scan` RELEASE | 可传 valid_until | 忽略传值，自动 = next_inspect_at |
| `POST /api/scan` INSPECT | 不涉及 | 自动更新 valid_until = new next_inspect_at |
| `GET /api/samples` | 返回 valid_until | 不变 |
| `GET /api/samples/:id` | 返回 valid_until | 不变 |
| `GET /card/:no` | 显示 valid_until | 不变 |

## 六、验证清单

- [ ] 新建样品：建样表单无有效期输入，API 不传 valid_until
- [ ] 品保发行：RELEASE 后 valid_until = next_inspect_at
- [ ] 品保复检：INSPECT 后 valid_until 随 next_inspect_at 自动顺延
- [ ] 标示卡打印：有效期正确显示复检日，过期红色标注正常
- [ ] 详情弹窗：标示卡 Tab 有效期只读显示复检日
- [ ] 旧数据兼容：历史样品的 valid_until 值不丢失
- [ ] 种子数据：seed/seed-rich 建样不传 valid_until
