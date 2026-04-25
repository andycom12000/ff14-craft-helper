<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useIsMobile } from '@/composables/useMediaQuery'

type Tag = 'MAJOR' | 'MINOR' | 'PATCH'

interface Entry {
  version: string
  date: string // YYYY-MM-DD
  codename?: string
  highlights: string[]
}

interface Highlight {
  category: string | null
  text: string
}

const changelog: Entry[] = [
  {
    version: 'v2.2.1',
    date: '2026-04-25',
    highlights: [
      '【批量製作取消修復】先前在 solver 計算中按「取消」沒反應、會一直卡在計算中；現在會立即終止 worker，UI 也會回到未計算狀態並顯示「已取消計算」',
      '【批量完工流程】TodoList 全部勾完後會出現「🎉 全部完工！要不要開始下一批？」慶祝卡片，內含「✨ 開始新批次」CTA',
      '【批量再開新一輪】移除原本誤導的「全部重設」（其實只是 uncheck），改為「✨ 開始新批次」：popconfirm 確認後重設整份批次並自動捲回 step 1',
      '【FlowBreadcrumb 新批次入口】流程列尾端新增「⟳ 新批次」按鈕（僅在已有計算結果時顯示），手機版 sticky toolbar 也可隨時觸發，不需再滑回頁首展開清單',
    ],
  },
  {
    version: 'v2.2.0',
    date: '2026-04-25',
    codename: 'Pocket Artisan',
    highlights: [
      '【Mobile UX 大改】所有頁面手機版全面重新設計：固定頂部 app bar（漢堡選單、頁面標題、teleport 工具 slot），內容區 section 扁平化，取代 nested el-card 為 divider list，觸控目標全面 44px+',
      '【配裝頁手機版】改為 accordion 收合各職業，「批次調整」從桌面版折疊面板改為底部抽屜',
      '【模擬器手機版】重設計為 flat sections，技能選擇改用 bottom sheet，tabs 置中、長技能名自動換行',
      '【批量製作手機版】step breadcrumb 改 compact 圖示列、section 改 stepper style + 扁平化，採購材料改 divider list card，伺服器 header 扁平化',
      '【購物清單（BOM）手機版】製作目標改單行 row（icon + 名稱 + 步進器 + 刪除 icon），材料總覽改 card list 可展開跨伺服器價格；手機版隱藏樹狀 tab 只保留材料總覽',
      '【樹狀圖 compact 重設計】參考 FFXIV_Market（beherw）的做法，tree 節點縮成 104px card（icon + qty + 名稱 + 小價格），overflow 時橫向捲動作 fallback',
      '【跨伺服器價格對齊】CrossWorldPriceDetail 改用 CSS Subgrid，NQ / HQ / 更新時間欄位跨 row 對齊，不再受時間字數（剛剛／3 天前）或價格位數影響',
      '【導覽調整】Dashboard 與購物清單頁移除重複的 FlowBreadcrumb；router 每個路由補 meta.title 讓 app bar 顯示對的標題',
      '【build 最佳化】element-plus 獨立 manual chunk、`unplugin-auto-import` + `unplugin-vue-components`，減小主 bundle 與樣板 import',
      '【內部】新增 `useMediaQuery` / `useIsMobile` composable 統一 responsive 斷點，centralize `MOBILE_BREAKPOINT` 常數',
    ],
  },
  {
    version: 'v2.1.0',
    date: '2026-04-23',
    codename: 'Warm Welcome',
    highlights: [
      '【首次使用引導】首頁新增「歡迎設定」兩步驟引導（語言 → 伺服器），完成後自動收合；以頁面內面板取代干擾性彈窗',
      '【側欄語言切換】語言切換從設定頁移至側欄底部 pill group，點擊即切，巨集文字會跟著重算為對應語言（四語言：繁中／简中／EN／JA）',
      '【配裝一鍵套用】配裝頁頂部新增可收合的「批次調整」面板，只填想覆寫的欄位即可一鍵套用到全部 8 職',
      '【模擬器 BestCraft 風格手動模式】新增 Solver / Manual 切換：手動模式下點擊技能即時推進狀態、可 Undo/Redo（Ctrl+Z / Ctrl+Shift+Z）、可手動切換製作條件（normal / good / excellent / poor）',
      '【模擬器技能圖示預備】技能面板與序列改為圖示優先、文字 fallback 的顯示（待後續補上圖示 ID 後自動顯示 XIVAPI 圖示）；「專家」標籤從技能描述中移除',
      '【購物清單大修】選單「製作清單」更名為「購物清單」；樹狀展開 padding 統一；右側價格面板改 flex 佈局不再跑版；`—` 取代空資料的 `0 Gil` 顯示（hover 顯示「這個市場沒有這項的擺賣資料」）；所有材料可用 `✓ 已採購` 切換標記，全部勾完會跳出「辛苦了，這趟採買結束 ✨」',
      '【批量製作模式切換】新增「巨集模式 ↔ 快速購買模式」segmented control，取代原本散落的開關；快速購買模式下跳過 solver，直接比價 NQ/HQ 並支援全域 + per-material 覆蓋',
      '【批量製作 per-material 切換】被降級為購買的材料旁可「改為自製」；快速購買模式下每筆材料可獨立切 NQ/HQ',
      '【批量製作推薦伺服器】跨伺服器價格列表的綠底色改為套在「推薦購買」那列（而非永遠是 index 0 的那列）',
      '【批量製作食藥開關】新增「自動評估食藥」切換（預設開啟），內嵌食藥區塊內；關閉後可自行選擇不評估',
      '【批量製作視覺修正】總價位欄不再 sticky；每張 recipe card 右側加 padding 不再貼邊',
      '【伺服器清單轉 static】伺服器／資料中心清單改由每週 CI 預先抓 Universalis 並 commit 到 `public/data/worlds.json`，減少對 Universalis live API 的啟動依賴；設定頁新增「從 API 更新」按鈕，供使用者在新伺服器上線尚未進資料前手動觸發即時更新',
      '【設定頁微調】價格顯示預設從 NQ 改為「NQ／HQ 取低者」；作者名改為「菸齡 (andycom12000)」；新增特別感謝 section 列出 BE4R、哎低、永恆詩歌、o12ld',
      '【0 Gil bug 修正】購物清單樹中，原本查無市場資料的節點會顯示為 0 Gil 並錯誤地被推薦為「購買」，現在會傳遞 null 到 cost 計算鏈路並以 `—` 呈現，優化邏輯改為「未知價格 → 建議自製」',
      '【批量 per-material NQ/HQ 切換修復】快速購買模式下，點擊單一材料的 NQ/HQ pill 會把整個展開狀態一起丟掉、讓剛點的 toggle 看似沒生效；加上穩定的 row-key 後展開狀態保留，切換只影響當筆',
      '【zh-TW 名稱修正】datamining 上游有部分防具名稱與台服客戶端不符（例如 41861 顯示為「雪木棉禦敵打底褲」但遊戲內是「雪木棉禦敵下身」）；新增 `zh-TW-overrides.json` 覆寫表，一次修正 80 筆下身類防具（`打底褲` → `下身`），未來可擴充',
      '【觸控／視覺微調】mobile 斷點下所有 pill / chip / 切換按鈕觸控區加大至 40px；craft condition 與 success 綠相關色彩改用 CSS variable tokens；BOM 節點圖示改為 lazy-load',
    ],
  },
  {
    version: 'v2.0.0',
    date: '2026-04-23',
    codename: 'Offline Codex',
    highlights: [
      '【架構重大更新】遊戲資料（配方、道具、素材名稱、RLT）全面改為 repo 內建 JSON，不再向 XIVAPI / Garland Tools 等外部服務即時查詢',
      '【多語言支援】配方與道具名稱首次支援四語言切換：繁體中文（預設）、簡體中文、English、日本語；可於設定頁即時切換，localStorage 記住偏好；UI 介面暫仍以繁中呈現',
      '繁體中文資料原先透過 tnze.yyyy.games 私人後端取得，現改為以公開的 harukaxxxx/ffxiv-datamining-tw datamining 儲存庫為來源，授權來源清楚、穩定度與可追溯性大幅提升；其餘語言則取自 thewakingsands/ffxiv-datamining-cn（簡中）與 xivapi/ffxiv-datamining（英／日）',
      '【全球伺服器支援】遊戲資料改為語言中立的結構後，Universalis 所涵蓋的全部資料中心與伺服器皆可使用：不論 Mana／Materia（JP）、Aether／Primal／Crystal／Dynamis（NA）、Chaos／Light（EU）、Meteor／Elemental（OCE／JP）皆可於設定頁選取並查詢跨服價格',
      '首次載入與搜尋配方的等待大幅縮短；XIVAPI / yyyy.games 任一服務異常時 app 仍可正常使用；背景資料即使離線亦可瀏覽',
      '資料版本由 public/data/manifest.json 固定，所有使用者看到一致的遊戲資料；每週由自動化 workflow 掃描上游 datamining 源並開 PR 更新，審查後再合併上線',
      '市場價格（Universalis）與伺服器清單仍維持 API 即時查詢，不受此變更影響',
      '註：此架構變更的程式碼已於 v1.9.4 隨批量製作修正一同上線；本版本為該里程碑的正式公告',
    ],
  },
  {
    version: 'v1.9.5',
    date: '2026-04-23',
    highlights: [
      '內部維護：CI / GitHub Actions 升級至 Node 22 與最新版 action，為 Node 20 runtime 下架做準備，無使用者可見變更',
    ],
  },
  {
    version: 'v1.9.4',
    date: '2026-04-23',
    highlights: [
      '市場查價分頁暫時停用並標示「開發中」，功能整修中；跨伺服器比價仍可透過材料清單與批量製作頁面使用',
      '側邊欄順序調整：批量製作移至材料清單之前，更貼近主要製作流程',
      '新增 MIT License 與第三方授權聲明（Raphael-rs 求解器為 Apache 2.0）',
    ],
  },
  {
    version: 'v1.9.3',
    date: '2026-04-21',
    highlights: [
      '搜尋配方視窗開啟時自動聚焦輸入框，打開即可直接輸入關鍵字',
      '批量製作查價步驟新增逾時保護（20 秒）與分批進度顯示，關閉跨服時不再疑似卡死；失敗時以 toast 明確告知原因',
    ],
  },
  {
    version: 'v1.9.2',
    date: '2026-04-18',
    highlights: [
      '修正批量製作：多個自製候選共用同一原始素材時不再重複列出，所有來源合併為單列並加總數量',
      '批量製作製作序列：點擊配方名稱即可複製，操作與素材清單一致（含鍵盤無障礙與複製閃現回饋）',
    ],
  },
  {
    version: 'v1.9.1',
    date: '2026-04-18',
    highlights: [
      '修正批量製作：無法自製的 HQ 成品改為購買時不再顯示「省了無限 Gil」，改顯示「無法自製」',
      '修正批量製作：自製建議展開的原始素材會依設定查價（同伺服器 / 跨伺服器），並顯示實際伺服器來源',
      '修正批量製作：自製建議產生的水晶會併入上方水晶統整欄，不再混在採購清單中',
    ],
  },
  {
    version: 'v1.9.0',
    date: '2026-04-18',
    codename: 'Eorzean Codex',
    highlights: [
      '批量製作新增「自製建議」：系統自動評估哪些中間素材自製比購買划算，可勾選採用並自動更新購物清單與製作順序',
      '批量製作：半成品待辦會自動依相依順序排在正式配方之前，完成狀態獨立追蹤',
      '批量製作頁面大改版：修正購買合計懸浮條與底下元件視覺重疊、扁平化巢狀卡片、跨服查價改為精簡清單版面',
      '色彩系統 token 化：金色強調、水晶元素色、buff 提示色統一為設計 token，整體配色更貼近品牌紫',
      '無障礙強化：步驟標題、複製按鈕、食藥提示卡皆支援鍵盤操作與 aria 標籤，觸控目標放大至 44px',
      '截圖匯入效能優化：2x 上採樣 + 雙 PSM 融合，文字辨識更穩',
    ],
  },
  { version: 'v1.8.11', date: '2026-04-14', highlights: ['製作模擬 tab 頂部新增批量製作提示橫幅，點擊可直接跳轉至批量製作頁面'] },
  { version: 'v1.8.10', date: '2026-04-13', highlights: ['關閉配方搜尋對話框時自動清除搜尋結果，重新開啟不再殘留上次搜尋'] },
  { version: 'v1.8.9', date: '2026-04-13', highlights: ['修正求解器：工匠等級高於配方等級時，進展/品質基礎值計算錯誤，導致產生的巨集在遊戲中提早完成製作'] },
  {
    version: 'v1.8.8', date: '2026-04-05',
    highlights: [
      '配裝管理頁面重新設計：改為單欄列表佈局，8 個職業一頁可見，由上往下快速迭代',
      '配裝管理：每個輸入欄位加入 aria-label 提升無障礙體驗',
    ],
  },
  {
    version: 'v1.8.7', date: '2026-04-04',
    highlights: [
      '修正批量製作：職業等級不足或無法雙滿的配方改為購買時，採購清單現在會正確顯示該成品',
      '修正批量製作：直購成品（非半成品）時，現在會正確查詢 HQ 價格並標示為 HQ',
    ],
  },
  {
    version: 'v1.8.6', date: '2026-04-04',
    highlights: [
      '首頁新增「進行中」區塊：顯示批量製作待處理配方數、採集追蹤素材數，快速跳轉',
      '首頁新手指南改為可收合，狀態持久化，回訪使用者不再被佔用空間',
      '批量製作：6 個重複警告卡合併為可收合摘要，採購材料表直接可見',
      '全域命令面板（Ctrl+K）：支援中英文搜尋快速跳轉頁面',
      'ET/LT 時鐘新增 tooltip 說明（艾歐澤亞時間 / 本地時間）',
      '設定頁「關於」區塊改為全中文標籤（求解器、技術架構、作者、原始碼）',
      'UI 調性微調：移除浮動動畫、降低陰影和 glow，整體更專業精煉',
    ],
  },
  {
    version: 'v1.8.5', date: '2026-03-25',
    highlights: [
      '批量製作製作清單（第一步）：新增拖曳排序功能，可在計算前自由調整配方順序',
      '批量製作準備清單（第四步）：新增拖曳排序功能，可自由調整製作順序',
    ],
  },
  {
    version: 'v1.8.4', date: '2026-03-24',
    highlights: [
      '批量製作食藥推薦：新增點擊複製名稱功能，方便在遊戲內搜尋',
      '批量製作食藥推薦：顯示最低價所在的伺服器名稱',
      '批量製作食藥推薦：分別列出食物與藥水的單價明細',
    ],
  },
  {
    version: 'v1.8.3', date: '2026-03-24',
    highlights: [
      '設定頁新增「關於」區塊：顯示 App 資訊（版本號、技術棧、求解器）與作者資訊',
      'App 版本號改為從 git tag 動態注入，確保與實際發布版本一致',
    ],
  },
  {
    version: 'v1.8.2', date: '2026-03-24',
    highlights: [
      '配方搜尋內嵌化：製作模擬、材料清單、批量製作頁面均可直接搜尋配方，不再需要跳轉至獨立的配方選擇頁面',
      '統一配方搜尋元件（RecipeSearchSidebar），取代各頁面獨立的搜尋實作',
      '移除獨立的配方選擇路由，簡化導覽結構',
    ],
  },
  {
    version: 'v1.8.1', date: '2026-03-23',
    highlights: [
      '修正小地圖座標標記：使用正確的 FF14 座標轉換公式，紅旗圖示精準標示採集位置',
      '修正拖曳小地圖會收合卡片的問題',
      '修正 toggle 和關閉按鈕重疊問題',
      '搜尋面板加入獨立的職業/類型過濾（與追蹤清單 filter 分開）',
      '提醒設定改為真實時間（分鐘）而非 ET 時間',
      'UI 全面中文化：filter chips、狀態標籤、節點類型',
      '修正 XIVAPI 地圖載入：使用正確的 asset URL 格式',
    ],
  },
  {
    version: 'v1.8.0', date: '2026-03-23',
    highlights: [
      '新增「採集計時器」頁面：追蹤限時採集點（未知/傳說/刻限/隱藏），即時倒數、到點鬧鐘提醒',
      '全域 ET/LT 時鐘：側邊欄底部即時顯示艾歐澤亞時間與本地時間',
      '219 個限時採集點資料（含黃金鄉 Lv100），來源為 Garland Tools API',
      '兩段式鬧鐘提醒：可自訂提前通知時間、音效、音量，支援自訂音效上傳',
      '全域/個別鬧鐘開關：暫停全部提醒或針對個別項目靜音',
      '搜尋 + 瀏覽分類：快速找到想追蹤的採集素材',
      '互動式小地圖（桌面可拖曳/縮放）、手機靜態裁切',
      '響應式佈局：ultra-wide 雙欄 / 桌面側邊面板 / 平板 FAB / 手機全螢幕 Drawer',
      'Universalis 市場價格整合：查看各採集素材的自服最低價',
      '繁體中文物品名稱（tnze zh-TW API）+ 簡繁轉換地名',
    ],
  },
  {
    version: 'v1.7.14', date: '2026-03-22',
    highlights: [
      '修正食物推薦未涵蓋「品質因子為 0」的配方（如藥水類）：這類配方 HQ 素材無法提升品質，之前被歸類為「無法達成雙滿」後直接跳過，食物推薦看不到它們',
      '現在會自動評估食物/藥水 buff 是否能讓這些配方達成 HQ 品質，並顯示「食物推薦」卡片與可製作的配方清單',
      '修正多配方批量時食物推薦失效：原演算法要求所有配方都通過同一食物組合，改為獨立評估各配方，只要食物能讓任一無法製作的配方變為可製作就顯示推薦',
    ],
  },
  {
    version: 'v1.7.13', date: '2026-03-21',
    highlights: [
      '新增食物/藥水推薦功能：批量製作未選食藥時，自動評估食藥組合是否能取代 HQ 材料以節省成本',
      '推薦演算法使用模擬預篩 + solver 驗證，智慧過濾無效組合，僅在有效果且省錢時顯示「省錢小提示」卡片',
      '進度條改善：新增「正在查詢市場價格」「正在評估食藥組合」「正在整理採購清單」等細粒度狀態顯示',
      '修正進度條在求解完成後跳到一半就消失的問題：調整各階段權重，確保進度條跑到 99% 才結束',
    ],
  },
  {
    version: 'v1.7.12', date: '2026-03-21',
    highlights: [
      '修正食物/藥水資料全部錯誤的嚴重 bug：作業/加工精度搞反、百分比和上限值不正確，導致求解器產出在遊戲中無法完成的巨集',
      '移除非製作食物（懸掛番茄沙拉、蔬菜湯）——這些是戰鬥食物，不應出現在製作模擬器中',
      'NQ 食藥資料改為精確值（不再用 HQ 減半近似），來源為 Garland Tools + raphael-rs 遊戲數據',
      '修正精密製作技能描述：Lv.94 後進展效率為 150%（原誤標為 100%）',
      '更新 raphael-rs WASM 至最新版本 (47c4ea77)',
    ],
  },
  {
    version: 'v1.7.11', date: '2026-03-20',
    highlights: [
      '批量製作流程：已完成的步驟區塊（準備清單、採購材料）自動折疊，顯示 ✓ 與摘要，點擊可展開',
      '批量待辦清單：已完成的製作項目收進折疊區塊，保持視野清爽',
      '修正折疊區塊與上方元素間距過窄的問題',
      '修正 RefinedTouch 中文技能名稱錯誤：「精密加工」→「精煉加工」，修復巨集執行時技能被跳過的問題',
    ],
  },
  {
    version: 'v1.7.8', date: '2026-03-19',
    highlights: [
      'OCR 前處理新增飽和度過濾：移除彩色物品圖示干擾，提升辨識精度',
      '修正模糊配對偏好較短候選的問題，同長度物品不再被錯誤跳過',
      '分數接近時顯示「請選擇」讓用戶手動確認，避免靜默配錯',
      'OCR 匯入對話框加寬、截圖預覽放大，搜尋結果按相關度排序並顯示更多候選',
    ],
  },
  {
    version: 'v1.7.7', date: '2026-03-19',
    highlights: [
      '修正 OCR 無法辨識含 HQ 圖示的籌備任務截圖：改用結構化分段解析取代脆弱的 0/60 正則',
      '新增純物品列表截圖支援：無 section header 或數量欄的截圖也能正確辨識',
      '圖片前處理改用 Otsu 自適應閾值，適應不同 UI 配色方案',
    ],
  },
  {
    version: 'v1.7.6', date: '2026-03-18',
    highlights: [
      '新增 OCR 截圖匯入：在批量清單貼上軍需品截圖，自動辨識物品名稱並配對配方',
      '批量待辦清單顯示 HQ 素材提示：標示每個配方需要的 HQ 材料及數量',
      '修正模擬器未計入 HQ 素材初期品質的問題：設定 HQ 素材後品質條正確顯示滿值',
      'OCR 匯入對話框圖示改為 SVG，統一全站 icon 風格',
    ],
  },
  {
    version: 'v1.7.5', date: '2026-03-17',
    highlights: [
      '批量製作清單右上角新增「全部清除」按鈕，一鍵重置所有配方與計算結果',
      '全部清除加入二次確認彈窗，防止誤觸',
      '批量清單不再跨頁面重新整理持久化，重新整理後自動歸零',
      '提取跨服最低價搜尋為共用函式，消除重複程式碼',
      '修正遞迴 BOM 查價在跨服模式下僅查單一伺服器的問題',
    ],
  },
  {
    version: 'v1.7.4', date: '2026-03-17',
    highlights: [
      '批量製作新增「直購成品 vs 自製」自動比價：直購較便宜時自動放入採購清單',
      '直購成品在採購清單中標記「直購成品」徽章，並顯示自製成本與節省金額',
      '採購清單頂部摘要：N 件配方改為直購，共省 X Gil',
      '素材與成品價格合併為單次 API 查詢，零額外請求',
    ],
  },
  {
    version: 'v1.7.3', date: '2026-03-16',
    highlights: [
      '材料樹狀圖合併至製作價格樹：節點可直接切換製作/購買、加入模擬佇列',
      '水晶統整至卡片 header，不再佔據樹狀分支',
      '切換製作/購買不再重新打 API，純本地即時反應',
      '移除獨立材料樹狀圖元件，簡化 UI',
    ],
  },
  {
    version: 'v1.7.2', date: '2026-03-16',
    highlights: [
      '新增 deploy-verify agent：推送 tag 後自動監控部署並截圖驗證 production',
      '新增 PostToolUse hook：偵測 tag push 後自動觸發部署驗證流程',
    ],
  },
  {
    version: 'v1.7.1', date: '2026-03-16',
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
    version: 'v1.7.0', date: '2026-03-16',
    highlights: [
      '採購清單材料可展開查看跨服價格比較',
      '點擊素材行複製品名',
      '跨服購買合計顯示不跨服對比價與省錢百分比',
      '批量計算快取跨服價格，展開時零 API 呼叫',
      '市場查價頁面改用共用跨服比價組件',
    ],
  },
  {
    version: 'v1.6.0', date: '2026-03-16',
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
    version: 'v1.5.0', date: '2026-03-15',
    highlights: [
      '統一使用 raphael-rs WASM 模擬引擎',
      '移除舊版 TypeScript 模擬函式',
      'WASM simulate / simulate_detail 介面',
    ],
  },
  {
    version: 'v1.4.0', date: '2026-03-08',
    highlights: [
      '材料清單加入製作價格樹（買 vs 自製比較）',
      '最優成本計算：自動判斷每個半成品該買還是該做',
      'BomCraftTree 視覺化製作路徑組件',
    ],
  },
  {
    version: 'v1.3.0', date: '2026-03-08',
    highlights: ['求解結果跨分頁保持', '材料清單整合 solver 結果'],
  },
  {
    version: 'v1.2.0', date: '2026-03-08',
    highlights: [
      '整合 raphael-rs WASM 最佳求解器',
      'HQ 材料最佳化推薦',
      '製作建議組件（雙滿 / 品質不足場景）',
    ],
  },
  {
    version: 'v1.1.0', date: '2026-03-07',
    highlights: ['改進 solver 策略（WasteNotII + PreparatoryTouch）', '材料清單分列 NQ/HQ 最低價'],
  },
  {
    version: 'v1.0.0', date: '2026-03-07',
    codename: 'First Voyage',
    highlights: ['手機 RWD 響應式 layout', '每個配方獨立模擬器狀態'],
  },
  {
    version: 'v0.7.0', date: '2026-03-06',
    highlights: [
      '模擬器完整分頁：初始品質、食物/藥水、技能開關、專家水晶',
      '進度 / 品質條移至分頁上方',
      'HQ/NQ 材料區分與等級權重初始品質公式',
    ],
  },
  {
    version: 'v0.1.0', date: '2026-03-06',
    codename: 'Genesis',
    highlights: [
      '初版上線：配裝管理、配方搜尋、製作模擬、材料清單、市場查價',
      '遞迴子配方展開',
      '暗色主題 UI',
      'GitHub Pages 部署',
    ],
  },
]

function tagOf(version: string): Tag {
  const v = version.replace(/^v/, '').split('.').map((n) => parseInt(n, 10))
  const [, minor, patch] = v
  if (patch > 0) return 'PATCH'
  if (minor > 0) return 'MINOR'
  return 'MAJOR'
}

const TAG_LABEL: Record<Tag, string> = { MAJOR: '重大', MINOR: '更新', PATCH: '修正' }

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const HL_PREFIX = /^【([^】]+)】(.*)$/

function parseHighlight(raw: string): Highlight {
  const m = HL_PREFIX.exec(raw)
  if (!m) return { category: null, text: raw }
  return { category: m[1], text: m[2].replace(/^[：:]\s*/, '') }
}

interface Group {
  ym: string
  year: string
  mon: string
  num: string
  entries: Entry[]
}

const groups = computed<Group[]>(() => {
  const by = new Map<string, Entry[]>()
  for (const e of changelog) {
    const ym = e.date.slice(0, 7)
    if (!by.has(ym)) by.set(ym, [])
    by.get(ym)!.push(e)
  }
  return Array.from(by.entries()).map(([ym, entries]) => {
    const [year, num] = ym.split('-')
    return { ym, year, num, mon: MONTHS_EN[parseInt(num, 10) - 1], entries }
  })
})

const isMobile = useIsMobile()
const active = ref('')
const sectionRefs = ref<Record<string, HTMLElement | null>>({})
const rootEl = ref<HTMLElement | null>(null)
const expanded = ref<Set<string>>(new Set())

function setSectionRef(ym: string, el: Element | null) {
  sectionRefs.value[ym] = el as HTMLElement | null
}

function isExpanded(version: string, tag: Tag) {
  return tag !== 'PATCH' || expanded.value.has(version)
}

function togglePatch(version: string) {
  const next = new Set(expanded.value)
  if (next.has(version)) next.delete(version)
  else next.add(version)
  expanded.value = next
}

function scrollContainer(): HTMLElement | null {
  return rootEl.value?.closest('.app-main') as HTMLElement | null
    ?? (document.scrollingElement as HTMLElement | null)
}

let observer: IntersectionObserver | null = null

onMounted(async () => {
  await nextTick()
  active.value = groups.value[0]?.ym ?? ''
  const root = scrollContainer()
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) {
        const ym = (visible.target as HTMLElement).dataset.ym
        if (ym) active.value = ym
      }
    },
    { root, rootMargin: '-20% 0px -60% 0px' },
  )
  for (const el of Object.values(sectionRefs.value)) {
    if (el) observer.observe(el)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

function scrollTo(ym: string) {
  const el = sectionRefs.value[ym]
  const parent = scrollContainer()
  if (!el || !parent) return
  const offset = isMobile.value ? 124 : 24
  const top = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - offset
  parent.scrollTo({ top, behavior: 'smooth' })
}

function formatDateDots(iso: string) {
  return iso.replace(/-/g, ' · ')
}
</script>

<template>
  <div ref="rootEl" class="changelog-view">
    <!-- PageHead -->
    <header class="page-head">
      <div class="eyebrow">VIII · 更新日誌</div>
      <h1 class="page-title">更新日誌</h1>
      <p class="page-subtitle">每次版本的細節變更。</p>
    </header>

    <!-- Mobile sticky month chip strip -->
    <nav class="chip-rail" aria-label="月份快速跳轉">
      <button
        v-for="g in groups"
        :key="g.ym"
        type="button"
        class="chip"
        :class="{ 'chip--active': active === g.ym }"
        @click="scrollTo(g.ym)"
      >
        <span class="chip-mon">{{ g.mon }}</span>
        <span class="chip-yr">{{ g.year.slice(2) }}</span>
        <span class="chip-count">{{ g.entries.length }}</span>
      </button>
    </nav>

    <div class="layout">
      <!-- Left timeline rail (desktop) -->
      <nav class="rail" aria-label="時間軸導覽">
        <div class="rail-header">Timeline</div>
        <div class="rail-list">
          <span class="rail-line" aria-hidden="true" />
          <button
            v-for="g in groups"
            :key="g.ym"
            type="button"
            class="rail-item"
            :class="{ 'rail-item--active': active === g.ym }"
            @click="scrollTo(g.ym)"
          >
            <span class="rail-bar" aria-hidden="true" />
            <span class="rail-node" aria-hidden="true" />
            <span class="rail-mon">{{ g.mon }}</span>
            <span class="rail-meta">
              {{ g.year }} · {{ g.entries.length }} release{{ g.entries.length > 1 ? 's' : '' }}
            </span>
          </button>
        </div>
      </nav>

      <!-- Right content column -->
      <div class="content">
        <section
          v-for="g in groups"
          :key="g.ym"
          :ref="(el) => setSectionRef(g.ym, el as Element | null)"
          :data-ym="g.ym"
          class="month-section"
        >
          <div class="month-header">
            <h2 class="month-mon">{{ g.mon }}</h2>
            <div class="month-ym">{{ g.year }} · {{ g.num }}</div>
            <div class="month-spacer" />
            <div class="month-count">
              {{ g.entries.length }} RELEASE{{ g.entries.length > 1 ? 'S' : '' }}
            </div>
          </div>

          <div class="entries">
            <article
              v-for="e in g.entries"
              :key="e.version"
              class="panel"
              :class="[`panel--${tagOf(e.version).toLowerCase()}`, { 'panel--collapsed': !isExpanded(e.version, tagOf(e.version)) }]"
            >
              <header class="panel-header">
                <h3 class="panel-title">
                  <span class="ver">{{ e.version }}</span>
                  <span v-if="e.codename" class="codename">{{ e.codename }}</span>
                </h3>
                <span class="panel-date">{{ formatDateDots(e.date) }}</span>
                <span class="panel-spacer" />
                <span class="tag" :class="`tag--${tagOf(e.version).toLowerCase()}`">
                  {{ TAG_LABEL[tagOf(e.version)] }}
                </span>
              </header>

              <!-- PATCH summary (collapsed) -->
              <button
                v-if="tagOf(e.version) === 'PATCH' && !isExpanded(e.version, 'PATCH')"
                type="button"
                class="patch-summary"
                @click="togglePatch(e.version)"
              >
                <span class="patch-summary-text">{{ parseHighlight(e.highlights[0]).text }}</span>
                <span v-if="e.highlights.length > 1" class="patch-more">+{{ e.highlights.length - 1 }}</span>
                <svg class="patch-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <!-- Full body -->
              <div
                v-else
                class="panel-body"
                :class="{ 'panel-body--accent': tagOf(e.version) !== 'PATCH' }"
              >
                <ul class="hl-list">
                  <li v-for="(item, i) in e.highlights" :key="i" class="hl-item">
                    <template v-if="parseHighlight(item).category">
                      <span class="hl-cat">{{ parseHighlight(item).category }}</span>
                      <span class="hl-text">{{ parseHighlight(item).text }}</span>
                    </template>
                    <template v-else>
                      <span class="hl-text">{{ item }}</span>
                    </template>
                  </li>
                </ul>
                <button
                  v-if="tagOf(e.version) === 'PATCH'"
                  type="button"
                  class="patch-collapse"
                  @click="togglePatch(e.version)"
                >收合</button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Eorzean Codex palette — scoped to this view */
.changelog-view {
  /* Light theme — Eorzean Codex on parchment table */
  --parch-50: oklch(0.28 0.04 55);   /* main text on cream — dark warm brown */
  --parch-100: oklch(0.35 0.04 55);  /* slightly less prominent */
  --ink-900: oklch(0.20 0.04 55);    /* high-contrast text (on gold/etc) */
  --fg-muted: oklch(0.50 0.03 60);
  --fg-faint: oklch(0.62 0.03 60);
  --gold: oklch(0.65 0.18 65);       /* match new toast gold */
  --gold-soft: oklch(0.65 0.18 65 / .14);
  --gold-line: oklch(0.65 0.18 65 / .35);
  --lapis: oklch(0.50 0.13 70);      /* microbake — replaces blue (per rebrand spec) */
  --line: oklch(0.55 0.04 65 / .22);
  --line-strong: oklch(0.55 0.04 65 / .38);

  --display: 'Cormorant Garamond', 'Noto Serif TC', serif;
  --mono: 'JetBrains Mono', ui-monospace, monospace;

  --content-fs: clamp(14px, 0.875rem + 0.2vw, 15.5px);

  max-width: 1040px;
  margin: 0 auto;
  padding: 40px 40px 80px;
  color: var(--parch-50);
}

/* -------- Focus styles (shared) -------- */
.changelog-view :focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
  border-radius: 4px;
}

/* -------- PageHead -------- */
.page-head {
  margin-bottom: 28px;
}
.eyebrow {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .3em;
  color: var(--gold);
  text-transform: uppercase;
  margin-bottom: 10px;
}
.page-title {
  font-family: var(--display);
  font-size: clamp(28px, 6vw, 44px);
  font-weight: 500;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--parch-50);
  line-height: 1.05;
}
.page-subtitle {
  margin: 10px 0 0;
  color: var(--fg-muted);
  font-size: 14px;
  max-width: 640px;
}

/* -------- Mobile chip rail (hidden on desktop) -------- */
.chip-rail {
  display: none;
}

/* -------- Layout -------- */
.layout {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 28px;
  align-items: flex-start;
}

/* -------- Rail (desktop) -------- */
.rail {
  position: sticky;
  top: 24px;
  align-self: flex-start;
}
.rail-header {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .3em;
  color: var(--fg-faint);
  text-transform: uppercase;
  padding-left: 4px;
  margin-bottom: 16px;
}
.rail-list {
  position: relative;
  padding-left: 22px;
}
.rail-line {
  position: absolute;
  left: 7px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: linear-gradient(
    180deg,
    transparent,
    var(--line-strong) 8%,
    var(--line-strong) 92%,
    transparent
  );
}
.rail-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  padding: 10px 8px 10px 4px;
  position: relative;
  color: var(--fg-muted);
  transition: color .2s ease-out;
  font: inherit;
  border-radius: 4px;
}
.rail-bar {
  position: absolute;
  left: -16px;
  top: 12px;
  bottom: 12px;
  width: 2px;
  background: var(--gold);
  border-radius: 2px;
  opacity: 0;
  transform: scaleY(.4);
  transform-origin: center;
  transition: opacity .25s ease-out, transform .25s ease-out;
}
.rail-node {
  position: absolute;
  left: -19px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ink-900);
  border: 1px solid var(--line-strong);
  transform: translateY(-50%) scale(1);
  transition: background-color .2s ease-out, border-color .2s ease-out, transform .2s ease-out, box-shadow .2s ease-out;
}
.rail-mon {
  display: block;
  font-family: var(--display);
  font-weight: 500;
  font-size: 18px;
  letter-spacing: -.01em;
  line-height: 1;
  color: var(--fg-muted);
  transition: color .2s ease-out;
}
.rail-meta {
  display: block;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .2em;
  margin-top: 4px;
  color: var(--fg-faint);
  transition: color .2s ease-out;
}
.rail-item:hover .rail-mon { color: var(--parch-100); }
.rail-item:hover .rail-node { border-color: var(--gold-line); }

.rail-item--active .rail-bar {
  opacity: 1;
  transform: scaleY(1);
}
.rail-item--active .rail-node {
  background: var(--gold);
  border-color: var(--gold-line);
  transform: translateY(-50%) scale(1.4);
  box-shadow: 0 0 8px oklch(0.82 0.13 82 / .35);
}
.rail-item--active .rail-mon {
  color: var(--parch-50);
}
.rail-item--active .rail-meta {
  color: var(--gold);
}

/* -------- Content -------- */
.content {
  display: flex;
  flex-direction: column;
  gap: 36px;
  min-width: 0;
}

.month-section {
  scroll-margin-top: 24px;
}

.month-header {
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.month-mon {
  font-family: var(--display);
  font-weight: 500;
  font-size: 28px;
  letter-spacing: -.02em;
  color: var(--parch-50);
  margin: 0;
  line-height: 1;
}
.month-ym {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-faint);
  letter-spacing: .2em;
}
.month-spacer {
  flex: 1;
}
.month-count {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--fg-faint);
  letter-spacing: .15em;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* -------- Panel -------- */
.panel {
  background: linear-gradient(180deg, var(--app-surface), oklch(0.97 0.018 85));
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.6),
    0 4px 18px oklch(0.40 0.05 60 / 0.06);
}
.panel--patch {
  background: linear-gradient(180deg, oklch(0.97 0.020 85 / 0.55), oklch(0.95 0.025 85 / 0.55));
}
.panel-header {
  display: flex;
  align-items: baseline;
  gap: 10px 14px;
  padding: 14px 18px;
  flex-wrap: wrap;
}
.panel--collapsed .panel-header {
  border-bottom: none;
  padding-bottom: 14px;
}
.panel:not(.panel--collapsed) .panel-header {
  border-bottom: 1px solid var(--line);
}
.panel-spacer {
  flex: 1;
}
.panel-title {
  font-family: var(--display);
  font-weight: 500;
  font-size: 19px;
  line-height: 1.1;
  letter-spacing: .01em;
  color: var(--parch-50);
  margin: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.panel-title .ver { color: var(--parch-50); }
.panel-title .codename {
  color: var(--gold);
  font-style: italic;
  font-size: 0.92em;
}
.panel-title .codename::before {
  content: '·';
  margin-right: 6px;
  color: var(--fg-faint);
  font-style: normal;
}
.panel-date {
  font-size: 11.5px;
  color: var(--fg-faint);
  font-family: var(--mono);
  letter-spacing: .08em;
  white-space: nowrap;
}

/* -------- Tag chip -------- */
.tag {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: .25em;
  padding: 3px 9px;
  border: 1px solid currentColor;
  border-radius: 3px;
  opacity: .9;
  white-space: nowrap;
  flex-shrink: 0;
}
.tag--major { color: var(--gold); }
.tag--minor { color: var(--lapis); }
.tag--patch { color: var(--fg-faint); }

/* -------- PATCH summary (collapsed) -------- */
.patch-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-top: 1px dashed var(--line);
  cursor: pointer;
  padding: 12px 18px;
  color: var(--fg-muted);
  font: inherit;
  font-size: var(--content-fs);
  line-height: 1.55;
  transition: color .15s ease-out, background-color .15s ease-out;
}
.patch-summary:hover {
  color: var(--parch-100);
  background: oklch(0.40 0.04 60 /.03);
}
.patch-summary-text {
  flex: 1;
  min-width: 0;
}
.patch-more {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .1em;
  color: var(--gold);
  background: var(--gold-soft);
  border: 1px solid var(--gold-line);
  border-radius: 999px;
  padding: 1px 8px;
  flex-shrink: 0;
}
.patch-chevron {
  flex-shrink: 0;
  color: var(--fg-faint);
  transition: transform .2s ease-out;
}
.patch-summary:hover .patch-chevron {
  color: var(--gold);
}

/* -------- Panel body -------- */
.panel-body {
  padding: 4px 18px 18px;
}
.hl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hl-item {
  display: grid;
  grid-template-columns: minmax(0, auto) 1fr;
  gap: 12px;
  align-items: baseline;
  color: var(--fg-muted);
  font-size: var(--content-fs);
  line-height: 1.7;
}
.panel-body--accent .hl-item {
  color: var(--parch-100);
}
.hl-cat {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: .12em;
  color: var(--gold);
  background: var(--gold-soft);
  border: 1px solid var(--gold-line);
  border-radius: 3px;
  padding: 2px 7px;
  white-space: nowrap;
  align-self: start;
  margin-top: 2px;
  text-transform: uppercase;
}
.panel--patch .hl-cat {
  color: var(--fg-muted);
  background: oklch(0.40 0.04 60 /.04);
  border-color: var(--line-strong);
}
.hl-text {
  min-width: 0;
}
/* Items without a category get a subtle gold tick instead */
.hl-item:not(:has(.hl-cat))::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--gold);
  margin: 0 6px 0 4px;
  align-self: center;
  grid-column: 1;
}
.hl-item:not(:has(.hl-cat)) .hl-text {
  grid-column: 2;
}

.patch-collapse {
  margin-top: 12px;
  background: none;
  border: 1px solid var(--line-strong);
  color: var(--fg-faint);
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .15em;
  transition: color .15s ease-out, border-color .15s ease-out;
}
.patch-collapse:hover {
  color: var(--gold);
  border-color: var(--gold-line);
}

/* -------- Reduced motion -------- */
@media (prefers-reduced-motion: reduce) {
  .rail-item,
  .rail-bar,
  .rail-node,
  .rail-mon,
  .rail-meta,
  .patch-summary,
  .patch-chevron,
  .patch-collapse {
    transition: none !important;
  }
}

/* -------- Responsive (mobile) -------- */
@media (max-width: 900px) {
  .changelog-view {
    padding: 16px 16px 48px;
  }
  .layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .rail {
    display: none;
  }

  /* Sticky horizontal chip strip — sits right below the global mobile app bar */
  .chip-rail {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    margin: 0 -16px 16px;
    padding: 8px 16px;
    position: sticky;
    top: var(--mobile-app-bar-h, 52px);
    z-index: 10;
    background: color-mix(in srgb, var(--app-bg, #10151f) 82%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    scrollbar-width: none;
    -ms-overflow-style: none;
    border-bottom: 1px solid var(--line);
  }
  .chip-rail::-webkit-scrollbar { display: none; }

  .chip {
    flex-shrink: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 8px 12px;
    min-height: 40px;
    background: var(--app-surface);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--fg-muted);
    cursor: pointer;
    font: inherit;
    transition: color .15s ease-out, border-color .15s ease-out, background-color .15s ease-out;
  }
  .chip-mon {
    font-family: var(--display);
    font-weight: 500;
    font-size: 16px;
    letter-spacing: -.01em;
  }
  .chip-yr {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: .15em;
    color: var(--fg-faint);
  }
  .chip-count {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-faint);
    background: oklch(0.40 0.04 60 /.06);
    border-radius: 999px;
    padding: 1px 7px;
    margin-left: 2px;
  }
  .chip--active {
    color: oklch(0.99 0.01 90);
    background: var(--gold);
    border-color: var(--gold);
  }
  .chip--active .chip-mon { color: oklch(0.99 0.01 90); }
  .chip--active .chip-yr,
  .chip--active .chip-count {
    color: oklch(0.99 0.01 90);
    background: oklch(0.20 0.04 55 / 0.18);
  }

  .month-section {
    scroll-margin-top: calc(var(--mobile-app-bar-h, 52px) + 64px);
  }

  .page-title {
    font-size: 32px;
  }
  .page-subtitle {
    font-size: 13.5px;
  }

  .panel-header {
    padding: 12px 14px;
    gap: 6px 10px;
  }
  .panel-title { font-size: 17px; }
  .panel-body {
    padding: 4px 14px 16px;
  }
  .patch-summary {
    padding: 10px 14px;
  }

  /* On mobile: align category chip above text instead of inline grid */
  .hl-item {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .hl-cat { justify-self: start; }
  .hl-item:not(:has(.hl-cat))::before {
    grid-column: 1;
    margin-left: 0;
  }
  .hl-item:not(:has(.hl-cat)) .hl-text {
    grid-column: 1;
  }
}
</style>
