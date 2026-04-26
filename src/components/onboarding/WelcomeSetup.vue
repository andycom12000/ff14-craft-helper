<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useLocaleStore } from '@/stores/locale'
import { getDataCenters, getWorlds } from '@/api/universalis'
import type { DataCenter, World } from '@/api/universalis'
import type { Locale } from '@/services/local-data-source.types'

const emit = defineEmits<{ done: [] }>()

interface LanguageOption {
  locale: Locale
  label: string
  hint: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { locale: 'zh-TW', label: '繁體中文', hint: '台港澳' },
  { locale: 'zh-CN', label: '简体中文', hint: '國際/中國服' },
  { locale: 'en', label: 'English', hint: 'North America / Europe / Oceania' },
  { locale: 'ja', label: '日本語', hint: 'JP' },
]

const settingsStore = useSettingsStore()
const localeStore = useLocaleStore()

const step = ref<1 | 2>(1)
const selectedLocale = ref<Locale>(localeStore.current)

interface RegionGroup {
  region: string
  dataCenters: (DataCenter & { worldDetails: World[] })[]
}
const regionGroups = ref<RegionGroup[]>([])
const loading = ref(false)
const loadError = ref(false)

const selectedRegion = ref<string>(settingsStore.region || '')
const selectedDC = ref<string>(settingsStore.dataCenter || '')
const selectedServer = ref<string>(settingsStore.server || '')

async function loadServers() {
  loading.value = true
  loadError.value = false
  try {
    const [dcList, worldList] = await Promise.all([getDataCenters(), getWorlds()])
    const regionMap = new Map<string, (DataCenter & { worldDetails: World[] })[]>()
    for (const dc of dcList) {
      const region = dc.region || 'Other'
      if (!regionMap.has(region)) regionMap.set(region, [])
      const worldDetails = dc.worlds
        .map(id => worldList.find(w => w.id === id))
        .filter((w): w is World => !!w)
      regionMap.get(region)!.push({ ...dc, worldDetails })
    }
    regionGroups.value = Array.from(regionMap.entries()).map(([region, dcs]) => ({
      region,
      dataCenters: dcs,
    }))
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadServers()
})

const availableDCs = computed(() => {
  const group = regionGroups.value.find(g => g.region === selectedRegion.value)
  return group?.dataCenters ?? []
})

const availableWorlds = computed(() => {
  const dc = availableDCs.value.find(d => d.name === selectedDC.value)
  return dc?.worldDetails ?? []
})

watch(selectedRegion, () => {
  if (!availableDCs.value.find(d => d.name === selectedDC.value)) {
    selectedDC.value = availableDCs.value[0]?.name ?? ''
  }
})

watch(selectedDC, () => {
  if (!availableWorlds.value.find(w => w.name === selectedServer.value)) {
    selectedServer.value = availableWorlds.value[0]?.name ?? ''
  }
})

const canGoNext = computed(() => {
  if (step.value === 1) return !!selectedLocale.value
  return !!selectedRegion.value && !!selectedDC.value && !!selectedServer.value
})

async function goNext() {
  if (!canGoNext.value) return
  if (step.value === 1) {
    await localeStore.setLocale(selectedLocale.value)
    step.value = 2
    return
  }
  settingsStore.region = selectedRegion.value
  settingsStore.dataCenter = selectedDC.value
  settingsStore.server = selectedServer.value
  try {
    localStorage.setItem('onboardingComplete', '1')
  } catch {
    // ignore storage errors (private mode etc.)
  }
  emit('done')
}

function goBack() {
  if (step.value === 2) step.value = 1
}

function pickLocale(locale: Locale) {
  selectedLocale.value = locale
}

const stepHeading = computed(() => (step.value === 1 ? '選個順手的語言' : '挑你玩的伺服器'))
const stepSub = computed(() =>
  step.value === 1
    ? '之後所有道具名、技能、巨集都會照這個顯示。隨時能在左側邊欄切換。'
    : '選好伺服器我就能幫你查市場價格。預設是繁中服的巴哈姆特，不一樣可以改。',
)
</script>

<template>
  <div class="welcome-setup">
    <header class="welcome-header">
      <span class="badge">第 {{ step }} / 2 步</span>
      <h1>歡迎來到吐司工坊</h1>
      <p class="lead">第一次來？花 10 秒選好語言跟伺服器，我就能幫你查配方了。</p>
    </header>

    <section class="welcome-body">
      <div class="step-heading">
        <h2>{{ stepHeading }}</h2>
        <p>{{ stepSub }}</p>
      </div>

      <div v-if="step === 1" class="choices">
        <button
          v-for="opt in LANGUAGE_OPTIONS"
          :key="opt.locale"
          class="choice-card"
          :class="{ active: selectedLocale === opt.locale }"
          type="button"
          @click="pickLocale(opt.locale)"
        >
          <span class="choice-title">{{ opt.label }}</span>
          <span class="choice-hint">{{ opt.hint }}</span>
        </button>
      </div>

      <div v-else class="server-step">
        <div v-if="loading" class="loading-note">正在載入伺服器清單…</div>
        <div v-else-if="loadError" class="error-note">
          伺服器清單載入失敗，
          <button class="inline-link" type="button" @click="loadServers">再試一次</button>
        </div>
        <div v-else class="server-fields">
          <div class="field">
            <span class="field-label">地區</span>
            <el-select v-model="selectedRegion" placeholder="選擇地區" size="large" class="field-input">
              <el-option
                v-for="group in regionGroups"
                :key="group.region"
                :label="group.region"
                :value="group.region"
              />
            </el-select>
          </div>
          <div class="field">
            <span class="field-label">資料中心</span>
            <el-select v-model="selectedDC" placeholder="選擇資料中心" size="large" class="field-input" :disabled="!selectedRegion">
              <el-option
                v-for="dc in availableDCs"
                :key="dc.name"
                :label="dc.name"
                :value="dc.name"
              />
            </el-select>
          </div>
          <div class="field">
            <span class="field-label">伺服器</span>
            <el-select v-model="selectedServer" placeholder="選擇伺服器" size="large" class="field-input" :disabled="!selectedDC">
              <el-option
                v-for="world in availableWorlds"
                :key="world.id"
                :label="world.name"
                :value="world.name"
              />
            </el-select>
          </div>
        </div>
      </div>
    </section>

    <footer class="welcome-footer">
      <el-button
        v-if="step === 2"
        text
        class="back-btn"
        @click="goBack"
      >返回</el-button>
      <el-button
        type="primary"
        size="large"
        :disabled="!canGoNext"
        @click="goNext"
      >{{ step === 1 ? '下一步' : '開始使用' }}</el-button>
    </footer>
  </div>
</template>

<style scoped>
.welcome-setup {
  max-width: 640px;
  margin: 32px auto;
  padding: 40px 36px 32px;
  border-radius: 20px;
  background: linear-gradient(180deg, oklch(0.65 0.18 65 /0.08) 0%, oklch(0.65 0.18 65 /0) 60%), var(--app-surface);
  border: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.welcome-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.badge {
  align-self: flex-start;
  font-size: 11px;
  color: var(--app-accent-light);
  background: var(--app-accent-glow);
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 600;
}

.welcome-header h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: 0.4px;
}

.lead {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--app-text-muted);
}

.welcome-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.step-heading h2 {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text);
}

.step-heading p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text-muted);
}

.choices {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.choice-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-hover);
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s var(--ease-out-quart), background 0.15s var(--ease-out-quart);
}

.choice-card:hover {
  border-color: var(--app-accent-light);
}

.choice-card.active {
  border-color: var(--app-accent);
  background: var(--app-accent-glow);
}

.choice-title {
  font-size: 15px;
  font-weight: 600;
}

.choice-hint {
  font-size: 12px;
  color: var(--app-text-muted);
}

.server-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--app-text-muted);
  letter-spacing: 0.3px;
}

.field-input {
  width: 100%;
}

.loading-note,
.error-note {
  font-size: 13px;
  color: var(--app-text-muted);
  padding: 12px 0;
}

.inline-link {
  background: none;
  border: none;
  color: var(--app-accent-light);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  text-decoration: underline;
  font-family: inherit;
}

.welcome-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
}

.back-btn {
  color: var(--app-text-muted);
}

/* Mobile: remove the enclosing card entirely — the onboarding IS the page,
 * not a modal sitting inside one. Content fills the viewport with page-level
 * padding, language choices flatten to a divider list, footer sticks to bottom
 * so the primary CTA is always reachable while content scrolls naturally. */
@media (max-width: 640px) {
  .welcome-setup {
    max-width: none;
    margin: 0;
    padding: 60px 16px 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    gap: 24px;
    min-height: 100%;
  }

  .welcome-header h1 {
    font-size: 22px;
  }

  .choices {
    grid-template-columns: 1fr;
    gap: 0;
    border-top: 1px solid var(--app-border);
  }

  .choice-card {
    padding: 16px 4px;
    border-radius: 0;
    border: 0;
    border-bottom: 1px solid var(--app-border);
    background: transparent;
    min-height: 56px;
  }

  .choice-card:hover {
    border-bottom-color: var(--app-border);
    background: transparent;
  }

  .choice-card.active {
    border-bottom-color: var(--app-accent);
    background: color-mix(in srgb, var(--app-accent) 8%, transparent);
  }

  .welcome-footer {
    position: sticky;
    bottom: 0;
    margin: 8px -16px 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--app-bg) 90%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-top: 1px solid var(--app-border);
    z-index: 1;
  }

  .welcome-footer :deep(.el-button--primary) {
    flex: 1;
  }
}
</style>
