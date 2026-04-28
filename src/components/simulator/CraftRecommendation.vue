<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { CraftParams } from '@/engine/simulator'
import type { Recipe } from '@/stores/recipe'
import { useSettingsStore } from '@/stores/settings'
import { buildMaterialTree, flattenMaterialTree } from '@/services/bom-calculator'
import { getAggregatedPrices } from '@/api/universalis'
import { findOptimalHqCombinations, type HqRecommendation } from '@/services/hq-optimizer'
import type { FlatMaterial, PriceInfo, MaterialNode } from '@/stores/bom'
import type { BomTarget } from '@/stores/bom'
import BomSummary from '@/components/bom/BomSummary.vue'
import ItemName from '@/components/common/ItemName.vue'
import { formatGil } from '@/utils/format'
import { simulateCraft, waitForWasm } from '@/solver/worker'
import { craftParamsToSolverConfig } from '@/solver/config'

const props = defineProps<{
  craftParams: CraftParams | null
  recipe: Recipe | null
  solverResult: { actions: string[] } | null
}>()

const emit = defineEmits<{
  'apply-hq': [hqAmounts: number[]]
  'self-craft': [recipeId: number]
}>()

const settingsStore = useSettingsStore()
const analyzed = ref(false)
const isMaxProgress = ref(false)
const isMaxQuality = ref(false)
const achievedQuality = ref(0)
const maxQuality = ref(0)
const qualityDeficit = ref(0)

const scenario = computed(() => {
  if (!analyzed.value || !isMaxProgress.value) return null
  return isMaxQuality.value ? 'maxed' : 'quality-deficit'
})

// Scenario A state
const bomLoading = ref(false)
const flatMaterials = ref<FlatMaterial[]>([])
const bomTree = ref<MaterialNode[]>([])
const prices = ref<Map<number, PriceInfo>>(new Map())

// Scenario B state
const hqLoading = ref(false)
const recommendations = ref<HqRecommendation[]>([])

const canHqIngredients = computed(() => {
  if (!props.recipe) return []
  return props.recipe.ingredients
    .map((ing, index) => ({ ...ing, index }))
    .filter(ing => ing.canHq)
})

/* Top-2 cheapest combos. The optimizer can return many viable combos; the
   user only needs the two best to pick from. Sort puts known costs first;
   Infinity (no HQ market price → must self-craft) sinks to the end and
   only shows up if there are fewer than 2 priced options. */
const topRecommendations = computed(() => {
  return [...recommendations.value]
    .sort((a, b) => a.totalCost - b.totalCost)
    .slice(0, 2)
})

const missingPriceIngredients = computed(() => {
  if (!props.recipe) return []
  // Scope to the combos we actually display, otherwise users see self-craft
  // hints for ingredients only relevant to combos we hid.
  const indices = new Set(topRecommendations.value.flatMap(r => r.missingPriceIndices))
  return [...indices].map(i => props.recipe!.ingredients[i])
})

watch(() => props.solverResult, async (result) => {
  if (!result || !props.craftParams || !props.recipe) {
    analyzed.value = false
    return
  }

  try {
    // Use WASM simulation for analysis
    await waitForWasm()
    const config = craftParamsToSolverConfig(props.craftParams)
    const simResult = await simulateCraft(config, result.actions)

    const effectiveQuality = simResult.quality + config.initial_quality
    isMaxProgress.value = simResult.progress >= simResult.max_progress
    isMaxQuality.value = effectiveQuality >= simResult.max_quality
    achievedQuality.value = effectiveQuality
    maxQuality.value = simResult.max_quality
    qualityDeficit.value = simResult.max_quality - effectiveQuality
    analyzed.value = true

    if (isMaxProgress.value && isMaxQuality.value) {
      await loadBom()
    } else if (isMaxProgress.value && !isMaxQuality.value) {
      await loadHqRecommendations()
    }
  } catch (err) {
    console.error('[CraftRecommendation] WASM simulation failed:', err)
    analyzed.value = false
  }
}, { immediate: true })

async function loadBom() {
  bomLoading.value = true
  flatMaterials.value = []
  bomTree.value = []
  prices.value = new Map()

  try {
    const recipe = props.recipe!
    const targets: BomTarget[] = [{
      itemId: recipe.itemId,
      recipeId: recipe.id,
      name: recipe.name,
      icon: recipe.icon,
      quantity: 1,
    }]
    const tree = await buildMaterialTree(targets)
    bomTree.value = tree
    const flat = flattenMaterialTree(tree)
    flatMaterials.value = flat

    const itemIds = flat.map(m => m.itemId)
    if (itemIds.length > 0) {
      const marketData = await getAggregatedPrices(settingsStore.server, itemIds)
      const priceMap = new Map<number, PriceInfo>()
      for (const [id, data] of marketData) {
        priceMap.set(id, {
          itemId: id,
          minPrice: data.minPriceNQ,
          avgPrice: data.currentAveragePriceNQ,
          hqMinPrice: data.minPriceHQ,
          hqAvgPrice: data.currentAveragePriceHQ,
          lastUpdated: data.lastUploadTime,
        })
      }
      prices.value = priceMap
    }
  } catch (err) {
    console.error('[CraftRecommendation] BOM loading failed:', err)
    ElMessage.error('材料計算失敗')
  } finally {
    bomLoading.value = false
  }
}

async function refreshPrices() {
  const itemIds = flatMaterials.value.map(m => m.itemId)
  if (itemIds.length === 0) return
  try {
    const marketData = await getAggregatedPrices(settingsStore.server, itemIds)
    const priceMap = new Map<number, PriceInfo>()
    for (const [id, data] of marketData) {
      priceMap.set(id, {
        itemId: id,
        minPrice: data.minPriceNQ,
        avgPrice: data.currentAveragePriceNQ,
        hqMinPrice: data.minPriceHQ,
        hqAvgPrice: data.currentAveragePriceHQ,
        lastUpdated: data.lastUploadTime,
      })
    }
    prices.value = priceMap
  } catch {
    ElMessage.error('價格更新失敗')
  }
}

async function loadHqRecommendations() {
  hqLoading.value = true
  recommendations.value = []

  try {
    const recipe = props.recipe!
    const canHqItems = recipe.ingredients.filter(ing => ing.canHq)
    const itemIds = canHqItems.map(ing => ing.itemId)

    // Fetch HQ prices
    const hqPriceMap = new Map<number, number>()
    if (itemIds.length > 0) {
      const marketData = await getAggregatedPrices(settingsStore.server, itemIds)
      for (const [id, data] of marketData) {
        hqPriceMap.set(id, data.minPriceHQ)
      }
    }

    recommendations.value = findOptimalHqCombinations(
      maxQuality.value,
      recipe.materialQualityFactor,
      recipe.ingredients,
      qualityDeficit.value,
      hqPriceMap,
    )
  } catch (err) {
    console.error('[CraftRecommendation] HQ optimization failed:', err)
    ElMessage.error('HQ 最佳化失敗')
  } finally {
    hqLoading.value = false
  }
}

</script>

<template>
  <div v-if="solverResult && craftParams && recipe" class="craft-recommendation">
    <!-- Warning: progress not maxed -->
    <el-alert v-if="analyzed && !isMaxProgress" title="進度未滿，建議提升裝備數值或調整技能" type="warning" :closable="false" show-icon style="margin-top: 12px" />

    <!-- Scenario A: 雙滿 (max progress + max quality) -->
    <template v-if="scenario === 'maxed'">
      <p class="scenario-status scenario-status--maxed">
        <span class="scenario-status-icon" aria-hidden="true">✓</span>
        已達雙滿，照下方採購即可
      </p>
      <el-skeleton v-if="bomLoading" :rows="4" animated />
      <BomSummary
        v-else-if="flatMaterials.length > 0"
        :materials="flatMaterials"
        :prices="prices"
        :target-item-ids="[recipe!.itemId]"
        :material-tree="bomTree"
        @refresh-prices="refreshPrices"
      />
    </template>

    <!-- Scenario B: 品質不足 (suggest HQ ingredient combos) -->
    <template v-if="scenario === 'quality-deficit'">
      <p class="scenario-status">
        品質差距 <strong>{{ achievedQuality?.toLocaleString() }}</strong>
        / {{ maxQuality?.toLocaleString() }}
        （缺 <strong>{{ qualityDeficit?.toLocaleString() }}</strong>，補幾組 HQ 素材就能補上）
      </p>
      <el-skeleton v-if="hqLoading" :rows="3" animated />
      <template v-else>
        <el-empty v-if="recommendations.length === 0" description="無法透過 HQ 素材達成品質需求" :image-size="60" />

        <ul v-else class="hq-rec-list" role="list">
          <li v-for="(rec, i) in topRecommendations" :key="i" class="hq-rec-row">
            <div class="hq-rec-ings">
              <span
                v-for="ing in canHqIngredients"
                :key="ing.index"
                class="hq-rec-ing"
                :class="{ 'is-hq': rec.hqAmounts[ing.index] > 0 }"
              >
                <ItemName :item-id="ing.itemId" :fallback="ing.name" />
                <span class="hq-rec-ing-count">
                  <template v-if="rec.hqAmounts[ing.index] > 0">HQ ×{{ rec.hqAmounts[ing.index] }}</template>
                  <template v-else>NQ</template>
                </span>
              </span>
            </div>
            <div class="hq-rec-foot">
              <span class="hq-rec-cost">
                <el-tag v-if="rec.totalCost === Infinity" type="warning" size="small">需自行製作</el-tag>
                <template v-else>
                  <span class="hq-rec-cost-num">{{ formatGil(rec.totalCost) }}</span>
                  <span class="hq-rec-cost-unit">Gil</span>
                </template>
              </span>
              <button
                type="button"
                class="hq-rec-apply"
                @click="emit('apply-hq', rec.hqAmounts)"
              >
                <span class="hq-rec-apply-label">套用</span>
                <span class="hq-rec-apply-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </li>
        </ul>

        <div v-if="missingPriceIngredients.length > 0" class="self-craft-section">
          <p class="self-craft-hint">以下素材無 HQ 市場價，可考慮自製：</p>
          <div class="self-craft-btns">
            <el-button v-for="ing in missingPriceIngredients" :key="ing.itemId" size="small" @click="emit('self-craft', ing.itemId)">
              自製「<ItemName :item-id="ing.itemId" :fallback="ing.name" />」
            </el-button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.craft-recommendation {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Replaces the el-card header tag pattern. Reads inline with the section
   eyebrow rather than introducing a second nested header. */
.scenario-status {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--app-text);
}
.scenario-status strong {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-weight: 600;
  color: var(--app-craft);
}
.scenario-status--maxed {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: color-mix(in srgb, oklch(0.62 0.17 135) 12%, transparent);
  border-radius: 8px;
  color: oklch(0.40 0.14 135);
  font-weight: 600;
  align-self: flex-start;
}
.scenario-status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: oklch(0.62 0.17 135);
  color: white;
  font-size: 11px;
  font-weight: 700;
}

/* HQ recommendation list — top-2 cheapest combos rendered as cocoa-tinted
   strips (NOT bordered cards — the rail-section above already has a rim,
   nested cards are banned by the design system). The tint + rounded
   corners + gap give each row clear separation without horizontal overflow,
   which is what the old el-table couldn't deliver on dense recipes. */
.hq-rec-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hq-rec-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px;
  background: color-mix(in srgb, var(--app-craft) 6%, transparent);
  border-radius: 10px;
  transition: background-color 0.15s var(--ease-out-quart, ease-out);
}
.hq-rec-row:hover {
  background: color-mix(in srgb, var(--app-craft) 11%, transparent);
}
/* Cheapest combo (first row) gets a quiet "best pick" cue: a leading
   accent line on the side. Doesn't fight the 套用 button for attention. */
.hq-rec-row:first-child {
  background: color-mix(in srgb, var(--app-craft) 9%, transparent);
  position: relative;
}
.hq-rec-row:first-child::before {
  content: '最低價';
  position: absolute;
  top: -7px;
  left: 12px;
  padding: 1px 8px;
  background: var(--app-craft);
  color: white;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

/* Ingredient pills — HQ ones pop in cocoa, NQ ones recede.
   Constant ordering across rows (canHqIngredients order) so users can
   scan vertically to compare options. */
.hq-rec-ings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.hq-rec-ing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--app-surface);
  border: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent);
  border-radius: 999px;
  font-size: 12px;
  color: var(--app-text-muted);
  opacity: 0.62;
  transition: all 0.15s var(--ease-out-quart, ease-out);
}
.hq-rec-ing.is-hq {
  background: color-mix(in srgb, var(--app-craft) 14%, var(--app-surface));
  border-color: color-mix(in srgb, var(--app-craft) 42%, var(--app-border));
  color: var(--app-text);
  opacity: 1;
}
.hq-rec-ing-count {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-muted);
  white-space: nowrap;
}
.hq-rec-ing.is-hq .hq-rec-ing-count {
  color: var(--app-craft);
}

/* Cost + apply row — always single-line, no wrap, no overflow.
   套用 is the action; cost is reference. */
.hq-rec-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.hq-rec-cost {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}
.hq-rec-cost-num {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 15px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: 0.01em;
}
.hq-rec-cost-unit {
  font-size: 11px;
  color: var(--app-text-muted);
  font-family: 'Fira Code', ui-monospace, monospace;
}

.hq-rec-apply {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  background: var(--app-accent);
  border: 1px solid var(--app-accent);
  border-radius: 8px;
  color: oklch(0.99 0.005 80);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--app-accent) 22%, transparent);
  transition:
    transform 0.15s var(--ease-out-quart, ease-out),
    box-shadow 0.15s var(--ease-out-quart, ease-out);
}
.hq-rec-apply:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 12px color-mix(in srgb, var(--app-accent) 32%, transparent);
}
.hq-rec-apply:active {
  transform: translateY(0);
}
.hq-rec-apply:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.hq-rec-apply-arrow {
  font-size: 12px;
  transition: transform 0.15s var(--ease-out-quart, ease-out);
}
.hq-rec-apply:hover .hq-rec-apply-arrow {
  transform: translateX(2px);
}

.self-craft-section {
  margin-top: 4px;
}
.self-craft-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.self-craft-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
