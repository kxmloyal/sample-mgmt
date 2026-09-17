// sample-type.js — sample_type 字段的唯一校验器（2026-09-17，AGENTS.md §25.2.1 / §25.3.3）
// 背景：sample_type 有 4 个写入口（routes-samples 建样/PUT 标示卡、scan-actions RELEASE_RE_RELEASE/EDIT_CARD，
// 另有批量建样行级），此前只做 .trim() 或直存、无白名单 → 存储型 XSS（评审 P1-2）。
// 合法值：''（未指定）、'OK'、'NG'；trim 后比较，兼容前端带空白提交。
// 固定文案与「可直接 return 的 400」放本模块，是为让两个已越 70% 预警线的大文件（routes-samples/scan-actions）
// 只写一次校验调用（§7.1 容量与 §25.3.3 单一校验器两条一起满足）。
const SAMPLE_TYPE_MSG = '请选择有效的样品类型（OK样品/NG样品）';

// 唯一校验器：合法返回 true。所有写入口 MUST 经它判定，禁止各处复制 ['OK','NG'] 字面量。
function isValidSampleType(v) {
  return ['', 'OK', 'NG'].includes(String(v).trim());
}

// 非法值 → 可直接 return 的 { status, error }（scan-actions 的返回约定）；合法 → null。
// 与 validateCardVersion「合法返回 null」同风格，便于调用点一行处理。
function sampleTypeReject(v) {
  return isValidSampleType(v) ? null : { status: 400, error: SAMPLE_TYPE_MSG };
}

// 审计日志 role 列取单值（VARCHAR(20)，多角色并集串会截断，故不写 roles.join）。
// 语义与旧 u.role 完全一致：roles 非空取首角色，否则回退 u.role。
// 用途：scan_logs.role 等「记录操作人角色」的留痕字段——不是权限判定，权限判定一律用 hasRole(u, [...])。
function primaryRole(u) {
  if (!u) return null;
  return (Array.isArray(u.roles) && u.roles.length) ? u.roles[0] : u.role;
}

module.exports = { isValidSampleType, sampleTypeReject, primaryRole, SAMPLE_TYPE_MSG };
