// api.js — 项目追踪 API 封装（复用共享 api()，仅收敛端点字符串）
const PApi = {
  projects: p => '/api/projects' + (p ? '/' + p : ''),
  projectTasks: pid => '/api/projects/' + pid + '/tasks',
  task: tid => '/api/projects/tasks/' + tid,
  taskSub: (tid, sid) => '/api/projects/tasks/' + tid + '/subtasks' + (sid ? '/' + sid : ''),
  taskComments: tid => '/api/projects/tasks/' + tid + '/comments',
  taskDeps: (tid, depId) => '/api/projects/tasks/' + tid + '/deps' + (depId ? '/' + depId : ''),
  taskFiles: (tid, fid) => '/api/projects/tasks/' + tid + '/files' + (fid ? '/' + fid : ''),
  taskLinks: (tid, refType, refId) => '/api/projects/tasks/' + tid + '/links' + (refType ? '/' + refType + (refId ? '/' + refId : '') : ''),
  stats: '/api/projects/stats',
  exportCsv: '/api/projects/tasks/export',
  workflow: '/api/projects/workflow',
  // OA 能力移植（方案A一期）：里程碑/风险/预算扩展
  milestones: pid => '/api/projects/' + pid + '/milestones',
  milestone: mid => '/api/projects/milestones/' + mid,
  milestoneAchieve: mid => '/api/projects/milestones/' + mid + '/achieve',
  risks: pid => '/api/projects/' + pid + '/risks',
  risk: rid => '/api/projects/risks/' + rid,
  riskResolve: rid => '/api/projects/risks/' + rid + '/resolve',
  extras: pid => '/api/projects/' + pid + '/extras'
};
