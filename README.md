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
