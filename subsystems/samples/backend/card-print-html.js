// routes/card-print-html.js — 标示卡打印 HTML 生成（与标签页解耦，随标签尺寸 contain 缩放）
// 由 card-html.js 拆分而来（Issue #6）：buildCardPrintHtml + fmtDateUTC 独立成文件
// T17：抽出 buildCardFragment（卡片本体片段）供单卡/批量复用；新增 buildBatchCardPrintHtml（单页多卡 + @page 分页）
const { LIMIT_LABELS, SOURCE_TYPES, SOURCE_TYPES_SHORT, PRESET_MM } = require('./card-constants');
const { escapeHtml } = require('./html-utils');

// 【口径】有效期/复检日一律按 UTC 日期（YYYY-MM-DD）显示，前后端三处一致
// （本文件打印卡 / card-page.js 匿名卡 / detail.js 详情页），避免服务器时区致 00:00–08:00 CST 发行日差一天
// 有效期格式化：UTC 日期 YYYY-MM-DD（如 2027-08-31），空值返回占位符
function fmtDateUTC(t) {
  if (!t) return '______';
  const d = new Date(t);
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
}

// 纸张/空白卡区尺寸换算：预设三档与标签页共用 PRESET_MM；自定义用真实宽高，
// 缺高时按大号宽高比（60:40）等比补高（与 card-html.js parseSize 缺高分支同口径，防御性兜底）
// 【T19 mm 直出】布局公式全程以 mm 浮点计算，最终一次性取整，消除 mm→px→mm 往返漂移（≤1mm）；
// @page/.sheet 尺寸与 PRESET_MM 严格同源（px 布局常量按 CSS 1mm=96/25.4px 严格折 mm）
// 返回 { sk, blankWmm, blankHmm, labelMm, sizeName }（单卡/批量共用，保证 @page 与顶栏显示同源）
var PX_PER_MM = 96 / 25.4; // CSS 物理像素严格换算（1in = 96px = 25.4mm）
function sheetGeom(sizeKey, cw, ch) {
  var sk = (sizeKey === 'small' || sizeKey === 'medium' || sizeKey === 'large' || sizeKey === 'custom') ? sizeKey : 'large';
  var pWmm, pHmm;
  if (sk === 'custom' && cw) {
    pWmm = cw;
    pHmm = ch || Math.round(cw * (PRESET_MM.large[1] / PRESET_MM.large[0]) * 10) / 10;
  } else {
    var mm = PRESET_MM[sk] || PRESET_MM.large;
    pWmm = mm[0]; pHmm = mm[1];
  }
  // 空白卡区 = 标签纸去掉 QR 侧边后的实际贴入区（与 card-html.js buildLabelHtml 的 .lab 布局公式同源）：
  // .qr-side 宽=100×scale、pad=10×scale、gap=7×scale、borderW=scale≥0.7?2:1（px，按 PX_PER_MM 折 mm 浮点）
  // 自定义档 scale 随实际宽度变化，因此空白卡区自动跟随标签尺寸缩放
  var lscale = pWmm / 74.2;
  var qrSideMm = 100 * lscale / PX_PER_MM;
  var lpadMm = 10 * lscale / PX_PER_MM;
  var lgapMm = 7 * lscale / PX_PER_MM;
  var lborderMm = (lscale >= 0.7 ? 2 : 1) / PX_PER_MM;
  // 空白卡区 mm（全程浮点、一次性取整，@page 写死 + 顶栏显示同源，打印对话框按整数选纸）
  var blankWmm = Math.round(pWmm - qrSideMm - lpadMm * 2 - lgapMm - lborderMm * 2);
  var blankHmm = Math.round(pHmm - lpadMm * 2 - lborderMm * 2);
  return {
    sk: sk,
    blankWmm: blankWmm,
    blankHmm: blankHmm,
    labelMm: blankWmm + '×' + blankHmm + 'mm',
    // 档位中文名（与标签页选择器一致），顶部显示"档位名 + 纸张 mm 尺寸"，方便对照打印对话框选纸
    sizeName: ({ small: '小号', medium: '中标', large: '大号', custom: '自定义' })[sk] || '大号'
  };
}

// 页面级 CSS（@page 尺寸 + 顶栏 + sheet 容器），单卡/批量共用
function pageCss(g) {
  return '@page{margin:0;size:'+g.blankWmm+'mm '+g.blankHmm+'mm}*{margin:0;padding:0;box-sizing:border-box}\n'+
'body{font-family:\'PingFang SC\',\'Microsoft YaHei\',-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding-top:42px}\n'+
'.size-bar{position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-family:sans-serif}\n'+
'.size-bar button{margin-left:auto;padding:4px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}\n'+
'.sheet{width:'+g.blankWmm+'mm;height:'+g.blankHmm+'mm;display:flex;align-items:center;justify-content:center}\n';
}

// 卡片本体 CSS（.crd 系列），单卡/批量共用，版式只此一份（§15 禁止复制粘贴版式代码）
function cardCss() {
  var cardW = 155;
  var pad = 8;
  var radius = 8;
  var borderW = 2;
  var fontSize = 7;
  var titleSize = 7;
  var gridCol = 28;
  var gap1 = 2;
  var gap2 = 4;
  return '.crd{width:'+cardW+'px;border:'+borderW+'px solid #000;border-radius:'+radius+'px;padding:'+pad+'px;font-size:'+fontSize+'px;line-height:1.5}\n'+
'.crd .title{font-weight:700;font-size:'+titleSize+'px;text-align:center;color:#000;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:4px}\n'+
'.crd .grid{display:grid;grid-template-columns:'+gridCol+'px 1fr '+gridCol+'px 1fr;gap:'+gap1+'px '+gap2+'px}\n'+
'.crd .lbl{color:#000;white-space:nowrap;text-align:right}\n'+
'.crd .val{color:#000;white-space:nowrap}\n'+
'.crd .full{grid-column:1/-1;display:flex;gap:3px;min-width:0;overflow:visible}\n'+
'.crd .full .lbl{min-width:'+gridCol+'px;flex-shrink:0}\n'+
'.crd .full .val{min-width:0;flex:1;white-space:normal;word-break:break-word}\n'+
'.crd .pair-row{grid-column:1/-1;display:flex;justify-content:space-between}\n'+
'.crd .pair-row .pair{display:flex;gap:2px;flex-shrink:0}\n'+
'.crd .pair-row .pair .lbl{min-width:'+gridCol+'px;flex-shrink:0;text-align:right}\n';
}

// 顶部尺寸说明栏（extraHtml 可追加批量张数等说明）
function sizeBarHtml(g, extraHtml) {
  return '<div class="size-bar">标签纸: <b>'+g.sizeName+' '+g.labelMm+'</b> <span style="color:#b45309;font-size:11px">请在打印对话框选择 '+g.blankWmm+'×'+g.blankHmm+'mm 纸张（页面已按此写死 @page 尺寸）</span>'+(extraHtml||'')+'<button onclick="window.print()">打印</button></div>\n';
}

// 卡片本体 HTML 片段（不含 .sheet 容器）：单卡/批量复用，版式唯一来源
// 来源显示：代码+简称（如 G·塔岗）。全称（元将五金塔岗分厂）在窄小空白卡区 nowrap 撑宽整卡导致缩放压小，改用紧凑格式
function buildCardFragment(s) {
  var sourceCode = escapeHtml(s.source_type || '');
  var sourceShort = escapeHtml(SOURCE_TYPES_SHORT[s.source_type] || SOURCE_TYPES[s.source_type] || '');
  var sourceLabel = sourceCode ? (sourceShort ? sourceCode + '·' + sourceShort : sourceCode) : '';
  var limitLabel = escapeHtml(LIMIT_LABELS[s.limit_item] || s.limit_item || '');
  var validStr = fmtDateUTC(s.valid_until);
  var now = new Date();
  var expired = s.valid_until && new Date(s.valid_until) < now;
  var validColor = expired ? 'font-weight:700' : '';

  return '<div class="crd">\n'+
'  <div class="title">标示卡</div>\n'+
'  <div class="grid">\n'+
'    <div class="pair-row">\n'+
'      <div class="pair"><span class="lbl">类型</span><span class="val"><b>'+escapeHtml(s.sample_type||'')+'</b></span></div>\n'+
'      <div class="pair"><span class="lbl">来源</span><span class="val"><b>'+sourceLabel+'</b></span></div>\n'+
'    </div>\n'+
'    <span class="lbl">版次</span><span class="val"><b>'+escapeHtml(s.card_version||'')+'</b></span>\n'+
'    <div class="full"><span class="lbl">项目</span><span class="val"><b>'+limitLabel+'</b></span></div>\n'+
'    <div class="full"><span class="lbl">有效期</span><span class="val" style="'+validColor+'"><b>'+validStr+'</b>'+(expired?' [已过期]':'')+'</span></div>\n'+
'    <div class="full"><span class="lbl">样品数值</span><span class="val">'+escapeHtml(s.test_data||'')+'</span></div>\n'+
'    <div class="pair-row">\n'+
'      <div class="pair"><span class="lbl">制作</span><span class="val"><b>'+escapeHtml(s.signed_by_rd||'')+'</b></span></div>\n'+
'      <div class="pair"><span class="lbl">确认</span><span class="val"><b>'+escapeHtml(s.signed_by_qa||'')+'</b></span></div>\n'+
'    </div>\n'+
'    <div class="full"><span class="lbl">备注</span><span class="val">'+escapeHtml(s.notes||'')+'</span></div>\n'+
'  </div>\n'+
'</div>';
}

// 单卡适配脚本：内容按 155×92px 基准渲染，fitCard() 测量后整卡按纸张 contain 缩放（scale=min(sheetW/cardW,sheetH/cardH)，完整无裁切）
var FIT_SCRIPT_SINGLE =
'function fitCard(){\n'+
'  var sh=document.querySelector(".sheet"),c=document.querySelector(".crd");\n'+
'  var s=Math.min(sh.clientWidth/c.offsetWidth,sh.clientHeight/c.offsetHeight);\n'+
'  c.style.transformOrigin="center";c.style.transform="scale("+s+")";\n'+
'}\n'+
'window.onload=function(){fitCard();setTimeout(function(){window.print()},600);};\n'+
'window.addEventListener("resize",fitCard);\n';

// 批量适配脚本：逐 sheet 测量缩放（同一套 contain 公式），加载完成后一次 window.print
var FIT_SCRIPT_BATCH =
'function fitCards(){\n'+
'  var sheets=document.querySelectorAll(".sheet");\n'+
'  for(var i=0;i<sheets.length;i++){\n'+
'    var sh=sheets[i],c=sh.querySelector(".crd");\n'+
'    var s=Math.min(sh.clientWidth/c.offsetWidth,sh.clientHeight/c.offsetHeight);\n'+
'    c.style.transformOrigin="center";c.style.transform="scale("+s+")";\n'+
'  }\n'+
'}\n'+
'window.onload=function(){fitCards();setTimeout(function(){window.print()},600);};\n'+
'window.addEventListener("resize",fitCards);\n';

// 标示卡打印页（单卡）：纸张尺寸 = 标签空白卡区，页框 + 卡片片段薄封装
function buildCardPrintHtml(s, sizeKey, cw, ch) {
  var g = sheetGeom(sizeKey, cw, ch);
  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>标示卡 '+escapeHtml(s.sample_no)+'</title>\n'+
'<style>\n'+
pageCss(g)+
cardCss()+
'@media print{.size-bar{display:none}body{min-height:0;padding-top:0;justify-content:flex-start}html,body{width:auto;height:auto;overflow:hidden}}\n'+
'</style></head><body>\n'+
sizeBarHtml(g, '')+
'<div class="sheet">\n'+
buildCardFragment(s)+
'\n</div>\n'+
'<script>\n'+
FIT_SCRIPT_SINGLE+
'</script>\n'+
'</body></html>';
}

// 标示卡批量打印页（T17）：单页多卡，每张卡一个 .sheet 并以 page-break-after 分页（@page 尺寸同源），
// 页首保留尺寸说明 + 张数，页尾注明跳过数，加载完成后一次 window.print（替代前端循环 window.open 被浏览器拦截的方案）
function buildBatchCardPrintHtml(samples, sizeKey, cw, ch, skipped) {
  var g = sheetGeom(sizeKey, cw, ch);
  skipped = skipped || 0;
  var sheets = samples.map(function (s, i) {
    var last = i === samples.length - 1;
    // 末张卡不再分页，避免尾部空白页
    return '<div class="sheet'+(last?' last':'')+'">\n'+buildCardFragment(s)+'\n</div>';
  }).join('\n');
  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>标示卡批量打印（'+samples.length+'张）</title>\n'+
'<style>\n'+
pageCss(g)+
'.sheet{page-break-after:always;break-after:page}\n'+
'.sheet.last{page-break-after:auto;break-after:auto}\n'+
cardCss()+
'.batch-footer{padding:8px 10px;font-size:12px;color:#666;font-family:sans-serif;text-align:center}\n'+
'@media print{.size-bar,.batch-footer{display:none}body{min-height:0;padding-top:0;justify-content:flex-start}html,body{width:auto;height:auto;overflow:hidden}}\n'+
'</style></head><body>\n'+
sizeBarHtml(g, '<span style="color:#2563eb;font-size:11px">批量 '+samples.length+' 张</span>')+
sheets+'\n'+
'<div class="batch-footer">共 '+samples.length+' 张标示卡'+(skipped>0?'；跳过 '+skipped+' 个无效/已删除样品':'')+'</div>\n'+
'<script>\n'+
FIT_SCRIPT_BATCH+
'</script>\n'+
'</body></html>';
}

module.exports = { buildCardPrintHtml, buildBatchCardPrintHtml, buildCardFragment, fmtDateUTC };
