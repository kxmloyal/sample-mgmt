// routes/card-print-html.js — 标示卡打印 HTML 生成（与标签页解耦，随标签尺寸 contain 缩放）
// 由 card-html.js 拆分而来（Issue #6）：buildCardPrintHtml + fmtDateYYMMDD 独立成文件
const { LIMIT_LABELS, SOURCE_TYPES, SOURCE_TYPES_SHORT, PRESET_MM } = require('./card-constants');
const { escapeHtml } = require('./html-utils');

// 有效期格式化：yy/mm/dd（如 26/12/31），空值返回占位符
function fmtDateYYMMDD(t) {
  if (!t) return '______';
  const d = new Date(t);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return yy+'/'+mm+'/'+dd;
}

// 标示卡打印页：纸张尺寸 = 标签空白卡区（标签纸去掉 QR 侧边，预设三档/自定义均自动换算），
// 内容按 155×92px 基准渲染，由 fitCard() 测量后整卡按纸张 contain 缩放（scale=min(sheetW/cardW,sheetH/cardH)，完整无裁切）
function buildCardPrintHtml(s, sizeKey, cw, ch) {
  var sk = (sizeKey === 'small' || sizeKey === 'medium' || sizeKey === 'large' || sizeKey === 'custom') ? sizeKey : 'large';
  var P2M = 0.265;
  var M2P = 3.7795;
  // 标签纸物理尺寸（mm）：预设三档与标签页共用 PRESET_MM；自定义用真实宽高，缺高时按标签 280×133 基准等比
  var pWmm, pHmm;
  if (sk === 'custom' && cw) {
    pWmm = cw;
    pHmm = ch || Math.round(133 * (cw / 74.2) * P2M * 10) / 10;
  } else {
    var mm = PRESET_MM[sk] || PRESET_MM.large;
    pWmm = mm[0]; pHmm = mm[1];
  }
  var paperWpx = Math.round(pWmm * M2P);
  var paperHpx = Math.round(pHmm * M2P);
  // 空白卡区 = 标签纸去掉 QR 侧边后的实际贴入区（与 card-html.js buildLabelHtml 的 .lab 布局公式保持一致）：
  // .qr-side 宽=round(100×scale)、pad=round(10×scale)、gap=round(7×scale)、borderW=scale≥0.7?2:1
  // 自定义档 scale 随实际宽度变化，因此空白卡区自动跟随标签尺寸缩放
  var lscale = pWmm / 74.2;
  var qrSideW = Math.round(100 * lscale);
  var lpad = Math.round(10 * lscale);
  var lgap = Math.round(7 * lscale);
  var lborder = lscale >= 0.7 ? 2 : 1;
  var blankWpx = paperWpx - qrSideW - lpad * 2 - lgap - lborder * 2;
  var blankHpx = paperHpx - lpad * 2 - lborder * 2;
  // 空白卡区 mm（整数，@page 写死 + 顶栏显示同源，打印对话框按整数选纸）
  var blankWmm = Math.round(blankWpx / M2P);
  var blankHmm = Math.round(blankHpx / M2P);
  var labelMm = blankWmm + '×' + blankHmm + 'mm';
  // 档位中文名（与标签页选择器一致），顶部显示"档位名 + 纸张 mm 尺寸"，方便对照打印对话框选纸
  var sizeName = ({ small: '小号', medium: '中标', large: '大号', custom: '自定义' })[sk] || '大号';

  var cardW = 155;
  var pad = 8;
  var radius = 8;
  var borderW = 2;
  var fontSize = 7;
  var titleSize = 7;
  var gridCol = 28;
  var gap1 = 2;
  var gap2 = 4;

  // 来源显示：代码+简称（如 G·塔岗）。全称（元将五金塔岗分厂）在窄小空白卡区 nowrap 撑宽整卡导致缩放压小，改用紧凑格式
  var sourceCode = escapeHtml(s.source_type || '');
  var sourceShort = escapeHtml(SOURCE_TYPES_SHORT[s.source_type] || SOURCE_TYPES[s.source_type] || '');
  var sourceLabel = sourceCode ? (sourceShort ? sourceCode + '\u00b7' + sourceShort : sourceCode) : '';
  var limitLabel = escapeHtml(LIMIT_LABELS[s.limit_item] || s.limit_item || '');
  var validStr = fmtDateYYMMDD(s.valid_until);
  var now = new Date();
  var expired = s.valid_until && new Date(s.valid_until) < now;
  var validColor = expired ? 'color:#dc2626;font-weight:700' : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>\u6807\u793a\u5361 '+escapeHtml(s.sample_no)+'</title>\n'+
'<style>\n'+
'@page{margin:0;size:'+blankWmm+'mm '+blankHmm+'mm}*{margin:0;padding:0;box-sizing:border-box}\n'+
'body{font-family:\'PingFang SC\',\'Microsoft YaHei\',-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding-top:42px}\n'+
'.size-bar{position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-family:sans-serif}\n'+
'.size-bar button{margin-left:auto;padding:4px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}\n'+
'.sheet{width:'+blankWmm+'mm;height:'+blankHmm+'mm;display:flex;align-items:center;justify-content:center}\n'+
'.crd{width:'+cardW+'px;border:'+borderW+'px solid #000;border-radius:'+radius+'px;padding:'+pad+'px;font-size:'+fontSize+'px;line-height:1.5}\n'+
'.crd .title{font-weight:700;font-size:'+titleSize+'px;text-align:center;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:4px}\n'+
'.crd .grid{display:grid;grid-template-columns:'+gridCol+'px 1fr '+gridCol+'px 1fr;gap:'+gap1+'px '+gap2+'px}\n'+
'.crd .lbl{color:#999;white-space:nowrap;text-align:right}\n'+
'.crd .val{color:#333;white-space:nowrap}\n'+
'.crd .full{grid-column:1/-1;display:flex;gap:3px;min-width:0;overflow:visible}\n'+
'.crd .full .lbl{min-width:'+gridCol+'px;flex-shrink:0}\n'+
'.crd .full .val{min-width:0;flex:1;white-space:normal;word-break:break-word}\n'+
'.crd .pair-row{grid-column:1/-1;display:flex;justify-content:space-between}\n'+
'.crd .pair-row .pair{display:flex;gap:2px;flex-shrink:0}\n'+
'.crd .pair-row .pair .lbl{min-width:'+gridCol+'px;flex-shrink:0;text-align:right}\n'+
'@media print{.size-bar{display:none}body{min-height:0;padding-top:0;justify-content:flex-start}html,body{width:auto;height:auto;overflow:hidden}}\n'+
'</style></head><body>\n'+
'<div class="size-bar">标签纸: <b>'+sizeName+' '+labelMm+'</b> <span style="color:#b45309;font-size:11px">请在打印对话框选择 '+blankWmm+'×'+blankHmm+'mm 纸张（页面已按此写死 @page 尺寸）</span><button onclick="window.print()">打印</button></div>\n'+
'<div class="sheet">\n'+
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
'</div>\n'+
'<script>\n'+
'function fitCard(){\n'+
'  var sh=document.querySelector(".sheet"),c=document.querySelector(".crd");\n'+
'  var s=Math.min(sh.clientWidth/c.offsetWidth,sh.clientHeight/c.offsetHeight);\n'+
'  c.style.transformOrigin="center";c.style.transform="scale("+s+")";\n'+
'}\n'+
'window.onload=function(){fitCard();setTimeout(function(){window.print()},600);};\n'+
'window.addEventListener("resize",fitCard);\n'+
'</script>\n'+
'</body></html>';
}

module.exports = { buildCardPrintHtml, fmtDateYYMMDD };
