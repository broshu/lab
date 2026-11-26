// 用内存里的假 R2 测试上传、替换、删除、恢复、到期下架和课件访问。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import worker, { cleanUp, KEEP_DAYS, TRASH_DAYS } from '../src/app.js';

const DAY = 24 * 60 * 60 * 1000;

class FakeBucket {
  constructor() {
    this.objects = new Map();
    this.uploads = new Map();
    this.n = 0;
  }
  async put(key, value, options = {}) {
    const current = this.objects.get(key);
    if (options.onlyIf?.etagMatches && (!current || current.etag !== options.onlyIf.etagMatches)) return null;
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(await new Response(value).arrayBuffer());
    const object = { key, bytes, etag: `e${++this.n}`, size: bytes.length, httpMetadata: options.httpMetadata };
    this.objects.set(key, object);
    return object;
  }
  async get(key, options = {}) {
    const object = this.objects.get(key);
    if (!object) return null;
    let bytes = object.bytes;
    if (options.range) bytes = bytes.slice(options.range.offset, options.range.offset + options.range.length);
    return {
      ...object,
      body: new Response(bytes).body,
      json: async () => JSON.parse(new TextDecoder().decode(object.bytes)),
    };
  }
  async delete(keys) {
    for (const key of [].concat(keys)) this.objects.delete(key);
  }
  async createMultipartUpload(key) {
    const uploadId = `u${++this.n}`;
    this.uploads.set(uploadId, { key, parts: new Map() });
    return { uploadId };
  }
  resumeMultipartUpload(key, uploadId) {
    const bucket = this;
    return {
      async uploadPart(partNumber, body) {
        const bytes = new Uint8Array(await new Response(body).arrayBuffer());
        bucket.uploads.get(uploadId).parts.set(partNumber, bytes);
        return { partNumber, etag: `p${partNumber}` };
      },
      async complete(parts) {
        const upload = bucket.uploads.get(uploadId);
        const chunks = parts.map((p) => upload.parts.get(p.partNumber));
        const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let offset = 0;
        for (const c of chunks) {
          bytes.set(c, offset);
          offset += c.length;
        }
        bucket.uploads.delete(uploadId);
        return bucket.put(key, bytes);
      },
      async abort() {
        bucket.uploads.delete(uploadId);
      },
    };
  }
}

globalThis.caches = {
  default: { match: async () => undefined, put: async () => {} },
};

function makeEnv() {
  return {
    COURSEWARE: new FakeBucket(),
    AI: { run: async () => ({ response: 'Wave Formation' }) },
    ASSETS: {
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === '/manifest.json') {
          return Response.json({ sections: [{ id: 'ppt', items: [] }, { id: 'games', items: [{ name: 'g' }] }] });
        }
        if (url.pathname === '/ppt/videos/a.mp4') return new Response('video');
        return new Response(`asset ${url.pathname}`, { status: url.pathname === '/ppt/' ? 200 : 404 });
      },
    },
  };
}

const ctx = { waitUntil: () => {} };
const call = (env, path, init) => worker.fetch(new Request(`https://p.phylab.uk${path}`, init), env, ctx);
const post = (env, path, body) =>
  call(env, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

async function upload(env, fileName, content, slug) {
  const bytes = new TextEncoder().encode(content);
  const start = await post(env, '/upload/api/start', { fileName, size: bytes.length });
  const part = await call(env, `/upload/api/part?id=${start.id}&uploadId=${start.uploadId}&part=1`, { method: 'PUT', body: bytes }).then((r) => r.json());
  return post(env, '/upload/api/finish', { id: start.id, uploadId: start.uploadId, parts: [part], fileName, size: bytes.length, slug });
}

test('上传后出现在课件列表，网址用英文，下载名是中文', async () => {
  const env = makeEnv();
  const suggestion = await post(env, '/upload/api/suggest', { fileName: '波的形成.pptx' });
  assert.equal(suggestion.slug, 'wave-formation');
  const result = await upload(env, '波的形成.pptx', 'v1', suggestion.slug);
  assert.equal(result.item.href, '/ppt/wave-formation.pptx');
  assert.equal(result.replaced, false);

  const manifest = await call(env, '/manifest.json').then((r) => r.json());
  assert.deepEqual(manifest.sections[0].items.map((i) => [i.name, i.href, i.action]), [['波的形成', '/ppt/wave-formation.pptx', 'download']]);
  assert.equal(manifest.sections[1].items.length, 1);

  const file = await call(env, '/ppt/wave-formation.pptx');
  assert.equal(file.status, 200);
  assert.equal(await file.text(), 'v1');
  assert.match(file.headers.get('Content-Disposition'), /attachment/);
  assert.match(file.headers.get('Content-Disposition'), new RegExp(encodeURIComponent('波的形成.pptx')));
});

test('同名文件替换旧版，网址不变，旧版进回收站', async () => {
  const env = makeEnv();
  await upload(env, '波的形成.pptx', 'v1', 'wave-formation');
  const second = await upload(env, '波的形成.pptx', 'v2', 'something-else');
  assert.equal(second.replaced, true);
  assert.equal(second.item.slug, 'wave-formation');
  assert.equal(await call(env, '/ppt/wave-formation.pptx').then((r) => r.text()), 'v2');
  const list = await call(env, '/upload/api/list').then((r) => r.json());
  assert.equal(list.items.length, 1);
  assert.equal(list.trash.length, 1);
  assert.equal(list.trash[0].reason, 'replaced');
});

test('删除进回收站，可以恢复', async () => {
  const env = makeEnv();
  await upload(env, '单摆.html', '<p>pendulum</p>', 'simple-pendulum');
  await post(env, '/upload/api/delete', { slug: 'simple-pendulum' });
  let list = await call(env, '/upload/api/list').then((r) => r.json());
  assert.equal(list.items.length, 0);
  assert.equal(list.trash[0].reason, 'deleted');
  assert.equal((await call(env, '/ppt/simple-pendulum/')).status, 404);

  await post(env, '/upload/api/restore', { id: list.trash[0].id });
  list = await call(env, '/upload/api/list').then((r) => r.json());
  assert.equal(list.items.length, 1);
  assert.equal(list.trash.length, 0);
  assert.equal(await call(env, '/ppt/simple-pendulum/').then((r) => r.text()), '<p>pendulum</p>');
});

test('网页课件：新网址、旧网址跳转、相对路径的视频', async () => {
  const env = makeEnv();
  await upload(env, '质谱仪与回旋加速器.html', '<html>cyclotron</html>', 'courseware-a177f9ff');
  const page = await call(env, '/ppt/courseware-a177f9ff/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('Content-Type'), /text\/html/);
  assert.equal(page.headers.get('Content-Disposition'), null);

  const noSlash = await call(env, '/ppt/courseware-a177f9ff');
  assert.equal(noSlash.status, 301);
  assert.equal(noSlash.headers.get('Location'), 'https://p.phylab.uk/ppt/courseware-a177f9ff/');

  const oldEnglish = await call(env, '/ppt/courseware-a177f9ff.html');
  assert.equal(oldEnglish.headers.get('Location'), 'https://p.phylab.uk/ppt/courseware-a177f9ff/');
  const oldChinese = await call(env, `/ppt/${encodeURIComponent('质谱仪与回旋加速器.html')}`);
  assert.equal(oldChinese.headers.get('Location'), 'https://p.phylab.uk/ppt/courseware-a177f9ff/');

  const video = await call(env, '/ppt/courseware-a177f9ff/videos/a.mp4');
  assert.equal(await video.text(), 'video');
});

test('视频支持分段读取', async () => {
  const env = makeEnv();
  await upload(env, '演示.mp4', '0123456789', 'demo-video');
  const r = await call(env, '/ppt/demo-video.mp4', { headers: { Range: 'bytes=2-5' } });
  assert.equal(r.status, 206);
  assert.equal(await r.text(), '2345');
  assert.equal(r.headers.get('Content-Range'), 'bytes 2-5/10');
});

test('同网址不同文件名自动加编号', async () => {
  const env = makeEnv();
  await upload(env, 'A.pptx', 'a', 'same');
  const b = await upload(env, 'B.pptx', 'b', 'same');
  assert.equal(b.item.slug, 'same-2');
});

test('不支持的文件类型被拒绝', async () => {
  const env = makeEnv();
  const r = await call(env, '/upload/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: 'virus.exe', size: 10 }),
  });
  assert.equal(r.status, 400);
});

test('满 14 天下架进回收站，回收站满 30 天彻底删除', async () => {
  const env = makeEnv();
  await upload(env, '波的形成.pptx', 'v1', 'wave-formation');
  const start = Date.now();
  await cleanUp(env, start + (KEEP_DAYS - 1) * DAY);
  let list = await call(env, '/upload/api/list').then((r) => r.json());
  assert.equal(list.items.length, 1);

  await cleanUp(env, start + KEEP_DAYS * DAY + 1000);
  list = await call(env, '/upload/api/list').then((r) => r.json());
  assert.equal(list.items.length, 0);
  assert.equal(list.trash[0].reason, 'expired');
  const id = list.trash[0].id;
  assert.ok(env.COURSEWARE.objects.has(`files/${id}`));

  const purged = await cleanUp(env, start + (KEEP_DAYS + TRASH_DAYS) * DAY + 2000);
  assert.equal(purged, 1);
  assert.ok(!env.COURSEWARE.objects.has(`files/${id}`));
});

test('上传页能打开，不被搜索引擎收录', async () => {
  const env = makeEnv();
  const r = await call(env, '/upload/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('X-Robots-Tag'), /noindex/);
  assert.match(await r.text(), /上传课件/);
  assert.equal((await call(env, '/upload')).status, 301);
});

test('别的网站不能调用上传接口', async () => {
  const env = makeEnv();
  const r = await call(env, '/upload/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ slug: 'x' }),
  });
  assert.equal(r.status, 403);
});
