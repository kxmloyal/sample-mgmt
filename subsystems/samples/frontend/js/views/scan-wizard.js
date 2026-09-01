// scan-wizard.js — RELEASE 分步向导（依赖 card-fields.js 的 buildCardFieldTable）
// 计算下一个版次号（与后端逻辑一致）
function nextCardVersion(c){var m=String(c||'').match(/\d+/);var n=m?parseInt(m[0],10):0;return String(Math.min(n+1,99)).padStart(2,'0');}
var wizardSample=null; // 当前向导的样品数据

// 向导进行期间锁定编号输入框（防正待确认时被扫码枪误改导致张冠李戴）
function lockScanCode(no){
  var sc=$('#scan-code');if(!sc)return;
  sc.value=no;sc.readOnly=true;
  // 钩住「取消/继续扫码」复位入口，向导退出时解锁（afterScanReset 定义在 scan-camera.js）
  if(!window._wizResetHooked&&typeof window.afterScanReset==='function'){
    window._wizResetHooked=true;
    var _origAfterScanReset=window.afterScanReset;
    window.afterScanReset=function(){unlockScanCode();_origAfterScanReset();};
  }
}
function unlockScanCode(){
  var sc=$('#scan-code');if(sc)sc.readOnly=false;
}

function buildReleaseWizard(s,isReRelease){
  wizardSample=s;
  wizardSample._isReRelease=isReRelease||false;
  lockScanCode(s.sample_no);
  return renderWizardStep1(s);
}

function renderWizardStep1(s){
  var cycle=s._wizCycle||'365';
  var nextDate=new Date(Date.now()+parseInt(cycle)*864e5).toISOString().slice(0,10);
  return '<div class="wizard-steps">'+
      '<span class="wdot active">1</span><span class="wline"></span>'+
      '<span class="wdot">2</span><span class="wline"></span>'+
      '<span class="wdot">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<label>复检周期（天）<b class="required">*</b></label>'+
      '<fluent-text-field id="scan-cycle" type="number" min="1" value="'+cycle+'" placeholder="如 365" oninput="updateWizardNextDate()" style="width:100px;text-align:center"></fluent-text-field>'+
      '<span class="muted" style="margin-left:8px;font-size:12px" id="wiz-next-date">→ 下次复检：'+nextDate+'</span>'+
    '</div>'+
    '<div style="text-align:right;margin-top:14px">'+
      '<fluent-button appearance="accent" size="small" onclick="goWizardStep(2)">下一步：填写标示卡 →</fluent-button>'+
    '</div>'
  ;
}
function updateWizardNextDate(){
  var days=parseInt($('#scan-cycle').value)||365;
  var d=new Date(Date.now()+days*864e5).toISOString().slice(0,10);
  var el=document.getElementById('wiz-next-date');if(el)el.textContent='→ 下次复检：'+d;
}

function renderWizardStep2(s){
  // 版次默认值：已填写过则回显用户值，否则 RE_RELEASE 自动 +1 / 新发行取 '01'
  var verDefault=s._wizCardVersion||(s._isReRelease?nextCardVersion(s.card_version):(s.card_version||'01'));
  return '<div class="wizard-steps">'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot active">2</span><span class="wline"></span>'+
      '<span class="wdot">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<div class="scan-section-title">标示卡审查</div>'+
      buildCardFieldTable(s,true,verDefault)+
      '<div class="muted" style="font-size:12px;margin-top:6px">品保确认人：<b>'+e(me.display_name||me.username)+'</b>（自动签署）</div>'+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:14px">'+
      '<fluent-button appearance="neutral" size="small" onclick="goWizardStep(1)">← 上一步</fluent-button>'+
      '<fluent-button appearance="accent" size="small" onclick="goWizardStep(3)">下一步：确认发行 →</fluent-button>'+
    '</div>'
  ;
}

function renderWizardStep3(s){
  var cycle=s._wizCycle||'365';
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
      '<fluent-button appearance="accent" id="scan-confirm" onclick="confirmScan(\''+confirmAction+'\',this)"'+
        (!ok?' disabled':'')+'>'+confirmLabel+'</fluent-button>'+
    '</div>'
  ;
}

function goWizardStep(step){
  var s=wizardSample;if(!s)return;
  // 离开Step1前持久化复检周期值（后续step中DOM元素已被替换）
  if(step>1){var cyc=$('#scan-cycle');if(cyc)s._wizCycle=cyc.value;}
  // 从 Step3 返回 Step2：将已填标示卡字段回写原始字段，供 buildCardFieldTable 回显（修复返回修改丢字段）
  if(step===2&&s._wizCardType){
    s.sample_type=s._wizCardType;
    s.limit_item=s._wizCardItem;
    if(s._wizCardSource)s.source_type=s._wizCardSource;
    if(s._wizCardVersion)s.card_version=s._wizCardVersion;
    if(s._wizCardData)s.test_data=s._wizCardData;
    // 标准范围允许空值回写（RD 可能未填），仅当已进入过 Step3 时覆盖
    if(s._wizCardStandard!==undefined)s.test_standard=s._wizCardStandard;
  }
  if(step===3){
    // 离开Step2前持久化标示卡字段值（Step3 DOM中这些元素已不存在）
    var tEl=$('#scan-card-type'),lEl=$('#scan-card-item');
    var t=tEl?tEl.value:'',l=lEl?lEl.value:'';
    if(!t||!l){toast('请填写样品类型和限度项目（必填）','err');return;}
    s._wizCardType=t;s._wizCardItem=l;
    var srcEl=$('#scan-card-source');s._wizCardSource=srcEl?srcEl.value:'';
    var verEl=$('#scan-card-ver');s._wizCardVersion=verEl?verEl.value.trim():'';
    var dataEl=$('#scan-card-data');s._wizCardData=dataEl?dataEl.value.trim():'';
    var stdEl=$('#scan-card-standard');s._wizCardStandard=stdEl?stdEl.value.trim():'';
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
  // innerHTML 注入的 selected 属性不生效，需显式回显下拉值
  if(step===2)applyCardFieldValues(s);
}
