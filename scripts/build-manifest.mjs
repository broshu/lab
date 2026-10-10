import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// 用法：node scripts/build-manifest.mjs [站点目录]
// 传入站点目录（工作流里是 _site）时，会把其中 ppt/ 下含中文、空格等字符的文件改成拼音文件名，
// 网站上显示的仍是原来的中文名。仓库里的文件名不用改，照常放中文名即可。
const siteDir = process.argv[2] || null;

// 拼音库在工作流里安装（npm install --no-save pinyin-pro）；本地没装时退回用哈希命名。
let toPinyin = null;
try {
  ({ pinyin: toPinyin } = await import("pinyin-pro"));
} catch {
  console.warn("未找到 pinyin-pro，含中文的文件名将改用哈希命名");
}

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function shortHash(text) {
  return createHash("sha1").update(text).digest("hex").slice(0, 8);
}

function slugify(base) {
  const tokens = toPinyin
    ? toPinyin(base, { toneType: "none", type: "array", nonZh: "consecutive", v: true })
    : [base];
  const slug = tokens
    .map((token) => token.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return toPinyin && slug ? slug : `file-${shortHash(base)}`;
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
    let name = `${slugify(cleanFileName(fileName))}${ext}`;
    if (used.has(name)) {
      name = `${slugify(cleanFileName(fileName))}-${shortHash(fileName)}${ext}`;
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

function buildPpt(files) {
  const allPaths = directFiles(files, "ppt/");
  const names = linkNames(allPaths);
  // ppt/ 下所有文件都会发布到网站，不在列表里的也一起改名。
  if (siteDir) {
    for (const path of allPaths) {
      const from = join(siteDir, path);
      if (names.get(path) !== path.split("/").pop() && existsSync(from)) {
        renameSync(from, join(siteDir, "ppt", names.get(path)));
      }
    }
  }
  const paths = allPaths.filter((path) => /\.(pptx|pdf|html)$/i.test(path));
  const items = paths.map((path) => {
    const linkName = names.get(path);
    return {
      name: cleanFileName(path.split("/").pop()),
      href: `ppt/${linkName}`,
      action: path.toLowerCase().endsWith(".html") ? "open" : "download",
      updatedAt: latestCommitDate(path)
    };
  });

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
        href: indexPath,
        updatedAt: latestCommitDate(indexPath) || latestCommitDate(directory)
      };
    });

  return sortByTime(items);
}

function buildResources(files, directory = "resources/") {
  const folders = directDirectories(files, directory).map((folderPath) => {
    const children = buildResources(files, folderPath);
    return {
      name: folderPath.split("/").filter(Boolean).pop(),
      type: "folder",
      href: folderPath,
      children,
      updatedAt: maxDate(children) || latestCommitDate(folderPath)
    };
  });

  const fileItems = directFiles(files, directory).filter((path) => !/\.(pyc|py)$/i.test(path)).map((path) => ({
    name: cleanFileName(path.split("/").pop()),
    href: path,
    updatedAt: latestCommitDate(path)
  }));

  return sortByTime([...folders, ...fileItems]);
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
    // 「资料」栏目已停用，首页这个位置换成了作业问答系统（tutor/screen.html）。
  ]
};

const json = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync("manifest.json", json);
if (siteDir) {
  writeFileSync(join(siteDir, "manifest.json"), json);
}
