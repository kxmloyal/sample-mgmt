# 治具图纸/文件管理 — 设计规格

## 概述

在治具管理「ACCEPTED（已接收）」状态下，RD 可上传设计图纸和请购单等文件。设计图纸上传成为执行 MAKE（制作完成）的强制前置条件。

## 需求来源

- RD 接收治具申请后，需要上传设计图纸（PDF/DWG 等）和相关请购文件
- 设计图纸必须在制作完成前上传（强制步骤）
- 支持预览（PDF/图片）和下载

## 详细规格

### 新数据表 `fixture_files`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT AI PK | 主键 |
| fixture_id | INT NOT NULL | 关联治具 ID |
| category | VARCHAR(30) | `design_drawing` / `purchase_order` / `other` |
| filename | VARCHAR(255) | 存储文件名（UUID） |
| original_name | VARCHAR(255) | 原始文件名 |
| mime_type | VARCHAR(100) | MIME 类型 |
| file_size | INT | 字节数 |
| uploaded_by | INT | 上传人 |
| uploaded_at | DATETIME | 上传时间 |

### 文件分类与预览

| 分类 | 标识 | 预览 | 制作前强制 |
|---|---|---|---|
| 设计图纸 | `design_drawing` | PDF→iframe、图片→img 缩略图+放大、其他→下载 | **是** |
| 请购单 | `purchase_order` | 同图纸 | 否 |
| 其他 | `other` | 同图纸 | 否 |

### 上传约束

- 图片 (PNG/JPG/GIF/WEBP)：≤10MB
- PDF：≤20MB
- DWG/STEP/ZIP 等：≤50MB
- 存储目录：`public/uploads/fixture_files/`
- 文件名：UUID+原始扩展名

### 状态流转校验

```
ACCEPTED → [MAKE] → VERIFY_PENDING
            ↑ 检查：fixture_files 中至少有 1 条 category='design_drawing'
```

`/api/fixtures/scan` 执行 MAKE 时增加前置校验：无设计图纸则返回 `400` + 错误信息。

### API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/fixtures/:id/files` | 获取治具文件列表（含 mime_type，供前端渲染预览/下载） |
| POST | `/api/fixtures/:id/files` | 上传文件（multipart/form-data，字段：file + category） |
| DELETE | `/api/fixtures/:id/files/:fileId` | 删除文件 |
| GET | `/api/fixtures/:id/files/:fileId/download` | 下载/预览文件 |

### 角色权限

| 角色 | 上传 | 删除 | 下载/预览 |
|---|---|---|---|
| RD | ACCEPTED 状态可 | 自己上传的可 | 全部 |
| ME/QA/CUSTODY | 不可 | 不可 | 全部 |
| ADMIN | 不可 | 全部 | 全部 |

### 前端交互

**扫码台**：ACCEPTED 状态时，在操作按钮区域上方显示文件管理卡片，含：
- 文件列表（缩略图/图标 + 原始文件名 + 文件大小 + 上传时间）
- PDF 点击内嵌 `<iframe>` 预览
- 图片点击放大
- 上传按钮（分类下拉 + 文件选择 + 上传）
- 缺少设计图纸时 MAKE 按钮 disable + 红色提示「请先上传设计图纸」

**详情弹窗**：新增「附件」区域，显示已上传文件列表（预览/下载）

### 数据库迁移

```sql
CREATE TABLE IF NOT EXISTS fixture_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fixture_id INT NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'other',
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  file_size INT DEFAULT 0,
  uploaded_by INT,
  uploaded_at DATETIME,
  FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE
);
```

### 受影响的已有逻辑

- `allowedActions()` 中 MAKE 不再仅按角色+状态判断，还需查询 fixture_files 表
- `doMake()` 执行前增加文件校验
- ACCEPTED 状态的扫描结果显示增加文件区域
