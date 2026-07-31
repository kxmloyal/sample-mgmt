# Dashboard 交互统一 + 角色排序设计

> 日期: 2026-08-01
> 状态: 已批准(用户确认"可行")
> 前置: 2026-08-01-dashboard-redesign(已完成:统计卡片+比例条+待办+预警+快捷操作)

## 1. 背景与问题

Dashboard 重构已完成基础功能,但深入分析发现 7 个交互痛点:

1. **交互不一致**:卡片筛选待办(不跳转)、比例条跳列表、待办"去处理"跳扫码台——三种模式混杂
2. **下钻缺失**:卡片点击只筛选待办,无法看该状态**全部样品**(需点比例条才跳列表)
3. **操作链**:待办"去处理"跳扫码台(已带编号自动填充,实际操作链不长,保留)
4. **信息密度高**:首屏卡片+比例条+待办+预警+快捷操作,小屏拥挤(本设计暂不解决,留待方案B)
5. **无选中态**:比例条/预警/待办行无高亮反馈(仅卡片有 .active)
6. **无实时性**:数据手动刷新(本设计暂不解决,YAGNI)
7. **角色差异弱**:5角色看同一布局,仅待办内容不同,卡片顺序未按角色优先级

## 2. 设计目标

- **交互统一**:4类可点击元素(卡片/比例条/待办行/预警行)统一交互模式 + 选中态
- **下钻增强**:卡片双击跳样品列表,看该状态全部样品
- **角色排序**:卡片顺序按角色优先级(RD制作优先/QA发行优先/CUSTODY接收优先)
- **视觉统一**:所有可点击元素 hover + .active 反馈

## 3. 详细设计

### 3.1 交互统一(4类元素)

| 元素 | 单击 | 双击 | 选中态 |
|---|---|---|---|
| 统计卡片 | 筛选待办(已有) | 跳样品列表(下钻) | .active(已有) |
| 比例条段/图例 | 跳样品列表(已有) | — | 新增 .active |
| 待办行 | 进样品详情(新增) | "去处理"按钮→扫码台(保留) | 新增 .active |
| 预警行 | 进样品详情(新增) | "去处理"按钮→扫码台(保留) | 新增 .active |

**职责区分**(不强行统一破坏职责):
- **筛选**:卡片单击(本地筛选待办,不跳转)
- **下钻**:卡片双击/比例条单击→样品列表(看状态分布)
- **查看**:待办/预警行单击→样品详情
- **操作**:待办/预警"去处理"→扫码台(带编号自动填充,已优化)

### 3.2 角色排序(卡片顺序)

定义 `STAT_ORDER` 常量(角色→状态顺序数组):

| 角色 | 卡片顺序(高优先级状态前置) |
|---|---|
| ADMIN | 总数→NEW→PRODUCED→RELEASED→IN_CUSTODY→RETURNING→RETIRED(全量) |
| RD | 总数→NEW→PRODUCED→RETURNING→RELEASED→IN_CUSTODY→RETIRED(制作优先) |
| QA | 总数→PRODUCED→RETURNING→RELEASED→NEW→IN_CUSTODY→RETIRED(发行审核优先) |
| ME/CUSTODY | 总数→RELEASED→IN_CUSTODY→NEW→PRODUCED→RETURNING→RETIRED(接收保管优先) |

实现:`_renderStats` 按 `STAT_ORDER[me.role]` 排序 stats 数组后渲染卡片。

### 3.3 视觉统一

- **hover**:卡片已有(transform+shadow),补比例条段/待办行/预警行(背景微变化)
- **.active**:卡片已有(彩色边框),补:
  - 比例条段:边框高亮 + 透明度增强
  - 待办行:左侧优先级竖条加粗 + 背景色
  - 预警行:背景色加深

CSS 类:
- `.dash-bar-seg:hover` / `.dash-bar-seg.active`
- `.dash-todo-row:hover` / `.dash-todo-row.active`
- `.dash-alert-row:hover` / `.dash-alert-row.active`

## 4. 文件改动

| 文件 | 改动 | 预估行数 |
|---|---|---|
| dashboard.js | 卡片双击下钻 + 比例条active + STAT_ORDER 角色排序 + 预警行onclick进详情 | 128→~155行(300上限) |
| dashboard-todo.js | 待办行 onclick 进详情(viewDetail) + active 切换 | 64→~75行(300上限) |
| app.css | .dash-bar-seg/.dash-todo-row/.dash-alert-row active+hover | 152→~165行 |
| index.html | 版本号升级 0803→0804 |
| detail.js | 确认 viewDetail(id) 可用(待办/预警行调用,可能无需改) | 0行(确认) |

## 5. 兼容性

- **卡片单击筛选保留**(向后兼容,不破坏已有功能)
- **"去处理"按钮保留**(操作链不破坏,仍跳扫码台带编号)
- **比例条单击跳转保留**(向后兼容)
- **角色排序仅改顺序**,统计数据不变,卡片内容不变
- **子系统隔离**:仅样品 dashboard,治具 fixture.html 不受影响
- **无 API/DB 变更**:纯前端交互改造

## 6. 实现要点

### 6.1 卡片双击下钻
```javascript
// 卡片 ondblclick 跳样品列表(下钻)
var href = x[2] === 'total' ? '#/samples' : '#/samples?status=' + x[2];
return '<div class="dash-stat" ... onclick="filterTodo(\''+f+'\',this)" ondblclick="location.hash=\''+href+'\'">...'
```
注意:单击和双击共存,浏览器会延迟单击触发(约300ms)以区分双击。可接受(筛选待办延迟300ms无感)。

### 6.2 STAT_ORDER 角色排序
```javascript
var STAT_ORDER = {
  ADMIN:   ['total','NEW','PRODUCED','RELEASED','IN_CUSTODY','RETURNING','RETIRED'],
  RD:      ['total','NEW','PRODUCED','RETURNING','RELEASED','IN_CUSTODY','RETIRED'],
  QA:      ['total','PRODUCED','RETURNING','RELEASED','NEW','IN_CUSTODY','RETIRED'],
  ME:      ['total','RELEASED','IN_CUSTODY','NEW','PRODUCED','RETURNING','RETIRED'],
  CUSTODY: ['total','RELEASED','IN_CUSTODY','NEW','PRODUCED','RETURNING','RETIRED']
};
// _renderStats 按 STAT_ORDER[me.role] 排序
```

### 6.3 待办/预警行 onclick 进详情
```javascript
// 待办行 <tr onclick="viewDetail('SAMPLE_ID')">
// "去处理"按钮 onclick="goScan('编号')" 加 event.stopPropagation() 防止冒泡到行
```

## 7. 验证清单

### 7.1 功能验证(5角色登录)
- [ ] 卡片单击→筛选待办(已有,不破坏)
- [ ] 卡片双击→跳样品列表(下钻,新)
- [ ] 比例条单击→跳样品列表(已有,不破坏)
- [ ] 比例条段 hover/active 反馈(新)
- [ ] 待办行单击→进样品详情(新)
- [ ] 待办"去处理"→扫码台(已有,不破坏)
- [ ] 预警行单击→进样品详情(新)
- [ ] 预警"去处理"→扫码台(已有,不破坏)
- [ ] 卡片顺序按角色优先级(RD:NEW置顶,QA:PRODUCED置顶,CUSTODY:RELEASED置顶)

### 7.2 回归验证
- [ ] 卡片筛选待办功能正常(不破坏)
- [ ] 比例条跳转样品列表正常(不破坏)
- [ ] 待办分页/优先级正常(不破坏)
- [ ] 预警展示正常(不破坏)
- [ ] 治具系统不受影响(子系统隔离)

### 7.3 文件臃肿检测
- [ ] dashboard.js ≤300行(预估155)
- [ ] dashboard-todo.js ≤300行(预估75)
- [ ] app.css ≤20000字符(预估~165行)

## 8. 不做(YAGNI)

- 实时刷新/通知(方案D,过度工程)
- 5角色5布局(方案C,维护重)
- 信息分层折叠(方案B,留待后续)
- 右键菜单/长按(双击足够)
