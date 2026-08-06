# 设计文档：子系统列表「导出 CSV」标准能力

- 日期：2026-08-06
- 状态：已确认（用户 OK）
- 关联：AGENTS.md §17 子系统插件协议、§6.1 子系统隔离原则

## 1. 背景与目标

用户要求：对子系统的清单列表添加「按顺序导出列表」功能，且**作为标准设计加入设计规则**，后续所有子系统统一遵循。

本期落地范围：
- 样品列表（samples）与治具清单（fixtures）两个列表页提供「导出 CSV」按钮
- 新增共享 CSV 导出工具（后续子系统复用，禁止各自实现）
- 新增设计规则条款（AGENTS.md §21），固化「列表导出」标准能力

## 2. 需求澄清记录（用户确认项）

| 问题 | 确认结果 |
|---|---|
| 导出列表的目标页面 | 样品列表 + 治具清单（非子系统管理面板） |
| 「按顺序导出」的顺序 | 按当前显示顺序（列表当前排序条件） |
| 导出格式 | CSV（BOM UTF-8，Excel/WPS 直开） |
| 功能范围 | 两个列表都加；后续子系统都要加（标准设计） |
| 导出数据范围 | 当前筛选+排序条件下的全量记录（忽略分页） |
| 导出字段 | 列表核心业务字段（不含图片/操作列） |
| 实现方案 | 后端导出接口 + 共享 CSV 工具（用户选定） |

## 3. 现状分析

### 3.1 现有导出先例

| 先例 | 位置 | 模式 |
|---|---|---|
| 用户模板导出 | public/js/admin-users-import.js | 前端 Blob + BOM + a.download |
| 项目任务导出 | subsystems/projects/backend/routes-stats.js + tests/projects.test.js | 后端 `Content-Type: text/csv` + `Content-Disposition: attachment` |

本项目尚无共享 CSV 生成工具，两处导出均为局部实现。

### 3.2 列表页结构

| 列表 | 视图文件 | 筛选/排序/分页 |
|---|---|---|
| 样品列表 | subsystems/samples/frontend/js/views/list.js（`_buildQueryParams`）| q/status/dept/type/limit_item/source/model/sort；分页 |
| 治具清单 | subsystems/fixtures/frontend/js/views/list.js（`loadFixtureList` qs 组装）| status/dept/search/col/dir；分页 |

两个列表均「先组装筛选参数 → 请求列表接口 → 渲染」。

## 4. 方案设计

### 4.1 共享 CSV 工具（shared/csv.js，新建）

无状态纯函数，不绑定任何子系统。满足工具文件 ≤200 行红线。

```js
// shared/csv.js
// toCsv(rows, cols): 生成 BOM CSV 文本
//   cols: [{ key, label, fmt? }]  // fmt: (row) => string 可选格式化
//   值含逗号/引号/换行 → 双引号包裹，内部引号 "" 转义；空值 → 空串
// sendCsv(res, filename, csv): 设置响应头并发送
//   Content-Type: text/csv; charset=utf-8
//   Content-Disposition: attachment; filename*=UTF-8''<encodeURIComponent>
```

导出：
- `toCsv(rows, cols)`
- `sendCsv(res, filename, csv)`

### 4.2 导出端点（后端）

复用各子系统列表查询逻辑（同一查询构建函数），**忽略 limit/offset 取全量**，按当前排序输出。

| 端点 | 鉴权 | 查询参数 | CSV 列（按显示顺序） |
|---|---|---|---|
| `GET /api/samples/export` | requireAuth | q / status / dept / type / limit_item / source / model / sort | 编号、名称、机型/站别、规格、类型、状态、复检状态、制作时间、发行时间、保管部门/储位、复检到期、更新时间 |
| `GET /api/fixtures/export` | requireAuth | status / dept / search / col / dir | 编号、名称、规格、部门、储位、状态、归还状态、保养状态、更新时间 |

约定（写入设计规则）：
- 导出权限与对应列表接口一致（登录即可，非 ADMIN 专属）
- 状态列输出中文（状态映射与前端一致：如 `RELEASED→已发行`、`TRANSFERRED→已移交`）
- 时间列输出 `YYYY-MM-DD HH:mm` 可读格式（非 UTC ISO）
- 文件名：`samples-YYYYMMDD-HHmm.csv` / `fixtures-YYYYMMDD-HHmm.csv`

### 4.3 前端（两列表加「导出 CSV」按钮）

- 按钮位置：样品列表在「查询」按钮旁；治具清单在「清除」按钮旁
- 交互：点击 → `location.href = '/api/samples/export?' + 当前筛选参数串`（直接触发浏览器下载，避免弹窗拦截）
- 参数串复用列表查询构建函数（samples 的 `_buildQueryParams`；fixtures 的 qs 组装，剔除 limit/offset）
- 小屏（XS/SM）：按钮与查询/清除按钮同行可换行，不破版

### 4.4 测试计划

在 tests/samples.test.js、tests/fixtures.test.js 追加导出用例：

1. 未登录 → 401
2. 登录 → 200 + `Content-Type: text/csv` + `Content-Disposition: attachment`
3. 响应以 `\uFEFF`（BOM）开头
4. 表头含中文列名；数据含中文状态
5. 筛选生效：`status=RELEASED` 导出的行均为该状态
6. 全量导出：导出行数 = 列表接口 `total`（忽略分页）
7. CSV 转义：含逗号/引号字段正确包裹

samples 当前 `deployed:false`，护栏（tests/helpers/deployed.js）放行数据写入类测试。

## 5. 设计规则条款（AGENTS.md §21 新增，标准能力固化）

> 用户已明确要求「作为标准设计加入设计规则中」，视为对 AGENTS.md 修改的授权。

**§21 列表导出标准（强制）**：

1. 每个含列表页的子系统 MUST 提供 `GET /api/<prefix>/export` 导出端点：
   - 复用列表筛选/排序参数，忽略分页取全量
   - 返回 BOM UTF-8 CSV（`shared/csv.js` 的 `sendCsv`）
   - 鉴权与对应列表接口一致
2. 前端列表页 MUST 提供「导出 CSV」按钮，复用列表查询参数串触发下载
3. 禁止各子系统自行重复实现 CSV 生成（复用 `shared/csv.js`）
4. 状态列 MUST 输出中文、时间列 MUST 输出 `YYYY-MM-DD HH:mm`

同步更新：
- AGENTS.md §3 目录结构（`shared/csv.js`）
- README.md API 表（两个导出端点）
- docs/operation-manual.md 用户操作说明书（导出操作说明）

## 6. 风险与子系统隔离

| 项 | 说明 |
|---|---|
| 共享文件 | `shared/csv.js` 为框架共享层，改动需样品/治具双系统回归（§6.1） |
| 交叉污染 | 导出端点分别在 samples/fixtures backend 注册，不跨子系统引用 |
| 已上线保护 | samples 当前 `deployed:false`，测试可写；若切换 `deployed:true` 后测试自动受护栏保护 |
| 数据量 | 全量导出大数据量时响应较大；先不做流式，后续按需演进 |

## 7. 回归验证清单

- [ ] 样品列表：筛选条件 → 导出 CSV → 行数 = 筛选后 total、列正确、中文正常
- [ ] 治具清单：排序 col/dir → 导出顺序与列表一致
- [ ] 未登录访问导出端点 → 401
- [ ] Excel/WPS 打开 CSV 中文无乱码（BOM）
- [ ] 样品/治具列表原有功能无回归（筛选/排序/分页/操作）
- [ ] 共享文件改动后双系统回归
- [ ] tests 全部通过（samples / fixtures / users）
- [ ] 文档同步（AGENTS.md §21 + 目录、README API 表、operation-manual）

## 8. 变更记录（交付时更新）

- 新增：shared/csv.js
- 新增：GET /api/samples/export、GET /api/fixtures/export
- 修改：subsystems/samples/frontend/js/views/list.js、subsystems/fixtures/frontend/js/views/list.js（导出按钮 + 参数复用）
- 修改：AGENTS.md（§21 + 目录）、README.md、docs/operation-manual.md
- 测试：tests/samples.test.js、tests/fixtures.test.js 追加导出用例
- 兼容性：不影响现有接口出入参；新增端点无破坏性
- 部署/回滚：重启服务即生效；回滚仅移除新端点与按钮
