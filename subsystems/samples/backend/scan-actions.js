// scan-actions.js — 扫码状态机 action 执行器（T11b 自 routes-scan.js 拆分，行为零变化）
// 返回值约定：
//   { status, error }  由路由直接回 HTTP 错误
//   { logData }        交由路由主事务 updateSample(CAS) + addLog 原子提交
//   { respond }        action 已自行完成事务与响应数据（RECREATE）

// 计算下一个版次号
// 规则：存储为字符串 "01"~"99"（两位整数，padStart 补零）
// 兼容旧格式 V1.0/A1 等取首个数字部分 +1；无数字时从 "01" 开始
// 上限 99，到达后保持 99 不再递增
function nextCardVersion(current) {
  const m = String(current||'').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return String(Math.min(n + 1, 99)).padStart(2, '0');
}

// 生成 YYYYMMDD-HHmmss 时间戳（本地时区），用于复检照片文件名时间戳化、避免多次复检互相覆盖
function tsStamp(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

// 解析复检周期：显式传入时须为 1~3650 的整数；未传沿用样品原周期；原周期也为空则提示必填
// （T3 起禁止 || 90 之类的静默兜底，避免错误周期悄悄入库）
function resolveCycleDays(cycleDays, fallback) {
  if (cycleDays !== undefined && cycleDays !== null && String(cycleDays).trim() !== '') {
    const n = Number(cycleDays);
    if (!Number.isInteger(n) || n < 1 || n > 3650) return { error: '复检周期须为 1~3650 天的整数' };
    return { cyc: n };
  }
  const f = Number(fallback);
  if (Number.isInteger(f) && f >= 1 && f <= 3650) return { cyc: f };
  return { error: '请填写复检周期（天）' };
}

// 校验 EDIT_CARD 人工修改的版次：须为 01~99 的数字，且不得低于当前版次（防降级/置空/篡改，label-card-standard §2.5）
// 合法返回 null，非法返回错误文案
function validateCardVersion(input, current) {
  const v = String(input).trim();
  if (!/^\d{1,2}$/.test(v)) return '版次须为 01~99 的数字';
  const n = parseInt(v, 10);
  const m = String(current || '').match(/\d+/);
  const cur = m ? parseInt(m[0], 10) : 0;
  if (n < 1 || n > 99) return '版次须为 01~99 的数字';
  if (n < cur) return '版次不得低于当前版次（当前：' + (current || '01') + '）';
  return null;
}

// INSPECT / INSPECT_CUSTODY 共用复检逻辑（§15 禁止复制粘贴，差异点由 opts 注入）：
// 校验并保存复检照片 → 解析周期 → 顺延 next_inspect_at/valid_until → 可选版次自动 +1 → 可选状态自环
// opts: { photoName 照片文件名基名, bumpVersion 版次自动 +1, keepStatus 状态自环, saveImage 图片保存函数 }
// 返回 { status, error }（路由直接回 HTTP）或 { cyc }（成功，updated 已被就地改写）
async function applyInspect(req, s, updated, ts, opts) {
  const img = req.body.image;
  if (!img || typeof img !== 'string') return { status: 400, error: '请上传复检照片' };
  const inspImgUrl = await opts.saveImage(img, opts.photoName);
  if (!inspImgUrl) return { status: 500, error: '复检照片保存失败，请重试' };
  const r = resolveCycleDays(req.body.cycleDays, s.release_cycle_days);
  if (r.error) return { status: 400, error: r.error };
  const d = new Date(ts); d.setUTCDate(d.getUTCDate() + r.cyc);
  updated.inspect_image = inspImgUrl;
  updated.next_inspect_at = d.toISOString();
  updated.valid_until = updated.next_inspect_at;
  if (opts.keepStatus) updated.status = opts.keepStatus;
  const { card_version, test_data } = req.body || {};
  if (opts.bumpVersion) updated.card_version = nextCardVersion(s.card_version);
  else if (card_version) updated.card_version = card_version;
  if (test_data) updated.test_data = test_data;
  return { cyc: r.cyc };
}

// 发行/重新发行共用的字段填充（sample_type/limit_item 必填校验 + 周期顺延 + 标示卡字段）
// typeErrMsg：发行与重新发行的样品类型报错文案不同，由调用方传入（保持行为零变化）
// 返回 { status, error } 或 null（成功，updated 已就地改写）
function applyReleaseFields(req, s, updated, ts, cyc, typeErrMsg) {
  const { sample_type, limit_item, source_type, card_version, test_standard, test_data } = (req.body || {});
  if (!sample_type || !sample_type.trim()) return { status: 400, error: typeErrMsg };
  if (!limit_item || !limit_item.trim()) return { status: 400, error: '请选择限度项目' };
  const d = new Date(ts); d.setUTCDate(d.getUTCDate() + cyc);
  updated.status = 'RELEASED';
  updated.released_at = ts;
  updated.release_cycle_days = cyc;
  updated.next_inspect_at = d.toISOString();
  updated.valid_until = updated.next_inspect_at;
  updated.sample_type = sample_type.trim();
  updated.limit_item = limit_item.trim();
  if (source_type) updated.source_type = source_type.trim();
  updated.card_version = (card_version && card_version.trim()) || (s ? nextCardVersion(s.card_version) : '01');
  if (test_standard) updated.test_standard = test_standard.trim();
  if (test_data) updated.test_data = test_data.trim();
  return null;
}

// action 执行入口：按 chosenAction 就地改写 updated 并给出 logData/respond
// ctx: { req, s, updated, ts, u, D, saveSampleImage }
async function applyAction(chosenAction, ctx) {
  const { req, s, updated, ts, u, D, saveSampleImage } = ctx;
  const { location, cycleDays, note } = req.body || {};
  var logData = null;

  if (chosenAction === 'PRODUCE') {
    const img = req.body.image;
    if (!img || typeof img !== 'string') return { status: 400, error: '请上传制作照片' };
    // 制作照片文件名时间戳化（T14 全量留痕，与复检照片同策略）：多次制作不再互相覆盖；旧固定名 {no}_prod.png 不动（兼容）
    const prodImgUrl = await saveSampleImage(img, s.sample_no + '_prod_' + tsStamp(new Date()));
    if (!prodImgUrl) return { status: 500, error: '制作照片保存失败，请重试' };
    updated.produced_image = prodImgUrl;
    updated.status = 'PRODUCED';
    updated.produced_at = ts;
    updated.signed_by_rd = u.display_name || u.username;
    logData = { sample_id: s.id, action: 'PRODUCE', role: u.role, user_id: u.id, dept: u.dept, note: note || '研发确认制作完成' };
  } else if (chosenAction === 'RELEASE') {
    const cyc = Number(cycleDays);
    if (!cyc || cyc <= 0) return { status: 400, error: '请填写有效的复检周期（天）' };
    // 首发版次默认 01（applyReleaseFields 传 s=null 时取 01；此处 RELEASE 语义为首发行，保持原版次默认逻辑）
    const rel = applyReleaseFields(req, null, updated, ts, cyc, '请选择样品类型（OK样品/NG样品）');
    if (rel) return rel;
    updated.signed_by_qa = u.display_name || u.username;
    logData = { sample_id: s.id, action: 'RELEASE', role: u.role, user_id: u.id, dept: u.dept, note: `正式发行，复检周期${cyc}天，标示卡已签署` };
  } else if (chosenAction === 'INSPECT') {
    // 已发行样品复检：沿用旧文件名（_insp 固定名），版次不自动递增（由标示卡修正流程管理）
    const r = await applyInspect(req, s, updated, ts, { photoName: s.sample_no + '_insp', saveImage: saveSampleImage });
    if (r.error) return { status: r.status, error: r.error };
    const { card_version, test_data } = req.body || {};
    const cardUpdated = (card_version||test_data)?'、「标示卡已更新」':'';
    const isEarly = s.next_inspect_at && new Date(s.next_inspect_at).getTime() > Date.now();
    logData = { sample_id: s.id, action: isEarly ? 'INSPECT_EARLY' : 'INSPECT', role: u.role, user_id: u.id, dept: u.dept, note: note || ('复检通过，下次周期' + r.cyc + '天' + cardUpdated) };
  } else if (chosenAction === 'INSPECT_CUSTODY') {
    // 保管中复检：IN_CUSTODY 自环（样品不脱离保管）；照片文件名时间戳化防覆盖；标示卡版次自动 +1
    const r = await applyInspect(req, s, updated, ts, {
      photoName: s.sample_no + '_insp_' + tsStamp(new Date()),
      bumpVersion: true, keepStatus: 'IN_CUSTODY', saveImage: saveSampleImage
    });
    if (r.error) return { status: r.status, error: r.error };
    const oldVer = s.card_version || '01';
    logData = { sample_id: s.id, action: 'INSPECT_CUSTODY', role: u.role, user_id: u.id, dept: u.dept,
      note: note || ('保管中复检通过，标示卡版次 ' + oldVer + '→' + updated.card_version + '，周期' + r.cyc + '天') };
  } else if (chosenAction === 'CUSTODY') {
    if (!location || !location.trim()) return { status: 400, error: '请填写保管储位' };
    updated.status = 'IN_CUSTODY';
    updated.custody_dept = u.dept;
    updated.storage_location = location.trim();
    logData = { sample_id: s.id, action: 'CUSTODY', role: u.role, user_id: u.id, dept: u.dept, location: location.trim(), note: note || '部门接收保管' };
  }
  // === 领用/归还流程（2026-09-05，docs/superpowers/specs/2026-09-05-samples-checkout-design.md） ===
  else if (chosenAction === 'CHECKOUT') {
    // 领出：登记领用人/领用部门/领用时长（小时），写应还时间 expected_return_at；储位保留（归还后回原储位）
    // returned_at 置空开启新借用周期（上次归还留痕随日志查询，字段只承载最近一次归还）
    const { checkout_user, checkout_dept, durationHours } = req.body || {};
    if (!checkout_user || !checkout_user.trim()) return { status: 400, error: '请填写领用人' };
    const dur = Number(durationHours);
    if (!Number.isInteger(dur) || dur < 1 || dur > 8760) return { status: 400, error: '领用时长须为 1~8760 小时的整数' };
    const due = new Date(ts); due.setUTCHours(due.getUTCHours() + dur);
    updated.status = 'CHECKED_OUT';
    updated.checkout_user = checkout_user.trim();
    updated.checkout_dept = (checkout_dept && checkout_dept.trim()) || u.dept || '';
    updated.checkout_at = ts;
    updated.expected_return_at = due.toISOString();
    updated.checkout_note = (note && note.trim()) || null;
    updated.returned_at = null;
    logData = { sample_id: s.id, action: 'CHECKOUT', role: u.role, user_id: u.id, dept: u.dept, note: '样品领出：领用人 ' + updated.checkout_user + '（' + updated.checkout_dept + '），领用 ' + dur + ' 小时，应还 ' + updated.expected_return_at + (updated.checkout_note ? '，备注：' + updated.checkout_note : '') };
  } else if (chosenAction === 'RETURN_OUT') {
    // 归还入库：回 IN_CUSTODY，写实际归还时间，清全部领用字段；日志留借出时长实绩
    updated.status = 'IN_CUSTODY';
    updated.returned_at = ts;
    const borrowedHours = s.checkout_at ? Math.max(1, Math.round((new Date(ts) - new Date(s.checkout_at)) / 3600000)) : null;
    updated.checkout_user = null;
    updated.checkout_dept = null;
    updated.checkout_at = null;
    updated.expected_return_at = null;
    updated.checkout_note = null;
    logData = { sample_id: s.id, action: 'RETURN_OUT', role: u.role, user_id: u.id, dept: u.dept, note: '归还入库' + (borrowedHours ? '，实际借出 ' + borrowedHours + ' 小时' : '') + (s.checkout_user ? '（领用人 ' + s.checkout_user + '）' : '') + ((note && note.trim()) ? '，备注：' + note.trim() : '') };
  }
  // === 新增 Action ===
  else if (chosenAction === 'EDIT_CARD') {
    const { sample_type, limit_item, source_type, card_version, test_data, test_standard } = req.body || {};
    if (sample_type) updated.sample_type = sample_type.trim();
    if (limit_item) updated.limit_item = limit_item.trim();
    if (source_type) updated.source_type = source_type.trim();
    if (card_version !== undefined) {
      // 版次人工修正须单调不减（T15）：低于当前/置空/非数字一律 400
      const verr = validateCardVersion(card_version, s.card_version);
      if (verr) return { status: 400, error: verr };
      updated.card_version = card_version.trim();
    }
    if (test_data !== undefined) updated.test_data = test_data.trim();
    if (test_standard !== undefined) updated.test_standard = test_standard.trim();
    updated.signed_by_qa = u.display_name || u.username;
    const oldCardVer = s.card_version || '01';
    const verNote = (updated.card_version && updated.card_version !== oldCardVer) ? '，版次 ' + oldCardVer + '→' + updated.card_version : '';
    logData = { sample_id: s.id, action: 'EDIT_CARD', role: u.role, user_id: u.id, dept: u.dept, note: (note || '修正标示卡') + verNote };
  } else if (chosenAction === 'EDIT_STORAGE') {
    if (!location || !location.trim()) return { status: 400, error: '请填写新储位' };
    updated.storage_location = location.trim();
    logData = { sample_id: s.id, action: 'EDIT_STORAGE', role: u.role, user_id: u.id, dept: u.dept, location: location.trim(), note: note || '修改储位' };
  } else if (chosenAction === 'RETURN_REQUEST') {
    if (!note || !note.trim()) return { status: 400, error: '请填写退回原因' };
    updated.status = 'RETURNING';
    logData = { sample_id: s.id, action: 'RETURN_REQUEST', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() };
  } else if (chosenAction === 'RE_RELEASE') {
    const cyc = Number(cycleDays);
    if (!cyc || cyc <= 0) return { status: 400, error: '请填写有效的复检周期（天）' };
    const rel = applyReleaseFields(req, s, updated, ts, cyc, '请选择样品类型');
    if (rel) return rel;
    updated.signed_by_qa = u.display_name || u.username;
    updated.retire_assigned_rd = null;
    updated.retired_reason = null;
    // 重新发行即脱离保管链路：清空保管部门与储位，等待保管单位重新接收
    updated.custody_dept = null;
    updated.storage_location = null;
    logData = { sample_id: s.id, action: 'RE_RELEASE', role: u.role, user_id: u.id, dept: u.dept, note: '品保确认重新发行，周期' + cyc + '天' };
  } else if (chosenAction === 'RETIRE_RECREATE') {
    const assignedRd = (req.body.retire_assigned_rd || '').trim();
    if (!assignedRd) return { status: 400, error: '请选择指派重新制作的研发人员' };
    // T12.1 指派校验：目标须存在 + 角色为 RD + 启用状态（杜绝指派到不存在/非研发/已禁用账号）
    const assignedUser = await D.getUserById(Number(assignedRd));
    if (!assignedUser || assignedUser.role !== 'RD' || Number(assignedUser.enabled) !== 1)
      return { status: 400, error: '指派对象须为启用状态的研发人员' };
    // 保持 RETURNING 状态，仅设置指派信息，等待 RD 扫码执行 RECREATE
    updated.retired_reason = note || '退回研发重新制作';
    updated.retire_assigned_rd = assignedRd;
    const assignedLabel = assignedUser.display_name || assignedUser.username;
    logData = { sample_id: s.id, action: 'RETIRE_RECREATE', role: u.role, user_id: u.id, dept: u.dept, note: '退回研发重新制作，指派 ' + assignedLabel };
  } else if (chosenAction === 'RETIRE_ONLY') {
    if (!note || !note.trim()) return { status: 400, error: '请填写作废原因' };
    updated.status = 'RETIRED';
    updated.retired_reason = note.trim();
    updated.retire_assigned_rd = null;
    logData = { sample_id: s.id, action: 'RETIRE_ONLY', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() };
  } else if (chosenAction === 'RETURN_REJECT') {
    if (!note || !note.trim()) return { status: 400, error: '请填写拒绝理由' };
    updated.status = 'IN_CUSTODY';
    updated.retire_assigned_rd = null;
    updated.retired_reason = null;
    // 顺延复检时间：退回审核消耗的天数（最近一次 RETURN_REQUEST 日志至今的整天数）补回 next_inspect_at
    if (s.next_inspect_at) {
      const logs = await D.listLogsBySample(s.id);
      const rr = (logs || []).find(l => l.action === 'RETURN_REQUEST');
      if (rr && rr.created_at) {
        const days = Math.floor((Date.now() - new Date(rr.created_at).getTime()) / 86400000);
        if (days > 0) {
          const ni = new Date(s.next_inspect_at); ni.setUTCDate(ni.getUTCDate() + days);
          updated.next_inspect_at = ni.toISOString();
          updated.valid_until = updated.next_inspect_at;
        }
      }
    }
    logData = { sample_id: s.id, action: 'RETURN_REJECT', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() };
  } else if (chosenAction === 'FORCE_REASSIGN') {
    // T12.3 ADMIN 兜底：退回审核卡死时强制改派重做研发（存在性/角色/enabled 校验同 T12.1）
    const targetRd = (req.body.retire_assigned_rd || '').trim();
    if (!targetRd) return { status: 400, error: '请选择改派的研发人员' };
    const targetUser = await D.getUserById(Number(targetRd));
    if (!targetUser || targetUser.role !== 'RD' || Number(targetUser.enabled) !== 1)
      return { status: 400, error: '指派对象须为启用状态的研发人员' };
    updated.retire_assigned_rd = targetRd;
    logData = { sample_id: s.id, action: 'FORCE_REASSIGN', role: u.role, user_id: u.id, dept: u.dept, note: '管理员强制改派至 ' + (targetUser.display_name || targetUser.username) };
  } else if (chosenAction === 'FORCE_RETIRE') {
    // T12.3 ADMIN 兜底：退回审核卡死时强制作废（原因必填，日志前缀留痕）
    if (!note || !note.trim()) return { status: 400, error: '请填写作废原因' };
    updated.status = 'RETIRED';
    updated.retired_reason = note.trim();
    updated.retire_assigned_rd = null;
    logData = { sample_id: s.id, action: 'FORCE_RETIRE', role: u.role, user_id: u.id, dept: u.dept, note: '管理员强制作废：' + note.trim() };
  } else if (chosenAction === 'RECREATE') {
    // 4 步写事务：createSample(新) + updateSample(旧→RETIRED) + 2 addLog
    const newSample = await D.withTransaction(async conn => {
      const ns = await D.createSample({
        name: s.name, spec: s.spec, model: s.model, station: s.station,
        sample_type: s.sample_type, limit_item: s.limit_item, source_type: s.source_type,
        card_version: s.card_version, test_standard: s.test_standard, test_data: s.test_data,
        signed_by_rd: u.display_name || u.username, signed_by_qa: s.signed_by_qa,
        notes: '替代已作废样品 ' + s.sample_no, created_by: u.id, replaces: s.sample_no
      }, conn);
      const oldUpdated = { ...s, status: 'RETIRED', replaced_by: ns.sample_no, updated_at: ts };
      await D.updateSample(oldUpdated, conn, s.version);
      await D.addLog({ sample_id: s.id, action: 'RECREATE_REPLACED', role: u.role, user_id: u.id, dept: u.dept, note: '由 ' + ns.sample_no + ' 替代' }, conn);
      await D.addLog({ sample_id: ns.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '替代 ' + s.sample_no }, conn);
      return ns;
    });
    return { respond: { sample: newSample, replaced: s.sample_no, action: 'RECREATE', message: '替代样品已创建：' + newSample.sample_no } };
  }

  return { logData };
}

module.exports = { applyAction, nextCardVersion };
