<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="app-empty-state">
    <div class="empty-icon-wrapper">
      <span class="empty-icon">{{ icon || '📦' }}</span>
    </div>
    <p class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.app-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon-wrapper {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--page-accent-dim, oklch(0.65 0.18 65 /0.12));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.empty-icon {
  font-size: 32px;
  line-height: 1;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text, #E2E8F0);
  margin: 0 0 6px;
}

.empty-description {
  font-size: 13px;
  color: var(--app-text-muted, #94A3B8);
  margin: 0 0 20px;
  max-width: 320px;
  line-height: 1.5;
}

.empty-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
