# 扫码台页面优化 — 设计文档

> 版本：v1.0 | 日期：2026-07-23 | 状态：待实现

## 一、背景与目标

扫码台经历标示卡流程嵌入后，RELEASE 操作复杂度上升。全链路分析发现 7 个交互问题：连续扫码打印弹窗、字段状态误导、折叠区漏填、焦点状态单向等。

**目标**：采用 A+B 混合方案——基底增量修复覆盖全部 7 个问题，仅 RELEASE 模式叠加分步向导降低认知负担。净增约 87 行，不改整体布局结构。

## 二、方案总览

```
全部模式：增量修复（Fix1-Fix7）
    +
RELEASE 模式：叠加分步向导（Step1 → Step2 → Step3）
```

**不改变**：页面单卡片居中布局、PRODUCE/INSPECT/CUSTODY 交互流程、后端状态机逻辑。

## 三、7 个修复点详细设计

### Fix1：连续扫码 + RELEASE 打印弹窗

**问题**：连续模式下每次 RELEASE 成功后 `setTimeout(() => window.open(...), 600)` 弹窗打印页，批量操作时浏览器疯狂弹窗。

**方案**：
- 新增全局变量 `let printQueue = []`（数组，元素 `{id, sample_no, name}`）
- RELEASE 成功后：
  - 非连续模式 → 直接 `window.open` 弹单张打印（保持现有行为）
  - 连续模式 → `printQueue.push({...})`，仅加入队列，不弹窗
- UI 指示器：扫码输入框下方常驻：
  - 打印队列为空时不显示
  - 有积累时显示「已积累 N 张标示卡」+ 「打印全部」+ 「清空」按钮
- 「打印全部」：依次 `window.open` 弹多张打印页（浏览器会合并打印对话框）
- 离开页面保护：`beforeunload` 事件检查 `printQueue.length > 0`，提示「有 N 张未打印标示卡，离开将丢失」

### Fix2：「研发已填」标签 → 逐字段状态

**问题**：`hasRdCard = (t||l||src||v||ver||data)` 只要任意字段有值就显示「研发已填」，QA 可能忽略检查。

**方案**：
- 删除 `hasRdCard` / `noteRd` 变量
- 新增函数 `cardFieldStatus(s, field)`，返回 `{status: 'filled'|'empty'|'required_empty', filledBy: 'rd'|'qa'|null}`
  - 必填字段（sample_type/limit_item）未填 → `'required_empty'` → 显示 ✗ 必填（红色）
  - 必填字段已填 → `'filled'` → 显示 ✓ RD已填 / ✓ QA已填（绿色/蓝色）
  - 非必填字段已填 → `'filled'` → 显示 ✓（绿色）
  - 非必填字段未填 → 不显示标记
- 抽离组件 `buildCardFieldTable(s, editable)` — 统一渲染标示卡字段表格，每行「标签 | 值 | 状态」
- 该组件在 RELEASE Step2、INSPECT、详情弹窗标示卡 Tab 三处复用

### Fix3：标示卡字段取消折叠

**问题**：`<details>` 折叠「更多标示卡字段」，QA 不展开可能漏填。

**方案**：
- 移除 `<details>` 折叠
- `buildCardFieldTable(s, editable)` 平铺全部 6 行字段（类型/项目/来源/有效期/版次/数据）
- 表单高度增加约 80px，在 560px 卡片内可接受

### Fix4：onblur → 双向焦点状态

**问题**：`onblur` 设红色警告「输入框未聚焦」，重新聚焦时不自动恢复绿色。

**方案**：
- 在 `bindScanInput()` 中添加 `inp.onfocus` 事件：
  ```js
  inp.onfocus = () => $('#scan-status').textContent = '已就绪，等待扫码枪';
  ```
- 状态元素自动切换绿色/红色背景

### Fix5：手动输入格式校验

**问题**：输入任意文本直接发 API，404 无明确格式提示。

**方案**：
- `doScan()` 开头添加前端校验：
  ```js
  if (!/^SM-\d{6}$/.test(code)) {
    toast('编号格式错误：SM-XXXXXX（6位数字）');
    return refocusScan();
  }
  ```
- 输入框下方添加 `<small>格式：SM-XXXXXX</small>` 提示
- 更新 placeholder 为「扫描或输入 SM-XXXXXX」

### Fix6：INSPECT 标示卡更新

**问题**：复检时只上传照片和更新日期，标示卡字段不可修改。

**方案**：
- `renderScanAction` 中 INSPECT 分支：在复检照片下方追加标示卡更新区（折叠，默认关闭）
- 使用 `buildCardFieldTable(s, true)` 渲染，仅允许修改非签署字段（有效期/版次/测试数据）
- 后端 `routes/scan.js` INSPECT 分支：接受可选字段更新，写入 `updateSample`
- 复检 log note 包含「复检通过+标示卡已更新」标记

### Fix7：摄像头 HTTPS + 权限引导

**问题**：无 HTTPS 检测，无权限拒绝引导。

**方案**：
- `startCam()` 开头检查 `location.protocol !== 'https:'` → 显示「摄像头仅 HTTPS 可用，请使用扫码枪或手动输入」
- `getUserMedia` 失败时区分：
  - `NotAllowedError` → 「摄像头权限被拒绝，请在浏览器设置中允许」
  - `NotFoundError` → 「未检测到摄像头设备」
  - 其他 → 「摄像头启动失败」
- 摄像头折叠区 `<details>` 默认显示协议状态：「HTTPS ✓ 可用」或「HTTP ✗ 不可用」
- 连续模式 + 摄像头：不允许组合，勾选连续时隐藏摄像头区域，用扫码枪

## 四、RELEASE 分步向导

### 4.1 交互流

```
Step 1: 设置复检周期
  ├─ 显示样品摘要（编号+名称+当前状态）
  ├─ 复检周期输入（默认90天）+ 实时预览下次复检日期
  └─ [下一步：填写标示卡 →]  →  校验：cycleDays > 0

Step 2: 标示卡审查
  ├─ buildCardFieldTable(s, true)  ← 复用组件
  │   ├─ 样品类型 *   [select]    状态标记
  │   ├─ 限度项目 *   [select]    状态标记
  │   ├─ 来源         [select]    状态标记
  │   ├─ 有效期       [date]      状态标记
  │   ├─ 版次         [text]      状态标记
  │   ├─ 测试数据     [text]      状态标记
  │   └─ 品保确认人: {display_name}（自动签署）
  ├─ [← 上一步] [下一步：确认发行 →]
  └─ 门禁：类型+项目必填才可下一步

Step 3: 确认 & 发行
  ├─ 摘要展示：复检周期 / 下次复检日 / 标示卡字段（只读）
  ├─ [← 返回修改] [确认正式发行（品保）]
  └─ 成功后 → 加入打印队列 / 非连续直接打印
```

### 4.2 实现要点

- 新增 `buildReleaseWizard(s)` 函数替代 `buildReleaseCardForm(s)`
- 使用内部状态变量 `let wizardStep = 1` 跟踪当前步骤
- 步骤间切换不重新请求后端（数据留在内存）
- 最终 `confirmScan('RELEASE')` 时收集 Step1+Step2 的全部字段，一次 POST
- Step 进度指示器：三个圆点 + 连线（1→2→3），当前步骤高亮蓝色

## 五、打印队列组件

```js
let printQueue = []; // { id, sample_no, name }

function renderPrintQueue() {
  if (printQueue.length === 0) return '';
  return `<div class="print-queue">
    已积累 <b>${printQueue.length}</b> 张标示卡
    <button onclick="printAllCards()">打印全部</button>
    <button onclick="printQueue=[];renderPrintQueue()">清空</button>
  </div>`;
}

function printAllCards() {
  for (const c of printQueue) {
    window.open('/api/samples/' + c.id + '/card/print', '_blank');
  }
  printQueue = [];
  renderPrintQueue();
}
```

## 六、文件变更清单

| 文件 | 改动 | 预估行数 |
|---|---|---|
| `public/js/scan.js` | Fix1-7 + 分步向导 + 打印队列 + buildCardFieldTable | +80 / -30 |
| `public/js/camera-helper.js` | Fix7 HTTPS检测 + 权限引导 | +15 |
| `routes/scan.js` | Fix6 INSPECT 接受标示卡字段 | +10 |
| `public/js/constants.js` | Fix5 格式校验正则常量 | +2 |
| `docs/operation-manual.md` | 同步更新扫码台章节 | +10 |
| **合计** | 5 文件 | **+117 / -30** |

无新增文件。不涉及数据库变更、不涉及新增 API。

## 七、兼容性说明

- **向后兼容**：所有现有 API 入参/出参不变
- **INSPECT 新增可选字段**：`test_data`, `valid_until`, `card_version` 全为可选，旧调用方不受影响
- **前端 localStorage**：打印队列存内存（`printQueue` 变量），不持久化，刷新页面后清除

## 八、验证清单

- [ ] RELEASE 非连续模式：扫码→三步向导→确认→单张打印弹窗
- [ ] RELEASE 连续模式：扫码→三步向导→确认→队列计数+1，不弹窗
- [ ] 打印队列：积累 N 张→打印全部→N 个打印页弹出→队列清空
- [ ] 标示卡逐字段状态：必填未填显示红色 ✗，已填显示绿色 ✓+来源
- [ ] INSPECT 标示卡更新：折叠区可编辑→保存→复检日期更新+字段更新
- [ ] 格式校验：输入 `abc` → toast 提示格式错误
- [ ] 焦点状态：失焦红色→聚焦绿色
- [ ] HTTPS 检测：HTTP 环境显示摄像头不可用提示
- [ ] PRODUCE/CUSTODY 流程不受影响
