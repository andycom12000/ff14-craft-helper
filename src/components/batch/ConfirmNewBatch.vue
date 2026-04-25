<script setup lang="ts">
defineEmits<{ confirm: [] }>()
</script>

<template>
  <el-popconfirm
    title="要重設目前批次並開始新一輪嗎？"
    confirm-button-text="確定"
    cancel-button-text="取消"
    width="240"
    @confirm="$emit('confirm')"
  >
    <template #reference>
      <slot />
    </template>
  </el-popconfirm>
</template>
