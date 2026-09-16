// subsystems/samples/frontend/js/views/scan-payload.js — 扫码台表单载荷收集（2026-09-16 自 scan.js 拆出）
// 背景：scan.js 字符数达 96.6%（§7.1 达 90% 仅允许精简），故把「表单取值 + 前端软校验 + 载荷组装」独立成文件。
// 依赖均为 bundle 单作用域内的全局符号：toast/fmt（shared）、_coPick（checkout-user-picker.js）、
// wizardSample（scan-wizard.js）；调用点仍在 scan.js（confirmScan 及各表单 oninput）。
// T8: 收集 INSPECT_CUSTODY 复检周期——留空=沿用原周期；填写则前端软校验 1~3650 整数（后端仍兜底 400）
// 返回 false 表示校验失败（已 toast），调用方中止提交
function collectCustodyCycle(body){
  var el=document.getElementById('scan-cycle');
  var v=el&&el.value?el.value.trim():'';
  if(!v)return true;
  var n=Number(v);
  if(!Number.isInteger(n)||n<1||n>3650){toast('复检周期须为 1~3650 天的整数（留空则沿用原周期）','err');return false;}
  body.cycleDays=n;return true;
}
// 领用（2026-09-05）：应还时间实时预览——时长输入变化时计算 now+时长 并回显
function previewCheckoutDue(){
  var el=document.getElementById('scan-co-hours');
  var tip=document.getElementById('scan-co-due');
  if(!el||!tip)return;
  var n=Number(el.value);
  if(!el.value||!Number.isInteger(n)||n<1||n>8760){tip.textContent='';return;}
  var due=new Date(Date.now()+n*3600000);
  tip.textContent='预计应还时间：'+fmt(due.toISOString())+'（'+n+' 小时后）';
}
// 收集 CHECKOUT 表单：领用人必填、时长前端软校验 1~8760 整数（后端仍兜底 400）
// 方案A：领用人点选过系统用户且部门未手改时，提交前以候选部门兜底（防中途清空）；手改/手填完全以输入为准
// 返回 false 表示校验失败（已 toast），调用方中止提交
function collectCheckoutPayload(body){
  var uEl=document.getElementById('scan-co-user');
  var dEl=document.getElementById('scan-co-dept');
  var hEl=document.getElementById('scan-co-hours');
  var user=uEl&&uEl.value?uEl.value.trim():'';
  if(!user){toast('请填写领用人','err');return false;}
  var hours=hEl&&hEl.value?Number(hEl.value.trim()):NaN;
  if(!Number.isInteger(hours)||hours<1||hours>8760){toast('领用时长须为 1~8760 小时的整数','err');return false;}
  body.checkout_user=user;
  if(dEl&&dEl.value.trim())body.checkout_dept=dEl.value.trim();
  else if(_coPick&&_coPick.dept)body.checkout_dept=_coPick.dept; // 点选用户但部门被清空 → 回落候选部门
  body.durationHours=hours;
  return true;
}
// 从向导状态收集 RELEASE/RE_RELEASE 公共字段（去重：原两分支字段完全相同）
function collectWizardPayload(body){
  body.cycleDays=(wizardSample&&wizardSample._wizCycle?wizardSample._wizCycle:'365');
  body.sample_type=wizardSample&&wizardSample._wizCardType?wizardSample._wizCardType:'';
  body.limit_item=wizardSample&&wizardSample._wizCardItem?wizardSample._wizCardItem:'';
  if(wizardSample&&wizardSample._wizCardSource)body.source_type=wizardSample._wizCardSource;
  if(wizardSample&&wizardSample._wizCardVersion)body.card_version=wizardSample._wizCardVersion;
  if(wizardSample&&wizardSample._wizCardData)body.test_data=wizardSample._wizCardData;
  if(wizardSample&&wizardSample._wizCardStandard)body.test_standard=wizardSample._wizCardStandard;
}
