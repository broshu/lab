// @ts-check

const MAX_REQUEST_BYTES = 96 * 1024;
const MAX_QUESTION_CHARS = 1_000;
const MAX_MESSAGE_CHARS = 60_000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_RESPONSE_BYTES = 96 * 1024;
const PAGE_SIZE = 25;
const DEFAULT_RETENTION_DAYS = 30;
const ADMIN_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const ADMIN_SESSION_BUCKET_MS = ADMIN_SESSION_MAX_AGE_SECONDS * 1_000;
const ADMIN_SESSION_COOKIE = 'p_ai_tutor_admin';

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});

const ADMIN_CSP =
  "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

class HttpError extends Error {
  /** @param {number} status @param {string} message @param {string | null} [reason] 写进 D1 的失败原因代号 */
  constructor(status, message, reason = null) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

// 上游返回非 2xx 时，把状态码翻译成「学生看得懂 + 老师能定位」的一句话。
// reason 会连同上游状态码一起写进 D1，后台列表直接显示，不用再去翻 Worker 日志。
/** @param {number} status */
function providerFailure(status) {
  if (status === 401 || status === 403) {
    return { status: 503, reason: 'auth', message: 'AI 暂时用不了：接口密钥失效了，请把这句话告诉老师。' };
  }
  if (status === 402) {
    return { status: 503, reason: 'balance', message: 'AI 暂时用不了：接口账户余额不足，请把这句话告诉老师。' };
  }
  if (status === 429) {
    return { status: 429, reason: 'rate_limit', message: '同时问的人有点多，等十几秒再发一次就好。' };
  }
  if (status === 400 || status === 404 || status === 422) {
    return { status: 503, reason: 'bad_request', message: 'AI 暂时用不了：接口参数或模型名有问题，请把这句话告诉老师。' };
  }
  if (status >= 500) {
    return { status: 503, reason: 'upstream_down', message: 'AI 服务商那边暂时故障，过几分钟再试。' };
  }
  return { status: 503, reason: 'unknown', message: 'AI 暂时用不了，稍后再试；一直这样就告诉老师。' };
}

/** @param {unknown} value @param {number} [limit] */
function cleanText(value, limit = 200) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

/** @param {unknown} value */
function finiteInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** @param {unknown} value */
function normalizeContext(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
  return {
    bookId: cleanText(source.bookId, 120) || null,
    bookTitle: cleanText(source.bookTitle, 200) || null,
    chapterId: cleanText(source.chapterId, 120) || null,
    chapterTitle: cleanText(source.chapterTitle, 200) || null,
    questionNo: finiteInteger(source.questionNo),
    questionType: cleanText(source.questionType, 80) || null,
  };
}

/** @param {unknown} value @param {string} question */
function normalizeMessages(value, question) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Messages are required.');

  const raw = value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => /** @type {Record<string, unknown>} */ (item))
    .map((item) => ({
      role: cleanText(item.role, 20),
      content: cleanText(item.content, MAX_MESSAGE_CHARS),
    }))
    .filter((item) => ['system', 'user', 'assistant'].includes(item.role) && item.content);

  const system = raw.find((item) => item.role === 'system');
  if (!system) throw new HttpError(400, 'A system message is required.');

  const history = raw
    .filter((item) => item.role !== 'system')
    .slice(-MAX_HISTORY_MESSAGES);

  if (history.at(-1)?.role !== 'user' || history.at(-1).content !== question) {
    history.push({ role: 'user', content: question });
  }

  return [system, ...history.slice(-MAX_HISTORY_MESSAGES)];
}

/** @param {unknown} value */
function normalizeRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Invalid request body.');
  }
  const source = /** @type {Record<string, unknown>} */ (value);
  const question = cleanText(source.question, MAX_QUESTION_CHARS + 1);
  if (!question) throw new HttpError(400, 'Question is required.');
  if (question.length > MAX_QUESTION_CHARS) {
    throw new HttpError(400, `Question must be at most ${MAX_QUESTION_CHARS} characters.`);
  }

  const sessionId = cleanText(source.sessionId, 80);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) {
    throw new HttpError(400, 'Invalid session.');
  }

  return {
    question,
    sessionId,
    context: normalizeContext(source.context),
    messages: normalizeMessages(source.messages, question),
  };
}

/** @param {Request} request @param {Set<string>} allowed */
function corsHeaders(request, allowed) {
  const origin = request.headers.get('Origin');
  if (!origin || !allowed.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** @param {unknown} data @param {number} [status] @param {HeadersInit} [headers] */
function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

/** @param {ReadableStream<Uint8Array> | null} body @param {number} limit */
async function readLimitedText(body, limit) {
  if (!body) return '';
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new HttpError(413, 'Request is too large.');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

/** @param {string} provided @param {string} expected */
async function secureEqual(provided, expected) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

/** @param {Request} request @param {string} name */
function cookieValue(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const item of cookies.split(';')) {
    const [key, ...parts] = item.trim().split('=');
    if (key === name) return parts.join('=');
  }
  return '';
}

/** @param {string} value @param {string} secret */
async function signAdminSession(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  let binary = '';
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {Env} env @param {number} bucket */
async function createAdminSession(env, bucket) {
  const payload = `v1.${bucket}`;
  return `${payload}.${await signAdminSession(payload, env.ADMIN_SESSION_SECRET)}`;
}

/** @param {Request} request @param {Env} env */
async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) return false;
  const provided = cookieValue(request, ADMIN_SESSION_COOKIE);
  if (!provided) return false;
  const currentBucket = Math.floor(Date.now() / ADMIN_SESSION_BUCKET_MS);
  const [current, previous] = await Promise.all([
    createAdminSession(env, currentBucket),
    createAdminSession(env, currentBucket - 1),
  ]);
  const [currentMatch, previousMatch] = await Promise.all([
    secureEqual(provided, current),
    secureEqual(provided, previous),
  ]);
  return currentMatch || previousMatch;
}

/** @param {Env} env */
function settings(env) {
  return {
    apiBaseUrl: (env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: env.AI_MODEL || 'deepseek-v4-pro',
    allowedOrigins: new Set(
      (env.ALLOWED_ORIGINS || 'https://p.phylab.uk')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
    retentionDays: Math.min(
      365,
      Math.max(1, Number.parseInt(env.RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS), 10) || DEFAULT_RETENTION_DAYS),
    ),
  };
}

/** @param {ReturnType<typeof normalizeRequest>} input @param {ReturnType<typeof settings>} config @param {Env} env */
async function askProvider(input, config, env) {
  if (!env.DEEPSEEK_API_KEY) throw new HttpError(503, 'AI 还没配置好接口密钥，请告诉老师。', 'not_configured');
  let response;
  try {
    response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: config.model, stream: false, messages: input.messages }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Unknown';
    console.error(JSON.stringify({ event: 'provider_fetch_failed', error: name }));
    // TimeoutError 是我们自己的 30 s 上限，和「压根连不上」要分开说。
    if (name === 'TimeoutError') {
      throw new HttpError(504, 'AI 想太久超时了，换个更具体的问法或稍后再试。', 'timeout');
    }
    throw new HttpError(503, '连不上 AI 服务，检查一下网络，稍后再试。', 'network');
  }

  let responseText = '';
  try {
    responseText = await readLimitedText(response.body, MAX_RESPONSE_BYTES);
  } catch {
    console.error(JSON.stringify({ event: 'provider_response_too_large' }));
    throw new HttpError(502, 'AI 返回的内容异常，再问一次试试。', 'response_too_large');
  }
  if (!response.ok) {
    const failure = providerFailure(response.status);
    console.error(JSON.stringify({ event: 'provider_error', status: response.status, reason: failure.reason }));
    // 上游状态码也记进 reason，后台一眼能分清 401 和 403。
    throw new HttpError(failure.status, failure.message, `${failure.reason}:${response.status}`);
  }

  try {
    const parsed = JSON.parse(responseText);
    const answer = cleanText(parsed?.choices?.[0]?.message?.content, MAX_RESPONSE_BYTES);
    if (!answer) throw new Error('Empty answer');
    return answer;
  } catch {
    console.error(JSON.stringify({ event: 'provider_response_invalid' }));
    throw new HttpError(502, 'AI 返回的内容异常，再问一次试试。', 'invalid_response');
  }
}

/** @param {D1Database} db @param {ReturnType<typeof normalizeRequest>} input @param {ReturnType<typeof settings>} config @param {string | null} answer @param {'answered' | 'failed'} status @param {string | null} [failureReason] */
async function recordQuestion(db, input, config, answer, status, failureReason = null) {
  const record = await db
    .prepare(
      'INSERT INTO tutor_questions (' +
        'id, session_id, book_id, book_title, chapter_id, chapter_title, question_no, question_type, question, answer, model, status, failure_reason' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      crypto.randomUUID(),
      input.sessionId,
      input.context.bookId,
      input.context.bookTitle,
      input.context.chapterId,
      input.context.chapterTitle,
      input.context.questionNo,
      input.context.questionType,
      input.question,
      answer,
      config.model,
      status,
      status === 'failed' ? failureReason : null,
    )
    .run();
  if (!record.success) throw new Error('Question record insert failed.');

  await db
    .prepare("DELETE FROM tutor_questions WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)")
    .bind(`-${config.retentionDays} days`)
    .run();
}

/** @param {D1Database} db @param {number} requestedPage @param {number} retentionDays */
async function listQuestions(db, requestedPage, retentionDays) {
  const page = Math.min(10_000, Math.max(1, Math.trunc(requestedPage) || 1));
  const offset = (page - 1) * PAGE_SIZE;
  const [countResult, recordsResult] = await db.batch([
    db.prepare('SELECT COUNT(*) AS total FROM tutor_questions'),
    db.prepare(
      'SELECT id, created_at AS createdAt, book_title AS bookTitle, chapter_title AS chapterTitle, ' +
        'question_no AS questionNo, question_type AS questionType, question, answer, model, status, ' +
        'failure_reason AS failureReason ' +
        'FROM tutor_questions ORDER BY created_at DESC LIMIT ? OFFSET ?',
    ).bind(PAGE_SIZE, offset),
  ]);
  const count = /** @type {Record<string, unknown> | undefined} */ (countResult.results[0]);
  const total = typeof count?.total === 'number' && Number.isFinite(count.total) ? count.total : 0;
  return {
    records: recordsResult.results,
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    retentionDays,
  };
}

function adminLoginPage(showError = false) {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Tutor · 后台登录</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
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

const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Tutor · 提问记录</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f7f5; color: #111; }
    main { width: min(920px, calc(100% - 32px)); margin: 36px auto 72px; }
    header, .toolbar, .record { border: 1px solid #d9d9d4; border-radius: 8px; background: #fff; }
    header, .toolbar { padding: 18px 20px; margin-bottom: 14px; }
    h1 { margin: 0 0 6px; font-size: 21px; }
    p { margin: 0; line-height: 1.65; }
    .muted, .meta, #status { color: #646464; font-size: 13px; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    button { min-height: 38px; border: 1px solid #111; border-radius: 6px; padding: 7px 12px; background: #111; color: #fff; font: inherit; cursor: pointer; }
    button:disabled { border-color: #d9d9d4; background: #d9d9d4; cursor: default; }
    #records { display: grid; gap: 12px; }
    .record { padding: 17px 18px; }
    .question, .answer { margin-top: 8px; border-radius: 6px; padding: 10px 12px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
    .question { background: #f1f1ee; }
    .answer { background: #fafaf8; }
    .label { margin-top: 12px; color: #555; font-size: 12px; font-weight: 700; }
    .pager { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 18px; }
    @media (max-width: 560px) { main { width: calc(100% - 24px); margin-top: 20px; } .toolbar { align-items: stretch; flex-direction: column; } }
    @media (prefers-color-scheme: dark) { body { background: #161616; color: #eee; } header, .toolbar, .record { border-color: #3a3a38; background: #20201f; } .muted, .meta, #status, .label { color: #b8b8b1; } .question { background: #2a2a28; } .answer { background: #252523; } button { border-color: #e8e8e1; background: #e8e8e1; color: #151515; } button:disabled { border-color: #444; background: #444; color: #aaa; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>AI Tutor 提问记录</h1>
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
    const dataUrl = location.pathname.replace(/\/+$/, '') + '/questions';
    const text = (className, value) => { const node = document.createElement('div'); node.className = className; node.textContent = value == null ? '' : String(value); return node; };
    function recordCard(record) {
      const card = document.createElement('article'); card.className = 'record';
      const time = new Date(record.createdAt);
      const questionRef = record.questionNo == null ? '' : '第 ' + record.questionNo + ' 题';
      const reasons = { auth: '密钥失效', balance: '余额不足', rate_limit: '被限流', bad_request: '参数或模型名有误', upstream_down: '服务商故障', network: '连不上服务商', timeout: '超时', not_configured: '未配置密钥', invalid_response: '返回内容异常', response_too_large: '返回内容过长' };
      const raw = record.failureReason || '';
      const code = raw.split(':')[0];
      const why = raw ? (reasons[code] || code) + (raw.includes(':') ? '（上游 ' + raw.split(':')[1] + '）' : '') : '';
      const outcome = record.status === 'answered' ? '已回答' : ('回答失败' + (why ? '：' + why : ''));
      const meta = [Number.isNaN(time.getTime()) ? record.createdAt : time.toLocaleString(), record.bookTitle, record.chapterTitle, questionRef, record.questionType, outcome].filter(Boolean).join(' · ');
      card.append(text('meta', meta), text('label', '学生提问'), text('question', record.question));
      if (record.answer) card.append(text('label', 'AI 回答'), text('answer', record.answer));
      return card;
    }
    async function load(targetPage) {
      refresh.disabled = previous.disabled = next.disabled = true;
      status.textContent = '正在读取…';
      try {
        const response = await fetch(dataUrl + '?page=' + encodeURIComponent(targetPage), { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '读取失败');
        records.replaceChildren(...data.records.map(recordCard));
        if (!data.records.length) records.append(text('record muted', '还没有学生提问。'));
        currentPage = data.pagination.page; totalPages = data.pagination.totalPages;
        page.textContent = '第 ' + currentPage + ' / ' + totalPages + ' 页';
        retention.textContent = data.retentionDays;
        status.textContent = '共 ' + data.pagination.total + ' 条记录。';
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

/** @param {string} content @param {number} [status] @param {HeadersInit} [headers] */
function adminHtml(content, status = 200, headers = {}) {
  return new Response(content, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': ADMIN_CSP,
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      ...headers,
    },
  });
}

/** @satisfies {ExportedHandler<Env>} */
export default {
  /** @param {Request} request @param {Env} env @param {ExecutionContext} ctx */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const config = settings(env);
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, service: 'p-ai-tutor', configured: Boolean(env.DEEPSEEK_API_KEY && env.ADMIN_PASSWORD && env.ADMIN_SESSION_SECRET), model: config.model });
      }

      if (url.pathname === '/api/chat' && request.method === 'OPTIONS') {
        const cors = corsHeaders(request, config.allowedOrigins);
        return cors ? new Response(null, { status: 204, headers: cors }) : json({ error: 'Origin is not allowed.' }, 403);
      }

      if (url.pathname === '/api/chat' && request.method === 'POST') {
        const cors = corsHeaders(request, config.allowedOrigins);
        if (!cors) return json({ error: 'Origin is not allowed.' }, 403);
        const contentType = request.headers.get('Content-Type') || '';
        if (!contentType.toLowerCase().startsWith('application/json')) {
          return json({ error: 'Content-Type must be application/json.' }, 415, cors);
        }
        const declaredSize = Number(request.headers.get('Content-Length') || 0);
        if (declaredSize > MAX_REQUEST_BYTES) return json({ error: 'Request is too large.' }, 413, cors);

        let input;
        try { input = normalizeRequest(JSON.parse(await readLimitedText(request.body, MAX_REQUEST_BYTES))); }
        catch (error) {
          const status = error instanceof HttpError ? error.status : 400;
          const message = error instanceof Error ? error.message : 'Invalid request.';
          return json({ error: message }, status, cors);
        }

        try {
          const answer = await askProvider(input, config, env);
          ctx.waitUntil(recordQuestion(env.TUTOR_DB, input, config, answer, 'answered').catch((error) => console.error(JSON.stringify({ event: 'question_record_failed', error: error instanceof Error ? error.name : 'Unknown' }))));
          return json({ answer }, 200, cors);
        } catch (error) {
          const status = error instanceof HttpError ? error.status : 502;
          const message = error instanceof HttpError ? error.message : 'AI 暂时用不了，稍后再试；一直这样就告诉老师。';
          const reason = error instanceof HttpError ? error.reason : 'unhandled';
          ctx.waitUntil(recordQuestion(env.TUTOR_DB, input, config, null, 'failed', reason).catch((writeError) => console.error(JSON.stringify({ event: 'failed_question_record_failed', error: writeError instanceof Error ? writeError.name : 'Unknown' }))));
          return json({ error: message }, status, cors);
        }
      }

      if (url.pathname === '/admin/login' && request.method === 'POST') {
        const contentType = request.headers.get('Content-Type') || '';
        if (!contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
          return adminHtml(adminLoginPage(true), 415);
        }
        const body = await readLimitedText(request.body, 4_096);
        const password = new URLSearchParams(body).get('password') || '';
        if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET || !(await secureEqual(password, env.ADMIN_PASSWORD))) {
          return adminHtml(adminLoginPage(true), 401);
        }
        const bucket = Math.floor(Date.now() / ADMIN_SESSION_BUCKET_MS);
        const session = await createAdminSession(env, bucket);
        return new Response(null, {
          status: 303,
          headers: {
            ...SECURITY_HEADERS,
            Location: '/admin',
            'Set-Cookie': `${ADMIN_SESSION_COOKIE}=${session}; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}; Path=/admin; HttpOnly; Secure; SameSite=Strict`,
          },
        });
      }

      if (url.pathname === '/admin/logout' && request.method === 'POST') {
        return new Response(null, {
          status: 303,
          headers: {
            ...SECURITY_HEADERS,
            Location: '/admin',
            'Set-Cookie': `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/admin; HttpOnly; Secure; SameSite=Strict`,
          },
        });
      }

      if ((url.pathname === '/admin' || url.pathname === '/admin/questions') && request.method === 'GET') {
        if (!(await isAdmin(request, env))) {
          return url.pathname === '/admin' ? adminHtml(adminLoginPage(), 401) : json({ error: 'Authentication required.' }, 401);
        }
        if (url.pathname === '/admin') {
          return adminHtml(ADMIN_PAGE);
        }
        const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
        return json(await listQuestions(env.TUTOR_DB, page, config.retentionDays), 200, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
      }

      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      console.error(JSON.stringify({ event: 'unhandled_error', path: url.pathname, error: error instanceof Error ? error.name : 'Unknown' }));
      return json({ error: 'Internal server error.' }, 500);
    }
  },
};
