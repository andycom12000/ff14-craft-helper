<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { useIsMobile } from '@/composables/useMediaQuery'
import { getDataCenters, getWorlds, refreshWorldsFromApi } from '@/api/universalis'
import type { DataCenter, World } from '@/api/universalis'
import avatarUrl from '@/assets/avatar.gif'

const isMobile = useIsMobile()

const settingsStore = useSettingsStore()

const dataCenters = ref<DataCenter[]>([])
const worlds = ref<World[]>([])
const loading = ref(false)
const loadError = ref(false)

interface RegionGroup {
  region: string
  dataCenters: (DataCenter & { worldDetails: World[] })[]
}
const regionGroups = ref<RegionGroup[]>([])

function buildFallbackGroups() {
  // When Universalis is unreachable, preserve the user's previously-saved
  // selection so they can still navigate the rest of the Settings page. The
  // dropdowns will show only the stored value until a retry succeeds.
  const region = settingsStore.region
  const dc = settingsStore.dataCenter
  const world = settingsStore.server
  if (!region && !dc && !world) return
  const worldDetails: World[] = world ? [{ id: -1, name: world }] : []
  regionGroups.value = [{
    region: region || 'Other',
    dataCenters: [{ name: dc || '', region: region || 'Other', worlds: [-1], worldDetails }],
  }]
}

async function loadServers(notify = false) {
  loading.value = true
  loadError.value = false
  try {
    const [dcList, worldList] = await Promise.all([
      getDataCenters(),
      getWorlds(),
    ])
    dataCenters.value = dcList
    worlds.value = worldList

    const regionMap = new Map<string, (DataCenter & { worldDetails: World[] })[]>()
    for (const dc of dcList) {
      const region = dc.region || 'Other'
      if (!regionMap.has(region)) regionMap.set(region, [])
      const worldDetails = dc.worlds
        .map(wId => worldList.find(w => w.id === wId))
        .filter((w): w is World => !!w)
      regionMap.get(region)!.push({ ...dc, worldDetails })
    }
    regionGroups.value = Array.from(regionMap.entries()).map(([region, dcs]) => ({
      region,
      dataCenters: dcs,
    }))
    if (notify) ElMessage.success('伺服器清單已重新載入')
  } catch {
    loadError.value = true
    if (regionGroups.value.length === 0) buildFallbackGroups()
    ElMessage.error('無法載入伺服器清單（點選「重試」再試一次）')
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadServers() })

const refreshingFromApi = ref(false)
async function refreshFromLiveApi() {
  refreshingFromApi.value = true
  try {
    await refreshWorldsFromApi()
    await loadServers(true)
  } catch {
    ElMessage.error('從 API 更新伺服器清單失敗，請稍後再試')
  } finally {
    refreshingFromApi.value = false
  }
}

const selectedRegion = ref(settingsStore.region)
const selectedDC = ref(settingsStore.dataCenter)
const selectedServer = ref(settingsStore.server)
const selectedPriceMode = ref(settingsStore.priceDisplayMode)

const appVersion = __APP_VERSION__

const availableDCs = ref<(DataCenter & { worldDetails: World[] })[]>([])
const availableWorlds = ref<World[]>([])

watch(selectedRegion, (newRegion) => {
  const group = regionGroups.value.find(g => g.region === newRegion)
  availableDCs.value = group?.dataCenters ?? []
  if (availableDCs.value.length > 0 && !availableDCs.value.find(dc => dc.name === selectedDC.value)) {
    selectedDC.value = availableDCs.value[0].name
  }
})

watch(selectedDC, (newDC) => {
  const dc = availableDCs.value.find(d => d.name === newDC)
  availableWorlds.value = dc?.worldDetails ?? []
  if (availableWorlds.value.length > 0 && !availableWorlds.value.find(w => w.name === selectedServer.value)) {
    selectedServer.value = availableWorlds.value[0].name
  }
})

watch(regionGroups, () => {
  const group = regionGroups.value.find(g => g.region === selectedRegion.value)
  availableDCs.value = group?.dataCenters ?? []
  const dc = availableDCs.value.find(d => d.name === selectedDC.value)
  availableWorlds.value = dc?.worldDetails ?? []
})

let saveTimeout: ReturnType<typeof setTimeout> | null = null

function autoSave() {
  settingsStore.region = selectedRegion.value
  settingsStore.dataCenter = selectedDC.value
  settingsStore.server = selectedServer.value
  settingsStore.priceDisplayMode = selectedPriceMode.value
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => ElMessage.success('設定已自動儲存'), 300)
}

watch([selectedRegion, selectedDC, selectedServer, selectedPriceMode], autoSave)
</script>

<template>
  <div class="settings-view" :class="{ 'is-mobile': isMobile }">
    <h2>設定</h2>

    <!-- ============ Server settings ============ -->
    <section class="settings-section">
      <header class="section-header">
        <h3 class="section-title">伺服器設定</h3>
        <div v-if="!isMobile" class="section-actions">
          <el-button
            size="small"
            plain
            :loading="refreshingFromApi"
            @click="refreshFromLiveApi"
          >
            從 API 更新伺服器清單
          </el-button>
          <el-button
            v-if="loadError && !loading"
            size="small"
            type="primary"
            plain
            @click="loadServers(true)"
          >
            重試載入清單
          </el-button>
        </div>
      </header>

      <el-skeleton v-if="loading" :rows="3" animated />

      <el-form
        v-else
        :label-width="isMobile ? 'auto' : '120px'"
        :label-position="isMobile ? 'top' : 'left'"
        class="settings-form"
      >
        <el-form-item label="地區">
          <el-select v-model="selectedRegion" placeholder="選擇地區">
            <el-option
              v-for="group in regionGroups"
              :key="group.region"
              :label="group.region"
              :value="group.region"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="資料中心">
          <el-select v-model="selectedDC" placeholder="選擇資料中心">
            <el-option
              v-for="dc in availableDCs"
              :key="dc.name"
              :label="dc.name"
              :value="dc.name"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="伺服器">
          <el-select v-model="selectedServer" placeholder="選擇伺服器">
            <el-option
              v-for="world in availableWorlds"
              :key="world.id"
              :label="world.name"
              :value="world.name"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <div v-if="isMobile" class="m-actions">
        <el-button
          plain
          :loading="refreshingFromApi"
          @click="refreshFromLiveApi"
        >
          從 API 更新伺服器清單
        </el-button>
        <el-button
          v-if="loadError && !loading"
          type="primary"
          plain
          @click="loadServers(true)"
        >
          重試載入清單
        </el-button>
      </div>
    </section>

    <!-- ============ Price preferences ============ -->
    <section class="settings-section">
      <header class="section-header">
        <h3 class="section-title">價格偏好</h3>
      </header>

      <el-form
        :label-width="isMobile ? 'auto' : '120px'"
        :label-position="isMobile ? 'top' : 'left'"
      >
        <el-form-item label="價格顯示">
          <el-radio-group v-model="selectedPriceMode" :class="{ 'm-radio-stack': isMobile }">
            <el-radio value="nq">NQ 最低價</el-radio>
            <el-radio value="hq">HQ 最低價</el-radio>
            <el-radio value="minOf">NQ / HQ 取較低者</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </section>

    <!-- ============ About ============ -->
    <section class="settings-section">
      <header class="section-header">
        <h3 class="section-title">關於</h3>
      </header>

      <div class="about-app">
        <div class="about-app-header">
          <span class="about-app-name">吐司工坊</span>
          <el-tag size="small" effect="dark" round>{{ appVersion }}</el-tag>
        </div>
        <div class="about-tech">
          <div class="about-tech-row">
            <span class="about-tech-label">求解器</span>
            <a
              href="https://github.com/KonaeAkira/raphael-rs"
              target="_blank"
              rel="noopener noreferrer"
              class="about-tech-link"
            >Raphael-rs</a>
            <span class="about-tech-value"> (WASM 多執行緒)</span>
          </div>
          <div class="about-tech-row">
            <span class="about-tech-label">技術架構</span>
            <span class="about-tech-value">Vue 3 + Pinia + Element Plus + Vite + TypeScript</span>
          </div>
        </div>
        <a
          href="https://github.com/andycom12000/ff14-craft-helper"
          target="_blank"
          rel="noopener noreferrer"
          class="about-link-item"
        >
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 010-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/></svg>
          <span>原始碼</span>
        </a>
      </div>

      <el-divider />

      <div class="about-author">
        <img :src="avatarUrl" alt="Author avatar" class="about-avatar" />
        <div class="about-author-info">
          <span class="about-author-label">作者</span>
          <a
            href="https://github.com/andycom12000"
            target="_blank"
            rel="noopener noreferrer"
            class="about-author-name"
          >菸齡 (andycom12000)</a>
        </div>
      </div>
    </section>

    <section class="thanks">
      <h3 class="thanks-title">特別感謝</h3>
      <p class="thanks-desc">社群朋友的回饋、測試與點子，讓這個工具變得更好。</p>
      <ul class="thanks-list">
        <li>BE4R</li>
        <li>哎低</li>
        <li>永恆詩歌</li>
        <li>o12ld</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  max-width: 720px;
}

/* ============ Flat sections — typography + dividers, no card chrome ============ */
.settings-section {
  /* No bg / border / shadow per section. Vertical spacing + a single
   * dividing line between sections is enough for hierarchy. */
}

.settings-section:first-of-type {
  margin-top: 20px;
}

.settings-section + .settings-section {
  margin-top: 32px;
  padding-top: 28px;
  border-top: 1px solid var(--app-border);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.section-title {
  font-family: 'Noto Serif TC', serif;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text);
  margin: 0;
  letter-spacing: 0.02em;
}

.section-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .section-header {
    margin-bottom: 12px;
  }
  .section-title {
    font-family: 'Noto Sans TC', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: var(--app-text-muted);
  }
  .settings-section + .settings-section {
    margin-top: 24px;
    padding-top: 20px;
  }
}

.settings-view.is-mobile .settings-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.settings-view.is-mobile .settings-form :deep(.el-form-item__label) {
  padding-bottom: 6px;
  font-size: 13px;
  color: var(--app-text-muted);
  line-height: 1.3;
}

.settings-view.is-mobile :deep(.el-select),
.settings-view.is-mobile :deep(.el-select__wrapper) {
  width: 100%;
}

.m-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.m-actions :deep(.el-button) {
  width: 100%;
  margin-left: 0 !important;
}

.m-radio-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.m-radio-stack :deep(.el-radio) {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  box-sizing: border-box;
}

.m-radio-stack :deep(.el-radio__input) {
  flex-shrink: 0;
}

.m-radio-stack :deep(.el-radio__label) {
  flex: 1;
  min-width: 0;
  padding-left: 10px;
  padding-right: 0;
  font-size: 14px;
  white-space: normal;
}

.m-radio-stack :deep(.el-radio.is-checked) {
  border-color: var(--app-accent-light);
  background: var(--app-accent-glow);
}


.thanks {
  margin-top: 28px;
  padding: 0 4px;
}

.thanks-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--app-text-muted);
  text-transform: uppercase;
}

.thanks-desc {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text-muted);
}

.thanks-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
}

.thanks-list li {
  font-size: 14px;
  color: var(--app-text);
  position: relative;
  padding-left: 14px;
}

.thanks-list li::before {
  content: '·';
  position: absolute;
  left: 0;
  color: var(--app-accent-light);
  font-weight: 700;
}

.save-row {
  margin-top: 20px;
  text-align: right;
}

.about-app {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.about-app-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.about-app-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
}

.about-tech {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.about-tech-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  font-size: 13px;
  line-height: 1.6;
}

.about-tech-row .about-tech-value {
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}

@media (max-width: 480px) {
  .about-tech-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .about-tech-label {
    min-width: 0;
  }
}

.about-tech-label {
  color: var(--app-text-muted);
  min-width: 80px;
  flex-shrink: 0;
}

.about-tech-value {
  color: var(--app-text);
}

.about-tech-link {
  color: var(--app-accent-light);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
  text-decoration-color: oklch(0.78 0.15 75 /0.5);
}

.about-tech-link:hover {
  text-decoration-style: solid;
  text-decoration-color: currentColor;
}

.about-link-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-hover);
  color: var(--app-text);
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s ease;
  width: fit-content;
}

.about-link-item:hover {
  border-color: var(--app-accent);
  background: var(--app-accent-glow);
  color: var(--app-accent-light);
}

.about-link-item svg {
  opacity: 0.7;
}

.about-link-item:hover svg {
  opacity: 1;
}

.about-author {
  display: flex;
  align-items: center;
  gap: 14px;
}

.about-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 2px solid var(--app-accent);
  object-fit: cover;
  background: var(--app-surface-hover);
  flex-shrink: 0;
}

.about-author-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.about-author-label {
  font-size: 12px;
  color: var(--app-text-muted);
}

.about-author-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--app-accent-light);
  text-decoration: none;
}

.about-author-name:hover {
  text-decoration: underline;
}
</style>
