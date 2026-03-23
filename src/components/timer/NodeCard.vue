<script setup lang="ts">
import { computed } from 'vue'
import type { GatheringNode } from '@/api/garland'
import { formatGil, starsDisplay } from '@/utils/format'

const props = defineProps<{
  node: GatheringNode
  countdown: string
  isActive: boolean
  price: number | null
  alarmEnabled: boolean
  globalAlarmOff: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-alarm'): void
  (e: 'toggle-map'): void
  (e: 'remove'): void
}>()

/** Parse countdown string "MM:SS" to total minutes for threshold check */
const countdownMinutes = computed(() => {
  const parts = props.countdown.split(':')
  if (parts.length !== 2) return Infinity
  return parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60
})

const statusClass = computed(() => {
  if (props.isActive) return 'status-active'
  if (countdownMinutes.value < 30) return 'status-upcoming'
  return 'status-later'
})

const statusLabel = computed(() => {
  if (props.isActive) return '採集中'
  if (countdownMinutes.value < 30) return '即將出現'
  return '稍後'
})

const nodeTypeLabel = computed(() => props.node.nodeType)

const coordsLabel = computed(() => {
  const { x, y } = props.node.coords
  if (x === 0 && y === 0) return props.node.zone
  return `${props.node.zone} (${x.toFixed(1)}, ${y.toFixed(1)})`
})

function onAlarmClick(event: Event) {
  event.stopPropagation()
  emit('toggle-alarm')
}

function onRemoveClick(event: Event) {
  event.stopPropagation()
  emit('remove')
}
</script>

<template>
  <div
    class="node-card"
    :class="[statusClass, { 'alarm-off': !alarmEnabled }]"
    @click="$emit('toggle-map')"
  >
    <!-- Remove button, visible on hover -->
    <button class="remove-btn" title="Remove" @click="onRemoveClick">&#x2715;</button>

    <!-- Card header: status dot + label, countdown, alarm switch -->
    <div class="card-header">
      <div class="header-left">
        <span class="status-dot" />
        <span class="status-label">{{ statusLabel }}</span>
      </div>
      <div class="header-right">
        <span class="countdown">{{ countdown }}</span>
        <el-switch
          v-if="!globalAlarmOff"
          :model-value="alarmEnabled"
          size="small"
          class="alarm-switch"
          :aria-label="alarmEnabled ? '關閉提醒' : '開啟提醒'"
          @click="onAlarmClick"
        />
      </div>
    </div>

    <!-- Card body: info on left, price on right -->
    <div class="card-body">
      <div class="card-info">
        <div class="item-name">
          {{ node.itemName }}
          <span v-if="node.stars > 0" class="item-stars">{{ starsDisplay(node.stars) }}</span>
        </div>
        <div class="item-meta">
          <span class="gathering-class">{{ node.gatheringClass }}</span>
          <span class="separator">·</span>
          <span class="node-type">Lv{{ node.level }}</span>
          <span class="separator">·</span>
          <span class="node-type">{{ nodeTypeLabel }}</span>
        </div>
        <div class="location">{{ coordsLabel }}</div>
      </div>
      <div class="card-price">
        <template v-if="price !== null">
          <span class="price-value">{{ formatGil(price) }}</span>
          <span class="price-unit">gil</span>
        </template>
        <template v-else>
          <span class="price-loading">...</span>
        </template>
      </div>
    </div>

    <!-- Slot for minimap expansion -->
    <slot />
  </div>
</template>

<style scoped>
/* ------------------------------------------------------------------ */
/* Status color tokens                                                  */
/* ------------------------------------------------------------------ */
.node-card {
  --status-color: #94A3B8;
  --status-glow: rgba(148, 163, 184, 0.15);
}

.node-card.status-active {
  --status-color: #4ADE80;
  --status-glow: rgba(74, 222, 128, 0.18);
}

.node-card.status-upcoming {
  --status-color: #60A5FA;
  --status-glow: rgba(96, 165, 250, 0.18);
}

/* ------------------------------------------------------------------ */
/* Card base                                                            */
/* ------------------------------------------------------------------ */
.node-card {
  position: relative;
  background: linear-gradient(
    135deg,
    var(--app-surface) 0%,
    color-mix(in srgb, var(--status-color) 6%, var(--app-surface)) 100%
  );
  border: 1px solid color-mix(in srgb, var(--status-color) 30%, transparent);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 0 0 0 var(--status-glow);
}

.node-card:hover {
  border-color: color-mix(in srgb, var(--status-color) 55%, transparent);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.35),
    0 0 12px var(--status-glow);
}

/* Dimmed when alarm is off for this item */
.node-card.alarm-off {
  opacity: 0.5;
}

/* ------------------------------------------------------------------ */
/* Remove button                                                        */
/* ------------------------------------------------------------------ */
.remove-btn {
  display: none;
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(148, 163, 184, 0.15);
  color: var(--app-text-muted);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  padding: 0;
  z-index: 1;
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #F87171;
}

.node-card:hover .remove-btn {
  display: flex;
}

/* ------------------------------------------------------------------ */
/* Card header                                                          */
/* ------------------------------------------------------------------ */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--status-color);
  flex-shrink: 0;
}

/* Pulsing animation for active state only */
.status-active .status-dot {
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(1.25); }
}

@media (prefers-reduced-motion: reduce) {
  .status-active .status-dot {
    animation: none;
  }
}

.status-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--status-color);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  /* push away from remove button when hovered */
  padding-right: 4px;
}

.countdown {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 22px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: 1px;
}

.alarm-switch {
  flex-shrink: 0;
}

/* ------------------------------------------------------------------ */
/* Card body                                                            */
/* ------------------------------------------------------------------ */
.card-body {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}

/* Left: item info */
.card-info {
  min-width: 0;
  flex: 1;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-stars {
  color: #FBBF24;
  font-size: 12px;
  margin-left: 4px;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--app-text-muted);
  margin-top: 2px;
}

.gathering-class {
  font-weight: 600;
  color: var(--status-color);
}

.separator {
  color: var(--app-text-muted);
  opacity: 0.5;
}

.node-type {
  color: var(--app-text-muted);
}

.location {
  font-size: 11px;
  color: var(--app-text-muted);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.75;
}

/* Right: price */
.card-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}

.price-value {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
  font-weight: 700;
  color: #FBBF24;
}

.price-unit {
  font-size: 10px;
  color: var(--app-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.price-loading {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
  color: var(--app-text-muted);
  opacity: 0.5;
}
</style>
