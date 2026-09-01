# 样品详情弹窗交互优化设计（方案 B）

- 日期：2026-09-01
- 范围：`subsystems/samples/frontend/js/views/detail.js` + `subsystems/samples/frontend/css/module.css`
- 前置：用户已预览静态原型（F:\work\sample-detail-preview.html）并确认设计
- 状态：已评审

## 1. 背景与目标

样品列表详情弹窗（四 Tab：信息/标示卡/全量日志/大图）经代码级审查存在 8 项交互缺陷。用户预览原型后确认按方案 B 全量实施。

**关键架构约束**：
- 新样式一律进 samples 的 `module.css`（§17.5），**app.css 零改动** → 无需 fixtures 等多子系统回归
- `routes-samples.js` 已 92.1% 字符红线（禁止追加新功能）→ 日志**不做接口级懒加载**，仅做渲染级懒加载（数据已在详情响应中，切 Tab 才渲染 + 骨架）；接口减重留待该文件拆分后另行评估
- 原生 `confirm()` 做未保存拦截（与 list.js/models.js 现有用法一致，用户已确认）

## 2. 交互设计（8 项）

| # | 项 | 设计 |
|---|---|---|
| ① | 加载态 | 点击列表行**立即开弹窗**显示骨架屏（标题条 + 卡片占位），数据到达后渲染；API 失败 → toast 报错 + 关闭弹窗 |
| ② | Tab 栏置顶 | DOM 顺序改为 head → tabs → body → foot；样式进 module.css（`.detail-tabs-top`，不动共享 `.detail-tabs`） |
| ③ | 未保存拦截 | 标示卡 Tab 编辑产生 dirty 标记；切 Tab / 点遮罩 / 点关闭时原生 confirm 拦截；保存成功清除 |
| ④ | 头部操作组 | modal head 右侧固定：🖨 打印标示卡 / 🏷 打印标签 / ⬇ 下载二维码（复用现有 printCard/getPrintSizeQuery/downloadQR） |
| ⑤ | 锁定引导 | 标示卡锁定时横幅加「需要修正？前往扫码台 →」链接，跳 `/#/scan?no=<sample_no>` 预填 |
| ⑥ | 密度自适应宽度 | 按 Tab 内容密度三档：信息 960px / 标示卡 800px / 日志·大图 560~720px；module.css 定义 `.d-low/.d-mid/.d-high` 类，JS 切 Tab 时切换弹窗类名；移动端（<768px）一律 94vw |
| ⑦ | 日志时间线 | 倒序最新在上 + 节点圆点 + 流向箭头（动作→状态流向）+ 长备注折叠展开（>40 字符默认 1 行折叠，点击切换）；样式复用时间线观感但类名独立（module.css） |
| ⑧ | Tab 懒渲染 | 切到日志/大图 Tab 才构建对应 DOM（先骨架 300ms 内完成渲染避免闪烁感）；信息 Tab 的「查看全部日志」链接切 Tab 时触发同路径 |

## 3. 兼容性

- 纯前端改动，API 零变更；既有 detail 响应结构不变
- 大图 Tab 历史照片区（T14）保持，并入新结构
- 409 自动刷新（T6）、保存后缓存刷新（T6）行为保留
- 弹窗打开入口（列表行点击）不变

## 4. 验证

- 桩测试：dirty 拦截分支、密度类切换、时间线折叠
- bundle 重建（§19）后浏览器实机验证（用户配合）
- 回归：samples 列表/详情四 Tab/打印入口；app.css 未动故 fixtures/control 无需回归（git diff 证明）

## 5. 文档同步

README 样品详情弹窗小节更新（Tab 置顶/操作组/时间线/懒渲染）。
