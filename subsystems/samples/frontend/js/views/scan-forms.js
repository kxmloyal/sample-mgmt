// subsystems/samples/frontend/js/views/scan-forms.js — 扫码台动作表单构造（2026-09-16 T0 自 scan.js 拆出）
// 外迁原因：scan.js 字符数已达 85.5%（§7.1 越过 70% 预警线 → 按规则 MUST 先等量外迁再挂钩新功能），
// 且批量联扫模式需要在扫码台挂钩，故把「按动作渲染表单 HTML」整体独立成文件，行为零变化。
// 调用点：scan.js 的 renderScanAction（渲染卡片后调用 showScanActionForm）与按钮 onclick（全局作用域同名函数）。
// 依赖均为 bundle 单作用域内的全局符号：e/fmt（shared/frontend）、renderReturnActions（scan-return-actions.js）、
// buildCardFieldTable/applyCardFieldValues（card-fields.js）、initCheckoutUserPicker / initStorageLocPicker、
// previewScanImg / confirmScan（scan.js）。
function showScanActionForm(action){
  var s=window._scanSample;
  var formEl=$('#scan-action-form');
  if(!formEl)return;
  var html='';
  if(action==='PRODUCE'){
    html='<label>制作照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div>'+
      '<label>备注</label><fluent-text-field id="scan-note" placeholder="如：制作完成"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'PRODUCE\',this)">确认制作完成</fluent-button></div>';
  }else if(action==='INSPECT'){
    html='<label>复检照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div><label>备注</label><fluent-text-field id="scan-note" placeholder="如：复检通过"></fluent-text-field>'+
      '<details class="scan-card-more" style="margin-top:10px"><summary>标示卡更新（选填）</summary>'+
      '<p class="muted" style="font-size:11px">复检时可更新版次/测试数据</p>'+
      '<table style="width:100%;font-size:12px"><tr><td style="padding:4px 0;color:#6b7280">版次</td><td><fluent-text-field id="scan-card-ver" value="'+e(s.card_version||'')+'" style="width:100%"></fluent-text-field></td></tr>'+
      '<tr><td style="padding:4px 0;color:#6b7280">测试数据</td><td><textarea id="scan-card-data" rows="2" style="resize:vertical;width:100%">'+e(s.test_data||'')+'</textarea></td></tr></table>'+
      '</details>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'INSPECT\',this)">确认复检完成</fluent-button></div>';
  }else if(action==='INSPECT_CUSTODY'){
    // T8 保管中到期复检：复用 INSPECT 表单结构 + 周期输入框（留空=沿用原周期，后端兜底 400）
    var curCyc=(s&&s.release_cycle_days)?String(s.release_cycle_days):'';
    html='<label>复检照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div>'+
      '<label>复检周期（天）</label><fluent-text-field id="scan-cycle" type="number" min="1" max="3650" placeholder="'+(curCyc?('留空沿用当前 '+e(curCyc)+' 天'):'如 365')+'" style="width:190px"></fluent-text-field>'+
      '<label>复检结论 / 备注</label><fluent-text-field id="scan-note" placeholder="如：复检通过"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'INSPECT_CUSTODY\',this)">确认到期复检</fluent-button></div>';
  }else if(action==='CUSTODY'){
    // 接收保管（2026-09-09 储位选择器）：点选已知格位（空位徽标置顶）+ 自由输入兜底（新柜位首录）
    // 2026-09-10 方案B：新增「🗺 柜位图」按钮——弹柜位图弹窗（左柜列表+右矩阵）点格位直接选储位
    html='<label>保管储位 *</label><div class="co-wrap"><fluent-text-field id="scan-loc" placeholder="点选或输入，如 1#样品柜3-8" onfocus="renderSmCandidates(this.value||\'\')" oninput="renderSmCandidates(this.value||\'\')" onblur="setTimeout(function(){hideSmCandidates();},200)"></fluent-text-field><div id="scan-loc-cand" class="co-cand-panel co-cand-fixed"></div></div>'+
      '<div style="margin-top:8px"><fluent-button appearance="neutral" size="small" onclick="openSmMapPicker()">🗺 柜位图</fluent-button></div>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'CUSTODY\',this)">确认接收保管</fluent-button></div>';
  }else if(action==='CHECKOUT'){
    // 领出表单（2026-09-05）：领用人/部门/领用时长（小时）+ 应还时间实时预览
    // 2026-09-09 方案A：领用人升级为可搜索选择器（系统用户点选自动带部门；手填兜底兼容外来人员）
    // 2026-09-09 增强：候选面板改为输入框右侧弹出（不挤压下方表单）；后端同部门优先+领用频率排序，前端加「同部门/N次」徽标
    // 2026-09-10 防误确认（用户需求）：领用人/部门默认空——必须主动输入或点选候选，防操作员顺手确认把领用人记成自己
    html='<label>领用人 *</label><div class="co-wrap"><fluent-text-field id="scan-co-user" placeholder="必填：点选候选或直接输入" onfocus="renderCoCandidates(this.value||\'\')" oninput="_coPick=null;renderCoCandidates(this.value||\'\')" onblur="setTimeout(function(){hideCoCandidates();},200)"></fluent-text-field><div id="scan-co-cand" class="co-cand-panel co-cand-fixed"></div></div>'+
      '<label>领用部门</label><fluent-text-field id="scan-co-dept" placeholder="选系统用户自动带出，或手填"></fluent-text-field>'+
      '<label>领用时长（小时）*</label><fluent-text-field id="scan-co-hours" type="number" min="1" max="8760" placeholder="如 24" oninput="previewCheckoutDue()"></fluent-text-field>'+
      '<p class="muted" id="scan-co-due" style="font-size:12px;min-height:16px"></p>'+
      '<label>领用备注</label><fluent-text-field id="scan-note" placeholder="如：产线对比测试用"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'CHECKOUT\',this)">确认领出</fluent-button></div>';
  }else if(action==='RETURN_OUT'){
    // 归还表单：展示当前借出信息供核对，备注选填
    html='<p style="font-size:13px">当前领用人：<b>'+e(s.checkout_user||'—')+'</b>（'+e(s.checkout_dept||'—')+'）</p>'+
      '<p class="muted" style="font-size:12px">领出于 '+fmt(s.checkout_at)+' · 应还 '+fmt(s.expected_return_at)+(s.expected_return_at&&new Date(s.expected_return_at).getTime()<Date.now()?' <b style="color:var(--bad)">（已超时）</b>':'')+'</p>'+
      '<label>归还备注</label><fluent-text-field id="scan-note" placeholder="如：外观无异常，已归还"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'RETURN_OUT\',this)">确认归还入库</fluent-button></div>';
  }else if(action==='EDIT_CARD'){
    html=buildCardFieldTable(s,true)+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'EDIT_CARD\',this)">保存修正 + 打印标示卡</fluent-button></div>';
  }else if(action==='EDIT_STORAGE'){
    // 修改储位（2026-09-09 储位选择器）：同款点选候选，顺手统一历史脏数据（空格错版被规范值替代）
    // 2026-09-10 方案B：新增「🗺 柜位图」按钮
    // 2026-09-10 防误确认（用户需求）：新储位默认空——当前储位仅上方展示供核对，必须主动输入/点选，防「储位不动」零动作提交
    html='<label>当前储位</label><p class="muted">'+e(s.storage_location||'未设置')+'</p>'+
      '<label>新储位 *</label><div class="co-wrap"><fluent-text-field id="scan-loc" data-cur="'+e(s.storage_location||'')+'" placeholder="必填：点选候选 / 柜位图 / 直接输入" onfocus="renderSmCandidates(this.value||\'\')" oninput="renderSmCandidates(this.value||\'\')" onblur="setTimeout(function(){hideSmCandidates();},200)"></fluent-text-field><div id="scan-loc-cand" class="co-cand-panel co-cand-fixed"></div></div>'+
      '<div style="margin-top:8px"><fluent-button appearance="neutral" size="small" onclick="openSmMapPicker()">🗺 柜位图</fluent-button></div>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'EDIT_STORAGE\',this)">确认修改储位</fluent-button></div>';
  }else if(action==='RETURN_REQUEST'){
    html='<label>退回原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述样品存在的问题"></textarea>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#f59e0b" onclick="confirmScan(\'RETURN_REQUEST\',this)">提交退回申请</fluent-button></div>';
  }else{
    html=renderReturnActions(action,s);
    if(!html){formEl.innerHTML='';return;}
  }
  formEl.innerHTML=html;
  // innerHTML 注入的 selected 属性不生效，需显式回显下拉值
  if(action==='EDIT_CARD')applyCardFieldValues(s);
  // 方案A：领用表单渲染完成后初始化领用人候选（拉用户列表+绑定过滤事件；失败静默降级纯手填）
  if(action==='CHECKOUT'&&typeof initCheckoutUserPicker==='function')initCheckoutUserPicker();
  // 2026-09-09：储位表单渲染后初始化格位候选（接收保管/修改储位共用；失败静默降级纯手填）
  if((action==='CUSTODY'||action==='EDIT_STORAGE')&&typeof initStorageLocPicker==='function')initStorageLocPicker();
}
