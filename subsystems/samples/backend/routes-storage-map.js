// subsystems/samples/backend/routes-storage-map.js — 样品柜数字孪生（2026-09-09）
// GET /api/samples/storage-map：聚合各保管柜的格位占用状态（只读，登录即可）
//   样品侧：status='IN_CUSTODY'→在柜(蓝)；'CHECKED_OUT'→领走=占用(橙，用户确认不释放格位)；'RETURNING'→退回审核(黄，占用)
//   空位 = 配置全集(rows×columns) − 占用；未配置柜的柜体不渲染全集空位（只显示已出现格位）
//   storage_location 为空 → uncabineted 未入柜池（不在柜体图渲染，顶部警示）
// 柜配置表 sample_storage_cabinets（rows/columns 可配置，本文件幂等建表）：
//   cabinet_key 如「1#样品柜」；cabinet_no 数字（解析自 key，冗余便于排序）
// 格位编码：N#样品柜C-R = 第N柜·第C列·第R行（parseLoc 兼容「1#样品柜 3-7」等历史脏空格）
// 注册顺序：必须先于 routes-samples（GET /:id 会贪婪捕获 storage-map，实证教训同 checkout-users）
const D = require('../../../db');

// 格位解析：'1#样品柜3-8' / '1#样品柜 3-8' → { key:'1#样品柜', no:1, col:3, row:8 }；不匹配返回 null
function parseLoc(loc) {
  if (!loc) return null;
  var m = String(loc).replace(/\s+/g, '').match(/^(\d+)#样品柜(\d+)-(\d+)$/);
  return m ? { key: m[1] + '#样品柜', no: Number(m[1]), col: Number(m[2]), row: Number(m[3]) } : null;
}

// 状态归类：in=在柜 / out=领走(占用) / ret=退回审核(占用)；其余状态（未制作/未发行/已作废）不占格位
function stateOf(status) {
  if (status === 'IN_CUSTODY') return 'in';
  if (status === 'CHECKED_OUT') return 'out';
  if (status === 'RETURNING') return 'ret';
  return null;
}

async function ensureCabinetTable() {
  // 幂等建表（首次访问自动建；后续迭代可加管理界面维护）
  await D.run("CREATE TABLE IF NOT EXISTS sample_storage_cabinets (" +
    "cabinet_key VARCHAR(50) PRIMARY KEY, cabinet_no INT NOT NULL, " +
    "rows INT NOT NULL DEFAULT 9, columns INT NOT NULL DEFAULT 3, " +
    "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, updated_by INT NULL)");
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  app.get('/api/samples/storage-map', requireAuth, async (req, res) => {
    try {
      await ensureCabinetTable();
      const rows = await D.fetchAll(null,
        "SELECT id, sample_no, name, model, station, status, storage_location FROM samples " +
        "WHERE deleted_at IS NULL");
      const cabCfg = await D.fetchAll(null, 'SELECT cabinet_key, rows, columns FROM sample_storage_cabinets');
      const cfgMap = {}; cabCfg.forEach(c => { cfgMap[c.cabinet_key] = c; });

      const cabinets = {};   // key → {key,no,cols,rows,cells:{'C-R':{in,out,ret,samples:[...]}}}
      const unknownLoc = []; // 无法解析的储位串（提示规范录入）
      const uncabineted = []; // 未入柜池（storage_location 为空）
      for (const s of rows) {
        const st = stateOf(s.status);
        if (!s.storage_location) { if (st === 'in' || st === 'out' || st === 'ret') uncabineted.push(s); continue; }
        // 有储位但状态不在三态（如 NEW 制作中）→ 记预占（占格显示灰点，防两人同格）
        const p = parseLoc(s.storage_location);
        if (!p) { unknownLoc.push(s); continue; }
        if (!cabinets[p.key]) {
          const cfg = cfgMap[p.key] || {};
          cabinets[p.key] = { key: p.key, no: p.no, cols: cfg.columns || 3, rows: cfg.rows || 9, cells: {}, configured: !!cfgMap[p.key] };
        }
        const c = cabinets[p.key];
        c.cols = Math.max(c.cols, p.col); c.rows = Math.max(c.rows, p.row); // 数据出现超出配置的格位 → 扩界展示
        const cellKey = p.col + '-' + p.row;
        if (!c.cells[cellKey]) c.cells[cellKey] = { col: p.col, row: p.row, in: 0, out: 0, ret: 0, reserved: 0, samples: [] };
        const cell = c.cells[cellKey];
        if (st) { cell[st]++; cell.samples.push({ id: s.id, sample_no: s.sample_no, name: s.name, model: s.model, station: s.station, status: s.status }); }
        else { cell.reserved++; cell.samples.push({ id: s.id, sample_no: s.sample_no, name: s.name, model: s.model, station: s.station, status: s.status }); }
      }

      // 输出：每柜展开完整格位矩阵（配置全集），空位标记 empty=true
      const list = Object.values(cabinets).sort((a, b) => a.no - b.no).map(c => {
        const cells = [];
        for (let col = 1; col <= c.cols; col++) {
          for (let row = 1; row <= c.rows; row++) {
            const k = col + '-' + row;
            const cell = c.cells[k] || { col: col, row: row, in: 0, out: 0, ret: 0, reserved: 0, samples: [] };
            const occupied = cell.in + cell.out + cell.ret + cell.reserved;
            cells.push({ col: col, row: row, label: col + '-' + row, empty: occupied === 0, occupancy: cell });
          }
        }
        const sum = cells.reduce((a, x) => ({ in: a.in + x.occupancy.in, out: a.out + x.occupancy.out, ret: a.ret + x.occupancy.ret, reserved: a.reserved + x.occupancy.reserved, empty: a.empty + (x.empty ? 1 : 0) }), { in: 0, out: 0, ret: 0, reserved: 0, empty: 0 });
        return { key: c.key, no: c.no, cols: c.cols, rows: c.rows, configured: c.configured, cells: cells, summary: { total: c.cols * c.rows, inCustody: sum.in, checkedOut: sum.out, returning: sum.ret, reserved: sum.reserved, empty: sum.empty } };
      });
      res.json({ cabinets: list, unknownLoc: unknownLoc.map(s => ({ id: s.id, sample_no: s.sample_no, storage_location: s.storage_location })), uncabineted: uncabineted.map(s => ({ id: s.id, sample_no: s.sample_no, name: s.name, status: s.status })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 柜配置读写（ADMIN 可改行列，全员可读）——供孪生页内联配置
  app.put('/api/samples/storage-map/cabinets/:key', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可修改柜配置' });
      const key = decodeURIComponent(req.params.key);
      const rws = Math.min(Math.max(parseInt(req.body.rows, 10) || 0, 1), 50);
      const cls = Math.min(Math.max(parseInt(req.body.columns, 10) || 0, 1), 50);
      if (!rws || !cls) return res.status(400).json({ error: 'rows/columns 须为 1~50 整数' });
      const m = key.match(/^(\d+)#样品柜$/);
      if (!m) return res.status(400).json({ error: '柜名须为 N#样品柜 格式' });
      await ensureCabinetTable();
      await D.run('INSERT INTO sample_storage_cabinets (cabinet_key, cabinet_no, rows, columns, updated_by) VALUES (?,?,?,?,?) ' +
        'ON DUPLICATE KEY UPDATE rows=VALUES(rows), columns=VALUES(columns), updated_by=VALUES(updated_by)',
        [key, Number(m[1]), rws, cls, u.id]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register, parseLoc, stateOf };
