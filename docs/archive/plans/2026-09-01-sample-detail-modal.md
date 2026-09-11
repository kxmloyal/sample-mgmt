# 实现计划：样品详情弹窗交互优化（方案 B）

> 关联 spec：[2026-09-01-sample-detail-modal-design.md](../specs/2026-09-01-sample-detail-modal-design.md)
> 覆盖子系统：`samples`（纯前端：detail.js + module.css；app.css 零改动）
> 执行方式：Subagent 驱动
> 关键约束：samples 已上线（只读验证）；禁止重启；前端改动末批重建 bundle

## 任务总览（3 个 Task）

| # | 任务 | 文件 | 要点 |
|---|---|---|---|
| D1 | 弹窗交互重构 | `subsystems/samples/frontend/js/views/detail.js` | 骨架屏/错误处理/Tab置顶DOM/操作组/锁定引导/dirty拦截/密度类切换 |
| D2 | 日志时间线 + 懒渲染 + 样式 | `detail.js`、`subsystems/samples/frontend/css/module.css` | 时间线渲染 + 全部新样式进 module.css |
| D3 | bundle 重建 + 回归 + 文档 | `tools/`、`bundle.js`、`index.html`、README.md | §19 流程 + 臃肿报告 |

---

## D1 · 弹窗交互重构

### Files
- `subsystems/samples/frontend/js/views/detail.js`（当前 243 行/16040 字符，80.2% 预警线——本 Task 改完须报告，超 90% 则停新增先拆）

### Steps

**D1.1 加载态与错误处理**（`viewDetail`）：
- 入口立即 openModal 骨架屏（标题条 + 4 卡片占位 div.skeleton），再 await api
- api 失败：toast('详情加载失败：'+err.message,'err') + closeModal；防竞态 `_detailReqSeq` 保留
- 数据到达后按现状渲染（head 编号+badge）

**D1.2 Tab 栏置顶**：
- openModal 调用结构调整：head 含操作组；body 首行为 Tab 栏 HTML（`_buildTabsHTML` 移到内容之前）；foot 仅保留「关闭」
- Tab 栏使用新类名 `detail-tabs-top`（样式在 D2 进 module.css），不动共享 `.detail-tabs`

**D1.3 头部操作组**（head 右侧）：
- 🖨 打印标示卡（printCard(id) 现有函数）/ 🏷 打印标签（window.open('/api/samples/'+id+'/label/print'+getPrintSizeQuery())，参照列表行实现）/ ⬇ 下载二维码（downloadQR(id) 现有）
- 小图标按钮样式类 `pv-icon-btn`（D2 进 module.css）

**D1.4 锁定引导**（`_buildCardTab` locked 分支）：
- `.card-lock-banner` 追加 `<a href="/subsystems/samples/frontend/index.html#/scan?no=<sample_no>" target...>`——实际同页 hash 跳 `/#/scan?no=`：onclick 调 `closeModal` + `location.hash` 或现有 goScan 类函数（先读 scan.js 入口参数惯例 `#/scan?no=`）

**D1.5 Dirty 拦截**：
- 标示卡 Tab 可编辑输入/选择控件挂 oninput/onchange → `_detailDirty=true`
- `renderTab` 与关闭路径（遮罩点击为 shared modal.js 行为——不可改共享层；方案：openModal 后给 mask 的点击关闭包一层 samples 侧拦截，或监听；实现细节以不改 modal.js 为前提，可在 openModal 返回的 mask 上 addEventListener capture 阶段拦截）与 foot 关闭按钮：dirty 时 `confirm('标示卡有未保存的修改，确定离开？')`
- saveCard 成功后 `_detailDirty=false`；切走非 card Tab 后重置

**D1.6 密度自适应宽度**：
- openModal 后取得 dialog 元素，按 Tab 设置类 `d-high`（info）/`d-mid`（card）/`d-low`（logs/image）
- renderTab 切换时同步换类；样式 D2 进 module.css

### 验证
- `node --check detail.js`
- DOM 桩测试：dirty 拦截三分支（切 Tab/关闭/遮罩）、密度类切换映射、骨架屏先行渲染

### Commit
`feat(samples): detail modal interaction overhaul (skeleton/top-tabs/actions/dirty-guard)`

---

## D2 · 日志时间线 + 懒渲染 + 样式

### Files
- `subsystems/samples/frontend/js/views/detail.js`
- `subsystems/samples/frontend/css/module.css`

### Steps

**D2.1 日志时间线**（`_buildLogsTab` 重写）：
- 倒序（API 返回顺序确认：现状 logs 按时间倒序则直接用，否则前端 reverse）
- 结构：`.tl` 时间线容器 + `.tl-item`（圆点 + 动作中文名 + 流向箭头 + 时间/角色 + 备注）
- 流向映射表（action → '从状态 ➜ 到状态'）：CREATE『—』、PRODUCE『NEW ➜ 制作完成』、RELEASE『制作完成 ➜ 已发行』、CUSTODY『已发行 ➜ 保管中』、INSPECT/INSPECT_EARLY『已发行（自环）』、INSPECT_CUSTODY『保管中（自环）』、EDIT_CARD/EDIT_STORAGE 自环、RETURN_REQUEST『保管中 ➜ 退回审核』、RE_RELEASE『退回审核 ➜ 已发行』、RETIRE_RECREATE/RETURN_REJECT、RETIRE_ONLY/RECREATE/FORCE_RETIRE『➜ 已作废』、FORCE_REASSIGN『退回审核（改派）』
- 长备注（>40 字符）默认折叠 1 行，点击展开/收起

**D2.2 Tab 懒渲染**：
- renderTab 切 logs/image 时先骨架（本地渲染 <300ms，用 requestAnimationFrame/setTimeout 0 即可呈现骨架一帧）再构建实际 DOM
- 大图 Tab 的 loadImageHistory（T14 异步接口）保持

**D2.3 module.css 新增样式**（文件当前 25 行，余量充足）：
- `.detail-tabs-top`（border-bottom 式置顶 Tab 栏）
- `.pv-icon-btn`（头部图标按钮）
- `.d-low{width:560px}.d-mid{width:800px}.d-high{width:960px}`（作用于 `#fluent-modal`；`@media(max-width:767px)` 一律 94vw；加 transition .25s）
- `.tl` 时间线系列样式
- `.skeleton` 骨架屏动画
- 校验 module.css 改后字符数远离红线

### 验证
- 桩测试：时间线渲染顺序/折叠逻辑/流向映射全覆盖
- 样式静态审查（类名不与 app.css 冲突）

### Commit
`feat(samples): log timeline and lazy tab rendering`

---

## D3 · bundle 重建 + 回归 + 文档

### Steps
1. `node tools/build-bundles.js`（注意 /tmp 旧 bundle 属主问题：先 rm /tmp/bundle-samples.js）→ cp 到 samples/frontend/js/bundle.js → 从 bundle 头注释提取版本号 → 更新 index.html → tools/.bundle-ver
2. 回归：`node --check`；jest 纯函数套件回归（card-print 等 5 文件）；确认 app.css / 共享层零改动（git diff --name-only 证明）→ fixtures 无需回归
3. README.md 样品详情弹窗小节同步（四 Tab 描述更新：Tab 置顶/操作组/时间线/骨架加载）
4. 臃肿报告：detail.js 改后行数/字符（若超 90% 红线即 18000 字符，停新增出拆分方案）；module.css 余量

### Commit
`chore(samples): rebuild bundle (detail modal)` + `docs(samples): detail modal interaction notes`

## 风险
| 风险 | 缓解 |
|---|---|
| detail.js 越 90% 红线 | D3 检查，超线则拆分留下一迭代 |
| 遮罩拦截实现复杂 | capture 阶段监听即可，不碰 shared/modal.js |
| 部署 | 同前：用户/运维宝塔重启，AI 不执行 |
