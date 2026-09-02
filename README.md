# 制造品质管理系统

含**管制流程管理**、**样品管理**、**治具管理**、**全局工作台**与**项目追踪**五大子系统，统一门户入口（portal.html），三方扫码驱动状态机，全量留痕。

**子系统清单**(由 `node tools/sync-subsystem-docs.js` 自动维护):

<!-- AUTO-SUBSYSTEMS:START -->
- **管制流程管理**(`control`)：覆盖管制/不良品管制申请→会签→贴标入仓→NCR→处理会签→重工→入库出货全流程
- **治具管理**(`fixtures`)：覆盖治具申请→制作→验证移交→领用→维修→报废全流程
- **项目追踪**(`projects`)：多项目问题/任务追踪：看板、子任务、依赖、评论、附件、留痕、导出
- **样品管理**(`samples`)：覆盖样品发行→确认→生命周期管理→分发全流程
- **全局工作台**(`workbench`)：跨部门项目进度监控，合并样品与治具待办积压视图
<!-- AUTO-SUBSYSTEMS:END -->

## 五个责任主体

| 阶段 | 责任方 | 主要职责 |
|------|--------|-----------|
| 样品制作 / 治具制作 | 研发工程(RD) | 建样、制作治具、扫码确认制作、维修治具、创建替代品 |
| 发行 / 验证移交 / 领用 | 品保文管中心(QA) | 样品扫码发行/复检/审核退回；治具验证移交/领用/报修 |
| 保管 / 领用 / 保养 | 各部门保管(CUSTODY) | 样品接收保管/申请退回；治具验证移交/领用/报修 |
| 验证 / 保养 / 维修 | 生技部(ME) | 样品保管/退回；治具验证移交/领用/保养/维修 |
| 系统管理 | 管理员(ADMIN) | 用户管理、全局查看、治具报废 |

---

## 样品管理

### 状态机

```
NEW → PRODUCED(制作完成) → RELEASED(已发行) → IN_CUSTODY(保管中)
                                                    ↓
                                            RETURNING(退回审核中)
                                                    ↓
                                            RETIRED(已作废)
```

周期到点派生 **待复检 / 逾期**（看板高亮预警）。

> 注：IN_CUSTODY 临期（距复检日 ≤7 天，含逾期）支持 QA「到期复检」自环（INSPECT_CUSTODY）——样品不脱离保管，复检通过后顺延复检日、标示卡版次自动 +1 并触发重打（2026-09-01 批次 1）。

> 注：删除样品为**软删除**（`deleted_at` 置位，2026-09-01 批次 2 / T13）——样品行与操作日志全量保留（审计不断链），所有查询自动过滤已删样品；编号**不复用**（软删样品序号仍视为占用，防止旧实物 QR 扫码指向新样品）。

### 扫码台 — 三方扫码驱动状态机

| 当前状态 | 操作角色 | 扫码后动作 | 要求 |
|---|---|---|---|
| NEW(待制作) | 研发(RD) | → PRODUCED | 上传制作照片 |
| PRODUCED(制作完成) | 品保(QA) | → RELEASED | 填写复检周期 + 标示卡信息（三步向导）|
| RELEASED(已发行) | 保管(CUSTODY) | → IN_CUSTODY | 填写储位 |
| IN_CUSTODY 到期 | 品保(QA) | 复检 | 上传复检照片 |
| IN_CUSTODY 临期(≤7天) | 品保(QA) | → IN_CUSTODY 到期复检 | 复检照片+周期(可沿用)+版次自动+1+触发重打 |
| IN_CUSTODY | 保管(CUSTODY) | → RETURNING | 填写退回原因 |
| RETURNING | 品保(QA) | 多分支：重新发行/退回研发/直接作废/拒绝退回 | — |
| RETURNING(退回审核中) | 管理员(ADMIN) | 兜底：强制改派 FORCE_REASSIGN / 强制作废 FORCE_RETIRE | 卡死兜底：改派须选启用状态 RD；作废须填原因（2026-09-01 批次 2）|
| RETURNING(被指派) | 研发(RD) | 创建替代品 | 自动复制原样品信息 |

### 样品列表

- 多维度组合筛选（状态/部门/类型/限度项目/来源 + 关键词搜索）
- 快捷筛选（待处理/逾期/近7天到期）+ 芯片可视化
- 响应式表格（table-layout:fixed + colgroup）+ 列宽拖拽
- 移动端 data-label 卡片式布局
- 分页（默认 20 条/页）

### 样品详情弹窗

四栏 Tab（置顶）：信息（CSS Grid 卡片布局 + 流转时间线）、全量日志（时间线：倒序 + 流向箭头 + 长备注折叠）、标示卡（编辑/打印）、大图（含历史照片）

- 点击列表行立即开弹窗 + 骨架屏加载，失败有提示
- 弹窗宽度随 Tab 内容密度自适应（信息 960 / 标示卡 800 / 日志·大图 560px，移动端 94vw）
- 头部操作组：打印标示卡 / 打印标签 / 下载二维码一站式入口
- 标示卡未保存修改时切 Tab/关闭弹窗有确认拦截；锁定状态带「前往扫码台修正」引导
- 日志/大图 Tab 懒渲染（先骨架后内容）

### 限度样品

样品类型 OK/NG、26 项限度项目、3 种来源（客供/元山/塔岗）、版次、测试标准/数据

### 数字标示卡

- 匿名页 `/card/:sample_no` 无需登录
- 双面标签打印（QR面 + 标示卡面）
- 尺寸选择（3档预设 + 自定义 30~150mm）
- 连续扫码打印队列 + 批量打印

### 标签与标示卡标准化规则

- 完整规范：[docs/label-card-standard.md](docs/label-card-standard.md)
- 规则库引用：AGENTS.md 第 24 节（强制）
- **核心**：标签与标示卡均以 `samples` 表为唯一事实来源，实时派生、无独立副本；字段变更只需更新样品一次，另一视图自动同步，已打印旧纸需人工重新打印更换。

---

## 治具管理

### 状态机

```
REQUESTED → ACCEPTED → VERIFY_PENDING → TRANSFERRED ⇄ IN_USE
                                       ↓
                                 REPAIRING_ME/REPAIRING_RD
                                       ↓
                                 REPAIR_DONE → TRANSFERRED
                                       ↓→ IMPROVING → RETIRED
```

> 验证为**单人验证**（申请部门人员验证即可移交）；`VERIFY_RD_OK/VERIFY_ORG_OK` 为旧双人验证的历史状态（存量数据兼容）。

### 治具看板

- DASH_STATS 配置驱动统计卡片（active 高亮 + 单击筛选）
- 逾期未归还预警表格
- 待保养预警表格
- 我的待办列表

### 治具清单

- 筛选（关键词/状态/部门）+ 每页条数选择器（10/20/50/100）
- colgroup + col-rsz 列宽拖拽 + data-label 响应式

### 治具操作日志

- 独立操作日志页（左侧导航「操作日志」）：全量日志 + 关键词搜索（操作/部门/备注）
- 列宽自适应（时间列固定、备注列弹性占余量）+ col-rsz 列宽拖拽
- 移动端自动转为 data-label 卡片式布局；详情弹窗「操作日志」Tab 同步支持

---

## 全局工作台

跨部门监控样品 + 治具全部活跃项目（合并视图），帮助各部门掌握积压情况。

### 功能

- **统计卡片**：总计 + 各部门卡片，互斥三档积压（≤3 天 / 3~7 天 / 7 天以上），标签随阈值动态显示
- **卡片交互**：单击部门卡筛选该部门数据、再次单击取消；双击/总计卡清除筛选
- **筛选栏**：类型 / 积压等级 / 负责部门 / 申请部门 / 编号名称搜索 / 仅呆滞 / 停留时长范围（小时）多维筛选，服务端过滤实时生效，附「共 N 条」计数与一键清除
- **统一列表与分页**：编号/名称/类型/阶段/负责部门/申请部门/停留时长/积压状态；分页展示（上一页/下一页 + 页码），筛选条件与页码写入网址（hash），刷新页面后自动恢复
- **信息下钻**：点击列表行打开详情弹窗——左栏基本信息、右栏流转日志时间线（倒序最新在上 + 流程步骤号 + ⬆ 流向箭头 + 折叠）；弹窗宽高随信息密度自适应；「前往处理」跳转对应子系统扫码台并预填编号
- **阈值设置**（仅 ADMIN）：可自定义 3 天 / 7 天边界（支持快捷预设 3/7、5/10、7/14、10/30 天），保存后全局生效（存 `workbench_settings` 表），所有用户即时按新阈值渲染
- **逾期判定**：样品 NEW/PRODUCED 阈值放大 3 倍（制样中更宽松）；RELEASED/IN_CUSTODY 按复检日；治具维修/改善状态优先按 `expected_finish_at`（有值且未到期→正常，到期按超出天数），无该值则按报修日兜底

---

## 项目追踪

多项目问题/任务追踪子系统（入口 `/subsystems/projects/frontend/index.html`），面向 PM/项目成员的任务协作与进度监控。

### 功能

- **项目看板**：kb-stat 统计卡（项目数/总任务/已完成/进行中/已延期）+ 类别/优先级分布 + 完成率 + 近 8 周完成趋势（CSS 柱状图）
- **任务看板（Kanban）**：未开始/进行中/已完成/已延期 4 列，HTML5 拖拽流转（仅合法转移，非法回弹），项目/类别/优先级/责任人多维筛选（筛选条件写入 URL 可分享恢复）
- **任务列表**：跨项目筛选（项目/状态/类别/优先级/责任人）+ 全文搜索（标题/描述/备注/方案）+ 已延期行红色高亮 + CSV 导出（UTF-8 BOM，复用筛选）+ 批量指派/流转/删除（无权限条目跳过并统计）
- **任务详情**：主信息 + 子任务（三态 CAS 流转）+ 前置依赖（环检测/阻塞校验）+ 评论 + 附件上传 + 样品/治具关联 + 操作日志
- **项目列表**：项目 CRUD + 成员管理（添加/转让 owner/移除）；有任务的项目禁止删除（409）
- **状态机管理**（仅 ADMIN）：可视化编辑 4 态标签/颜色 + 转移规则，保存即时生效
- **并发防护**：任务编辑乐观锁（version 冲突 409）、状态流转 CAS、工作流配置行锁、同事务留痕
- **看板统计性能**：`GET /api/projects/stats` 采用标量条件聚合 + 并行查询 + 30s 进程内 TTL 缓存 + `(status, planned_date)`/`(status, created_at)` 复合索引，消除全表扫描，看板首查显著提速（详见 [RELEASE-v2.0.1.md](docs/RELEASE-v2.0.1.md)）

### v2 交互升级（2026-08-06）

- **任务创建入口**：看板与列表页均提供「新建任务」按钮，弹窗表单化创建（看板自动带入当前选中项目；列表页项目默认空，需手动选择）
- **我的任务**：看板「我的任务」/ 列表「只看我的」一键筛选本人名下任务（按 assignee 过滤，再次点击取消）
- **依赖与关联下拉选择**：编辑任务时前置依赖、样品/治具关联均为下拉选择器（而非手填 ID），并保留环检测/阻塞校验
- **列表分页**：任务列表每页 50 条，底部「上一页/下一页」翻页 + 页码/总数展示，筛选条件变更后自动回到第 1 页
- **状态动态延期（status_eff）**：任务按计划日期自动判定实际状态——未开始/进行中且计划日期已过 → 自动置为「已延期」；看板列分组/计数、列表行高亮、行内快捷流转按钮均按该有效状态动态渲染
- **详情页 tab 化**：详情拆为「主信息卡 + 子任务/评论/附件/关联/日志」5 个 tabs，分区加载替代全量重渲染，操作后仅刷新当前 tab
- **删除任务**：详情页主卡提供删除入口（受角色权限控制）

### 角色权限

| 角色 | 权限 |
|---|---|
| ADMIN / PM | 全局：建项目/任务/成员管理/删除；PM 为项目经理 |
| owner / member | 项目内管理（建任务/编辑/成员管理由 owner） |
| 其他角色 | 只读 + 流转自己名下任务（ASSIGNEE 伪角色） |

### 演示账号

| 账号 | 密码 | 角色 |
|---|---|---|
| pm01 | pm123 | 项目经理(PM) |

---

## 管制流程管理

管制/不良品管制子系统（入口 `/subsystems/control/frontend/index.html`）：管制申请 → 闸口①会签 → 贴标入管制仓 → 开不良品委托单(NCR) → 处理方式会签(闸口②) → 重工 → 入库出货全流程，双闸口会签拦截，全量留痕。

### 状态机

```
DRAFT → SIGNING(闸口①会签) → LABELED(已贴标) → CONTROL_STORED(管制仓)
      → NCR_DONE(已开委托单) → DISPOSAL_SIGNING(闸口②会签) → REWORK_OPENED
      → REWORKING(重工中) → REWORK_REPORTED(已报工) → REIN_STOCK(已入库) → SHIPPED(已出货)
```

- 两闸口均可退回上一环节（SIGNING→DRAFT / DISPOSAL_SIGNING→NCR_DONE）
- 任意状态可由 ADMIN 作废（→ RETIRED）

### 功能

- **管制看板**：统计卡片 + 我的待办
- **管制单列表**：多维筛选/搜索 + 导出 CSV + 单据详情弹窗
- **双闸口会签**：闸口①（QA 会签通过贴标）/ 闸口②（QA/RD 处理方式会签），支持退回
- **不良品委托单（NCR）**：列表 + 导出 CSV
- **管制标签打印**：标签查看/打印/下载
- **附件管理**：管制单附件上传/下载/删除
- **操作日志**：全量留痕可查
- **设置**：管制参数配置（`/api/control/settings`）

---

## 门户卡片个性化排列

门户首页（portal.html）支持用户级卡片个性化排列，偏好按登录用户独立保存。

- **编辑入口**：门户欢迎语旁「编辑排列」按钮，进入编辑模式后每张卡片出现 ⋮⋮ 拖拽手柄，按钮变为「保存顺序」「取消」
- **拖拽排序**：编辑模式下按住卡片拖拽换位，实时预览新顺序（仅内存操作，未保存不影响浏览态）
- **保存/取消**：点击「保存顺序」统一提交（PUT /api/portal/prefs），toast 提示已保存；点击「取消」丢弃本次调整，顺序回退到上次保存值
- **默认行为**：新用户/未配置用户按子系统默认顺序排列；未配置的子系统自动排尾；新增子系统无需迁移自动获得默认位置
- **清除恢复**：PUT /api/portal/prefs 传 `order=[]` 或 `null` 即清除偏好恢复默认顺序

## 修改密码（自助）

登录后在门户页右上角（账号旁）点击「**修改密码**」，输入原密码与新密码（至少 6 位）即可修改本人密码；修改成功后会话销毁，需重新登录。忘记密码请联系管理员重置。

---

## 运行

```bash
npm install          # 安装依赖
cp .env.example .env # 复制环境变量模板
npm run seed         # 初始化角色账号（仅一次）
npm run seed-samples # 样品全量测试数据（15个，6种状态全覆盖；⚠️ samples 已上线，护栏将拒绝执行）
npm run seed-fixture # 治具全量测试数据（15个，12种状态全覆盖）
npm start            # 启动，访问 http://localhost:4000（需先配置 .env 数据库连接）
```

### 环境变量

| 变量 | 作用 | 默认值 |
|---|---|---|
| `PORT` | 服务监听端口 | `4000` |
| `SESSION_SECRET` | 会话签名密钥 | `sample-mgmt-dev-secret-change-me` |
| `NODE_ENV` | 环境标识 | `development` |
| `LOGIN_RATE_LIMIT_MAX` | 登录速率限制（次/分钟） | `10` |
| `API_RATE_LIMIT_MAX` | API 速率限制（次/分钟） | `200` |
| `LOG_DIR` | 日志目录 | `logs` |
| `UPLOAD_MAX_SIZE` | 上传文件大小限制（字节） | `5242880`（5MB） |
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 数据库连接 | — |

> PM2/宝塔注入的同名环境变量优先，`.env` 仅作兜底。

## 演示账号

| 账号 | 密码 | 角色 | 部门 |
|------|------|------|------|
| admin | admin123 | 管理员 | 系统 |
| rd01 | rd123 | 研发(RD) | 研发部 |
| qa01 | qa123 | 品保(QA) | 品保文管中心 |
| mfg01 | mfg123 | 保管(CUSTODY) | 制造部 |
| fqc01 | fqc123 | 保管(CUSTODY) | FQC |
| pmc01 | pmc123 | 保管(CUSTODY) | 生管部 |
| wh01 | wh123 | 保管(CUSTODY) | 资材部 |
| me01 | me123 | 保管(ME) | 生技部 |

## API 一览

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/login` | POST | 否 | 登录 |
| `/api/logout` | POST | 是 | 登出 |
| `/api/me` | GET | 是 | 当前用户信息 |
| `/api/config` | GET | 否 | 公共配置（demoMode 演示账号开关，登录页使用）|
| `/api/change-password` | POST | 是 | 自助修改密码（校验原密码，新密码≥6位，成功后销毁会话重新登录）|
| `/api/samples` | GET | 是 | 样品列表（筛选/排序/逾期/分页）|
| `/api/samples` | POST | 是 | 新建样品（含限度字段）|
| `/api/samples/:id` | GET | 是 | 样品详情 + 操作日志 |
| `/api/samples/:id` | PUT | 是 | 更新样品（可选携带 version 乐观锁，版本冲突返回 409）|
| `/api/samples/:id` | DELETE | 是 | 删除样品=**软删除**（deleted_at 置位；仅 NEW/PRODUCED，仅创建者或管理员；操作日志保留、编号不复用）|
| `/api/samples/:id/qrcode` | GET | 是 | 样品二维码 |
| `/api/samples/:id/qrcode/download` | GET | 是 | 下载高清二维码 |
| `/api/samples/:id/label/download` | GET | 是 | 下载标签 HTML |
| `/api/samples/:id/card/print` | GET | 是 | 打印标示卡 |
| `/api/samples/cards/print` | GET | 是 | 批量打印标示卡（ids 逗号分隔、一次 ≤50，单页多卡 + @page 分页）|
| `/api/samples/:id/images` | GET | 是 | 样品历史照片列表（制作/复检全量留痕，时间倒序）|
| `/api/samples/export` | GET | 是 | 样品列表导出 CSV（复用筛选参数，忽略分页）|
| `/api/fixtures` | GET | 是 | 治具列表（筛选/排序/分页）|
| `/api/fixtures/export` | GET | 是 | 治具清单导出 CSV（复用筛选/排序参数，忽略分页）|
| `/api/fixtures` | POST | 是 | 新建治具申请 |
| `/api/fixtures/scan` | GET/POST | 是 | 治具扫码台（解析/执行状态机）|
| `/api/fixtures/dashboard` | GET | 是 | 治具看板数据 |
| `/api/fixtures/logs` | GET | 是 | 治具操作日志（全量，可搜索）|
| `/api/fixtures/:id` | GET | 是 | 治具详情 + 操作日志 |
| `/api/fixtures/:id` | PUT | 是 | 更新治具（状态机流转）|
| `/api/fixtures/:id/logs` | GET | 是 | 单治具操作日志 |
| `/api/fixtures/:id/retire` | PUT | 是(ADMIN) | 治具报废 |
| `/api/fixtures/:id/qrcode` | GET | 是 | 治具二维码 |
| `/api/fixtures/:id/files` | GET/POST | 是 | 治具附件列表/上传 |
| `/api/fixtures/:id/files/:fileId` | DELETE | 是 | 删除治具附件 |
| `/api/fixtures/:id/files/:fileId/preview` / `download` | GET | 是 | 附件预览/下载 |
| `/api/control/orders` | GET/POST | 是 | 管制单列表/新建管制申请 |
| `/api/control/orders/stats` | GET | 是 | 管制看板统计 |
| `/api/control/orders/export` | GET | 是 | 管制单导出 CSV（复用筛选，忽略分页）|
| `/api/control/orders/:id` | GET/PUT | 是 | 管制单详情/更新 |
| `/api/control/orders/:id/transition` | POST | 是 | 管制状态机流转 |
| `/api/control/orders/:id/sign` | POST | 是 | 会签（闸口①/②通过/退回）|
| `/api/control/orders/:id/rework-log` | POST | 是 | 重工报工记录 |
| `/api/control/orders/:id/void` | POST | 是(ADMIN) | 管制单作废 |
| `/api/control/orders/:id/ncr` | POST | 是(QA) | 开不良品委托单(NCR) |
| `/api/control/ncrs` | GET | 是 | 不良品委托单列表 |
| `/api/control/ncrs/export` | GET | 是 | 委托单导出 CSV |
| `/api/control/orders/:id/files` | GET/POST | 是 | 管制单附件列表/上传 |
| `/api/control/orders/:id/files/:fileId` | DELETE | 是 | 删除管制单附件 |
| `/api/control/orders/:id/files/:fileId/download` | GET | 是 | 管制单附件下载 |
| `/api/control/orders/:id/label` / `label/print` / `label/download` | GET | 是 | 管制标签查看/打印/下载 |
| `/api/control/logs` | GET | 是 | 管制操作日志 |
| `/api/control/settings` | GET/PUT | 是 | 管制子系统参数设置 |
| `/api/resolve` | GET | 是 | 解析扫码内容 |
| `/api/scan` | POST | 是 | 执行扫码操作（状态机；全链路乐观锁 CAS，版本冲突返回 409，请刷新后重试）|
| `/api/dashboard` | GET | 是 | 样品看板数据 |
| `/api/workbench` | GET | 是 | 工作台合并数据（样品+治具积压）；筛选 type/level/dept/apply_dept/keyword/stage/dormant/min_hours/max_hours（兼容旧参数 item_type）+ 分页 limit/offset（≤500）；返回 items/total/limit/offset/summary/deptStats/applyDepts |
| `/api/workbench/settings` | GET/PUT | 是(ADMIN 写) | 工作台积压阈值 |
| `/api/subsystems` | GET | 登录 | 已注册子系统清单（门户渲染；登录按 roles.use 过滤，未登录返回空数组）|
| `/api/subsystems/:id/deployed` | PUT | 是(ADMIN) | 子系统上线开关（双向切换 deployed，切换即生效 seed/jest 护栏）|
| `/api/portal/prefs` | GET | 是 | 当前用户门户卡片排序偏好（无记录返回空数组）|
| `/api/portal/prefs` | PUT | 是 | 保存/清除排序偏好（order=[] 或 null 清除）|
| `/api/rd-users` | GET | 是(ADMIN/RD/QA) | RD 用户列表（退回指派选择）|
| `/api/logs` | GET | 是(ADMIN) | 全量操作日志 |
| `/api/users` | GET/POST | 是(ADMIN) | 用户管理 |
| `/api/users/batch` | POST | 是(ADMIN) | 用户批量管理（delete/reset-password/update/enable/disable）|
| `/card/:sample_no` | GET | **否** | 匿名数字标示卡 |
| `/health` | GET | 否 | 健康检查 |

## 技术栈

Node.js + Express · MariaDB(MySQL) via mysql2 · express-session + bcryptjs · qrcode · Fluent Web Components · 原生 HTML/CSS/JS 单页（源文件无框架；前端 JS 由 `tools/build-bundles.js` 合并为单 bundle，版本号破缓存）。

## 目录

```
server.js                   后端入口：加载中间件、扫描注册子系统
db.js                       数据层入口：建表/迁移/工厂组装
logger.js                   日志系统（Winston，按天轮转）
seed.js                     种子：6 个角色账号
seed-samples.js             样品全量测试数据（15个，6种状态）
seed-fixture.js             治具全量测试数据（15个，12种状态）
test_flow.js                样品端到端流程测试（建样→制作→发行→保管→退回→替代）
test_fixture_flow.js        治具生命周期 E2E 测试（申请→接收→上传文件→制作→单人验证→领用→改善→报废）
test_fixture_files.js       治具文件管理 E2E 测试（上传/下载/删除/权限）
shared/                     框架共享层
  ├── middleware/           鉴权 + 上传中间件
  ├── state-machine.js      通用状态机引擎
  ├── file-manager.js       通用文件管理 DAO
  └── frontend/             共享前端模块（api-base/modal/utils）
routes/
  ├── auth.js               鉴权路由
  ├── misc.js               杂项路由（看板/日志/用户/健康检查）
  └── subsystems.js         子系统发现 + CRUD API
subsystems/                 所有子系统（插件协议，每目录自包含）
  ├── control/              管制流程管理（manifest + backend/db/frontend/seed）
  ├── samples/              样品管理（manifest + backend/db/frontend/seed）
  ├── fixtures/             治具管理（同构）
  ├── workbench/            全局工作台（同构）
  └── projects/             项目追踪（同构）
db/                         数据访问层
  ├── users.js              用户查询
  ├── fixture-files.js      治具文件 DAO
  ├── tx.js                 事务工具
  └── migrations.js         增量迁移
data/
  ├── limit-items.json       限度项目（26项）
  └── source-types.json      来源类型
public/
  ├── portal.html            门户首页（统一入口）
  ├── admin-users.html       用户管理（框架级独立页，仅 ADMIN；含批量管理/PM 角色）
  ├── admin-subsystems.html  子系统管理面板
  ├── css/app.css            全局共享样式
  └── uploads/               样品/治具图片与文件上传目录
docs/
  ├── deploy-baota.md        宝塔部署文档
  ├── operation-manual.md    用户操作说明书
  ├── archive/               历史设计文档与实现计划（已完成迭代归档）
  └── superpowers/           当前有效的设计规范与计划
tools/
  ├── build-bundles.js       JS 合并构建（各子系统 JS → 单 bundle + 版本号）
  ├── bundle-sources.json    bundle 源文件清单（依赖顺序）
  ├── .bundle-ver            当前 bundle 版本号（构建生成，gitignore）
  ├── create-subsystem.js    子系统脚手架 CLI（交互生成全套骨架）
  └── subsystem-templates.js 子系统骨架模板（CLI 与面板共用）
```

## 响应式断点

| 断点 | 宽度 | 布局 |
|---|---|---|
| XS | <576px | 单栏 |
| SM | 576~767px | 单栏（字段 2 列） |
| MD | 768~1199px | 双栏 35/65 |
| LG | 1200~1599px | 双栏 30/70，弹窗 800px |
| XL | ≥1600px | 三栏 25/25/50，弹窗 900px |

表格移动端自动转为 data-label 卡片式布局。

## 健康检查

```
GET /health → { "status":"ok","uptime":123,"timestamp":"...","memory":...,"db":"connected" }
```

## 日志

- `logs/` 目录，JSON 格式，按天轮转，保留 30 天，单文件上限 20MB
- Morgan short 格式访问日志
- 级别：生产 `info`，开发 `debug`

## 速率限制

| 端点 | 限制 |
|---|---|
| `/api/login` | 10 次/分钟/IP |
| `/api/*` | 200 次/分钟/IP |

## 安全

- Helmet（XSS/MIME sniff/clickjack/HSTS）
- Session Cookie：httpOnly + sameSite strict
- 文件上传：jpg/png/gif/webp ≤5MB（含魔数校验）
- **静态服务收敛**：仅暴露各子系统 `frontend/` 目录，后端源码/schema/seed/manifest 不可下载
- **匿名接口限流**：`/card/:sample_no` 60 次/分钟/IP（防编号枚举）
- **会话版本失效**：修改密码后该用户所有已登录会话（含其他设备）立即失效；存量会话自动采纳版本号
- **CSV 公式注入中和**：导出值以 `= + - @` 等开头时前置单引号
- 错误响应统一 generic，内部错误仅写日志

## 代码检查

```bash
npm run lint          # ESLint
npm run lint:fix      # ESLint 自动修复
npm run format        # Prettier
```
## 开发规范

- 编辑器格式：仓库根目录 `.editorconfig` 统一（2 空格缩进 / UTF-8 / LF / 末行换行），主流 IDE 自动识别
- dotenv 加载（MUST）：任何独立运行脚本 MUST 顶部先 `require('dotenv').config()` 再 `require('./db')`（db.js 配置在模块加载时求值，缺加载会 Access denied）
- 完整开发贡献规范见 [CONTRIBUTING.md](CONTRIBUTING.md)

