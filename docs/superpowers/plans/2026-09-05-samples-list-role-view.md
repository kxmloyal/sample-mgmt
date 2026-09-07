# 实现计划：样品列表角色化呈现（A+B）

设计：docs/superpowers/specs/2026-09-05-samples-list-role-view-design.md

## T1 后端 DAO：拆分 + 新参数
- [ ] 1.1 新建 `subsystems/samples/db/dao-list.js`：迁入 listSamples/countAllSamples/countSamplesByStatus/listOverdueSamples/listDueSoonSamples/listReturningOverdue/listCheckoutOverdue/listMyPendingSamples/aggregateModelsWall + ISO_UTC 常量；listSamples/countAllSamples 增加 opts.mine_uid、opts.checkout_overdue、sort=mine|inspect|status
- [ ] 1.2 `dao.js` require('./dao-list') 合并导出（接口零变化），自身保留写入域
- [ ] 1.3 `node --check` 两文件；顶层函数数核对（≤10/文件）

## T2 后端路由接线
- [ ] 2.1 routes-samples.js：GET /api/samples 与 /export 解析 mine/checkout_overdue；mine=1 → currentUser uid；sort 白名单扩 mine/inspect/status
- [ ] 2.2 `node --check`

## T3 前端列配置化 + 角色档
- [ ] 3.1 新建 `views/list-role.js`：LIST_ALL_COLS/listColDef/LIST_ROLE_PROFILE + 完整视图开关状态
- [ ] 3.2 list-render.js 改造：_sampleHeaderCols/_sampleRowHtml 按 profile 列 key 驱动；CHECKED_OUT 行领用信息；minWidth 按列数计算
- [ ] 3.3 module.css 补充（应还超时橙色/开关行样式）

## T4 前端筛选与默认排序
- [ ] 4.1 list.js：profile 默认排序（无深链时）+ 快捷栏按档位渲染 + 完整视图开关绑定
- [ ] 4.2 list-filter.js：quickFilter 新增 custody/checkout_overdue/mine/dept 分支；ADMIN 待处理真实口径；chips 扩展
- [ ] 4.3 bundle-sources.json 注册 list-role.js（dashboard.js 后、list.js 前）

## T5 验证与部署
- [ ] 5.1 真实 DB 只读 E2E：DAO 新参数 + 路由 drive（复用 kb_p2_e2e 模式，独立临时脚本 /tmp）
- [ ] 5.2 `node tools/build-bundles.js` → cp samples bundle → sed 版本号 → chown
- [ ] 5.3 手动回归清单输出（五角色/开关/深链/移动端/导出）

## T6 文档同步 + 提交
- [ ] 6.1 README（列表章节角色档位表）、样品操作说明 7.x、operation-manual 六章、AGENTS/CLAUDE 技术债（dao 拆分后新容量）
- [ ] 6.2 git 提交（feat(samples) 系列），推送仅用户要求时
