<script setup lang="ts">
defineEmits<{ 'open-new': [] }>()
</script>

<template>
  <div class="empty">
    <h4>還沒有開工的專案</h4>
    <p>建立一個專案來追蹤潛水艇、飛空艇或工坊建材的素材進度。</p>
    <el-button type="primary" size="large" @click="$emit('open-new')">
      +&nbsp;&nbsp;新增專案
    </el-button>
  </div>
</template>

<style scoped>
.empty {
  border: 1px dashed var(--app-border);
  border-radius: 14px;
  padding: 56px 32px;
  text-align: center;
  background: var(--app-surface);
}
.empty h4 {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 18px;
  color: var(--app-text-muted);
  margin: 0 0 6px;
}
.empty p {
  font-size: 13px;
  color: var(--app-text-muted);
  max-width: 30ch;
  margin: 0 auto 22px;
}
</style>
