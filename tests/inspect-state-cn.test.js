// tests/inspect-state-cn.test.js — 导出 CSV「复检状态」列口径单测
// 被测：subsystems/samples/backend/inspect-state-cn.js（纯函数，无 DB / 无 dotenv 依赖，任何环境可跑）
// 背景（2026-09-16）：该函数自 routes-samples.js 外迁并补齐「不适用」判定——此前已作废/退回审核中/未发行
//   的样品导出仍显示「正常」，与页面判定不一致（设计文档 §6.2 / 验收 C5）。
const fs = require('fs');
const path = require('path');
const { inspectStateCn } = require('../subsystems/samples/backend/inspect-state-cn');

const DAY = 86400000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
// N 天前 + 1 小时余量：函数内 Date.now() 晚于本行毫秒，紧贴整数天会被 Math.ceil 抬成 N+1 天（断言抖动）
const ago = (days) => iso(now - days * DAY + 3600000);

describe('inspectStateCn 导出复检状态口径', () => {
  it('不适用状态（RETIRED/RETURNING/NEW/PRODUCED）→ 不适用，无论日期在过去/未来/为空', () => {
    for (const status of ['RETIRED', 'RETURNING', 'NEW', 'PRODUCED']) {
      expect(inspectStateCn({ status, next_inspect_at: iso(now - 30 * DAY) })).toBe('不适用');
      expect(inspectStateCn({ status, next_inspect_at: iso(now + 30 * DAY) })).toBe('不适用');
      expect(inspectStateCn({ status, next_inspect_at: null })).toBe('不适用');
    }
  });

  it('CHECKED_OUT（领用中）→ 领用中·暂停复检，不再报逾期', () => {
    expect(inspectStateCn({ status: 'CHECKED_OUT', next_inspect_at: iso(now - 5 * DAY) })).toBe('领用中·暂停复检');
    expect(inspectStateCn({ status: 'CHECKED_OUT', next_inspect_at: iso(now + 5 * DAY) })).toBe('领用中·暂停复检');
  });

  it('IN_CUSTODY（唯一完整生效态）三态与 ceil 取整零变化', () => {
    expect(inspectStateCn({ status: 'IN_CUSTODY', next_inspect_at: iso(now - 1) })).toMatch(/^逾期1天$/);
    expect(inspectStateCn({ status: 'IN_CUSTODY', next_inspect_at: ago(3) })).toBe('逾期3天');
    expect(inspectStateCn({ status: 'IN_CUSTODY', next_inspect_at: iso(now + 2 * DAY) })).toBe('近7天到期');
    expect(inspectStateCn({ status: 'IN_CUSTODY', next_inspect_at: iso(now + 30 * DAY) })).toBe('正常');
  });

  it('RELEASED 保留三态文字（导出列不区分颜色）', () => {
    expect(inspectStateCn({ status: 'RELEASED', next_inspect_at: ago(2) })).toBe('逾期2天');
  });

  it('适用态但字段为空 / 空行 → —', () => {
    expect(inspectStateCn({ status: 'IN_CUSTODY', next_inspect_at: null })).toBe('—');
    expect(inspectStateCn({ status: 'RELEASED', next_inspect_at: '' })).toBe('—');
    expect(inspectStateCn(null)).toBe('—');
    expect(inspectStateCn(undefined)).toBe('—');
  });
});

describe('routes-samples.js 导出列契约（外迁后）', () => {
  const SRC = path.join(__dirname, '../subsystems/samples/backend/routes-samples.js');
  const src = fs.readFileSync(SRC, 'utf8');

  it('不再就地定义 inspectStateCn，改为 require 唯一落点', () => {
    expect(src).not.toMatch(/function inspectStateCn/);
    expect(src).not.toMatch(/INSPECT_SOON_DAYS/);
    expect(src).toContain("require('./inspect-state-cn')");
  });

  it('CSV 列顺序不变：状态 → 复检状态 → 制作时间', () => {
    const iStatus = src.indexOf("{ key: 'status', label: '状态'");
    const iInspect = src.indexOf("{ key: 'next_inspect_at', label: '复检状态'");
    const iProduced = src.indexOf("{ key: 'produced_at', label: '制作时间'");
    expect(iStatus).toBeGreaterThan(0);
    expect(iInspect).toBeGreaterThan(iStatus);
    expect(iProduced).toBeGreaterThan(iInspect);
  });
});
