// 后台的两张页面：登录页和提问记录页。按匿名会话归并，展开后读取完整问答。

const BASE_STYLE = String.raw`
    :root { color-scheme: light dark; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }`;

/** @param {boolean} showError */
export function loginPage(showError = false) {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Tutor · 后台登录</title>
  <style>${BASE_STYLE}
    body { min-height: 100vh; display: grid; place-items: center; margin: 0; background: #f7f7f5; color: #111; }
    main { width: min(390px, calc(100% - 32px)); padding: 28px; border: 1px solid #d9d9d4; border-radius: 10px; background: #fff; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0; color: #646464; line-height: 1.6; }
    form { display: grid; gap: 12px; margin-top: 22px; }
    label { font-size: 14px; font-weight: 650; }
    input, button { min-height: 42px; border: 1px solid #b8b8b1; border-radius: 6px; padding: 8px 10px; font: inherit; }
    button { border-color: #111; background: #111; color: #fff; cursor: pointer; }
    .error { margin-top: 16px; color: #a61b1b; font-size: 14px; }
    @media (prefers-color-scheme: dark) { body { background: #161616; color: #eee; } main { border-color: #3a3a38; background: #20201f; } p { color: #b8b8b1; } input { border-color: #555; background: #171717; color: #fff; } button { border-color: #e8e8e1; background: #e8e8e1; color: #151515; } .error { color: #ffb4ab; } }
  </style>
</head>
<body>
  <main>
    <h1>AI Tutor 后台</h1>
    <p>输入访问密码即可查看学生提问记录。</p>
    ${showError ? '<p class="error">密码不正确，请重试。</p>' : ''}
    <form action="/admin/login" method="post">
      <label for="password">访问密码</label>
      <input id="password" name="password" type="password" inputmode="text" autocomplete="current-password" required autofocus>
      <button type="submit">进入后台</button>
    </form>
  </main>
</body>
</html>`;
}

export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Tutor · 提问记录</title>
  <style>${BASE_STYLE}
    body { margin: 0; background: #f7f7f5; color: #111; }
    main { width: min(920px, calc(100% - 32px)); margin: 36px auto 72px; }
    header, .toolbar, .record, .conversation { border: 1px solid #d9d9d4; border-radius: 8px; background: #fff; }
    header, .toolbar { padding: 18px 20px; margin-bottom: 14px; }
    h1 { margin: 0 0 6px; font-size: 21px; }
    p { margin: 0; line-height: 1.65; }
    .muted, .meta, #status { color: #646464; font-size: 13px; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    button { min-height: 38px; border: 1px solid #111; border-radius: 6px; padding: 7px 12px; background: #111; color: #fff; font: inherit; cursor: pointer; }
    button:disabled { border-color: #d9d9d4; background: #d9d9d4; cursor: default; }
    #records { display: grid; gap: 12px; }
    .record { padding: 17px 18px; }
    .conversation > summary { padding: 17px 18px; cursor: pointer; }
    .conversation > summary:focus-visible { outline: 2px solid #35766d; outline-offset: 3px; }
    .conversation-title { display: inline; font-size: 15px; font-weight: 650; }
    .conversation .meta { margin-top: 7px; line-height: 1.6; }
    .conversation-body { border-top: 1px solid #d9d9d4; padding: 0 18px 18px; }
    .turn { padding-top: 16px; }
    .turn + .turn { border-top: 1px dashed #d9d9d4; margin-top: 16px; }
    .conversation[open] > summary { background: #f5f7f5; border-radius: 8px 8px 0 0; }
    .question, .answer { margin-top: 8px; border-radius: 6px; padding: 10px 12px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
    .question { background: #f1f1ee; }
    .answer { background: #fafaf8; }
    .label { margin-top: 12px; color: #555; font-size: 12px; font-weight: 700; }
    .pager { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 18px; }
    @media (max-width: 560px) { main { width: calc(100% - 24px); margin-top: 20px; } .toolbar { align-items: stretch; flex-direction: column; } }
    @media (prefers-color-scheme: dark) { body { background: #161616; color: #eee; } header, .toolbar, .record, .conversation { border-color: #3a3a38; background: #20201f; } .conversation-body, .turn + .turn { border-color: #3a3a38; } .conversation[open] > summary { background: #292c29; } .muted, .meta, #status, .label { color: #b8b8b1; } .question { background: #2a2a28; } .answer { background: #252523; } button { border-color: #e8e8e1; background: #e8e8e1; color: #151515; } button:disabled { border-color: #444; background: #444; color: #aaa; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>AI Tutor 提问记录</h1>
      <p>仅显示学生实际参与的对话，点击展开查看完整问答。</p>
      <p class="muted">仅保存匿名会话编号、题目位置、学生提问和 AI 回答；不保存姓名、IP 地址或浏览器指纹。原文保留 <span id="retention">—</span> 天。</p>
    </header>
    <section class="toolbar"><p id="status" aria-live="polite">正在读取…</p><div><button id="refresh" type="button">刷新</button><form action="/admin/logout" method="post" style="display:inline"><button type="submit">退出</button></form></div></section>
    <section id="records" aria-live="polite"></section>
    <nav class="pager" aria-label="记录分页"><button id="previous" type="button">上一页</button><span id="page">第 1 页</span><button id="next" type="button">下一页</button></nav>
  </main>
  <script>
    const records = document.querySelector('#records');
    const status = document.querySelector('#status');
    const refresh = document.querySelector('#refresh');
    const previous = document.querySelector('#previous');
    const next = document.querySelector('#next');
    const page = document.querySelector('#page');
    const retention = document.querySelector('#retention');
    let currentPage = 1;
    let totalPages = 1;
    const dataUrl = location.pathname.replace(/\/+$/, '') + '/conversations';
    const reasons = { auth: '密钥失效', balance: '余额不足', rate_limit: '被限流', bad_request: '参数或模型名有误', upstream_down: '服务商故障', network: '连不上服务商', timeout: '超时', not_configured: '未配置密钥', invalid_response: '返回内容异常', response_too_large: '返回内容过长' };
    const text = (className, value) => { const node = document.createElement('div'); node.className = className; node.textContent = value == null ? '' : String(value); return node; };
    function turnCard(record) {
      const card = document.createElement('article'); card.className = 'turn';
      const time = new Date(record.createdAt);
      const raw = record.failureReason || '';
      const [code, upstream] = raw.split(':');
      const why = raw ? (reasons[code] || code) + (upstream ? '（上游 ' + upstream + '）' : '') : '';
      const outcome = record.status === 'answered' ? '已回答' : ('回答失败' + (why ? '：' + why : ''));
      const meta = [Number.isNaN(time.getTime()) ? record.createdAt : time.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }), record.model, outcome].filter(Boolean).join(' · ');
      card.append(text('meta', meta), text('label', '学生提问'), text('question', record.question));
      if (record.answer) card.append(text('label', 'AI 回答'), text('answer', record.answer));
      return card;
    }
    function conversationCard(conversation) {
      const card = document.createElement('details'); card.className = 'conversation';
      const summary = document.createElement('summary');
      const questionRef = conversation.questionNo == null ? '' : '第 ' + conversation.questionNo + ' 题';
      summary.append(text('conversation-title', [conversation.bookTitle, conversation.chapterTitle, questionRef, conversation.questionType].filter(Boolean).join(' · ') || '匿名对话'));
      const updated = new Date(conversation.updatedAt);
      const date = Number.isNaN(updated.getTime()) ? conversation.updatedAt : updated.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
      summary.append(text('meta', '最近交流：' + date + ' · ' + conversation.studentTurnCount + ' 次学生提问' + (conversation.failedCount ? ' · ' + conversation.failedCount + ' 次回答失败' : '') + ' · 点击展开'));
      const body = document.createElement('section'); body.className = 'conversation-body'; body.setAttribute('aria-label', '完整对话');
      card.append(summary, body);
      let loaded = false, loading = false;
      async function loadConversation() {
        if (loaded || loading) return;
        loading = true; body.replaceChildren(text('label', '正在读取完整对话…'));
        try {
          const response = await fetch(dataUrl + '/' + encodeURIComponent(conversation.sessionId), { cache: 'no-store' });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || '读取失败');
          body.replaceChildren(...data.records.map(turnCard));
          loaded = true;
        } catch (error) {
          body.replaceChildren(text('label', error instanceof Error ? error.message : String(error)));
          const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试';
          retry.addEventListener('click', loadConversation); body.append(retry);
        } finally { loading = false; }
      }
      card.addEventListener('toggle', () => { if (card.open) loadConversation(); });
      return card;
    }
    async function load(targetPage) {
      refresh.disabled = previous.disabled = next.disabled = true;
      status.textContent = '正在读取…';
      try {
        const response = await fetch(dataUrl + '?page=' + encodeURIComponent(targetPage), { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '读取失败');
        records.replaceChildren(...data.conversations.map(conversationCard));
        if (!data.conversations.length) records.append(text('record muted', '还没有学生对话。'));
        currentPage = data.pagination.page; totalPages = data.pagination.totalPages;
        page.textContent = '第 ' + currentPage + ' / ' + totalPages + ' 页';
        retention.textContent = data.retentionDays;
        status.textContent = '共 ' + data.pagination.total + ' 次对话 · ' + data.totalStudentTurns + ' 条学生提问。';
      } catch (error) {
        records.replaceChildren(); status.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        refresh.disabled = false; previous.disabled = currentPage <= 1; next.disabled = currentPage >= totalPages;
      }
    }
    refresh.addEventListener('click', () => load(1));
    previous.addEventListener('click', () => load(currentPage - 1));
    next.addEventListener('click', () => load(currentPage + 1));
    load(1);
  </script>
</body>
</html>`;
