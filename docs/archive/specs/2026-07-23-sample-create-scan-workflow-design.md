# 建样-扫码流程优化：照片后置 + 条码补打 + 复检拍照

> **状态：已确认** | **关联计划：待生成**

## 1. 目标

将样品照片从建样时上传改为制作完成和复检时上传，新增 NEW 状态条码补打功能，新增复检扫码动作。

## 2. 动机

- 建样时实物样品尚未制作，无法拍照，应后置到制作完成环节
- 条码贴于实物后可能损坏/丢失，NEW 状态应允许补打
- 复检是质量管控关键环节，需要扫码留痕 + 拍照存档
- 制作照片和复检照片需独立保留以做对比

## 3. 新流程

```
建样(无图) → NEW ──[可补打条码]──→ RND扫码 + 上传制作图 → PRODUCED
                                   → QA扫码 + 填复检周期 → RELEASED(沿用制作图)
                                   → 到期 → QA扫码复检 + 上传复检图 → RELEASED(更新next_inspect_at)
                                   → 保管扫码 + 储位 → IN_CUSTODY
```

## 4. 数据库变更

samples 表新增 2 列：

```sql
ALTER TABLE samples ADD COLUMN produced_image TEXT;
ALTER TABLE samples ADD COLUMN inspect_image TEXT;
```

| 字段 | 含义 | 写入时机 |
|---|---|---|
| `image` | 保留，列表缩略图（自动取 `produced_image` 或首张有值图，兼容旧数据） | 建样时不变 |
| `produced_image` | 制作完成照片 | RND 扫码 PRODUCE |
| `inspect_image` | 最近一次复检照片 | QA 扫码 INSPECT，每次覆盖 |

db.js 迁移逻辑：启动时自动检测并补加缺失列（与现有 `model/station/image` 迁移模式一致）。

## 5. 状态机变更

```
NEW → PRODUCED → RELEASED → IN_CUSTODY
                ↑___________↓
                  (INSPECT)
```

新增动作 `INSPECT`：

| 动作 | 触发条件 | 必填参数 | 效果 |
|---|---|---|---|
| PRODUCE | role=RND, status=NEW | **image**(base64), note(可选) | →PRODUCED, 存 `produced_image` |
| RELEASE | role=QA, status=PRODUCED | cycleDays(必填) | →RELEASED, 设 `next_inspect_at` |
| **INSPECT(新增)** | role=QA, status=RELEASED, next_inspect_at ≤ now | **image**(base64), note(可选) | 更新 `inspect_image`、`next_inspect_at`，状态保持 RELEASED |
| CUSTODY | role=CUSTODY, status=RELEASED | location(必填) | →IN_CUSTODY |

## 6. API 变更

### 6.1 POST /api/scan 扩展

新增 `action` 参数支持（向后兼容）：

```json
// PRODUCE（变更：image 必填）
{ "code": "SM-000002", "image": "data:image/png;base64,...", "note": "制作完成" }

// INSPECT（新增）
{ "code": "SM-000001", "action": "INSPECT", "image": "data:image/png;base64,...", "note": "复检通过" }
```

`actionForRole` 逻辑扩展：
```js
function actionForRole(role, status, next_inspect_at) {
  if (role === 'RND' && status === 'NEW') return 'PRODUCE';
  if (role === 'QA' && status === 'PRODUCED') return 'RELEASE';
  if (role === 'QA' && status === 'RELEASED' && next_inspect_at && new Date(next_inspect_at) <= new Date()) return 'INSPECT';
  if (role === 'CUSTODY' && status === 'RELEASED') return 'CUSTODY';
  return null;
}
```

### 6.2 GET /api/samples/:id 返回扩展

新增 `produced_image`、`inspect_image` 字段。

### 6.3 POST /api/samples 简化

去掉 `image` 参数处理（建样不上传图片），`image` 字段默认为空。

## 7. 前端变更清单

### 7.1 建样页（viewNew / submitNew）

| 变更 | 说明 |
|---|---|
| 删除 | 图片上传字段 + previewImage 函数 |
| 按钮文字 | 「创建并生成二维码」→「创建样品并生成条码」 |
| toast | 创建成功后提示 "可到样品列表补打条码" |

### 7.2 样品列表（renderSamples）

NEW 状态行新增「打印标签」按钮，调用 `openPrintLabel(sample)`。其余状态不显示。

`openPrintLabel` 标签内容去掉 `s.image` 渲染。

### 7.3 扫码台（POST /api/scan 前端）

PRODUCE 场景：扫码后不直接提交，弹出确认表单（照片必填 + 备注可选），确认后携带 `image` 提交。

INSPECT 场景（新增）：QA 扫码 RELEASED+到期 样品，弹出复检表单（照片必填 + 备注可选），提交 `action: 'INSPECT'`。

扫码台需新增 base64 图片上传组件（input file + FileReader），复用现有的 base64 上传模式。

### 7.4 详情弹窗（renderDetailBody）

- 图片卡片：优先 `produced_image`，回退 `image`
- 如有 `inspect_image`，额外显示「复检照片」缩略图
- 日志列表：制作/复检日志行附带缩略图可点击放大

### 7.5 打印标签（openPrintLabel）

去掉图片显示行。

## 8. 兼容性

| 影响 | 说明 |
|---|---|
| 旧数据 | `image` 字段值不丢，列表/详情回退逻辑兼容 |
| API 出入参 | `/api/scan` image 从可选变 PRODUCE 必填，旧调用方需适配 |
| 前端 | 建样页去掉图片上传，不兼容旧流程（符合预期） |
| 数据库 | ALTER TABLE 添加列，无数据迁移 |

## 9. 文件变更

| 文件 | 操作 | 说明 |
|---|---|---|
| `db.js` | 修改 | 新增 migration 加 2 列 |
| `server.js` | 修改 | 扩展 actionForRole + /api/scan + /api/samples |
| `public/index.html` | 修改 | 建样/列表/扫码台/详情弹窗/打印标签 |

**修改 3 个文件，无新建/删除。**

## 10. 不涉及范围

- 不拆分 index.html（独立架构任务）
- 不修改 seed.js（演示数据不变）
- 不新增测试基础设施

## 11. 完成标准

- [ ] 建样无图片上传，创建后弹出打印窗口
- [ ] NEW 状态列表行有「打印标签」按钮
- [ ] RND 扫码 NEW → 弹出表单要求上传图片
- [ ] QA 扫码 PRODUCED → 要求填周期（不变）
- [ ] QA 扫码 RELEASED+到期 → 弹出复检表单上传图片
- [ ] 详情弹窗显示制作图 + 复检图
- [ ] 14 条测试 PASS（含新增/修改的测试用例）
- [ ] 臃肿检测报告
