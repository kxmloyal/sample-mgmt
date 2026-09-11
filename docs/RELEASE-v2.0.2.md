# Release Notes — v2.0.2

> **发布日期**：2026-09-11 · **基线提交**：`fde4e8c` · **变更规模**：修改 21 文件 / +139 / −81（文档 10 + 前端 11）+ 归档重命名 35 文件 + 新增本发布说明
>
> 本次为**文档一致性治理版**：不改接口、不改状态机、不改数据库结构。仅修正规则书 / 部署教程 / 操作说明中的过时事实，使前端「取消样品」提示与实现一致，并归档已完成迭代的设计文档。

---

## 概述

自 v2.0.1 以来系统连续迭代（管制流程上线、治具上线、样品领用归还、机型视图、柜位视图、样品编号释放、测试库隔离），但**规则书与说明书未同步**，累积 21 项过时表述，其中 **3 项为 P0 级**——会导致新环境部署失败或引导使用者违规操作。v2.0.2 完成口径对齐。

---

## 一、P0 修正（3 项）

| # | 位置 | 修正前 | 修正后 | 依据（实证） |
|---|---|---|---|---|
| P0-1 | `docs/deploy-baota.md`（8 处）+ `AGENTS.md §2/§3/§12` + `CLAUDE.md §1` + `README.md` | MariaDB（或 MySQL 5.7+） | **MySQL 8.0.13+**（明确不支持 MariaDB / 5.7） | 「取消 NEW 释放编号」依赖函数唯一索引 `uk_sample_no_live` = `((IF(deleted_at IS NULL, sample_no, NULL)))`；**MariaDB 无表达式索引**，迁移失败后旧 `sample_no` 唯一索引仍生效 → 复用编号必报 `ER_DUP_ENTRY`，建样失败 |
| P0-2 | `AGENTS.md §23.4.3` / `CLAUDE.md §20.2.3` | 「启动脚本已加固：实例已运行则跳过并同步 PID」 | **如实描述：当前无任何守卫**，无条件 `nohup node server.js &` 并覆写 PID 文件 → **严禁执行** | 生产仓 `grep -cE 'pgrep\|ss -ltnp\|已在运行\|exit 0' sample_mgmt_start.sh` = **0**（文档承诺的安全护栏不存在） |
| P0-3 | `docs/deploy-baota.md §7`、`docs/subsystem-management-guide.md`（4 处） | `pm2 restart sample-mgmt`；「改 manifest 后需重启」表述与 §17.8 冲突 | 重启由运维在**宝塔面板 → Node 项目 → 停止 → 启动**；并说明**新增子系统路由不热挂载**的原因（`POST /api/subsystems` 不调用新子系统的 `register(app)`） | AGENTS §23 硬性禁令 + `routes/subsystems.js:172-174` 仅导出 `register/scanSubsystems/registry` |

> 说明：P0-3 经复核发现原判断需修正——「需重启才生效」**本身是对的**，错的是重启方式（`pm2`）与 §17.8 声称的「热重载、无需重启」。

## 二、P1 修正（事实错误 / 口径不一致）

| 位置 | 修正内容 |
|---|---|
| `AGENTS.md §20.4` / `CLAUDE.md §18.1` | 已上线清单**补 `workbench`**（manifest `deployed:true`，无自有数据表，仅聚合） |
| `docs/fixtures-flow-report.md` | fixtures 状态 `deployed:false` → **`deployed:true`（2026-09-08 授权上线）** |
| `docs/role-permission-matrix.md` | workbench `deployed:false`（未上线）→ **`deployed:true`（已上线）** |
| `docs/deploy-baota.md` | 门户卡片「三张」→ **四张**（管制/样品/治具/工作台）；projects 可见性由 `roles.use=["ADMIN"]` 更正为**未声明 `deployed`**；seed-fixture 护栏说明；验收项 `npm start` → 宝塔面板 |
| `AGENTS.md §19.1/19.2` + `CLAUDE.md §17` | bundle 子系统数 **3/4 → 5**（control/fixtures/projects/samples/workbench）；补 `rm -f /tmp/bundle-*.js`（属主不同会 EACCES）；计数与大小改用构建器实测值；构建事实来源由 `index.html` 更正为 `tools/bundle-sources.json` |
| `docs/RELEASE-v2.0.1.md` | 追加**修订说明**：原文「测试当前连接生产库」已被 `fde4e8c`（独立测试库强制）取代（保留原文以存历史） |
| `AGENTS.md §14` / `CLAUDE.md §6/§11` | 容量数据实测校正：`public/css/app.css` 21,910 字符（**109.6%，已超 20000 红线**）、`README.md` 98.4%、`routes-samples.js` 89.2%；`dao.js` 已回落至 167 行 / 9,961 字符（≈49.8%）；`db/migrations.js` 顶层函数超限条目标记为**已解决** |
| `docs/operation-manual.md` / `docs/样品系统操作说明.md` | 「取消样品」由「删除样品及关联日志（不可恢复）」更正为**软删除 + 日志全量保留 + 编号按状态分层**；新增**柜位视图**章节；补充取号规则；更新日期至 2026-09-11 |

## 三、前端文案修正

`subsystems/samples/frontend/js/views/list.js` 取消确认弹窗：

- 修正前：`确认取消该样品？此操作不可撤销，将同时删除关联日志。`（日志实际全量保留，与「全量留痕」冲突）
- 修正后：`确认取消该样品？此操作不可撤销（软删除，操作日志保留）。编号占用：取消「待制作」样品的编号会被释放、可被后续新样品复用；取消「制作完成」样品的编号仍占用、永不复用。`

**bundle 重建**：版本 `bmtwuht8n`，5 个子系统 `bundle.js` + `index.html` 同步；`module.css?v=` 由构建脚本自动刷新。

## 四、归档（35 份）

`docs/superpowers/{specs,plans}` 中**已实施落地**的 22 份设计文档 + 13 份实现计划 → `docs/archive/{specs,plans}`（`git mv`，保留历史）。

**保留 2 份**（部分实施，未归档）：`2026-09-03-detail-modal-design-system.md`（spec + plan）。共享层 `shared/frontend/detail-modal.js` 已落地并被 fixtures / projects 接入，但 **samples 仍为自建弹窗**（`subsystems/samples/frontend/js/views/detail.js`），与 AGENTS.md §18.6「各子系统详情弹窗 MUST 复用 `openDetailModal`」不符 → 待 samples 迁移后再归档。

## 五、兼容性与影响

- **无接口 / 状态机 / 数据库结构变更**，无兼容性破坏；`db.js init()` 迁移逻辑未改动。
- 前端 bundle 重建后仅 **samples 内容变化**（1 行 confirm 文案），其余 4 个子系统与线上**逐字节一致**（源码零漂移实证，见验证记录）。
- **版本口径**：`package.json version` 仍为 `0.1.0`，与文档发布号 v2.0.x 不联动（历史遗留，待用户决定是否统一）。

## 六、部署与回滚

```bash
cd /www/wwwroot/sample-mgmt
git pull                 # 或按 §7 流程更新
# 前端已随仓库更新（bundle.js + index.html ?v=bmtwuht8n），用户刷新页面即生效
# 后端未改动 → 无需重启（如需重启，由运维在宝塔面板执行，AGENTS.md §23）
```

**回滚**：`git revert <commit>`（文档提交可单独回滚）；若回滚 bundle，须同时把各 `index.html` 的 `?v=` 改回旧值，否则浏览器仍吃新缓存。

## 七、验证记录

| 验证项 | 结果 |
|---|---|
| 文档修正锚点脚本 | 61 处锚点**全部命中且仅命中 1 次**；旧事实残留复检 **0 处** |
| bundle 语法 | 5 个 `/tmp/bundle-*.js` 全部 `node --check` 通过 |
| 源码漂移 | control / fixtures / projects / workbench 与线上 bundle **逐字节一致**（忽略首行版本号）；samples 差异 = 本次 1 行文案 |
| 产物落地 | `md5sum /tmp/bundle-samples.js` == `md5sum subsystems/samples/frontend/js/bundle.js` = `181742a613718fa9fd8def1cbfab30c1` |
| 文案生效 | 旧文案 `grep -c` = **0**；新文案 `grep -c` = **1**；5 个 `index.html` 均为 `?v=bmtwuht8n` |
| 归档 | 35 份已移动；`docs/superpowers/{specs,plans}` 各仅剩 1 份（detail-modal） |

---

## 遗留待决（本版未处理）

1. **samples 详情弹窗迁移**至 `shared/frontend/detail-modal.js`（§18.6 合规缺口，原 spec/plan 保留在 superpowers 待续）。
2. `package.json` 版本与发布号是否统一。
3. `sample_mgmt_start.sh` 是否按原设计加「已运行则跳过」守卫（P0-2 目前仅修文档，未改脚本）。
4. `public/css/app.css` 已超 20000 字符红线，需拆分方案。
