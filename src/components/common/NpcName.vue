<script setup lang="ts">
import { useNpcName } from '@/composables/useNpcName'

const props = defineProps<{ npcId: number }>()

const npcName = useNpcName(() => props.npcId)
</script>

<template>
  <span>{{ npcName }}</span>
</template>
