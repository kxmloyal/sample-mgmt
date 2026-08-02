// scan-wizard.js — RELEASE 分步向导（依赖 card-fields.js 的 buildCardFieldTable）
// 计算下一个版次号（与后端逻辑一致）
function nextCardVersion(c){var m=String(c||'').match(/\d+/);var n=m?parseInt(m[0],10):0;return String(Math.min(n+1,99)).padStart(2,'0');}
var wizardSample=null; // 当前向导的样品数据

function buildReleaseWizard(s,isReRelease){
  wizardSample=s;
  wizardSample._isReRelease=isReRelease||false;
  return renderWizardStep1(s);
}

function renderWizardStep1(s){
  var cycle=s._wizCycle||'90';
  var nextDate=new Date(Date.now()+parseInt(cycle)*864e5).toISOString().slice(0,10);
  return '<div class="wizard-steps">'+
      '<span class="wdot active">1</span><span class="wline"></span>'+
      '<span class="wdot">2</span><span class="wline"></span>'+
      '<span class="wdot">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<label>复检周期（天）<b class="required">*</b></label>'+
      '<input id="scan-cycle" type="number" min="1" value="'+cycle+'" placeholder="如 90" oninput="updateWizardNextDate()" style="width:100px;text-align:center"/>'+
      '<span class="muted" style="margin-left:8px;font-size:12px" id="wiz-next-date">→ 下次复检：'+nextDate+'</span>'+
    '</div>'+
    '<div style="text-align:right;margin-top:14px">'+
      '<fluent-button appearance="accent" size="small" onclick="goWizardStep(2)">下一步：填写标示卡 →</fluent-button>'+
    '</div>'
  ;
}
function updateWizardNextDate(){
  var days=parseInt($('#scan-cycle').value)||90;
  var d=new Date(Date.now()+days*864e5).toISOString().slice(0,10);
  var el=document.getElementById('wiz-next-date');if(el)el.textContent='→ 下次复检：'+d;
}

function renderWizardStep2(s){
  return '<div class="wizard-steps">'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot active">2</span><span class="wline"></span>'+
      '<span class="wdot">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<div class="scan-section-title">标示卡审查</div>'+
      buildCardFieldTable(s,true,(s._isReRelease?nextCardVersion(s.card_version):(s.card_version||'01')))+
      '<div class="muted" style="font-size:12px;margin-top:6px">品保确认人：<b>'+e(me.display_name||me.username)+'</b>（自动签署）</div>'+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:14px">'+
      '<fluent-button appearance="neutral" size="small" onclick="goWizardStep(1)">← 上一步</fluent-button>'+
      '<fluent-button appearance="accent" size="small" onclick="goWizardStep(3)">下一步：确认发行 →</fluent-button>'+
    '</div>'
  ;
}

function renderWizardStep3(s){
  var cycle=s._wizCycle||'90';
  var t=s._wizCardType||'',l=s._wizCardItem||'';
  var ok=t&&l;
  var confirmAction=s._isReRelease?'RE_RELEASE':'RELEASE';
  var confirmLabel=s._isReRelease?'确认重新发行（品保）':'确认正式发行（品保）';
  return '<div class="wizard-steps">'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot active">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<table style="width:100%;font-size:12px">'+
        '<tr><td style="color:#6b7280;padding:3px 0">复检周期</td><td>'+cycle+' 天 → 下次复检 '+new Date(Date.now()+parseInt(cycle)*864e5).toISOString().slice(0,10)+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">样品类型</td><td>'+(t||'<span style="color:#dc2626">未填写</span>')+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">限度项目</td><td>'+(l||'<span style="color:#dc2626">未填写</span>')+'</td></tr>'+
      '</table>'+
      (!ok?'<p style="color:#dc2626;font-size:11px;margin-top:8px">⚠ 标示卡必填字段未完成，请返回 Step2 补填</p>':'')+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:14px">'+
      '<fluent-button appearance="neutral" size="small" onclick="goWizardStep(2)">← 返回修改</fluent-button>'+
      '<fluent-button appearance="accent" id="scan-confirm" onclick="confirmScan(\''+confirmAction+'\')"'+
        (!ok?' disabled':'')+'>'+confirmLabel+'</fluent-button>'+
    '</div>'
  ;
}

function goWizardStep(step){
  var s=wizardSample;if(!s)return;
  // 离开Step1前持久化复检周期值（后续step中DOM元素已被替换）
  if(step>1){var cyc=$('#scan-cycle');if(cyc)s._wizCycle=cyc.value;}
  if(step===3){
    // 离开Step2前持久化标示卡字段值（Step3 DOM中这些元素已不存在）
    var tEl=$('#scan-card-type'),lEl=$('#scan-card-item');
    var t=tEl?tEl.value:'',l=lEl?lEl.value:'';
    if(!t||!l){toast('请填写样品类型和限度项目（必填）','err');return;}
    s._wizCardType=t;s._wizCardItem=l;
    var srcEl=$('#scan-card-source');s._wizCardSource=srcEl?srcEl.value:'';
    var verEl=$('#scan-card-ver');s._wizCardVersion=verEl?verEl.value.trim():'';
    var dataEl=$('#scan-card-data');s._wizCardData=dataEl?dataEl.value.trim():'';
  }
  var html;
  if(step===1)html=renderWizardStep1(s);
  else if(step===2)html=renderWizardStep2(s);
  else if(step===3)html=renderWizardStep3(s);
  else return;
  var box=$('#scan-result');
  // 仅替换表单区域，保留样品头部信息（编号/名称/规格/储位等）
  var formEl=box.querySelector('#scan-action-form');
  if(formEl)formEl.innerHTML=html;
}
