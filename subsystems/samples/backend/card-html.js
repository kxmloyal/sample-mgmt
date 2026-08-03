// routes/card-html.js — 标签和标示卡 HTML 生成 + 尺寸解析
const { LIMIT_LABELS, SOURCE_TYPES } = require('./card-constants');

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
  if (sizeKey === 'custom' && req.query.customW) w = Number(req.query.customW);
  return { sizeKey, scale: w / 100 };
}

function buildLabelHtml(s, qrDataUrl, blankCard, scale, sizeKey) {
  if (!scale || scale <= 0) scale = 1;
  var sk = sizeKey || 'large';

  var labW = Math.round(280 * scale);
  var qrSideW = Math.round(100 * scale);
  var qrImgW = Math.round(66 * scale);
  var pad = Math.round(10 * scale);
  var gap = Math.round(7 * scale);
  var radius = Math.round(10 * scale);
  var borderW = scale >= 0.7 ? 2 : 1;
  var noSize = Math.round(11 * scale);
  var nameSize = Math.round(9 * scale);
  var metaSize = Math.round(8 * scale);
  var specSize = Math.round(7 * scale);
  var cardTitle = Math.round(7 * scale);
  var cardText = Math.round(7 * scale);
  var footerSize = Math.round(6 * scale);
  var cardPad = Math.round(4 * scale);

  var meta = [s.model || '', s.station || ''].filter(Boolean).join(' \u00b7 ') || '\u2014';
  var cardSide = blankCard
    ? '<div style="flex:1;min-width:0;padding:0 '+cardPad+'px;border-left:1px dashed #aaa">'+
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
  var dC = { w: Math.round(labW*P2M), h: Math.round(133*scale*P2M) };
  var sizeOpts = '<option value="small"'+(sk==='small'?' selected':'')+'>小号 '+dS.w+'×'+dS.h+'mm</option>'+
    '<option value="medium"'+(sk==='medium'?' selected':'')+'>中标 '+dM.w+'×'+dM.h+'mm</option>'+
    '<option value="large"'+(sk==='large'?' selected':'')+'>大号 '+dL.w+'×'+dL.h+'mm</option>'+
    '<option value="custom"'+(sk==='custom'?' selected':'')+'>自定义 '+dC.w+'×'+dC.h+'mm</option>';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>\u6807\u7b7e '+s.sample_no+'</title>\n'+
'<style>\n'+
'@page{margin:3mm;size:auto}*{margin:0;padding:0;box-sizing:border-box}\n'+
'body{font-family:\'PingFang SC\',\'Microsoft YaHei\',-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding-top:42px}\n'+
'.size-bar{position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-family:sans-serif}\n'+
'.size-bar select{padding:2px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px}\n'+
'.size-bar button{margin-left:auto;padding:4px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}\n'+
'.lab{width:'+labW+'px;border:'+borderW+'px solid #000;border-radius:'+radius+'px;padding:'+pad+'px;display:flex;gap:'+gap+'px}\n'+
'.qr-side{width:'+qrSideW+'px;flex-shrink:0;text-align:center}\n'+
'.qr-side img{width:'+qrImgW+'px;height:'+qrImgW+'px;display:block;margin:0 auto}\n'+
'.qr-side .no{font-weight:700;font-size:'+noSize+'px;margin-top:3px;line-height:1.2}\n'+
'.qr-side .name{font-size:'+nameSize+'px;line-height:1.4}\n'+
'.qr-side .meta{font-size:'+metaSize+'px;color:#555;line-height:1.3}\n'+
'.qr-side .spec{font-size:'+specSize+'px;color:#666;line-height:1.2;margin-top:1px}\n'+
'.footer-note{font-size:'+footerSize+'px;color:#999;text-align:center;margin-top:5px}\n'+
'@media print{.size-bar{display:none}body{padding-top:0}html,body{width:auto;height:auto;overflow:visible}}\n'+
'</style></head><body>\n'+
'<div class="size-bar">打印尺寸: <select onchange="changeSize(this.value)">'+sizeOpts+'</select><button onclick="window.print()">打印</button></div>\n'+
'<div class="lab">\n'+
'  <div class="qr-side">\n'+
'    <img src="'+qrDataUrl+'" alt="QR"/>\n'+
'    <div class="no">'+s.sample_no+'</div>\n'+
'    <div class="name">'+(s.name||'\u2014')+'</div>\n'+
'    <div class="meta">'+meta+'</div>\n'+
'    <div class="spec">'+(s.spec||'')+'</div>\n'+
'  </div>\n'+
'  '+cardSide+'\n'+
'</div>\n'+
'<div class="footer-note">\u8d34\u4e8e\u6837\u54c1\u5e76\u626b\u7801\u786e\u8ba4</div>\n'+
'<script>\n'+
'function changeSize(v){\n'+
'  if(v==="custom"){\n'+
'    var w=prompt("输入宽度(30~150mm)","80");\n'+
'    if(w&&!isNaN(w)&&Number(w)>=30&&Number(w)<=150){\n'+
'      localStorage.setItem("printSize","custom");\n'+
'      location.search="?size=custom&customW="+w;\n'+
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
  var fontSize = Math.round(7 * scale);
  var titleSize = Math.round(7 * scale);
  var gridCol = Math.round(28 * scale);
  var gap1 = Math.round(2 * scale);
  var gap2 = Math.round(4 * scale);

  var sourceLabel = SOURCE_TYPES[s.source_type] || s.source_type || '';
  var limitLabel = LIMIT_LABELS[s.limit_item] || s.limit_item || '';
  var validStr = fmtDateYYMMDD(s.valid_until);
  var now = new Date();
  var expired = s.valid_until && new Date(s.valid_until) < now;
  var validColor = expired ? 'color:#dc2626;font-weight:700' : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>\u6807\u793a\u5361 '+s.sample_no+'</title>\n'+
'<style>\n'+
'@page{margin:2mm;size:auto}*{margin:0;padding:0;box-sizing:border-box}\n'+
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
'@media print{.size-bar{display:none}body{padding-top:0}html,body{width:auto;height:auto;overflow:visible}}\n'+
'</style></head><body>\n'+
'<div class="size-bar">打印尺寸: <b>'+labelMm+'</b> <span style="color:#6b7280">（跟随标签尺寸）</span><button onclick="window.print()">打印</button></div>\n'+
'<div class="crd">\n'+
'  <div class="title">\u6807\u793a\u5361</div>\n'+
'  <div class="grid">\n'+
'    <div class="pair-row">\n'+
'      <div class="pair"><span class="lbl">\u7c7b\u578b</span><span class="val"><b>'+(s.sample_type||'')+'</b></span></div>\n'+
'      <div class="pair"><span class="lbl">\u6765\u6e90</span><span class="val"><b>'+sourceLabel+'</b></span></div>\n'+
'    </div>\n'+
'    <span class="lbl">\u7248\u6b21</span><span class="val"><b>'+(s.card_version||'')+'</b></span>\n'+
'    <div class="full"><span class="lbl">\u9879\u76ee</span><span class="val"><b>'+limitLabel+'</b></span></div>\n'+
'    <div class="full"><span class="lbl">\u6709\u6548\u671f</span><span class="val" style="'+validColor+'"><b>'+validStr+'</b>'+(expired?' [\u5df2\u8fc7\u671f]':'')+'</span></div>\n'+
'    <div class="full"><span class="lbl">\u6837\u54c1\u6570\u503c</span><span class="val">'+(s.test_data||'')+'</span></div>\n'+
'    <div class="pair-row">\n'+
'      <div class="pair"><span class="lbl">\u5236\u4f5c</span><span class="val"><b>'+(s.signed_by_rd||'')+'</b></span></div>\n'+
'      <div class="pair"><span class="lbl">\u786e\u8ba4</span><span class="val"><b>'+(s.signed_by_qa||'')+'</b></span></div>\n'+
'    </div>\n'+
'    <div class="full"><span class="lbl">\u5907\u6ce8</span><span class="val">'+(s.notes||'')+'</span></div>\n'+
'  </div>\n'+
'</div>\n'+
'<script>window.onload=function(){setTimeout(function(){window.print()},600);};</script>\n'+
'</body></html>';
}

module.exports = { buildLabelHtml, buildCardPrintHtml, parseSize };
