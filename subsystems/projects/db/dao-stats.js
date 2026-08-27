// subsystems/projects/db/dao-stats.js — 看板统计聚合（工厂，由 dao.js 注入依赖）
// Task 7：弱一致只读聚合（项目数/任务数/完成率/三维分布/近 8 周 DONE 趋势）
// 独立文件：统计聚合与任务/项目 DAO 职责分离，防 dao.js 容量超限
// 依赖注入：deps = { q, one, run, nowISO, fetchOne, fetchAll }，fetchOne/fetchAll 由 dao.js 定义传入
module.exports = function createStatsDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO, fetchOne = deps.fetchOne, fetchAll = deps.fetchAll;

  // ===== 看板统计（弱一致只读聚合，无事务） =====
  // 性能优化(A)：原 10 次串行池往返 → 标量合并为 1 次条件聚合 + 4 个分发/趋势集合并行，显著降低看板首查延迟
  async function statsDashboard(conn) {
    // 标量统计：6 个 COUNT 合并为 1 次条件聚合（SUM(status=..)）；overdue 条件并入，避免单独全扫描
    const scalar = await fetchOne(conn,
      'SELECT ' +
      '(SELECT COUNT(*) FROM projects) AS project_count, ' +
      'COUNT(*) AS total_tasks, ' +
      "SUM(status='DONE') AS done_count, " +
      "SUM(status='IN_PROGRESS') AS in_progress_count, " +
      "SUM(status='NOT_STARTED') AS not_started_count, " +
      "SUM(status<>'DONE' AND planned_date < CURDATE()) AS overdue_count " +
      'FROM project_tasks');
    const projectCount = Number(scalar.project_count) || 0;
    const total = Number(scalar.total_tasks) || 0;
    const done = Number(scalar.done_count) || 0;
    const inProgress = Number(scalar.in_progress_count) || 0;
    const notStarted = Number(scalar.not_started_count) || 0;
    const overdue = Number(scalar.overdue_count) || 0;
    // 三维分布 + 近 8 周趋势：4 个独立聚合并行（串行→并发，等待取 max 而非累加）
    const [categoryDist, priorityDist, statusDist, trend] = await Promise.all([
      fetchAll(conn, 'SELECT category, COUNT(*) AS c FROM project_tasks GROUP BY category'),
      fetchAll(conn, 'SELECT priority, COUNT(*) AS c FROM project_tasks GROUP BY priority'),
      fetchAll(conn, 'SELECT status, COUNT(*) AS c FROM project_tasks GROUP BY status'),
      fetchAll(conn,
        "SELECT DATE_FORMAT(created_at, '%Y-%u') AS wk, COUNT(*) AS c FROM project_tasks " +
        "WHERE status='DONE' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK) " +
        "GROUP BY DATE_FORMAT(created_at, '%Y-%u') ORDER BY wk")
    ]);
    return {
      project_count: projectCount, total_tasks: total, done_count: done, in_progress_count: inProgress,
      not_started_count: notStarted, overdue_count: overdue,
      completion_rate: total ? Math.round(done / total * 100) : 0,
      category_dist: categoryDist, priority_dist: priorityDist, status_dist: statusDist, trend
    };
  }

  return { statsDashboard };
};
