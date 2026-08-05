# 版次自动填写 — 设计文档

> 日期：2026-07-28 | 状态：已确认

## 1. 需求概述

标示卡版次（card_version）在 RELEASE（首发）自动填入 "01"，在 RE_RELEASE（重新发行）自动 +1（"01"→"02"→…→"99"），用户可手动调整。

### 触发范围
- **RELEASE（首发）**：card_version 为空 → 自动设为 "01"
- **RE_RELEASE（重新发行）**：card_version 自动 +1
- INSPECT/EDIT_CARD 等修改标示卡内容但非重新发行的场景 → 不触发版本+1

### 约束
- 格式：两位数字 "01"~"99"，0填充
- 用户可在表单中手动调整版本号
- 兼容旧格式（V1.0、A1 等），取数字部分 +1

## 2. 核心版本计算逻辑

```js
// 计算下一个版次号（格式 "01"~"99"）
// 兼容旧格式：V1.0→02, A1→02, 空→01
function nextCardVersion(current) {
  const m = String(current||'').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return String(Math.min(n + 1, 99)).padStart(2, '0');
}
```

| 当前值 | 结果 | 说明 |
|---|---|---|
| "" (空) | "01" | 首发 |
| "01" | "02" | 正常递增 |
| "05" | "06" | 正常递增 |
| "V1.0" | "02" | 旧格式兼容 |
| "A1" | "02" | 旧格式兼容 |
| "99" | "99" | 到达上限 |

## 3. 数据流

### 3.1 RELEASE（首发）

```
前端 scan.js
  → GET /api/scan 返回 s.card_version=""
  → buildCardFieldTable 版次默认填 "01"
  → 用户确认（可手动修改）
  → POST /api/scan { card_version: "01" }
后端 routes/scan.js
  → card_version 为空 → 自动设为 "01"
  → 持久化
```

### 3.2 RE_RELEASE（版本+1）

```
前端 scan.js
  → GET /api/scan 返回 s.card_version="01"
  → 前端计算 nextCardVersion("01") = "02"
  → buildCardFieldTable 版次默认填 "02"
  → 用户确认（可手动修改为 "03"）
  → POST /api/scan { card_version: "03" }
后端 routes/scan.js
  → 以用户提交值为准保存
  → 若用户未填 → 后端兜底计算 +1
```

## 4. 文件改动清单

| 文件 | 改动 | 行数 |
|---|---|---|
| `routes/scan.js` | 新增 `nextCardVersion` 辅助函数；RELEASE handler 加默认"01"；RE_RELEASE handler 加兜底+1 | +12 |
| `public/js/scan-wizard.js` | 新增前端版 `nextCardVersion`；`buildCardFieldTable` 调用传入建议版本号 | +6 |
| `public/js/card-fields.js` | `buildCardFieldTable(s,editable,suggestedVersion)` 新增第3参数，value 优先用 suggestedVersion | +2 |
| **总计** | | **~20行** |

## 5. 兼容性说明

- **旧数据**：历史 `V1.0`/`A1`/`V2.1` 等格式保留不迁移，首次 RE_RELEASE 时自动识别数字部分 → 新格式 "02"。
- **现有手动输入**：RELEASE/RE_RELEASE 表单中版次仍可手动编辑，非发行场景（如 detail.js saveCard）不受影响。
- **seed 数据**：`seed-rich.js` 中有 `card_version: 'V1.0'` 等旧格式，保持不动（后续 RE_RELEASE 会自动转为新格式）。
- **API 接口**：无 breaking change，仅后端增加兜底默认值逻辑。

## 6. 测试要点

- [ ] RELEASE 首发：card_version 为空 → 自动 "01"
- [ ] RE_RELEASE：card_version="01" → 默认填 "02"，用户可改 "03"
- [ ] RE_RELEASE + 旧格式：card_version="V1.0" → 默认填 "02"
- [ ] 边界：card_version="99" → 默认填 "99"（不再递增）
- [ ] INSPECT 修改标示卡：不触发版本+1
- [ ] detail.js 手动编辑版次：不受影响
- [ ] RE_RELEASE 用户手动清空版次 → 后端兜底+1
