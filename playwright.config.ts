import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright e2e config — issue #115.
 *
 * Runs against the Vite **dev** server (`npm run dev`), not `vite preview`:
 * only the dev server sets the COOP/COEP headers (see vite.config.ts `server`)
 * that SharedArrayBuffer — and therefore the multi-threaded WASM solver — needs.
 * `vite preview` has no such headers, so the solver would never boot there.
 *
 * The app is served under the GH-Pages base path `/ff14-craft-helper/` and uses
 * a hash router, so specs navigate with `page.goto('#/simulator')` (a fragment-
 * only relative URL preserves the base path; a leading-slash path would not).
 *
 * Workers are pinned to 1: the WASM solver spins a rayon worker pool with a
 * fixed slot count, and parallel browser contexts would contend for it and make
 * solve timings non-deterministic.
 */
export default defineConfig({
  testDir: './e2e',
  // WASM solves are slow; give each test generous headroom. Individual specs
  // tighten/loosen this as needed.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // A dedicated 127.0.0.1 port (not Vite's default 5173) keeps e2e off any
    // dev server the developer is already running, and pins IPv4 — Vite binds
    // `localhost` to `::1`-only on this Windows host, which Playwright's
    // readiness probe (IPv4-first) can't reach.
    baseURL: 'http://127.0.0.1:5180/ff14-craft-helper/',
    // The meld cascade (MeldAdvisorCard + MeldPlaygroundCard) only renders in a
    // ≥2-column layout, so the e2e viewport must be wide.
    viewport: { width: 1680, height: 1050 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180/ff14-craft-helper/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
