# Options Ledger v2

Single-user options ledger optimized for iPhone 15 Pro.

## Phase 1 Scope

- Local-first storage (`localStorage`) with default NAV behavior
- Dashboard shell with KRW/points formatting rules
- Domain calculations and baseline tests
- CI workflow for typecheck, tests, and build

## Run Locally

```bash
npm install
npm run dev
```

## Testing

```bash
npm run test:run
```

## Git Workflow

- `main` for stable releases
- feature branches prefixed with `codex/`
- one logical feature per branch/PR
- tests required before merge

## Deploy (Vercel)

1. Push this branch to GitHub.
2. In Vercel, click `Add New...` -> `Project` and import this repository.
3. Keep defaults (framework is Vite from `vercel.json`) and deploy.

After deploy, your app stays online even when your laptop is off.

## SMS Auto Import (iPhone Shortcut)

You can open the app URL with an `sms` query parameter to prefill and open the New Trade form.

Example URL format:

```text
https://<your-vercel-url>/?sms=<url-encoded-sms-text>
```

Supported message parsing (buy confirmations):
- `C`/`P` for Call/Put
- strike after `C` or `P`
- qty from `<number>계약`
- price from `<number>P`
- underlying inference: `위클리M -> Mon`, `위클리W -> Thu`, `월물 -> Month`

Alternative direct params format:

```text
https://<your-vercel-url>/?type=Call&underlying=Mon&strike=350&qty=1&price=0.88
```

Side rules:
- `매수` => opens New Trade prefilled.
- `매도` => opens Position Action prefilled (qty/price) for matching open position.

Underlying rules for SMS parsing:
- if message contains `코스피200` => `Month`
- if message contains `코스피위클리` =>
  - `Mon` when sent after 5am Thu, or on Fri/Sat/Sun, or before 5am Mon
  - otherwise `Thu`

Pass `sentAt=<ISO datetime>` in URL for deterministic time-window parsing.

## Silent SMS Automation (No Browser Open)

This project includes a webhook + server queue so your iPhone Shortcut can run in the background:

- `POST /api/sms-ingest` receives raw SMS text
- `GET /api/pending-imports` serves the next pending parsed transaction
- `DELETE /api/pending-imports?id=<id>` acknowledges/removes a reviewed item

### 1) Vercel Setup

1. In Vercel, add a Redis/KV integration.
2. Add environment variable:
   - `SMS_WEBHOOK_TOKEN` = a long random secret string
3. Redeploy.

### 2) iPhone Shortcut Action (Silent)

Use `Get Contents of URL` (not `Open URL`) with:

- URL: `https://<your-vercel-url>/api/sms-ingest`
- Method: `POST`
- Headers:
  - `Authorization: Bearer <SMS_WEBHOOK_TOKEN>`
  - `Content-Type: application/json`
- Request Body (JSON):
  - `sms`: incoming message text
  - `sentAt`: current timestamp in ISO format

Example JSON body:

```json
{
  "sms": "[SMS message text]",
  "sentAt": "2026-03-06T14:30:00.000Z"
}
```

When you later open the app, it will pull the queued transaction and show it in the editable pending review card before affecting positions/P&L.
