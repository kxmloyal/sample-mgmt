// subsystems/samples/db/sample-code.js — 样品 13 位结构化编码模块
// 格式: 提供处(1)-机型(6)-组别(1)-流水号(3)-版次(2)，如 G-YD9015-Q-001-01；流水号按机型级递增（序列表原子自增）
// 查询注入：generateSampleCode 接受 { conn, query }，conn 存在用事务连接，否则用 query(sql, params) 返回 rows

// 提供处代码 → 中文（客供维持 C，沿用 source_type C/T/G）
const SOURCE_CODES = { C: '客供', T: '元山', G: '元将五金塔岗分厂' };

// 组别中文 → 代码（站别字段存储中文，编码时映射）
const GROUP_CODES = { 扇叶组: 'S', 马达组: 'M', 成品组: 'A', 品保部: 'Q', SMT: 'E', 供应商: 'I' };

// 前端站别/组别下拉数据源
const STATION_GROUPS = Object.keys(GROUP_CODES);

// 完整编号正则：^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-\d{3}-\d{2}$
const PATTERN = /^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-\d{3}-\d{2}$/;

// 解析编号各段；非法返回 null
function parseSampleCode(no) {
  if (!no || typeof no !== 'string' || !PATTERN.test(no)) return null;
  const p = no.split('-');
  return { source_type: p[0], model: p[1], group: p[2], seq: p[3], version: p[4] };
}

// 版次提取：取 card_version 首个数字块，无则 01，上限 99
function extractVersion(cardVersion) {
  const m = String(cardVersion || '').match(/(\d+)/);
  if (!m) return '01';
  return String(Math.min(parseInt(m[1], 10), 99)).padStart(2, '0');
}

// 生成完整编号；流水号按 机型（6 位）级共享 001~999（跨提供处/组别同一序号空间）
// 取号策略（T13 修订）：优先取「最小未占用序号」；软删除后编号不复用——软删样品行仍
// 留在 samples 表，usedSql 刻意不加 deleted_at 过滤，已删序号仍视为占用（防止旧实物
// QR 扫码指向新样品）；无空档时推进 sample_seqs.cur_seq（记录已分配最大值）。
// 并发安全：确保序列表行存在（no-op upsert）+ 行锁（FOR UPDATE）读 cur_seq + 锁定读
// 占用序号，消除「先查后插」的重复取号竞态；必须与 createSample 同一事务（conn）调用，
// SAVEPOINT 回滚时样品 INSERT 一并回滚，重试时重新取号不丢号。
// opts: { source_type, model, station, card_version, conn?, query? }
async function generateSampleCode(opts) {
  const source = String(opts.source_type || '').toUpperCase();
  if (!SOURCE_CODES[source]) throw new Error('提供处无效：' + opts.source_type);
  const groupCode = GROUP_CODES[opts.station];
  if (!groupCode) throw new Error('组别无效：' + opts.station);
  const modelCode = String(opts.model || '').slice(0, 6);
  if (modelCode.length < 6) throw new Error('机型编码至少 6 位');
  const prefix = modelCode; // 机型 6 位：同机型跨提供处/组别共享流水号空间

  // 确保序列表行存在（no-op upsert），随后行锁读已分配最大值
  const upsert = 'INSERT INTO sample_seqs (prefix, cur_seq) VALUES (?, 0) ON DUPLICATE KEY UPDATE cur_seq = cur_seq';
  const lockSel = 'SELECT cur_seq FROM sample_seqs WHERE prefix = ? FOR UPDATE';
  // 该机型全部样品占用序号（含软删行，编号永不复用；编号第 3~8 位为机型 6 位）
  const usedSql = 'SELECT sample_no FROM samples WHERE SUBSTRING(sample_no, 3, 6) = ?';

  let curSeq, usedRows;
  if (opts.conn) {
    await opts.conn.execute(upsert, [prefix]);
    curSeq = Number((await opts.conn.execute(lockSel, [prefix]))[0][0].cur_seq);
    usedRows = (await opts.conn.execute(usedSql, [prefix]))[0];
  } else if (opts.query) {
    await opts.query(upsert, [prefix]);
    const rows = await opts.query(lockSel, [prefix]);
    curSeq = Number(rows && rows[0] ? rows[0].cur_seq : 0);
    usedRows = await opts.query(usedSql, [prefix]);
  } else {
    throw new Error('generateSampleCode 缺少 query 或 conn');
  }

  // 找最小未占用序号：软删样品行仍在表内且 usedSql 不过滤 deleted_at（刻意），其序号仍算占用
  const used = new Set();
  (usedRows || []).forEach(function (r) {
    const p = parseSampleCode(r.sample_no);
    if (p) used.add(Number(p.seq));
  });
  let seq = 1;
  while (used.has(seq)) seq++;
  if (seq > 999) throw new Error('该机型已达上限 999');
  if (seq > curSeq) {
    // 无空档可复用，推进序列表记录已分配最大值
    const upd = 'UPDATE sample_seqs SET cur_seq = ? WHERE prefix = ?';
    if (opts.conn) await opts.conn.execute(upd, [seq, prefix]);
    else await opts.query(upd, [seq, prefix]);
  }
  return source + '-' + modelCode + '-' + groupCode + '-' + String(seq).padStart(3, '0') + '-' + extractVersion(opts.card_version);
}

// 编号预览：只读模拟（按存量样品找最小未占用序号），不写 sample_seqs，避免预览消耗序号
// 仅供展示，实际编号以提交后 generateSampleCode 结果为准
// opts: { source_type, model, station, card_version, conn?, query? }
async function previewSampleCode(opts) {
  const source = String(opts.source_type || '').toUpperCase();
  if (!SOURCE_CODES[source]) throw new Error('提供处无效：' + opts.source_type);
  const groupCode = GROUP_CODES[opts.station];
  if (!groupCode) throw new Error('组别无效：' + opts.station);
  const modelCode = String(opts.model || '').slice(0, 6);
  if (modelCode.length < 6) throw new Error('机型编码至少 6 位');
  const usedSql = 'SELECT sample_no FROM samples WHERE SUBSTRING(sample_no, 3, 6) = ?';
  let rows;
  if (opts.conn) {
    rows = (await opts.conn.execute(usedSql, [modelCode]))[0];
  } else if (opts.query) {
    rows = await opts.query(usedSql, [modelCode]);
  } else {
    throw new Error('previewSampleCode 缺少 query 或 conn');
  }
  const used = new Set();
  (rows || []).forEach(function (r) {
    const p = parseSampleCode(r.sample_no);
    if (p) used.add(Number(p.seq));
  });
  let next = 1;
  while (used.has(next)) next++;
  if (next > 999) throw new Error('该机型已达上限 999');
  return source + '-' + modelCode + '-' + groupCode + '-' + String(next).padStart(3, '0') + '-' + extractVersion(opts.card_version);
}

module.exports = { SOURCE_CODES, GROUP_CODES, STATION_GROUPS, PATTERN, parseSampleCode, generateSampleCode, previewSampleCode };
