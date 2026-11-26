// 生成要发布的网站目录 _site（Cloudflare 构建时运行，见 workers/p-phylab-uk）。
// 步骤和原来的 GitHub Pages 工作流一样：跑小游戏测试 → 生成作业答案 → 复制网页 → 整理网址。
// 课件（pptx、pdf、网页课件）不在仓库里，存在 R2，由 Worker 直接提供。
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

// 构建时拿到的仓库可能只有最近一次提交；补上提交记录（不下载文件内容），列表才能按更新时间排序。
try {
  if (execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() === "true") {
    run("git", ["fetch", "--unshallow", "--filter=blob:none", "--quiet"]);
  }
} catch {
  console.log("::warning::没能补全提交记录，列表顺序可能不准");
}

for (const game of readdirSync("games")) {
  const testDir = join("games", game, "tests");
  if (!existsSync(testDir)) continue;
  for (const test of readdirSync(testDir).filter((f) => f.endsWith(".test.js"))) {
    console.log(`== ${join(testDir, test)}`);
    run("node", [join(testDir, test)]);
  }
}

run("python3", ["tutor/build.py"]);

rmSync("_site", { recursive: true, force: true });
mkdirSync("_site/tutor", { recursive: true });
for (const file of ["index.html", "library.html", "site.css", "site.js", "icon.png"]) {
  cpSync(file, join("_site", file));
}
for (const dir of ["games", "vendor"]) {
  if (existsSync(dir)) cpSync(dir, join("_site", dir), { recursive: true });
}
// ppt/ 里只发布课件共用的素材（如 ppt/videos/）；课件本身（pptx、pdf、网页课件）在 R2。
mkdirSync("_site/ppt", { recursive: true });
for (const entry of readdirSync("ppt", { withFileTypes: true })) {
  if (entry.isDirectory()) cpSync(join("ppt", entry.name), join("_site", "ppt", entry.name), { recursive: true });
}
for (const file of ["answers.html", "screen.html", "data.js"]) {
  cpSync(join("tutor", file), join("_site", "tutor", file));
}
cpSync("tutor/assets", "_site/tutor/assets", { recursive: true });

run("node", ["scripts/build-site.mjs", "_site"]);

// Cloudflare 单个文件上限 25 MiB；超过的应该放 R2（用 /upload/ 上传）。
const LIMIT = 25 * 1024 * 1024;
const tooBig = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (statSync(path).size > LIMIT) tooBig.push(path);
  }
})("_site");
if (tooBig.length) {
  console.error(`这些文件超过 25 MB，不能放在仓库里发布，请改用 /upload/ 上传到 R2：\n${tooBig.join("\n")}`);
  process.exit(1);
}
