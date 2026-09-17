// tests/samples-backend-guards.test.js — 样品后端四项加固的源码级锁定（2026-09-17）
// 背景：docs/samples-review-2026-09-17.md 的 P1-2（sample_type 无白名单 → 存储型 XSS）、P1-5（多角色鉴权未走 hasRole）、
//       P1-12（FORCE_REASSIGN 漏释放柜位、RETURN_REJECT 未写回储位）、P2-1（catch 透出 err.message）。
// 断言方式为静态源码断言（不连库、不起服务）：符合 samples 已上线（manifest.deployed=true）的只读验证口径；
// 护栏一旦被后人回退，本测试立即失败。规则依据见 docs/agents-enforcement-rules.md §25.2.1/§25.2.3/§25.3.3/§25.3.4。
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');

const BE = 'subsystems/samples/backend/';
// 本批清单内的后端文件（routes-storage-map.js / routes-checkout-users.js 不在本批，留待后续批次）
const GUARD_FILES = ['routes-samples.js', 'scan-actions.js', 'routes-scan.js', 'batch-scan.js',
  'routes-cards.js', 'routes-samples-models.js', 'scan-allowed.js'];

describe('样品后端加固（源码静态断言）', () => {
  it('① 裸 u.role 出现次数为 0（权限判定走 hasRole，审计留痕走 primaryRole）', () => {
    for (const f of GUARD_FILES) {
      const hits = (read(BE + f).match(/\bu\.role\b/g) || []).length;
      expect({ file: f, hits: hits }).toEqual({ file: f, hits: 0 });
    }
  });

  it('① 角色判定使用共享 hasRole，不再自造角色比较', () => {
    const rs = read(BE + 'routes-samples.js');
    expect(rs).toContain('const hasRole = app.locals.hasRole;');
    expect(rs).toContain("if (!hasRole(u, ['RD', 'ADMIN']))");
    expect(rs).toContain("hasRole(u, ['RD', 'QA', 'ADMIN'])");
    expect(rs).toContain("hasRole(u, ['ADMIN'])");
    expect(rs).toContain("hasRole(u, ['RD']) ? (u.display_name || u.username)");
    expect(rs).toContain("hasRole(u, ['QA']) ? (u.display_name || u.username)");
    const rm = read(BE + 'routes-samples-models.js');
    expect(rm).toContain('const hasRole = app.locals.hasRole;');
    expect(rm).toContain("hasRole(u, ['RD', 'ADMIN'])");
    expect(read(BE + 'routes-cards.js')).toContain('app.locals.hasRole(u, DOWNLOAD_ROLES)');
    // 审计留痕仍为单值（role 列 VARCHAR(20)，不进并集串）：
    // routes-samples.js 内联 primaryRole(u)；scan-actions.js 在函数入口取一次后用缩写 role
    expect(read(BE + 'scan-actions.js')).toContain('const role = primaryRole(u);');
    expect(read(BE + 'scan-actions.js')).toMatch(/action: 'PRODUCE', role, /);
    expect(read(BE + 'routes-samples.js')).toContain('role: primaryRole(u),');
  });

  it('① scan-allowed.allowedActions 收 u 并求多角色并集，调用点不再传 u.role', () => {
    const sa = read(BE + 'scan-allowed.js');
    expect(sa).toContain('function allowedActions(u, status, next_inspect_at, retire_assigned_rd, currentUserId)');
    expect(sa).toContain('Array.isArray(u && u.roles)');
    expect(sa).toContain('SM.getAllowedActions(r, status)');
    expect(sa).toContain("require('../../../shared/state-machine')"); // 共享状态机未被改动
    for (const f of ['routes-scan.js', 'batch-scan.js']) {
      const src = read(BE + f);
      expect(src).not.toMatch(/allowedActions\(u\.role/);
      expect(src).toMatch(/allowedActions\(u, s\.status/);
    }
    // 单件两处（resolve + scan）+ 批量三处（预校验/执行/只读 resolve）全部改完
    expect((read(BE + 'routes-scan.js').match(/allowedActions\(u, s\.status/g) || []).length).toBe(2);
    expect((read(BE + 'batch-scan.js').match(/allowedActions\(u, s\.status/g) || []).length).toBe(3);
  });

  it('① allowedActions 运行期：多角色取并集，单角色/旧字符串调用行为不变', () => {
    const { allowedActions } = require('../subsystems/samples/backend/scan-allowed');
    const DUE = new Date(Date.now() + 86400000).toISOString(); // 明天到期，落在 INSPECT_CUSTODY 提前窗口内
    // 旧调用方（直接传角色字符串）与单角色对象结果一致 —— 兼容性硬约束
    expect(allowedActions('CUSTODY', 'RELEASED', null, null, '9'))
      .toEqual(allowedActions({ role: 'CUSTODY' }, 'RELEASED', null, null, '9'));
    // CUSTODY 单角色（未到期）不含 QA 专属的 INSPECT_CUSTODY
    expect(allowedActions({ role: 'CUSTODY', roles: ['CUSTODY'] }, 'IN_CUSTODY', null, null, '9')).toEqual(['CHECKOUT', 'EDIT_STORAGE', 'RETURN_REQUEST']);
    // 多角色并集 = QA 的 INSPECT_CUSTODY ∪ CUSTODY 的 IN_CUSTODY 动作集
    expect(allowedActions({ role: 'QA', roles: ['QA', 'CUSTODY'] }, 'IN_CUSTODY', DUE, null, '9'))
      .toEqual(['INSPECT_CUSTODY', 'CHECKOUT', 'EDIT_STORAGE', 'RETURN_REQUEST']);
    expect(allowedActions({ role: 'ADMIN', roles: ['ADMIN'] }, 'IN_CUSTODY', null, null, '9')).toEqual([]);
  });

  it('② sample_type 白名单校验器存在，且 4 个写入口全部调用它', () => {
    const vt = read(BE + 'sample-type.js');
    expect(vt).toContain('function isValidSampleType(');
    expect(vt).toContain("['', 'OK', 'NG'].includes(");
    expect(vt).toContain('function sampleTypeReject(');
    expect(vt).toContain('module.exports = { isValidSampleType, sampleTypeReject, primaryRole, SAMPLE_TYPE_MSG };');

    const rsLines = read(BE + 'routes-samples.js').split('\n');
    const saLines = read(BE + 'scan-actions.js').split('\n');
    const find = (lines, re) => lines.findIndex(l => re.test(l));

    // 入口 1：POST /api/samples 建样
    const iCreate = find(rsLines, /if \(!isValidSampleType\(sample_type\)\)/);
    const iCreateUse = find(rsLines, /sample_type: sample_type \|\| ''/);
    expect(iCreate).toBeGreaterThan(-1);
    expect(iCreateUse).toBeGreaterThan(iCreate);

    // 入口 2：PUT /api/samples/:id 标示卡
    const iPut = find(rsLines, /if \(sample_type !== undefined && !isValidSampleType\(sample_type\)\)/);
    const iPutUse = find(rsLines, /sample_type: sample_type !== undefined \? sample_type : s\.sample_type/);
    expect(iPut).toBeGreaterThan(-1);
    expect(iPutUse).toBeGreaterThan(iPut);

    // 入口 3：RELEASE / RE_RELEASE（applyReleaseFields 内，两动作共用）
    const iRel = find(saLines, /const trel = sampleTypeReject\(sample_type\)/);
    expect(iRel).toBeGreaterThan(-1);
    expect(saLines[iRel + 1]).toBe('  if (trel) return trel;');
    expect(saLines[iRel + 2]).toContain('if (!limit_item');

    // 入口 4：EDIT_CARD
    const iEdit = find(saLines, /const ted = sampleTypeReject\(sample_type\)/);
    const iEditUse = find(saLines, /if \(sample_type\) updated\.sample_type = /);
    expect(iEdit).toBeGreaterThan(-1);
    expect(iEditUse).toBeGreaterThan(iEdit);

    // 计数据锁定：4 个写入口 = routes-samples 2 处 + scan-actions 2 处
    expect((read(BE + 'routes-samples.js').match(/isValidSampleType\(/g) || []).length).toBe(3); // import + 建样 + PUT
    expect((read(BE + 'scan-actions.js').match(/sampleTypeReject\(sample_type\)/g) || []).length).toBe(2); // release + EDIT_CARD
    // 逻辑第 5 个写点（POST /api/samples/batch 行级 items[].sample_type）同样受同一校验器保护
    expect(read(BE + 'routes-samples.js')).toContain('if (!isValidSampleType(st))');
  });

  it('③ 响应体不再拼接 err.message / e.message（业务态白名单除外）', () => {
    for (const f of GUARD_FILES) {
      read(BE + f).split('\n').forEach((l, i) => {
        // 只检查「响应体载荷」位置：err.message 出现在 json(...)/reason: 之后才算回显泄漏。
        // 出现在条件判断（if (err.message && err.message.includes('上限'))）或 logger.error 参数中不算
        // —— §25.2.3 禁止的是「回显给客户端」，不是「读它做分支」或「写服务端日志」。
        const m = l.match(/(?:res\.status\([^)]*\)\.json\(|reason:\s*)(.*)$/);
        if (!m) return;
        const leak = /err\.message|e\.message/.test(m[1]);
        expect({ file: f, line: i + 1, src: l.trim(), leak: leak }).toEqual({ file: f, line: i + 1, src: l.trim(), leak: false });
      });
    }
    // 固定文案 + 服务端日志成对（样板同 server.js 全局错误处理）
    expect(read(BE + 'routes-scan.js')).toContain("res.status(500).json({ error: '扫码操作失败，请刷新后重试或联系管理员' });");
    expect(read(BE + 'routes-scan.js')).toMatch(/logger\.error\('扫码操作失败/);
    expect(read(BE + 'routes-samples.js')).toMatch(/logger\.error\('编号预览失败/);
    expect(read(BE + 'routes-samples.js')).toContain("res.status(500).json({ error: '新建样品失败，请联系管理员' });");
    expect(read(BE + 'routes-samples-models.js')).toContain("res.status(500).json({ error: '新增机型失败，请联系管理员' });");
    expect(read(BE + 'batch-scan.js')).toContain("reason: '服务器内部错误'");
    // 业务态白名单仍保留原文案（不牺牲可用性）：「上限」与行级 err.status
    const rs = read(BE + 'routes-samples.js');
    expect(rs).toContain("err.message.includes('上限')");
    expect(rs).toContain('const bizMsg = (err.status ||');
  });

  it('④ scan-actions：FORCE_REASSIGN 出口调用 releaseCabinet（柜位不残留）', () => {
    const lines = read(BE + 'scan-actions.js').split('\n');
    const exit = lines.findIndex(l => l.includes("chosenAction === 'FORCE_REASSIGN'"));
    const next = lines.findIndex((l, i) => i > exit && l.includes("chosenAction === 'FORCE_RETIRE'"));
    expect(exit).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(exit);
    const body = lines.slice(exit, next).join('\n');
    expect(body).toContain('releaseCabinet(updated, s,');
    expect(body).toContain("action: 'FORCE_REASSIGN'");
  });

  it('④ scan-actions：出口动作名 → 柜位副作用对照（全出口覆盖断言）', () => {
    const src = read(BE + 'scan-actions.js');
    // 释放柜位通道（5 处调用，逐项对应动作名）
    for (const a of ['RETIRE_RECREATE', 'RETIRE_ONLY', 'FORCE_RETIRE', 'FORCE_REASSIGN', 'RECREATE_REPLACED']) {
      expect({ action: a, guarded: src.includes("action: '" + a + "'") }).toEqual({ action: a, guarded: true });
    }
    // releaseCabinet：1 处函数定义 + 5 处调用
    expect((src.match(/releaseCabinet\(/g) || []).length).toBe(6);
    // 不释放柜位的出口也必须存在（防后人误加释放）
    for (const a of ['PRODUCE', 'RELEASE', 'INSPECT_CUSTODY', 'CUSTODY', 'CHECKOUT', 'RETURN_OUT',
      'EDIT_CARD', 'EDIT_STORAGE', 'RETURN_REQUEST', 'RE_RELEASE', 'RETURN_REJECT']) {
      expect({ action: a, present: src.includes("action: '" + a + "'") }).toEqual({ action: a, present: true });
    }
    // INSPECT 的 action 名由 isEarly 动态选择（INSPECT_EARLY / INSPECT），非字面量，单独断言
    expect(src).toContain("action: isEarly ? 'INSPECT_EARLY' : 'INSPECT'");
    // RETURN_REJECT 例外：回到保管链须写回储位（P1-12 后半）
    const lines = src.split('\n');
    const iRr = lines.findIndex(l => l.includes("chosenAction === 'RETURN_REJECT'"));
    const iFr = lines.findIndex(l => l.includes("chosenAction === 'FORCE_REASSIGN'"));
    expect(iRr).toBeGreaterThan(-1);
    expect(iFr).toBeGreaterThan(iRr);
    const rrBody = lines.slice(iRr, iFr).join('\n');
    expect(rrBody).toContain('if (location && location.trim())');
    expect(rrBody).toContain('updated.storage_location = location.trim();');
  });
});
