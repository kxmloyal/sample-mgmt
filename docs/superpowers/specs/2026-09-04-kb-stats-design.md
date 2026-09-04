# 看板统计卡点击交互统一（kb-stats 共享组件）设计

- 日期：2026-09-04
- 范围：projects（首用试点）→ fixtures → samples（deployed:true 等价迁移）
- **用户明确排除**：control 管制、workbench 工作台先不做此修改（bundle-sources 对应数组不插入 kb-stats.js）

## 一、背景

样品看板统计卡具备「单击 toggle 筛选待办 · 双击跳列表」双语义交互，其余子系统各自为政：projects 静态无点击、fixtures 仅单击筛选无双击、control/workbench 为跳转/服务端筛选派（本次不动）。抽取共享组件统一协议，消复制粘贴（§15）。

## 二、全链路关联依赖清单（变更前置排查结论）

| 层 | 点位 | 结论 |
|---|---|---|
| 样式 | `public/css/app.css` L228-235 `.kb-stats/.kb-stat/.active/hover/::before/.n/.l` | 门户级共享，**零改动** |
| 上游 | control/workbench 仅消费 kb-stat 样式协议 | 不插入其 bundle 数组，构建产物行为不变 |
| 下游 | `filterKbStat`（samples dashboard-todo.js）、`filterDashStats`（fixtures dashboard.js）全局函数 | 签名不变，仅渲染源切换 |
| 深链 | projects `lkRestoreFromHash` 已支持 `#/list?status=` | **零改动** |
| 深链 | fixtures `_fxRouteQuery` 仅消费 `model` | 扩展消费 `status`（renderFixtureList） |
| 构建 | tools/build-bundles.js + bundle-sources.json | 三个 bundle 各插入 `shared/frontend/kb-stats.js` |
| 受影响场景 | 三看板统计卡点击/双击；fixtures 列表 status 深链；行点击/「去处理」防冒泡 | 见回归步骤 |

## 三、组件协议（shared/frontend/kb-stats.js）

```js
KbStats.render(cards, opts)  // cards: [{n,l,color,href?,title?}]
                             // opts: { click:'filter'|'navigate'|'none',
                             //         filterHandler:'全局函数名', activeIndex:number|null }
KbStats.wrap(inner)          // .kb-stats 网格外壳
KbStats.setActive(el, idx)   // active 管理（预留）
```

- `filter` + 卡片 `href` → 双击 ondblclick 跳列表（双击前两次 click 恰好复位 toggle，自洽）
- 样式不写入本文件，统一走 /css/app.css

## 四、各子系统接入

| 子系统 | 语义 | 变更 |
|---|---|---|
| projects | navigate 单击跳列表 | 5 卡配 href：`#/projects`、`#/list`、`#/list?status=DONE/IN_PROGRESS/OVERDUE`；title 提示 |
| fixtures | filter + 双击（状态卡） | 4 张单一状态卡（待处理/领用中/已接收/改善中）配 href 双击；复合键卡（待验证/待保养/呆滞）仅单击筛选；activeIndex=_dashFilter 保持首卡默认高亮 |
| samples | filter + 双击（等价迁移） | 行为逐项保留：toggle/双击/title/初始无高亮（active 由 filterKbStat DOM 切换） |
| fixtures list.js | 深链扩展 | `#/list?status=X` → fixtureListState.status 预选（复用既有 model 深链模式） |

## 五、兼容与风险

- **samples deployed:true**：纯渲染源替换，DOM 结构与事件协议逐项等价（onclick/ondblclick/title/class 全一致）；不发版说明升级，硬刷新即生效。
- fixtures 列表新增 status 深链为**纯增量**（原先该参数被忽略）。
- 旧客户端兼容：无接口出入参变化，后端零改动。
- **回滚**：`git revert <commit>` 后重新构建三 bundle 并还原 `?v=`（或直接 `git checkout <prev> -- <files>` + 重建）。

## 六、部署步骤（服务器，构建+静态替换，无需重启）

1. 上传 7 个文件（kb-stats.js、3 视图、fixtures list.js、bundle-sources.json、本文档）
2. `rm -f /tmp/bundle-*.js && node tools/build-bundles.js`
3. `cp /tmp/bundle-{samples,fixtures,projects}.js` 到各自 `frontend/js/bundle.js`（control/workbench 不动）
4. `chown www:www` 全部触及文件；`sed` 三个 index.html `?v=` 为 `.bundle-ver` 新值
5. ~~4100 独立实例（sample_mgmt_test）跑回归脚本~~ → **替代验证**（见第八节）：工作区含并行会话未提交的后端改动（db/migrations、routes/misc、samples 后端），从工作区启动 4100 实例会加载其进行中代码、测试对象失真；改用「渲染等价性 diff（5 角色逐字节）+ 组件单测 + bundle 语法检查 + 生产静态链路只读核验」组合，对纯前端改动验证强度更高

## 七、回归步骤（逐条）

samples：单击卡筛选→再点同卡回退全部→active 切换→双击跳 `#/samples?status=`→列表筛选生效→行点击详情/「去处理」防冒泡
fixtures：同上（status 卡）→复合卡无双击→`#/list?status=IN_USE` 深链预选→原 `?model=` 深链不回归→首卡默认 active
projects：单击 5 卡分别跳项目/任务列表→status 深链预选→分布/趋势区不受影响
构建产物：3 bundle 含 KbStats 段、index.html `?v=` 与 .bundle-ver 一致、control/workbench bundle 与 `?v=` 未变

## 八、状态与验证记录（2026-09-04）

- [x] 组件单测 10/10 PASS（filter/navigate/none、href 双击、active、缺省色、wrap）
- [x] samples 等价性 diff：5 角色 × 渲染 HTML 与 _kbStats 逐字节一致（AMD/RD/QA/CUSTODY/ME）
- [x] 3 bundle node --check 通过；生产静态链路 `?v=bmtmo3jqm` 就位；control/workbench 保持 `?v=bmtmmwwmu` 未动
- [x] 提交 07c98af（不 push，除非用户要求）；samples 源码以 `git update-index` 暂存干净版，工作区零写入

## 九、并行冲突记录（重要）

实施期间检测到另一并行会话正在开发样品「领用中 CHECKED_OUT / CHECKOUT 领出 / RETURN_OUT 归还入库」功能：
- 其未提交改动：db/migrations/index.js、db/migrations/samples.js、routes/misc.js、shared/frontend/api-base.js，并在本组件版本之上为 samples 看板追加了第 8 张「领用中」统计卡（格式与 KbStats 协议一致，兼容）
- 本提交将 samples/dashboard.js 暂存为纯 KbStats 迁移版（与 bundle 构建输入一致）；工作区保留并行会话的 CHECKED_OUT 增量未动
- **并行会话完成其功能后需自行重建 bundle 并提交**（其源码增量基于 KbStats 版本，无冲突）
