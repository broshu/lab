// p-ai-tutor：大屏作业问答的后端。把学生的提问转给 DeepSeek，回答和失败原因匿名记进 D1，
// 老师在 /admin 查看。前端在同仓库的 tutor/screen.html。

import { ADMIN_PAGE, loginPage } from './admin-page.js';

const MAX_REQUEST_BYTES = 96 * 1024;
const MAX_QUESTION_CHARS = 1000;
const MAX_MESSAGE_CHARS = 60000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_RESPONSE_BYTES = 96 * 1024;
const PROVIDER_TIMEOUT_MS = 30000;
const PAGE_SIZE = 25;
const AUTO_OPENINGS = [
  '老师好，我选了这道题，我们开始吧。',
  '老师好，我选了这道题。答案和解析我已经有了，想问问没看懂的地方。',
];
const DEFAULT_RETENTION_DAYS = 30;
const ADMIN_SESSION_SECONDS = 24 * 60 * 60;
const ADMIN_COOKIE = 'p_ai_tutor_admin';

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

// ------------------------------------------------------------ 配置

/** @param {Record<string, any>} env */
function settings(env) {
  return {
    apiBaseUrl: (env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: env.AI_MODEL || 'deepseek-flash',
    allowedOrigins: new Set(
      (env.ALLOWED_ORIGINS || 'https://p.phylab.uk').split(',').map((s) => s.trim()).filter(Boolean),
    ),
    retentionDays: Math.min(365, Math.max(1, Number.parseInt(env.RETENTION_DAYS, 10) || DEFAULT_RETENTION_DAYS)),
  };
}

// ------------------------------------------------------------ 请求校验

/** @param {unknown} value @param {number} limit */
function cleanText(value, limit = 200) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

/** @param {unknown} value */
function finiteInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** @param {any} value */
function normalizeContext(value) {
  const s = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    bookId: cleanText(s.bookId, 120) || null,
    bookTitle: cleanText(s.bookTitle, 200) || null,
    chapterId: cleanText(s.chapterId, 120) || null,
    chapterTitle: cleanText(s.chapterTitle, 200) || null,
    questionNo: finiteInteger(s.questionNo),
    questionType: cleanText(s.questionType, 80) || null,
  };
}

/** @param {unknown} value @param {string} question */
function normalizeMessages(value, question) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Messages are required.');
  const messages = value
    .filter((m) => m && typeof m === 'object' && !Array.isArray(m))
    .map((m) => ({ role: cleanText(m.role, 20), content: cleanText(m.content, MAX_MESSAGE_CHARS) }))
    .filter((m) => ['system', 'user', 'assistant'].includes(m.role) && m.content);
  const system = messages.find((m) => m.role === 'system');
  if (!system) throw new HttpError(400, 'A system message is required.');
  const history = messages.filter((m) => m.role !== 'system').slice(-MAX_HISTORY_MESSAGES);
  const last = history.at(-1);
  if (last?.role !== 'user' || last.content !== question) history.push({ role: 'user', content: question });
  return [system, ...history.slice(-MAX_HISTORY_MESSAGES)];
}

/** @param {any} body */
function normalizeRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request body.');
  const question = cleanText(body.question, MAX_QUESTION_CHARS + 1);
  if (!question) throw new HttpError(400, 'Question is required.');
  if (question.length > MAX_QUESTION_CHARS) {
    throw new HttpError(400, `Question must be at most ${MAX_QUESTION_CHARS} characters.`);
  }
  const sessionId = cleanText(body.sessionId, 80);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) throw new HttpError(400, 'Invalid session.');
  return {
    question,
    sessionId,
    context: normalizeContext(body.context),
    messages: normalizeMessages(body.messages, question),
  };
}

// ------------------------------------------------------------ 调 DeepSeek

/** 把上游的 HTTP 状态翻译成学生能看懂的话。 @param {number} status */
function providerFailure(status) {
  if (status === 401 || status === 403) return { status: 503, reason: 'auth', message: 'AI 暂时用不了：接口密钥失效了，请把这句话告诉老师。' };
  if (status === 402) return { status: 503, reason: 'balance', message: 'AI 暂时用不了：接口账户余额不足，请把这句话告诉老师。' };
  if (status === 429) return { status: 429, reason: 'rate_limit', message: '同时问的人有点多，等十几秒再发一次就好。' };
  if (status === 400 || status === 404 || status === 422) return { status: 503, reason: 'bad_request', message: 'AI 暂时用不了：接口参数或模型名有问题，请把这句话告诉老师。' };
  if (status >= 500) return { status: 503, reason: 'upstream_down', message: 'AI 服务商那边暂时故障，过几分钟再试。' };
  return { status: 503, reason: 'unknown', message: 'AI 暂时用不了，稍后再试；一直这样就告诉老师。' };
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
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * @param {{ messages: { role: string, content: string }[] }} input
 * @param {ReturnType<typeof settings>} config
 * @param {Record<string, any>} env
 * @returns {Promise<{ answer: string, model: string }>} model 是 DeepSeek 实际报告的模型，记进 D1 方便研究核对版本
 */
async function askProvider(input, config, env) {
  if (!env.DEEPSEEK_API_KEY) throw new HttpError(503, 'AI 还没配置好接口密钥，请告诉老师。', 'not_configured');

  let response;
  try {
    response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, stream: false, messages: input.messages }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Unknown';
    console.error(JSON.stringify({ event: 'provider_fetch_failed', error: name }));
    if (name === 'TimeoutError') throw new HttpError(504, 'AI 想太久超时了，换个更具体的问法或稍后再试。', 'timeout');
    throw new HttpError(503, '连不上 AI 服务，检查一下网络，稍后再试。', 'network');
  }

  let text;
  try {
    text = await readLimitedText(response.body, MAX_RESPONSE_BYTES);
  } catch {
    console.error(JSON.stringify({ event: 'provider_response_too_large' }));
    throw new HttpError(502, 'AI 返回的内容异常，再问一次试试。', 'response_too_large');
  }

  if (!response.ok) {
    const failure = providerFailure(response.status);
    // 上游的错误说明（不含密钥）留在日志里，下次出问题能直接看到原因
    console.error(JSON.stringify({ event: 'provider_error', status: response.status, reason: failure.reason, detail: text.slice(0, 300) }));
    throw new HttpError(failure.status, failure.message, `${failure.reason}:${response.status}`);
  }

  try {
    const parsed = JSON.parse(text);
    const answer = cleanText(parsed?.choices?.[0]?.message?.content, MAX_RESPONSE_BYTES);
    if (!answer) throw new Error('Empty answer');
    return { answer, model: cleanText(parsed.model, 80) || config.model };
  } catch {
    console.error(JSON.stringify({ event: 'provider_response_invalid' }));
    throw new HttpError(502, 'AI 返回的内容异常，再问一次试试。', 'invalid_response');
  }
}

// ------------------------------------------------------------ D1 记录

/**
 * @param {D1Database} db
 * @param {ReturnType<typeof normalizeRequest>} input
 * @param {{ model: string, answer: string | null, status: 'answered' | 'failed', failureReason?: string | null }} result
 * @param {number} retentionDays
 */
async function recordQuestion(db, input, result, retentionDays) {
  const { context: c } = input;
  await db
    .prepare(
      'INSERT INTO tutor_questions (id, session_id, book_id, book_title, chapter_id, chapter_title, question_no, question_type, question, answer, model, status, failure_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      crypto.randomUUID(), input.sessionId, c.bookId, c.bookTitle, c.chapterId, c.chapterTitle, c.questionNo,
      c.questionType, input.question, result.answer, result.model, result.status, result.failureReason ?? null,
    )
    .run();
  await db
    .prepare("DELETE FROM tutor_questions WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)")
    .bind(`-${retentionDays} days`)
    .run();
}

/** @param {D1Database} db @param {number} requestedPage @param {number} retentionDays */
async function listQuestions(db, requestedPage, retentionDays) {
  const page = Math.min(10000, Math.max(1, Math.trunc(requestedPage) || 1));
  const [countResult, recordsResult] = await db.batch([
    db.prepare('SELECT COUNT(*) AS total FROM tutor_questions'),
    db
      .prepare(
        'SELECT id, created_at AS createdAt, book_title AS bookTitle, chapter_title AS chapterTitle, question_no AS questionNo, question_type AS questionType, question, answer, model, status, failure_reason AS failureReason FROM tutor_questions ORDER BY created_at DESC LIMIT ? OFFSET ?',
      )
      .bind(PAGE_SIZE, (page - 1) * PAGE_SIZE),
  ]);
  const total = Number(/** @type {any} */ (countResult.results[0])?.total) || 0;
  return {
    records: recordsResult.results,
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    retentionDays,
  };
}

/** 分页按完整会话计数，避免一段对话被拆到不同页。 */
async function listConversations(db, requestedPage, retentionDays) {
  const page = Math.min(10000, Math.max(1, Math.trunc(requestedPage) || 1));
  // A failed/retried automatic opening may create several rows. Count actual
  // student messages instead of assuming every multi-row session was used.
  const active = `WITH conversations AS (
    SELECT session_id AS sessionId, MIN(created_at) AS startedAt, MAX(created_at) AS updatedAt,
      MAX(book_title) AS bookTitle, MAX(chapter_title) AS chapterTitle,
      MAX(question_no) AS questionNo, MAX(question_type) AS questionType,
      COUNT(*) AS turnCount, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedCount,
      SUM(CASE WHEN TRIM(question) IN (?, ?) THEN 0 ELSE 1 END) AS studentTurnCount
    FROM tutor_questions GROUP BY session_id
  ), active AS (SELECT * FROM conversations WHERE studentTurnCount > 0)`;
  const [countResult, sessionsResult] = await db.batch([
    db.prepare(`${active} SELECT COUNT(*) AS total, SUM(turnCount) AS totalTurns,
      SUM(studentTurnCount) AS totalStudentTurns FROM active`).bind(...AUTO_OPENINGS),
    db.prepare(`${active} SELECT * FROM active
      ORDER BY updatedAt DESC, sessionId ASC LIMIT ? OFFSET ?`).bind(...AUTO_OPENINGS, PAGE_SIZE, (page - 1) * PAGE_SIZE),
  ]);
  const total = Number(countResult.results[0]?.total) || 0;
  return {
    conversations: sessionsResult.results,
    totalTurns: Number(countResult.results[0]?.totalTurns) || 0,
    totalStudentTurns: Number(countResult.results[0]?.totalStudentTurns) || 0,
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    retentionDays,
  };
}

/** 展开时读取该会话全部问答，按发生顺序显示。 */
async function conversationDetails(db, sessionId) {
  const { results } = await db.prepare(
    `SELECT id, created_at AS createdAt, question, answer, model, status, failure_reason AS failureReason
     FROM tutor_questions WHERE session_id = ? ORDER BY created_at ASC, rowid ASC`,
  ).bind(sessionId).all();
  return { sessionId, records: results };
}

// ------------------------------------------------------------ 后台登录（HMAC 签名的 cookie，每天换一次）

/** @param {string} a @param {string} b 常数时间比较 */
async function secureEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const left = new Uint8Array(x);
  const right = new Uint8Array(y);
  let diff = left.length ^ right.length;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

/** @param {Record<string, any>} env @param {number} bucket */
async function adminSession(env, bucket) {
  const payload = `v1.${bucket}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.ADMIN_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
  const base64 = btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${payload}.${base64}`;
}

const currentBucket = () => Math.floor(Date.now() / (ADMIN_SESSION_SECONDS * 1000));

/** @param {Request} request @param {string} name */
function cookieValue(request, name) {
  for (const item of (request.headers.get('Cookie') || '').split(';')) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

/** @param {Request} request @param {Record<string, any>} env */
async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) return false;
  const provided = cookieValue(request, ADMIN_COOKIE);
  if (!provided) return false;
  const bucket = currentBucket();
  // 当前和上一个时间段的签名都认，避免跨零点时被踢出
  for (const b of [bucket, bucket - 1]) {
    if (await secureEqual(provided, await adminSession(env, b))) return true;
  }
  return false;
}

// ------------------------------------------------------------ 响应

/** @param {unknown} data @param {number} status @param {Record<string, string>} headers */
function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

/** @param {string} body @param {number} status @param {Record<string, string>} headers */
function html(body, status = 200, headers = {}) {
  return new Response(body, {
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

/** @param {string} cookie */
function redirectToAdmin(cookie) {
  return new Response(null, { status: 303, headers: { ...SECURITY_HEADERS, Location: '/admin', 'Set-Cookie': cookie } });
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

// ------------------------------------------------------------ 路由

/** @param {Request} request @param {Record<string, any>} env @param {ExecutionContext} ctx @param {ReturnType<typeof settings>} config */
async function handleChat(request, env, ctx, config) {
  const cors = corsHeaders(request, config.allowedOrigins);
  if (!cors) return json({ error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Content-Type must be application/json.' }, 415, cors);
  }
  if (Number(request.headers.get('Content-Length') || 0) > MAX_REQUEST_BYTES) {
    return json({ error: 'Request is too large.' }, 413, cors);
  }

  let input;
  try {
    input = normalizeRequest(JSON.parse(await readLimitedText(request.body, MAX_REQUEST_BYTES)));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    return json({ error: error instanceof Error ? error.message : 'Invalid request.' }, status, cors);
  }

  /** @param {Parameters<typeof recordQuestion>[2]} result */
  const record = (result) =>
    ctx.waitUntil(
      recordQuestion(env.TUTOR_DB, input, result, config.retentionDays).catch((error) =>
        console.error(JSON.stringify({ event: 'question_record_failed', error: error instanceof Error ? error.message : 'Unknown' })),
      ),
    );

  try {
    const { answer, model } = await askProvider(input, config, env);
    record({ model, answer, status: 'answered' });
    return json({ answer }, 200, cors);
  } catch (error) {
    const known = error instanceof HttpError;
    record({ model: config.model, answer: null, status: 'failed', failureReason: known ? error.reason : 'unhandled' });
    const message = known ? error.message : 'AI 暂时用不了，稍后再试；一直这样就告诉老师。';
    return json({ error: message }, known ? error.status : 502, cors);
  }
}

/** @param {Request} request @param {Record<string, any>} env */
async function handleLogin(request, env) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return html(loginPage(true), 415);
  }
  const password = new URLSearchParams(await readLimitedText(request.body, 4096)).get('password') || '';
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET || !(await secureEqual(password, env.ADMIN_PASSWORD))) {
    return html(loginPage(true), 401);
  }
  const session = await adminSession(env, currentBucket());
  return redirectToAdmin(`${ADMIN_COOKIE}=${session}; Max-Age=${ADMIN_SESSION_SECONDS}; Path=/admin; HttpOnly; Secure; SameSite=Strict`);
}

export default {
  /** @param {Request} request @param {Record<string, any>} env @param {ExecutionContext} ctx */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const config = settings(env);
    const { pathname } = url;
    const { method } = request;
    try {
      if (pathname === '/health' && method === 'GET') {
        const configured = Boolean(env.DEEPSEEK_API_KEY && env.ADMIN_PASSWORD && env.ADMIN_SESSION_SECRET);
        return json({ ok: true, service: 'p-ai-tutor', configured, model: config.model });
      }
      if (pathname === '/api/chat' && (method === 'POST' || method === 'OPTIONS')) {
        return await handleChat(request, env, ctx, config);
      }
      if (pathname === '/admin/login' && method === 'POST') return await handleLogin(request, env);
      if (pathname === '/admin/logout' && method === 'POST') {
        return redirectToAdmin(`${ADMIN_COOKIE}=; Max-Age=0; Path=/admin; HttpOnly; Secure; SameSite=Strict`);
      }
      const conversationId = pathname.match(/^\/admin\/conversations\/([A-Za-z0-9_-]{8,80})$/)?.[1];
      if ((pathname === '/admin' || pathname === '/admin/questions' || pathname === '/admin/conversations' || conversationId) && method === 'GET') {
        if (!(await isAdmin(request, env))) {
          return pathname === '/admin' ? html(loginPage(), 401) : json({ error: 'Authentication required.' }, 401);
        }
        if (pathname === '/admin') return html(ADMIN_PAGE);
        if (conversationId) {
          const conversation = await conversationDetails(env.TUTOR_DB, conversationId);
          return conversation.records.length ? json(conversation) : json({ error: '这次对话不存在或已过保留期。' }, 404);
        }
        const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
        if (pathname === '/admin/conversations') {
          return json(await listConversations(env.TUTOR_DB, page, config.retentionDays), 200, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
        }
        return json(await listQuestions(env.TUTOR_DB, page, config.retentionDays), 200, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
      }
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      console.error(JSON.stringify({ event: 'unhandled_error', path: pathname, error: error instanceof Error ? error.name : 'Unknown' }));
      return json({ error: 'Internal server error.' }, 500);
    }
  },
};
