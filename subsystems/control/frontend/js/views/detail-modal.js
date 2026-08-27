// subsystems/control/frontend/js/views/detail-modal.js — 管制单详情·操作模态与统一提交
// 职责：模态配置（_ctlUtil._modalCfg）、统一打开（_ctlOpen）、统一提交（_ctlSubmit，trans/sign/ncr/rework/void）。
// 流转 action 需要的额外字段定义与必填校验已抽离至 ncr-form.js（_CTL_TRANS_FIELDS + ncrRequiredCheck）。
// 拆分来源：原 detail.js（_ctlUtil + ctlOpen + ctlSubmit）。

// 模态/校验/渲染小工具集合（方法化以控制顶层函数数量 ≤10）
var _ctlUtil = {
  /** 指定流转 action 需要的额外字段数组 */
  transFields: function (action) { return _CTL_TRANS_FIELDS[action] || []; },
  /** 读取输入框值（不存在返回空串） */
  val: function (sel) { var el = $(sel); return el ? el.value : ''; },
  /** 表单字段输入 HTML（id = cf-<key>；type='textarea' 渲染多行） */
  fieldHtml: function (k, label, type) {
    if (type === 'textarea') return '<div><label>' + label + '</label><textarea id="cf-' + k + '" rows="2"></textarea></div>';
    return '<div><label>' + label + '</label><input id="cf-' + k + '" type="' + (type || 'text') + '"></div>';
  },
  /** 模态底部按钮：提交（品牌主色）+ 取消（中性描边灰色），统一 .btn 体系保证等高等对齐 */
  foot: function (kind) {
    return '<button class="btn" onclick="ctlSubmit(\'' + kind + '\')">提交</button>'
      + '<button class="btn cancel" onclick="closeModal(document.querySelector(\'.modal-mask\'))">取消</button>';
  },
  /** 会签记录状态标签 */
  signState: function (rec) {
    var map = { AGREE: ['会签通过', 'ok'], REJECT: ['退回', 'err'], SKIP: ['强制跳过', 'warn'] };
    var m = map[rec.decision] || ['待签', 'muted'];
    return '<span class="sign-state ' + m[1] + '">' + m[0] + (rec.signer_name ? ' · ' + rec.signer_name : '') + '</span>';
  },
  /** 当前角色是否可对某会签节点发起签字（预约节点 + 状态匹配 + 轮到本角色/管理员） */
  canSign: function (node) {
    var order = _ctlDetailAgg.order || {};
    if (!order || order.status !== node.trigger_status) return false;
    var signs = (_ctlDetailAgg.signs || []).filter(function (s) { return s.node_key === node.node_key; });
    for (var i = 0; i < node.steps.length; i++) {
      var st = node.steps[i];
      var rec = signs.find(function (s) { return s.seq === st.seq; });
      if (!rec || !rec.decision) return st.role === me.role || me.role === 'ADMIN';
      if (rec.decision !== 'AGREE') return false;
    }
    return false;
  },
  /** 打开操作模态的配置：head（标题）/body（表单）/foot（按钮），字段 id 与 ctlSubmit 一致 */
  modalCfg: function (kind, action) {
    if (kind === 'sign') {
      var node = CONTROL_SIGN_NODES.find(function (n) { return n.node_key === action; });
      var opts = '<option value="">请选择</option><option value="AGREE">同意</option><option value="REJECT">退回</option>'
        + (me.role === 'ADMIN' ? '<option value="SKIP">强制跳过(仅管理员)</option>' : '');
      return {
        head: '会签 · ' + (node ? node.node_name : action),
        body: '<div class="ctl-form-grid">'
          + '<div><label>会签决定</label><select id="cf-decision">' + opts + '</select></div>'
          + '<div class="nf-full"><label class="req">会签意见</label><textarea id="cf-comment" rows="2" placeholder="填写意见或原因"></textarea></div></div>',
        foot: _ctlUtil.foot('sign')
      };
    }
    if (kind === 'trans') {
      var fb = _ctlUtil.transFields(action).map(function (f) { return _ctlUtil.fieldHtml(f.k, f.label, f.type); }).join('');
      return {
        head: '确认操作 · ' + (CONTROL_ACTION_CN[action] || action),
        body: '<div class="ctl-form-grid">' + fb
          + '<div class="nf-full"><label>备注</label><textarea id="cf-comment" rows="2" placeholder="可选"></textarea></div></div>',
        foot: _ctlUtil.foot('trans')
      };
    }
    if (kind === 'ncr') {
      var deptOpts = CONTROL_DEPTS.map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
      return {
        head: '追加不良品委托单',
        body: '<div class="ctl-form-grid">'
          + '<div><label class="req">委托单号</label><input id="cf-ncr_no"></div>'
          + '<div><label>检验部门</label><select id="cf-inspect_dept"><option value="">请选择</option>' + deptOpts + '</select></div>'
          + '<div><label>处理部门</label><select id="cf-handle_dept"><option value="">请选择</option>' + deptOpts + '</select></div></div>',
        foot: _ctlUtil.foot('ncr')
      };
    }
    if (kind === 'rework') {
      return {
        head: '报工',
        body: '<div class="ctl-form-grid">'
          + '<div><label>良品数</label><input id="cf-good_qty" type="number" min="0"></div>'
          + '<div><label>不良数</label><input id="cf-ng_qty" type="number" min="0"></div>'
          + '<div><label>报废数</label><input id="cf-scrap_qty" type="number" min="0"></div>'
          + '<div><label>报废原因</label><input id="cf-scrap_reason"></div>'
          + '<div><label>批次号</label><input id="cf-batch_no" placeholder="可选"></div>'
          + '<div><label>包装称重记录</label><input id="cf-pack_record" placeholder="可选"></div>'
          + '<div><label>确认人</label><input id="cf-confirm_by" placeholder="可选"></div>'
          + '<div><label>数量一致</label><select id="cf-qty_consistent"><option value="0">否</option><option value="1">是</option></select></div></div>',
        foot: _ctlUtil.foot('rework')
      };
    }
    if (kind === 'void') {
      return {
        head: '作废管制单',
        body: '<div class="ctl-form-grid"><div class="nf-full"><label class="req">作废原因</label><textarea id="cf-comment" rows="2" placeholder="请说明作废原因"></textarea></div></div>',
        foot: _ctlUtil.foot('void')
      };
    }
    return { head: '操作', body: '', foot: '' };
  },
  /** 字段键值对（label auto + value 1fr，空值占位 —，转义） */
  kv: function (label, val) {
    return '<span class="label">' + label + '</span><span>' + (val == null || val === '' ? '—' : e(String(val))) + '</span>';
  }
};

/** 打开操作模态：trans 无字段时直接确认提交；有字段 / sign / ncr / rework / void 弹窗收集字段后 ctlSubmit */
function ctlOpen(kind, action) {
  _ctlModal = { kind: kind, action: kind === 'trans' ? action : null, node: kind === 'sign' ? action : null };
  if (kind === 'trans' && !_ctlUtil.transFields(action).length) {
    if (confirm('确认执行「' + (CONTROL_ACTION_CN[action] || action) + '」？')) ctlSubmit('trans');
    return;
  }
  var m = _ctlUtil.modalCfg(kind, action);
  var mask = openModal(m.head, m.body, { foot: m.foot });
  if (mask) mask.classList.add('ctl-modal');
}

/** 统一提交入口：按模态上下文读取字段并调用对应 API */
async function ctlSubmit(kind) {
  var m = _ctlModal || {};
  try {
    if (kind === 'trans') {
      var body = { comment: _ctlUtil.val('#cf-comment') || '' };
      _ctlUtil.transFields(m.action).forEach(function (f) { var v = _ctlUtil.val('#cf-' + f.k); if (v) body[f.k] = v; });
      var err = ncrRequiredCheck(m.action, body);
      if (err) { toast(err, 'err'); return; }
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/transition', Object.assign({ action: m.action }, body));
    } else if (kind === 'sign') {
      var decision = $('#cf-decision') ? $('#cf-decision').value : '';
      var c = _ctlUtil.val('#cf-comment');
      if (!decision) { toast('请先选择会签决定', 'err'); return; }
      if (!c.trim()) { toast('请填写会签意见', 'err'); return; }
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/sign', { node_key: m.node, decision: decision, comment: c });
    } else if (kind === 'ncr') {
      if (!_ctlUtil.val('#cf-ncr_no').trim()) { toast('请填写委托单号', 'err'); return; }
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/ncr', { ncr_no: _ctlUtil.val('#cf-ncr_no'), inspect_dept: _ctlUtil.val('#cf-inspect_dept'), handle_dept: _ctlUtil.val('#cf-handle_dept') });
    } else if (kind === 'rework') {
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/rework-log', { good_qty: Number(_ctlUtil.val('#cf-good_qty')) || 0, ng_qty: Number(_ctlUtil.val('#cf-ng_qty')) || 0, scrap_qty: Number(_ctlUtil.val('#cf-scrap_qty')) || 0, scrap_reason: _ctlUtil.val('#cf-scrap_reason'), batch_no: _ctlUtil.val('#cf-batch_no'), pack_record: _ctlUtil.val('#cf-pack_record'), confirm_by: _ctlUtil.val('#cf-confirm_by'), qty_consistent: $('#cf-qty_consistent') ? ($('#cf-qty_consistent').value === '1' ? 1 : 0) : 0 });
    } else if (kind === 'void') {
      if (!_ctlUtil.val('#cf-comment').trim()) { toast('请填写作废原因', 'err'); return; }
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/void', { comment: _ctlUtil.val('#cf-comment') });
    }
    closeModal(document.querySelector('.modal-mask'));
    toast('操作成功', 'ok');
    var res = await api('GET', '/api/control/orders/' + _ctlDetailId);
    _ctlDetail = res;
    renderDetailBody();
  } catch (err) {
    toast('操作失败：' + err.message, 'err');
  }
}
