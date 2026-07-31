# 方案 A + QR 标示卡（方案2·匿名页·无图版）—— 设计文档

> 参考：(GYS-Q3-011)限度样品规范 A7 版  
> 选定方案：方案 A（轻量增强）+ 方案 2（独立匿名标示卡页，不含样品图）

## 1. 目标

在现有样品管理系统上叠加限度样品管理，实现：
1. OK/NG 样品类型区分 + 限度项目 + 来源追溯 + 有效期管理
2. QR 码扫码后打开匿名数字标示卡（无需登录），供 QC 巡检员现场参照
3. 标示卡编辑在系统内完成（需登录），与现有详情弹窗集成
4. 最小改动，不破坏现有流程

## 2. 数据库变更

### 2.1 samples 表新增字段

```sql
ALTER TABLE samples ADD COLUMN sample_type TEXT DEFAULT '';      -- OK / NG / ''(不适用)
ALTER TABLE samples ADD COLUMN limit_item TEXT DEFAULT '';       -- 限度项目编码
ALTER TABLE samples ADD COLUMN source_type TEXT DEFAULT '';      -- C(客供) / T(元山) / G(元将五金塔岗分厂) / ''(不适用)
ALTER TABLE samples ADD COLUMN valid_until TEXT DEFAULT '';       -- 有效期截止日 ISO 8601
ALTER TABLE samples ADD COLUMN card_version TEXT DEFAULT '';     -- 标示卡版次，如 A1
ALTER TABLE samples ADD COLUMN test_standard TEXT DEFAULT '';    -- 测试标准/规格
ALTER TABLE samples ADD COLUMN test_data TEXT DEFAULT '';        -- 测试数据/实测值
ALTER TABLE samples ADD COLUMN signed_by_rnd TEXT DEFAULT '';    -- 研发制作人（用户名）
ALTER TABLE samples ADD COLUMN signed_by_qa TEXT DEFAULT '';     -- 品保确认人（用户名）
```

### 2.2 限度项目枚举（前端 constants）

编码严格按 (GYS-Q3-011) 限度样品规范 A7 版定义，分两组共 26 项。

```js
// 第一部分：限度样品（震动/异音/外观）— 7 项
const LIMIT_ITEMS_PART1 = [
  { code: 'A',  label: '成品震动' },
  { code: 'AI', label: '扇叶震动' },
  { code: 'A1', label: 'MCU IC烧録器' },
  { code: 'A2', label: '平衡机测试' },
  { code: 'A3', label: '入充磁扇叶组立(充磁、磁石高度、AOI检测点胶)' },
  { code: 'B',  label: '异音' },
  { code: 'C',  label: '外观' }
];

// 第二部分：OK/NG测试样品 — 19 项
const LIMIT_ITEMS_PART2 = [
  { code: 'D', label: '定子组绝缘耐压/阻抗' },
  { code: 'E', label: '马达组电测（波形、反转）' },
  { code: 'F', label: '层间测试' },
  { code: 'G', label: '定子组大小边' },
  { code: 'H', label: 'AOI视觉/CCD检测(焊点、Pin针浸锡高度)' },
  { code: 'I', label: '压定子高度' },
  { code: 'J', label: '扣环检测' },
  { code: 'K', label: 'PCB组与定子组结合焊锡' },
  { code: 'L', label: '自动化马达组组立' },
  { code: 'M', label: '马达组焊导线组' },
  { code: 'N', label: '导线焊点位置检测' },
  { code: 'O', label: '断电功能检测' },
  { code: 'P', label: '成品检测(转速、电流)' },
  { code: 'Q', label: '定子组自动绕、缠线' },
  { code: 'R', label: '铜轴承自动化(压定子高度、轴承高度、点胶检测)' },
  { code: 'S', label: 'CCD检测浸锡后定子组' },
  { code: 'T', label: 'CCD检测外框组' },
  { code: 'U', label: '2Ball成品自动化组立(轴承、弹簧、垫片)' },
  { code: 'X', label: '特殊工站' }
];

// 合并供下拉选择用
const LIMIT_ITEMS = [...LIMIT_ITEMS_PART1, ...LIMIT_ITEMS_PART2];
```

> 编号规则（6.2.3）：结构化编码（无分隔符，5段拼接）  
> 
> ```
> [来源前缀][限度项目][流水号4位][保管单位][序号+K/N]
> ```
> 
> | 段 | 含义 | 取值 | 示例 |
> |---|---|---|---|
> | 来源前缀 | 样品提供处 | C / T / G | `T` |
> | 限度项目 | 检测项目 | A / AI / A1 / A2 / A3 / B / C / D~X | `A1` |
> | 流水号 | 序号 | 0001 起，按来源+项目独立递增 | `0001` |
> | 保管单位 | 保管部门 | 1~8（见上表） | `3` |
> | 序号+K/N | OK/NG 标记 | `1K`(OK) / `1N`(NG) / `2N`… | `1K` |
> 
> 示例：`TA1000131K` — 元山·MCU IC烧録器·0001号·工程·OK样品

## 3. API 设计

### 3.1 现有接口适配

**GET /api/samples** — 列表查询扩展
- 新增可选参数：`sample_type`（OK/NG）、`limit_item`（项目编码）、`source_type`（C/T/G）
- `listSamples()` 在 db.js 中增加对应 WHERE 条件

**GET /api/samples/:id** — 详情返回
- 返回体自动包含新增字段（SELECT * 无需改动）

**POST /api/samples/:id** — 更新样品（新增接口或扩展现有）
- 允许 RND/QA/ADMIN 更新限度相关字段（sample_type, limit_item, source_type, valid_until, card_version, test_standard, test_data, signed_by_rnd, signed_by_qa）

### 3.2 新增匿名路由

**GET /card/:sample_no** — 匿名查看数字标示卡
- 无需鉴权（不经过 `requireAuth` 中间件）
- 按 `sample_no` 查询样品
- 返回纯 HTML 页面（移动端友好）
- 页面内容：
  - 样品编号、OK/NG 标记、限度项目
  - 来源、版次、测试标准、测试数据
  - 有效期（逾期红色标记）
  - 制作人、确认人
  - 状态流转记录（最近 2 条）
  - 底部："此卡供现场参照，系统内可查看更多信息"
- **不展示**样品图片（按用户要求）

### 3.3 打印标示卡

**GET /api/samples/:id/card/print** — 打印标示卡
- 需登录
- 返回可打印的 HTML（与匿名页相同布局 + QR 码 + @page 打印样式）

## 4. 前端变更

### 4.1 新建/编辑样品表单（new.js）

新建样品时可选填标示卡字段：
- 样品类型：OK / NG / 不适用（单选）
- 限度项目：下拉选择（LIMIT_ITEMS）
- 来源：客供(C) / 元山(T) / 塔岗(G) / 不适用
- 有效期：日期选择器
- 版次：文本输入
- 测试标准：文本域

### 4.2 详情弹窗（detail.js）

在现有 Tab（信息/全量日志/大图）基础上新增**"标示卡"Tab**：
- 展示/编辑所有限度字段
- 制作人/确认人自动填入当前用户
- "保存"按钮调用 PUT /api/samples/:id
- "打印标示卡"按钮调用 /api/samples/:id/card/print

### 4.3 样品列表筛选（samples.js）

现有筛选栏增加：
- OK/NG 类型筛选（下拉：全部/OK/NG）
- 限度项目筛选（下拉：LIMIT_ITEMS）
- 来源筛选（下拉：全部/客供/元山/塔岗）

### 4.4 匿名标示卡页（card.js）

新建 `public/js/card.js` + 在 `server.js` 中返回 card 页面 HTML：
- 纯展示，无编辑功能
- 移动端优化（max-width 480px，单栏布局）
- 逾期/即将到期红色高亮
- 状态流转时间线
- 页面标题显示样品编号

## 5. 编号自动生成（可选，本期不做）

现有 `SM-XXXXXX` 编号保持不动。结构化编号（如 `T-MD-0001-OK`）另行规划。

## 6. 响应式设计

匿名标示卡页针对移动端优先设计：
- 默认宽度 100%（适合手机屏幕）
- ≥768px 时限制 max-width 480px 居中
- 字体 13-15px，适合现场查看

## 7. 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `db.js` | 修改 | samples 表加 9 字段；`listSamples()` 加 3 筛选参数；`updateSample()` 支持限度字段 |
| `server.js` | 修改 | `/api/samples` 路由透传新参数；新增 `GET /card/:sample_no` 匿名路由；新增 `PUT /api/samples/:id`；新增 `GET /api/samples/:id/card/print` |
| `public/js/api.js` | 修改 | 新增 LIMIT_ITEMS 常量 |
| `public/js/new.js` | 修改 | 新建表单增加限度字段 |
| `public/js/detail.js` | 修改 | 新增"标示卡"Tab |
| `public/js/samples.js` | 修改 | 筛选栏增加 3 个维度 |
| `server.js` | 修改 | 匿名路由返回 card 页 HTML |
| `tests/` | 新增 | 限度字段 CRUD + 匿名路由测试 |

## 8. 兼容性说明

- 所有新字段默认空字符串，现有样品不受影响
- 现有 API 参数不变，新增参数均为可选
- 匿名路由 `/card/:sample_no` 不依赖 session，不影响现有鉴权
- 前端筛选条件不选择时不传参，后端返回全部数据

## 9. 安全考量

- 匿名标示卡仅展示信息，无操作入口
- 不暴露样品图片（防止泄密）
- 不暴露创建人/确认人的联系方式
- 限度编辑仅 RND/QA/ADMIN 可操作
