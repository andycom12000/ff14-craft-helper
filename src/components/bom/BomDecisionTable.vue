<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FlatMaterial, MaterialNode } from '@/stores/bom'
import { useBomStore } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { useMediaQuery } from '@/composables/useMediaQuery'
import BomDecisionRow from '@/components/bom/BomDecisionRow.vue'
import BomCraftTreeNode from '@/components/bom/BomCraftTreeNode.vue'
import BomAcquisitionDetail from '@/components/bom/BomAcquisitionDetail.vue'
import BomMarketDetail from '@/components/bom/BomMarketDetail.vue'
import ZoneMapSheet from '@/components/bom/ZoneMapSheet.vue'
import ItemName from '@/components/common/ItemName.vue'

const props = defineProps<{
  materials: FlatMaterial[]
  materialTree: MaterialNode[]
  targetItemIds: number[]
}>()

const bom = useBomStore()
const settings = useSettingsStore()

const CRYSTAL_THRESHOLD = 20

interface RowDescriptor {
  itemId: number
  name: string
  icon: string
  amount: number
  isCraftable: boolean
  isTarget: boolean
}

const targetSet = computed(() => new Set(props.targetItemIds))

const targetRows = computed<RowDescriptor[]>(() =>
  props.materialTree.map((root) => ({
    itemId: root.itemId,
    name: root.name,
    icon: root.icon,
    amount: root.amount,
    isCraftable: !!(root.recipeId && root.children && root.children.length > 0),
    isTarget: true,
  })),
)

const materialRows = computed<RowDescriptor[]>(() => {
  const out: RowDescriptor[] = []
  const seen = new Set<number>()
  for (const m of props.materials) {
    if (m.itemId < CRYSTAL_THRESHOLD) continue
    if (targetSet.value.has(m.itemId)) continue
    if (seen.has(m.itemId)) continue
    seen.add(m.itemId)
    out.push({
      itemId: m.itemId,
      name: m.name,
      icon: m.icon,
      amount: m.totalAmount,
      isCraftable: bom.isCraftableInTree(m.itemId),
      isTarget: false,
    })
  }
  // Sort: craftable first (so users see decision rows together), then raw
  return out.sort((a, b) => Number(b.isCraftable) - Number(a.isCraftable))
})

interface CrystalSummary {
  itemId: number
  name: string
  amount: number
}

const crystalRollup = computed<CrystalSummary[]>(() => {
  const map = new Map<number, CrystalSummary>()
  for (const m of props.materials) {
    if (m.itemId >= CRYSTAL_THRESHOLD) continue
    const existing = map.get(m.itemId)
    if (existing) {
      existing.amount += m.totalAmount
    } else {
      map.set(m.itemId, { itemId: m.itemId, name: m.name, amount: m.totalAmount })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.itemId - b.itemId)
})

function getNodeForRow(itemId: number): MaterialNode | null {
  return bom.findNode(itemId)
}

/**
 * <900px: drill content moves to a bottom sheet so it isn't crammed inline
 * on a phone-width row. The sheet shows whichever expanded craftable item
 * is most recent; closing it folds that item back up.
 */
const isCockpitMobile = useMediaQuery('(max-width: 900px)')

const drillTargetItemId = computed<number | null>(() => {
  if (!isCockpitMobile.value) return null
  // expandedRows is iteration-ordered (Set keeps insertion order); the
  // last entry that's still in 'craft' mode wins.
  let chosen: number | null = null
  for (const id of bom.expandedRows) {
    const node = bom.findNode(id)
    if (node?.recipeId && node.children?.length && !node.collapsed) chosen = id
  }
  return chosen
})

const drillNode = computed<MaterialNode | null>(() =>
  drillTargetItemId.value !== null ? bom.findNode(drillTargetItemId.value) : null,
)

const drillDrawerOpen = computed<boolean>({
  get: () => drillTargetItemId.value !== null,
  set: (v) => {
    if (!v && drillTargetItemId.value !== null) {
      bom.toggleRowExpanded(drillTargetItemId.value)
    }
  },
})

// ---------------------------------------------------------------------------
// ZoneMapSheet — local bottom-sheet for BomAcquisitionDetail map links.
// Phones open a ZoneMapSheet inline here; the sheet is lightweight and there
// is no conflict with the craft drill-sheet because npc/gather rows are
// never in craft mode simultaneously.
// ---------------------------------------------------------------------------

const mapSheetOpen = ref(false)
const mapSheetZoneId = ref<number | null>(null)
const mapSheetCoords = ref<{ x: number; y: number } | null>(null)

function onOpenMapSheet(zoneId: number, coords: { x: number; y: number }) {
  mapSheetZoneId.value = zoneId
  mapSheetCoords.value = coords
  mapSheetOpen.value = true
}

// Single shared aria-live region for the table — selectMode in any row
// emits announce-expand here, so SR users get one well-defined queue
// instead of one per row.
const announcement = ref('')
function onAnnounceExpand(detail: { modeLabel: string; itemName: string }) {
  announcement.value = `已切換為${detail.modeLabel}，已展開${detail.itemName}詳細`
}
</script>

<template>
  <section class="bom-decision-table" aria-label="素材取得決策表">
    <div class="bdt-columns">

    <div v-if="targetRows.length > 0" class="bdt-group bdt-group--targets">
      <div class="bdt-group__header">
        <span class="bdt-group__title">完成品</span>
        <span class="bdt-group__hint">
          <template v-if="bom.targetDefaultMode === 'craft'">
            這些是你要做出來的東西，自製是預設選擇
          </template>
          <template v-else-if="settings.crossServer">
            直購：自動挑同 DC 最便宜的伺服器
          </template>
          <template v-else>
            直購：使用本服市場價
          </template>
        </span>
      </div>
      <div class="bdt-head">
        <div class="bdt-head__col bdt-head__col--icon" />
        <div class="bdt-head__col bdt-head__col--name">物品</div>
        <div class="bdt-head__col bdt-head__col--qty">數量</div>
        <div class="bdt-head__col bdt-head__col--filler" />
        <div class="bdt-head__col bdt-head__col--seg">方式</div>
        <div class="bdt-head__col bdt-head__col--unit">單價</div>
        <div class="bdt-head__col bdt-head__col--total">小計</div>
        <div class="bdt-head__col bdt-head__col--chev" />
      </div>
      <template v-for="row in targetRows" :key="`t-${row.itemId}`">
        <BomDecisionRow
          :item-id="row.itemId"
          :name="row.name"
          :icon="row.icon"
          :amount="row.amount"
          :is-craftable="row.isCraftable"
          :immutable="false"
          @announce-expand="onAnnounceExpand"
        />
        <!-- Targets get the same drill content as material rows: craft tree
             when crafting, vendor/location detail for NPC/gather, cross-DC
             price table for market. -->
        <template v-if="!isCockpitMobile && bom.isRowExpanded(row.itemId)">
          <div
            v-if="bom.getEffectiveMode(row.itemId) === 'craft' && row.isCraftable"
            class="bdt-drill"
          >
            <BomCraftTreeNode
              v-if="getNodeForRow(row.itemId)"
              :parent="getNodeForRow(row.itemId)!"
            />
          </div>
          <div
            v-else-if="bom.getEffectiveMode(row.itemId) === 'npc' || bom.getEffectiveMode(row.itemId) === 'gather'"
            class="bdt-drill bdt-drill--acquisition"
          >
            <BomAcquisitionDetail
              :item-id="row.itemId"
              :mode="bom.getEffectiveMode(row.itemId) as 'npc' | 'gather'"
              @open-map-sheet="onOpenMapSheet"
            />
          </div>
          <div
            v-else-if="bom.getEffectiveMode(row.itemId) === 'market'"
            class="bdt-drill bdt-drill--acquisition"
          >
            <BomMarketDetail :item-id="row.itemId" :item-name="row.name" />
          </div>
        </template>
      </template>
    </div>

    <div v-if="materialRows.length > 0" class="bdt-group bdt-group--materials">
      <div class="bdt-group__header">
        <span class="bdt-group__title">材料</span>
        <span class="bdt-group__hint">逐筆挑選取得方式，總價會即時更新</span>
      </div>
      <div class="bdt-head">
        <div class="bdt-head__col bdt-head__col--icon" />
        <div class="bdt-head__col bdt-head__col--name">物品</div>
        <div class="bdt-head__col bdt-head__col--qty">數量</div>
        <div class="bdt-head__col bdt-head__col--filler" />
        <div class="bdt-head__col bdt-head__col--seg">方式</div>
        <div class="bdt-head__col bdt-head__col--unit">單價</div>
        <div class="bdt-head__col bdt-head__col--total">小計</div>
        <div class="bdt-head__col bdt-head__col--chev" />
      </div>
      <template v-for="row in materialRows" :key="`m-${row.itemId}`">
        <BomDecisionRow
          :item-id="row.itemId"
          :name="row.name"
          :icon="row.icon"
          :amount="row.amount"
          :is-craftable="row.isCraftable"
          @announce-expand="onAnnounceExpand"
        />
        <template v-if="!isCockpitMobile && bom.isRowExpanded(row.itemId)">
          <div
            v-if="bom.getEffectiveMode(row.itemId) === 'craft' && row.isCraftable"
            class="bdt-drill"
          >
            <BomCraftTreeNode
              v-if="getNodeForRow(row.itemId)"
              :parent="getNodeForRow(row.itemId)!"
            />
          </div>
          <div
            v-else-if="bom.getEffectiveMode(row.itemId) === 'npc' || bom.getEffectiveMode(row.itemId) === 'gather'"
            class="bdt-drill bdt-drill--acquisition"
          >
            <BomAcquisitionDetail
              :item-id="row.itemId"
              :mode="bom.getEffectiveMode(row.itemId) as 'npc' | 'gather'"
              @open-map-sheet="onOpenMapSheet"
            />
          </div>
          <div
            v-else-if="bom.getEffectiveMode(row.itemId) === 'market'"
            class="bdt-drill bdt-drill--acquisition"
          >
            <BomMarketDetail :item-id="row.itemId" :item-name="row.name" />
          </div>
        </template>
      </template>
    </div>

    </div><!-- /.bdt-columns -->

    <div v-if="crystalRollup.length > 0" class="bdt-crystals">
      <span class="bdt-crystals__label">水晶</span>
      <ul class="bdt-crystals__list">
        <li v-for="c in crystalRollup" :key="c.itemId">
          <ItemName :item-id="c.itemId" :fallback="c.name" />
          <span class="bdt-crystals__qty">×{{ c.amount }}</span>
        </li>
      </ul>
    </div>

    <p v-if="targetRows.length === 0 && materialRows.length === 0" class="bdt-empty">
      尚未計算 — 從左側加入目標後按「計算材料需求」
    </p>

    <span class="bdt-sr-only" role="status" aria-live="polite">{{ announcement }}</span>
  </section>

  <ZoneMapSheet
    v-model="mapSheetOpen"
    :zone-id="mapSheetZoneId"
    :highlight-coords="mapSheetCoords ?? undefined"
  />

  <el-drawer
    v-if="isCockpitMobile"
    v-model="drillDrawerOpen"
    direction="btt"
    size="auto"
    :with-header="false"
    :modal="true"
    :close-on-press-escape="true"
    :close-on-click-modal="true"
    :append-to-body="true"
    class="bdt-drill-sheet"
  >
    <div class="bdt-drill-sheet__handle" aria-hidden="true" />
    <div v-if="drillNode" class="bdt-drill-sheet__body">
      <span class="bdt-drill-sheet__name">{{ drillNode.name }}</span>
      <BomCraftTreeNode :parent="drillNode" />
    </div>
  </el-drawer>
</template>

<style scoped>
.bom-decision-table {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* No outer card border — each group is its own card now (see .bdt-group
   * below). The crystals roll-up sits below as its own slim card. */
  background: transparent;
  container-type: inline-size;
}

/* Per-group column labels. Lives inside each .bdt-group card, just under
 * the section heading. Not sticky any more — each card has its own
 * scroll/page-flow context, and the right-column sticky stack already
 * covers totals + tabs + toolbar so the user keeps wayfinding. */
.bdt-head {
  display: grid;
  grid-template-columns:
    28px
    minmax(0, 320px)
    44px
    minmax(0, 1fr)
    260px
    96px
    104px
    24px;
  align-items: center;
  gap: 12px;
  padding: 6px 14px 8px;
  background: var(--app-surface-2);
  border-bottom: 1px solid var(--app-border);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

/* Column-label text alignment mirrors the row data underneath:
 *   數量 left-aligned (.dec-row__qty defaults to start)
 *   單價 / 小計 right-aligned (.dec-row__unit / __total are right)
 *   方式 centered (.dec-row__locked / __seg are center-justified) */
.bdt-head__col--qty {
  text-align: left;
}

.bdt-head__col--unit,
.bdt-head__col--total {
  text-align: right;
}

.bdt-head__col--seg {
  text-align: center;
}

/* When each row stacks (≤720px container), the column labels stop matching
 * the data grid — the labels would imply a single-row layout that the
 * stacked rows no longer follow. Hide them. */
@container (max-width: 720px) {
  .bdt-head {
    display: none;
  }
}

.bdt-columns {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Each group reads as a flat editorial section: title eyebrow + list
 * of rows, no card chrome. Dropping the outer border / radius / bg
 * solves the "card-in-card" tell — the receipt above is already the
 * page's one summary card; stacking another card layer below it pushed
 * the visual into nested-cards territory.
 *
 * `container-type: inline-size` is critical: the row's stacked layout
 * (`@container (max-width: 720px)` in BomDecisionRow.vue) triggers off
 * the nearest container ancestor's width. Without this, the row queries
 * .bom-decision-table (1100+) and stays in the 8-column horizontal
 * layout even at 540px per group, which collapses the name column to 0. */
.bdt-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
  container-type: inline-size;
}

/* Wide viewports: split 完成品 + 材料 into two side-by-side cards so
 * neither is hidden below a long scroll. The crystals roll-up stays
 * full-width below. */
@container (min-width: 1100px) {
  .bdt-columns {
    flex-direction: row;
    align-items: flex-start;
    gap: 16px;
  }
  .bdt-columns > .bdt-group {
    flex: 1;
    min-width: 0;
  }
}

.bdt-group__header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 4px 4px 12px;
  border-bottom: 1px solid var(--app-border);
  margin-bottom: 0;
}

.bdt-group__title {
  font-family: 'Noto Serif TC', serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: 0.02em;
}

.bdt-group__hint {
  font-size: 12px;
  color: var(--app-text-muted);
}

.bdt-drill {
  background: color-mix(in srgb, var(--app-craft-dim) 8%, var(--app-bg));
  border-bottom: 1px solid var(--app-border);
}

.bdt-drill--acquisition {
  /* Acquisition detail has its own internal padding; keep the outer shell
   * neutral so BomAcquisitionDetail's dashed top border reads cleanly. */
  background: var(--app-surface);
}

.bdt-crystals {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  padding: 14px 4px 4px;
  border-top: 1px solid var(--app-border);
}

.bdt-crystals__label {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--app-text-muted);
  align-self: center;
}

.bdt-crystals__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}

.bdt-crystals__list li {
  font-size: 12.5px;
  color: var(--app-text);
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.bdt-crystals__qty {
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--app-text-muted);
  font-size: 12px;
}

.bdt-empty {
  padding: 32px 14px;
  text-align: center;
  color: var(--app-text-muted);
  font-size: 13.5px;
}

.bdt-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@container (max-width: 720px) {
  .bdt-head {
    display: none;
  }
  .bdt-group__header {
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
  }
}
</style>

<style>
/* Drawer is teleported to body via :append-to-body, so its styles can't be
 * scoped — declare globally with a class hook instead. */
.bdt-drill-sheet.el-drawer {
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  max-height: 80vh;
}

.bdt-drill-sheet .el-drawer__body {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
}

.bdt-drill-sheet__handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--app-border);
  margin: 8px auto 4px;
}

.bdt-drill-sheet__body {
  padding: 6px 0 18px;
  overflow-y: auto;
}

.bdt-drill-sheet__name {
  display: block;
  font-family: 'Noto Serif TC', serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text);
  padding: 6px 16px 8px;
}
</style>
