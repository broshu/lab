import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

// Execute the real D1 SQL against SQLite, including grouping, ordering and pagination.
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE tutor_questions (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, created_at TEXT NOT NULL,
    book_title TEXT, chapter_title TEXT, question_no INTEGER, question_type TEXT,
    question TEXT, answer TEXT, model TEXT, status TEXT, failure_reason TEXT
  )`);
  const statement = (query, values = []) => ({
    bind: (...args) => statement(query, args),
    all: async () => ({ results: sql.prepare(query).all(...values) }),
  });
  const db = { prepare: statement, batch: async (statements) => Promise.all(statements.map(s => s.all())) };
  const add = (id, session, time, question = id, status = 'answered') => {
    sql.prepare(`INSERT INTO tutor_questions
      (id, session_id, created_at, book_title, chapter_title, question_no, question_type, question, answer, model, status)
      VALUES (?, ?, ?, '选修一作业本', '动量', 3, '单选', ?, ?, 'test-model', ?)`)
      .run(id, session, time, question, status === 'answered' ? '回答：' + question : null, status);
  };
  return { db, add, close: () => sql.close() };
}

async function client(db) {
  const env = { ADMIN_PASSWORD: '0', ADMIN_SESSION_SECRET: 'local-test-secret', TUTOR_DB: db };
  const ctx = { waitUntil() {} };
  const login = await worker.fetch(new Request('https://tutor.example/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=0',
  }), env, ctx);
  assert.equal(login.status, 303);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  return (path, authenticated = true) => worker.fetch(new Request('https://tutor.example' + path, {
    headers: authenticated ? { Cookie: cookie } : {},
  }), env, ctx);
}

test('session pagination never splits a conversation and keeps different sessions on the same question separate', async () => {
  const { db, add, close } = database();
  try {
    for (let i = 0; i < 26; i++) add('old-' + i, 'session-old-' + i, '2026-10-14T10:00:00.000Z');
    for (let i = 0; i < 30; i++) add('long-' + i, 'session-long-001', `2026-10-15T10:00:${String(i).padStart(2, '0')}.000Z`);
    const call = await client(db);
    const first = await (await call('/admin/conversations?page=1')).json();
    assert.equal(first.pagination.total, 27);
    assert.equal(first.totalTurns, 56);
    assert.equal(first.conversations.length, 25);
    assert.equal(first.conversations[0].sessionId, 'session-long-001');
    assert.equal(first.conversations[0].turnCount, 30);
    assert.equal(first.pagination.totalPages, 2);
    const second = await (await call('/admin/conversations?page=2')).json();
    assert.equal(second.conversations.length, 2);
    const ids = [...first.conversations, ...second.conversations].map(c => c.sessionId);
    assert.equal(new Set(ids).size, 27);
    const detail = await (await call('/admin/conversations/session-long-001')).json();
    assert.equal(detail.records.length, 30);
    assert.equal(detail.records[0].question, 'long-0');
    assert.equal(detail.records.at(-1).question, 'long-29');
  } finally { close(); }
});

test('transcript preserves insertion order for equal timestamps, failures and message text', async () => {
  const { db, add, close } = database();
  try {
    add('z-first', 'session-tied-001', '2026-10-15T10:00:00.000Z', '<img src=x onerror=alert(1)>');
    add('a-second', 'session-tied-001', '2026-10-15T10:00:00.000Z', '第二个问题', 'failed');
    const call = await client(db);
    const list = await (await call('/admin/conversations')).json();
    assert.equal(list.conversations[0].failedCount, 1);
    const response = await call('/admin/conversations/session-tied-001');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const detail = await response.json();
    assert.deepEqual(detail.records.map(r => r.id), ['z-first', 'a-second']);
    assert.equal(detail.records[0].question, '<img src=x onerror=alert(1)>');
    assert.equal(detail.records[1].answer, null);
    assert.equal(detail.records[1].status, 'failed');
  } finally { close(); }
});

test('both conversation routes require the existing teacher login, and empty/missing sessions are handled', async () => {
  const { db, close } = database();
  try {
    const call = await client(db);
    assert.equal((await call('/admin/conversations', false)).status, 401);
    assert.equal((await call('/admin/conversations/session-missing-001', false)).status, 401);
    assert.equal((await call('/admin/conversations/session-missing-001')).status, 404);
    assert.equal((await call('/admin/conversations/invalid%27')).status, 404);
    const empty = await (await call('/admin/conversations?page=-5')).json();
    assert.deepEqual(empty.conversations, []);
    assert.equal(empty.pagination.page, 1);
    assert.equal(empty.pagination.totalPages, 1);
    assert.equal(empty.pagination.total, 0);
    const legacy = await (await call('/admin/questions')).json();
    assert.deepEqual(legacy.records, []);
  } finally { close(); }
});
