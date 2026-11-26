// p-phylab-uk：p.phylab.uk 整个网站。
// - 网页、小游戏、作业问答页面：来自 GitHub 仓库，构建后作为静态文件（env.ASSETS）发布。
// - 课件（.pptx、.pdf、视频、网页课件）：存在 R2 存储桶（env.COURSEWARE），从 /upload/ 上传。
// - /api/* 不经过这里，由 p-ai-tutor Worker 处理。
//
// R2 里的结构：
//   files/<编号>    课件文件本身，上传后不再改动
//   index.json      课件目录：items 是网站上的课件，trash 是回收站
// 规则：同名文件替换旧版；上传满 14 天自动下架；下架、删除、被替换的旧版进回收站，30 天后彻底删除。

import { uploadPage } from './upload-page.js';

export const KEEP_DAYS = 14;
export const TRASH_DAYS = 30;
export const PART_SIZE = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const INDEX_KEY = 'index.json';
const DAY_MS = 24 * 60 * 60 * 1000;

export const ALLOWED = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};
const VIDEO = new Set(['mp4', 'm4v', 'mov', 'webm']);

// ------------------------------------------------------------ 小工具

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function splitName(fileName) {
  const clean = String(fileName || '').split(/[\\/]/).pop().trim();
  const m = clean.match(/^(.*)\.([A-Za-z0-9]+)$/);
  if (!m) return { base: clean, ext: '' };
  return { base: m[1].trim(), ext: m[2].toLowerCase() === 'htm' ? 'html' : m[2].toLowerCase() };
}

export function cleanSlug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

async function shortHash(text) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hrefOf(item) {
  return item.ext === 'html' ? `/ppt/${item.slug}/` : `/ppt/${item.slug}.${item.ext}`;
}

function publicItem(item, now = Date.now()) {
  const expiresAt = Date.parse(item.uploadedAt) + KEEP_DAYS * DAY_MS;
  return {
    name: item.name,
    fileName: item.fileName,
    slug: item.slug,
    ext: item.ext,
    href: hrefOf(item),
    size: item.size,
    uploadedAt: item.uploadedAt,
    daysLeft: Math.max(0, Math.ceil((expiresAt - now) / DAY_MS)),
  };
}

function publicTrash(entry, now = Date.now()) {
  const purgeAt = Date.parse(entry.deletedAt) + TRASH_DAYS * DAY_MS;
  return {
    id: entry.id,
    name: entry.name,
    fileName: entry.fileName,
    slug: entry.slug,
    ext: entry.ext,
    size: entry.size,
    uploadedAt: entry.uploadedAt,
    deletedAt: entry.deletedAt,
    reason: entry.reason,
    daysLeft: Math.max(0, Math.ceil((purgeAt - now) / DAY_MS)),
  };
}

// ------------------------------------------------------------ 课件目录 index.json

let cachedIndex = null; // { at, etag, data }

async function readIndex(env, fresh = false) {
  if (!fresh && cachedIndex && Date.now() - cachedIndex.at < 10_000) {
    return { etag: cachedIndex.etag, data: structuredClone(cachedIndex.data) };
  }
  const object = await env.COURSEWARE.get(INDEX_KEY);
  const data = object ? await object.json() : { items: [], trash: [] };
  data.items ||= [];
  data.trash ||= [];
  const etag = object ? object.etag : null;
  cachedIndex = { at: Date.now(), etag, data: structuredClone(data) };
  return { etag, data };
}

// 改目录：先读最新版本，改完带 etag 写回；中途被别的请求改过就重来。
export async function updateIndex(env, change) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { etag, data } = await readIndex(env, true);
    const result = await change(data);
    const options = { httpMetadata: { contentType: 'application/json' } };
    if (etag) options.onlyIf = { etagMatches: etag };
    const written = await env.COURSEWARE.put(INDEX_KEY, JSON.stringify(data), options);
    if (written) {
      cachedIndex = { at: Date.now(), etag: written.etag, data: structuredClone(data) };
      return result;
    }
  }
  throw new HttpError(409, '目录正忙，请再试一次');
}

function toTrash(data, item, reason, now) {
  data.trash.unshift({ ...item, deletedAt: new Date(now).toISOString(), reason });
}

// ------------------------------------------------------------ 英文网址名

export async function suggestSlug(env, name, data) {
  // 纯英文的文件名直接用；含中文的请 Workers AI 意译成英文（不用拼音）。
  const hasChinese = /[\u3400-\u9fff\uf900-\ufaff]/.test(name);
  let slug = hasChinese ? '' : cleanSlug(name);
  if (!slug && env.AI) {
    // 先用 Llama 3.3 70B（快，中文理解好），不可用时退回 8B。每次最多等 15 秒。新旧两种返回格式都认。
    for (const model of ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct-fast']) {
      try {
        const run = env.AI.run(model, {
          messages: [
            {
              role: 'system',
              content:
                'You turn a Chinese high-school physics courseware title into a short English URL slug. ' +
                'Translate the meaning (never pinyin), 2 to 7 lowercase English words joined by hyphens. ' +
                'Use physics terms: 图像 = graphs, 专题强化 = topic review, 试卷讲评 = exam review, 实验 = lab, ' +
                '高一 = grade-10, 高二 = grade-11, 竞赛 = olympiad. Reply with the slug only, nothing else.',
            },
            { role: 'user', content: name },
          ],
          max_tokens: 40,
        });
        const answer = await Promise.race([run, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))]);
        const text = String(answer?.response ?? answer?.choices?.[0]?.message?.content ?? '')
          .replace(/<think>[\s\S]*?<\/think>/g, '')
          .trim()
          .split('\n')
          .pop();
        slug = cleanSlug(text).split('-').slice(0, 8).join('-');
        if (slug) break;
      } catch (error) {
        console.warn(`slug suggestion failed with ${model}`, error);
      }
    }
  }
  if (!slug) slug = `courseware-${await shortHash(name)}`;
  return uniqueSlug(slug, data);
}

function uniqueSlug(slug, data, ignoreFileName = null) {
  const taken = new Set(data.items.filter((i) => i.fileName !== ignoreFileName).map((i) => i.slug));
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n += 1) {
    if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
  }
}

// ------------------------------------------------------------ 上传接口 /upload/api/*

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, '请求格式不对');
  }
}

function checkFile(fileName, size) {
  const { base, ext } = splitName(fileName);
  if (!base || !ALLOWED[ext]) {
    throw new HttpError(400, `不支持这种文件：${fileName}（可以上传 pptx、ppt、pdf、html、mp4、mov、webm）`);
  }
  if (!(size > 0) || size > MAX_FILE_BYTES) {
    throw new HttpError(400, '文件大小不对（最大 1 GB）');
  }
  return { base, ext };
}

async function handleApi(request, env, path) {
  const method = request.method;

  if (path === 'list' && method === 'GET') {
    const { data } = await readIndex(env, true);
    const now = Date.now();
    return json({
      items: sortItems(data.items).map((i) => publicItem(i, now)),
      trash: data.trash.map((t) => publicTrash(t, now)),
      keepDays: KEEP_DAYS,
      trashDays: TRASH_DAYS,
      partSize: PART_SIZE,
    });
  }

  if (path === 'suggest' && method === 'POST') {
    const body = await readJson(request);
    const { base, ext } = splitName(body.fileName);
    const { data } = await readIndex(env);
    const existing = data.items.find((i) => i.fileName === `${base}.${ext}`);
    if (existing) return json({ slug: existing.slug, replaces: publicItem(existing) });
    return json({ slug: await suggestSlug(env, base, data), replaces: null });
  }

  if (path === 'start' && method === 'POST') {
    const body = await readJson(request);
    const { ext } = checkFile(body.fileName, body.size);
    const id = crypto.randomUUID();
    const upload = await env.COURSEWARE.createMultipartUpload(`files/${id}`, {
      httpMetadata: { contentType: ALLOWED[ext] },
    });
    return json({ id, uploadId: upload.uploadId, partSize: PART_SIZE });
  }

  if (path === 'part' && method === 'PUT') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    const uploadId = url.searchParams.get('uploadId') || '';
    const partNumber = Number.parseInt(url.searchParams.get('part'), 10);
    if (!/^[0-9a-f-]{36}$/.test(id) || !uploadId || !(partNumber >= 1 && partNumber <= 10000) || !request.body) {
      throw new HttpError(400, '分段参数不对');
    }
    const upload = env.COURSEWARE.resumeMultipartUpload(`files/${id}`, uploadId);
    const part = await upload.uploadPart(partNumber, request.body);
    return json({ partNumber: part.partNumber, etag: part.etag });
  }

  if (path === 'finish' && method === 'POST') {
    const body = await readJson(request);
    const { base, ext } = checkFile(body.fileName, body.size);
    const id = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/.test(id) || !body.uploadId || !Array.isArray(body.parts) || !body.parts.length) {
      throw new HttpError(400, '上传信息不完整');
    }
    const upload = env.COURSEWARE.resumeMultipartUpload(`files/${id}`, body.uploadId);
    const object = await upload.complete(body.parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })));
    const fileName = `${base}.${ext}`;
    const wanted = cleanSlug(body.slug);
    const now = Date.now();
    const item = await updateIndex(env, async (data) => {
      const old = data.items.find((i) => i.fileName === fileName);
      // 同名文件：沿用旧网址，旧版进回收站。
      const slug = old ? old.slug : uniqueSlug(wanted || (await suggestSlug(env, base, data)), data);
      if (old) {
        data.items = data.items.filter((i) => i !== old);
        toTrash(data, old, 'replaced', now);
      }
      const fresh = {
        id,
        name: base,
        fileName,
        slug,
        ext,
        size: object.size,
        uploadedAt: new Date(now).toISOString(),
      };
      data.items.push(fresh);
      return { item: publicItem(fresh, now), replaced: Boolean(old) };
    });
    return json(item);
  }

  if (path === 'abort' && method === 'POST') {
    const body = await readJson(request);
    if (/^[0-9a-f-]{36}$/.test(String(body.id || '')) && body.uploadId) {
      try {
        await env.COURSEWARE.resumeMultipartUpload(`files/${body.id}`, body.uploadId).abort();
      } catch {
        // 已经结束的上传不用管
      }
    }
    return json({ ok: true });
  }

  if (path === 'delete' && method === 'POST') {
    const body = await readJson(request);
    const now = Date.now();
    await updateIndex(env, (data) => {
      const item = data.items.find((i) => i.slug === body.slug);
      if (!item) throw new HttpError(404, '没有找到这个课件');
      data.items = data.items.filter((i) => i !== item);
      toTrash(data, item, 'deleted', now);
    });
    return json({ ok: true });
  }

  if (path === 'restore' && method === 'POST') {
    const body = await readJson(request);
    const now = Date.now();
    const restored = await updateIndex(env, (data) => {
      const entry = data.trash.find((t) => t.id === body.id);
      if (!entry) throw new HttpError(404, '回收站里没有这个文件');
      data.trash = data.trash.filter((t) => t !== entry);
      // 恢复的课件重新计 14 天；现在网站上同名或同网址的课件换进回收站。
      for (const clash of data.items.filter((i) => i.fileName === entry.fileName || i.slug === entry.slug)) {
        data.items = data.items.filter((i) => i !== clash);
        toTrash(data, clash, 'replaced', now);
      }
      const { deletedAt, reason, ...item } = entry;
      item.uploadedAt = new Date(now).toISOString();
      data.items.push(item);
      return publicItem(item, now);
    });
    return json({ item: restored });
  }

  throw new HttpError(404, '没有这个接口');
}

// ------------------------------------------------------------ 每天的清理

export async function cleanUp(env, now = Date.now()) {
  const toDelete = [];
  await updateIndex(env, (data) => {
    toDelete.length = 0;
    for (const item of [...data.items]) {
      if (now - Date.parse(item.uploadedAt) >= KEEP_DAYS * DAY_MS) {
        data.items = data.items.filter((i) => i !== item);
        toTrash(data, item, 'expired', now);
      }
    }
    const keep = [];
    for (const entry of data.trash) {
      if (now - Date.parse(entry.deletedAt) >= TRASH_DAYS * DAY_MS) toDelete.push(entry.id);
      else keep.push(entry);
    }
    data.trash = keep;
  });
  // 同一个文件不会同时在网站和回收站里，彻底删除时只删回收站到期的。
  if (toDelete.length) await env.COURSEWARE.delete(toDelete.map((id) => `files/${id}`));
  return toDelete.length;
}

// ------------------------------------------------------------ 课件访问 /ppt/*

function sortItems(items) {
  return [...items].sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function contentDisposition(item, inline) {
  const fileName = `${item.name}.${item.ext}`;
  const ascii = `${item.slug}.${item.ext}`;
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) {
    const suffix = Math.min(Number(m[2]), size);
    return { offset: size - suffix, length: suffix };
  }
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || end < start) return 'invalid';
  return { offset: start, length: end - start + 1 };
}

async function serveFile(request, env, ctx, item) {
  const headers = new Headers({
    'Content-Type': ALLOWED[item.ext] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=300',
    'Accept-Ranges': 'bytes',
    ETag: `"${item.id}"`,
  });
  if (item.ext !== 'html') {
    headers.set('Content-Disposition', contentDisposition(item, item.ext === 'pdf' || VIDEO.has(item.ext)));
  }
  if (request.headers.get('If-None-Match') === `"${item.id}"`) {
    return new Response(null, { status: 304, headers });
  }

  if (request.method === 'HEAD') {
    headers.set('Content-Length', String(item.size));
    return new Response(null, { status: 200, headers });
  }

  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    const range = parseRange(rangeHeader, item.size);
    if (range === 'invalid') {
      headers.set('Content-Range', `bytes */${item.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (range) {
      const object = await env.COURSEWARE.get(`files/${item.id}`, { range });
      if (!object) return new Response('课件文件不见了', { status: 404 });
      headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${item.size}`);
      headers.set('Content-Length', String(range.length));
      return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
    }
  }

  // 整个文件：先找 Cloudflare 边缘缓存；没有就从 R2 取，同时在后台另取一份存进缓存。
  // 编号不变，缓存就一直有效；替换课件会换新编号。
  const cache = caches.default;
  const cacheKey = new Request(`https://p.phylab.uk/__courseware/${item.id}`);
  let body = null;
  const cached = await cache.match(cacheKey);
  if (cached) {
    body = cached.body;
  } else {
    const object = await env.COURSEWARE.get(`files/${item.id}`);
    if (!object) return new Response('课件文件不见了', { status: 404 });
    body = object.body;
    ctx.waitUntil(
      (async () => {
        const copy = await env.COURSEWARE.get(`files/${item.id}`);
        if (!copy) return;
        await cache.put(
          cacheKey,
          new Response(copy.body, {
            headers: { 'Content-Length': String(copy.size), 'Cache-Control': 'public, max-age=31536000, immutable' },
          }),
        );
      })().catch((error) => console.warn('cache put failed', error)),
    );
  }
  headers.set('Content-Length', String(item.size));
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}

async function handlePpt(request, env, ctx, url) {
  let rest;
  try {
    rest = decodeURIComponent(url.pathname.slice('/ppt/'.length));
  } catch {
    return env.ASSETS.fetch(request);
  }
  if (!rest) return env.ASSETS.fetch(request); // /ppt/ 课件列表页
  const parts = rest.split('/');
  const { data } = await readIndex(env);
  const first = parts[0];

  // /ppt/<网址名>/ → 网页课件；/ppt/<网址名>/videos/x.mp4 这类相对路径 → 仓库里的 /ppt/videos/x.mp4
  const page = data.items.find((i) => i.ext === 'html' && i.slug === first);
  if (page) {
    if (parts.length === 1) return Response.redirect(`${url.origin}/ppt/${page.slug}/${url.search}`, 301);
    if (parts.length === 2 && (parts[1] === '' || parts[1] === 'index.html')) return serveFile(request, env, ctx, page);
    return env.ASSETS.fetch(new Request(new URL(`/ppt/${parts.slice(1).join('/')}`, url), request));
  }

  if (parts.length === 1) {
    const { base, ext } = splitName(first);
    // 下载文件 /ppt/<网址名>.pptx
    const file = data.items.find((i) => i.ext !== 'html' && i.slug === base && i.ext === ext);
    if (file) return serveFile(request, env, ctx, file);
  }

  return env.ASSETS.fetch(request); // 仓库里的文件（模板、视频）或 404
}

// /manifest.json：仓库构建出的目录 + R2 里的课件
async function handleManifest(request, env) {
  const response = await env.ASSETS.fetch(new Request(new URL('/manifest.json', request.url)));
  const manifest = response.ok ? await response.json() : { sections: [] };
  const { data } = await readIndex(env);
  const ppt = manifest.sections.find((s) => s.id === 'ppt');
  const uploaded = sortItems(data.items).map((i) => ({
    name: i.name,
    href: hrefOf(i),
    action: i.ext === 'html' ? 'open' : 'download',
    updatedAt: i.uploadedAt,
  }));
  if (ppt) ppt.items = [...uploaded, ...ppt.items];
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}

// ------------------------------------------------------------ 入口

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/upload') return Response.redirect(`${url.origin}/upload/`, 301);
      if (url.pathname === '/upload/') {
        return new Response(uploadPage(), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow',
            'Referrer-Policy': 'no-referrer',
          },
        });
      }
      if (url.pathname.startsWith('/upload/api/')) {
        const origin = request.headers.get('Origin');
        if (request.method !== 'GET' && origin && origin !== url.origin) throw new HttpError(403, '只能从本站上传');
        return await handleApi(request, env, url.pathname.slice('/upload/api/'.length));
      }
      if (url.pathname === '/manifest.json') return await handleManifest(request, env);
      if (url.pathname.startsWith('/ppt/')) return await handlePpt(request, env, ctx, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: '服务器出错了，请再试一次' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanUp(env).then((n) => console.log(`purged ${n} files from trash`)));
  },
};
