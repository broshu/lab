# AI Tutor Worker

Cloudflare Worker for the `p.phylab.uk/tutor/` question-and-answer flow.

- Proxies the DeepSeek request so the provider key is not exposed in the static site.
- Saves anonymous questions, their question location, and AI answers in D1.
- Protects the review page with a password-only login backed by an HttpOnly session cookie (`ADMIN_PASSWORD` plus `ADMIN_SESSION_SECRET`).
- Retains records for 30 days by default; change `RETENTION_DAYS` in `wrangler.jsonc` if needed.
- Turns an upstream failure into a specific message for the student and stores the reason in D1, so the review page shows *why* a question failed without digging through Worker logs.

## Failure reasons

`/api/chat` maps the provider's status code to a `failure_reason` code (stored as `code:upstreamStatus`):

| reason | upstream | what to do |
| --- | --- | --- |
| `auth` | 401 / 403 | The DeepSeek key is invalid or revoked — set a new one. |
| `balance` | 402 | The DeepSeek account is out of credit — top it up. |
| `rate_limit` | 429 | Too many concurrent questions; it clears by itself. |
| `bad_request` | 400 / 404 / 422 | Wrong model name or malformed payload — check `AI_MODEL`. |
| `upstream_down` | 5xx | DeepSeek outage; it clears by itself. |
| `network` | — | The Worker could not reach DeepSeek at all. |
| `timeout` | — | DeepSeek did not answer inside 30 s. |
| `not_configured` | — | `DEEPSEEK_API_KEY` is not set. |

`GET /health` reports whether the secrets are set and which model is configured.

## Rotating the DeepSeek key

```
npx wrangler secret put DEEPSEEK_API_KEY
```

Nothing in `tutor/` needs to change — the key only ever lives in the Worker.

## First deployment

1. Create the D1 database and copy its returned `database_id` into `wrangler.jsonc`.
2. Apply the migration remotely.
3. Deploy the Worker.
4. Set the `DEEPSEEK_API_KEY`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` secrets with Wrangler or the Cloudflare dashboard.

## Updating an existing deployment

Pushing any change under `workers/ai-tutor/**` to `main` deploys the Worker through
`.github/workflows/deploy-worker.yml`. It needs one repository secret,
`CLOUDFLARE_API_TOKEN`, created from Cloudflare's **Edit Cloudflare Workers** template.

Migrations are not part of that automatic run. To apply them, trigger the workflow
manually from the Actions tab with the **migrate** box ticked — it applies migrations
first, then deploys.

Locally (needs Node installed):

```
npx wrangler d1 migrations apply p-ai-tutor-records --remote
npx wrangler deploy
```

The `tutor/index.html` header includes a quiet three-dot entry immediately to the right of **AI tutor**. It opens the password-protected review page.
