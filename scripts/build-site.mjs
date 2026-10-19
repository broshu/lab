import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// 用法：node scripts/build-site.mjs [站点目录]
// 生成栏目目录 manifest.json。传入站点目录（工作流里是 _site）时，还会整理网站上的网址：
// - 按 ppt/links.json 把 ppt/ 下的中文文件名改成英文链接名，网站上显示的仍是中文名；
// - 每个网页都放成「文件夹/index.html」，网址里不出现 .html：
//     /ppt/ 课件列表，/games/ 互动实验列表，/ppt/<英文名>/ 网页课件，/tutor/ 作业问答，/answers/ 作业答案；
// - 旧网址（library.html、ppt/*.html、tutor/screen.html、tutor/screen/）留一个跳转页，自动转到新网址。
// 仓库里的文件不用按这个结构摆放，照常放即可。
const siteDir = process.argv[2] || null;

// ppt/links.json：{"中文文件名.pptx": "english-link-name"}，新课件在这里加一行英文名。
const LINKS_FILE = "ppt/links.json";
const englishNames = existsSync(LINKS_FILE) ? JSON.parse(readFileSync(LINKS_FILE, "utf8")) : {};

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function shortHash(text) {
  return createHash("sha1").update(text).digest("hex").slice(0, 8);
}

function englishSlug(fileName) {
  const slug = String(englishNames[fileName] || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug) {
    return slug;
  }
  // 还没起英文名的课件先用编号链接，并在部署日志里提醒补到 links.json。
  console.log(`::warning::${fileName} 还没有英文链接名，请在 ${LINKS_FILE} 里补上`);
  return `courseware-${shortHash(fileName)}`;
}

// 给 ppt/ 里每个文件一个只含英文字母、数字和 - 的链接名；已经安全的文件名保持不变。
function linkNames(paths) {
  const used = new Set(paths.map((path) => path.split("/").pop()).filter((name) => SAFE_NAME.test(name)));
  const result = new Map();
  for (const path of paths) {
    const fileName = path.split("/").pop();
    if (SAFE_NAME.test(fileName)) {
      result.set(path, fileName);
      continue;
    }
    const ext = (fileName.match(/\.[^/.]+$/)?.[0] || "").toLowerCase();
    let name = `${englishSlug(fileName)}${ext}`;
    if (used.has(name)) {
      name = `${englishSlug(fileName)}-${shortHash(fileName)}${ext}`;
    }
    used.add(name);
    result.set(path, name);
  }
  return result;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function cleanFileName(fileName) {
  return fileName.replace(/\.[^/.]+$/, "").trim();
}

// 互动实验的名字取自页面 <title>，只保留第一个 “ · ” 之前的部分；没有标题时退回文件夹名。
function gameTitle(indexPath, folderName) {
  const html = readFileSync(indexPath, "utf8");
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").split(" · ")[0].trim();
  return title || folderName;
}

// 隐藏文件、Office 临时文件和模板不在网站上列出。
function isHiddenName(name) {
  return !name || name.startsWith(".") || name.startsWith("~$") || /^template/i.test(name) || name === "__pycache__";
}

function trackedFiles() {
  return git(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean);
}

function latestCommitDate(path) {
  try {
    return git(["log", "-1", "--format=%cI", "--", path]) || null;
  } catch {
    return null;
  }
}

function maxDate(items) {
  return items
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function sortByTime(items) {
  return items.sort((a, b) => {
    const timeA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const timeB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

function directFiles(files, directory) {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  return files
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .filter((rest) => rest && !rest.includes("/") && !isHiddenName(rest))
    .map((name) => `${prefix}${name}`);
}

function directDirectories(files, directory) {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  return Array.from(new Set(files
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .filter((rest) => rest.includes("/"))
    .map((rest) => rest.split("/")[0])
    .filter((name) => name && !isHiddenName(name))
    .map((name) => `${prefix}${name}/`)));
}

function isHtml(path) {
  return path.toLowerCase().endsWith(".html");
}

// 网页课件 ppt/<英文名>.html → 网址 /ppt/<英文名>/；下载用的 pptx、pdf 保留扩展名。
function pptHref(linkName, path) {
  return isHtml(path) ? `/ppt/${linkName.replace(/\.html$/i, "")}/` : `/ppt/${linkName}`;
}

function buildPpt(files) {
  const allPaths = directFiles(files, "ppt/");
  const names = linkNames(allPaths);
  // ppt/ 下所有文件都会发布到网站，不在列表里的也一起改名；网页课件放进同名文件夹。
  if (siteDir) {
    for (const path of allPaths) {
      const from = join(siteDir, path);
      if (!existsSync(from)) {
        continue;
      }
      const linkName = names.get(path);
      if (isHtml(path)) {
        const href = pptHref(linkName, path);
        moveTo(from, join(siteDir, href, "index.html"));
        writeRedirect(join(siteDir, "ppt", linkName), href);
      } else if (linkName !== path.split("/").pop()) {
        renameSync(from, join(siteDir, "ppt", linkName));
      }
    }
  }
  const paths = allPaths.filter((path) => /\.(pptx|pdf|html)$/i.test(path));
  const items = paths.map((path) => ({
    name: cleanFileName(path.split("/").pop()),
    href: pptHref(names.get(path), path),
    action: isHtml(path) ? "open" : "download",
    updatedAt: latestCommitDate(path)
  }));

  return sortByTime(items);
}

function buildGames(files) {
  const items = directDirectories(files, "games/")
    .filter((directory) => files.includes(`${directory}index.html`))
    .map((directory) => {
      const folderName = directory.split("/").filter(Boolean).pop();
      const indexPath = `${directory}index.html`;
      return {
        name: gameTitle(indexPath, folderName),
        href: `/${directory}`,
        updatedAt: latestCommitDate(indexPath) || latestCommitDate(directory)
      };
    });

  return sortByTime(items);
}

function moveTo(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// 旧网址的跳转页：带上原来的 ?参数 和 #锚点 转到新网址。script 可以自己算目标网址。
function writeRedirect(file, target, script = "") {
  const safe = escapeHtml(target);
  const jump = script || `location.replace(${JSON.stringify(target)} + location.search + location.hash);`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <title>页面已搬到新地址</title>
  <link rel="canonical" href="${safe}">
  <script>${jump}</script>
  <noscript><meta http-equiv="refresh" content="0; url=${safe}"></noscript>
</head>
<body>
  <p>页面已搬到新地址：<a href="${safe}">${safe}</a></p>
</body>
</html>
`);
}

// 课件、互动实验的列表页（library.html）复制到 /ppt/ 和 /games/；作业问答放到 /tutor/，作业答案放到 /answers/。
function publishPages() {
  for (const section of manifest.sections) {
    copyFileSync(join(siteDir, "library.html"), join(siteDir, section.id, "index.html"));
  }
  writeRedirect(join(siteDir, "library.html"), "/", `
    const params = new URLSearchParams(location.search);
    const section = { ppt: "/ppt/", games: "/games/" }[params.get("section")] || "/";
    const rest = section !== "/" && params.get("path") ? "?" + new URLSearchParams({ path: params.get("path") }) : "";
    location.replace(section + rest + location.hash);`);

  moveTo(join(siteDir, "tutor", "screen.html"), join(siteDir, "tutor", "index.html"));
  moveTo(join(siteDir, "tutor", "answers.html"), join(siteDir, "answers", "index.html"));
  writeRedirect(join(siteDir, "tutor", "screen.html"), "/tutor/");
  writeRedirect(join(siteDir, "tutor", "screen", "index.html"), "/tutor/");
}

const files = trackedFiles();
const manifest = {
  generatedAt: new Date().toISOString(),
  sections: [
    {
      id: "ppt",
      title: "课件",
      type: "download",
      items: buildPpt(files)
    },
    {
      id: "games",
      title: "互动实验",
      type: "open",
      items: buildGames(files)
    }
    // 「资料」栏目已停用，首页这个位置换成了作业问答系统（/tutor/）。
  ]
};

const json = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync("manifest.json", json);
if (siteDir) {
  writeFileSync(join(siteDir, "manifest.json"), json);
  publishPages();
}
