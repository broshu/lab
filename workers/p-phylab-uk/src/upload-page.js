// /upload/ 课件上传页。拖进文件 → 自动起英文网址 → 点“开始上传”。
// 大文件分成 10 MB 一段上传，每段失败自动重试。

export function uploadPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>上传课件 - 物理实验室</title>
  <link rel="icon" type="image/png" href="/icon.png">
  <link rel="stylesheet" href="/site.css">
  <style>
    main { padding: 32px 0 48px; }
    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .back-link { color: var(--muted); font-size: 14px; text-decoration: none; }
    .back-link:hover { color: var(--ink); }
    h1 { margin: 0 0 20px; font-size: 30px; }
    h2 { margin: 0; font-size: 16px; }
    .panel { margin-bottom: 22px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
    .panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 22px; border-bottom: 1px solid var(--soft-line); }
    .panel-body { padding: 4px 22px 10px; }
    .note { color: var(--muted); font-size: 13px; }
    #drop { display: grid; place-items: center; height: 150px; margin: 18px 22px; border: 2px dashed var(--line); border-radius: 8px; color: var(--muted); font-size: 15px; cursor: pointer; text-align: center; line-height: 1.7; }
    #drop.over { border-color: var(--ink); color: var(--ink); background: var(--bg); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    td, th { padding: 11px 8px; border-top: 1px solid var(--soft-line); text-align: left; vertical-align: middle; }
    tr:first-child td, tr:first-child th { border-top: 0; }
    th { color: var(--muted); font-weight: 500; font-size: 12px; }
    td.name { font-weight: 600; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    td.name a { color: var(--ink); text-decoration: none; }
    td.name a:hover { text-decoration: underline; }
    td.small { color: var(--muted); font-size: 12px; white-space: nowrap; }
    td.right { text-align: right; white-space: nowrap; }
    .slug { display: flex; align-items: center; gap: 2px; color: var(--muted); font-size: 12px; white-space: nowrap; }
    .slug input { width: 280px; padding: 5px 7px; border: 1px solid var(--line); border-radius: 5px; font: inherit; font-size: 13px; color: var(--ink); }
    .slug input[readonly] { background: var(--bg); color: var(--muted); }
    button { padding: 6px 13px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
    button:hover:not(:disabled) { border-color: var(--ink); }
    button:disabled { color: var(--muted); cursor: default; }
    button.primary { background: var(--ink); border-color: var(--ink); color: #fff; }
    button.primary:disabled { background: var(--muted); border-color: var(--muted); color: #fff; }
    .bar { width: 120px; height: 6px; border-radius: 3px; background: var(--soft-line); overflow: hidden; }
    .bar > div { height: 100%; width: 0; background: var(--ink); transition: width .2s; }
    .ok { color: #1a7f37; }
    .bad { color: #c62828; }
    .empty { padding: 16px 0; color: var(--muted); font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <div class="topbar"><a class="back-link" href="/ppt/">课件列表</a><span class="note" id="summary"></span></div>
    <h1>上传课件</h1>

    <section class="panel">
      <div class="panel-head">
        <h2>新课件</h2>
        <button class="primary" id="start" disabled>开始上传</button>
      </div>
      <div id="drop">把课件拖到这里，或点这里选择文件<br><span class="note">pptx、pdf、网页课件（html）、视频都可以；和已有课件同名会替换旧版，网址不变</span></div>
      <input type="file" id="picker" multiple hidden accept=".pptx,.ppt,.ppsx,.pdf,.html,.htm,.mp4,.m4v,.mov,.webm">
      <div class="panel-body" id="queue-wrap" hidden><table id="queue"></table></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>网站上的课件</h2><span class="note" id="keep-note"></span></div>
      <div class="panel-body"><table id="items"></table></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>回收站</h2><span class="note" id="trash-note"></span></div>
      <div class="panel-body"><table id="trash"></table></div>
    </section>
  </main>

<script>
const $ = (s) => document.querySelector(s);
const REASONS = { expired: "到期下架", deleted: "手动删除", replaced: "被新版替换" };
let partSize = 10 * 1024 * 1024;
let queue = [];
let busy = false;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

function sizeText(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function dateText(iso) {
  const d = new Date(iso);
  return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

async function api(path, options = {}) {
  const response = await fetch("/upload/api/" + path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || ("出错了（" + response.status + "）"));
  return data;
}

function post(path, body) {
  return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

// ------------------------------------------------ 已有课件和回收站

async function refresh() {
  const data = await api("list");
  partSize = data.partSize || partSize;
  $("#summary").textContent = data.items.length + " 个课件";
  $("#keep-note").textContent = "上传满 " + data.keepDays + " 天自动下架";
  $("#trash-note").textContent = "保留 " + data.trashDays + " 天，可以恢复";

  const items = $("#items");
  items.replaceChildren();
  if (!data.items.length) items.append(el("tr", {}, el("td", { class: "empty" }, "还没有课件")));
  else items.append(el("tr", {}, el("th", {}, "课件"), el("th", {}, "上传时间"), el("th", {}, "大小"), el("th", {}, "剩余"), el("th", {})));
  for (const item of data.items) {
    items.append(el("tr", {},
      el("td", { class: "name", title: item.fileName }, el("a", { href: item.href, target: "_blank" }, item.name)),
      el("td", { class: "small" }, dateText(item.uploadedAt)),
      el("td", { class: "small" }, sizeText(item.size)),
      el("td", { class: "small" }, item.daysLeft + " 天"),
      el("td", { class: "right" }, el("button", { onclick: () => remove(item) }, "删除"))));
  }

  const trash = $("#trash");
  trash.replaceChildren();
  if (!data.trash.length) trash.append(el("tr", {}, el("td", { class: "empty" }, "回收站是空的")));
  else trash.append(el("tr", {}, el("th", {}, "课件"), el("th", {}, "原因"), el("th", {}, "放入时间"), el("th", {}, "还能恢复"), el("th", {})));
  for (const entry of data.trash) {
    trash.append(el("tr", {},
      el("td", { class: "name", title: entry.fileName }, entry.name),
      el("td", { class: "small" }, REASONS[entry.reason] || entry.reason),
      el("td", { class: "small" }, dateText(entry.deletedAt)),
      el("td", { class: "small" }, entry.daysLeft + " 天"),
      el("td", { class: "right" }, el("button", { onclick: () => restore(entry) }, "恢复"))));
  }
}

async function remove(item) {
  if (!confirm("从网站上删除「" + item.name + "」？\\n删除后在回收站保留 30 天，可以恢复。")) return;
  try { await post("delete", { slug: item.slug }); } catch (e) { alert(e.message); }
  refresh();
}

async function restore(entry) {
  try { await post("restore", { id: entry.id }); } catch (e) { alert(e.message); }
  refresh();
}


// ------------------------------------------------ 网页课件自动压缩
// 网页课件里的图片常常是没压缩的 PNG，整页要几十 MB。上传前在浏览器里把每张图
// 缩到最宽 1920 像素，并改存为 WebP（浏览器不支持时，不透明的图改存 JPEG），只在变小时替换。
const MAX_WIDTH = 1920;
const IMAGE_RE = /data:image\\/(png|jpe?g|webp|bmp);base64,[A-Za-z0-9+\\/=]+/g;

function canEncode(type) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  return c.toDataURL(type).startsWith("data:" + type);
}

async function shrinkImage(dataUrl, webp) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let out;
  if (webp) {
    out = canvas.toDataURL("image/webp", 0.85);
  } else {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = true;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) { opaque = false; break; }
    out = opaque ? canvas.toDataURL("image/jpeg", 0.85) : canvas.toDataURL("image/png");
  }
  return out.length < dataUrl.length * 0.9 ? out : dataUrl;
}

async function compressHtml(file, onProgress) {
  const text = await file.text();
  const found = [...new Set(text.match(IMAGE_RE) || [])];
  if (!found.length) return file;
  const webp = canEncode("image/webp");
  const replaced = new Map();
  let done = 0;
  for (const url of found) {
    try {
      const small = await shrinkImage(url, webp);
      if (small !== url) replaced.set(url, small);
    } catch (error) {
      console.warn("图片压缩失败，保留原图", error);
    }
    onProgress(++done, found.length);
  }
  if (!replaced.size) return file;
  const result = text.replace(IMAGE_RE, (url) => replaced.get(url) || url);
  return new File([result], file.name, { type: "text/html" });
}

// ------------------------------------------------ 上传

function addFiles(files) {
  for (const file of files) {
    const job = { file, slug: "", status: "正在起英文网址…", done: false, failed: false, sent: 0 };
    job.input = el("input", { value: "", placeholder: "english-link-name" });
    job.input.addEventListener("input", () => { job.slug = job.input.value; });
    job.bar = el("div");
    job.state = el("span", { class: "note" }, job.status);
    job.row = el("tr", {},
      el("td", { class: "name", title: file.name }, file.name),
      el("td", { class: "small" }, job.note = el("span", {}, sizeText(file.size))),
      el("td", {}, el("span", { class: "slug" }, "/ppt/", job.input)),
      el("td", {}, el("div", { class: "bar" }, job.bar)),
      el("td", { class: "right" }, job.state));
    $("#queue").append(job.row);
    queue.push(job);
    post("suggest", { fileName: file.name }).then((data) => {
      job.slug = data.slug;
      job.input.value = data.slug;
      if (data.replaces) {
        job.input.readOnly = true;
        setState(job, "会替换旧版，网址不变");
      } else {
        setState(job, "等待上传");
      }
    }).catch(() => setState(job, "等待上传"));
  }
  $("#queue-wrap").hidden = queue.length === 0;
  $("#start").disabled = busy || !queue.some((j) => !j.done);
}

function setState(job, text, cls = "note") {
  job.state.className = cls;
  job.state.textContent = text;
}

async function sendPart(job, start, number, attempt = 1) {
  const blob = job.file.slice(start, Math.min(start + partSize, job.file.size));
  try {
    const query = new URLSearchParams({ id: job.id, uploadId: job.uploadId, part: number });
    return await api("part?" + query, { method: "PUT", body: blob });
  } catch (error) {
    if (attempt >= 4) throw error;
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return sendPart(job, start, number, attempt + 1);
  }
}

async function upload(job) {
  let file = job.file;
  if (/\\.html?$/i.test(file.name)) {
    const before = file.size;
    file = await compressHtml(file, (n, total) => setState(job, "压缩图片 " + n + "/" + total));
    if (file.size < before) job.note.textContent = sizeText(before) + " → " + sizeText(file.size);
  }
  setState(job, "上传中…");
  job.input.readOnly = true;
  const started = await post("start", { fileName: file.name, size: file.size });
  job.id = started.id;
  job.uploadId = started.uploadId;
  partSize = started.partSize || partSize;
  const total = Math.max(1, Math.ceil(file.size / partSize));
  const parts = new Array(total);
  let next = 0;
  let sent = 0;
  async function worker() {
    while (next < total) {
      const index = next++;
      const part = await sendPart(job, index * partSize, index + 1);
      parts[index] = { partNumber: part.partNumber, etag: part.etag };
      sent += 1;
      job.bar.style.width = Math.round((sent / total) * 100) + "%";
    }
  }
  try {
    await Promise.all([worker(), worker(), worker()]);
  } catch (error) {
    post("abort", { id: job.id, uploadId: job.uploadId }).catch(() => {});
    throw error;
  }
  const result = await post("finish", { id: job.id, uploadId: job.uploadId, parts, fileName: file.name, size: file.size, slug: job.slug });
  job.done = true;
  setState(job, result.replaced ? "已替换旧版" : "已上线", "ok");
}

$("#start").addEventListener("click", async () => {
  busy = true;
  $("#start").disabled = true;
  for (const job of queue.filter((j) => !j.done)) {
    try {
      await upload(job);
    } catch (error) {
      job.input.readOnly = false;
      setState(job, error.message || "上传失败", "bad");
    }
  }
  busy = false;
  $("#start").disabled = !queue.some((j) => !j.done);
  refresh();
});

const drop = $("#drop");
drop.addEventListener("click", () => $("#picker").click());
$("#picker").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
window.addEventListener("beforeunload", (e) => { if (busy) { e.preventDefault(); e.returnValue = ""; } });

refresh().catch((error) => { $("#summary").textContent = error.message; });
</script>
</body>
</html>`;
}
