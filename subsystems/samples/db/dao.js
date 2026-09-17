// subsystems/samples/db/dao.js — 样品数据访问层（工厂模式）
// 2026-09-07 按域拆分（2026-09-05 首拆经 revert 后随角色范围需求重新落地）：查询域迁至 dao-list.js，本文件保留写入域
// 对外接口不变：db.js scanDao 只加载本文件，本文件合并导出 dao-list 的全部查询函数（调用方 D.listSamples 等无需改动）
const crypto = require('crypto');
const { generateSampleCode } = require('./sample-code');
const createDaoList = require('./dao-list');

module.exports = function createDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO;

  // 事务内单行查询：传 conn 用当前连接，否则用连接池
  async function fetchOne(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].length ? Object.assign({}, rows[0][0]) : undefined;
    }
    return one(sql, params);
  }

  // 生成 13 位结构化编码（如 G-YD9015-Q-001-01）；流水号按机型级递增（sample_seqs 序列表原子自增）
  // data: { source_type, model, station, card_version }；conn 存在走事务连接（序号随事务回滚），否则用连接池 q（独立提交，失败跳号但安全）
  async function nextSampleNo(data, conn) {
    return await generateSampleCode({
      source_type: data.source_type,
      model: data.model,
      station: data.station,
      card_version: data.card_version || '01',
      conn: conn,
      query: q
    });
  }

  // createSample: SAVEPOINT 重试解决并发 UNIQUE 冲突
  async function createSample(data, conn) {
    var token = crypto.randomBytes(8).toString('hex');
    var sbRd = data.signed_by_rd || '';
    var sql = 'INSERT INTO samples (sample_no,name,spec,model,station,image,qr_token,status,created_by,notes,sample_type,limit_item,source_type,valid_until,card_version,test_standard,test_data,signed_by_rd,signed_by_qa,replaces) VALUES (?,?,?,?,?,?,?,\'NEW\',?,?,?,?,?,?,?,?,?,?,?,?)';
    var lastErr;
    for (var i = 0; i < 3; i++) {
      var ns = await nextSampleNo({
        source_type: data.source_type || '',
        model: data.model || '',
        station: data.station || '',
        card_version: data.card_version || '01'
      }, conn);
      var params = [ns, data.name || null, data.spec || null, data.model || null, data.station || null, data.image || null, token, data.created_by || null, data.notes || null, data.sample_type || '', data.limit_item || '', data.source_type || '', data.valid_until || '', data.card_version || '', data.test_standard || '', data.test_data || '', sbRd, data.signed_by_qa || '', data.replaces || null];
      try {
        if (conn) {
          // SAVEPOINT 类语句不走 prepared 协议（conn.execute 不支持），须用 conn.query
          await conn.query('SAVEPOINT sp_create_sample');
          await conn.execute(sql, params);
          await conn.query('RELEASE SAVEPOINT sp_create_sample');
        } else {
          await run(sql, params);
        }
        return await fetchOne(conn, 'SELECT * FROM samples WHERE sample_no = ?', [ns]);
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
          if (conn) { try { await conn.query('ROLLBACK TO SAVEPOINT sp_create_sample'); } catch (_) {} }
          lastErr = e; continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error('createSample 重试 3 次仍失败');
  }

  function getSampleById(id) { return one('SELECT * FROM samples WHERE id = ? AND deleted_at IS NULL', [id]); }
  function getSampleByNo(sample_no) { return one('SELECT * FROM samples WHERE sample_no = ? AND deleted_at IS NULL', [sample_no]); }
  function getSampleByToken(qr_token) { return one('SELECT * FROM samples WHERE qr_token = ? AND deleted_at IS NULL', [qr_token]); }

  // updateSample(s, conn, expectedVersion)：全量字段覆盖更新，返回更新后的行
  // expectedVersion（可选，乐观锁 CAS 版本号）：
  //   - 传入时 SET 子句追加 version=version+1，WHERE 条件变为 id=? AND version=?；
  //     版本已被并发修改推进时 affectedRows===0，抛出 code='CONFLICT' 的 Error（message='VERSION_CONFLICT'），
  //     供状态机路由（T3/T5）捕获后返回 HTTP 409；
  //   - 不传（undefined/null）时保持旧行为完全不变（无版本条件、不抛冲突），向后兼容，
  //     供非状态机写路径（seed/旧路由）过渡使用。
  // 返回值兼容旧调用方；新增异常场景：仅当传入 expectedVersion 且版本冲突时抛 code='CONFLICT'。
  // 注意：连接池 run 包装器丢弃 execute 返回值（拿不到 affectedRows），精确 CAS 检测依赖事务连接 conn
  // （conn.execute 返回 ResultSetHeader）；非 conn 路径传 expectedVersion 时降级为更新后回读 version 比对。
  async function updateSample(s, conn, expectedVersion) {
    var cas = expectedVersion !== undefined && expectedVersion !== null;
    var sql = 'UPDATE samples SET status=?, produced_at=?, released_at=?, release_cycle_days=?, next_inspect_at=?, custody_dept=?, storage_location=?, checkout_user=?, checkout_dept=?, checkout_at=?, expected_return_at=?, returned_at=?, checkout_note=?, model=?, station=?, image=?, produced_image=?, inspect_image=?, notes=?, sample_type=?, limit_item=?, source_type=?, valid_until=?, card_version=?, test_standard=?, test_data=?, signed_by_rd=?, signed_by_qa=?, retired_reason=?, replaced_by=?, replaces=?, retire_assigned_rd=?' + (cas ? ', version=version+1' : '') + ' WHERE id=?' + (cas ? ' AND version=?' : '');
    var params = [s.status, s.produced_at || null, s.released_at || null, s.release_cycle_days ?? null, s.next_inspect_at || null, s.custody_dept || null, s.storage_location || null, s.checkout_user ?? null, s.checkout_dept ?? null, s.checkout_at ?? null, s.expected_return_at ?? null, s.returned_at ?? null, s.checkout_note ?? null, s.model ?? null, s.station ?? null, s.image ?? null, s.produced_image ?? null, s.inspect_image ?? null, s.notes || null, s.sample_type ?? '', s.limit_item ?? '', s.source_type ?? '', s.valid_until ?? null, s.card_version ?? '', s.test_standard ?? '', s.test_data ?? '', s.signed_by_rd ?? '', s.signed_by_qa ?? '', s.retired_reason ?? null, s.replaced_by ?? null, s.replaces ?? null, s.retire_assigned_rd ?? null, s.id];
    if (cas) params.push(expectedVersion);
    var affected = 1;
    if (conn) {
      var res = await conn.execute(sql, params);
      affected = res[0] && typeof res[0].affectedRows === 'number' ? res[0].affectedRows : 1;
    } else {
      await run(sql, params);
      if (cas) {
        // 降级校验：run 无 affectedRows，回读 version 应等于 expectedVersion+1，否则视为版本冲突
        var cur = await fetchOne(null, 'SELECT version FROM samples WHERE id = ?', [s.id]);
        if (!cur || cur.version !== expectedVersion + 1) affected = 0;
      }
    }
    if (cas && affected === 0) {
      var err = new Error('VERSION_CONFLICT');
      err.code = 'CONFLICT';
      throw err;
    }
    return await fetchOne(conn, 'SELECT * FROM samples WHERE id = ?', [s.id]);
  }

  // T13 软删除：deleted_at 置位 + version 推进；scan_logs 保留（审计不断链）
  // 编号口径（2026-09-11 修订）：软删的 NEW 样品其流水号视为可复用（sample-code.js USED_SQL），
  // 软删的 PRODUCED 及以后仍占用；唯一索引已由 migrateSamplesSampleNoRelease 改为「仅存活行唯一」
  // 时区口径（2026-09-09）：NOW() 与 created_at/updated_at 的 CURRENT_TIMESTAMP 同为会话墙钟（+08），
  // 原 UTC_TIMESTAMP() 与同行其他时间列差 8h，已统一；存量行由 migrateSamplesDeletedAtTz 一次性校正
  // 存活条件（§25.3.6）：本语句是 deleted_at 的写入者，条件补在 AND deleted_at IS NULL 之后
  // —— 软删本身不被再软删（重复调用不再空推 version），「只改存活行」不再依赖调用点是否记得判重
  async function deleteSample(id) {
    await run('UPDATE samples SET deleted_at=NOW(), version=version+1 WHERE id=? AND deleted_at IS NULL', [id]);
  }

  // 日志
  async function addLog(log, conn) {
    var sql = 'INSERT INTO scan_logs (sample_id,action,role,user_id,dept,location,note) VALUES (?,?,?,?,?,?,?)';
    var params = [log.sample_id, log.action || null, log.role || null, log.user_id || null, log.dept || null, log.location || null, log.note || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  function listLogsBySample(sample_id) { return q('SELECT * FROM scan_logs WHERE sample_id = ? ORDER BY id DESC LIMIT 100', [sample_id]); }
  // 批量取样品的领出/归还日志（导出溯源用，2026-09-09）：每样品各取最近一条 CHECKOUT/RETURN_OUT，
  // 归还侧补领用人/部门/领出/应还（借用字段归还即清空），领出侧补最近归还历史
  function listCheckoutReturnLogs(sampleIds) {
    if (!sampleIds || !sampleIds.length) return Promise.resolve([]);
    var marks = sampleIds.map(function () { return '?'; }).join(',');
    return q(
      'SELECT l.sample_id, l.action, l.note, l.created_at, ' +
      "CASE WHEN l.action='CHECKOUT' THEN l.created_at END AS checkout_at, " +
      "CASE WHEN l.action='RETURN_OUT' THEN l.created_at END AS returned_at " +
      'FROM scan_logs l WHERE l.sample_id IN (' + marks + ") AND l.action IN ('CHECKOUT','RETURN_OUT') ORDER BY l.id ASC",
      sampleIds).then(function (rows) {
        // 同一样品多轮借用取最近一轮：倒序遍历首次遇到的 action 即最近
        var seen = {}, out = [];
        for (var i = rows.length - 1; i >= 0; i--) {
          var k = rows[i].sample_id + ':' + rows[i].action;
          if (seen[k]) continue;
          seen[k] = 1; out.push(rows[i]);
        }
        return out;
      });
  }
  // 2026-09-17 修复 P1-3（静默数据缺失）：原写作 ON l.id = l.sample_id —— ON 两侧同取别名 l，
  // 条件退化为 scan_logs.id = scan_logs.sample_id，samples 侧永远匹配不上（LEFT JOIN 故不报错），
  // sample_no / sample_name 两列恒为 NULL，前端列表照常渲染、后端不报错，故长期无人发现。
  // 正确口径与同文件 listBatchLogs 一致（s.id = l.sample_id）；`/api/logs` 为唯一调用方。
  function listLogs() {
    return q('SELECT l.*, s.sample_no, s.name AS sample_name FROM scan_logs l LEFT JOIN samples s ON s.id = l.sample_id ORDER BY l.id DESC LIMIT 500');
  }

  // 批量领用/归还的幂等探测（2026-09-16，设计文档 §5.5）：batchId 记在 scan_logs.note 尾部 ' [batch:<id>]'（零 DDL）。
  // 只防「同批重复提交」——返回该批次已落库的样例（sample_no 供前端标「已生效」）；跨批并发仍由 updateSample 的 CAS 兜底。
  // 代价提示：note 前置通配符走全表扫描，故每批仅调用 1 次并由调用方 LIMIT 1 判定命中；实测耗时由路由记入响应 probeMs。
  // 2026-09-17 取证收敛（§25.3.1 过渡期要求）：标记 ' [batch:<id>]' 只由 batch-scan.js:101 在
  //   applyAction 返回 logData 后追加，而批量通道的 action 被 BATCH_ACTIONS 限制为 CHECKOUT / RETURN_OUT
  //   （batch-scan.js:19,36），故补 action 维度限定 —— 用户把 'x [batch:ABCD1234]' 写进其它动作
  //   （RETURN_REQUEST 退回原因 / RETIRE_ONLY 作废原因等）的自由文本时不再误判 409。
  // 遗留耦合风险：该动作清单与 batch-scan.js 的 BATCH_ACTIONS 是两份字面量，批量通道新增动作时
  //   MUST 同步此处，否则该新动作的幂等探测静默失效（fail-open）；根治方案见评审建议（标记迁独立列）。
  function listBatchLogs(batchId) {
    return q("SELECT l.sample_id, s.sample_no FROM scan_logs l LEFT JOIN samples s ON s.id = l.sample_id WHERE l.action IN ('CHECKOUT','RETURN_OUT') AND l.note LIKE CONCAT('%[batch:', ?, ']%') LIMIT 200", [batchId]);
  }

  // 机型主数据
  function listModels() { return q('SELECT * FROM sample_models ORDER BY code ASC'); }
  function getModelById(id) { return one('SELECT * FROM sample_models WHERE id = ?', [id]); }
  function getModelByCode(code) { return one('SELECT * FROM sample_models WHERE code = ?', [code]); }
  function createModel(data) { return run('INSERT INTO sample_models (code,full_name,created_by) VALUES (?,?,?)', [data.code, data.full_name, data.created_by || null]).then(function () { return getModelByCode(data.code); }); }
  function deleteModel(id) { return run('DELETE FROM sample_models WHERE id=?', [id]); }
  function countSamplesByModel(code) { return q('SELECT COUNT(*) as c FROM samples WHERE deleted_at IS NULL AND model = ?', [code]).then(function (rows) { return rows[0].c; }); }
  function listLegacyModels() { return q("SELECT DISTINCT model AS code FROM samples WHERE deleted_at IS NULL AND model IS NOT NULL AND model != '' ORDER BY model ASC").then(function (rows) { return rows.map(function (r) { return r.code; }); }); }

  // 查询域（dao-list.js）合并导出：接口与拆分前完全一致
  var daoList = createDaoList(deps);

  return Object.assign({
    nextSampleNo, createSample, getSampleById, getSampleByNo, getSampleByToken, updateSample, deleteSample,
    addLog, listLogsBySample, listLogs, listCheckoutReturnLogs, listBatchLogs,
    listModels, getModelById, getModelByCode, createModel, deleteModel, countSamplesByModel, listLegacyModels
  }, daoList);
};
