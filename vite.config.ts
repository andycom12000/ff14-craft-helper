import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/ff14-craft-helper/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
