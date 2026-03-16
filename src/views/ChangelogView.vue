<script setup lang="ts">
const changelog = [
  {
    version: 'v1.7.0',
    highlights: [
      '採購清單材料可展開查看跨服價格比較',
      '點擊素材行複製品名',
      '跨服購買合計顯示不跨服對比價與省錢百分比',
      '批量計算快取跨服價格，展開時零 API 呼叫',
      '市場查價頁面改用共用跨服比價組件',
    ],
  },
  {
    version: 'v1.6.0',
    highlights: [
      '批量製作功能：多配方一次計算最佳採購清單',
      '跨服採購：自動找出各素材最便宜的伺服器',
      '整組購買最佳化：考慮 listing 數量找最划算組合',
      '製作待辦清單：含巨集快速複製按鈕',
      '細粒度進度條：顯示每個 solver 的求解百分比',
      '例外處理：等級不足 / 無法雙滿可選跳過或購買',
      '響應式 layout：寬螢幕左右分欄，窄螢幕上下堆疊',
    ],
  },
  {
    version: 'v1.5.0',
    highlights: [
      '統一使用 raphael-rs WASM 模擬引擎',
      '移除舊版 TypeScript 模擬函式',
      'WASM simulate / simulate_detail 介面',
    ],
  },
  {
    version: 'v1.4.0',
    highlights: [
      '材料清單加入製作價格樹（買 vs 自製比較）',
      '最優成本計算：自動判斷每個半成品該買還是該做',
      'BomCraftTree 視覺化製作路徑組件',
    ],
  },
  {
    version: 'v1.3.0',
    highlights: [
      '求解結果跨分頁保持',
      '材料清單整合 solver 結果',
    ],
  },
  {
    version: 'v1.2.0',
    highlights: [
      '整合 raphael-rs WASM 最佳求解器',
      'HQ 材料最佳化推薦',
      '製作建議組件（雙滿 / 品質不足場景）',
    ],
  },
  {
    version: 'v1.1.0',
    highlights: [
      '改進 solver 策略（WasteNotII + PreparatoryTouch）',
      '材料清單分列 NQ/HQ 最低價',
    ],
  },
  {
    version: 'v1.0.0',
    highlights: [
      '手機 RWD 響應式 layout',
      '每個配方獨立模擬器狀態',
    ],
  },
  {
    version: 'v0.7.0',
    highlights: [
      '模擬器完整分頁：初始品質、食物/藥水、技能開關、專家水晶',
      '進度 / 品質條移至分頁上方',
      'HQ/NQ 材料區分與等級權重初始品質公式',
    ],
  },
  {
    version: 'v0.1.0',
    highlights: [
      '初版上線：配裝管理、配方搜尋、製作模擬、材料清單、市場查價',
      '遞迴子配方展開',
      '暗色主題 UI',
      'GitHub Pages 部署',
    ],
  },
]
</script>

<template>
  <div class="changelog-view">
    <h2>更新日誌</h2>
    <p class="view-desc">各版本的功能更新與修正紀錄。</p>

    <el-timeline>
      <el-timeline-item
        v-for="entry in changelog"
        :key="entry.version"
        :timestamp="entry.version"
        placement="top"
        :type="entry.version.startsWith('v1.7') ? 'primary' : ''"
        :hollow="!entry.version.startsWith('v1.7')"
      >
        <ul class="changelog-list">
          <li v-for="(item, i) in entry.highlights" :key="i">{{ item }}</li>
        </ul>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<style scoped>
.changelog-view {
  padding: 28px 32px;
  max-width: 720px;
}

.changelog-list {
  margin: 0;
  padding-left: 20px;
  line-height: 1.8;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

@media (max-width: 768px) {
  .changelog-view {
    padding: 60px 16px 16px;
  }
}
</style>
