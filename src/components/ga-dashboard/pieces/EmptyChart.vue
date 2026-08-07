<script setup lang="ts">
// `resolvesOn` — 暗期 placeholder(spec #194 §E6 / issue #208):圖上線後有已知的滿窗日期時
// 傳這個 prop,渲染一顆「門檻待資料 · <date>」的日期徽章,把「壞掉了」跟「還沒到」區分開來。
// 沒有已知日期(單純這期沒事件、或圖還沒實作)的一般空狀態不要傳,維持原本的 dashed-box 樣式。
defineProps<{ label: string; hint?: string; resolvesOn?: string }>()
</script>

<template>
  <div class="empty-chart">
    <span class="ec-label">{{ label }}</span>
    <span v-if="hint" class="ec-hint">{{ hint }}</span>
    <span v-if="resolvesOn" class="ec-date">門檻待資料 · {{ resolvesOn }}</span>
  </div>
</template>

<style scoped>
.empty-chart {
  margin: 12px 0 24px;
  /* lighter than the rich charts around it — an empty slot should recede, not
     draw more attention than the populated ones (it used to be 64px tall). */
  padding: 38px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  border: 1px dashed var(--border-soft);
  border-radius: 2px;
}
.ec-label {
  /* `label` is a Chinese chart title, not an identifier — mono has no CJK
     glyph (spec #194 §E2 hard limit), so this stays Noto Sans TC. Only the
     decorative italic is retired here. */
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px;
  color: var(--ink-faint);
}
.ec-hint {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 11.5px;
  color: var(--ink-faint);
  opacity: 0.72;
}
/* 暗期 placeholder 有已知的可用日期——比一般空狀態多一顆明確標出日期的徽章，讓「還沒到」跟
   單純的「這期沒事件」在視覺上就能分開。原尺寸、虛線框、無底色全部沿用 .empty-chart 預設，
   不額外加框或填色，避免看起來像已修好的圖。 */
.ec-date {
  margin-top: 4px;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-mid);
}
</style>
