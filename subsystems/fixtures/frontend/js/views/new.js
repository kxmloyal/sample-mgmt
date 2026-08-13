// fixture-new.js — 治具新建申请（清单列表式批量录入：① 选择机型 → ② 动态行表格，一次提交 N 条）
var _fnModel = '';        // 当前选中机型 code
var _fnModelFull = '';    // 当前选中机型全称（显示用）
var _fnModels = [];       // 机型下拉数据
var _fnRows = [];         // 治具清单行 [{name,spec,station,category,cycle}]
var _fnSubmitting = false; // 提交防抖（双击/连点防护）

// 入口视图：渲染「① 选择机型 → ② 行式清单」，加载机型下拉并渲染首行
async function renderFixtureNew() {
  _fnModel = ''; _fnModelFull = ''; _fnModels = []; _fnRows = []; _fnSubmitting = false;
  _fnRows.push({ name: '', spec: '', station: '', category: '', cycle: 90 });
  var html = '<div class="card fn-card">';
  html += '<h3 style="margin:0 0 16px">新建治具申请（批量）</h3>';

  // ① 选择机型
  html += '<div style="background:var(--bg-card,#fff);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:16px">';
  html += '<div style="font-weight:600;font-size:13px;margin-bottom:10px">① 选择机型 <span style="color:var(--bad)">*</span></div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += '<select id="fn-model" onchange="fnPickModel(this.value)" style="flex:1;min-width:180px"><option value="">请选择机型…</option></select>';
  html += '<span id="fn-model-new-zone" style="display:none;gap:8px;align-items:center;flex-wrap:wrap;width:100%">';
  html += '<fluent-text-field id="fn-model-code" placeholder="机型短码(6~20位字母数字)"></fluent-text-field>';
  html += '<fluent-text-field id="fn-model-name" placeholder="机型全称(必填)" style="flex:1"></fluent-text-field>';
  html += '<fluent-button appearance="accent" size="small" onclick="fnCreateModel()">保存机型</fluent-button>';
  html += '<fluent-button appearance="neutral" size="small" onclick="fnToggleModelNew(false)">取消</fluent-button>';
  html += '</span></div>';
  html += '<div style="margin-top:8px" id="fn-model-actions"></div>';
  html += '<div id="fn-model-picked" style="margin-top:8px;display:none;font-size:13px;color:var(--brand);font-weight:600"></div>';
  html += '</div>';

  // ② 治具清单（行式表格）
  html += '<div style="background:var(--bg-card,#fff);border:1px solid var(--line);border-radius:8px;padding:14px 16px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
  html += '<div style="font-weight:600;font-size:13px">② 治具清单 <span class="muted" style="font-weight:400">（同一机型批量创建，每次最多 50 条）</span></div>';
  html += '<fluent-button appearance="lightweight" size="small" onclick="fnAddRow()">＋ 添加一行</fluent-button>';
  html += '</div>';
  html += '<div id="fn-rows"></div>';
  html += '<div style="margin-top:14px">';
  html += '<fluent-button id="fn-submit" appearance="accent" onclick="submitFixtureBatch(event)">提交申请</fluent-button>';
  html += '</div></div></div>';
  document.getElementById('view').innerHTML = html;
  await fnLoadModels();
  fnRenderRows();
}

// 加载机型下拉（含治具计数）；仅 RD/ADMIN 显示「新建机型」「管理机型」
async function fnLoadModels() {
  try {
    var list = await api('GET', '/api/fixtures/models');
    _fnModels = list || [];
    var sel = document.getElementById('fn-model');
    if (!sel) return;
    sel.innerHTML = '<option value="">请选择机型…</option>' + _fnModels.map(function(m) {
      return '<option value="' + e(m.code) + '">' + e(m.code) + ' · ' + e(m.full_name) + (m.fixture_count ? ' (' + m.fixture_count + '治具)' : '') + '</option>';
    }).join('');
    if (_fnModel) { sel.value = _fnModel; fnPickModel(_fnModel); }
    var canManage = typeof me !== 'undefined' && me && ['ADMIN', 'RD'].indexOf(me.role) !== -1;
    var zone = document.getElementById('fn-model-actions');
    if (zone) {
      zone.innerHTML = canManage
        ? '<fluent-button appearance="lightweight" size="small" onclick="fnToggleModelNew(true)">＋ 新建机型</fluent-button><fluent-button appearance="lightweight" size="small" onclick="openFixtureModelsModal()">管理机型</fluent-button>'
        : '<span class="muted" style="font-size:12px">机型由研发/管理员维护，如需新机型请联系研发</span>';
    }
  } catch (e) { showToast(e.message); }
}

// 选择机型：记录 code+全称，显示「已选机型：code · 全称」
function fnPickModel(val) {
  _fnModel = val;
  var m = _fnModels.filter(function(x) { return x.code === val; })[0];
  _fnModelFull = m ? m.full_name : '';
  var picked = document.getElementById('fn-model-picked');
  if (picked) { picked.style.display = val ? 'block' : 'none'; picked.textContent = val ? '已选机型：' + val + ' · ' + _fnModelFull : ''; }
}

// 新建机型区展开/收起：true=展开输入区；false=收起并清空输入
function fnToggleModelNew(open) {
  var z = document.getElementById('fn-model-new-zone');
  if (!z) return;
  z.style.display = open ? 'flex' : 'none';
  if (!open) {
    var code = document.getElementById('fn-model-code');
    var name = document.getElementById('fn-model-name');
    if (code) code.value = '';
    if (name) name.value = '';
  }
}

// 内联新建机型：校验 → POST → 自动选中并同步机型显示
async function fnCreateModel() {
  var code = document.getElementById('fn-model-code').value.trim().toUpperCase();
  var full_name = document.getElementById('fn-model-name').value.trim();
  if (!code || !full_name) { showToast('请填写机型短码和全称'); return; }
  try {
    await api('POST', '/api/fixtures/models', { code: code, full_name: full_name });
    _fnModel = code;
    fnToggleModelNew(false);
    await fnLoadModels(); // 内部已同步 fnPickModel：新建后自动选中并显示
    showToast('机型已新建并选中');
  } catch (e) { showToast(e.message); }
}

// 行式表格渲染（名称行首、保养周期列、删除按钮；仅剩 1 行时禁用删除）
function fnRenderRows() {
  var box = document.getElementById('fn-rows');
  if (!box) return;
  // 表头行（列宽与输入框对齐：名称 flex:2，其余 flex:1，周期/删除定宽）
  var head = '<div class="fn-row fn-head">' +
    '<span class="fn-cell fn-name">治具名称 <em style="color:var(--bad);font-style:normal">*</em></span>' +
    '<span class="fn-cell">规格</span>' +
    '<span class="fn-cell">工站</span>' +
    '<span class="fn-cell">分类</span>' +
    '<span class="fn-cell fn-cycle">保养(天)</span>' +
    '<span class="fn-head-del">删除</span>' +
    '</div>';
  box.innerHTML = head + _fnRows.map(function(r, i) {
    return '<div class="fn-row" data-i="' + i + '">' +
      '<input class="fn-cell fn-name" value="' + e(r.name) + '" placeholder="治具名称*" oninput="fnRowCell(' + i + ',\'name\',this.value)" onblur="fnRowCell(' + i + ',\'mark\')"/>' +
      '<input class="fn-cell" value="' + e(r.spec) + '" placeholder="规格" oninput="fnRowCell(' + i + ',\'spec\',this.value)"/>' +
      '<input class="fn-cell" value="' + e(r.station) + '" placeholder="工站" oninput="fnRowCell(' + i + ',\'station\',this.value)"/>' +
      '<input class="fn-cell" value="' + e(r.category) + '" placeholder="分类" oninput="fnRowCell(' + i + ',\'category\',this.value)"/>' +
      '<input class="fn-cell fn-cycle" type="number" min="0" value="' + (r.cycle != null ? r.cycle : '') + '" placeholder="保养(天)" oninput="fnRowCell(' + i + ',\'cycle\',this.value)"/>' +
      '<button type="button" class="fn-del" onclick="fnDelRow(' + i + ')" ' + (_fnRows.length <= 1 ? 'disabled' : '') + '>删除</button>' +
      '</div>';
  }).join('');
}

// 行单元格回调：key='mark' 仅刷新名称红框；其余写入行数据，名称变化时同步标记
function fnRowCell(i, key, val) {
  if (key === 'mark') {
    var el = document.querySelector('.fn-row[data-i="' + i + '"] .fn-name');
    if (el) el.style.borderColor = (_fnRows[i] && _fnRows[i].name && _fnRows[i].name.trim()) ? '' : 'var(--bad)';
    return;
  }
  if (_fnRows[i]) _fnRows[i][key] = val;
  if (key === 'name') fnRowCell(i, 'mark');
}

// 添加一行（上限 50）
function fnAddRow() {
  if (_fnRows.length >= 50) { showToast('单次最多 50 条'); return; }
  _fnRows.push({ name: '', spec: '', station: '', category: '', cycle: 90 });
  fnRenderRows();
}

// 删除一行（至少保留一行）
function fnDelRow(i) {
  if (_fnRows.length <= 1) { showToast('至少保留一行'); return; }
  _fnRows.splice(i, 1);
  fnRenderRows();
}

// 批量提交：行校验（空名称标红拦截）→ POST /api/fixtures/batch → 防抖
async function submitFixtureBatch(e) {
  e.preventDefault();
  if (_fnSubmitting) return;
  var model = _fnModel;
  if (!model) { showToast('请先选择机型'); return; }
  var valid = true;
  _fnRows.forEach(function(r, i) {
    if (!r.name || !r.name.trim()) { valid = false; fnRowCell(i, 'mark'); }
  });
  if (!valid) { showToast('存在名称为空的治具行，请补全后再提交'); return; }
  var items = _fnRows.map(function(r) {
    var it = { name: r.name.trim(), spec: r.spec, station: r.station, category: r.category };
    if (r.cycle != null && r.cycle !== '') it.maintenance_cycle_days = parseInt(r.cycle, 10);
    return it;
  });
  _fnSubmitting = true;
  var btn = document.getElementById('fn-submit');
  if (btn) btn.setAttribute('disabled', '');
  try {
    var res = await api('POST', '/api/fixtures/batch', { model: model, items: items });
    showToast('成功创建 ' + res.created + ' 条治具');
    location.hash = '#/list';
  } catch (err) {
    showToast(err.message);
    _fnSubmitting = false;
    if (btn) btn.removeAttribute('disabled');
  }
}
