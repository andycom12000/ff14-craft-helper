<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import BomTargetList from '@/components/bom/BomTargetList.vue'
import BomSettingsCard from '@/components/bom/BomSettingsCard.vue'
import BomTotalsBar from '@/components/bom/BomTotalsBar.vue'
import BomDecisionTable from '@/components/bom/BomDecisionTable.vue'
import BomImportDialog from '@/components/bom/BomImportDialog.vue'
import RecipeSearchSidebar from '@/components/recipe/RecipeSearchSidebar.vue'
import { useBomStore } from '@/stores/bom'
import { useBatchStore } from '@/stores/batch'
import { useLocaleStore } from '@/stores/locale'
import { useIsMobile } from '@/composables/useMediaQuery'
import { loadingState } from '@/services/local-data-source'
import { buildMaterialTree, flattenMaterialTree } from '@/services/bom-calculator'
import { getRecipe } from '@/api/xivapi'

const bomStore = useBomStore()
const batchStore = useBatchStore()
const localeStore = useLocaleStore()
const isMobile = useIsMobile()
const router = useRouter()

const isLoadingData = computed(() => {
  const s = loadingState[localeStore.current]
  return s.recipes || s.items || s.rlt
})

const searchSidebarOpen = ref(false)
const importDialogOpen = ref(false)
const calculating = ref(false)
const fetchingPrices = computed(() => bomStore.fetchingPriceIds.size > 0)
const calculated = computed(() => bomStore.materialTree.length > 0)
const loadingMessage = ref('正在計算材料需求...')

const targetItemIds = computed(() => bomStore.targets.map((t) => t.itemId))

async function handleCalculate() {
  if (bomStore.targets.length === 0) {
    ElMessage.warning('請先加入至少一個製作目標')
    return
  }

  calculating.value = true

  try {
    loadingMessage.value = '正在展開子配方...'
    const tree = await buildMaterialTree(bomStore.targets)
    bomStore.materialTree = tree

    loadingMessage.value = '正在整理購物清單...'
    const flat = flattenMaterialTree(tree)
    bomStore.flatMaterials = flat

    loadingMessage.value = '正在比對市價、NPC、自製...'
    const [priceResult] = await Promise.all([
      bomStore.fetchPrices(flat.map((m) => m.itemId)),
      bomStore.fetchAcquisitionAvailability(flat.map((m) => m.itemId)),
    ])
    bomStore.applyOptimalDefaults()

    if (priceResult.ok) {
      ElMessage.success('材料計算完成')
    } else {
      ElMessage.warning('部分價格查詢失敗，可在該列點「重試」')
    }
  } catch (err) {
    console.error('[BOM] Calculation failed:', err)
    ElMessage.error('材料計算失敗，請稍後再試')
  } finally {
    calculating.value = false
  }
}

function handleAddFromSearch(recipe: import('@/stores/recipe').Recipe) {
  bomStore.addTarget({
    itemId: recipe.itemId,
    recipeId: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    quantity: 1,
    amountResult: recipe.amountResult,
  })
  ElMessage.success(`已加入「${recipe.name}」`)
}

async function handleRefreshPrices() {
  const r = await bomStore.fetchPrices()
  if (!r.ok) ElMessage.error('價格取得失敗，請稍後再試')
}

async function handleSendToBatch() {
  if (bomStore.targets.length === 0) {
    ElMessage.warning('清單為空')
    return
  }
  try {
    const recipes = await Promise.all(
      bomStore.targets.map((t) => getRecipe(t.recipeId)),
    )
    for (let i = 0; i < recipes.length; i++) {
      batchStore.addTarget(recipes[i])
      batchStore.updateQuantity(bomStore.targets[i].recipeId, bomStore.targets[i].quantity)
    }
    ElMessage.success(`已送出 ${bomStore.targets.length} 筆到批量計算`)
    router.push('/batch')
  } catch (err) {
    console.error('[BOM] Send to batch failed:', err)
    ElMessage.error('送出到批量失敗')
  }
}

function handleImported() {
  if (bomStore.targets.length > 0) {
    ElMessage.success('已匯入，按「計算」開始拆解素材')
  }
}
</script>

<template>
  <div class="bom-view" v-loading="isLoadingData">
    <header class="bom-view__header">
      <h2>購物清單</h2>
      <p class="view-desc">想做什麼就加進來，我會幫你算好材料、查市價、估省下多少錢。</p>
    </header>

    <div class="bom-cockpit" :class="{ 'is-mobile': isMobile }">
      <aside class="b-rail" aria-label="目標與設定">
        <div class="b-rail__scroll">
          <BomTargetList
            @calculate="handleCalculate"
            @open-search="searchSidebarOpen = true"
            @open-import="importDialogOpen = true"
          />
          <BomSettingsCard />
        </div>
        <div v-if="bomStore.targets.length > 0" class="b-rail__cta">
          <el-button
            type="primary"
            size="large"
            class="b-rail__calc"
            :loading="calculating"
            @click="handleCalculate"
          >
            計算材料需求
          </el-button>
        </div>
      </aside>

      <main class="b-main">
        <div v-if="calculated && !calculating" class="b-main__totals">
          <BomTotalsBar
            :fetching-prices="fetchingPrices"
            @refresh-prices="handleRefreshPrices"
            @send-to-batch="handleSendToBatch"
          />
        </div>

        <div v-if="calculating" class="b-main__loading">
          <el-skeleton :rows="6" animated />
          <p class="loading-text">{{ loadingMessage }}</p>
        </div>

        <template v-else-if="calculated">
          <div v-if="fetchingPrices && bomStore.prices.size === 0" class="b-main__loading">
            <el-skeleton :rows="4" animated />
            <p class="loading-text">正在取得市場價格...</p>
          </div>
          <BomDecisionTable
            v-else
            :materials="bomStore.flatMaterials"
            :material-tree="bomStore.materialTree"
            :target-item-ids="targetItemIds"
          />
        </template>

        <div v-else-if="bomStore.targets.length > 0" class="b-main__pending">
          <p>目標已就緒。從左側按下「計算材料需求」開始拆解素材。</p>
        </div>

        <div v-else class="b-main__pending b-main__pending--empty">
          <p>還沒有目標。從左側搜尋配方，或匯入 Teamcraft 連結。</p>
        </div>
      </main>
    </div>

    <RecipeSearchSidebar
      v-model="searchSidebarOpen"
      context="加入購物清單"
      @add="handleAddFromSearch"
    />
    <BomImportDialog v-model="importDialogOpen" @imported="handleImported" />
  </div>
</template>

<style scoped>
.bom-view {
  /* Page expands to roughly 1440px on tablet/laptop, then up to 1920+ on
   * ultrawide so the cockpit's right side doesn't waste pixels. */
  max-width: 2100px;
  margin: 0 auto;

  /* Page accent — cocoa for crafting zone (Jam-Jar Rule). The toast-gold
   * stays for total amount inside the totals bar. */
  --page-accent: var(--app-craft);
  --page-accent-dim: var(--app-craft-dim);
}

.bom-view__header {
  margin-bottom: 18px;
}

.view-desc {
  color: var(--app-text-muted);
  font-size: 14px;
  margin: 4px 0 0;
}

.bom-cockpit {
  display: grid;
  grid-template-columns: clamp(300px, 24%, 360px) minmax(0, 1fr);
  gap: 24px;
  align-items: flex-start;
}

.b-rail {
  position: sticky;
  top: 16px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 32px);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 14px;
  overflow: hidden;
}

.b-rail__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.b-rail__cta {
  flex-shrink: 0;
  padding: 12px 14px;
  border-top: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-craft-dim) 12%, var(--app-surface));
}

.b-rail__calc {
  width: 100%;
  background: var(--app-craft);
  border-color: var(--app-craft);
}

.b-rail__calc:hover {
  background: oklch(from var(--app-craft) calc(l + 0.06) c h);
  border-color: oklch(from var(--app-craft) calc(l + 0.06) c h);
}

.b-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.b-main__totals {
  position: sticky;
  top: 16px;
  z-index: 5;
}

.b-main__loading {
  padding: 24px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 12px;
}

.loading-text {
  text-align: center;
  color: var(--app-text-muted);
  margin-top: 12px;
  font-size: 13px;
}

.b-main__pending {
  padding: 64px 24px;
  background: var(--app-surface);
  border: 1px dashed var(--app-border);
  border-radius: 12px;
  text-align: center;
  color: var(--app-text-muted);
  font-size: 14px;
}

.b-main__pending--empty {
  padding: 96px 24px;
}

@media (max-width: 1440px) {
  .bom-cockpit {
    grid-template-columns: clamp(280px, 28%, 320px) minmax(0, 1fr);
    gap: 20px;
  }
}

@media (max-width: 900px) {
  .bom-cockpit {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .b-rail {
    position: static;
    max-height: none;
    overflow: visible;
  }
  .b-rail__scroll {
    overflow: visible;
  }
  .b-main__totals {
    position: static;
  }
}

@media (min-width: 1920px) {
  .bom-cockpit {
    grid-template-columns: clamp(320px, 22%, 380px) minmax(0, 1fr);
    gap: 32px;
  }
}
</style>
