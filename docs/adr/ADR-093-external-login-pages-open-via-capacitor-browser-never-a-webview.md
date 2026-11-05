## ADR-093: External login pages open via `@capacitor/browser`, never a WebView

Decision:
The "Log In" action on the institution and debt detail views opens the
institution's `login_url` through `@capacitor/browser` (`Browser.open({ url })`)
— a system browser / Android Custom Tab — never `window.open`, an `<a>` tag, an
iframe, or an embedded WebView. The plugin is loaded with a dynamic `import()`
inside the click handler so it is never evaluated during SSR and stays out of
the initial bundle. A shared `src/components/InstitutionLoginButton.tsx` renders
the button only when `login_url` is non-empty; when `sign_in_with_google` is
true and `login_username` is set it also shows a display-only hint ("Sign in
with Google — use <username>"). This adds `@capacitor/core` + `@capacitor/browser`
as the project's first Capacitor runtime dependencies; no `capacitor.config.ts`,
native project, or npm scripts are added (that is Phase 12). No new DB columns,
tables, or server changes — the app still never stores, sees, or fills a
password (`docs/SCHEMA.md` "never store passwords" is unaffected).

Reason:
Android's OS-level Autofill (the household uses Keeper) only offers credentials
on a real browser page — a Custom Tab — not an embedded WebView or a page the
app scripts. Opening the true login URL in the system browser lets the OS handle
credential fill entirely, keeping the no-password-storage rule intact while
still making login one tap from the item. `@capacitor/browser` gives the Custom
Tab on Android and degrades to a normal new-tab open on the web build, so the
code written now works unchanged once the Capacitor Android shell lands in
Phase 12. The Google-account hint is needed because a third-party OAuth
`login_hint` cannot be injected into someone else's login page — the person has
to pick the right account manually when Google's chooser appears.

Status: Decided 2026-09-01. Implemented 2026-09-01.

