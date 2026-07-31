// fixture-new.js — 治具新建申请
async function renderFixtureNew() {
  var html = '<div class="card" style="max-width:720px">';
  html += '<h3 style="margin:0 0 16px">新建治具申请</h3>';
  html += '<form id="fixture-new-form" onsubmit="submitFixtureNew(event)">';
  html += '<div class="new-grid">';
  html += '<div class="new-col"><div class="new-col-title">基础信息</div>';
  html += '<label>治具名称<span style="color:var(--bad)">*</span></label><input id="fn-name" required />';
  html += '<label>规格</label><input id="fn-spec" />';
  html += '<label>型号</label><input id="fn-model" />';
  html += '</div>';
  html += '<div class="new-col"><div class="new-col-title">使用信息</div>';
  html += '<label>对应工站</label><input id="fn-station" />';
  html += '<label>分类</label><input id="fn-category" placeholder="如测试治具/装配治具" />';
  html += '<label>申请说明</label><textarea id="fn-note" rows="3"></textarea>';
  html += '<label>保养周期(天) <small>(选填，默认90)</small></label><input id="fn-maint-cycle" type="number" min="0" value="90" placeholder="0=无需定期保养" />';
  html += '</div></div>';
  html += '<button class="btn" type="submit" style="margin-top:16px">提交申请</button>';
  html += '</form></div>';
  document.getElementById('view').innerHTML = html;
}

async function submitFixtureNew(e) {
  e.preventDefault();
  try {
    var body = {
      name: document.getElementById('fn-name').value, spec: document.getElementById('fn-spec').value, model: document.getElementById('fn-model').value,
      station: document.getElementById('fn-station').value, category: document.getElementById('fn-category').value, request_note: document.getElementById('fn-note').value
    };
    var cycleEl = document.getElementById('fn-maint-cycle'); if (cycleEl && cycleEl.value) body.maintenance_cycle_days = parseInt(cycleEl.value) || 90;
    var f = await api('POST', '/api/fixtures', body);
    showToast('申请成功：' + f.fixture_no);
    location.hash = '#/list';
  } catch (err) { showToast(err.message); }
}
