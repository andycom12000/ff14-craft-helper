<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { getDataCenters, getWorlds } from '@/api/universalis'
import type { DataCenter, World } from '@/api/universalis'

const settingsStore = useSettingsStore()

const dataCenters = ref<DataCenter[]>([])
const worlds = ref<World[]>([])
const loading = ref(false)

// Group DCs by region
interface RegionGroup {
  region: string
  dataCenters: (DataCenter & { worldDetails: World[] })[]
}
const regionGroups = ref<RegionGroup[]>([])

onMounted(async () => {
  loading.value = true
  try {
    const [dcList, worldList] = await Promise.all([
      getDataCenters(),
      getWorlds(),
    ])
    dataCenters.value = dcList
    worlds.value = worldList

    // Build region groups
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
  } catch {
    ElMessage.error('無法載入伺服器清單')
  } finally {
    loading.value = false
  }
})

const selectedRegion = ref(settingsStore.region)
const selectedDC = ref(settingsStore.dataCenter)
const selectedServer = ref(settingsStore.server)
const selectedPriceMode = ref(settingsStore.priceDisplayMode)

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
  // Trigger chain after data loads
  const group = regionGroups.value.find(g => g.region === selectedRegion.value)
  availableDCs.value = group?.dataCenters ?? []
  const dc = availableDCs.value.find(d => d.name === selectedDC.value)
  availableWorlds.value = dc?.worldDetails ?? []
})

function saveSettings() {
  settingsStore.region = selectedRegion.value
  settingsStore.dataCenter = selectedDC.value
  settingsStore.server = selectedServer.value
  settingsStore.priceDisplayMode = selectedPriceMode.value
  ElMessage.success('設定已儲存')
}
</script>

<template>
  <div class="settings-view">
    <h2>設定</h2>

    <el-skeleton v-if="loading" :rows="6" animated />

    <template v-else>
      <el-card shadow="never">
        <template #header>
          <span class="card-title">伺服器設定</span>
        </template>

        <el-form label-width="120px" label-position="left">
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
      </el-card>

      <el-card shadow="never" style="margin-top: 20px">
        <template #header>
          <span class="card-title">價格偏好</span>
        </template>

        <el-form label-width="120px" label-position="left">
          <el-form-item label="價格顯示">
            <el-radio-group v-model="selectedPriceMode">
              <el-radio value="nq">NQ 最低價</el-radio>
              <el-radio value="hq">HQ 最低價</el-radio>
              <el-radio value="minOf">NQ / HQ 取較低者</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-card>

      <div style="margin-top: 20px; text-align: right">
        <el-button type="primary" @click="saveSettings">儲存設定</el-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 20px;
  max-width: 720px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}
</style>
