// views/ui-helpers.js — 项目子系统视图层三件套（方案B-④）
// 目标：收敛 8 个视图里重复的 确认框/表单弹窗 foot 按钮/只读KV行 三个模式
// 纯前端重构：不改任何路由/数据结构；各视图逐个切换调用后删除各自重复实现

// ① 模态确认框（替代 11 处原生 confirm()；onOk 为函数名字符串，与 task-detail.js pConfirm 同形态）
// 用法：pkConfirm('确认删除？', 'delMilestone(5)')
function pkConfirm(message, onOkFnName) {
  if (typeof pConfirm === 'function') { pConfirm(message, onOkFnName); return; }
  // 兜底：无共享确认组件时退回原生
  if (confirm(message)) { try { (window[onOkFnName] || function () {})(); } catch (e) { console.error(e); } }
}

// ② 标准表单弹窗骨架（收敛「openModal + accent 保存按钮 + neutral 取消按钮」foot 三件套）
// fields: [{tag:'fluent-text-field'|'fluent-text-area'|'fluent-select'|'input'|'select'|'date', id, label, value, type, options:[{v,t}], placeholder, required}]
// onSave: 函数名字符串（保存按钮 onclick）；wide: 是否加宽
function pkFormModal(title, fields, onSaveFnName, opts) {
  opts = opts || {};
  const html = fields.map(function (f) {
    const v = f.value == null ? '' : String(f.value);
    let inner = '';
    if (f.options) {
      const opts2 = f.options.map(function (o) {
        const ov = o.v == null ? '' : String(o.v);
        return '<fluent-option value="' + ov + '"' + (ov === v ? ' selected' : '') + '>' + esc(o.t == null ? ov : o.t) + '</fluent-option>';
      }).join('');
      inner = '<fluent-select id="' + f.id + '"' + (f.onChange ? ' onchange="' + f.onChange + '"' : '') + '>' + opts2 + '</fluent-select>';
    } else if (f.tag === 'fluent-text-area') {
      inner = '<fluent-text-area id="' + f.id + '"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' + esc(v) + '</fluent-text-area>';
    } else {
      inner = '<fluent-text-field id="' + f.id + '" type="' + (f.type || 'text') + '" value="' + esc(v) + '"' +
        (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '></fluent-text-field>';
    }
    return '<label' + (f.gap ? ' style="margin-top:8px"' : '') + '>' + f.label + (f.required ? ' *' : '') + '</label>' + inner;
  }).join('');
  openModal(title,
    '<div class="pk-form">' + html + '</div>',
    { wide: !!opts.wide,
      foot: '<fluent-button appearance="accent" size="small" onclick="' + onSaveFnName + '">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}

// ③ 取字段值（pkFormModal 配套；集合内 id 从 DOM 依次读）
function pkVal(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return (el.value == null ? '' : el.value).trim();
}
