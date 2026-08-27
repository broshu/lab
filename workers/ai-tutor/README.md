# AI Tutor Worker

Cloudflare Worker for the `p.phylab.uk/tutor/` question-and-answer flow.

- Proxies the DeepSeek request so the provider key is not exposed in the static site.
- Saves anonymous questions, their question location, and AI answers in D1.
- Protects the review page with a password-only login backed by an HttpOnly session cookie (`ADMIN_PASSWORD` plus `ADMIN_SESSION_SECRET`).
- Retains records for 30 days by default; change `RETENTION_DAYS` in `wrangler.jsonc` if needed.

## First deployment

1. Create the D1 database and copy its returned `database_id` into `wrangler.jsonc`.
2. Apply the migration remotely.
3. Deploy the Worker.
4. Set the `DEEPSEEK_API_KEY`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` secrets with Wrangler or the Cloudflare dashboard.

The `tutor/index.html` header includes a quiet three-dot entry immediately to the right of **AI tutor**. It opens the password-protected review page.
