# 治具实物照片管理设计

> 治具实物照（MAKE 强制）+ 保养照/现场照（选填），复用现有 fixture_files 基础设施

## 1. 设计原则

- 复用现有 `fixture_files` 表，通过 category 字段区分图片类型
- MAKE 操作的强制设计图纸校验逻辑扩展到实物照片
- 不上传则不能执行 MAKE — 与设计图纸校验模式一致

## 2. 图片分类

| 分类 | category 值 | 强制 | 触发阶段 | 用途 |
|---|---|---|---|---|
| 治具实物照 | `fixture_photo` | 是（≥1） | MAKE | 制作完成后拍摄，记录治具外观 |
| 保养照 | `maintenance_photo` | 否 | MAINTENANCE | 保养前/后对比 |
| 现场照 | `site_photo` | 否 | 任何阶段 | 工位安装、存放位置等 |

## 3. MAKE 强制校验

`routes/fixture-helpers.js` 中 `allowedActions` 的 MAKE 操作已有异步设计图纸校验：

```js
// 现有逻辑
if (action === 'MAKE') {
  var hasDrawing = await D.hasFixtureFileOfCategory(fixture.id, 'design_drawing');
  if (!hasDrawing) blocked = '请先上传设计图纸';
}

// 追加实物照校验
if (action === 'MAKE') {
  var hasPhoto = await D.hasFixtureFileOfCategory(fixture.id, 'fixture_photo');
  if (!hasPhoto) blocked = '请先上传至少 1 张治具实物照片';
}
```

合并为一次查询，同时检查 design_drawing 和 fixture_photo。

## 4. 扫码台 MAKE 表单

在 `fixture-scan.js` 的 `execFixAction` 中，当 action === 'MAKE' 时：
- 保留现有设计图纸上传区域
- 追加实物照片上传区域（必填，至少 1 张）
- 复用 `fixture-file-ui.js` 的上传组件样式

## 5. 保养表单追加照片

在保养表单中追加可选的照片上传字段（`category: 'maintenance_photo'`），不强制。

## 6. 详情弹窗附件 Tab

按分类分组展示：

```
📐 设计图纸 (3)     — 现有
📸 实物照片 (2)     — 新增
🔧 保养照片 (1)     — 新增
🏭 现场照片 (0)     — 新增
📄 其他附件 (1)     — 现有
```

每类支持：预览、下载、删除。

## 7. 变更清单

| 文件 | 变更 |
|---|---|
| `routes/fixture-helpers.js` | `allowedActions` 追加 fixture_photo 校验 |
| `db/fixtures.js` | 新增 `hasFixtureFileOfCategory` 函数（如不存在） |
| `public/js/fixture-scan.js` | MAKE 表单追加照片上传 |
| `public/js/fixture-detail.js` | 附件 Tab 按分类分组 |
| `public/js/fixture-file-ui.js` | 新增图片预览（缩略图） |
| `routes/fixture-files.js` | 文件上传限制图片格式 |

## 8. 子系统隔离

- 所有变更仅涉及治具专属文件
- 共享 `fixture_files` 表结构不变（仅 category 值新增）
- 样品系统无影响
