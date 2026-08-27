import { defineConfig } from "vitest/config";

// Dedicated Vitest config. Without an explicit `include`, Vitest globs the whole
// working tree for test files — including the `.trunk/` plugin cache — and
// reports ~190 bogus failed test files alongside our real suites. Scoping to
// `src/**` keeps `npm test` to this project's own tests.
//
// `vite.config.ts` stays the app build config (the @lovable.dev preset); tests
// are plain library functions, so this only needs tsconfig path resolution for
// the `@/` alias (native in Vite 6 / Vitest 4).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    tsconfigPaths: true,
  },
});
