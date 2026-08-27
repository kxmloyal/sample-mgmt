// subsystems/control/frontend/js/constants/label.js — 管制标签纸尺寸常量与 contain 缩放
// 尺寸单位 mm（毫米），与后端标签 HTML 渲染保持语义一致；仅前端预览/打印排版用。

// 预设标签纸尺寸（s/m/l 三档），与文档 ± 标准口径一致
var PRESET_MM = {
  small: { key: 'small', label: '小（37×18mm）', w: 37, h: 18 },
  medium: { key: 'medium', label: '中（52×25mm）', w: 52, h: 25 },
  large: { key: 'large', label: '大（60×40mm）', w: 60, h: 40 }
};

// 自定义区间 30~150mm（超出则取边界）
function controlClampMm(v) { return Math.min(150, Math.max(30, Number(v) || 30)); }

// 预览基准显示框（px）：容器最大宽 / 高，用于计算 contain 缩放
var CONTOL_LABEL_BOX = { w: 300, h: 340 };

/**
 * contain 缩放：在基准显示框内等比缩放标签纸，返回 { scale, width, height }。
 * 超小尺寸按 1:1 显示（scale 最小 1），宽高单位换算 px（1mm ≈ 3.78px）。
 * @param {number} w 标签宽（mm）
 * @param {number} h 标签高（mm）
 */
function controlCalcLabelRatio(w, h) {
  w = Number(w) || 0; h = Number(h) || 0;
  if (!w || !h) return { scale: 1, width: 0, height: 0 };
  var ratio = Math.min(CONTOL_LABEL_BOX.w / w, CONTOL_LABEL_BOX.h / h, 4);
  return { scale: ratio, width: Math.round(w * ratio * 3.78), height: Math.round(h * ratio * 3.78) };
}
