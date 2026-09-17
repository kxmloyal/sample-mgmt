// tests/samples-dao.test.js — 样品 DAO 层静态断言（2026-09-17，对应评审 P1-3 / P2-2 / P3-21）
// 风格同 tests/samples-status-multi.test.js：fs.readFileSync 读源码 + 正则断言 SQL 字面量，不连数据库
// （本仓库为评审镜像，无 node_modules 且禁止连库；samples manifest.deployed=true，禁止任何数据写入）。
// 覆盖三条规则：
//   §25.3.2 时钟同源（P2-2）：TIMESTAMP 列只与 NOW() 比较，ISO 字符串列只与 UTC_TIMESTAMP() 规范化值比较
//   §25.3.6 DAO 写语句自带存活条件（P3-21）：UPDATE/DELETE 凡目标表有 deleted_at 列 MUST 带 deleted_at IS NULL
//   §25.3.1 机器可读标记过渡期收敛（P2-2 批量幂等键）：LIKE 探测 MUST 至少限定 action 维度
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');
const DAO = 'subsystems/samples/db/dao.js';
const DAO_LIST = 'subsystems/samples/db/dao-list.js';
const SCHEMA = 'subsystems/samples/db/schema.sql';

// 去除所有空白，让跨行拼接的 SQL 能被单行正则命中
const flat = s => s.replace(/\s+/g, '');
// 取单个顶层函数的函数体（从 `function 名(` 到该函数最后一个 "\n  }"），用于把断言钉在具体语句上
const body = (src, name) => {
  const m = src.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n  \\}'));
  return m ? m[0] : '';
};

describe('样品 DAO 静态断言（P1-3 / P2-2 / P3-21）', () => {
  describe('① JOIN 条件两侧不得同取一个别名（P1-3 静默数据缺失）', () => {
    it('listLogs 的 ON 两侧取自不同别名，且使用 s.id = l.sample_id', () => {
      const sql = flat(body(read(DAO), 'listLogs'));
      expect(sql).toContain('LEFTJOINsamplessONs.id=l.sample_id');
      // 钉死回归形态：两侧同取 l 时条件退化为 scan_logs.id = scan_logs.sample_id，samples 侧永不匹配，
      // LEFT JOIN 下不报错、sample_no/sample_name 恒为 NULL —— 静默数据缺失的原始缺陷
      expect(sql).not.toContain('ONl.id=l.sample_id');
      const alias = sql.match(/ON([A-Za-z_]\w*)\.\w+=([A-Za-z_]\w*)\.\w+/);
      expect(alias).not.toBeNull();
      expect(alias[1]).not.toBe(alias[2]);
    });

    it('全仓 samples DB 层无「JOIN ON 两侧同别名」的自连接退化（通用检测，含 listBatchLogs）', () => {
      const bad = [];
      const joins = [];
      for (const f of [DAO, DAO_LIST]) {
        // 剥离行注释后再扫描：注释里出现的「JOIN ...」说明文字会被本正则误判为 SQL
        const codeOnly = read(f).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        // 跨行拼接的 SQL 片段（'...' + "...") 归并为单行，但保留标识符之间的空白
        const sql = codeOnly.replace(/['"]\s*\+\s*['"]/g, ' ');
        const re = /JOIN\s+([A-Za-z_]\w*)(?:\s+AS)?\s+([A-Za-z_]\w*)\s+ON\s+([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)/g;
        let m;
        while ((m = re.exec(sql)) !== null) {
          joins.push(m[3] + '.' + m[4] + '=' + m[5] + '.' + m[6]);
          // 两侧同取一个别名 = ON 退化为同表自比较，被 JOIN 的表永不匹配 → 派生列恒为 NULL
          if (m[3] === m[5]) bad.push(f + ': ' + m[0]);
        }
      }
      expect(bad).toEqual([]);
      // 断言检测器确实扫到了 JOIN（否则正则在改动后空转，测试会假性通过）
      expect(joins.length).toBeGreaterThanOrEqual(3);
      expect(joins).toContain('s.id=l.sample_id');
    });
  });

  describe('② 时间窗口谓词与列类型同源（P2-2 时钟口径，§25.3.2）', () => {
    it('schema.sql：updated_at 是 TIMESTAMP（修复的前提证据）', () => {
      const schema = read(SCHEMA);
      expect(schema).toContain('updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    });

    it('listReturningOverdue 的 updated_at 谓词用 NOW()，不再与 UTC_TIMESTAMP() 混用', () => {
      const sql = flat(body(read(DAO_LIST), 'listReturningOverdue'));
      const pred = sql.match(/updated_at<([A-Za-z_]+)\(\)/);
      expect(pred).not.toBeNull();
      expect(pred[1]).toBe('NOW'); // TIMESTAMP 列只能与 NOW() 比较，否则产生固定 8h 偏移（72h 退化为 80h）
      expect(sql).not.toContain('updated_at<UTC_TIMESTAMP()');
    });

    it('全文件时钟同源：UTC_TIMESTAMP() 只用于 ISO 字符串列规范化，不与 TIMESTAMP 列比较', () => {
      const src = read(DAO_LIST);
      // 剥离行注释后再计数：本文件注释多处提及 UTC_TIMESTAMP()（说明文字），只有代码使用才构成谓词
      const codeOnly = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
      const utcUses = codeOnly.match(/UTC_TIMESTAMP\(\)/g) || [];
      // 三处：NOW_UTC / NOW_UTC_7D（供 ISO 字符串列）与 aggregateModelsWall 的局部 NOW（同口径）
      expect(utcUses.length).toBe(3);
      // 三个使用点一律包在 LEFT(...,19) 规范化外壳内，即只与 ISO 字符串列同源比较
      const utcLines = codeOnly.split('\n').filter(l => l.includes('UTC_TIMESTAMP()'));
      expect(utcLines.length).toBe(3);
      for (const l of utcLines) expect(l).toContain('LEFT(');
      expect(codeOnly).toContain("var NOW_UTC =");
      // 与 UTC 规范化值比较的列必须是 ISO 字符串列（VARCHAR(24)），MUST 不是 TIMESTAMP 列
      const isoCols = (codeOnly.match(/(next_inspect_at|expected_return_at)[^;]*?(NOW_UTC|NOW_UTC_7D|ISO_UTC|ISO_RET)/g) || []);
      expect(isoCols.length).toBeGreaterThan(0);
      // dao.js 内不得出现任何 UTC_TIMESTAMP() 谓词（其时间列均为 TIMESTAMP 或 ISO 字符串）：
      // 同样先剥离行注释，否则本文件的说明性注释会被计入
      const daoCodeOnly = read(DAO).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
      expect(daoCodeOnly).not.toContain('UTC_TIMESTAMP()');
    });
  });

  describe('③ DAO 写语句自带存活条件（P3-21，§25.3.6）', () => {
    it('deleteSample 的 UPDATE 带 AND deleted_at IS NULL', () => {
      const sql = flat(body(read(DAO), 'deleteSample'));
      expect(sql).toContain('UPDATEsamplesSETdeleted_at=NOW()');
      expect(sql).toContain('WHEREid=?ANDdeleted_atISNULL');
    });

    it('updateSample 保留原有 CAS 条件，且未误加存活条件（软删行仍可被状态机回读，改动零漂移）', () => {
      const src = flat(read(DAO));
      expect(src).toContain("'WHEREid=?'+(cas?'ANDversion=?':'')");
      expect(body(read(DAO), 'updateSample')).not.toContain('deleted_at IS NULL');
    });

    it('样本外写语句被显式跳过：sample_models 无 deleted_at 列，故不得加该条件', () => {
      expect(read(DAO)).not.toContain('DELETE FROM sample_models WHERE id=? AND deleted_at IS NULL');
      const sql = flat(body(read(DAO), 'deleteModel'));
      expect(sql).toContain('DELETEFROMsample_modelsWHEREid=?');
    });

    it('本文件写语句清单已穷尽核对：INSERT 与无 deleted_at 列的表不加该条件', () => {
      const src = read(DAO);
      // scan_logs 无 deleted_at 列（schema.sql），addLog 为 INSERT，均豁免存活条件
      expect(src).not.toContain('INSERT INTO scan_logs (sample_id,action,role,user_id,dept,location,note,deleted_at)');
      // samples 表建表语句内不含 deleted_at 列 —— 该列由迁移添加（schema.sql 仅注释提及）
      // 剥离行注释后再判定：表定义块内确有说明性注释提到 deleted_at，不能直接 not.toContain
      const schema = read(SCHEMA);
      const block = schema.match(/CREATE TABLE IF NOT EXISTS samples \(([\s\S]*?)\) ENGINE/)[1];
      const cols = block.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      expect(cols).not.toContain('deleted_at');
      expect(schema).toContain('deleted_at 列由迁移 migrateSamplesSoftDelete 添加');
      // MUST 与迁移保持同一事实来源
      expect(read('db/migrations/samples.js')).toContain("ALTER TABLE samples ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL");
    });
  });

  describe('④ 批量幂等探测限定 action 维度（P2-2 过渡期收敛，§25.3.1）', () => {
    it('listBatchLogs 探测条件含 action 限定，且仅覆盖批量通道的 CHECKOUT / RETURN_OUT', () => {
      const sql = flat(body(read(DAO), 'listBatchLogs'));
      expect(sql).toContain("l.actionIN('CHECKOUT','RETURN_OUT')");
      expect(sql).toContain("l.noteLIKECONCAT('%[batch:',")
    });

    it('action 清单与批量通道 BATCH_ACTIONS 逐项一致（两份字面量的漂移守卫）', () => {
      const src = read(DAO);
      const batch = read('subsystems/samples/backend/batch-scan.js');
      const decl = batch.match(/const BATCH_ACTIONS = \[([^\]]*)\]/);
      expect(decl).not.toBeNull();
      const actions = decl[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
      expect(actions).toEqual(['CHECKOUT', 'RETURN_OUT']);
      for (const a of actions) expect(src).toContain("'" + a + "'");
    });

    it('标记仍由 batch-scan.js 单一写入点追加（探测侧收敛不改变写入侧）', () => {
      const batch = read('subsystems/samples/backend/batch-scan.js');
      // 写入点唯一：全文件只有一行做 note 与标记的拼接（另一处 ' [batch:' 在第 8 行注释内）
      const writeLines = batch.split('\n').filter(l => l.includes("[batch:' + batchId + ']'"));
      expect(writeLines.length).toBe(1);
      expect(writeLines[0]).toContain('ar.logData.note');
    });
  });

  describe('⑤ 已知缺陷观察（不在本轮修复范围，仅锁定现状防误改）', () => {
    it('samples dao.js 仍未导出 fetchAll/fetchOne（跨子系统借用 D.fetchAll 的既有缺陷）', () => {
      const src = read(DAO);
      // 私有 fetchOne 定义在文件内但不在导出清单；补导出会触发 db.js 前缀改名陷阱，须三步独立提交
      expect(src).toContain('async function fetchOne(conn, sql, params)');
      const exp = src.match(/return Object\.assign\(\{([\s\S]*?)\}, daoList\)/);
      expect(exp).not.toBeNull();
      expect(exp[1]).not.toContain('fetchOne');
      expect(exp[1]).not.toContain('fetchAll');
    });
  });
});
