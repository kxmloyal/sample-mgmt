// views/notifications.js — 站内通知铃铛 + 面板（2026-09-08 方案B-②）
// 轮询 60s 拉未读数；面板内列表/全部已读/单条已读；点击通知跳转 link 深链
var _ntfTimer = null;

// 启动轮询（登录成功后调用一次）
function ntfStart() {
  ntfRefresh();
  if (_ntfTimer) clearInterval(_ntfTimer);
  _ntfTimer = setInterval(ntfRefresh, 60000);
}

// 拉未读数并更新徽标
async function ntfRefresh() {
  try {
    const r = await api('GET', PApi.notifUnread);
    const b = document.getElementById('ntf-badge');
    if (!b) return;
    b.textContent = r.unread > 99 ? '99+' : (r.unread || '');
    b.style.display = r.unread > 0 ? 'flex' : 'none';
  } catch (e) { /* 静默：通知失败不影响主流程 */ }
}

// 打开/关闭通知面板
async function ntfToggle() {
  const panel = document.getElementById('ntf-panel');
  if (!panel) return;
  if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  panel.innerHTML = '<div class="ntf-loading muted">加载中…</div>';
  try {
    const list = await api('GET', PApi.notifications);
    if (!list.length) { panel.innerHTML = '<div class="ntf-loading muted">暂无通知</div>'; return; }
    const unread = list.filter(x => !x.is_read).length;
    panel.innerHTML =
      '<div class="ntf-head"><b>通知</b>' +
      (unread ? '<a class="link" onclick="ntfReadAll()">全部已读</a>' : '') +
      '</div>' +
      '<div class="ntf-list">' + list.map(function (x) {
        const icon = { ASSIGN: '👤', STATUS: '✅', OVERDUE: '⏰', CHANGE_APPROVAL: '📋', MENTION: '💬' }[x.type] || '🔔';
        return '<div class="ntf-item' + (x.is_read ? '' : ' ntf-unread') + '" onclick="ntfClick(' + x.id + ',\'' + (x.link || '').replace(/'/g, '') + '\')">' +
          '<span class="ntf-icon">' + icon + '</span>' +
          '<span class="ntf-body"><b>' + esc(x.title) + '</b>' +
          (x.body ? '<span class="muted">' + esc(x.body) + '</span>' : '') +
          '<span class="ntf-time muted">' + String(x.created_at || '').slice(0, 16).replace('T', ' ') + '</span></span>' +
          (x.is_read ? '' : '<span class="ntf-dot"></span>') +
          '</div>';
      }).join('') + '</div>';
  } catch (e) {
    panel.innerHTML = '<div class="ntf-loading muted">加载失败</div>';
  }
}

// 点击通知：标已读 + 跳深链 + 关面板
async function ntfClick(id, link) {
  try { await api('POST', PApi.notifRead, { id: id }); } catch (e) {}
  ntfToggle();
  ntfRefresh();
  if (link) location.hash = link.replace(/^#/, '#/');
}

// 全部已读
async function ntfReadAll() {
  try { await api('POST', PApi.notifRead, {}); } catch (e) {}
  ntfToggle();
  ntfRefresh();
}
