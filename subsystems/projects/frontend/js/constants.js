// constants.js — 项目追踪子系统常量（不修改共享 api-base.js，避免跨系统影响）
const ROLE_CN = Object.assign({ PM: '项目经理(PM)' }, { ADMIN: '管理员', RD: '研发(RD)', ME: '生技(ME)', QA: '品保(QA)', CUSTODY: '保管(CUSTODY)' });
const PRIORITY_CN = { H: '高', M: '中', L: '低' };
const CATEGORY_CN = { device: '设备', quality: '质量', process: '流程', safety: '安全', other: '其他' };
const TASK_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成', OVERDUE: '已延期' };
const SUBTASK_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成' };
// v2：表单下拉选项（弹窗复用）
const CATEGORY_KEYS = Object.keys(CATEGORY_CN);
const PRIORITY_KEYS = Object.keys(PRIORITY_CN);

// C2 修复：HTML 转义（所有用户输入字段渲染必须经 esc，防存储型 XSS）
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(m){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]; }); }
