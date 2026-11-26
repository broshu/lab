# p-phylab-uk

p.phylab.uk 整个网站的 Worker（`/api/*` 除外，那部分是 `workers/p-ai-tutor`）。

- **网页**：首页、小游戏（games/）、作业问答（tutor/）、共用素材（vendor/、ppt/videos/）来自本仓库。
  构建时 `scripts/prepare-site.mjs` 生成 `_site/`，作为静态文件发布。
- **课件**：pptx、pdf、视频、网页课件不放仓库，存在 R2 存储桶 `p-phylab-uk-courseware`，
  从 `p.phylab.uk/upload/` 上传。
  - 网址：网页课件 `/ppt/<英文名>/`，其他文件 `/ppt/<英文名>.<扩展名>`；下载时文件名是中文。
  - 同名文件替换旧版，网址不变。
  - 上传满 14 天自动下架；下架、删除、被替换的旧版进回收站，30 天后彻底删除（每天北京时间 03:17 检查）。
  - 英文网址由 Workers AI 意译课件名，上传页里可以改。

## 部署

推到 `main` 后由 Cloudflare Workers Builds 自动部署：根目录 `workers/p-phylab-uk`，
构建 `npm run build`（生成网站 + 跑测试），部署 `npx wrangler deploy`。

本地：`npm install && npm test`；`npm run site && npx wrangler dev --local` 可以在本机试。
