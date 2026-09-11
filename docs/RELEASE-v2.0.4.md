# RELEASE v2.0.4 — 详情弹窗设计系统收敛（共享组件缺陷修复 + samples 迁移）

> 发布日：2026-09-11 ｜ 前序：v2.0.3（版本号统一 + 应用内帮助补全 + 生产清理）
> 提交：`7bdffa8`（共享组件缺陷修复 + fixtures/projects 回归面）、`2b9eedb`（samples 迁移）、`0d57c4c`（bundle 重建）、`705c963`（行尾归一化 + 重建）、`ec0fc58`（测试断言修正）、本发布说明
> **生效方式**：纯前端资源替换（`bundle.js` + `index.html` 版本号），**无需重启服务**，浏览器强刷（Ctrl+F5）即生效；当前资源版本 **`bmtwzbj0j`**
> **无后端代码变更、无表结构变更（无 DDL/DML）、无数据变更、无新增依赖**

## 1. 版本号统一（延续 v2.0.3 约定）

| 位置 | 旧值 | 新值 |
|---|---|---|
| `package.json` → `version` | `2.0.3` | **`2.0.4`** |
| `subsystems/{control,fixtures,projects,samples,workbench}/manifest.json` → `version` | `2.0.3` | **`2.0.4`** |

**版本约定**：发布号 = `package.json.version` = 5 个子系统 `manifest.json.version` = 最新 `docs/RELEASE-vX.Y.Z.md`（AGENTS §13）。`manifest.version` 仅用于启动日志与 `/api/subsystems` 展示，无功能分支依赖，本次调整不影响迁移/鉴权/业务逻辑。

## 2. 变更范围

### 2.1 step1：共享详情弹窗组件修复 4 个真实缺陷（`shared/frontend/detail-modal.js`）

| # | 缺陷 | 旧实现 | 新实现 | 业务后果（修复前） |
|---|---|---|---|---|
| 1 | **叠层取值缺陷** | 密度类与内容经文档级 `querySelector` 取「第一个」匹配（层级选择器取到 `dialog`、类选择器取到 `body`） | 一律只写本实例 `myMask()` 内的节点 | 「柜位格位清单 → 样品详情」叠层时，详情内容与宽度类被灌进底层清单窗，详情自身空白 |
| 2 | **全局单例串窗** | `window.__dmSwitch/__dmSetDirty/__dmClose` 被每个实例覆盖为同一全局函数 | 回调传 `this`，经 `el.closest('.modal-mask').__dmApi` 反查所属实例 | 两个详情弹窗并存时，操作旧窗会驱动新窗状态 |
| 3 | **密度类名空转** | 默认表与 fixtures 传 `dm-high/dm-mid/dm-low` | 订正为 `app.css` 真实生效的 `d-high/d-mid/d-low` | 密度自适应长期不生效：fixtures 概览 Tab 停留在厂商 `.control` 默认 640px |
| 4 | **projects 漏登记共享组件** | `tools/bundle-sources.json` projects 数组未登记 `shared/frontend/detail-modal.js`，而其源文件已调用 | 补登记（28 → 29 源） | 打开项目详情弹窗即 `ReferenceError: openDetailModal is not defined`（projects 未上线，故未暴露） |

### 2.2 step1：新增可选钩子（向后兼容，既有调用方无需改动）

`skeleton(key)` + `lazyTabs[]`（骨架先行、下一帧写真实内容并带过期丢弃）、`isDirty()`（子系统托管未保存态，优先于组件内部标记）、`dirtyMsg:{switch,close}`（覆盖拦截文案）、`onClosed()`、`getTab()`、`isOpen()`、`setDirty(false)` 显式清态、`reload()` 记住末次 id。默认密度表 `info/card/overview → d-high`、`logs/files/image → d-low`。

### 2.3 step2：samples 详情弹窗迁移至共享组件（`subsystems/samples/frontend/js/views/detail.js`）

| 行为 | 迁移前 | 迁移后（等价） |
|---|---|---|
| 交互外壳 | 自建 `openModal` + 自建 Tab/遮罩/关闭/dirty 逻辑 | 组件配置式（`fetchData`/`buildHead`/`tabs`/`buildTabContent`/`footer`/`onClosed`） |
| 骨架屏先行 | 自建骨架 HTML | 组件 `skeleton`（同一样式类） |
| Tab 懒渲染 | `setTimeout` + 过期丢弃 | `lazyTabs:['logs','image']` + 渲染序号丢弃 |
| 未保存拦截 | 自建 `confirm` | `isDirty` + `dirtyMsg`（**文案逐字保留**） |
| 标示卡回显 / 历史图 / 409 自动刷新 | 自建 | `onTabRendered` + `_sdm.reload()` |
| 扫码操作深链 | 先关全部 `.modal-mask` 再 `location.hash='#/scan?no='` | 顺序与实现保留（仅改为调用组件关闭） |
| 对外入口 | `viewDetail(id)` / `renderTab(tab,id)` | **签名不变**，列表/看板/柜位视图调用点零改动 |

`subsystems/samples/frontend/js/views/detail-card.js`：`reloadDetail` 改为 `_sdm.reload()`、下线 `tryCloseDetail`、409 分支对接；`_detailDirty` 保留。

### 2.4 文档与规则同步

- **设计文档归档**：`docs/superpowers/{specs,plans}/2026-09-03-detail-modal-design-system.md` → `docs/archive/{specs,plans}/`（相对链接 `../specs/` 仍有效），状态标记改为「已实施」
- **路径同步**：`AGENTS.md` §18.6 权威依据路径、`README.md` 规范路径（**长度中性，未越 20000 字符兜底线**）
- **AGENTS.md** §3 发布说明清单新增 `RELEASE-v2.0.4.md`、§13 版本号现值 → 2.0.4

## 3. 全链路影响与回归

### 3.1 依赖清单（5 维度）

| 维度 | 结论 |
|---|---|
| 代码层 | `openDetailModal` 调用方 3 家：samples、fixtures、projects；共享组件 1 份；测试 2 处（`tests/samples-storage-map.test.js` 断言适配、新增 `tests/detail-modal-shared.test.js`） |
| 配置层 | `tools/bundle-sources.json`：samples 30 → 31 源、projects 28 → 29 源（fixtures 原已登记） |
| 接口层 | **无变更**（未触碰任何 API 路由与出入参） |
| 数据库层 | **无变更**（未执行任何 DDL/DML，无迁移脚本改动） |
| 文档层 | AGENTS.md、README.md、设计文档归档、本发布说明 |
| 共享资源隔离 | 改动 `shared/frontend/detail-modal.js`（共享层）→ 已做**三系统回归**（samples / fixtures / projects），control / workbench 未接入该组件（bundle 内 0 处引用） |

### 3.2 回归证据

| 项 | 结果 |
|---|---|
| 新增行为回归 | `tests/detail-modal-shared.test.js` **12 项全通过**：叠层不污染底层窗 / 多实例互不串窗 / dirty 文案与取消 / 懒渲染两帧 / 默认密度类名与 `app.css` 规则一致 / 调用方 MUST 登记组件（防漏登记） |
| 关联契约用例 | `tests/samples-storage-map.test.js` 13 项、`tests/samples-detail-scan-jump.test.js` 4 项，全通过 |
| 全量回归（40 个套件） | **39 个套件取得明确结果**：28 个逐套件独立运行（21 PASS + 7 全跳过〔§20 上线护栏〕）、另 11 个在多轮整批运行中 PASS；**唯一 FAIL 为预存缺陷 `tests/users.test.js`（4 例：2 × `Lock wait timeout exceeded`、2 × 30s 超时）**，与本次改动无关 |
| 构建产物 | 5 × `bundle.js` `node --check` 通过；samples/fixtures/projects bundle 各含 1 处 `function openDetailModal` 定义；行尾统一后 5 个 bundle 均为 LF |
| 线上冒烟（只读） | 5 个子系统 `index.html` 与 `bundle.js?v=bmtwzbj0j` 均 200、`/health` 200；服务进程全程**未重启** |

**环境阻塞说明（预存，非本次引入）**：全量套件在**同一 jest 进程**内运行时，约第 13 个套件后会出现 `mysql2` 握手解码 `cesu8` 致命错误（`Error: Encoding not recognized: 'cesu8'` → 进程崩溃、无汇总行），受影响的套件被 jest 标记为 `Test suite failed to run`（**非真实断言失败**）。绕过方式：一套件一进程运行，本次即以此取得完整覆盖。本批次改动文件 **0 个后端 / 0 个 SQL / 0 个依赖**，与该问题无因果关系。建议单独立项（升级或固定 `mysql2` 的握手字符集处理）。

### 3.3 手工回归清单（需人眼确认）

1. 样品列表 → 详情：骨架屏 → 四 Tab（信息/标示卡/日志/大图）切换，弹窗宽度随密度切换（960/800/640px）
2. **叠层场景（本批次重点）**：样品列表 → 「柜位格位清单」→ 某格样品详情 → 内容与宽度只作用于新窗，底层清单窗不变；关闭详情后清单窗仍可操作
3. 标示卡 Tab：修改字段后切 Tab → 「标示卡有未保存的修改，切换将丢失，继续？」；点遮罩/关闭 → 「标示卡有未保存的修改，确定离开？」
4. 大图 Tab：历史照片加载、切换主图/全屏预览；日志 Tab：时间线渲染与长备注折叠
5. 头部操作组：标示卡 / 标签 / 二维码 / 「扫码操作」（关闭全部弹窗并跳 `#/scan?no=`）
6. 治具详情（回归）：概览 Tab 宽度由 640px 恢复为设计值 960px；日志/附件 Tab 仍 640px；Tab 切换、附件上传、操作按钮正常
7. 项目详情（回归，projects 未上线）：打开弹窗不再报 `ReferenceError`，信息卡/子任务等正常渲染

## 4. 部署与回滚

- **部署**：仓库已提交推送，服务器工作区即生效（`subsystems/*/frontend/js/bundle.js` + 各 `index.html` 的 `?v=bmtwzbj0j`）；**无需重启服务**，用户浏览器强刷即可
- **回滚**：`git revert ec0fc58 705c963 0d57c4c 2b9eedb 7bdffa8`（或定向回退到 `66cb507` 的对应文件）→ 资源版本回到 `bmtwz7wtr`/`bmtwxradf`；仍**无需重启**，强刷生效
- **监控**：上线后 1~3 个业务周期观察前端控制台报错（`openDetailModal` 未定义、弹窗空白的叠层问题）、样品详情/治具详情/项目详情三个入口的可用性

## 5. 遗留与待决

1. `tests/users.test.js` 4 例预存失败（`Lock wait timeout exceeded` / 30s 超时）——建议单独立项
2. 全量套件单进程运行的 `mysql2` 握手 `cesu8` 崩溃（见 §3.2）——建议单独立项
3. `subsystems/control/frontend/css/module.css` 行尾为 mixed（预存非本批次），建议后续归一化为 LF
4. 共享组件仍保留 `id="fluent-modal"`（多弹窗并存时 DOM 内 id 重复）——当前 `app.css` 依赖该 id 生效（`#fluent-modal.d-*::part(control)`），属既有设计；若改为实例唯一 id，需同步改选择器并做三系统回归
5. `docs/RELEASE-v2.0.3.md` §6 中「samples 详情弹窗迁移待办」已由本版本收敛；历史发布说明按惯例保持原样不改写
