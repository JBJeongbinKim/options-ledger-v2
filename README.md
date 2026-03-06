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
