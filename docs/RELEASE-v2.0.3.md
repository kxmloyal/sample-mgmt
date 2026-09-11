# RELEASE v2.0.3 — 版本号统一 + 应用内帮助补全 + 生产清理

> 发布日：2026-09-11 ｜ 前序：v2.0.2（规则书/部署教程/操作说明过时事实修正）
> 提交：`35b255d`（版本号统一）、`2604da5`（帮助补全 + bundle 重建）、本文档提交
> **生效方式**：本次为前端资源 + 元数据 + 文档 + 数据清理，**无需重启服务**（浏览器强刷即生效）；
> **无后端代码变更、无表结构变更**（未执行任何 DDL/DML 于业务表）。

## 1. 版本号统一（消除三套口径）

| 位置 | 旧值 | 新值 |
|---|---|---|
| `package.json` → `version` | `0.1.0` | **`2.0.3`** |
| `subsystems/control/manifest.json` | `1.0.0` | **`2.0.3`** |
| `subsystems/fixtures/manifest.json` | `1.0.0` | **`2.0.3`** |
| `subsystems/projects/manifest.json` | `1.0.0` | **`2.0.3`** |
| `subsystems/samples/manifest.json` | `1.0.0` | **`2.0.3`** |
| `subsystems/workbench/manifest.json` | `1.0.0` | **`2.0.3`** |

**版本约定（自此执行）**：发布号 = `package.json.version` = 5 个子系统 `manifest.json.version` = 最新 `docs/RELEASE-vX.Y.Z.md`。

**兼容性说明**：`manifest.version` 是插件协议字段（AGENTS §17.3），运行时仅用于启动日志（`server.js`）与 `/api/subsystems` 返回值展示，**无任何功能分支依赖它**，也不参与 `database.migrations` 判定 → 本次调整不影响迁移、鉴权与业务逻辑。`tests/subsystems.test.js` 中出现的 `2.0.0` 是该用例自造的临时 manifest 值，与本约定无关（已核对，无需改动）。

## 2. 应用内帮助补全（样品子系统）

`subsystems/samples/frontend/js/views/help-data.js`：**11 → 14 个模块**（顺带订正文件头「10个功能模块」的旧计数）。

| 新增模块 | 内容要点 |
|---|---|
| 机型视图（`#/wall`） | 入口（列表页按钮 + 导航）、卡片口径（后端聚合 `GET /api/samples/models?view=wall`，机型字典 60s 缓存、写操作即时失效）、点卡片 → `#/samples?model=X` 按机型筛列表、与样品列表的分工 |
| 柜位视图（`#/storagemap`） | 入口、四色图例（在柜 / 被领走(占位) / 退回审核 / 空位）、点格位 → 该格清单 → 样品详情（详情头部「📲 扫码操作」直达流转）、顶部两类告警（未入柜样品、储位格式须为 `N#样品柜C-R`）、管理员柜位行列配置（默认 3 列 × 9 行） |
| 取消样品 | 入口与可见条件（状态 `NEW`/`PRODUCED` **且** 管理员或该样品创建人）、**编号释放分层口径**（取消 `NEW` 释放可复用 / 取消 `PRODUCED` 仍占用永不复用；释放后取号回到最小可用号）、软删除与日志全量保留、不可撤销、已发行/保管中改走「申请退回 → 直接作废」 |

`subsystems/samples/frontend/js/views/help.js`：`HELP_PAGE_MAP` 与 `HELP_PAGE_TIPS` 补 `wall`、`storagemap`，使两个视图出现上下文提示条并支持「了解更多 →」精确跳到对应模块（原实现仅覆盖 dashboard/samples/new/scan/logs/users）。

**产物同步**：`node tools/build-bundles.js` 重建 → 5 个子系统 `frontend/js/bundle.js` 更新 → 5 个 `frontend/index.html` 的 `?v=` 统一为 **`bmtwxradf`**（`module.css?v=` 由构建脚本自动刷新）。samples bundle 首行 `/** BUNDLE vbmtwxradf — 30 files */`，模块计数 14，旧 `?v=` 残留 0。

## 3. 生产清理（先备份，后删除；全过程只读判定 + 可回滚）

### 3.1 孤儿文件（195 个）

| 对象 | 清理量 | 判定依据 |
|---|---|---|
| `public/uploads/` 根目录样品图 | **63 个** | 文件名前缀不匹配 `samples` 表任何现存 `sample_no`（74 行，含软删行）。**关键口径**：样品图片历史由 `routes-samples.js` 目录前缀扫描（`readdir` + `sample_no` 前缀匹配）生成，因此「仅目录存在、未写入 `produced_image`」的历史照片**不是孤儿**，一律保留 |
| `public/uploads/projects/` 任务附件 | **132 个 / 780KB** | 全库任何表均无引用（`project_task_files`、`project_extras` 均 0 行，dump 全文检索无命中）。成因：`dao-tasks.js` 删除任务时级联删除 `project_task_files` 行，但**不清理磁盘文件** |
| 合计 | 195 → 剩余 **61 个**，与被引用样品图数量**逐一对上** | |

**备份与证据**（删除前完成，均已校验条目数）：
- 全量打包：`/www/backup/sample-mgmt-uploads-20260911-203117.tar.gz`（260 条目 / 256 文件）
- 孤儿清单定档：`/www/backup/sample-mgmt-orphans-20260911-203117-images.txt`、`...-projects.txt`
- 删除前干跑（仅比对不删）：确认 F18 原始目标目录 `public/uploads/fixture_files/`、`control_files/` 本就是 0 文件

**回滚**：`tar -xzf /www/backup/sample-mgmt-uploads-20260911-203117.tar.gz -C /www/wwwroot/sample-mgmt`（按清单回填文件名即可恢复到清理前状态）。

### 3.2 探测表

| 库 | 表 | 处置 |
|---|---|---|
| `sample_mgmt`（生产） | `_tz_probe`（0 行） | `DROP TABLE` |
| `sample_mgmt_test`（测试） | `_upd_probe`（0 行） | `DROP TABLE` |
| 两库 | `_migr_sample_deleted_tz`（1 行） | **保留不动**——它是 `migrateSamplesDeletedAtTz` 的防重入哨兵，删除会导致迁移重跑并对 `deleted_at` 二次 `+8h`，属数据损坏级风险 |

`_idx_probe`、`_upd_probe`（生产）此前已不存在，本次核对确认。

## 4. 全链路影响与回归

| 维度 | 结论 |
|---|---|
| 代码层 | 仅 `help-data.js` / `help.js`（样品前端）与 5 个 `manifest.json` 的 `version`、`package.json` 的 `version`；无共享文件、无后端逻辑改动 → **不触发 §15.4 共享资源多系统回归**（bundle 重建属产物同步，4 个非 samples bundle 仅版本头 1 行变化，内容逐字节一致） |
| 数据库层 | 仅 `DROP TABLE` 两张 0 行探测表；业务表无 DDL/DML |
| 配置层 | 版本号字段；无环境变量/启动参数变化 |
| 接口层 | `GET /api/subsystems` 返回的 `version` 由 `1.0.0` 变为 `2.0.3`（纯展示字段）；`tests/subsystems.test.js` 断言用的是用例内自造值，**不受影响** |
| 文档层 | 新增本文档；`README.md`/`AGENTS.md`/`CLAUDE.md` 的业务描述不因本次改动过时（§3 发布说明清单与 §11/§14 技术债中的 `README` 容量数字为待同步项，见第 6 节） |

**回归清单（建议按序执行）**：
1. 样品子系统 → 右下角「?」→ 模块列表应出现 **14 个**模块；展开「机型视图」「柜位视图」「取消样品」内容完整无乱码。
2. 进入 `#/wall`：顶部出现「机型视图：按机型聚合的样品卡片墙…」提示条，点「了解更多」应直接展开对应模块。
3. 进入 `#/storagemap`：同上；格子点击 → 样品清单 → 样品详情正常。
4. 样品列表：取消一条「待制作」样品 → 弹窗文案为「编号释放…可被后续新样品复用」的修订版；取消后编号可被新样品复用。
5. 柜位视图应无「未入柜」误报（清理未触碰任何被引用图片）；抽查 3 条样品的详情图片与大图历史仍可正常显示。
6. 5 个子系统页面强制刷新（Ctrl+F5）后控制台无 `ReferenceError`。

**上线监控（1~3 个周期）**：`/www/wwwlogs/nodejs/sample_mgmt.log` 的 error 级条目；样品详情图片 404 计数（若出现即说明清理口径有误，立即按第 3.1 节回滚）；`/api/subsystems` 返回的 version 一致性。

## 5. 部署与回滚

- **部署**：本次改动已在生产目录落地（文件为静态资源与元数据），无需重启；浏览器强刷即可看到新帮助内容。
- **回滚**：`git revert 2604da5 35b255d`（可分段）；回滚 bundle 时须**同时**把 5 个 `index.html` 的 `?v=` 改回 `bmtwuntaz`，否则浏览器仍读新缓存。数据类回滚见 3.1/3.2 节。

## 6. 遗留与待决（未在本次实施）

| 项 | 说明 |
|---|---|
| `samples` 详情弹窗迁移 | 仍未复用 `shared/frontend/detail-modal.js`（AGENTS §18.6 缺口）。影响分析已产出：需先修共享组件的叠层取值缺陷（`detail-modal.js` 用 `querySelector` 取**第一个** mask/dialog，在「格位清单 → 详情」叠层场景会误命中底层窗；samples 自实现已修复该问题）并补懒渲染骨架钩子，再迁移 samples 并做 fixtures/projects 回归 |
| `README.md` 容量 | 20,248 字符（101.2%）越 20000 兜底线；用户决定不拆分，后续新增内容前须先等量精简 |
| `public/css/app.css` | 21,910 字符（109.6%）已超红线，按 §7.1 仅允许精简/重构（门户块拆独立样式文件，需三系统回归） |
| `flow-ops.js` 顶层函数 12 个 | 超 §7.2 上限（既有问题），建议按 NCR / 重工 / 出货结余三域拆分 |
| 规则文件容量数字 | `AGENTS.md` §3 发布说明清单需补 `RELEASE-v2.0.3.md`；`AGENTS.md` §14 / `CLAUDE.md` §6、§11 的 `README.md` 容量数字需由 98.4% 更新为 101.2%——**规则文件改动需用户明确授权**，本次未动 |
| `projects` 上线 | 用户决定暂不上线；因其 manifest 无 `deployed` 键，测试护栏对其仍不生效（已知取舍） |
| 治具 F18 | 原始目标目录 `public/uploads/fixture_files/` 本就是 0 文件，无需清理（本次已核对） |
