<script setup lang="ts">
import { computed } from 'vue'
import { Bell } from '@element-plus/icons-vue'
import { useTimerStore } from '@/stores/timer'

const store = useTimerStore()

const label = computed(() =>
  store.globalAlarmEnabled ? '提醒' : '提醒已暫停',
)
</script>

<template>
  <div class="global-alarm-toggle" :class="{ 'alarm-off': !store.globalAlarmEnabled }">
    <el-icon class="bell-icon" :size="16">
      <Bell />
    </el-icon>
    <span class="alarm-label">{{ label }}</span>
    <el-switch
      v-model="store.globalAlarmEnabled"
      size="small"
      class="alarm-switch"
      :aria-label="store.globalAlarmEnabled ? '全局提醒已啟用，點擊暫停' : '全局提醒已暫停，點擊啟用'"
    />
  </div>
</template>

<style scoped>
.global-alarm-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.25);
  transition: background 0.2s, border-color 0.2s;
}

.global-alarm-toggle.alarm-off {
  background: rgba(148, 163, 184, 0.06);
  border-color: rgba(148, 163, 184, 0.15);
}

.bell-icon {
  color: #4ADE80;
  flex-shrink: 0;
  transition: color 0.2s;
}

.alarm-off .bell-icon {
  color: var(--app-text-muted, #94A3B8);
}

.alarm-label {
  font-size: 13px;
  font-weight: 500;
  color: #4ADE80;
  white-space: nowrap;
  transition: color 0.2s;
}

.alarm-off .alarm-label {
  color: var(--app-text-muted, #94A3B8);
}

.alarm-switch {
  flex-shrink: 0;
}
</style>
