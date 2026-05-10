<script setup lang="ts">
// Pure container. Caller is expected to pass up to three direct
// children: prev-button, stepper, action-group — mapped to col 1 / 2 / 3
// by the position selectors below.
</script>

<template>
  <div class="rpt" data-testid="route-toolbar">
    <slot />
  </div>
</template>

<style scoped>
.rpt {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--app-cream-emphasis, var(--app-surface));
  border: 1px solid var(--app-border);
  border-radius: 10px;
  font-size: 12.5px;
  /* Third tier of the right-column sticky stack (totals → tabs → toolbar).
   * Mirrors .bdt-head's offset on the materials tab so the wayfinding chrome
   * stays anchored across both tabs. */
  position: sticky;
  top: 120px;
  z-index: 3;
}

.rpt > :first-child  { grid-column: 1; justify-self: start; }
.rpt > :nth-child(2) { grid-column: 2; justify-self: center; }
.rpt > :last-child   { grid-column: 3; justify-self: end; }
</style>
