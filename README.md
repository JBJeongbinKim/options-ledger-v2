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
