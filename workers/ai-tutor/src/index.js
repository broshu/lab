// @ts-check

const MAX_REQUEST_BYTES = 96 * 1024;
const MAX_QUESTION_CHARS = 1_000;
const MAX_MESSAGE_CHARS = 60_000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_RESPONSE_BYTES = 96 * 1024;
const PAGE_SIZE = 25;
const DEFAULT_RETENTION_DAYS = 30;

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});

const ADMIN_CSP =
  "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
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

/** @param {Request} request @param {Env} env */
async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Basic ')) return false;

  let credentials = '';
  try { credentials = atob(authorization.slice(6)); } catch { return false; }
  const separator = credentials.indexOf(':');
  if (separator === -1) return false;
  const username = credentials.slice(0, separator);
  const password = credentials.slice(separator + 1);
  const [validName, validPassword] = await Promise.all([
    secureEqual(username, 'admin'),
    secureEqual(password, env.ADMIN_PASSWORD),
  ]);
  return validName && validPassword;
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
  if (!env.DEEPSEEK_API_KEY) throw new HttpError(503, 'AI service is not configured.');
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
    console.error(JSON.stringify({ event: 'provider_fetch_failed', error: error instanceof Error ? error.name : 'Unknown' }));
    throw new HttpError(503, 'AI service is temporarily unavailable.');
  }

  let responseText = '';
  try {
    responseText = await readLimitedText(response.body, MAX_RESPONSE_BYTES);
  } catch {
    console.error(JSON.stringify({ event: 'provider_response_too_large' }));
    throw new HttpError(502, 'AI service returned an invalid response.');
  }
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'provider_error', status: response.status }));
    throw new HttpError(503, 'AI service is temporarily unavailable.');
  }

  try {
    const parsed = JSON.parse(responseText);
    const answer = cleanText(parsed?.choices?.[0]?.message?.content, MAX_RESPONSE_BYTES);
    if (!answer) throw new Error('Empty answer');
    return answer;
  } catch {
    console.error(JSON.stringify({ event: 'provider_response_invalid' }));
    throw new HttpError(502, 'AI service returned an invalid response.');
  }
}

/** @param {D1Database} db @param {ReturnType<typeof normalizeRequest>} input @param {ReturnType<typeof settings>} config @param {string | null} answer @param {'answered' | 'failed'} status */
async function recordQuestion(db, input, config, answer, status) {
  const record = await db
    .prepare(
      'INSERT INTO tutor_questions (' +
        'id, session_id, book_id, book_title, chapter_id, chapter_title, question_no, question_type, question, answer, model, status' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
        'question_no AS questionNo, question_type AS questionType, question, answer, model, status ' +
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
    <section class="toolbar"><p id="status" aria-live="polite">正在读取…</p><button id="refresh" type="button">刷新</button></section>
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
      const meta = [Number.isNaN(time.getTime()) ? record.createdAt : time.toLocaleString(), record.bookTitle, record.chapterTitle, questionRef, record.questionType, record.status === 'answered' ? '已回答' : '回答失败'].filter(Boolean).join(' · ');
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

/** @param {Request} request */
function adminUnauthorized(request) {
  return new Response('Authentication required.', {
    status: 401,
    headers: { ...SECURITY_HEADERS, 'WWW-Authenticate': 'Basic realm="AI Tutor admin", charset="UTF-8"' },
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
        return json({ ok: true, service: 'p-ai-tutor', configured: Boolean(env.DEEPSEEK_API_KEY && env.ADMIN_PASSWORD) });
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
          const message = error instanceof HttpError ? error.message : 'AI service is temporarily unavailable.';
          ctx.waitUntil(recordQuestion(env.TUTOR_DB, input, config, null, 'failed').catch((writeError) => console.error(JSON.stringify({ event: 'failed_question_record_failed', error: writeError instanceof Error ? writeError.name : 'Unknown' }))));
          return json({ error: message }, status, cors);
        }
      }

      if ((url.pathname === '/admin' || url.pathname === '/admin/questions') && request.method === 'GET') {
        if (!(await isAdmin(request, env))) return adminUnauthorized(request);
        if (url.pathname === '/admin') {
          return new Response(ADMIN_PAGE, { headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': ADMIN_CSP, 'X-Robots-Tag': 'noindex, nofollow, noarchive' } });
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
