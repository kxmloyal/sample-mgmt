// detail-card.js — 样品详情弹窗·标示卡 Tab（编辑表单/保存CAS/409刷新/dirty 拦截）
// 由 detail.js 拆出（D1 红线拆分，方案A）；bundle 拼接顺序：detail-modal.js → detail.js → detail-card.js
// 2026-09-11 DM-3：Foot「关闭」按钮改由共享组件 `_sdm.close()` 统一处理（拦截文案见 detail.js 的 dirtyMsg.close）
var _detailDirty = false; // 标示卡未保存修改标记（共享组件经 detail.js 的 isDirty 回调读取）

// D1.5 关闭拦截：foot 按钮与切 Tab 均走共享组件（文案：标示卡有未保存的修改，确定离开？/ 切换将丢失，继续？）；
// 遮罩点击拦截见文件底部 document capture 监听

// 标示卡 Tab 下拉回显（selected 属性在 FAST upgrade 时序下失效，须显式设 value）
function applyDetailCardValues(s){
  var el;
  el=document.getElementById('cd-type');if(el)el.value=s.sample_type||'';
  el=document.getElementById('cd-limit-item');if(el)el.value=s.limit_item||'';
  el=document.getElementById('cd-source');if(el)el.value=s.source_type||'';
}

// ═══ 标示卡 Tab（8字段编辑表单） ═══
function _buildCardTab(s, id) {
  var locked = ['RELEASED', 'IN_CUSTODY', 'RETURNING', 'RETIRED'].indexOf(s.status) !== -1;
  var dis = locked ? ' disabled' : '';
  var to = '<fluent-option value="">不适用</fluent-option><fluent-option value="OK"' + (s.sample_type === 'OK' ? ' selected' : '') + '>OK样品</fluent-option><fluent-option value="NG"' + (s.sample_type === 'NG' ? ' selected' : '') + '>NG样品</fluent-option>';
  var lo = '<fluent-option value="">不适用</fluent-option>' + (typeof LIMIT_ITEMS !== 'undefined' ? LIMIT_ITEMS : []).map(function(x) { return '<fluent-option value="' + x.code + '"' + (s.limit_item === x.code ? ' selected' : '') + '>' + x.label + '</fluent-option>'; }).join('');
  var so = '<fluent-option value="">不适用</fluent-option><fluent-option value="C"' + (s.source_type === 'C' ? ' selected' : '') + '>客供(C)</fluent-option><fluent-option value="T"' + (s.source_type === 'T' ? ' selected' : '') + '>元山(T)</fluent-option><fluent-option value="G"' + (s.source_type === 'G' ? ' selected' : '') + '>塔岗(G)</fluent-option>';
  // 【口径】有效期/复检日按 UTC 日期显示（toISOString 即 UTC，前后端三处一致）
  var exp = s.next_inspect_at ? new Date(s.next_inspect_at).toISOString().slice(0, 10) : '—';

  // D1.5 可编辑控件变更 → 置 dirty（容器级冒泡监听，FAST composed 事件可达）
  var h = '<div class="card" style="max-width:720px;margin:0 auto;overflow:hidden;padding:14px" oninput="_detailDirty=true" onchange="_detailDirty=true">';
  if (locked) h += '<div class="card-lock-banner">标示卡已锁定（样品已发行），仅可查看和打印' +
    '<a class="link" style="margin-left:10px" onclick="closeModal(this.closest(\'.modal-mask\'));location.hash=\'#/scan?no=' + encodeURIComponent(s.sample_no) + '\'">需要修正？前往扫码台 →</a></div>'; // D1.4 锁定引导
  h += '<div class="card-grid">' +
    '<div><label>样品类型</label><fluent-select id="cd-type"' + dis + '>' + to + '</fluent-select></div>' +
    '<div><label>限度项目</label><fluent-select id="cd-limit-item"' + dis + '>' + lo + '</fluent-select></div>' +
    '<div><label>来源</label><fluent-select id="cd-source"' + dis + '>' + so + '</fluent-select></div>' +
    '<div><label>有效期</label><span style="font-size:13px;color:#333">' + exp + '</span><span class="muted" style="font-size:11px"> (=复检日，自动同步)</span></div>' +
    '<div><label>版次</label><fluent-text-field id="cd-card-version" value="' + e(s.card_version || '') + '" placeholder="如 01"' + dis + '></fluent-text-field></div>' +
    '<div><label>制作</label><fluent-text-field id="cd-signed-rnd" value="' + e(s.signed_by_rd || '') + '"' + dis + '></fluent-text-field></div>' +
    '<div><label>确认</label><fluent-text-field id="cd-signed-qa" value="' + e(s.signed_by_qa || '') + '"' + dis + '></fluent-text-field></div>' +
    '<div class="full-row"><label>样品数值</label><textarea id="cd-test-data" rows="1" style="resize:none;min-height:32px"' + dis + '>' + e(s.test_data || '') + '</textarea></div>' +
    '<div class="full-row"><label>标准范围</label><textarea id="cd-test-standard" rows="2" style="resize:none;min-height:40px"' + dis + '>' + e(s.test_standard || '') + '</textarea></div>' +
    '</div>' +
    '<div style="margin-top:12px;display:flex;gap:8px">' +
    (locked ? '' : '<fluent-button appearance="accent" id="cd-save-btn" onclick="saveCard(' + id + ')">保存标示卡</fluent-button>') +
    '<fluent-button appearance="neutral" onclick="closeModal(this.closest(\'.modal-mask\'));printCard(' + id + ')">打印标示卡</fluent-button>' +
    '</div>' +
    '<div id="cd-msg" class="muted" style="margin-top:8px"></div></div>';
  return h;
}

async function saveCard(id) {
  await withSubmitLock(document.getElementById('cd-save-btn'), async function() {
    var msg = document.getElementById('cd-msg');
    if (msg) msg.textContent = '保存中...';
    try {
      var p = { sample_type: $('#cd-type').value, limit_item: $('#cd-limit-item').value, source_type: $('#cd-source').value, card_version: $('#cd-card-version').value, test_data: $('#cd-test-data').value, test_standard: $('#cd-test-standard').value, signed_by_rd: $('#cd-signed-rnd').value, signed_by_qa: $('#cd-signed-qa').value,
        // T6: 携带 CAS 版本号；undefined 时 JSON 序列化自动省略
        version: (_detailSample && typeof _detailSample.version === 'number') ? _detailSample.version : undefined };
      await api('PUT', '/api/samples/' + id, p);
      // 保存成功后刷新缓存的样品对象（同时更新 version）
      try { _detailSample = await api('GET', '/api/samples/' + id); } catch (_) {}
      _detailDirty = false; // D1.5 保存成功清除标记
      toast('标示卡已保存', 'ok');
      if (msg && msg.isConnected) msg.textContent = '保存成功';
    } catch (e) {
      // 409：api 层已统一处理（toast + reloadDetail），不重复提示
      if (e && e.status === 409) return;
      if (msg && msg.isConnected) msg.textContent = e.message;
    }
  });
}

// T6: 原地刷新详情弹窗（409 回调用，不重开弹窗避免遮罩堆叠）
// 2026-09-11 DM-3：改为委托共享组件重渲当前 Tab（旧实现用文档级 body 查询直写 DOM，叠层时会命中
// 底层弹窗的 body；当前 Tab 状态现由共享组件托管，本模块不再自行跟踪）
async function reloadDetail(id) {
  _detailDirty = false; // 内容将被重渲，旧编辑已失效
  if (_sdm && _sdm.isOpen()) await _sdm.reload();
}
// T6: 409 冲突时自动刷新详情（仅当样品详情弹窗确实打开时）
onConflictRefresh(function() {
  if (_detailSample && _sdm && _sdm.isOpen()) reloadDetail(_detailSample.id);
});

// D1.5 遮罩点击拦截：document capture 抢先于 modal.js 关闭监听（mask 自身 capture 因注册顺序无法抢先）；命中遮罩且 dirty 时 stopPropagation + confirm
document.addEventListener('click', function(ev) {
  var t = ev.target;
  if (!_detailDirty || !t || !t.classList || !t.classList.contains('modal-mask')) return;
  ev.stopPropagation();
  if (confirm('标示卡有未保存的修改，确定离开？')) { _detailDirty = false; closeModal(t); }
}, true);
