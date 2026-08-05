# 样品 13 位结构化编码（sample-code）设计文档

- 日期：2026-08-05
- 状态：已确认（用户审批通过）
- 所属子系统：样品管理（samples）
- 关联需求：新建样品输入适配（站别→组别等）

## 1. 背景与目标

当前所有样品编号统一由 `dao.js#nextSampleNo()` 生成 `SM-XXXXXX`（基于 MAX(id)+1），
无法从编号上识别样品来源、机型、组别。现按业务要求，**所有新建样品**改用 13 位结构化编码：

```
G-YD9015-Q-001-01
│  │      │ │    └─ 版次(2位, 01~99, 取 card_version, 编号生成后永不变)
│  │      │ └────── 流水号(3位, 001~999, 按 提供处+机型+组别 独立递增)
│  │      └──────── 组别(1位): S=扇叶组 M=马达组 A=成品组 Q=品保部 E=SMT I=供应商
│  └──────────────── 机型(6位, 复用 model 字段, 人工填, 取前6位)
└─────────────────── 提供处(1位): C=客供 T=元山 G=元将五金塔岗分厂
```

**已确认的关键决策**（brainstorming 澄清结果）：

| 决策点 | 结论 |
|---|---|
| 适用范围 | 所有新建样品统一用 13 位编码 |
| 提供处客供代码 | 维持 **C**（不改为 0），沿用现有 `source_type` C/T/G |
| 机型 | 复用 `model` 字段，新建时人工填 6 位机型码，编码取前 6 位 |
| 组别 | 站别改为组别下拉（6 项），`station` 字段存储组别中文，编码时中文→代码映射 |
| 流水号 | 按「提供处+机型+组别」组合独立递增 001~999 |
| 版次 | 新建时取 `card_version`（默认 01），**sample_no 一旦生成永不改变**（重新发行 +1 不影响编号） |
| 实现方案 | 独立编码模块 `subsystems/samples/db/sample-code.js`（方案①） |
| 存量数据 | `SM-XXXXXX` 编号与 `station='调机样'` 历史数据零迁移、零重生成，展示不变 |

## 2. 编码规则定义

### 2.1 格式

- 正则：`^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-\d{3}-\d{2}$`
- 存储：带连字符 16 字符（`VARCHAR(20)` 可容纳），如 `G-YD9015-Q-001-01`

### 2.2 段定义

| 段位 | 长度 | 取值 | 来源 |
|---|---|---|---|
| 第 1 位 提供处 | 1 | C=客供 / T=元山 / G=元将五金塔岗分厂 | `source_type` 字段 |
| 第 2~7 位 机型 | 6 | 字母数字，人工填 | `model` 字段（取前 6 位） |
| 第 8 位 组别 | 1 | S/M/A/Q/E/I | `station` 字段（组别中文→代码） |
| 第 9~11 位 流水号 | 3 | 001~999 | 同「提供处+机型+组别」组合 MAX+1 |
| 第 12~13 位 版次 | 2 | 01~99 | `card_version` 字段 |

> 说明：编号字符串中段位与字符位置的对应关系为
> `X-XXXXXX-X-XXX-XX`（第 1 位提供处、第 3~8 位机型、第 10 位组别、第 12~14 位流水号、第 16~17 位版次）。

### 2.3 组别映射表（GROUP_CODES）

| 组别代码 | 组别中文 |
|---|---|
| S | 扇叶组 |
| M | 马达组 |
| A | 成品组 |
| Q | 品保部 |
| E | SMT |
| I | 供应商 |

### 2.4 边界规则

1. 机型不足 6 位 → 400「机型编码至少 6 位」；超过 6 位 → 截断取前 6
2. 同组合流水号达 999 后再创建 → 400「该 提供处+机型+组别 组合已达上限 999」
3. 组别无对应（历史 `调机样`）→ 不参与新编码（存量不重新生成）
4. 并发：沿用 `createSample` 现有 SAVEPOINT 重试（ER_DUP_ENTRY → 重算流水号重试 3 次）

## 3. 模块结构（方案①：独立编码模块）

### 3.1 新增 `subsystems/samples/db/sample-code.js`

| 导出 | 职责 |
|---|---|
| `SOURCE_CODES` | `{C:'客供', T:'元山', G:'元将五金塔岗分厂'}` |
| `GROUP_CODES` | `{扇叶组:'S', 马达组:'M', 成品组:'A', 品保部:'Q', SMT:'E', 供应商:'I'}` |
| `STATION_GROUPS` | 组别中文列表 `['扇叶组','马达组','成品组','品保部','SMT','供应商']`（供前端注入） |
| `PATTERN` | 编号正则（见 2.1） |
| `parseSampleCode(no)` | 解析各段：返回 `{source_type, model, group, seq, version}` 或 null |
| `generateSampleCode({source_type, model, station, card_version, conn})` | 组别中文→代码；机型取前 6 位；`conn` 事务内查同组合（`WHERE LEFT(sample_no,11)=前缀`）`MAX(SUBSTRING(sample_no,12,3))`+1（无 conn 用连接池）；返回完整编号 |

### 3.2 修改 `subsystems/samples/db/dao.js`

- `nextSampleNo(conn)` 改为调 `generateSampleCode({source_type, model, station, card_version, conn})`
- `createSample(data, conn)` 传入新增必填字段：`source_type` / `model` / `station` / `card_version`
- `SM-` 旧生成逻辑保留注释（兼容标注，不物理删除）

## 4. 前端适配

| 文件 | 改动 |
|---|---|
| `frontend/js/constants.js` | `STATIONS` 4 项 → 6 项：`['扇叶组','马达组','成品组','品保部','SMT','供应商']`（删「调机样」） |
| `frontend/js/views/new.js` | 表单重构（见 4.1）+ 编号实时预览 |
| `frontend/js/views/detail.js` | 站别编辑下拉同步 6 组别（第 134 行来源下拉 C/T/G 不变） |

### 4.1 新建表单（new.js）

- **基础信息区（全必填）**：样品名称*、提供处*（C/T/G 下拉）、机型*（6 位校验，placeholder 提示）、组别*（6 项下拉）
- **限度样品信息区（选填）**：样品类型 OK/NG、限度项目、版次（默认 `01`）、标准范围（原「来源」下移不再显示——提供处已在基础区）
- **编号实时预览**：提供处/机型/组别输入变化时 debounce（300ms）调 `GET /api/samples/code-preview`，在表单下方显示「编号预览：G-YD9015-Q-001-01」；预览与实际提交之间并发差异以提交后 toast 显示的实际编号为准
- `submitNew` payload 补 `source_type` / `card_version`（默认 '01'）；保留 model/station

## 5. 后端适配

| 文件 | 改动 |
|---|---|
| `backend/routes-samples.js` | ① POST 新增必填校验：`name` / `model`(≥6位) / `station`(∈6组别) / `source_type`(∈C,T,G)，缺失 400 明确提示；`card_version` 缺省 `'01'`；② 新增 `GET /api/samples/code-preview`（requireAuth，只读查 MAX+1 不落库，返回 `{sample_no}`） |
| `backend/routes-scan.js` | 无需改：RECREATE 替代品走 `createSample` 内部统一生成新编码 |

## 6. 全链路依赖清单（5 维度）

| 维度 | 关联点 | 动作 |
|---|---|---|
| 代码 | `dao.js` / `routes-samples.js` / `routes-scan.js` / `routes/misc.js` / `new.js` / `constants.js` / `detail.js` / `list-render.js` / `card-page.js` / `card-html.js` / `seed.js` / `seed-samples.js` | 按 4/5 节同步；`list-render.js`、`card-page.js`、`card-html.js` 站别中文直显不变，无需改 |
| SQL | `samples` 表 | 无结构变更，无迁移 |
| 配置 | `data/source-types.json` 不变（客供维持 C）；`STATIONS` 常量变更 | 同步 |
| 接口 | `POST /api/samples` 出入参语义变化；新增 `GET /api/samples/code-preview` | 旧调用方适配（见 7 节）；新接口文档化 |
| 文档 | README 新建说明 / 操作手册「站别→组别」 | 同步更新 |

## 7. 数据与测试适配（关键影响面）

新规则下**存量种子与测试的创建调用需同步适配**（station 传组别中文、model 传 6 位码、补 source_type）：

| 文件 | 适配内容 |
|---|---|
| `subsystems/samples/seed/seed.js` | 15 条：`station='调机样'`（s6）改有效组别；model 超 6 位截断、缺 source_type 的补齐 |
| `seed-samples.js` | 同上适配 |
| `tests/samples.test.js` | `seedSample`/`seedSampleWithLimit` 及所有直接 POST 用例补齐新必填字段（如 `station:'SX'→'马达组'`、model 6 位、source_type） |
| `tests/fixture*` / `tests/workbench*` | 排查是否直接 POST /api/samples（预期无）；仅回归 |

**新增单测 `tests/sample-code.test.js`**（独立、无 DB 依赖的纯函数测试 + 接口测试）：

1. 格式正则：合法/非法编号判定
2. 组别映射 6 项全覆盖（中文→代码）
3. 流水号同组合递增、跨组合独立（mock 查询或真实 DB）
4. 机型截断（>6 位取前 6）与不足报错
5. 版次默认 01
6. 999 溢出报错
7. `code-preview` 接口返回格式

## 8. 回归与部署

1. samples 全量单测（`sudo -A -u www npx jest`）
2. fixtures / workbench 双系统回归（确认共享文件 `routes/misc.js` 行为不变，子系统隔离原则）
3. **MUST 重建 bundle**：`node tools/build-bundles.js` + 复制 + 更新版本号（JS 修改触发，AGENTS.md 19.4）
4. 前端手动验证清单：新建预览 → 创建（编号格式）→ 列表 → 详情编辑 → 标示卡 → 扫码 → 打印标签
5. 兼容说明：存量 `SM-` 编号与 `调机样` 数据零迁移零重生成；上线后 1~3 周期监控新建编号格式与流水号连续性
6. 部署/回滚：重启服务即可生效（4000 端口）；回滚仅需还原代码 + 重启（无 DB 变更）

## 9. 风险与边界

- **预览与提交差异**：code-preview 只读不落库，并发下预览编号可能与实际不同——以提交后返回为准（toast 提示）
- **测试适配量大**：samples.test.js 多数用例需补必填字段，改动集中在 helper 函数（seedSample / seedSampleWithLimit），单点修改可覆盖大部分
- **seed 数据**：s6 `调机样` 需人工指定新组别（建议「成品组」），其余机械适配
