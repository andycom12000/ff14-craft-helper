<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Edit, Search } from '@element-plus/icons-vue'
import BomTargetList from '@/components/bom/BomTargetList.vue'
import BomSettingsCard from '@/components/bom/BomSettingsCard.vue'
import BomTotalsBar from '@/components/bom/BomTotalsBar.vue'
import BomDecisionTable from '@/components/bom/BomDecisionTable.vue'
import BomImportDialog from '@/components/bom/BomImportDialog.vue'
import RecipeSearchSidebar from '@/components/recipe/RecipeSearchSidebar.vue'
import ItemName from '@/components/common/ItemName.vue'
import { useBomStore } from '@/stores/bom'
import { useBatchStore } from '@/stores/batch'
import { useLocaleStore } from '@/stores/locale'
import { useIsMobile, useMediaQuery } from '@/composables/useMediaQuery'
import { loadingState } from '@/services/local-data-source'
import { buildMaterialTree, flattenMaterialTree } from '@/services/bom-calculator'
import { getRecipe } from '@/api/xivapi'

const bomStore = useBomStore()
const batchStore = useBatchStore()
const localeStore = useLocaleStore()
const isMobile = useIsMobile()
const isCockpitMobile = useMediaQuery('(max-width: 900px)')
const router = useRouter()

const isLoadingData = computed(() => {
  const s = loadingState[localeStore.current]
  return s.recipes || s.items || s.rlt
})

const searchSidebarOpen = ref(false)
const importDialogOpen = ref(false)
const calculating = ref(false)
const totalsAnchor = ref<HTMLElement | null>(null)
const targetsDrawerOpen = ref(false)

function handleMobileCalculate() {
  targetsDrawerOpen.value = false
  void handleCalculate()
}
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

    await nextTick()
    totalsAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      <div v-if="isCockpitMobile" class="b-mobile-strip" aria-label="目標摘要">
        <ul v-if="bomStore.targets.length > 0" class="b-mobile-strip__chips">
          <li v-for="t in bomStore.targets" :key="t.recipeId" class="b-mobile-chip">
            <span class="b-mobile-chip__qty">×{{ t.quantity }}</span>
            <ItemName :item-id="t.itemId" :fallback="t.name" />
          </li>
        </ul>
        <p v-else class="b-mobile-strip__empty">清單為空，點下方按鈕新增目標</p>
        <div class="b-mobile-strip__actions">
          <el-button
            size="small"
            :icon="Edit"
            @click="targetsDrawerOpen = true"
          >
            編輯目標
          </el-button>
          <el-button
            v-if="bomStore.targets.length > 0"
            type="primary"
            size="small"
            :loading="calculating"
            @click="handleCalculate"
          >
            計算
          </el-button>
          <el-button
            v-else
            type="primary"
            size="small"
            :icon="Search"
            @click="searchSidebarOpen = true"
          >
            搜尋配方
          </el-button>
        </div>
      </div>

      <aside v-else class="b-rail" aria-label="目標與設定">
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
        <div v-if="calculated && !calculating" ref="totalsAnchor" class="b-main__totals">
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

    <el-drawer
      v-if="isCockpitMobile"
      v-model="targetsDrawerOpen"
      direction="btt"
      size="auto"
      :with-header="false"
      :modal="true"
      :close-on-press-escape="true"
      :close-on-click-modal="true"
      :append-to-body="true"
      class="b-targets-sheet"
    >
      <div class="b-targets-sheet__handle" aria-hidden="true" />
      <div class="b-targets-sheet__body">
        <BomTargetList
          @calculate="handleMobileCalculate"
          @open-search="targetsDrawerOpen = false; searchSidebarOpen = true"
          @open-import="targetsDrawerOpen = false; importDialogOpen = true"
        />
        <BomSettingsCard />
      </div>
      <div v-if="bomStore.targets.length > 0" class="b-targets-sheet__cta">
        <el-button
          type="primary"
          size="large"
          class="b-rail__calc"
          :loading="calculating"
          @click="handleMobileCalculate"
        >
          計算材料需求
        </el-button>
      </div>
    </el-drawer>
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
  /* Match the sticky offset so smooth-scroll lands the totals row
   * just below the page chrome instead of half-hidden under it. */
  scroll-margin-top: 16px;
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

/* <900px: chip strip replaces the static rail. The full target list +
 * settings live in a bottom-sheet behind the「編輯目標」button so the
 * decision table gets the full viewport width to itself. */
.b-mobile-strip {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 12px;
}

.b-mobile-strip__chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.b-mobile-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-craft-dim) 20%, var(--app-bg));
  color: var(--app-text);
  font-size: 12.5px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.b-mobile-chip__qty {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--app-text-muted);
}

.b-mobile-strip__empty {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-muted);
}

.b-mobile-strip__actions {
  display: flex;
  gap: 8px;
}

.b-mobile-strip__actions .el-button {
  flex: 1;
}

@media (min-width: 1920px) {
  .bom-cockpit {
    grid-template-columns: clamp(320px, 22%, 380px) minmax(0, 1fr);
    gap: 32px;
  }
}
</style>

<style>
/* Mobile targets drawer — append-to-body means scoped styles can't reach it. */
.b-targets-sheet.el-drawer {
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  max-height: 88vh;
}

.b-targets-sheet .el-drawer__body {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
}

.b-targets-sheet__handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--app-border);
  margin: 8px auto 4px;
  flex-shrink: 0;
}

.b-targets-sheet__body {
  padding: 12px 14px 14px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.b-targets-sheet__cta {
  flex-shrink: 0;
  padding: 12px 14px;
  border-top: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-craft-dim) 12%, var(--app-surface));
}
</style>
