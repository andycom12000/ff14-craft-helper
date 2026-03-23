<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getEorzeaTime } from '@/services/eorzea-clock'

const etTime = ref('00:00')
const ltTime = ref('00:00')
let intervalId: ReturnType<typeof setInterval>

function update() {
  const et = getEorzeaTime()
  etTime.value = `${String(et.hour).padStart(2, '0')}:${String(et.minute).padStart(2, '0')}`
  const now = new Date()
  ltTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  update()
  intervalId = setInterval(update, 1000)
})
onUnmounted(() => clearInterval(intervalId))
</script>

<template>
  <div class="eorzea-clock">
    <div class="clock-row">
      <span class="clock-label">ET</span>
      <span class="clock-value">{{ etTime }}</span>
    </div>
    <div class="clock-row">
      <span class="clock-label">LT</span>
      <span class="clock-value">{{ ltTime }}</span>
    </div>
  </div>
</template>

<style scoped>
.eorzea-clock {
  padding: 12px 20px;
  border-top: 1px solid var(--app-border);
  margin-top: auto;
}
.clock-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  line-height: 1.8;
}
.clock-label {
  font-size: 11px;
  color: var(--app-text-muted);
  font-weight: 600;
  letter-spacing: 1px;
}
.clock-value {
  font-family: 'Consolas', 'Fira Code', monospace;
  font-size: 14px;
  color: var(--app-text);
  letter-spacing: 2px;
}
</style>
