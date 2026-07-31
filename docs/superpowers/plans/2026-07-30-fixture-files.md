# 治具图纸/文件管理 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 治具 ACCEPTED 状态下 RD 可上传设计图纸/请购单等文件，设计图纸上传成为 MAKE 操作的强制前置条件，PDF/图片支持预览。

**Architecture:** 新增 `fixture_files` 表存储文件元数据 + multer 处理 multipart 上传，文件落盘 `public/uploads/fixture_files/`。新 DAO `db/fixture-files.js` + 新路由 `routes/fixture-files.js`（4 个端点）。MAKE 执行前检查是否有 design_drawing 分类文件。前端扫码台 ACCEPTED 状态增加文件管理卡片（预览/上传/删除）。

**Tech Stack:** Node.js + Express + multer + MariaDB(mysql2) + 原生 HTML/CSS/JS

---

## 文件结构

| 文件 | 职责 | 类型 |
|---|---|---|
| `db.js` | 建表迁移 + 注册新 DAO 到模块导出 | 修改 |
| `db/fixture-files.js` | fixture_files 表 CRUD（工厂模式） | **新建** |
| `routes/fixture-files.js` | 文件上传/列表/下载/删除 4 个端点 | **新建** |
| `server.js` | 注册 multer 中间件 + 注册新路由 | 修改 |
| `routes/fixtures.js:20-68,289` | allowedActions + doMake 增加图纸校验 | 修改 |
| `public/js/fixture-api.js` | FILE_CATEGORY_CN 常数 + 文件 API 函数 | 修改 |
| `public/js/fixture-scan.js:60-89` | ACCEPTED 状态显示文件管理卡片 | 修改 |
| `public/js/fixture-list.js:123-178` | 详情弹窗增加附件区域 | 修改 |
| `public/fixture.html` | 文件预览 overlay + 卡片样式 | 修改 |

---

### Task 1: 数据库迁移 + DAO 层

**Files:**
- Create: `db/fixture-files.js`
- Modify: `db.js:162-180`

- [ ] **Step 1: 在 db.js 中新增 fixture_files 建表迁移**

在 `await migrateFixtureLifecycle();` 之后追加：

```js
  // 治具文件管理迁移（2026-07-30）
  async function migrateFixtureFiles() {
    try {
      await pool.execute(`
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
          FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE,
          INDEX idx_ffiles_fixture (fixture_id),
          INDEX idx_ffiles_category (category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    } catch (e) { if (e.code !== 'ER_TABLE_EXISTS_ERROR') throw e; }
  }
  await migrateFixtureFiles();
```

- [ ] **Step 2: 创建 `db/fixture-files.js` DAO 层**

```js
// db/fixture-files.js — 治具文件 CRUD（工厂模式）
module.exports = function({ q, one, dbRef, persist, nowISO }) {
  var UPLOAD_DIR = require('path').join(__dirname, '..', 'public', 'uploads', 'fixture_files');
  var fs = require('fs');
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // 列出治具的所有文件
  function listFiles(fixtureId) {
    return q('SELECT * FROM fixture_files WHERE fixture_id=? ORDER BY uploaded_at DESC', [fixtureId]);
  }

  // 获取单文件
  function getFileById(fileId) {
    return one('SELECT * FROM fixture_files WHERE id=?', [fileId]);
  }

  // 新增文件记录
  async function addFile({ fixture_id, category, filename, original_name, mime_type, file_size, uploaded_by }) {
    var ts = nowISO();
    await dbRef.run(
      'INSERT INTO fixture_files (fixture_id,category,filename,original_name,mime_type,file_size,uploaded_by,uploaded_at) VALUES (?,?,?,?,?,?,?,?)',
      [fixture_id, category||'other', filename, original_name, mime_type||null, file_size||0, uploaded_by||null, ts]
    );
    persist();
    return one('SELECT * FROM fixture_files WHERE fixture_id=? AND filename=? ORDER BY id DESC LIMIT 1', [fixture_id, filename]);
  }

  // 删除文件记录 + 磁盘文件
  async function deleteFile(fileId) {
    var f = await getFileById(fileId);
    if (!f) return false;
    var filePath = require('path').join(UPLOAD_DIR, f.filename);
    fs.unlink(filePath, function(){}); // 异步删除，忽略错误
    await dbRef.run('DELETE FROM fixture_files WHERE id=?', [fileId]);
    persist();
    return true;
  }

  // 按分类统计（用于 MAKE 前置校验）
  function countFilesByCategory(fixtureId, category) {
    return one('SELECT COUNT(*) AS cnt FROM fixture_files WHERE fixture_id=? AND category=?', [fixtureId, category]);
  }

  // 获取上传目录路径
  function getUploadDir() { return UPLOAD_DIR; }

  return { listFiles, getFileById, addFile, deleteFile, countFilesByCategory, getUploadDir };
};
```

- [ ] **Step 3: 在 db.js 中注册新 DAO**

在 `const fixtures = require('./db/fixtures')({ q, one, dbRef, persist, nowISO });` 之后追加：

```js
const fixtureFiles = require('./db/fixture-files')({ q, one, dbRef, persist, nowISO });
```

修改 module.exports：

```js
module.exports = {
  init, ready, pool: getPool, nowISO,
  ...users, ...samples, ...logs, ...fixtures, ...fixtureFiles
};
```

- [ ] **Step 4: 验证迁移**

Run: `node -e "require('./db').ready.then(function(r){console.log('migration OK, r=',r);process.exit(0)})"`
Expected: "migration OK, r= true" 且不报错

---

### Task 2: multer 配置 + 文件路由

**Files:**
- Create: `routes/fixture-files.js`
- Modify: `server.js:1-17,88-98`

- [ ] **Step 1: 安装 multer**

```bash
npm install multer
```

- [ ] **Step 2: 创建 `routes/fixture-files.js`**

```js
// routes/fixture-files.js — 治具文件上传/列表/下载/删除
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const D = require('../db');
const { logger } = require('../logger');

// 文件大小限制（按类别）
var SIZE_LIMITS = {
  'image': 10 * 1024 * 1024,   // 10MB
  'pdf': 20 * 1024 * 1024,      // 20MB
  'default': 50 * 1024 * 1024   // 50MB
};

function getMaxSize(mimeType) {
  if (!mimeType) return SIZE_LIMITS.default;
  if (mimeType.startsWith('image/')) return SIZE_LIMITS.image;
  if (mimeType === 'application/pdf') return SIZE_LIMITS.pdf;
  return SIZE_LIMITS.default;
}

var storage = multer.diskStorage({
  destination: function(req, file, cb) {
    var dir = D.getUploadDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    var ext = path.extname(file.originalname);
    cb(null, (uuidv4 ? uuidv4() : Date.now().toString(36) + Math.random().toString(36).slice(2)) + ext);
  }
});

var upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    var maxSize = getMaxSize(file.mimetype);
    if (parseInt(req.headers['content-length'] || '0') > maxSize) {
      return cb(new Error('文件类型 ' + file.mimetype + ' 大小不能超过 ' + Math.round(maxSize/1024/1024) + 'MB'));
    }
    cb(null, true);
  }
});

function register(app) {
  var requireAuth = app.locals.requireAuth;
  var currentUser = app.locals.currentUser;

  // 获取文件列表
  app.get('/api/fixtures/:id/files', requireAuth, async function(req, res) {
    var fixtureId = Number(req.params.id);
    var f = await D.getFixtureById(fixtureId);
    if (!f) return res.status(404).json({ error: '治具不存在' });
    var files = await D.listFiles(fixtureId);
    res.json(files);
  });

  // 上传文件
  app.post('/api/fixtures/:id/files', requireAuth, async function(req, res) {
    var fixtureId = Number(req.params.id);
    var u = await currentUser(req);
    if (u.role !== 'RD') return res.status(403).json({ error: '仅 RD 可上传文件' });

    var f = await D.getFixtureById(fixtureId);
    if (!f) return res.status(404).json({ error: '治具不存在' });
    if (f.status !== 'ACCEPTED') return res.status(400).json({ error: '仅「已接收」状态可上传文件，当前：' + f.status });

    upload.single('file')(req, res, async function(err) {
      if (err) return res.status(400).json({ error: '上传失败：' + err.message });
      if (!req.file) return res.status(400).json({ error: '请选择文件' });

      var category = req.body.category || 'other';
      if (['design_drawing','purchase_order','other'].indexOf(category) === -1)
        return res.status(400).json({ error: '无效的文件分类' });

      try {
        var record = await D.addFile({
          fixture_id: fixtureId,
          category: category,
          filename: req.file.filename,
          original_name: req.file.originalname,
          mime_type: req.file.mimetype,
          file_size: req.file.size,
          uploaded_by: u.id
        });
        await D.addFixtureLog({ fixture_id: fixtureId, action: 'FILE_UPLOAD', role: u.role, user_id: u.id, dept: u.dept,
          note: '上传文件：' + category + ' - ' + req.file.originalname });
        res.json(record);
      } catch (e) {
        logger.error('保存文件记录失败: ' + e.message);
        res.status(500).json({ error: '保存文件记录失败' });
      }
    });
  });

  // 下载/预览文件
  app.get('/api/fixtures/:id/files/:fileId/download', requireAuth, async function(req, res) {
    var file = await D.getFileById(Number(req.params.fileId));
    if (!file) return res.status(404).json({ error: '文件不存在' });
    var filePath = path.join(D.getUploadDir(), file.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件已从磁盘删除' });
    res.set('Content-Disposition', 'inline; filename="' + encodeURIComponent(file.original_name) + '"');
    res.set('Content-Type', file.mime_type || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });

  // 删除文件
  app.delete('/api/fixtures/:id/files/:fileId', requireAuth, async function(req, res) {
    var u = await currentUser(req);
    var file = await D.getFileById(Number(req.params.fileId));
    if (!file) return res.status(404).json({ error: '文件不存在' });

    // 权限：RD 只能删自己上传的，ADMIN 可删所有
    if (u.role === 'ADMIN') { /* 允许 */ }
    else if (u.role === 'RD' && file.uploaded_by === u.id) { /* 允许 */ }
    else return res.status(403).json({ error: '无权限删除此文件' });

    await D.deleteFile(file.id);
    res.json({ ok: true });
  });
}

module.exports = { register: register };
```

- [ ] **Step 3: 在 server.js 中注册 multer + 新路由**

在 `const app = express();` 之后、`app.use(compression());` 之前追加（确保 raw body 不限流针对文件上传），或者将文件上传的路由注册放在 `express.json` 之后。

在路由注册区域追加：

```js
require('./routes/fixture-files').register(app);
```

由于文件上传使用 multer（multipart），与 `express.json()` 不冲突，直接在已有路由注册行之后追加即可。

- [ ] **Step 4: 安装 uuid 依赖（用于生成唯一文件名）**

```bash
npm install uuid
```

- [ ] **Step 5: 验证路由注册**

```bash
node -e "require('./server')" 2>&1 | head -5
```
Expected: 无报错，应用程序导出 app 对象

---

### Task 3: MAKE 前置校验 — 设计图纸强制

**Files:**
- Modify: `routes/fixtures.js:26-27,57-67,289`

- [ ] **Step 1: 修改 allowedActions — ACCEPTED 状态 MAKE 需异步校验图纸**

将 `allowedActions` 函数改为异步：

```js
async function allowedActions(role, status, fixture, userId) {
  var actions = [];
  if (role === 'RD' && status === 'REQUESTED') actions.push('ACCEPT');
  if (status === 'REQUESTED' && fixture.requested_by === userId) actions.push('CANCEL');
  // RD 制作：需校验是否有设计图纸
  if (role === 'RD' && status === 'ACCEPTED') {
    var cnt = await D.countFilesByCategory(fixture.id, 'design_drawing');
    if (cnt && cnt.cnt > 0) actions.push('MAKE');
  }
  // ... 其余 action 不变
```

- [ ] **Step 2: 修改扫码台 — 返回 hasDesignDrawing 标记给前端**

在 `GET /api/fixtures/scan` 中增加标记：

```js
// 在 res.json 之前追加
var hasDrawing = false;
if (f.status === 'ACCEPTED') {
  var cnt = await D.countFilesByCategory(f.id, 'design_drawing');
  hasDrawing = cnt && cnt.cnt > 0;
}
res.json({ fixture: f, allowedActions: actions, hasDesignDrawing: hasDrawing });
```

- [ ] **Step 3: 修改 POST /api/fixtures/scan — MAKE 执行前校验设计图纸**

在 `doMake` 调用前（line 289 附近）追加校验：

```js
if (chosenAction === 'MAKE') {
  var cnt = await D.countFilesByCategory(f.id, 'design_drawing');
  if (!cnt || cnt.cnt === 0) {
    return res.status(400).json({ error: '请先上传设计图纸后再制作' });
  }
  updated = await doMake(updated, u, ts, f, note, req);
}
```
然后将原来的 `if (chosenAction === 'MAKE')` 分支移除。

同时需要给 `allowedActions` 的所有调用点加上 `await`。检查现有调用：
- `GET /api/fixtures/scan` [L197]：已有，需加 `await`
- `POST /api/fixtures/scan` [L267]：已有，需加 `await`

---

### Task 4: 前端 — 扫码台文件管理卡片

**Files:**
- Modify: `public/js/fixture-api.js`
- Modify: `public/js/fixture-scan.js:60-89`

- [ ] **Step 1: 在 fixture-api.js 中新增加文件分类常量和 API 函数**

追加以下内容：

```js
// 治具文件分类中文映射
var FILE_CATEGORY_CN = { design_drawing: '设计图纸', purchase_order: '请购单', other: '其他' };

// 预览支持的文件类型
var PREVIEW_TYPES = ['image/png','image/jpeg','image/gif','image/webp','application/pdf'];

// 获取文件图标（根据 mime_type）
function fileIcon(mimeType) {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('dwg') || mimeType.includes('cad')) return '✏️';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
  return '📎';
}

// 获取文件的可预览 URL
function filePreviewUrl(fixtureId, fileId) {
  return '/api/fixtures/' + fixtureId + '/files/' + fileId + '/download';
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
```

- [ ] **Step 2: 在 fixture-api.js 中新增文件 API 调用函数**

```js
// 获取治具文件列表
async function fetchFixtureFiles(fixtureId) {
  return await api('GET', '/api/fixtures/' + fixtureId + '/files');
}

// 上传文件
async function uploadFixtureFile(fixtureId, file, category) {
  var formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  // multipart 请求不走 json api()，直接用 fetch
  var resp = await fetch('/api/fixtures/' + fixtureId + '/files', {
    method: 'POST', body: formData, credentials: 'same-origin'
  });
  if (!resp.ok) {
    var err = await resp.json().catch(function() { return { error: '上传失败' }; });
    throw new Error(err.error || '上传失败');
  }
  return await resp.json();
}

// 删除文件
async function deleteFixtureFile(fixtureId, fileId) {
  return await api('DELETE', '/api/fixtures/' + fixtureId + '/files/' + fileId);
}
```

- [ ] **Step 3: 在 showFixActions 中增加文件管理卡片**

在 `showFixActions` 函数中，field-grid 和按钮区域之间插入文件管理区域。当 `result.hasDesignDrawing` 有意义时：

```js
// 在 html += '<div class="field-grid">' + _fxFieldsHtml + '</div></div>'; 之后
// 在 if (actions.length === 0) 之前插入：

  // ACCEPTED 状态：显示文件管理区域
  if (f.status === 'ACCEPTED') {
    html += '<div class="card" style="margin-top:12px;padding:12px"><div style="font-weight:600;font-size:13px;color:var(--muted);margin-bottom:8px">📂 文件管理</div>';
    html += '<div id="fix-files" style="font-size:13px;color:var(--muted)">加载中…</div>';
    html += '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">';
    html += '<select id="fx-file-cat" style="width:auto"><option value="design_drawing">设计图纸</option><option value="purchase_order">请购单</option><option value="other">其他</option></select>';
    html += '<input type="file" id="fx-file-input" style="display:none" onchange="onFixFileSelected()" />';
    html += '<button class="btn sm" onclick="document.getElementById(\'fx-file-input\').click()">上传文件</button></div></div>';
  }
```

在 `document.getElementById('scan-result').innerHTML = html;` 之后追加加载文件列表：

```js
  if (f.status === 'ACCEPTED') loadFixFiles(f.id);
```

- [ ] **Step 4: 新增文件管理辅助函数**

在 `fixture-scan.js` 末尾追加：

```js
async function loadFixFiles(fixtureId) {
  try {
    var files = await fetchFixtureFiles(fixtureId);
    var el = document.getElementById('fix-files');
    if (!el) return;
    if (!files || !files.length) {
      var hasDrawing = files && files.some(function(x) { return x.category === 'design_drawing'; });
      var msg = hasDrawing ? '暂无文件' : '<span style="color:var(--bad)">⚠ 请先上传设计图纸</span>';
      el.innerHTML = msg;
      return;
    }
    el.innerHTML = files.map(function(file) { return renderFixFileItem(fixtureId, file); }).join('');
  } catch (e) { var el2 = document.getElementById('fix-files'); if (el2) el2.innerHTML = '加载失败'; }
}

function renderFixFileItem(fixtureId, file) {
  var isPreview = PREVIEW_TYPES.indexOf(file.mime_type) !== -1;
  var catLabel = FILE_CATEGORY_CN[file.category] || file.category;
  var html = '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">';
  html += '<span style="font-size:18px">' + fileIcon(file.mime_type) + '</span>';
  html += '<span style="flex:1;min-width:0"><span style="font-size:13px">' + e(file.original_name) + '</span><br><small style="color:var(--muted)">' + catLabel + ' · ' + formatFileSize(file.file_size) + ' · ' + fmt(file.uploaded_at) + '</small></span>';
  if (isPreview) {
    html += '<a class="link" style="font-size:12px;white-space:nowrap" onclick="previewFixFile(event,' + fixtureId + ',' + file.id + ',\'' + (file.mime_type||'') + '\')">预览</a>';
  }
  html += '<a class="link" style="font-size:12px;white-space:nowrap;margin-left:4px" href="' + filePreviewUrl(fixtureId, file.id) + '" download>下载</a>';
  html += '<a class="link" style="font-size:12px;white-space:nowrap;color:var(--bad);margin-left:4px" onclick="deleteFixFile(event,' + fixtureId + ',' + file.id + ')">删除</a>';
  html += '</div>';
  return html;
}

function onFixFileSelected() {
  var input = document.getElementById('fx-file-input');
  var cat = document.getElementById('fx-file-cat');
  var fixtureId = null;
  // 从 input 元素最近的 card 中提取 fixture id
  var card = input.closest('.card[style]');
  if (input.dataset.fixtureId) fixtureId = Number(input.dataset.fixtureId);
  if (!fixtureId) { showToast('无法确定治具ID'); return; }
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  uploadFixtureFile(fixtureId, file, cat.value).then(function() {
    showToast('上传成功');
    loadFixFiles(fixtureId);
    // 重新扫描以更新 allowedActions
    var codeEl = document.getElementById('scan-code');
    if (codeEl && codeEl.value) doScanFix();
  }).catch(function(e) { showToast(e.message); });
}

async function previewFixFile(e, fixtureId, fileId, mimeType) {
  e.stopPropagation();
  var url = filePreviewUrl(fixtureId, fileId);
  if (mimeType.startsWith('image/')) {
    // 图片：overlay 大图
    var overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:2000;display:flex;align-items:center;justify-content:center';
    overlay.onclick = function(ev) { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = '<img src="' + url + '" style="max-width:90vw;max-height:90vh;border-radius:8px" /><button style="position:absolute;top:20px;right:20px;background:none;border:none;font-size:24px;color:#fff;cursor:pointer" onclick="this.closest(\'.modal-mask\').remove()">&times;</button>';
    document.body.appendChild(overlay);
  } else if (mimeType === 'application/pdf') {
    // PDF：iframe overlay
    var overlay2 = document.createElement('div');
    overlay2.className = 'modal-mask';
    overlay2.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:2000;display:flex;align-items:center;justify-content:center';
    overlay2.onclick = function(ev) { if (ev.target === overlay2) overlay2.remove(); };
    overlay2.innerHTML = '<div style="position:relative;width:90vw;height:90vh"><button style="position:absolute;top:-30px;right:0;background:none;border:none;font-size:24px;color:#fff;cursor:pointer" onclick="this.closest(\'.modal-mask\').remove()">&times;</button><iframe src="' + url + '" style="width:100%;height:100%;border:none;border-radius:8px"></iframe></div>';
    document.body.appendChild(overlay2);
  }
}

async function deleteFixFile(e, fixtureId, fileId) {
  e.stopPropagation();
  try {
    await deleteFixtureFile(fixtureId, fileId);
    showToast('已删除');
    loadFixFiles(fixtureId);
    // 重新扫描更新 allowedActions
    var codeEl = document.getElementById('scan-code');
    if (codeEl && codeEl.value) doScanFix();
  } catch (err) { showToast(err.message); }
}
```

- [ ] **Step 5: 确保 `showFixActions` 中传递 fixtureId 给 input**

在 `showFixActions` 中 `fx-file-input` 的 HTML 中追加 `dataset.fixtureId`：

```js
html += '<input type="file" id="fx-file-input" data-fixture-id="' + f.id + '" style="display:none" onchange="onFixFileSelected()" />';
```

---

### Task 5: 前端 — 详情弹窗附件区域

**Files:**
- Modify: `public/js/fixture-list.js:150-170`

- [ ] **Step 1: 在 showFixtureDetail 中增加附件区域**

在「人员与时间」card 和「操作日志」card 之间插入附件 card：

```js
    // 附件区域（在人员与时间 card 之后、操作日志 card 之前）
    html += '<div class="card" style="margin-bottom:12px"><div style="font-weight:600;font-size:13px;color:var(--muted);margin-bottom:8px">📂 附件</div><div id="fix-detail-files" style="font-size:13px;color:var(--muted)">加载中…</div></div>';
```

- [ ] **Step 2: loadFixtureDetailLogs 调用后追加加载文件**

在 `showFixtureDetail` 末尾，`loadFixtureDetailLogs(id);` 之后追加：

```js
    loadFixtureDetailFiles(id);
```

- [ ] **Step 3: 新增 loadFixtureDetailFiles 函数**

```js
async function loadFixtureDetailFiles(fixtureId) {
  try {
    var files = await fetchFixtureFiles(fixtureId);
    var el = document.getElementById('fix-detail-files'); if (!el) return;
    if (!files || !files.length) { el.innerHTML = '<span class="muted">暂无附件</span>'; return; }
    el.innerHTML = files.map(function(file) { return renderFixFileItem(fixtureId, file); }).join('');
  } catch (e) { var el2 = document.getElementById('fix-detail-files'); if (el2) el2.innerHTML = '<span class="muted">加载失败</span>'; }
}
```

---

### Task 6: E2E 回归测试

**Files:**
- Create: `test_fixture_files.js`

- [ ] **Step 1: 编写 E2E 测试脚本**

```js
// test_fixture_files.js — 治具文件管理 E2E 测试
var fs = require('fs');
var path = require('path');

var BASE = 'http://127.0.0.1:4003';

async function rq(method, url, body, headers, cks) {
  var opts = { method: method, headers: Object.assign(headers||{}, cks?{Cookie:cks}:{}), redirect: 'manual' };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  var resp = await fetch(BASE + url, opts);
  var txt = await resp.text();
  try { return { status: resp.status, body: JSON.parse(txt), headers: resp.headers }; }
  catch(e) { return { status: resp.status, body: txt, headers: resp.headers }; }
}

function ok(r, msg) { if (r.status >= 200 && r.status < 300) { console.log('  PASS: ' + msg); } else { console.log('  FAIL: ' + msg + ' (status=' + r.status + ')'); process.exitCode = 1; } }
function fail(r, msg) { if (r.status >= 400) { console.log('  PASS: ' + msg); } else { console.log('  FAIL: ' + msg + ' (status=' + r.status + ')'); process.exitCode = 1; } }

async function main() {
  // 登录 rd01
  var login = await rq('POST', '/api/login', { username: 'rd01', password: 'rd123' });
  ok(login, 'rd01 登录');
  var cks = login.headers.get('set-cookie'); if (cks) cks = cks.split(';')[0];

  // 获取治具列表，找一个 ACCEPTED 或 REQUESTED 状态的
  var list = await rq('GET', '/api/fixtures', null, null, cks);
  ok(list, '获取治具列表');
  var fix = list.body.find(function(f) { return f.status === 'ACCEPTED' || f.status === 'REQUESTED'; });

  if (!fix) {
    // 没有则创建一个
    var me = await rq('POST', '/api/login', { username: 'me01', password: 'me123' });
    var meCks = me.headers.get('set-cookie'); if (meCks) meCks = meCks.split(';')[0];
    var create = await rq('POST', '/api/fixtures', { name: '测试治具_文件上传', spec: '文件测试', model: 'V1', station: '测试工站', category: '测试' }, null, meCks);
    ok(create, '创建测试治具');
    fix = create.body;

    // rd01 接收
    var accept = await rq('POST', '/api/fixtures/scan', { code: fix.fixture_no, action: 'ACCEPT', expectedDays: 7 }, null, cks);
    ok(accept, '接收治具');
    fix = accept.body.fixture;
  } else if (fix.status === 'REQUESTED') {
    var accept = await rq('POST', '/api/fixtures/scan', { code: fix.fixture_no, action: 'ACCEPT', expectedDays: 7 }, null, cks);
    ok(accept, '接收治具');
    fix = accept.body.fixture;
  }

  console.log('  测试治具: ' + fix.fixture_no + ' (id=' + fix.id + ', status=' + fix.status + ')');

  // 1. 尝试 MAKE（无设计图纸）→ 应失败
  var make1 = await rq('POST', '/api/fixtures/scan', { code: fix.fixture_no, action: 'MAKE' }, null, cks);
  fail(make1, 'MAKE无设计图纸应失败');
  if (make1.body && make1.body.error) console.log('    错误: ' + make1.body.error);

  // 2. 上传设计图纸
  var formData = new FormData();
  var testFileContent = '%PDF-1.4 fake pdf content for testing';
  formData.append('file', new Blob([testFileContent], { type: 'application/pdf' }), '设计图纸_v1.pdf');
  formData.append('category', 'design_drawing');
  var uploadResp = await fetch(BASE + '/api/fixtures/' + fix.id + '/files', { method: 'POST', body: formData, headers: { Cookie: cks } });
  ok(uploadResp, '上传设计图纸');

  // 3. 上传请购单（图片）
  var formData2 = new FormData();
  formData2.append('file', new Blob(['fake image data'], { type: 'image/png' }), '请购单.png');
  formData2.append('category', 'purchase_order');
  var upload2 = await fetch(BASE + '/api/fixtures/' + fix.id + '/files', { method: 'POST', body: formData2, headers: { Cookie: cks } });
  ok(upload2, '上传请购单');

  // 4. 获取文件列表
  var files = await rq('GET', '/api/fixtures/' + fix.id + '/files', null, null, cks);
  ok(files, '获取文件列表');
  console.log('    文件数: ' + files.body.length);

  // 5. MAKE 应成功
  var make2 = await rq('POST', '/api/fixtures/scan', { code: fix.fixture_no, action: 'MAKE' }, null, cks);
  ok(make2, 'MAKE有设计图纸应成功');
  console.log('    新状态: ' + make2.body.fixture.status);

  // 6. 非 RD 不能上传
  var meLogin2 = await rq('POST', '/api/login', { username: 'me01', password: 'me123' });
  var meCks2 = meLogin2.headers.get('set-cookie'); if (meCks2) meCks2 = meCks2.split(';')[0];
  // 找一个 ACCEPTED 的治具
  if (!fix || fix.status !== 'ACCEPTED') {
    var fix2 = list.body.find(function(f) { return f.status === 'ACCEPTED' && f.id !== fix.id; });
    if (fix2) fix = fix2;
  }
  var upload3 = await fetch(BASE + '/api/fixtures/' + fix.id + '/files', { method: 'POST', body: formData, headers: { Cookie: meCks2 } });
  fail(upload3, 'ME不可上传文件');

  // 7. 下载/预览文件
  if (files.body && files.body.length > 0) {
    var fileId = files.body[0].id;
    var download = await fetch(filePreviewUrl ? filePreviewUrl(fix.id, fileId) : '/api/fixtures/' + fix.id + '/files/' + fileId + '/download', { headers: { Cookie: cks } });
    ok(download, '下载文件');
  }

  // 8. RD 删除自己上传的文件
  if (files.body && files.body.length > 0) {
    var del = await rq('DELETE', '/api/fixtures/' + fix.id + '/files/' + files.body[0].id, null, null, cks);
    ok(del, 'RD删除自己上传的文件');
  }

  console.log('\n✓ 全部测试完成');
}

main().catch(function(e) { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 运行 E2E 测试**

```bash
cd /www/wwwroot/sample-mgmt && LOG_DIR=/tmp PORT=4003 node server.js &
sleep 3
node test_fixture_files.js
```

Expected: 全部 PASS

---

### Task 7: 提交 + 臃肿报告

- [ ] **Step 1: 提交代码**

```bash
git add db.js db/fixture-files.js routes/fixture-files.js server.js routes/fixtures.js public/js/fixture-api.js public/js/fixture-scan.js public/js/fixture-list.js
git commit -m "feat(fixture): add file management with design drawing enforcement"

- ACCEPTED state: RD uploads design drawings/PO/other files
- MAKE action blocked until design_drawing exists
- multer-based multipart upload to public/uploads/fixture_files/
- PDF/image preview with overlay, download for all file types
- File management card in scan UI, attachments in detail modal
- New fixture_files table with foreign key to fixtures
```

- [ ] **Step 2: 输出臃肿检测报告**

预期影响：

| 文件 | 类型 | 行变化 | 函数变化 |
|---|---|---|---|
| `db/fixture-files.js` | 新建DAO | ~50 | 6 |
| `routes/fixture-files.js` | 新建路由 | ~90 | 1(register)+4 |
| `db.js` | 迁移 | +15 | +1 |
| `server.js` | 入口 | +1 | 0 |
| `routes/fixtures.js` | Controller | +10 | 0 |
| `public/js/fixture-api.js` | 前端API | +25 | +3 |
| `public/js/fixture-scan.js` | 前端扫码 | +75 | +4 |
| `public/js/fixture-list.js` | 前端详情 | +15 | +1 |

**fixture-scan.js 预警**: 当前 175 行 +75 = ~250 行（上限300），83.3%→接近90%。当前11个函数 +4 = 15个（超过10上限）。建议后续将文件管理逻辑抽离到 `fixture-file-ui.js`。
