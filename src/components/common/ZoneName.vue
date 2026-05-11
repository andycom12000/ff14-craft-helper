<script setup lang="ts">
import { useZoneName } from '@/composables/useZoneName'

const props = defineProps<{ zoneId: number }>()

const zoneName = useZoneName(() => props.zoneId)
</script>

<template>
  <span>{{ zoneName }}</span>
</template>
