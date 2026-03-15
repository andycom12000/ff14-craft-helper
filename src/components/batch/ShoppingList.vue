<script setup lang="ts">
import type { CrystalSummary, ServerGroup, MaterialWithPrice } from '@/services/shopping-list'

defineProps<{
  crystals: CrystalSummary[]
  serverGroups: ServerGroup[]
  selfCraftItems: MaterialWithPrice[]
  grandTotal: number
}>()

const crystalColors: Record<string, string> = {
  '火': '#F87171', '水': '#60A5FA', '風': '#34D399',
  '雷': '#FBBF24', '冰': '#A78BFA', '土': '#F472B6',
}

function getCrystalColor(name: string): string {
  for (const [key, color] of Object.entries(crystalColors)) {
    if (name.includes(key)) return color
  }
  return '#94A3B8'
}
</script>

<template>
  <div>
    <!-- Crystals -->
    <div v-if="crystals.length > 0" style="margin-bottom: 16px;">
      <el-text size="small" type="info" tag="div" style="margin-bottom: 8px;">水晶（不計入費用）</el-text>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        <el-tag v-for="c in crystals" :key="c.itemId" effect="dark" round>
          <span :style="{ color: getCrystalColor(c.name) }">&#9679;</span>
          {{ c.name }} x{{ c.amount }}
        </el-tag>
      </div>
      <el-divider />
    </div>

    <!-- Server groups -->
    <div v-for="group in serverGroups" :key="group.server" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div>
          <el-tag type="primary">{{ group.server }}</el-tag>
          <el-text size="small" type="info" style="margin-left: 8px;">{{ group.items.length }} 項素材</el-text>
        </div>
        <el-text type="warning">小計：{{ group.subtotal.toLocaleString() }} Gil</el-text>
      </div>
      <el-table :data="group.items" size="small">
        <el-table-column label="" width="40">
          <template #default="{ row }">
            <img v-if="row.icon" :src="row.icon" style="width:20px;height:20px;border-radius:2px;" />
          </template>
        </el-table-column>
        <el-table-column label="素材" prop="name" />
        <el-table-column label="類型" width="60">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'hq' ? 'warning' : 'info'">
              {{ row.type.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="數量" prop="amount" width="60" />
        <el-table-column label="單價" width="90">
          <template #default="{ row }">{{ row.unitPrice.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="小計" width="90">
          <template #default="{ row }">
            <el-text type="warning">{{ (row.unitPrice * row.amount).toLocaleString() }}</el-text>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Self-craft -->
    <div v-if="selfCraftItems.length > 0" style="margin-bottom: 16px;">
      <div style="margin-bottom: 8px;">
        <el-tag type="success">需自行製作</el-tag>
        <el-text size="small" type="info" style="margin-left: 8px;">{{ selfCraftItems.length }} 項素材</el-text>
      </div>
      <el-table :data="selfCraftItems" size="small">
        <el-table-column label="" width="40">
          <template #default="{ row }">
            <img v-if="row.icon" :src="row.icon" style="width:20px;height:20px;" />
          </template>
        </el-table-column>
        <el-table-column label="素材" prop="name" />
        <el-table-column label="數量" prop="amount" width="60" />
      </el-table>
    </div>

    <el-divider />
    <div style="text-align: right; font-size: 18px; font-weight: bold; color: var(--el-color-warning);">
      購買合計：{{ grandTotal.toLocaleString() }} Gil
    </div>
  </div>
</template>
