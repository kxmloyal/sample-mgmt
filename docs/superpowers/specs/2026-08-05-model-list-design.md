# 机型列表 + 新建表单/列表筛选联动 — 设计文档

> 日期：2026-08-05
> 状态：已确认（用户批准强制机型校验、本次不做编辑功能）
> 关联子系统：样品管理（samples）

## 1. 背景

样品编号第 2~7 位为机型短码（人工填入，如 `YD9015`），新建样品表单当前「机型」为文本输入、「规格/型号」为文本输入（placeholder 提示参考 BOM 表机型全称）。为统一机型口径、减少手输错误，新增「机型列表」管理能力：由研发中心（RD）与管理员（ADMIN）维护机型主数据，新建样品时规格/型号改为下拉选择，列表页新增按机型筛选。

## 2. 需求（已与用户确认）

1. 新增「机型列表」页面，仅 **RD + ADMIN** 可见并可维护（本次只做新增 + 删除，不做编辑）。
2. 新建样品时「规格/型号」栏位改为**下拉选择**（选项来自机型列表），**不允许手动输入**。
3. 选择规格/型号后「机型」编码栏**自动填入短码并只读**，编号预览随之联动。
4. 列表筛选区新增**按机型筛选**。
5. **强制校验**：新建样品时 `model` 必须存在于机型列表，否则拒绝创建。
6. 机型条目结构 = **短码 + 全称双字段**。
7. 删除策略：**被样品引用的机型禁止删除**。

## 3. 数据层设计

### 3.1 新表 sample_models

在 `subsystems/samples/db/schema.sql` 追加（幂等 `CREATE TABLE IF NOT EXISTS`）：

```sql
CREATE TABLE IF NOT EXISTS sample_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,          -- 机型短码：≥6 位，样品编号第2-7位取前6位
  full_name VARCHAR(200) NOT NULL,    -- 机型全称：规格/型号栏显示值
  created_by INT,                     -- 创建人 user.id
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_model_code (code),
  UNIQUE KEY uk_model_full_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- `manifest.json` 的 `database.tables` 追加声明：`{ "name": "sample_models", "schema": "db/schema.sql" }`
- 建表由框架 `initDB` 幂等执行，服务重启自动生效

### 3.2 dao.js 新增函数

| 函数 | 签名 | 说明 |
|---|---|---|
| `listModels` | `listModels()` → rows | 全量机型，按 code 升序 |
| `getModelById` | `getModelById(id)` → row \| null | 详情 |
| `getModelByCode` | `getModelByCode(code)` → row \| null | 按短码查（新建校验用） |
| `createModel` | `createModel({code, full_name, created_by})` → row | 插入，依赖唯一键兜底 |
| `deleteModel` | `deleteModel(id)` → void | 物理删除 |
| `countSamplesByModel` | `countSamplesByModel(code)` → number | 引用计数（删除前校验） |

### 3.3 列表查询扩展（listSamples / countAllSamples）

`listSamples(opts)` 与 `countAllSamples(opts)` 增加 `model` 精确筛选：

```js
if (opts.model) { where.push('model = ?'); params.push(opts.model); }
```

## 4. 后端 API 设计

路由注册在 `routes-samples.js`，**所有 models 路由必须注册在 `GET /api/samples/:id` 之前**（与 `code-preview` 同理，避免被 `/:id` 吞掉）。

### 4.1 机型管理接口（RD/ADMIN 专属）

| 方法 | 路径 | 入参 | 成功返回 | 失败 |
|---|---|---|---|---|
| GET | `/api/samples/models` | — | `[{id,code,full_name,created_at}]` | 401 未登录（所有登录角色可读，新建表单与筛选下拉共用） |
| POST | `/api/samples/models` | `{code, full_name}` | 新行 | 400 字段缺失/code<6 位；403 非 RD/ADMIN；409 code 或 full_name 重复 |
| DELETE | `/api/samples/models/:id` | — | `{ok:true}` | 404 不存在；403 非 RD/ADMIN；409 被样品引用 |

权限：GET 仅需 `requireAuth`（任何登录角色，供新建表单与列表筛选取数）；POST/DELETE 额外校验 `req.user.role ∈ [RD, ADMIN]`，否则 403。

校验规则（POST）：
- `code`：必填、trim 后长度 ≥6、≤20，大写化处理
- `full_name`：必填、trim 后非空
- 唯一冲突由 `ER_DUP_ENTRY` 捕获 → 409，提示「机型短码或全称已存在」

删除规则（DELETE）：
- `countSamplesByModel(code) > 0` → 409「该机型已被 N 个样品使用，禁止删除」

### 4.2 列表筛选参数扩展

`GET /api/samples` 的 `filterOpts` 增加 `model: model || undefined`（来自 `req.query.model`）。

### 4.3 新建样品强制校验

`POST /api/samples` 中，在现有 `model.trim().length < 6` 校验之后追加：

```js
const m = await D.getModelByCode(model.trim());
if (!m) return res.status(400).json({ error: '机型不存在，请先在机型列表添加该机型' });
```

## 5. 前端设计

### 5.1 机型列表页（新文件 `subsystems/samples/frontend/js/views/models.js`）

仿 `views/users.js` 风格（单页表格 + 顶部新增表单 + 异步刷新）：

- `viewModels()`：渲染顶部新增区（机型短码输入 `m-code` + 机型全称输入 `m-full-name` + 「新增机型」按钮）+ 机型表格（短码 / 全称 / 创建时间 / 操作）
- `loadModels()`：`GET /api/samples/models` 渲染表格，空列表显示「暂无机型」
- `addModel()`：`POST /api/samples/models`，成功 toast + 清空输入 + 刷新；失败 toast（含 409 重复提示）
- `deleteModel(id, code)`：`confirm('确认删除机型 xxx？')` → `DELETE /api/samples/models/:id`，409 提示引用

顶层函数 ≤10，单文件 ≤400 行（预计 ~80 行）。

### 5.2 前端导航新增（router.js + manifest 同步）

前端导航由 `subsystems/samples/frontend/js/router.js` **硬编码驱动**（非 manifest 渲染），需改三处并保持与 manifest 声明一致：

`router.js`：
- `NAV` 数组在 `{k:'new',...}` 之后插入 `{k:'models',t:'机型列表',roles:['ADMIN','RD']}`
- `VIEWS` 增加 `models:viewModels`
- `meta` 增加 `models:'机型列表'`

`manifest.json` `navigation` 在「新建样品」（key: new）之后同步插入（供门户/后端校验一致性）：

```json
{
  "key": "models",
  "label": "机型列表",
  "icon": "cube",
  "view": "viewModels",
  "roles": ["ADMIN", "RD"]
}
```

### 5.3 新建表单改造（`views/new.js`）

- `viewNew()` 渲染后异步加载机型列表：`GET /api/samples/models`
- 「机型」栏：`n-model` 改为只读 `fluent-text-field`（disabled 属性），不参与手动输入
- 「规格/型号」栏：`n-spec` 由文本输入改为 `fluent-select`：
  - 选项：`<fluent-option value="">请选择机型</fluent-option>` + 每个机型 `<fluent-option value="CODE">FULL_NAME</fluent-option>`（value=短码，label=全称）
  - 空列表时：`<fluent-option value="">暂无机型，请先到机型列表添加</fluent-option>`
- 联动：`n-spec` `change` 时 → `n-model.value = 选中 option 的 value（短码）` → 调用 `_schedulePreview()`
- 提交 `submitNew()`：`model` 取 `n-model.value`（短码），`spec` 取选中 option 的文本（全称，`n-spec.selectedOptions[0].text`）；`n-spec.value` 为空时提交空 spec、`model` 为空会命中后端「机型编码至少 6 位」校验
- 预览逻辑 `_refreshPreview()` 不变（`n-model` 已有短码）
- 首次进入表单时若机型列表为空：`n-spec` 仅显示提示项、`n-model` 保持空

### 5.4 列表筛选（`views/list.js` + `views/list-filter.js`）

- `list.js` 筛选区新增（放在 `#f-source` 之后）：

```js
'<fluent-select id="f-model" onchange="loadSamples()"><fluent-option value="">全部机型</fluent-option>' + modelOpts + '</fluent-select>'
```

- `modelOpts` 来源：`GET /api/samples/models`（label=全称，value=短码）+ 存量样品 `DISTINCT model` 中不在机型列表的短码补集（label 直接显示短码）—— 避免历史样品漏筛
- `list-filter.js` `_buildQueryParams` 增加：

```js
var mo = $('#f-model').value;
if (mo) p += '&model=' + encodeURIComponent(mo);
```

- `renderChips()` 增加机型 chip：`onclick` 清空 `#f-model` 并 `loadSamples()`

### 5.5 bundle 重建

- `tools/bundle-sources.json` samples 数组在 `views/users.js` 之后、`views/router.js` 之前插入 `"subsystems/samples/frontend/js/views/models.js"`
- 修改 `new.js` / `list.js` / `list-filter.js` 后执行：

```bash
node tools/build-bundles.js
# 复制 /tmp/bundle-samples.js → subsystems/samples/frontend/js/bundle.js
# 更新 samples/frontend/index.html 中 bundle.js?v=<ver>
```

## 6. 权限设计

| 操作 | 角色 |
|---|---|
| 进入机型列表页 / 新增 / 删除 | 仅 RD、ADMIN（后端 POST/DELETE 403 兜底，前端菜单按 NAV roles 渲染） |
| 读取机型列表（新建下拉 / 筛选下拉数据源） | 所有登录角色（GET requireAuth 即可） |
| 新建样品（含下拉选机型） | RD、ADMIN（现有逻辑） |
| 列表筛选按机型 | 所有可见样品列表的角色（QA/CUSTODY/ME/ADMIN/RD） |

## 7. 测试计划

新增 `tests/models.test.js`（沿用 samples.test.js 的 `helpers/setup.js` supertest + jest 模式）：

1. 新增机型成功（code ≥6、full_name 非空）
2. code 不足 6 位 → 400
3. code / full_name 重复 → 409
4. 非 RD/ADMIN（qa01 登录）GET models → 200；POST models → 403
5. 删除未被引用机型 → ok
6. 删除被引用机型（先用该 code 建样品）→ 409
7. `GET /api/samples?model=<code>` 只返回该机型样品

回归：

- `tests/samples.test.js`：`beforeAll` 预置测试用机型（幂等：POST 已存在返回 409 也视为成功），覆盖 seedSample/直接 POST 用到的全部 code（`SF1225`/`SF9225`/`MX1234`/`MY1234` 等），避免每个用例单独建机型
- `tests/sample-code.test.js`：纯函数不受影响，跑通即可

## 8. 兼容性与回归范围

- `samples` 表 `model`/`spec` 字段不变；`POST /api/samples` 入参不变（model 仍为短码字符串）
- 存量样品数据不受影响（不迁移、不改值）
- 删除机型不触碰历史样品文本字段
- 共享资源变更：仅新增样例子系统内文件 + `bundle-sources.json`，不涉及 `server.js`/`app.css`/`portal.html`；**fixtures/workbench 无回归**
- 前端回归：新建表单（选机型→预览→创建）、列表筛选（按机型→chips 移除）、机型列表页（增/删/409）

## 9. 部署与监控

- 部署：重启 4000 服务（schema 自动建表）→ 重建 bundle → 更新 index.html 版本号
- 回滚：撤销 commit 即可，表可保留（无害）
- 上线后 1~3 周期监控：新建样品是否频繁命中「机型不存在」提示（提示研发先维护机型列表）；机型删除 409 是否频繁
