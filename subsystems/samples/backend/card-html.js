// routes/card-html.js — 标签 HTML 生成 + 尺寸解析
// 标示卡打印（buildCardPrintHtml + fmtDateUTC）已拆至 ./card-print-html.js
const { LIMIT_LABELS, SOURCE_TYPES, PRESET_MM } = require('./card-constants');
const { buildCardPrintHtml } = require('./card-print-html');
const { escapeHtml } = require('./html-utils');

function parseSize(req) {
  const sizeKey = req.query.size || 'large';
  var cw = null;
  var ch = null;
  if (sizeKey === 'custom') {
    // 自定义长宽（真实 mm 语义）：内容基准 280×133px ≈ 74.2×35.2mm（1px≈0.265mm）
    // 宽 30~150mm、高 10~150mm；任一非法/缺失按等比兼容；宽非法回退大号
    cw = Number(req.query.customW);
    if (!(Number.isFinite(cw) && cw >= 30 && cw <= 150)) cw = null;
    ch = Number(req.query.customH);
    if (!(Number.isFinite(ch) && ch >= 10 && ch <= 150)) ch = null;
    // 宽合法但高缺失/非法：按大号宽高比（60:40）等比补高，兑现上方注释「任一非法/缺失按等比兼容」
    // （与 card-print-html.js sheetGeom 缺高分支同口径；card-constants.js 不在本任务清单，两文件各自实现保持一致）
    if (cw !== null && ch === null) ch = Math.round(cw * (PRESET_MM.large[1] / PRESET_MM.large[0]) * 10) / 10;
  } else {
    // 预设档：真实纸张尺寸（mm）以 PRESET_MM 为唯一来源，支持独立宽高（如大号 60×40）
    var mm = PRESET_MM[sizeKey] || PRESET_MM.large;
    cw = mm[0];
    ch = mm[1];
  }
  if (cw !== null && ch !== null) {
    // contain 适配：内容基准 280×133px ≈ 74.2×35.2mm 完整放入纸张（不溢出/不裁剪）
    var scale = Math.min(cw / 74.2, ch / 35.2);
    return { sizeKey, scale, cw, ch };
  }
  // 自定义宽非法/缺失：回退大号（以 PRESET_MM.large 为准）
  var lb = PRESET_MM.large;
  return { sizeKey: 'large', scale: Math.min(lb[0] / 74.2, lb[1] / 35.2), cw: lb[0], ch: lb[1] };
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
// autoPrint：true=页面加载后自动弹打印（print 场景）；false=不自动打印（download 保存场景）
function buildLabelHtml(s, qrDataUrl, blankCard, autoPrint, scale, sizeKey, cw, ch) {
  if (!scale || scale <= 0) scale = 1;
  // sizeKey 白名单校验：仅接受预设档/自定义，防 URL 注入内联 JS（XSS）
  var sk = (sizeKey === 'small' || sizeKey === 'medium' || sizeKey === 'large' || sizeKey === 'custom') ? sizeKey : 'large';

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
  // 标签纸物理尺寸：先算 mm（预设按内容基准 280×133px×scale 折 mm；custom 用真实宽高），再转 px（1mm≈3.7795px @96dpi）
  // mm 值同时用于 @page 写死纸张尺寸，约束打印对话框默认纸张
  var paperWmm = cw || Math.round(280 * scale * 0.265);
  var paperHmm = ch || Math.round(133 * scale * 0.265);
  var paperWpx = Math.round(paperWmm * 3.7795);
  var paperHpx = Math.round(paperHmm * 3.7795);
  var innerH = paperHpx - 4 * borderW - 2 * pad;
  // 编号优先单行：字号自动收缩至可放入 QR 列宽（下限 6px），放不下时仍允许换行
  var noLen = (s.sample_no || '').length;
  var noSize = noLen ? Math.max(Math.min(Math.round(11 * scale), Math.floor(qrSideW / (noLen * 0.55 + 0.001))), 6) : Math.round(11 * scale);
  // 文本块高度估算（行高：编号 1.2 / 名称 1.4 / 机型 1.3 / 规格 1.2，含 3px/1px 外边距）
  // 小尺寸（scale<0.6）名称/机型限 1 行、规格限 2 行；二维码余量不足(<24px)时再收紧为单行
  var tight = scale < 0.6;
  var nameLines = Math.min(estTextLines(s.name, nameSize, qrSideW), tight ? 1 : 2);
  var metaLines = Math.min(estTextLines(meta, metaSize, qrSideW), tight ? 1 : 2);
  var specLines = estTextLines(s.spec, specSize, qrSideW);   // 规格不截断：完整行数参与高度/二维码估算
  var noLines = estTextLines(s.sample_no, noSize, qrSideW);
  var textBlockH = noLines * noSize * 1.2 + 3 + nameLines * nameSize * 1.4 + metaLines * metaSize * 1.3 + specLines * specSize * 1.2 + 1;
  var qrImgW = Math.min(Math.round(66 * scale), Math.max(Math.round(innerH - textBlockH), 12));
  if (qrImgW < 24) {
    // 二维码余量不足：名称/机型收紧为单行（规格保持完整显示），优先保障二维码可识别尺寸
    nameLines = Math.min(estTextLines(s.name, nameSize, qrSideW), 1);
    metaLines = Math.min(estTextLines(meta, metaSize, qrSideW), 1);
    specLines = estTextLines(s.spec, specSize, qrSideW);
    textBlockH = noLines * noSize * 1.2 + 3 + nameLines * nameSize * 1.4 + metaLines * metaSize * 1.3 + specLines * specSize * 1.2 + 1;
    qrImgW = Math.min(Math.round(66 * scale), Math.max(Math.round(innerH - textBlockH), 12));
  }
  var cardSide = blankCard
    ? '<div style="flex:1;min-width:0;padding:0 '+cardPad+'px;border-left:1.5px dashed #666">'+
         '<div style="font-weight:700;font-size:'+cardTitle+'px;text-align:center;color:#000;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:4px">\u6807\u793a\u5361\uff08\u53d1\u884c\u540e\u6253\u5370\u8d34\u5165\uff09</div>'+
         '<div style="font-size:'+cardText+'px;color:#000;line-height:1.6">'+
           '<div><span style="color:#000">\u7c7b\u578b</span> ___ <span style="color:#000">\u6765\u6e90</span> ___ <span style="color:#000">\u7248\u6b21</span> ___</div>'+
           '<div><span style="color:#000">\u9879\u76ee</span> ________ <span style="color:#000">\u6709\u6548\u671f</span> ________</div>'+
           '<div><span style="color:#000">\u6837\u54c1\u6570\u503c</span> ________________________</div>'+
           '<div><span style="color:#000">\u5236\u4f5c</span> ________ <span style="color:#000">\u786e\u8ba4</span> ________</div>'+
           '<div><span style="color:#000">\u5907\u6ce8</span> ____________________________</div>'+
         '</div>'+
       '</div>'
    : '';

  // 尺寸选择器选项（显示实际打印宽×高 mm，1mm≈3.7795px @96dpi；预设档共用 PRESET_MM）
  var P2M = 0.265;
  var dS = { w: PRESET_MM.small[0], h: PRESET_MM.small[1] };
  var dM = { w: PRESET_MM.medium[0], h: PRESET_MM.medium[1] };
  var dL = { w: PRESET_MM.large[0], h: PRESET_MM.large[1] };
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
'@page{margin:0;size:'+paperWmm+'mm '+paperHmm+'mm}*{margin:0;padding:0;box-sizing:border-box}\n'+
'body{font-family:\'PingFang SC\',\'Microsoft YaHei\',-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding-top:42px}\n'+
'.size-bar{position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-family:sans-serif}\n'+
'.size-bar select{padding:2px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px}\n'+
'.size-bar button{margin-left:auto;padding:4px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}\n'+
'.sheet{width:'+paperWmm+'mm;height:'+paperHmm+'mm;display:flex;align-items:center;justify-content:center}\n'+
'.lab{width:'+labW+'px;border:'+borderW+'px solid #000;border-radius:'+radius+'px;padding:'+pad+'px;display:flex;gap:'+gap+'px}\n'+
'.qr-side{width:'+qrSideW+'px;flex-shrink:0;text-align:center}\n'+
'.qr-side img{width:'+qrImgW+'px;height:'+qrImgW+'px;display:block;margin:0 auto}\n'+
'.qr-side .no{font-weight:700;font-size:'+noSize+'px;margin-top:3px;line-height:1.2}\n'+
'.qr-side .name{font-size:'+nameSize+'px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:'+nameLines+';-webkit-box-orient:vertical;overflow:hidden}\n'+
'.qr-side .meta{font-size:'+metaSize+'px;color:#000;line-height:1.3;display:-webkit-box;-webkit-line-clamp:'+metaLines+';-webkit-box-orient:vertical;overflow:hidden}\n'+
'.qr-side .spec{font-size:'+specSize+'px;color:#000;line-height:1.2;margin-top:1px;word-break:break-word}\n'+
'.footer-note{font-size:'+footerSize+'px;color:#666;text-align:center;margin-top:5px}\n'+
'@media print{.size-bar{display:none}body{min-height:0;padding-top:0;justify-content:flex-start}html,body{width:auto;height:auto;overflow:hidden}.footer-note{display:none}}\n'+
'</style></head><body>\n'+
'<div class="size-bar">打印尺寸: <select onchange="changeSize(this.value)">'+sizeOpts+'</select><span style="color:#b45309;font-size:11px">打印时在打印对话框选择标签纸尺寸并设缩放 100%，即可铺满纸张</span><button onclick="window.print()">打印</button></div>\n'+
'<div class="sheet">\n'+
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
'        localStorage.setItem("printCustomW",w);\n'+
'        localStorage.setItem("printCustomH",h);\n'+
'        location.search="?size=custom&customW="+w+"&customH="+h;\n'+
'      }else{document.querySelector(".size-bar select").value="'+sk+'";}\n'+
'    }else{document.querySelector(".size-bar select").value="'+sk+'";}\n'+
'  }else{\n'+
'    localStorage.setItem("printSize",v);\n'+
'    location.search="?size="+v;\n'+
'  }\n'+
'}\n'+
'function fitCard(){\n'+
'  var sh=document.querySelector(".sheet"),c=document.querySelector(".lab");\n'+
'  var s=Math.min(1,Math.min(sh.clientWidth/c.offsetWidth,sh.clientHeight/c.offsetHeight));\n'+
'  c.style.transformOrigin="center";c.style.transform="scale("+s+")";\n'+
'}\n'+
'window.addEventListener("resize",fitCard);\n'+
(autoPrint ? 'window.onload=function(){fitCard();setTimeout(function(){window.print()},600);};\n' : 'window.onload=function(){fitCard();};\n')+
'</script>\n'+
'</body></html>';
}

// buildCardPrintHtml 从 card-print-html.js 重导出，保持旧调用方 require('./card-html') 接口兼容
module.exports = { buildLabelHtml, buildCardPrintHtml, parseSize };
