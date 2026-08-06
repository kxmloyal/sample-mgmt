// shared/csv.js — 通用 CSV 导出工具（BOM UTF-8，供各子系统列表导出复用，AGENTS.md §21）
// 禁止子系统各自重复实现 CSV 生成；本文件不绑定任何子系统

/** 值转义：含逗号/引号/换行时双引号包裹，内部引号 "" 转义；null/undefined → 空串 */
function esc(v) {
  var s = String(v == null ? '' : v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * 生成 BOM CSV 文本
 * @param {Array<Object>} rows 数据行
 * @param {Array<{key:string,label:string,fmt?:Function}>} cols 列定义
 *        fmt: (value, row) => string 可选格式化（如状态中文映射）
 * @returns {string} BOM(\uFEFF) 前缀的 CSV 文本（\r\n 换行）
 */
function toCsv(rows, cols) {
  var lines = [cols.map(function (c) { return esc(c.label); }).join(',')];
  (rows || []).forEach(function (row) {
    lines.push(cols.map(function (c) {
      var v = row == null ? '' : row[c.key];
      return esc(c.fmt ? c.fmt(v, row) : v);
    }).join(','));
  });
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * 发送 CSV 下载响应
 * @param {Object} res Express res
 * @param {string} filename 建议 samples-YYYYMMDD-HHmm.csv
 * @param {string} csv toCsv 输出
 */
function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename));
  res.send(csv);
}

module.exports = { toCsv, sendCsv };
