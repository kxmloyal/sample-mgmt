# API 一览

> 本文档由 `README.md` 的「API 一览」小节**外迁**而来（2026-09-17；计划见 `docs/superpowers/plans/2026-09-15-split-readme.md`），接口条目与迁出前**逐行等价**（纯位置变化，无内容增删）。
> 架构、子系统与业务说明见 [`README.md`](../README.md)；接口文档的规范位置见 `AGENTS.md` §13。
> 鉴权列「是」= 需登录（session cookie）；括号内为额外角色门槛；「否」= 匿名可访问。

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/login` | POST | 否 | 登录 |
| `/api/logout` | POST | 是 | 登出 |
| `/api/me` | GET | 是 | 当前用户信息 |
| `/api/config` | GET | 否 | 公共配置（demoMode 演示账号开关，登录页使用）|
| `/api/change-password` | POST | 是 | 自助修改密码（校验原密码，新密码≥6位，成功后销毁会话重新登录）|
| `/api/samples` | GET | 是 | 样品列表（筛选/排序/逾期/分页；支持 status=CHECKED_OUT、`pending=role` 角色待办，仅非 ADMIN 生效）|
| `/api/samples` | POST | 是 | 新建样品（含限度字段）|
| `/api/samples/batch` | POST | 是 | 批量新建样品（RD/ADMIN、1~50 条、单事务回滚；批次级 model/source_type/station/card_version 共用，行级 name/notes/sample_type/limit_item/test_standard；返回 id+清单供 `cards/print` 打印）|
| `/api/samples/:id` | GET | 是 | 样品详情 + 操作日志；替代链见 `/api/samples/:id/chain`（只读整链）|
| `/api/samples/:id` | PUT | 是 | 更新样品（可选携带 version 乐观锁，版本冲突返回 409）|
| `/api/samples/:id` | DELETE | 是 | 删除样品=**软删除**（deleted_at 置位；仅 NEW/PRODUCED，仅创建者或管理员；操作日志保留；编号口径 2026-09-11：取消 NEW 释放编号、取消 PRODUCED 仍占用）|
| `/api/samples/:id/qrcode` | GET | 是 | 样品二维码 |
| `/api/samples/:id/qrcode/download` | GET | 是 | 下载高清二维码 |
| `/api/samples/:id/label/download` | GET | 是 | 下载标签 HTML |
| `/api/samples/:id/card/print` | GET | 是 | 打印标示卡 |
| `/api/samples/cards/print` | GET | 是 | 批量打印标示卡（ids 逗号分隔、一次 ≤50，单页多卡 + @page 分页）|
| `/api/samples/:id/images` | GET | 是 | 样品历史照片列表（制作/复检全量留痕，时间倒序）|
| `/api/samples/export` | GET | 是 | 样品列表导出 CSV（复用筛选参数）|
| `/api/samples/models` | GET | 是 | 机型 CRUD 列表；`?view=wall` 返回机型墙聚合（各状态计数/复检逾期/超时未还/封面，60s 缓存）|
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
| `/api/control/orders/stats` | GET | 是 | 管制看板统计（含 `signOverdue` 会签步骤级超时计数，阈值同 overdue_hours；列表支持 `sign_overdue=1` 联动筛选）|
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
| `/api/scan` | POST | 是 | 执行扫码操作（状态机；全链路乐观锁 CAS，版本冲突返回 409，请刷新后重试；新增 CHECKOUT/RETURN_OUT 领用/归还动作，2026-09-05）|
| `/api/dashboard` | GET | 是 | 样品看板数据 |
| `/api/workbench` | GET | 是 | 工作台合并数据（样品+治具积压）；筛选 type/level/dept/apply_dept/keyword/stage/dormant/min_hours/max_hours（兼容旧参数 item_type）+ 分页 limit/offset（≤500）；返回 items/total/limit/offset/summary/deptStats/applyDepts |
| `/api/workbench/settings` | GET/PUT | 是(ADMIN 写) | 工作台积压阈值 |
| `/api/subsystems` | GET | 登录 | 已注册子系统清单（门户渲染；2026-09-08 起普通用户仅返回 deployed:true 已上线子系统；ADMIN 返回全量含未上线（门户半透明展示）；`?all=1` 兼容保留效果等同 ADMIN 默认；未登录返回空数组）|
| `/api/subsystems/:id/deployed` | PUT | 是(ADMIN) | 子系统上线开关（双向切换 deployed，切换即生效门户显隐 + seed/jest 护栏，门户刷新即生效无需重启）|
| `/api/portal/prefs` | GET | 是 | 当前用户门户卡片排序偏好（无记录返回空数组）|
| `/api/portal/prefs` | PUT | 是 | 保存/清除排序偏好（order=[] 或 null 清除）|
| `/api/rd-users` | GET | 是(ADMIN/RD/QA) | RD 用户列表（退回指派选择）|
| `/api/logs` | GET | 是(ADMIN) | 全量操作日志 |
| `/api/users` | GET/POST | 是(ADMIN) | 用户管理 |
| `/api/users/batch` | POST | 是(ADMIN) | 用户批量管理（delete/reset-password/update/enable/disable）|
| `/card/:sample_no` | GET | **否** | 匿名数字标示卡 |
| `/health` | GET | 否 | 健康检查 |
