# 样品编码原则说明

> 适用对象：样品管理子系统的样品编号（`sample_no`）生成与解析规则。
> 权威实现：`subsystems/samples/db/sample-code.js`（生成/解析/常量单一事实来源）。

## 1. 编码结构

样品编号为 **13 位结构化编码**，由 `-` 分隔为 5 段：

```
提供处(1) - 机型(6) - 组别(1) - 流水号(3) - 版次(2)
  C      - SF1225  - M       - 001      - 01
```

示例：`T-SF1225-M-004-01`

## 2. 分段规则

| 段位 | 长度 | 取值 | 规则来源 |
|---|---|---|---|
| 提供处 | 1 | `C`（客供）/ `T`（元山）/ `G`（元将五金塔岗分厂） | 新建样品时选择，存储值 `source_type` 与之相同 |
| 机型 | 6 | `[A-Za-z0-9]` 6 位 | 取自机型短码 `model` 前 6 位（`slice(0,6)`）；新建时系统校验机型短码 6~20 位且必须存在于 `sample_models` 主数据 |
| 组别 | 1 | `S` / `M` / `A` / `Q` / `E` / `I` | 站别中文映射（见下表），编码时由 `station` 转换 |
| 流水号 | 3 | `001` ~ `999` | 按「提供处 + 机型 + 组别」组合独立递增 |
| 版次 | 2 | `01` ~ `99` | 取标示卡版本 `card_version` 首个数字块；无数字默认 `01`，封顶 `99` |

### 组别映射（站别中文 → 组别代码）

| 站别 | 组别代码 |
|---|---|
| 扇叶组 | `S` |
| 马达组 | `M` |
| 成品组 | `A` |
| 品保部 | `Q` |
| SMT | `E` |
| 供应商 | `I` |

## 3. 流水号生成算法

1. 前缀 = 机型 6 位（如 `SF1225`），流水号在**整个机型内唯一**（跨提供处 C/T/G、跨组别 S/M/A/Q/E/I 共享 001~999 空间）。
2. 取号（原子自增，无竞态）：
   `INSERT INTO sample_seqs (prefix, cur_seq) VALUES (?, 1) ON DUPLICATE KEY UPDATE cur_seq = cur_seq + 1`
   随后 `SELECT cur_seq` 取值。
3. 下一个流水号 = `cur_seq`，不足 3 位左侧补零（`001` 起）。
4. **上限 999**：某机型已达 999 后，新申请报错 `该机型已达上限 999`，需更换机型。

### 并发处理

- 序列表原子自增消除 MAX+1 并发竞态；同机型并发创建时由 InnoDB 行锁串行化。
- 序号与 `createSample` 同事务：SAVEPOINT 回滚时序号一并回滚，重试不跳号、编号连续。
- 兜底：`samples.sample_no` 为 UNIQUE 索引，`dao.js createSample` 对唯一键冲突（`ER_DUP_ENTRY`）以 SAVEPOINT 重试最多 3 次。
- 手工删除样品后 `cur_seq` 不回退（不回号，安全）；外部直接 INSERT 带编号不更新序列表（已知限制）。

### 编号预览（不消耗序号）

`GET /api/samples/code-preview` 走只读模拟（存量机型 MAX+1），不写 `sample_seqs`；实际编号以提交后 `generateSampleCode` 结果为准。

## 4. 完整编号正则

```js
/^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-\d{3}-\d{2}$/
```

- 提供处仅允许 `C/T/G`；机型为 6 位字母数字；组别仅允许 `S/M/A/Q/E/I`；流水号 3 位数字；版次 2 位数字。
- `parseSampleCode(no)` 按此正则校验，合法则拆分返回 `{ source_type, model, group, seq, version }`，非法返回 `null`。

## 5. 生成与使用时机

| 场景 | 说明 |
|---|---|
| 新建样品（`POST /api/samples`） | 后端调用 `generateSampleCode` 生成编号并落库，前端展示实际结果 |
| 编号预览（`GET /api/samples/code-preview`） | 仅只读预览，不落库；以提交后实际生成为准 |
| 扫码识别 | 按**完整编号精确匹配**（`getSampleByNo`）或二维码 `qr_token` 匹配，不做模糊解析 |

## 6. 示例

| 编号 | 含义 |
|---|---|
| `T-SF1225-M-001-01` | 元山提供，机型 SF1225，马达组，第 1 件，版次 01 |
| `G-SF9225-A-002-01` | 塔岗分厂提供，机型 SF9225，成品组，第 2 件，版次 01 |
| `C-SF1202-A-001-01` | 客供，机型 SF1202，成品组，第 1 件，版次 01 |

> 同一「提供处+机型+组别」下流水号独立递增，互不串号；不同组合流水号均从 `001` 重新开始。

## 7. 变更注意事项（全链路）

编码规则属**高风险共用逻辑**，任何修改 MUST：

1. 同步修改 `sample-code.js` 中常量（`SOURCE_CODES`/`GROUP_CODES`）、正则（`PATTERN`）、生成/解析函数；
2. 评估存量样品编号兼容性：旧编号必须仍能被解析与精确匹配，建议仅对新样品应用新规则；
3. 排查下游：新建/预览接口（`routes-samples.js`）、扫码（`routes-scan.js`）、前端列表/详情/标示卡展示、测试用例（seed 数据、`tests/`）；
4. 组别/提供处新增映射需同步前端下拉数据源，避免编码生成与界面可选值不一致；
5. 流水号算法变更（如改为独立序列表）需评估并发与回滚方案，禁止直接删除 MAX+1 逻辑。
6. 序列表（`sample_seqs`）为流水号唯一事实来源：新建/预览/扫码逻辑改动 MUST 评估序列表一致性；部署顺序为「schema.sql 建表（重启自动）→ 初始化脚本回填存量 MAX → 新代码生效」。

## 8. 关联文件

| 文件 | 职责 |
|---|---|
| `subsystems/samples/db/sample-code.js` | 编码常量、正则、生成与解析（单一事实来源） |
| `subsystems/samples/db/dao.js` | `nextSampleNo`/`createSample`（含并发重试） |
| `subsystems/samples/backend/routes-samples.js` | 新建样品、编号预览、机型主数据校验 |
| `subsystems/samples/backend/routes-scan.js` | 扫码按编号/二维码精确匹配 |
| `subsystems/samples/db/init-sample-seqs.js` | 序列表初始化 CLI（dry-run / 实际执行，幂等） |
| `sample_seqs` 表（schema.sql） | 机型级流水号原子自增的事实来源 |
