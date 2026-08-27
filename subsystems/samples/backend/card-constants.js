// routes/card-constants.js — 标示卡/标签共享常量
// 数据来源：data/limit-items.json + data/source-types.json（唯一数据源）
// 由 card-html.js / card-print-html.js / card-page.js 共同引用，避免重复定义

const limitItems = require('../../../data/limit-items.json');
const SOURCE_TYPES = require('../../../data/source-types.json');

// 构建 code→label 映射对象（后端标示卡 HTML 生成时快速查找）
const LIMIT_LABELS = {};
limitItems.forEach(item => { LIMIT_LABELS[item.code] = item.label; });

// 来源 code→简称：打印标示卡等窄小空间用（前端下拉已用：客供(C)/元山(T)/塔岗(G)）
// 全称见 data/source-types.json（SOURCE_TYPES），简称用于窄小打印卡避免撑宽整卡
const SOURCE_TYPES_SHORT = { C: '客供', T: '元山', G: '塔岗' };

// 标签纸预设尺寸（mm）：小号/中标/大号，标签页与标示卡页共用，禁止各自硬编码（1mm≈3.7795px @96dpi）
const PRESET_MM = { small: [37, 18], medium: [52, 25], large: [60, 40] };

module.exports = { LIMIT_LABELS, SOURCE_TYPES, SOURCE_TYPES_SHORT, PRESET_MM };
