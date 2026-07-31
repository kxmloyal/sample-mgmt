# 门户首页设计文档

> 日期：2026-07-30 | 状态：已确认

## 1. 需求概述

为「制造品质管理系统」新增统一门户首页，用户登录后进入门户，选择子系统（样品管理/治具管理）进入对应功能。

## 2. 设计决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 布局方案 | C — 顶部导航 + 欢迎页 | 企业内部门户惯例，顶部栏显示用户信息 |
| 治具入口 | A — 灰色「即将上线」卡片 | 治具系统未开发，预留入口但不可点击 |
| 登录流程 | A — 先登录后门户 | 登录页 → 门户 → 子系统，安全性好 |
| 技术实现 | A — 独立 portal.html | 与样品系统解耦，文件小巧，无臃肿风险 |

## 3. 架构

```
用户访问 → index.html（登录页）
  ↓ 登录成功
portal.html（门户首页）
  ├── 顶部栏：系统名称 + 用户信息 + 退出
  ├── 子系统卡片
  │   ├── 🧪 样品管理 → 跳转 index.html#dashboard
  │   └── 🔧 治具管理 → 灰色不可点击（即将上线）
  └── 底部版本号
```

## 4. 文件变更

| 文件 | 操作 | 说明 |
|---|---|---|
| `public/portal.html` | **新建** | 门户首页，纯 HTML+CSS+内联 JS，预计 ≤80 行 |
| `public/index.html` | 修改 | 登录成功跳转 `/portal.html`（改重定向目标） |
| `public/js/api.js` | 修改 | `doLogin()` 成功后 `location.href = '/portal.html'` |
| `server.js` | 无需改 | 已有 `express.static('public')` 托管静态文件 |

## 5. portal.html 页面结构

```
┌──────────────────────────────────────┐
│  制造品质管理系统           👤 用户 退出 │  ← 顶部蓝色导航栏 (#2563eb)
├──────────────────────────────────────┤
│        欢迎使用制造品质管理系统          │
│                                      │
│   ┌──────────┐    ┌──────────┐      │
│   │   🧪     │    │   🔧     │      │
│   │ 样品管理   │    │ 治具管理   │      │
│   │ [进入系统] │    │ 即将上线   │      │
│   └──────────┘    └──────────┘      │
│                                      │
│               v1.0.0                 │
└──────────────────────────────────────┘
```

## 6. 样式规范

- 顶部栏：品牌色 `#2563eb`（与现有一致），高度 48px
- 卡片：白色圆角 12px，box-shadow，hover 上浮 2px
- 治具卡片：`opacity:0.5`，`cursor:not-allowed`，标注「即将上线」徽章
- 复用项目 `:root` CSS 变量：`--brand`/`--bg`/`--shadow`/`--muted`
- 响应式：手机端卡片纵向堆叠，桌面端（≥768px）并排

## 7. JS 逻辑

```js
// 页面加载 → 验证登录态
fetch('/api/me').then(r => {
  if (!r.ok) location.href = '/index.html';
  else r.json().then(u => {
    document.getElementById('user-name').textContent = u.display_name || u.username;
    document.getElementById('user-role').textContent = u.role;
  });
});

// 退出
function doLogout() {
  fetch('/api/logout', { method: 'POST' }).then(() => location.href = '/index.html');
}
```

## 8. Session 共享

portal.html 和 index.html 在同一域名（同一端口）下，cookie 自动共享。portal.html 通过 `/api/me` 验证登录态，session 过期自动跳回登录页。

## 9. 边界与异常

| 场景 | 处理 |
|---|---|
| 未登录直接访问 portal.html | `/api/me` 返回 401 → 跳回 `/index.html` |
| 登录态过期 | 同上 |
| 浏览器不支持 fetch | 不处理（项目已使用 fetch，最低要求一致） |
| 治具卡片被点击 | 无响应（灰色不可点击 + `pointer-events:none`） |

## 10. 验收标准

- [ ] 访问 portal.html 未登录时跳回登录页
- [ ] 登录成功后跳转到 portal.html
- [ ] 顶部栏显示用户名和角色
- [ ] 样品管理卡片可点击，跳转到样品系统
- [ ] 治具管理卡片灰色不可点击
- [ ] 退出按钮可正常退出
- [ ] 响应式：手机/平板/桌面均正常显示
