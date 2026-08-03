// routes/card-page.js — 匿名数字标示卡页面
const D = require('../../../db');
const { SOURCE_TYPES } = require('./card-constants');

function fmtCard(t) {
  if (!t) return '—';
  const d = new Date(t);
  return d.toLocaleString('zh-CN', { hour12: false });
}

async function cardPageHtml(s) {
  const logs = (await D.listLogsBySample(s.id) || []).slice(0, 2);
  const sourceLabel = SOURCE_TYPES[s.source_type] || s.source_type || '—';
  const typeBadge = s.sample_type === 'OK' ? '<span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">OK样品</span>'
    : s.sample_type === 'NG' ? '<span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">NG样品</span>' : '';
  const now = new Date();
  const expired = s.valid_until && new Date(s.valid_until) < now;
  const validClass = expired ? 'color:#dc2626;font-weight:700' : '';

  let logsHtml = '';
  if (logs.length) {
    logsHtml = '<div class="divider"></div>\n' +
    '  <div class="section-title">最近操作</div>\n' +
    logs.map(l=>
      '<div class="log-item">' + fmtCard(l.created_at) + ' \u00b7 ' + l.action + ' \u00b7 ' + (l.role||'') + '/' + (l.dept||'') + '</div>'
    ).join('\n');
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>标示卡 ${s.sample_no}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f0f2f5;color:#1a1a1a;line-height:1.5;min-height:100vh}
.card-wrap{max-width:480px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb}
.card-header h2{font-size:18px;font-weight:700;color:#1e293b}
.row{display:flex;margin-bottom:10px;font-size:14px}
.row .lbl{color:#64748b;width:80px;flex-shrink:0;font-size:13px}
.row .val{flex:1;word-break:break-all}
.divider{margin:14px 0;border-top:1px dashed #e5e7eb}
.section-title{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.log-item{font-size:12px;color:#64748b;padding:4px 0;border-bottom:1px solid #f1f5f9}
.log-item:last-child{border-bottom:none}
.footer{text-align:center;color:#94a3b8;font-size:11px;margin-top:20px;padding-top:12px;border-top:1px solid #f1f5f9}
.badge-expired{background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
@media(min-width:768px){
  .card-wrap{padding:32px 16px}
  .card{padding:28px}
}
</style></head><body>
<div class="card-wrap">
<div class="card">
  <div class="card-header">
    <h2>${s.sample_no}</h2>
    ${typeBadge}
  </div>
  <div class="row"><span class="lbl">样品名称</span><span class="val">${s.name||'—'}</span></div>
  <div class="row"><span class="lbl">项目</span><span class="val">${s.limit_item||'—'}</span></div>
  <div class="row"><span class="lbl">来源</span><span class="val">${sourceLabel}</span></div>
  <div class="row"><span class="lbl">版次</span><span class="val">${s.card_version||'—'}</span></div>
  <div class="row"><span class="lbl">样品数值</span><span class="val">${s.test_data||'—'}</span></div>
  <div class="row"><span class="lbl">有效期</span><span class="val" style="${validClass}">${s.valid_until?fmtCard(s.valid_until):'—'}${expired?' <span class="badge-expired">已过期</span>':''}</span></div>
  <div class="divider"></div>
  <div class="section-title">签署</div>
  <div class="row"><span class="lbl">制作</span><span class="val">${s.signed_by_rd||'—'}</span></div>
  <div class="row"><span class="lbl">确认</span><span class="val">${s.signed_by_qa||'—'}</span></div>
  <div class="divider"></div>
  <div class="section-title">规格/型号</div>
  <div class="row"><span class="lbl">机型</span><span class="val">${s.model||'—'}</span></div>
  <div class="row"><span class="lbl">站别</span><span class="val">${s.station||'—'}</span></div>
  <div class="row"><span class="lbl">规格</span><span class="val">${s.spec||'—'}</span></div>
  ${logsHtml}
  <div class="divider"></div>
  <div class="footer">此卡供现场参照，系统内可查看更多信息</div>
</div>
</div>
</body></html>`;

  return html;
}

module.exports = { cardPageHtml };
