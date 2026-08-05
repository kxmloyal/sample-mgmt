// subsystems/projects/db/dao-stats.js — 看板统计聚合（工厂，由 dao.js 注入依赖）
// Task 7：弱一致只读聚合（项目数/任务数/完成率/三维分布/近 8 周 DONE 趋势）
// 独立文件：统计聚合与任务/项目 DAO 职责分离，防 dao.js 容量超限
// 依赖注入：deps = { q, one, run, nowISO, fetchOne, fetchAll }，fetchOne/fetchAll 由 dao.js 定义传入
module.exports = function createStatsDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO, fetchOne = deps.fetchOne, fetchAll = deps.fetchAll;

  // ===== 看板统计（弱一致只读聚合，无事务） =====
  async function statsDashboard(conn) {
    const projectCount = (await fetchOne(conn, 'SELECT COUNT(*) AS c FROM projects')).c;
    const total = (await fetchOne(conn, 'SELECT COUNT(*) AS c FROM project_tasks')).c;
    const done = (await fetchOne(conn, "SELECT COUNT(*) AS c FROM project_tasks WHERE status='DONE'")).c;
    const inProgress = (await fetchOne(conn, "SELECT COUNT(*) AS c FROM project_tasks WHERE status='IN_PROGRESS'")).c;
    const notStarted = (await fetchOne(conn, "SELECT COUNT(*) AS c FROM project_tasks WHERE status='NOT_STARTED'")).c;
    const overdue = (await fetchOne(conn,
      "SELECT COUNT(*) AS c FROM project_tasks WHERE status<>'DONE' AND planned_date < CURDATE()")).c;
    // 三维分布
    const categoryDist = await fetchAll(conn, 'SELECT category, COUNT(*) AS c FROM project_tasks GROUP BY category');
    const priorityDist = await fetchAll(conn, 'SELECT priority, COUNT(*) AS c FROM project_tasks GROUP BY priority');
    const statusDist = await fetchAll(conn, 'SELECT status, COUNT(*) AS c FROM project_tasks GROUP BY status');
    // 近 8 周每周 DONE 数
    const trend = await fetchAll(conn,
      "SELECT DATE_FORMAT(created_at, '%Y-%u') AS wk, COUNT(*) AS c FROM project_tasks " +
      "WHERE status='DONE' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK) " +
      'GROUP BY DATE_FORMAT(created_at, \'%Y-%u\') ORDER BY wk');
    return {
      project_count: projectCount, total_tasks: total, done_count: done, in_progress_count: inProgress,
      not_started_count: notStarted, overdue_count: overdue,
      completion_rate: total ? Math.round(done / total * 100) : 0,
      category_dist: categoryDist, priority_dist: priorityDist, status_dist: statusDist, trend
    };
  }

  return { statsDashboard };
};
