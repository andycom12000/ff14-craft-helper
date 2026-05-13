<script setup lang="ts">
import type { WorkshopProject } from '@/stores/workshop-projects'
import type { CompanyCraftPhase } from '@/services/local-data-source.types'

defineProps<{
  projectId: WorkshopProject['id']
  sequenceId: number
  phase: CompanyCraftPhase
}>()
</script>

<template>
  <div class="phase-row-stub">
    <span class="job">{{ phase.jobAbbr }}</span>
    <span class="supply-count">{{ phase.supplyItems.length }} 件素材</span>
    <!-- Full row with counters lands in Task 14 -->
  </div>
</template>

<style scoped>
.phase-row-stub {
  padding: 10px 16px;
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--app-text-muted);
}
.job {
  font-family: 'Fira Code', monospace;
  font-weight: 600;
  color: var(--app-craft);
}
</style>
