// subsystems/samples/db/sample-code.js — 样品 13 位结构化编码模块
// 格式: 提供处(1)-机型(6)-组别(1)-流水号(3)-版次(2)，如 G-YD9015-Q-001-01
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

// 生成完整编号；流水号按 提供处+机型+组别 组合独立递增（001~999）
// opts: { source_type, model, station, card_version, conn?, query? }
async function generateSampleCode(opts) {
  const source = String(opts.source_type || '').toUpperCase();
  if (!SOURCE_CODES[source]) throw new Error('提供处无效：' + opts.source_type);
  const groupCode = GROUP_CODES[opts.station];
  if (!groupCode) throw new Error('组别无效：' + opts.station);
  const modelCode = String(opts.model || '').slice(0, 6);
  if (modelCode.length < 6) throw new Error('机型编码至少 6 位');
  const prefix = source + '-' + modelCode + '-' + groupCode + '-';
  const sql = 'SELECT COALESCE(MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED)), 0) AS m FROM samples WHERE LEFT(sample_no, 11) = ?';
  let rows;
  if (opts.conn) {
    rows = (await opts.conn.execute(sql, [prefix]))[0]; // conn.execute 返回 [rows, fields]
  } else if (opts.query) {
    rows = await opts.query(sql, [prefix]);              // query 直接返回 rows
  } else {
    throw new Error('generateSampleCode 缺少 query 或 conn');
  }
  const next = Number(rows[0].m) + 1;
  if (next > 999) throw new Error('该 提供处+机型+组别 组合已达上限 999');
  return prefix + String(next).padStart(3, '0') + '-' + extractVersion(opts.card_version);
}

module.exports = { SOURCE_CODES, GROUP_CODES, STATION_GROUPS, PATTERN, parseSampleCode, generateSampleCode };
