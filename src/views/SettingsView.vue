<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
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

      <div class="about-profile">
        <a
          href="https://github.com/andycom12000"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="作者 GitHub"
          class="about-avatar-link"
        >
          <div class="about-avatar-frame">
            <img :src="avatarUrl" alt="Author avatar" class="about-avatar" />
          </div>
        </a>
        <div class="about-body">
          <p class="about-by">crafted by</p>
          <h4 class="about-author">
            <a
              href="https://github.com/andycom12000"
              target="_blank"
              rel="noopener noreferrer"
            >菸齡 (andycom12000)</a>
          </h4>
          <p class="about-project">
            <strong>吐司工坊</strong>
            FFXIV 製作助手
            <span class="about-ver">{{ appVersion }}</span>
          </p>

          <div class="about-links">
            <a
              href="https://github.com/andycom12000/ff14-craft-helper"
              target="_blank"
              rel="noopener noreferrer"
              class="about-link"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              原始碼
            </a>
            <a
              href="https://github.com/andycom12000/ff14-craft-helper/issues"
              target="_blank"
              rel="noopener noreferrer"
              class="about-link"
            >
              <span class="about-link-emoji" aria-hidden="true">🐛</span>
              回報問題
            </a>
            <a
              href="https://www.buymeacoffee.com/andycom12000"
              target="_blank"
              rel="noopener noreferrer"
              class="about-link"
            >
              <span class="about-link-emoji" aria-hidden="true">☕</span>
              Buy me a coffee
            </a>
          </div>

          <div class="about-tech">
            <strong>POWERED BY</strong>
            <a
              href="https://github.com/KonaeAkira/raphael-rs"
              target="_blank"
              rel="noopener noreferrer"
            >Raphael-rs</a>
            · Vue 3 · Pinia · Element Plus · Vite · TypeScript
          </div>
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
  margin-top: 32px;
  padding: 28px 4px 0;
  border-top: 1px solid var(--app-border);
}

@media (max-width: 640px) {
  .thanks {
    margin-top: 24px;
    padding-top: 20px;
  }
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

/* ============ About — author-first profile layout ============ */
.about-profile {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 20px;
  align-items: center;
}

.about-avatar-link {
  display: inline-block;
  border-radius: 50%;
  text-decoration: none;
}

/* Wrapper holds the border + shadow; multiply lives on the image inside
 * so the border isn't blended away by mix-blend-mode. */
.about-avatar-frame {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 1px solid var(--app-border);
  overflow: hidden;
  box-shadow: 0 2px 8px oklch(0.40 0.05 60 / 0.10);
}

.about-avatar-link:focus-visible {
  outline: 2px solid oklch(0.62 0.12 65);
  outline-offset: 3px;
}

.about-avatar {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: transparent;
  /* Drop the GIF's white backdrop by multiplying against the page bg */
  mix-blend-mode: multiply;
  transition:
    transform 0.25s var(--ease-out-quart, ease),
    filter 0.25s var(--ease-out-quart, ease);
}

/* Hover linkage — avatar and author name light up together (A + E):
 * (A) avatar scales 1.06 + saturate 1.2
 * (E) author-name link picks up muted gold underline
 * Triggered by hovering EITHER the avatar OR the author name. */
.about-avatar-link:hover .about-avatar,
.about-profile:has(.about-author a:hover) .about-avatar {
  transform: scale(1.06);
  filter: saturate(1.2);
}

.about-avatar-link:hover ~ .about-body .about-author a {
  color: oklch(0.62 0.12 65);
  border-bottom-color: oklch(0.62 0.12 65);
}

.about-body {
  min-width: 0;
}

.about-by {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 15px;
  color: oklch(0.62 0.03 60);
  margin: 0 0 2px;
}

.about-author {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 19px;
  color: var(--app-text);
  margin: 0 0 12px;
  letter-spacing: 0.02em;
}

.about-author a {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid oklch(0.62 0.12 65 / 0.40);
  padding-bottom: 2px;
  transition: color 0.18s ease, border-color 0.18s ease;
}

.about-author a:hover {
  color: oklch(0.62 0.12 65);
  border-bottom-color: oklch(0.62 0.12 65);
}

.about-project {
  margin: 0 0 14px;
  font-size: 13.5px;
  color: var(--app-text-muted);
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.about-project strong {
  color: var(--app-text);
  font-weight: 700;
  font-size: 15px;
}

.about-ver {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: oklch(0.62 0.03 60);
  background: oklch(0.55 0.04 65 / 0.10);
  padding: 1px 7px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.about-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.about-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  font-size: 12.5px;
  color: var(--app-text);
  text-decoration: none;
  background: oklch(1 0 0 / 0.4);
  transition: all 0.18s var(--ease-out-quart, ease);
}

.about-link:hover {
  border-color: oklch(0.62 0.12 65);
  color: oklch(0.62 0.12 65);
}

.about-link-emoji {
  font-size: 13px;
  line-height: 1;
}

.about-tech {
  font-size: 11.5px;
  color: oklch(0.62 0.03 60);
  line-height: 1.7;
}

.about-tech strong {
  color: var(--app-text-muted);
  font-weight: 600;
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-right: 6px;
}

.about-tech a {
  color: oklch(0.62 0.12 65);
  text-decoration: none;
  border-bottom: 1px dotted oklch(0.62 0.12 65 / 0.4);
}

.about-tech a:hover {
  color: var(--app-accent);
  border-bottom-color: var(--app-accent);
}

@media (max-width: 480px) {
  .about-profile {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .about-avatar-frame {
    width: 64px;
    height: 64px;
  }
}
</style>
