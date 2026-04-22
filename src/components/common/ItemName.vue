<script setup lang="ts">
import { computed } from 'vue'
import { useItemName } from '@/composables/useItemName'

/**
 * Locale-reactive item/recipe name display.
 *
 * Resolves the current-locale name for `itemId` via `useItemName`. When the
 * underlying items file for the active locale has not finished loading yet,
 * `useItemName` returns `#{id}` as a stable placeholder; in that case, if a
 * `fallback` string was provided (typically the cached `.name` captured at
 * fetch time), we prefer it so users see a readable label immediately.
 *
 * Usage:
 *   <ItemName :item-id="row.itemId" :fallback="row.name" />
 */
const props = defineProps<{ itemId: number; fallback?: string }>()

const name = useItemName(() => props.itemId)

const display = computed(() => {
  const value = name.value
  if (props.fallback && value === `#${props.itemId}`) return props.fallback
  return value
})
</script>

<template>{{ display }}</template>
