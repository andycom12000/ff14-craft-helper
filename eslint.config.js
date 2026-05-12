import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      '.tmp/**',
      'raphael-wasm-wrapper/**',
      'scripts/sync-tesseract-worker.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // 已大量使用，禁止會掀整個 codebase
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // 過嚴，App-level error throwing 不一定要 cause chain
      'preserve-caught-error': 'off',
      // Vue 3 沒 filter，但 vue-eslint-parser 把 TS union assert (x | y) 誤判
      'vue/no-deprecated-filter': 'off',
      // 全角空格在 hero label / changelog 是設計 intent
      'no-irregular-whitespace': 'off',
      // 純 style noise — Vue plugin recommended 預設太多
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/html-indent': 'off',
      'vue/no-v-html': 'off',
      'vue/v-on-event-hyphenation': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/one-component-per-file': 'off',  // 同檔多 component 是 codebase 既存風格
      'vue/no-template-shadow': 'off',      // v-for 內側 shadow scope 是常見模式
      'vue/require-default-prop': 'off',    // optional props 不強制 default
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-undef': 'off',  // TS handles it
    },
  },
  {
    // Test files: relax patterns that vitest / mock factories require
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-useless-assignment': 'off',
    },
  },
]
