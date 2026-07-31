# 打印尺寸功能 — 设计文档

> 日期：2026-07-25 | 状态：已确认

## 一、需求概述

标签打印支持多种预设尺寸选择，标示卡自动跟随标签尺寸等比缩放。**布局结构不变，仅等比缩放宽度/QR/字号。**

## 二、尺寸规格

```js
PRINT_SIZES = [
  { key: 'small',  label: '小号', width: 50 },
  { key: 'medium', label: '中标', width: 70 },
  { key: 'large',  label: '大号', width: 100 },
  { key: 'custom', label: '自定义', width: null }
];
// scale = width / 100，所有尺寸 = 基准值 × scale
```

| key | 标签 | 标签宽度 | QR 显示 | QR 生成 | 标示卡宽度 | 字号缩放比 |
|---|---|---|---|---|---|---|---|
| small | 小号 | 50mm | 33px | 66px | 28mm | 0.50x |
| medium | 中标（默认） | 70mm | 46px | 92px | 38mm | 0.70x |
| large | 大号 | 100mm | 66px | 132px | 55mm | 1.00x |
| custom | 自定义 | 30~150mm | 按比例 | 按比例 | 按比例 | 按比例 |

> 以当前值（280px标签/66px QR/155px标示卡）为基准（= 大号 100mm），缩放比 = 选择尺寸 / 100。QR 生成宽度 = 132 × scale。

## 三、UI 设计

### 3.1 标签打印页顶部

```
┌──────────────────────────────────────┐
│ 打印尺寸: [中标70mm ▾]     [打印]    │
├──────────────────────────────────────┤
│                                      │
│  ┌──────┐  SM-000001                │
│  │  QR  │  样品名称                  │
│  │      │  机型 · 站别               │
│  └──────┘                            │
│                       贴于样品并扫码  │
└──────────────────────────────────────┘
```

- 尺寸下拉：小号/中标/大号/自定义
- 选"自定义"弹出输入框（30~150mm）
- 切换尺寸时标签预览实时刷新（无需重新请求后端）
- `localStorage` 记住上次选择

### 3.2 标示卡打印页顶部

同样显示尺寸栏（只读跟随标签尺寸），标题如 `打印尺寸: 中标70mm（跟随标签）`，不提供切换。

### 3.3 新建样品后自动打印

新建样品成功后直接使用 localStorage 记住的默认尺寸，不额外弹窗选择。

## 四、数据流

```
用户选择尺寸
  ↓
localStorage.setItem('printSize', 'medium')
  ↓
打开打印页 → GET /api/samples/:id/label/print?size=medium
  ↓
buildLabelHtml(sample, 'medium')
  → width=70mm, QR=34px, 字号 *= 0.70
  ↓
标示卡 → GET /api/samples/:id/card/print?size=medium
buildCardPrintHtml(sample, 'medium')
  → width=38mm, 字号 *= 0.70
```

## 五、后端改动

### 5.1 `buildLabelHtml(sample, sizeKey)`

新增第二个参数 `sizeKey`，默认 `'large'`（兼容不传参的旧调用）：

```js
function buildLabelHtml(sample, sizeKey) {
  const size = PRINT_SIZES.find(s => s.key === (sizeKey || 'large')) || PRINT_SIZES[2];
  const scale = size.width / 100;  // 0.5 / 0.7 / 1.0
  
  // 所有动态值
  const labelWidth = Math.round(280 * scale);
  const qrDisplay = Math.round(66 * scale);
  const qrGenerate = Math.round(132 * scale);
  // 字号、内边距等均按 scale 缩放
}
```

**字号缩放参考**（当前值 × scale，四舍五入）：

| 元素 | 当前值 | 基准=large(1.0x) | medium(0.7x) | small(0.5x) |
|---|---|---|---|---|
| 标签宽度 | 280px | 280px | 196px | 140px |
| QR 图片 | 66px | 66px | 46px | 33px |
| 编号字号 | 11px | 11px | 8px | 6px |
| 名称字号 | 9px | 9px | 6px | 5px |
| 机型字号 | 8px | 8px | 6px | 4px |
| 规格字号 | 7px | 7px | 5px | 4px |
| 脚注字号 | 6px | 6px | 4px | 3px |

### 5.2 `buildCardPrintHtml(sample, sizeKey)`

同理新增 `sizeKey` 参数：

| 元素 | 当前值 | large(1.0x) | medium(0.7x) | small(0.5x) |
|---|---|---|---|---|
| 卡片宽度 | 155px | 155px | 109px | 78px |
| 字号 | 7px | 7px | 5px | 4px |
| 内边距 | 8px | 8px | 6px | 4px |

### 5.3 路由层

```js
// GET /api/samples/:id/label/print?size=medium
app.get('/api/samples/:id/label/print', requireAuth, (req, res) => {
  const s = D.getSampleById(Number(req.params.id));
  const sizeKey = req.query.size || 'large';
  res.send(buildLabelHtml(s, sizeKey));
});

// GET /api/samples/:id/card/print?size=medium
app.get('/api/samples/:id/card/print', requireAuth, (req, res) => {
  const s = D.getSampleById(Number(req.params.id));
  const sizeKey = req.query.size || 'large';
  res.send(buildCardPrintHtml(s, sizeKey));
});
```

## 六、前端改动

### 6.1 `public/js/constants.js` — 新增常量

```js
var PRINT_SIZES=[
  {key:'small',label:'小号',width:50,qr:24},
  {key:'medium',label:'中标',width:70,qr:34},
  {key:'large',label:'大号',width:100,qr:48},
  {key:'custom',label:'自定义',width:null}
];
```

### 6.2 `public/js/new.js` — 尺寸选择器 + 打印函数

- `openPrintLabel(sample)` 修改为接受 `sizeKey` 参数
- 打印页 URL 附加 `?size=medium` 
- 尺寸切换：前端 JS 修改 `scale` 变量，更新 CSS 宽高

### 6.3 实时预览（性能优化）

标签/标示卡打印页加载后，前端 JS 注入尺寸选择器 + 切换逻辑。切换尺寸时不重新请求后端，而是直接修改页面 DOM 的 CSS 变量：

```js
// 前端内联脚本
var style = document.createElement('style');
style.textContent = ':root{--scale:' + scale + '}';
// 所有动态尺寸使用 calc(基准值 * var(--scale))
```

### 6.4 其他文件

| 文件 | 改动 |
|---|---|
| `public/js/detail.js` | `printCard(id)` → `printCard(id, sizeKey)` |
| `public/js/scan.js` | 扫码后 `window.open` URL 附加尺寸参数 |
| `public/js/print-queue.js` | `printAllCards()` 传递尺寸参数 |

## 七、兼容性

- 不传 `?size=` 参数默认 `large`（100mm）= 当前行为，**零破坏**
- 旧 URL 直接访问打印页无尺寸参数 → 使用大号，与现在完全一致
- `localStorage` 未设置时默认 `medium`（70mm）

## 八、不涉及

- 二维码下载（独立 PNG，不参与）
- 标签下载 HTML（`/label/download` 同样支持 `?size=` 参数）
- 数据库
- 样品 CRUD

## 九、文件变更清单

| 文件 | 类型 | 行数变化预估 |
|---|---|---|
| `public/js/constants.js` | 修改 | +5 |
| `routes/cards.js` | 修改 | +60（新增缩放计算逻辑）|
| `public/js/new.js` | 修改 | +30（尺寸选择器 + 参数传递）|
| `public/js/detail.js` | 修改 | +5 |
| `public/js/scan.js` | 修改 | +5 |
| `public/js/print-queue.js` | 修改 | +5 |
