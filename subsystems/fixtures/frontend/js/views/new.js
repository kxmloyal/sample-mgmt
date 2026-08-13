// fixture-new.js — 治具新建申请（两步：① 选择/新建机型 → ② 填写治具清单）
var _fnSelectedModel = ''; // 当前选中的机型 code
var _fnModelList = [];     // 机型下拉数据（含治具计数）

async function renderFixtureNew() {
  _fnSelectedModel = ''; _fnModelList = [];
  var html = '<div class="card" style="max-width:720px">';
  html += '<h3 style="margin:0 0 16px">新建治具申请</h3>';

  // 第一步：选择机型（全角色可选已有机型；仅 RD/ADMIN 可新建机型）
  html += '<div style="background:var(--bg-card,#fff);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:16px">';
  html += '<div style="font-weight:600;font-size:13px;margin-bottom:10px">① 选择机型 <span style="color:var(--bad)">*</span></div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += '<select id="fn-model" onchange="fnPickModel(this.value)" style="flex:1;min-width:180px"><option value="">请选择机型…</option></select>';
  html += '<span id="fn-model-new-zone" style="display:none;gap:8px;align-items:center;flex-wrap:wrap;width:100%">';
  html += '<fluent-text-field id="fn-model-code" placeholder="机型短码(6~20位字母数字)"></fluent-text-field>';
  html += '<fluent-text-field id="fn-model-name" placeholder="机型全称(必填)" style="flex:1"></fluent-text-field>';
  html += '<fluent-button appearance="accent" size="small" onclick="fnCreateModel()">保存机型</fluent-button>';
  html += '<fluent-button appearance="neutral" size="small" onclick="fnCancelNewModel()">取消</fluent-button>';
  html += '</span></div>';
  html += '<div style="margin-top:8px" id="fn-model-actions"></div>';
  html += '</div>';

  // 第二步：治具清单
  html += '<form id="fixture-new-form" onsubmit="submitFixtureNew(event)">';
  html += '<div style="font-weight:600;font-size:13px;margin-bottom:10px">② 治具清单</div>';
  html += '<div class="new-grid">';
  html += '<div class="new-col"><div class="new-col-title">基础信息</div>';
  html += '<label>治具名称<span style="color:var(--bad)">*</span></label><fluent-text-field id="fn-name" required></fluent-text-field>';
  html += '<label>规格</label><fluent-text-field id="fn-spec"></fluent-text-field>';
  html += '<label>机型</label><fluent-text-field id="fn-model-display" readonly></fluent-text-field>';
  html += '</div>';
  html += '<div class="new-col"><div class="new-col-title">使用信息</div>';
  html += '<label>对应工站</label><fluent-text-field id="fn-station"></fluent-text-field>';
  html += '<label>分类</label><fluent-text-field id="fn-category" placeholder="如测试治具/装配治具"></fluent-text-field>';
  html += '<label>申请说明</label><textarea id="fn-note" rows="3"></textarea>';
  html += '<label>保养周期(天) <small>(选填，默认90)</small></label><fluent-text-field id="fn-maint-cycle" type="number" min="0" value="90" placeholder="0=无需定期保养"></fluent-text-field>';
  html += '</div></div>';
  html += '<fluent-button appearance="accent" onclick="submitFixtureNew(event)" style="margin-top:16px">提交申请</fluent-button>';
  html += '</form></div>';
  document.getElementById('view').innerHTML = html;
  await fnLoadModels();
}

// 加载机型下拉（含治具计数）；仅 RD/ADMIN 显示「新建机型」按钮
async function fnLoadModels() {
  try {
    var list = await api('GET', '/api/fixtures/models');
    _fnModelList = list || [];
    var sel = document.getElementById('fn-model');
    if (!sel) return;
    var opts = '<option value="">请选择机型…</option>' + _fnModelList.map(function(m) {
      return '<option value="' + e(m.code) + '">' + e(m.code) + ' · ' + e(m.full_name) + (m.fixture_count ? ' (' + m.fixture_count + '治具)' : '') + '</option>';
    }).join('');
    sel.innerHTML = opts;
    if (_fnSelectedModel) sel.value = _fnSelectedModel;
    var canManage = typeof me !== 'undefined' && me && ['ADMIN', 'RD'].indexOf(me.role) !== -1;
    var zone = document.getElementById('fn-model-actions');
    if (zone) {
      zone.innerHTML = canManage
        ? '<fluent-button appearance="lightweight" size="small" onclick="fnShowNewModel()">＋ 新建机型</fluent-button><fluent-button appearance="lightweight" size="small" onclick="openFixtureModelsModal()">管理机型</fluent-button>'
        : '<span class="muted" style="font-size:12px">机型由研发/管理员维护，如需新机型请联系研发</span>';
    }
  } catch (e) { showToast(e.message); }
}

function fnShowNewModel() {
  var zone = document.getElementById('fn-model-new-zone');
  if (zone) zone.style.display = 'flex';
}

function fnCancelNewModel() {
  var zone = document.getElementById('fn-model-new-zone');
  if (zone) zone.style.display = 'none';
  document.getElementById('fn-model-code').value = '';
  document.getElementById('fn-model-name').value = '';
}

// 内联新建机型：校验 → POST → 自动选中新机型
async function fnCreateModel() {
  var code = document.getElementById('fn-model-code').value.trim().toUpperCase();
  var full_name = document.getElementById('fn-model-name').value.trim();
  if (!code || !full_name) { showToast('请填写机型短码和全称'); return; }
  try {
    await api('POST', '/api/fixtures/models', { code: code, full_name: full_name });
    _fnSelectedModel = code;
    fnCancelNewModel();
    await fnLoadModels();
    showToast('机型已新建并选中');
  } catch (e) { showToast(e.message); }
}

function fnPickModel(val) {
  _fnSelectedModel = val;
  var dis = document.getElementById('fn-model-display');
  if (dis) dis.value = val;
}

async function submitFixtureNew(e) {
  e.preventDefault();
  var model = _fnSelectedModel || document.getElementById('fn-model').value;
  if (!model) { showToast('请先选择机型'); return; }
  try {
    var body = {
      name: document.getElementById('fn-name').value, spec: document.getElementById('fn-spec').value, model: model,
      station: document.getElementById('fn-station').value, category: document.getElementById('fn-category').value, request_note: document.getElementById('fn-note').value
    };
    var cycleEl = document.getElementById('fn-maint-cycle'); if (cycleEl && cycleEl.value) body.maintenance_cycle_days = parseInt(cycleEl.value) || 90;
    var f = await api('POST', '/api/fixtures', body);
    showToast('申请成功：' + f.fixture_no);
    location.hash = '#/list';
  } catch (err) { showToast(err.message); }
}
