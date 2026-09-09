// views/project-detail-modal.js — 项目详情弹窗（2026-09-08 借共享 detail-modal.js 架构，方案B）
// 入口：项目列表卡片点击（原跳列表行为保留：点「任务」按钮跳，点卡片其它区域出弹窗）
// 内容：信息/成员/任务统计 三 Tab；复用 DENSITY/dirty/骨架 屏（detail-modal.js 内建）
var _pjd = null; // 当前弹窗实例

function openProjectDetail(pid) {
  _pjd = openDetailModal({
    id: 'project-' + pid,
    fetchData: async function () {
      // 并行拉：项目主数据 + 成员 + 项目任务 + 里程碑（当前阶段派生） + 预算/效益扩展
      const [p, members, tasks, milestones, extras] = await Promise.all([
        api('GET', PApi.projects(pid)),
        api('GET', PApi.projects(pid) + '/members').catch(function () { return []; }),
        api('GET', PApi.projectTasks(pid)).catch(function () { return []; }),
        api('GET', PApi.milestones(pid)).catch(function () { return []; }),
        api('GET', PApi.extras(pid)).catch(function () { return null; })
      ]);
      return { project: p, members: members, tasks: tasks, milestones: milestones, extras: extras };
    },
    buildHead: function (d) {
      const p = d.project;
      const st = p.status === 'DONE' ? '<span class="pk-tag done">已完成</span>' : '<span class="pk-tag active">进行中</span>';
      return '<b>' + esc(p.name) + '</b> ' + st;
    },
    tabs: function (d) {
      return [
        { key: 'info', label: '信息', enabled: true },
        { key: 'members', label: '成员', enabled: true },
        { key: 'tasks', label: '任务统计', enabled: true }
      ];
    },
    density: function (key) { return key === 'info' ? 'd-high' : 'd-mid'; },
    buildTabContent: function (d, key) {
      const p = d.project;
      if (key === 'info') {
        // 当前阶段派生：最早一个未达成里程碑（只读派生，不动表；无里程碑显示 —）
        const pending = (d.milestones || []).filter(function (m) { return !m.achieved; })
          .sort(function (a, b) { return String(a.target_date || '').localeCompare(String(b.target_date || '')); });
        const phase = pending.length ? esc(pending[0].name) : (d.milestones.length ? '全部达成' : '—');
        const ex = d.extras;
        return '<div class="overview-cards">' +
          '<div class="overview-card"><div class="title">任务进度</div><div style="font-size:20px;font-weight:700">' + p.done_count + '<span style="font-size:13px;color:#64748b">/' + p.task_count + '</span></div>' +
          '<div class="pk-progress" style="margin-top:6px"><span class="pk-progress-bar" style="width:' + (p.task_count ? Math.round(p.done_count / p.task_count * 100) : 0) + '%"></span></div></div>' +
          '<div class="overview-card"><div class="title">当前阶段</div><div style="font-size:15px;font-weight:600;margin-top:4px">' + phase + '</div>' +
          (pending.length ? '<div class="muted" style="font-size:12px;margin-top:2px">目标 ' + fmt(pending[0].target_date) + '</div>' : '') + '</div>' +
          '<div class="overview-card"><div class="title">预算 / 成本 / 效益</div><div style="font-size:13px;margin-top:4px">' +
          '预算：<b>' + (ex && ex.budget != null ? '¥' + Number(ex.budget).toLocaleString() : '—') + '</b> · 实际：' + (ex && ex.actual_cost != null ? '¥' + Number(ex.actual_cost).toLocaleString() : '—') + '<br>' +
          '<span class="muted">预期效益：' + (ex && ex.expected_benefit ? esc(ex.expected_benefit) : '—') + '</span>' +
          (ex && ex.benefit_note ? '<br><span class="muted">实际效益：' + esc(ex.benefit_note) + '</span>' : '') +
          '</div><div style="margin-top:6px"><fluent-button appearance="secondary" size="small" onclick="pjdExtras(' + p.id + ')">编辑预算/效益</fluent-button></div></div>' +
          '<div class="overview-card"><div class="title">描述</div><div style="font-size:13px;min-height:36px">' + esc(p.description || '—') + '</div></div>' +
          '<div class="overview-card"><div class="title">创建时间</div><div style="font-size:13px">' + fmt(p.created_at) + '</div></div>' +
          '</div>' +
          '<div class="pk-filters" style="margin-top:12px">' +
          '<fluent-button appearance="secondary" size="small" onclick="_pjdGoTasks(' + p.id + ')">查看任务列表</fluent-button>' +
          '<fluent-button appearance="secondary" size="small" onclick="_pjdGoKanban(' + p.id + ')">打开任务看板</fluent-button>' +
          '<fluent-button appearance="secondary" size="small" onclick="projEdit(' + p.id + ')">编辑项目</fluent-button>' +
          '<fluent-button appearance="secondary" size="small" onclick="projMembers(' + p.id + ')">管理成员</fluent-button></div>';
      }
      if (key === 'members') {
        const ms = d.members || [];
        if (!ms.length) return '<div class="muted" style="padding:16px 0">暂无成员</div>';
        return '<div class="pk-row" style="font-weight:600;border-bottom:1px solid #f1f5f9"><span class="pk-name">姓名</span><span>部门</span><span>角色</span></div>' +
          ms.map(m => '<div class="pk-row"><span class="pk-name">' + esc(m.display_name || ('#' + m.user_id)) + (m.is_owner ? ' <span class="pk-tag done">owner</span>' : '') + '</span>' +
          '<span>' + esc(m.dept || '—') + '</span><span class="muted">' + esc(ROLE_CN[m.role] || m.role || '—') + '</span></div>').join('');
      }
      if (key === 'tasks') {
        const ts = d.tasks || [];
        if (!ts.length) return '<div class="muted" style="padding:16px 0">暂无任务</div>';
        const by = {};
        ts.forEach(t => { const k = t.status_eff || t.status; (by[k] = by[k] || []).push(t); });
        const heads = '<div class="pk-row" style="font-weight:600;border-bottom:1px solid #f1f5f9"><span class="pk-name">任务</span><span>责任人</span><span>状态</span><span>计划日</span></div>';
        // 超过 30 条只统计 + 提示去列表看全量（弹窗内不做长列表）
        if (ts.length > 30) {
          return '<div style="margin-bottom:10px">' + Object.keys(by).map(k =>
            '<span class="pk-tag ' + (k === 'DONE' ? 'done' : k === 'OVERDUE' ? 'overdue' : 'active') + '" style="margin-right:6px">' + (TASK_STATUS_CN[k] || k) + ' ' + by[k].length + '</span>').join(' ') + '</div>' +
            '<div class="muted">任务较多（' + ts.length + ' 条），<a class="link" onclick="_pjdGoTasks(' + p.id + ')" style="cursor:pointer">去任务列表查看全量 →</a></div>' +
            heads + ts.slice(0, 10).map(t => _pjdTaskRow(t)).join('');
        }
        return heads + ts.map(t => _pjdTaskRow(t)).join('');
      }
      return '';
    },
    footer: function (d) {
      return '<fluent-button appearance="neutral" size="small" onclick="_pjd.close()">关闭</fluent-button>';
    },
    toast: showToast
  });
  _pjd.open(pid);
}
// 任务行渲染（弹窗内复用）
function _pjdTaskRow(t) {
  const st = t.status_eff || t.status;
  const cls = st === 'DONE' ? 'done' : st === 'OVERDUE' ? 'overdue' : st === 'IN_PROGRESS' ? 'active' : '';
  return '<div class="pk-row"><span class="pk-name" style="cursor:pointer" onclick="_pjdGoTask(' + t.id + ')">' + esc(t.title.length > 18 ? t.title.slice(0, 18) + '…' : t.title) + '</span>' +
    '<span>' + esc(t.assignee_name || '未指派') + '</span>' +
    '<span><span class="pk-tag ' + cls + '">' + (TASK_STATUS_CN[st] || st) + '</span></span>' +
    '<span class="muted">' + fmt(t.planned_date) + '</span></div>';
}
// 弹窗内跳转（关弹窗 + 深链）
function _pjdGoTasks(pid) { if (_pjd) _pjd.close(); location.hash = '#/list?project=' + pid; }
function _pjdGoKanban(pid) { if (_pjd) _pjd.close(); location.hash = '#/kanban?project=' + pid; }
function _pjdGoTask(tid) { if (_pjd) _pjd.close(); location.hash = '#/tasks/' + tid; }

// 预算/效益编辑弹窗（设备导入 2026-09-08；保存走既有 PUT /extras，权限 ADMIN/PM/owner 后端校验）
async function pjdExtras(pid) {
  const ex = await api('GET', PApi.extras(pid)).catch(function () { return {}; });
  openModal('预算 / 成本 / 效益',
    '<div class="pk-form">' +
    '<label>预算（元）</label><fluent-text-field id="pjx-budget" value="' + (ex.budget != null ? ex.budget : '') + '"></fluent-text-field>' +
    '<label>实际成本（元）</label><fluent-text-field id="pjx-cost" value="' + (ex.actual_cost != null ? ex.actual_cost : '') + '"></fluent-text-field>' +
    '<label>预期效益（年节约/产能提升等）</label><fluent-text-area id="pjx-eb">' + esc(ex.expected_benefit || '') + '</fluent-text-area>' +
    '<label>实际效益备注（验收后填写）</label><fluent-text-area id="pjx-bn">' + esc(ex.benefit_note || '') + '</fluent-text-area>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="pjdExtrasSave(' + pid + ')">保存</fluent-button>' +
        '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function pjdExtrasSave(pid) {
  const budget = $('#pjx-budget').value.trim();
  const cost = $('#pjx-cost').value.trim();
  if ((budget && (!isFinite(Number(budget)) || Number(budget) < 0)) || (cost && (!isFinite(Number(cost)) || Number(cost) < 0)))
    return showToast('金额须为非负数字', 'err');
  try {
    await api('PUT', PApi.extras(pid), {
      budget: budget === '' ? null : Number(budget),
      actual_cost: cost === '' ? null : Number(cost),
      expected_benefit: $('#pjx-eb').value.trim(),
      benefit_note: $('#pjx-bn').value.trim()
    });
    showToast('已保存');
    pCloseModal();
    if (_pjd) _pjd.reload(); // 重读信息卡（openDetailModal 内建 reload）
  } catch (e) { showToast(e.message, 'err'); }
}
