<script setup lang="ts">
const changelog = [
  {
    version: 'v1.7.13',
    date: '2026-03-21',
    highlights: [
      '新增食物/藥水推薦功能：批量製作未選食藥時，自動評估食藥組合是否能取代 HQ 材料以節省成本',
      '推薦演算法使用模擬預篩 + solver 驗證，智慧過濾無效組合，僅在有效果且省錢時顯示「省錢小提示」卡片',
      '進度條改善：新增「正在查詢市場價格」「正在評估食藥組合」「正在整理採購清單」等細粒度狀態顯示',
      '修正進度條在求解完成後跳到一半就消失的問題：調整各階段權重，確保進度條跑到 99% 才結束',
    ],
  },
  {
    version: 'v1.7.12',
    date: '2026-03-21',
    highlights: [
      '修正食物/藥水資料全部錯誤的嚴重 bug：作業/加工精度搞反、百分比和上限值不正確，導致求解器產出在遊戲中無法完成的巨集',
      '移除非製作食物（懸掛番茄沙拉、蔬菜湯）——這些是戰鬥食物，不應出現在製作模擬器中',
      'NQ 食藥資料改為精確值（不再用 HQ 減半近似），來源為 Garland Tools + raphael-rs 遊戲數據',
      '修正精密製作技能描述：Lv.94 後進展效率為 150%（原誤標為 100%）',
      '更新 raphael-rs WASM 至最新版本 (47c4ea77)',
    ],
  },
  {
    version: 'v1.7.11',
    date: '2026-03-20',
    highlights: [
      '批量製作流程：已完成的步驟區塊（準備清單、採購材料）自動折疊，顯示 ✓ 與摘要，點擊可展開',
      '批量待辦清單：已完成的製作項目收進折疊區塊，保持視野清爽',
      '修正折疊區塊與上方元素間距過窄的問題',
      '修正 RefinedTouch 中文技能名稱錯誤：「精密加工」→「精煉加工」，修復巨集執行時技能被跳過的問題',
    ],
  },
  {
    version: 'v1.7.8',
    date: '2026-03-19',
    highlights: [
      'OCR 前處理新增飽和度過濾：移除彩色物品圖示干擾，提升辨識精度',
      '修正模糊配對偏好較短候選的問題，同長度物品不再被錯誤跳過',
      '分數接近時顯示「請選擇」讓用戶手動確認，避免靜默配錯',
      'OCR 匯入對話框加寬、截圖預覽放大，搜尋結果按相關度排序並顯示更多候選',
    ],
  },
  {
    version: 'v1.7.7',
    date: '2026-03-19',
    highlights: [
      '修正 OCR 無法辨識含 HQ 圖示的籌備任務截圖：改用結構化分段解析取代脆弱的 0/60 正則',
      '新增純物品列表截圖支援：無 section header 或數量欄的截圖也能正確辨識',
      '圖片前處理改用 Otsu 自適應閾值，適應不同 UI 配色方案',
    ],
  },
  {
    version: 'v1.7.6',
    date: '2026-03-18',
    highlights: [
      '新增 OCR 截圖匯入：在批量清單貼上軍需品截圖，自動辨識物品名稱並配對配方',
      '批量待辦清單顯示 HQ 素材提示：標示每個配方需要的 HQ 材料及數量',
      '修正模擬器未計入 HQ 素材初期品質的問題：設定 HQ 素材後品質條正確顯示滿值',
      'OCR 匯入對話框圖示改為 SVG，統一全站 icon 風格',
    ],
  },
  {
    version: 'v1.7.5',
    date: '2026-03-17',
    highlights: [
      '批量製作清單右上角新增「全部清除」按鈕，一鍵重置所有配方與計算結果',
      '全部清除加入二次確認彈窗，防止誤觸',
      '批量清單不再跨頁面重新整理持久化，重新整理後自動歸零',
      '提取跨服最低價搜尋為共用函式，消除重複程式碼',
      '修正遞迴 BOM 查價在跨服模式下僅查單一伺服器的問題',
    ],
  },
  {
    version: 'v1.7.4',
    date: '2026-03-17',
    highlights: [
      '批量製作新增「直購成品 vs 自製」自動比價：直購較便宜時自動放入採購清單',
      '直購成品在採購清單中標記「直購成品」徽章，並顯示自製成本與節省金額',
      '採購清單頂部摘要：N 件配方改為直購，共省 X Gil',
      '素材與成品價格合併為單次 API 查詢，零額外請求',
    ],
  },
  {
    version: 'v1.7.3',
    date: '2026-03-16',
    highlights: [
      '材料樹狀圖合併至製作價格樹：節點可直接切換製作/購買、加入模擬佇列',
      '水晶統整至卡片 header，不再佔據樹狀分支',
      '切換製作/購買不再重新打 API，純本地即時反應',
      '移除獨立材料樹狀圖元件，簡化 UI',
    ],
  },
  {
    version: 'v1.7.2',
    date: '2026-03-16',
    highlights: [
      '新增 deploy-verify agent：推送 tag 後自動監控部署並截圖驗證 production',
      '新增 PostToolUse hook：偵測 tag push 後自動觸發部署驗證流程',
    ],
  },
  {
    version: 'v1.7.1',
    date: '2026-03-16',
    highlights: [
      '全站 UI/UX 改善：統一設計規範與視覺一致性',
      '採購清單：購買合計強調框、伺服器群組標頭美化、複製閃爍回饋',
      '批量製作：按鈕載入狀態、計算前空狀態提示、待辦進度條',
      '全站數字輸入框統一為 +/- 按鈕樣式',
      '新增全域 CSS 設計規範：spacing 變數、section-title、code-block',
      '新增 prefers-reduced-motion 支援',
      '配方頁面高度修正，改善手機版佈局',
      '市場查價頁面新增空狀態提示',
    ],
  },
  {
    version: 'v1.7.0',
    date: '2026-03-16',
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
    date: '2026-03-16',
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
    date: '2026-03-15',
    highlights: [
      '統一使用 raphael-rs WASM 模擬引擎',
      '移除舊版 TypeScript 模擬函式',
      'WASM simulate / simulate_detail 介面',
    ],
  },
  {
    version: 'v1.4.0',
    date: '2026-03-08',
    highlights: [
      '材料清單加入製作價格樹（買 vs 自製比較）',
      '最優成本計算：自動判斷每個半成品該買還是該做',
      'BomCraftTree 視覺化製作路徑組件',
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026-03-08',
    highlights: [
      '求解結果跨分頁保持',
      '材料清單整合 solver 結果',
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026-03-08',
    highlights: [
      '整合 raphael-rs WASM 最佳求解器',
      'HQ 材料最佳化推薦',
      '製作建議組件（雙滿 / 品質不足場景）',
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026-03-07',
    highlights: [
      '改進 solver 策略（WasteNotII + PreparatoryTouch）',
      '材料清單分列 NQ/HQ 最低價',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-03-07',
    highlights: [
      '手機 RWD 響應式 layout',
      '每個配方獨立模擬器狀態',
    ],
  },
  {
    version: 'v0.7.0',
    date: '2026-03-06',
    highlights: [
      '模擬器完整分頁：初始品質、食物/藥水、技能開關、專家水晶',
      '進度 / 品質條移至分頁上方',
      'HQ/NQ 材料區分與等級權重初始品質公式',
    ],
  },
  {
    version: 'v0.1.0',
    date: '2026-03-06',
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
        :timestamp="`${entry.version}  —  ${entry.date}`"
        placement="top"
        :type="entry.version === changelog[0].version ? 'primary' : ''"
        :hollow="entry.version !== changelog[0].version"
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
