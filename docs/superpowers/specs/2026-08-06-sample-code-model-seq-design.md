# 样品流水号「机型级递增」设计（独立序列表方案）

> 日期：2026-08-06
> 状态：已确认（brainstorming 完成）
> 权威实现：`subsystems/samples/db/sample-code.js`、`subsystems/samples/db/dao.js`
> 关联规则文档：`docs/sample-code-encoding.md`

## 1. 背景与目标

当前样品编号流水号按「提供处 + 机型 + 组别」组合独立递增（`MAX(SUBSTRING(sample_no,12,3))+1 WHERE LEFT(sample_no,11)=前缀`）。
需求：改为**按机型递增**——同一 6 位机型下跨提供处（C/T/G）、跨组别（S/M/A/Q/E/I）共享 001~999 流水号空间。

决策点（已与用户确认）：
1. **组别段保留**：编号结构不变，仅流水号分配逻辑变化
2. **存量不迁移**：线上存量编号原样保留，新号取号时计入存量（防新旧冲突）
3. **纯机型前缀**：流水号前缀 = 机型 6 位（跨提供处共享）
4. **实现方案**：方案 B——独立序列表 + 原子自增，消除 MAX+1 并发竞态

## 2. 编号规则变更

- 编号结构**不变**：`提供处(1)-机型(6)-组别(1)-流水号(3)-版次(2)`，如 `T-SF1225-M-001-01`
- 正则/PATTERN/parseSampleCode **不变**
- 流水号语义：机型级唯一（同机型下 `001` 只出现一次，无论提供处/组别）
- 上限：机型级 999，达到报错「该机型已达上限 999」（业务需知晓：比原组合上限更早触发）
- 存量编号原样保留；新号取号时对存量记录计入（初始化脚本搬入 MAX）

## 3. 数据层设计

### 3.1 新增序列表（schema.sql 追加，幂等建表）

```sql
CREATE TABLE IF NOT EXISTS sample_seqs (
  prefix VARCHAR(16) PRIMARY KEY,      -- 机型 6 位
  cur_seq INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- 框架 `initDB()` 每次启动幂等执行 `CREATE TABLE IF NOT EXISTS`，重启即建表，已上线库无影响

### 3.2 一次性初始化脚本（幂等，可重复执行）

把存量各机型 MAX 流水号搬入序列表，新号从存量续号：

```sql
INSERT INTO sample_seqs (prefix, cur_seq)
SELECT SUBSTRING(sample_no, 3, 6),
       MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED))
FROM samples
WHERE sample_no REGEXP '^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-[0-9]{3}-[0-9]{2}$'
GROUP BY SUBSTRING(sample_no, 3, 6)
AS new
ON DUPLICATE KEY UPDATE cur_seq = GREATEST(cur_seq, new.cur_seq);
```

- 使用 MySQL 8.0 别名语法（`VALUES()` 已弃用），`GREATEST` 保证幂等安全

## 4. 取号与预览分离（核心）

### 4.1 实际取号 `generateSampleCode(opts)`

- `prefix = 机型 6 位`（`String(opts.model).slice(0,6)`，校验 ≥6 位）
- 原子取号（单条 SQL，无竞态）：
  ```sql
  INSERT INTO sample_seqs (prefix, cur_seq) VALUES (?, 1)
  ON DUPLICATE KEY UPDATE cur_seq = cur_seq + 1
  -- 随后 SELECT cur_seq FROM sample_seqs WHERE prefix = ?
  ```
- `cur_seq > 999` 抛错 `该机型已达上限 999`
- 返回编号仍为 `提供处-机型-组别-流水号-版次`
- **必须**在事务连接（conn）内调用；无事务调用仅限测试（会跳号，文档标注）
- 校验保留：提供处/组别/机型校验与现有逻辑一致

### 4.2 编号预览 `previewSampleCode(opts)`（新增，只读）

- code-preview 端点当前直接调 `generateSampleCode`，若改为序列表取号，**每次预览都会消耗序号**（不可接受）
- 预览改为只读模拟：`SELECT COALESCE(MAX(CAST(SUBSTRING(sample_no,12,3) AS UNSIGNED)),0)+1 AS m FROM samples WHERE SUBSTRING(sample_no,3,6)=?`（不写序列表）
- 若模拟值 >999，预览同样提示上限
- 预览仅供展示，实际以提交后 `generateSampleCode` 结果为准（保留现有注释语义）

## 5. 事务与并发

- 序列表原子自增在 `createSample` 同一事务（conn）内执行
- 现有 SAVEPOINT 重试保留：冲突（ER_DUP_ENTRY）回滚到 SAVEPOINT 时，序列表自增**一并回滚**，重试重新取号 → 编号连续无跳号
- 原子自增消除同机型并发取同号窗口；ER_DUP_ENTRY 重试 3 次仍为最终兜底
- 手工删除样品后 cur_seq 不回退（不回号，安全）
- 外部直接 INSERT samples 带编号不更新序列表（已知限制，文档标注）

## 6. 全链路同步清单

| 位置 | 改动 |
|---|---|
| `subsystems/samples/db/sample-code.js` | 前缀改机型、取号改序列表原子自增、新增 `previewSampleCode`、错误文案「该机型已达上限 999」、注释同步 |
| `subsystems/samples/db/dao.js` | `nextSampleNo` 传参不变（内部逻辑变）；`createSample` SAVEPOINT 重试保留 |
| `subsystems/samples/backend/routes-samples.js` | code-preview 改调 `previewSampleCode`（只读） |
| `subsystems/samples/db/schema.sql` | 新增 `sample_seqs` 表 |
| `subsystems/samples/seed/seed.js` | 编号生成规则注释同步（samples 已上线，seed 护栏拒绝执行，不改数据） |
| `docs/sample-code-encoding.md` | §3 流水号算法/并发/上限、§7 变更说明、§8 关联文件全文同步 |
| `tests/sample-code.test.js` | 用例改机型级递增 + 新增预览不消耗序号/存量续号/机型上限用例 |
| 前端（列表/详情/标示卡/扫码） | 零改动（编号结构不变） |

## 7. 测试计划（TDD）

### 单元（sample-code.test.js）
- 同机型跨提供处/组别共享递增（`fakeSeqQuery` mock 序列表自增）
- 不同机型各自独立递增
- 预览不消耗序号（`previewSampleCode` 调只读查询，序列表无写）
- `cur_seq=999` 抛机型上限错误
- `parseSampleCode` / `PATTERN` 回归（结构未变）

### 集成（routes 层，supertest）
- POST /api/samples 同机型连续创建不同提供处/组别样品 → 流水号递增且不冲突
- code-preview 反复调用后，实际创建编号不受预览影响（预览不消耗序号）

### 回归
- 扫码精确匹配（getSampleByNo/qr_token）不受影响
- 标示卡生成、列表 CSV 导出不受影响

## 8. 风险与兼容

- **兼容**：存量编号解析不变；机型段提取覆盖所有存量编号；新老编号可共存
- **已知限制**：手工外部 INSERT 不更新序列表；机型 999 上限更早触发
- **高危项**：`sample_seqs` 建表 + 初始化脚本须在部署时先执行；代码与表同时上线，旧逻辑（MAX+1）与新表无冲突；samples 已上线（deployed:true），**禁止对 samples 表注入测试数据**，集成测试须用独立测试库或只读验证
