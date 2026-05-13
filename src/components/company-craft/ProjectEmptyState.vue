<script setup lang="ts">
defineEmits<{ 'open-new': [] }>()
</script>

<template>
  <div class="empty">
    <h4>還沒有開工的專案</h4>
    <p class="lead">建立一個專案來追蹤潛水艇、飛空艇或工坊建材的素材進度。</p>
    <el-button type="primary" size="large" @click="$emit('open-new')">
      +&nbsp;&nbsp;新增專案
    </el-button>

    <div class="onboard">
      <span class="onboard-eyebrow">怎麼用</span>
      <ol class="steps">
        <li>
          <span class="step-num">01</span>
          <span class="step-body">
            <span class="step-title">建立</span>
            <span class="step-desc">挑類型（潛水艇 / 飛空艇 / 工坊建材）、選零件、命名專案</span>
          </span>
        </li>
        <li>
          <span class="step-num">02</span>
          <span class="step-body">
            <span class="step-title">展開</span>
            <span class="step-desc">依零件分組展開每個階段的職業與材料清單</span>
          </span>
        </li>
        <li>
          <span class="step-num">03</span>
          <span class="step-body">
            <span class="step-title">標記</span>
            <span class="step-desc">完工一階段就標起來，自動計算剩餘素材，可加入購物清單估 Gil</span>
          </span>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.empty {
  border: 1px dashed var(--app-border);
  border-radius: 14px;
  padding: 48px 32px 36px;
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
.lead {
  font-size: 13px;
  color: var(--app-text-muted);
  max-width: 30ch;
  margin: 0 auto 22px;
}

.onboard {
  margin: 36px auto 0;
  max-width: 460px;
  padding-top: 24px;
  border-top: 1px dashed var(--app-border);
}
.onboard-eyebrow {
  display: block;
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--app-text-muted);
  margin-bottom: 16px;
  opacity: 0.7;
}
.steps {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: left;
}
.steps li {
  display: grid;
  grid-template-columns: 36px 1fr;
  align-items: baseline;
  gap: 14px;
}
.step-num {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--app-craft, oklch(0.50 0.16 40));
  text-align: right;
}
.step-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.step-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 14px;
  color: var(--app-text);
}
.step-desc {
  font-size: 12px;
  line-height: 1.55;
  color: var(--app-text-muted);
}

@media (max-width: 640px) {
  .empty { padding: 32px 20px; }
  .onboard { margin-top: 28px; padding-top: 20px; }
}
</style>
