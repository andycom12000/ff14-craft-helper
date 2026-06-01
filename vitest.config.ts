import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['src/__tests__/setup.ts'],
    // `e2e/**` holds Playwright specs (own runner) — keep them out of vitest,
    // which would otherwise pick up their *.spec.ts via the default include.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/.claude/worktrees/**', 'scripts/**', 'e2e/**'],
  },
})
