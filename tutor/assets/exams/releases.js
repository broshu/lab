/* Scheduled exams: ciphertext stays unreadable until the public release beacon exists. */
(() => {
  'use strict';
  const pending = new Set();
  const failures = new Set();
  let timer;
  const chapters = () => (window.HOMEWORK_DATA?.books || []).flatMap(b => b.chapters).filter(c => c.sealed);
  const due = c => Date.now() >= Date.parse(c.releaseAt);
  const dateLabel = c => new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(c.releaseAt));
  const update = c => window.dispatchEvent(new CustomEvent('exam-release-updated', { detail: { id: c.id } }));

  async function tryUnlock(c) {
    if (!c.sealed || !due(c) || pending.has(c.id)) return;
    pending.add(c.id);
    failures.delete(c.id);
    update(c);
    try {
      const { unlock } = await import('./timelock.js?v=1');
      const result = await unlock(c);
      Object.assign(c, result);
      delete c.sealed;
    } catch (error) {
      failures.add(c.id);
      console.warn('考试暂未能开放，将自动重试。', error);
    } finally {
      pending.delete(c.id);
      update(c);
    }
  }

  function check() {
    clearTimeout(timer);
    const locked = chapters();
    locked.filter(due).forEach(tryUnlock);
    if (locked.length) {
      const next = Math.min(...locked.map(c => Date.parse(c.releaseAt) - Date.now()));
      timer = setTimeout(check, Math.max(1000, Math.min(30000, next > 0 ? next : 30000)));
    }
  }

  window.EXAM_RELEASES = {
    label(c) {
      if (pending.has(c.id)) return '正在开放…';
      if (failures.has(c.id)) return '暂未能开放，点击重试';
      return `🔒 已锁定 · ${dateLabel(c)} 开放`;
    },
    retry: tryUnlock,
    due
  };
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setTimeout(check, 0);
})();
