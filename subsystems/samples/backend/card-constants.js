// routes/card-constants.js — 标示卡/标签共享常量
// 数据来源：data/limit-items.json + data/source-types.json（唯一数据源）
// 由 card-html.js 和 card-page.js 共同引用，避免重复定义

const limitItems = require('../../../data/limit-items.json');
const SOURCE_TYPES = require('../../../data/source-types.json');

// 构建 code→label 映射对象（后端标示卡 HTML 生成时快速查找）
const LIMIT_LABELS = {};
limitItems.forEach(item => { LIMIT_LABELS[item.code] = item.label; });

module.exports = { LIMIT_LABELS, SOURCE_TYPES };
