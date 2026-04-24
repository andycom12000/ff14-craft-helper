import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { execSync } from 'child_process'

function getLatestTag(): string {
  try {
    return execSync('git tag --sort=-v:refname', { encoding: 'utf-8' }).split('\n')[0].trim() || 'dev'
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  base: '/ff14-craft-helper/',
  plugins: [
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver({ importStyle: 'css' })] }),
    Components({ resolvers: [ElementPlusResolver({ importStyle: 'css' })] }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(getLatestTag()),
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },
})
