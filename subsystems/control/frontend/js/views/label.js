// subsystems/control/frontend/js/views/label.js — 管制标签预览/打印/下载
// 数据：GET /api/control/orders/:id/label 返回可打印 HTML（预览不自动打印）；
//  /label/print 自动打印、/label/download 附件下载（仅 ADMIN/QA/RD）。
// 尺寸：PRESET_MM（constants/label.js）选择器 + controlCalcLabelRatio 做 contain 等比缩放预览框。
// 下载按钮仅对 ADMIN/QA/RD 渲染（与后端 assertDownloadRole 口径一致）。

function renderLabel(id) {
  var view = $('#view');
  var oid = Number(id) || Number(currentControlId);
  if (!oid) {
    view.innerHTML = '<div class="card"><h3 style="margin:0 0 10px">可打印管制标签</h3><div id="label-list"></div><div class="muted" style="margin-top:10px;font-size:12px">选择一张单据查看或打印管制标签</div></div>';
    fetchLabelList();
    return;
  }
  var canDownload = ['ADMIN', 'QA', 'RD'].indexOf(me.role) > -1;
  var sizeOpts = ['<option value="">自动</option>'].concat(Object.keys(PRESET_MM).map(function (k) {
    return '<option value="' + PRESET_MM[k].key + '">' + PRESET_MM[k].label + '</option>';
  })).join('');
  view.innerHTML = '<div class="card"><div class="label-toolbar">'
    + '<label class="muted">标签纸 <select id="label-size" class="input" onchange="renderLabelPreview()">' + sizeOpts + '</select></label>'
    + '<span id="label-info" class="muted"></span>'
    + '<div class="label-tools">'
    + '<button class="btn primary" onclick="window.open(\'/api/control/orders/' + oid + '/label/print\')">打印</button>'
    + '<button class="btn" onclick="window.open(\'/api/control/orders/' + oid + '/label\')">新窗口预览</button>'
    + (canDownload ? '<button class="btn" onclick="window.open(\'/api/control/orders/' + oid + '/label/download\')">下载 HTML</button>' : '')
    + '</div></div>'
    + '<div class="label-stage">'
    + '<div class="label-swatch"><div id="label-box"></div><div id="label-box-label" class="muted"></div></div>'
    + '<iframe class="label-frame" id="label-frame" src="/api/control/orders/' + oid + '/label"></iframe>'
    + '</div></div>';
  renderLabelPreview();
}

/** 预览框随选中纸张尺寸 contain 缩放（1mm ≈ 3.78px，见 constants/label.js） */
function renderLabelPreview() {
  var key = $('#label-size').value;
  var info = $('#label-info'), box = $('#label-box'), tag = $('#label-box-label');
  if (!box) return;
  var preset = PRESET_MM[key];
  if (preset) {
    var r = controlCalcLabelRatio(preset.w, preset.h);
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    if (info) info.textContent = preset.label;
    if (tag) tag.textContent = preset.w + '×' + preset.h + 'mm';
  } else {
    box.style.width = CONTOL_LABEL_BOX.w + 'px';
    box.style.height = CONTOL_LABEL_BOX.h + 'px';
    if (info) info.textContent = '自动（后端默认排版）';
    if (tag) tag.textContent = '预览';
  }
}

/** 加载可打印标签清单（有 label_no 且未作废的管制单） */
function fetchLabelList() {
  var view = document.getElementById('label-list');
  if (!view) return;
  api('GET', '/api/control/orders?label_ready=1&limit=100').then(function (r) {
    var list = r.orders || [];
    if (!list.length) {
      view.innerHTML = '<div class="empty"><p>暂无可打印的管制标签</p><p class="muted">仅有已贴标（label_no 已生成）的管制单可打印标签</p></div>';
      return;
    }
    var h = '<table class="data-table"><thead><tr><th>管制单号</th><th>标签号</th><th>品名</th><th>状态</th><th>操作</th></tr></thead><tbody>';
    list.forEach(function (o) {
      var lb = o.label_no || o.order_no;
      var st = o.status || '';
      var stLabel = CONTROL_STATUS_CN ? (CONTROL_STATUS_CN[st] || st) : st;
      h += '<tr><td class="mono">' + e(o.order_no || '') + '</td><td class="mono">' + e(lb) + '</td><td>' + e(o.part_name || '') + '</td><td>' + e(stLabel) + '</td>'
        + '<td><button class="btn primary small" onclick="location.hash=\'#/label?id=' + o.id + '\'">打印</button> '
        + '<button class="btn small" onclick="window.open(\'/api/control/orders/' + o.id + '/label\')">预览</button></td></tr>';
    });
    h += '</tbody></table>';
    view.innerHTML = h;
  }).catch(function (e) {
    view.innerHTML = '<div class="empty"><p>加载失败：' + e.message + '</p></div>';
  });
}
