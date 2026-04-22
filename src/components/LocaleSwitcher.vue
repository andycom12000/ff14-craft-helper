<script setup lang="ts">
import { computed } from 'vue'
import { ElSelect, ElOption } from 'element-plus'
import { useLocaleStore } from '@/stores/locale'
import type { Locale } from '@/services/local-data-source.types'

const LABELS: Record<Locale, string> = {
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  en: 'English',
  ja: '日本語',
}

const localeStore = useLocaleStore()
const model = computed({
  get: () => localeStore.current,
  set: async (v: Locale) => {
    await localeStore.setLocale(v)
  },
})
</script>

<template>
  <el-select v-model="model" style="width: 160px">
    <el-option
      v-for="locale in (Object.keys(LABELS) as Locale[])"
      :key="locale"
      :label="LABELS[locale]"
      :value="locale"
    />
  </el-select>
</template>
