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
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', 'scripts/**'],
  },
})
