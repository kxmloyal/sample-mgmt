// subsystems/samples/backend/routes-checkout-users.js — 领用人候选接口（2026-09-09 方案A；同日增强：同部门优先+领用频率排序）
// GET /api/samples/checkout-users：登录即可（保管/生技扫码领用是日常主路径，与领用权限同口径）；
// 仅暴露 id/display_name/dept（projects 子系统 P1-4 同款收敛，不泄漏 username 登录名）；仅返回 enabled=1 且有显示名的账号。
// 排序（2026-09-09）：① 与当前操作人同部门优先（操作人代本部门同事领用是高频场景）
//                    ② 组内按历史领用频率降序——从 scan_logs CHECKOUT 流水按「领用人 X（部门）」格式提取计数，
//                      仅作候选排序启发式（非台账；外来人员不在 users 表故不参与，历史计数含已离职者但会被 enabled=0 过滤掉）
//                    ③ 兜底按姓名中文序
// 供扫码领用弹窗「领用人」可搜索选择器使用；独立文件原因：routes-samples.js 已达 92% 字符红线
const D = require('../../../db');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;
  app.get('/api/samples/checkout-users', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const rows = await D.fetchAll(null,
        "SELECT id, display_name, dept FROM users WHERE enabled=1 AND display_name IS NOT NULL AND display_name<>''");
      // 领用频率计数：CHECKOUT 流水 note 格式「样品领出：领用人 X（部门），…」；取最近 2000 条封顶
      const logs = await D.fetchAll(null,
        "SELECT note FROM scan_logs WHERE action='CHECKOUT' AND note LIKE '%领用人 %' ORDER BY id DESC LIMIT 2000");
      const freq = {};
      for (const l of logs) {
        const m = (l.note || '').match(/领用人 (.+?)（/);
        if (m) freq[m[1]] = (freq[m[1]] || 0) + 1;
      }
      const myDept = (u && u.dept) || '';
      rows.forEach(r => { r.freq = freq[r.display_name] || 0; });
      rows.sort((a, b) => {
        const da = a.dept === myDept ? 0 : 1, ddb = b.dept === myDept ? 0 : 1;
        if (da !== ddb) return da - ddb;                                 // 同部门优先
        if (b.freq !== a.freq) return b.freq - a.freq;                   // 领用频率降序
        return String(a.display_name).localeCompare(String(b.display_name), 'zh'); // 姓名中文序兜底
      });
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
