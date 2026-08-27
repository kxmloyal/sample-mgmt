// subsystems/control/db/control-code.js — 管制流程单编号模块
// 格式: CTL + YYYYMM + 3 位流水号(按月级递增), 如 CTL202608001
// 取号(并发安全): control_seqs 序列表, INSERT ... ON DUPLICATE KEY UPDATE cur_seq=cur_seq+1 原子自增
//   + SELECT cur_seq ... FOR UPDATE 行锁读回; 须与主单 INSERT 同一事务(conn)调用以保证原子一致
// 查询注入: generateControlCode(opts) 接受 { conn?, query?, date? }
//   - conn  存在: 走事务连接(序号随事务回滚), 回滚不丢号
//   - query 存在: 走连接池(独立提交, 失败跳号但安全)
//   - date  可选: 指定编号年月的基准时间(默认当前时间), 便于测试跨月/跨年

// 由 Date 计算 YYYYMM(本地时间); 接受 ISO 串/Date/null
function ymOf(date) {
  var dt = date != null ? new Date(date) : new Date();
  if (isNaN(dt.getTime())) dt = new Date();
  return String(dt.getFullYear()) + String(dt.getMonth() + 1).padStart(2, '0');
}

// 生成管制单号; opts: { conn?, query?, date? }
async function generateControlCode(opts) {
  opts = opts || {};
  var prefix = 'CTL' + ymOf(opts.date);
  // 原子自增: 行不存在则插 cur_seq=1, 存在则 +1(ON DUPLICATE KEY UPDATE)
  var inc = 'INSERT INTO control_seqs (prefix, cur_seq) VALUES (?, 1) ON DUPLICATE KEY UPDATE cur_seq = cur_seq + 1';
  var lock = 'SELECT cur_seq FROM control_seqs WHERE prefix = ? FOR UPDATE';
  var seq;
  if (opts.conn) {
    await opts.conn.execute(inc, [prefix]);
    var rows = await opts.conn.execute(lock, [prefix]);
    seq = Number(rows[0][0].cur_seq);
  } else if (opts.query) {
    await opts.query(inc, [prefix]);
    var r = await opts.query(lock, [prefix]);
    if (!r || !r.length) throw new Error('generateControlCode 取号失败: ' + prefix);
    seq = Number(r[0].cur_seq);
  } else {
    throw new Error('generateControlCode 缺少 query 或 conn');
  }
  if (seq > 999) throw new Error('该月份序号已达上限 999');
  return prefix + String(seq).padStart(3, '0');
}

module.exports = { generateControlCode };
