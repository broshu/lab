import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import worker from '../src/index.js';

const ORIGIN = 'https://p.phylab.uk';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// 只模拟用到的 D1 接口：记下插入的参数
function fakeDb() {
  const rows = [];
  const statement = (sql) => ({
    bind: (...args) => ({ run: async () => { if (sql.startsWith('INSERT')) rows.push(args); return { success: true }; } }),
  });
  return { rows, prepare: statement };
}

function setup() {
  const db = fakeDb();
  const waits = [];
  const env = { DEEPSEEK_API_KEY: 'test-key', ADMIN_PASSWORD: 'pw', ADMIN_SESSION_SECRET: 'secret', TUTOR_DB: db };
  const ctx = { waitUntil: (p) => waits.push(p) };
  const call = async (path, init = {}) => {
    const res = await worker.fetch(new Request(`https://p.phylab.uk${path}`, init), env, ctx);
    await Promise.all(waits);
    return res;
  };
  return { db, env, call };
}

const chat = (overrides = {}) => ({
  method: 'POST',
  headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: '为什么球会下网？',
    sessionId: 'screen-test-1234',
    context: { bookTitle: '大屏问答', questionNo: 3 },
    messages: [{ role: 'system', content: '你是物理老师。' }, { role: 'user', content: '为什么球会下网？' }],
    ...overrides,
  }),
});

test('answers and records the model DeepSeek reports', async () => {
  const { db, call } = setup();
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return Response.json({ model: 'deepseek-v4.1-flash', choices: [{ message: { content: '先想想速度。' } }] });
  };
  const res = await call('/api/chat', chat());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { answer: '先想想速度。' });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(sent.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(sent.body.model, 'deepseek-flash');
  assert.equal(sent.body.messages.length, 2);
  const row = db.rows[0];
  assert.equal(row[10], 'deepseek-v4.1-flash'); // model
  assert.equal(row[11], 'answered');
});

test('upstream 503 gives the outage message and records the reason', async () => {
  const { db, call } = setup();
  globalThis.fetch = async () => new Response('{"error":"service unavailable"}', { status: 503 });
  const res = await call('/api/chat', chat());
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /服务商那边暂时故障/);
  assert.equal(db.rows[0][11], 'failed');
  assert.equal(db.rows[0][12], 'upstream_down:503');
});

test('timeout is reported as timeout', async () => {
  const { db, call } = setup();
  globalThis.fetch = async () => { throw new DOMException('timed out', 'TimeoutError'); };
  const res = await call('/api/chat', chat());
  assert.equal(res.status, 504);
  assert.equal(db.rows[0][12], 'timeout');
});

test('rejects unknown origins and bad requests', async () => {
  const { call } = setup();
  const foreign = chat();
  foreign.headers = { ...foreign.headers, Origin: 'https://evil.example' };
  assert.equal((await call('/api/chat', foreign)).status, 403);
  assert.equal((await call('/api/chat', chat({ sessionId: 'x' }))).status, 400);
  assert.equal((await call('/api/chat', chat({ messages: [] }))).status, 400);
  const preflight = await call('/api/chat', { method: 'OPTIONS', headers: { Origin: ORIGIN } });
  assert.equal(preflight.status, 204);
});

test('admin login sets a cookie that opens the admin page', async () => {
  const { call } = setup();
  const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
  assert.equal((await call('/admin/login', { method: 'POST', headers: form, body: 'password=wrong' })).status, 401);
  const login = await call('/admin/login', { method: 'POST', headers: form, body: 'password=pw' });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const page = await call('/admin', { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  const body = await page.text();
  assert.match(body, /AI Tutor 提问记录/);
  assert.match(body, /replace\(\/\\\/\+\$\/, ''\)/); // 页面脚本里的正则原样保留
  assert.equal((await call('/admin')).status, 401);
});

test('health reports the configured model', async () => {
  const { call } = setup();
  const res = await call('/health');
  assert.deepEqual(await res.json(), { ok: true, service: 'p-ai-tutor', configured: true, model: 'deepseek-flash' });
});
