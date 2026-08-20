// routes/card-html.js — 标签和标示卡 HTML 生成 + 尺寸解析
const { LIMIT_LABELS, SOURCE_TYPES } = require('./card-constants');
const { escapeHtml } = require('./html-utils');

function fmtDateYYMMDD(t) {
  if (!t) return '______';
  const d = new Date(t);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return yy+mm+dd;
}

function parseSize(req) {
  const sizeKey = req.query.size || 'large';
  const sizeMap = { small: 50, medium: 70, large: 100 };
  var w = sizeMap[sizeKey] || 100;
  var cw = null;
  var ch = null;
  if (sizeKey === 'custom') {
    // 自定义长宽（真实 mm 语义）：内容基准 280×133px ≈ 74.2×35.2mm（1px≈0.265mm）
    // 宽 30~150mm、高 10~150mm；任一非法/缺失按等比兼容；宽非法回退大号
    cw = Number(req.query.customW);
    if (!(Number.isFinite(cw) && cw >= 30 && cw <= 150)) cw = null;
    ch = Number(req.query.customH);
    if (!(Number.isFinite(ch) && ch >= 10 && ch <= 150)) ch = null;
    if (cw !== null) {
      var scale = cw / 74.2; // 宽度填满标签纸
      if (ch !== null) scale = Math.min(scale, ch / 35.2); // contain 适配：内容完整放入纸张（不溢出/不裁剪）
      return { sizeKey, scale, cw, ch };
    }
    w = 100; // 宽度非法回退大号
  }
  return { sizeKey, scale: w / 100, cw, ch };
}

// 文本行数估算：CJK≈1em/字符、ASCII≈0.55em，用于按纸高自适应字号/二维码
function estTextLines(text, px, colW) {
  if (!text) return 1;
  var w = 0;
  for (var i = 0; i < text.length; i++) w += text.charCodeAt(i) > 255 ? px : px * 0.55;
  return Math.max(1, Math.ceil(w / Math.max(colW, 1)));
}

// 字号与二维码随标签尺寸自动缩放：字号下限=印刷可读下限 ~4pt（编号 6px / 其余 5px），
// 二维码尺寸按纸高剩余空间自适应（文本换行/下限挤占时 QR 收缩兜底），实现内容铺满纸张
function buildLabelHtml(s, qrDataUrl, blankCard, scale, sizeKey, cw, ch) {
  if (!scale || scale <= 0) scale = 1;
  var sk = sizeKey || 'large';

  var labW = Math.round(280 * scale);
  var qrSideW = Math.round(100 * scale);
  var pad = Math.round(10 * scale);
  var gap = Math.round(7 * scale);
  var radius = Math.round(10 * scale);
  var borderW = scale >= 0.7 ? 2 : 1;
  var nameSize = Math.max(Math.round(9 * scale), 5);
  var metaSize = Math.max(Math.round(8 * scale), 5);
  var specSize = Math.max(Math.round(7 * scale), 5);
  var cardTitle = Math.max(Math.round(7 * scale), 5);
  var cardText = Math.max(Math.round(7 * scale), 5);
  var footerSize = Math.max(Math.round(6 * scale), 5);
  var cardPad = Math.round(4 * scale);

  var meta = [s.model || '', s.station || ''].filter(Boolean).join(' \u00b7 ') || '\u2014';
  meta = escapeHtml(meta);
  // 标签纸物理尺寸（px）：预设按内容基准 280×133px×scale 折 mm 再转 px（1mm≈3.7795px @96dpi）
  var paperWpx = Math.round((cw || Math.round(280 * scale * 0.265)) * 3.7795);
  var paperHpx = Math.round((ch || Math.round(133 * scale * 0.265)) * 3.7795);
  var innerH = paperHpx - 4 * borderW - 2 * pad;
  // 编号优先单行：字号自动收缩至可放入 QR 列宽（下限 6px），放不下时仍允许换行
  var noLen = (s.sample_no || '').length;
  var noSize = noLen ? Math.max(Math.min(Math.round(11 * scale), Math.floor(qrSideW / (noLen * 0.55 + 0.001))), 6) : Math.round(11 * scale);
  // 文本块高度估算（行高：编号 1.2 / 名称 1.4 / 机型 1.3 / 规格 1.2，含 3px/1px 外边距）
  // 小尺寸（scale<0.6）名称/机型限 1 行、规格限 2 行；二维码余量不足(<24px)时再收紧为单行
  var tight = scale < 0.6;
  var nameLines = Math.min(estTextLines(s.name, nameSize, qrSideW), tight ? 1 : 2);
  var metaLines = Math.min(estTextLines(meta, metaSize, qrSideW), tight ? 1 : 2);
  var specLines = Math.min(estTextLines(s.spec, specSize, qrSideW), tight ? 2 : 3);
  var noLines = estTextLines(s.sample_no, noSize, qrSideW);
  var textBlockH = noLines * noSize * 1.2 + 3 + nameLines * nameSize * 1.4 + metaLines * metaSize * 1.3 + specLines * specSize * 1.2 + 1;
  var qrImgW = Math.min(Math.round(66 * scale), Math.max(Math.round(innerH - textBlockH), 12));
  if (qrImgW < 24) {
    // 二维码余量不足：名称/机型/规格收紧为单行，优先保障二维码可识别尺寸
    nameLines = Math.min(estTextLines(s.name, nameSize, qrSideW), 1);
    metaLines = Math.min(estTextLines(meta, metaSize, qrSideW), 1);
    specLines = Math.min(estTextLines(s.spec, specSize, qrSideW), 1);
    textBlockH = noLines * noSize * 1.2 + 3 + nameLines * nameSize * 1.4 + metaLines * metaSize * 1.3 + specLines * specSize * 1.2 + 1;
    qrImgW = Math.min(Math.round(66 * scale), Math.max(Math.round(innerH - textBlockH), 12));
  }
  var cardSide = blankCard
    ? '<div style="flex:1;min-width:0;padding:0 '+cardPad+'px;border-left:1.5px dashed #666">'+
         '<div style="font-weight:700;font-size:'+cardTitle+'px;text-align:center;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:4px">\u6807\u793a\u5361\uff08\u53d1\u884c\u540e\u6253\u5370\u8d34\u5165\uff09</div>'+
         '<div style="font-size:'+cardText+'px;color:#ccc;line-height:1.6">'+
           '<div><span style="color:#d5d5d5">\u7c7b\u578b</span> ___ <span style="color:#d5d5d5">\u6765\u6e90</span> ___ <span style="color:#d5d5d5">\u7248\u6b21</span> ___</div>'+
           '<div><span style="color:#d5d5d5">\u9879\u76ee</span> ________ <span style="color:#d5d5d5">\u6709\u6548\u671f</span> ________</div>'+
           '<div><span style="color:#d5d5d5">\u6837\u54c1\u6570\u503c</span> ________________________</div>'+
           '<div><span style="color:#d5d5d5">\u5236\u4f5c</span> ________ <span style="color:#d5d5d5">\u786e\u8ba4</span> ________</div>'+
           '<div><span style="color:#d5d5d5">\u5907\u6ce8</span> ____________________________</div>'+
         '</div>'+
       '</div>'
    : '';

  // 尺寸选择器选项（显示实际打印宽×高 mm，1px≈0.265mm @96dpi）
  var P2M = 0.265;
  var dS = { w: Math.round(280*0.5*P2M), h: Math.round(133*0.5*P2M) };
  var dM = { w: Math.round(280*0.7*P2M), h: Math.round(133*0.7*P2M) };
  var dL = { w: Math.round(280*1.0*P2M), h: Math.round(133*1.0*P2M) };
  // 自定义选项显示实际纸张尺寸；未提供高度（旧 URL 兼容）时显示内容等比尺寸
  var dC = (cw && ch)
    ? { w: Math.round(cw), h: Math.round(ch) }
    : { w: Math.round(labW*P2M), h: Math.round(133*scale*P2M) };
  var sizeOpts = '<option value="small"'+(sk==='small'?' selected':'')+'>小号 '+dS.w+'×'+dS.h+'mm</option>'+
    '<option value="medium"'+(sk==='medium'?' selected':'')+'>中标 '+dM.w+'×'+dM.h+'mm</option>'+
    '<option value="large"'+(sk==='large'?' selected':'')+'>大号 '+dL.w+'×'+dL.h+'mm</option>'+
    '<option value="custom"'+(sk==='custom'?' selected':'')+'>自定义 '+dC.w+'×'+dC.h+'mm</option>';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>\u6807\u7b7e '+escapeHtml(s.sample_no)+'</title>\n'+
'<style>\n'+
'@page{margin:0;size:auto}*{margin:0;padding:0;box-sizing:border-box}\n'+
'body{font-family:\'PingFang SC\',\'Microsoft YaHei\',-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding-top:42px}\n'+
'.size-bar{position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-family:sans-serif}\n'+
'.size-bar select{padding:2px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px}\n'+
'.size-bar button{margin-left:auto;padding:4px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}\n'+
'.lab{width:'+paperWpx+'px;height:'+paperHpx+'px;border:'+borderW+'px solid #000;border-radius:'+radius+'px;padding:'+pad+'px;display:flex;gap:'+gap+'px}\n'+
'.qr-side{width:'+qrSideW+'px;flex-shrink:0;text-align:center}\n'+
'.qr-side img{width:'+qrImgW+'px;height:'+qrImgW+'px;display:block;margin:0 auto}\n'+
'.qr-side .no{font-weight:700;font-size:'+noSize+'px;margin-top:3px;line-height:1.2}\n'+
'.qr-side .name{font-size:'+nameSize+'px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:'+nameLines+';-webkit-box-orient:vertical;overflow:hidden}\n'+
'.qr-side .meta{font-size:'+metaSize+'px;color:#333;line-height:1.3;display:-webkit-box;-webkit-line-clamp:'+metaLines+';-webkit-box-orient:vertical;overflow:hidden}\n'+
'.qr-side .spec{font-size:'+specSize+'px;color:#444;line-height:1.2;margin-top:1px;display:-webkit-box;-webkit-line-clamp:'+specLines+';-webkit-box-orient:vertical;overflow:hidden}\n'+
'.footer-note{font-size:'+footerSize+'px;color:#666;text-align:center;margin-top:5px}\n'+
'@media print{.size-bar{display:none}body{padding-top:0;justify-content:flex-start}html,body{width:auto;height:auto;overflow:visible}.footer-note{display:none}}\n'+
'</style></head><body>\n'+
'<div class="size-bar">打印尺寸: <select onchange="changeSize(this.value)">'+sizeOpts+'</select><span style="color:#b45309;font-size:11px">打印时在打印对话框选择标签纸尺寸并设缩放 100%，即可铺满纸张</span><button onclick="window.print()">打印</button></div>\n'+
'<div class="lab">\n'+
'  <div class="qr-side">\n'+
'    <img src="'+qrDataUrl+'" alt="QR"/>\n'+
'    <div class="no">'+escapeHtml(s.sample_no)+'</div>\n'+
'    <div class="name">'+escapeHtml(s.name||'\u2014')+'</div>\n'+
'    <div class="meta">'+meta+'</div>\n'+
'    <div class="spec">'+escapeHtml(s.spec||'')+'</div>\n'+
'  </div>\n'+
'  '+cardSide+'\n'+
'</div>\n'+
'<div class="footer-note">\u8d34\u4e8e\u6837\u54c1\u5e76\u626b\u7801\u786e\u8ba4</div>\n'+
'<script>\n'+
'function changeSize(v){\n'+
'  if(v==="custom"){\n'+
'    var w=prompt("输入标签纸宽度(30~150mm)","80");\n'+
'    if(w&&!isNaN(w)&&Number(w)>=30&&Number(w)<=150){\n'+
'      var h=prompt("输入标签纸高度(10~150mm)","40");\n'+
'      if(h&&!isNaN(h)&&Number(h)>=10&&Number(h)<=150){\n'+
'        localStorage.setItem("printSize","custom");\n'+
'        location.search="?size=custom&customW="+w+"&customH="+h;\n'+
'      }else{document.querySelector(".size-bar select").value="'+sk+'";}\n'+
'    }else{document.querySelector(".size-bar select").value="'+sk+'";}\n'+
'  }else{\n'+
'    localStorage.setItem("printSize",v);\n'+
'    location.search="?size="+v;\n'+
'  }\n'+
'}\n'+
'window.onload=function(){setTimeout(function(){window.print()},600);};\n'+
'</script>\n'+
'</body></html>';
}

function buildCardPrintHtml(s, scale, sizeKey) {
  if (!scale || scale <= 0) scale = 1;
  var sk = sizeKey || 'large';
  var P2M = 0.265;
  var cardWmm = Math.round(155 * scale * P2M);
  var cardHmm = Math.round(92 * scale * P2M);
  var labelMm = cardWmm + '×' + cardHmm + 'mm';

  var cardW = Math.round(155 * scale);
  var pad = Math.round(8 * scale);
  var radius = Math.round(8 * scale);
  var borderW = scale >= 0.7 ? 2 : 1;
  // 字号下限保护（px）：标示卡正文≥7，标题≥7（随尺寸缩小时避免打印不可辨认）
  var fontSize = Math.max(Math.round(7 * scale), 7);
  var titleSize = Math.max(Math.round(7 * scale), 7);
  var gridCol = Math.round(28 * scale);
  var gap1 = Math.round(2 * scale);
  var gap2 = Math.round(4 * scale);

  var sourceLabel = escapeHtml(SOURCE_TYPES[s.source_type] || s.source_type || '');
  var limitLabel = escapeHtml(LIMIT_LABELS[s.limit_item] || s.limit_item || '');
  var validStr = fmtDateYYMMDD(s.valid_until);
  var now = new Date();
  var expired = s.valid_until && new Date(s.valid_until) < now;
  var validColor = expired ? 'color:#dc2626;font-weight:700' : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>\u6807\u793a\u5361 '+escapeHtml(s.sample_no)+'</title>\n'+
'<style>\n'+
'@page{margin:0;size:auto}*{margin:0;padding:0;box-sizing:border-box}\n'+
'body{font-family:\'PingFang SC\',\'Microsoft YaHei\',-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding-top:42px}\n'+
'.size-bar{position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-family:sans-serif}\n'+
'.size-bar button{margin-left:auto;padding:4px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}\n'+
'.crd{width:'+cardW+'px;border:'+borderW+'px solid #000;border-radius:'+radius+'px;padding:'+pad+'px;font-size:'+fontSize+'px;line-height:1.5}\n'+
'.crd .title{font-weight:700;font-size:'+titleSize+'px;text-align:center;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:4px}\n'+
'.crd .grid{display:grid;grid-template-columns:'+gridCol+'px 1fr '+gridCol+'px 1fr;gap:'+gap1+'px '+gap2+'px}\n'+
'.crd .lbl{color:#999;white-space:nowrap;text-align:right}\n'+
'.crd .val{color:#333;white-space:nowrap}\n'+
'.crd .full{grid-column:1/-1;display:flex;gap:3px;overflow:visible}\n'+
'.crd .full .lbl{min-width:'+gridCol+'px;flex-shrink:0}\n'+
'.crd .full .val{overflow:visible;flex:1}\n'+
'.crd .pair-row{grid-column:1/-1;display:flex;justify-content:space-between}\n'+
'.crd .pair-row .pair{display:flex;gap:2px;flex-shrink:0}\n'+
'.crd .pair-row .pair .lbl{min-width:'+gridCol+'px;flex-shrink:0;text-align:right}\n'+
'@media print{.size-bar{display:none}body{padding-top:0;justify-content:flex-start}html,body{width:auto;height:auto;overflow:visible}}\n'+
'</style></head><body>\n'+
'<div class="size-bar">打印尺寸: <b>'+labelMm+'</b> <span style="color:#6b7280">（跟随标签尺寸）</span><button onclick="window.print()">打印</button></div>\n'+
'<div class="crd">\n'+
'  <div class="title">\u6807\u793a\u5361</div>\n'+
'  <div class="grid">\n'+
'    <div class="pair-row">\n'+
'      <div class="pair"><span class="lbl">\u7c7b\u578b</span><span class="val"><b>'+escapeHtml(s.sample_type||'')+'</b></span></div>\n'+
'      <div class="pair"><span class="lbl">\u6765\u6e90</span><span class="val"><b>'+sourceLabel+'</b></span></div>\n'+
'    </div>\n'+
'    <span class="lbl">\u7248\u6b21</span><span class="val"><b>'+escapeHtml(s.card_version||'')+'</b></span>\n'+
'    <div class="full"><span class="lbl">\u9879\u76ee</span><span class="val"><b>'+limitLabel+'</b></span></div>\n'+
'    <div class="full"><span class="lbl">\u6709\u6548\u671f</span><span class="val" style="'+validColor+'"><b>'+validStr+'</b>'+(expired?' [\u5df2\u8fc7\u671f]':'')+'</span></div>\n'+
'    <div class="full"><span class="lbl">\u6837\u54c1\u6570\u503c</span><span class="val">'+escapeHtml(s.test_data||'')+'</span></div>\n'+
'    <div class="pair-row">\n'+
'      <div class="pair"><span class="lbl">\u5236\u4f5c</span><span class="val"><b>'+escapeHtml(s.signed_by_rd||'')+'</b></span></div>\n'+
'      <div class="pair"><span class="lbl">\u786e\u8ba4</span><span class="val"><b>'+escapeHtml(s.signed_by_qa||'')+'</b></span></div>\n'+
'    </div>\n'+
'    <div class="full"><span class="lbl">\u5907\u6ce8</span><span class="val">'+escapeHtml(s.notes||'')+'</span></div>\n'+
'  </div>\n'+
'</div>\n'+
'<script>window.onload=function(){setTimeout(function(){window.print()},600);};</script>\n'+
'</body></html>';
}

module.exports = { buildLabelHtml, buildCardPrintHtml, parseSize };
