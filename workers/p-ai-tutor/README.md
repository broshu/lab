# p-ai-tutor

大屏作业问答（`p.phylab.uk/tutor/`）的后端 Worker，前端就在本仓库的 `tutor/`。

- `POST /api/chat`：把学生的提问和对话转给 DeepSeek，返回回答。
- `GET /admin`：老师查看提问记录（密码登录），每次会话归为一条，展开查看完整问答。
- `GET /admin/conversations`：按匿名会话分页，最近交流优先；旧记录自动归并。仅含自动开场白的会话不进入列表、总数和分页，学生提问数不含开场白；有效会话展开后仍保留完整上下文。
- `GET /admin/conversations/:sessionId`：读取该会话全部问答，按时间顺序返回。
- `GET /health`：检查配置是否齐全、当前用哪个模型。

每次提问（成功或失败）都匿名记进 D1 表 `tutor_questions`，`model` 列记录 DeepSeek 实际报告的模型，
`failure_reason` 记录失败原因代号（如 `upstream_down:503`、`timeout`）。上游报错的说明会写进 Worker 日志。

## 配置

- 变量：`AI_MODEL`（默认 `deepseek-flash`）、可选 `AI_BASE_URL`、`ALLOWED_ORIGINS`、`RETENTION_DAYS`。
- 密钥（后台设置）：`DEEPSEEK_API_KEY`、`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`。

## 部署

推到 `main` 后由 Cloudflare Workers Builds 自动部署（已连接：Worker 设置 → Builds，根目录 `workers/p-ai-tutor`，构建 `npm run build`（先跑测试，不通过就不部署），部署 `npx wrangler deploy`）。
手动部署：`npm install && npx wrangler deploy`。测试：`npm test`。
