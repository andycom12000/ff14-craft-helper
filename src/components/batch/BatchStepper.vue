<script setup lang="ts">
defineProps<{ currentStep: number }>()
const emit = defineEmits<{ navigate: [step: number] }>()

const steps = [
  { title: '準備清單', description: '加入配方' },
  { title: '計算最佳化', description: '求解中' },
  { title: '採購材料', description: '購買素材' },
  { title: '開始製作', description: '按順序製作' },
]
</script>

<template>
  <div class="batch-stepper">
    <el-steps :active="currentStep" finish-status="success" align-center>
      <el-step
        v-for="(step, i) in steps"
        :key="i"
        :title="step.title"
        :description="step.description"
        class="batch-step"
        @click="emit('navigate', i)"
      />
    </el-steps>
  </div>
</template>

<style scoped>
.batch-stepper {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--el-bg-color);
  padding: 16px 0 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.batch-step {
  cursor: pointer;
}

.batch-stepper :deep(.el-step__head.is-finish .el-step__icon) {
  border-color: #e9c176;
  color: #e9c176;
}

.batch-stepper :deep(.el-step__title.is-finish) {
  color: #e9c176;
}

.batch-stepper :deep(.el-step__head.is-process .el-step__icon) {
  border-color: #e9c176;
  background: #e9c176;
  color: var(--el-bg-color);
}

.batch-stepper :deep(.el-step__title.is-process) {
  color: #e9c176;
  font-weight: 600;
}
</style>
