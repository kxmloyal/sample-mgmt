# 治具实物照片管理 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MAKE 操作强制上传实物照片（≥1 张），保养操作可选保养照，详情附件 Tab 按分类分组展示。

**Architecture:** 复用现有 `fixture_files` 表，通过 category 字段区分 photo 类型（`fixture_photo`/`maintenance_photo`/`site_photo`），MAKE 的 async allowedActions 校验扩展为同时检查 design_drawing 和 fixture_photo。

**Tech Stack:** Node.js + Express + MariaDB + 原生 HTML/CSS/JS

**Spec:** [2026-07-31-fixture-photos-design.md](../specs/2026-07-31-fixture-photos-design.md)

---

## 文件结构

| 文件 | 职责 | 操作 |
|---|---|---|
| `routes/fixture-helpers.js` | MAKE 校验追加 fixture_photo | 修改 |
| `public/js/fixture-scan.js` | MAKE 表单追加照片上传区 | 修改 |
| `public/js/fixture-detail.js` | 附件 Tab 按分类分组 | 修改 |
| `public/js/fixture-file-ui.js` | 图片缩略图预览 + category 标签 | 修改 |
| `public/js/fixture-file-api.js` | FILE_CATEGORY_CN 新增 photo 分类 | 修改 |

---

### Task 1: MAKE 强制校验 fixture_photo

**Files:** Modify `routes/fixture-helpers.js:22-25`

- [ ] **Step 1: 读取当前 allowedActions 的 MAKE 校验**

当前代码（第 22-25 行）：

```js
if (role === 'RD' && status === 'ACCEPTED') {
    var cnt = await D.countFilesByCategory(fixture.id, 'design_drawing');
    if (cnt && cnt.cnt > 0) actions.push('MAKE');
  }
```

- [ ] **Step 2: 追加 fixture_photo 校验**

合并为一次对两个分类的检查：

```js
if (role === 'RD' && status === 'ACCEPTED') {
  var cntDrawing = await D.countFilesByCategory(fixture.id, 'design_drawing');
  var cntPhoto = await D.countFilesByCategory(fixture.id, 'fixture_photo');
  if (cntDrawing && cntDrawing.cnt > 0 && cntPhoto && cntPhoto.cnt > 0) actions.push('MAKE');
}
```

- [ ] **Step 3: 语法验证**

```bash
node -c /www/wwwroot/sample-mgmt/routes/fixture-helpers.js
```

期望：exit code 0。

- [ ] **Step 4: Commit**

```bash
git add routes/fixture-helpers.js
git commit -m "feat(photo): enforce fixture_photo >=1 alongside design_drawing for MAKE"
```

---

### Task 2: 扫码台 MAKE 表单追加照片上传

**Files:** Modify `public/js/fixture-scan.js`

- [ ] **Step 1: 读取现有 MAKE 表单逻辑**

找到 `execFixAction` 中 `action === 'MAKE'` 的分支，了解现有表单 HTML 拼接方式。

- [ ] **Step 2: 在 MAKE 表单中追加照片上传**

在现有 MAKE 表单 HTML 拼接中追加：

```js
// 在现有设计图纸上传区域之后追加
formHtml += '<div class="field"><label>治具实物照片 <small>(必填，至少1张)</small></label>';
formHtml += '<input type="file" id="act-photo-input" accept="image/*" style="width:100%;box-sizing:border-box" onchange="_handlePhotoSelected()" />';
formHtml += '<div id="act-photo-list" style="margin-top:6px;font-size:12px"></div></div>';
```

- [ ] **Step 3: 实现照片选择和上传逻辑**

追加辅助函数：

```js
var _pendingPhotos = [];

function _handlePhotoSelected() {
  var input = document.getElementById('act-photo-input');
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  _pendingPhotos.push(file);
  var list = document.getElementById('act-photo-list');
  list.innerHTML += '<div style="padding:4px 0">' + file.name + ' <a class="link" onclick="_removePendingPhoto(' + (_pendingPhotos.length - 1) + ')">移除</a></div>';
  input.value = '';
}
function _removePendingPhoto(idx) {
  _pendingPhotos.splice(idx, 1);
  _handlePhotoSelected(); // re-render list
  // 简单重建列表
  var list = document.getElementById('act-photo-list');
  list.innerHTML = _pendingPhotos.map(function(f, i) {
    return '<div style="padding:4px 0">' + f.name + ' <a class="link" onclick="_removePendingPhoto(' + i + ')">移除</a></div>';
  }).join('');
}
```

- [ ] **Step 4: 修改 submitFixAction 中的 MAKE 分支**

在 `submitFixAction` 函数的 `action === 'MAKE'` 分支中，追加照片上传逻辑：

```js
// 在现有 submitFixAction 中，action === 'MAKE' 的处理末尾追加
// 上传实物照片
if (_pendingPhotos && _pendingPhotos.length > 0) {
  var fixtureId = _fixScanResult ? (_fixScanResult.id || (_fixScanResult.fixture && _fixScanResult.fixture.id)) : null;
  if (fixtureId) {
    for (var pi = 0; pi < _pendingPhotos.length; pi++) {
      try {
        await uploadFixtureFile(fixtureId, _pendingPhotos[pi], 'fixture_photo');
      } catch (e) { /* 继续 */ }
    }
    _pendingPhotos = [];
  }
}
```

- [ ] **Step 5: 语法验证**

```bash
node -c /www/wwwroot/sample-mgmt/public/js/fixture-scan.js
```

- [ ] **Step 6: Commit**

```bash
git add public/js/fixture-scan.js
git commit -m "feat(scan): add fixture photo upload requirement to MAKE form"
```

---

### Task 3: 详情附件 Tab 按分类分组

**Files:** Modify `public/js/fixture-detail.js:114-120`

- [ ] **Step 1: 重写 buildFilesTab 函数**

```js
// ═══ 附件 Tab（按分类分组） ═══
var FILE_GROUP_LABELS = {
  'design_drawing': '📐 设计图纸',
  'fixture_photo': '📸 实物照片',
  'maintenance_photo': '🔧 保养照片',
  'site_photo': '🏭 现场照片',
  'purchase_order': '📋 请购单',
  'other': '📄 其他附件'
};

function buildFilesTab() {
  var html = '<div style="padding:8px 14px 0">';
  if (!_fixFiles || !_fixFiles.length) { html += '<div class="empty" style="padding:24px">暂无附件</div>'; return html + '</div>'; }

  // 按 category 分组
  var groups = {};
  _fixFiles.forEach(function(file) {
    var cat = file.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(file);
  });

  // 按固定顺序渲染
  var order = ['design_drawing', 'fixture_photo', 'maintenance_photo', 'site_photo', 'purchase_order', 'other'];
  order.forEach(function(cat) {
    var files = groups[cat];
    if (!files || !files.length) return;
    html += '<div style="font-weight:600;font-size:12px;color:var(--muted);padding:8px 0 4px;border-bottom:1px solid var(--line)">' + (FILE_GROUP_LABELS[cat] || cat) + ' (' + files.length + ')</div>';
    html += files.map(function(file) { return renderFixFileItem(_fixId, file); }).join('');
  });

  return html + '</div>';
}
```

- [ ] **Step 2: 语法验证**

```bash
node -c /www/wwwroot/sample-mgmt/public/js/fixture-detail.js
```

- [ ] **Step 3: Commit**

```bash
git add public/js/fixture-detail.js
git commit -m "feat(detail): group files tab by category with labels"
```

---

### Task 4: 文件 UI — category 标签 + 图片缩略图预览

**Files:** Modify `public/js/fixture-file-api.js`, `public/js/fixture-file-ui.js`

- [ ] **Step 1: FILE_CATEGORY_CN 新增 photo 分类**

在 `fixture-file-api.js` 或文件开头找到 `FILE_CATEGORY_CN` 定义，追加：

```js
'fixture_photo': '实物照片',
'maintenance_photo': '保养照片',
'site_photo': '现场照片',
```

- [ ] **Step 2: 图片缩略图预览**

在 `renderFixFileItem` 函数中，对于 `mime_type` 以 `image/` 开头的文件，在文件名前追加缩略图：

```js
function renderFixFileItem(fixtureId, file) {
  var isImage = file.mime_type && file.mime_type.startsWith('image/');
  var isPreview = PREVIEW_TYPES.indexOf(file.mime_type) !== -1;
  var is3D = file.mime_type === 'model/stl' || /step|iges|stp|igs|stl/i.test(file.original_name || '');
  var catLabel = FILE_CATEGORY_CN[file.category] || file.category;
  var html = '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">';
  // 图片缩略图
  if (isImage) {
    html += '<img src="' + filePreviewUrl(fixtureId, file.id) + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="previewFixFile(event,' + fixtureId + ',' + file.id + ',\'' + (file.mime_type||'') + '\')" />';
  } else {
    html += '<span style="font-size:18px">' + fileIcon(file.mime_type) + '</span>';
  }
  // 后续不变...
```

保留现有预览/下载/删除按钮不变。

- [ ] **Step 3: 语法验证**

```bash
node -c /www/wwwroot/sample-mgmt/public/js/fixture-file-api.js
node -c /www/wwwroot/sample-mgmt/public/js/fixture-file-ui.js
```

- [ ] **Step 4: Commit**

```bash
git add public/js/fixture-file-api.js public/js/fixture-file-ui.js
git commit -m "feat(files): add photo category labels and image thumbnail preview"
```

---

### Task 5: 文件路由 — 图片上传格式校验 + 图片预览支持

**Files:** Modify `routes/fixture-files.js`

- [ ] **Step 1: 读取现有上传路由**

查看 multer 配置和上传路由处理逻辑。

- [ ] **Step 2: 追加图片格式校验**

在上传路由中，当 category 为 `fixture_photo`/`maintenance_photo`/`site_photo` 时校验 MIME 类型：

```js
// 在 multer 或路由处理中追加
var photoCategories = ['fixture_photo', 'maintenance_photo', 'site_photo'];
if (photoCategories.includes(req.body.category)) {
  if (!req.file.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: '照片类别仅支持图片格式 (jpg/png/webp)' });
  }
}
```

- [ ] **Step 3: 确保图片文件可预览**

确认 `/api/fixtures/:fixtureId/files/:fileId/preview` 路由对图片文件返回正确的 `Content-Type`（multer 已默认处理，无需额外改动）。

- [ ] **Step 4: 语法验证**

```bash
node -c /www/wwwroot/sample-mgmt/routes/fixture-files.js
```

- [ ] **Step 5: Commit**

```bash
git add routes/fixture-files.js
git commit -m "feat(files): restrict photo category uploads to image types only"
```

---

## 回归验证清单

- [ ] 研发扫码→ACCEPTED 治具→上传设计图纸和实物照片→MAKE 按钮出现
- [ ] 实物照片未上传时，MAKE 按钮不出现
- [ ] 扫码台 MAKE 表单可多选照片上传
- [ ] 保养操作可附加保养照片（选填）
- [ ] 详情弹窗附件 Tab 按分类分组展示（设计图纸/实物照片/保养照片/其他）
- [ ] 图片文件在附件列表中显示缩略图
- [ ] 样品管理系统无影响

## 子系统隔离

- 所有变更仅涉及治具专属文件（`fixture-*`）
- 共享文件无修改
- 样品系统零影响
