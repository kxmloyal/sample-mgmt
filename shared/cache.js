// shared/cache.js — 轻量进程内 TTL 缓存（仅用于低变字典数据，如机型列表/阈值配置）
// 用途：缓存低频变、可容忍短暂过期(≥TTL)的查询结果，减少对共享字典表的重复查询。
// 说明：非持久化，进程重启自动失效；写操作应由调用方显式 del 失效以即时刷新。
var store = Object.create(null);

// 读取；命中且未过期返回 value，过期/未命中返回 undefined
function get(key) {
  var hit = store[key];
  if (!hit) return undefined;
  if (hit.expiry && hit.expiry < Date.now()) {
    delete store[key];
    return undefined;
  }
  return hit.value;
}

// 写入；ttlMs 缺省 60000ms
function set(key, value, ttlMs) {
  store[key] = { value: value, expiry: Date.now() + (ttlMs || 60000) };
}

// 删除（写操作后失效用）
function del(key) {
  delete store[key];
}

module.exports = { get: get, set: set, del: del };
