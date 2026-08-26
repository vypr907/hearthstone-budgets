# Browser smoke tests (test household only — ADR-083)

End-to-end checks that drive the real app against the TEST household. Not part
of `vitest`; run manually when a ledger-touching change needs interactive
verification.

## One-time setup (Codespace)

```bash
# Playwright browser (~150MB) + its system libs
npx playwright install chromium
sudo npx -y playwright@1.62 install-deps chromium

# playwright-core as a throwaway sub-package (keep it out of the app's deps)
mkdir -p scripts/smoke/.pw && cd scripts/smoke/.pw
echo '{"type":"module"}' > package.json && npm i playwright-core && cd -
```

`.env.test` (gitignored, repo root) must hold `SMOKE_EMAIL` / `SMOKE_PASSWORD`
for the RLS-bound test user (see ADR-083).

## Running

1. `npm run dev` — serves on `http://localhost:8080`
2. Pre-flight: run `scripts/test-db-preflight.sql` via the read-only MCP; all
   checks must pass.
3. Write a script that imports `../test-db.mjs` for any direct DB setup/teardown
   (it refuses to touch anything but the test household) and Playwright for the
   UI. Log in at `/auth` — wait ~3s after the form renders for React hydration
   before filling, or the raw `<form>` submits.
4. Clean up every row you create. Verify with the read-only MCP afterwards.

## Notes

- Chrome exe: `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`; launch
  with `--no-sandbox --disable-dev-shm-usage`.
- The test household has ONE account ("TEST Checking"), so flows needing two
  distinct accounts (auto-transfers) need a second throwaway account created
  first.
