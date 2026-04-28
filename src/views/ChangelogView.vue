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
    version: 'v2.3.0',
    date: '2026-04-27',
    codename: 'Toast Workshop',
    highlights: [
      '【吐司工坊（Toast Workshop）正式登場】品牌全面換裝為「吐司工坊」（保留「FFXIV 製作助手」副線），主視覺改為奶油白主背景搭配多色烘焙語意（吐司金 / 可可 / 草莓醬 / 抹茶 / 藍莓），首頁、側邊欄、setup 文案與 quote 全面更新',
      '【深色模式】設定頁新增 Auto / Light / Dark 三段切換，Auto 跟隨系統偏好；Element Plus 全 component 適配，Dashboard / 模擬 / 購物清單 / 批量製作 / 採集計時器 / 更新日誌 / 設定 全頁通過深色模式檢查',
      '【批量製作升格 Tier 1】側邊欄與 Dashboard 將「批量製作」置於最前；Dashboard 改為寬螢幕 editorial layout，把批量製作做成 hero 區塊',
      '【新版引導流程】onboarding 加入可跳過的「裝備設定」第三步；進站時新手提示語句與插畫 quote 強化氛圍',
      '【視覺氛圍】首頁加入紙質 texture、empty state 與 onboarding 加入主題語句與 quote；側邊欄分層調整',
      '【內部】重整 JOB_ICONS / onboarding storage / quote 樣式為共用模組；新增 dark mode design spec、wide-viewport design brief；CLAUDE.md / README 同步更新為吐司工坊品牌',
    ],
  },
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

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

const HL_PREFIX = /^【([^】]+)】(.*)$/

function parseHighlight(raw: string): Highlight {
  const m = HL_PREFIX.exec(raw)
  if (!m) return { category: null, text: raw }
  return { category: m[1], text: m[2].replace(/^[：:]\s*/, '') }
}

// ─── Hero (latest entry) ─────────────────────────────
const heroEntry = computed(() => changelog[0])
const heroTag = computed(() => tagOf(heroEntry.value.version))
const heroDate = computed(() => formatHeroDate(heroEntry.value.date))
const heroMonthLabel = computed(() => {
  const [, m] = heroEntry.value.date.split('-')
  const idx = parseInt(m, 10) - 1
  return `${MONTHS_EN[idx]} · ${MONTHS_ZH[idx]}`
})

const HERO_PREVIEW_COUNT = 4
const heroExpanded = ref(false)
const heroVisibleHighlights = computed(() => {
  const all = heroEntry.value.highlights
  if (heroExpanded.value || all.length <= HERO_PREVIEW_COUNT) return all
  return all.slice(0, HERO_PREVIEW_COUNT)
})
const heroRemainingCount = computed(() => Math.max(0, heroEntry.value.highlights.length - HERO_PREVIEW_COUNT))

function toggleHero() {
  heroExpanded.value = !heroExpanded.value
}

// ─── Archive (everything else, by month) ─────────────
interface ArchiveGroup {
  ym: string
  year: string
  num: string
  mon: string
  monZh: string
  entries: Entry[]
}

const archiveGroups = computed<ArchiveGroup[]>(() => {
  const by = new Map<string, Entry[]>()
  for (const e of changelog.slice(1)) {
    const ym = e.date.slice(0, 7)
    if (!by.has(ym)) by.set(ym, [])
    by.get(ym)!.push(e)
  }
  return Array.from(by.entries()).map(([ym, entries]) => {
    const [year, num] = ym.split('-')
    const idx = parseInt(num, 10) - 1
    return { ym, year, num, mon: MONTHS_EN[idx], monZh: MONTHS_ZH[idx], entries }
  })
})

const expandedMonths = ref<Set<string>>(new Set())
const expandedRows = ref<Set<string>>(new Set())

function toggleMonth(ym: string) {
  const next = new Set(expandedMonths.value)
  if (next.has(ym)) next.delete(ym)
  else next.add(ym)
  expandedMonths.value = next
}

function isMonthExpanded(ym: string) {
  return expandedMonths.value.has(ym)
}

function toggleRow(version: string) {
  const next = new Set(expandedRows.value)
  if (next.has(version)) next.delete(version)
  else next.add(version)
  expandedRows.value = next
}

function isRowExpanded(version: string) {
  return expandedRows.value.has(version)
}

function summaryFor(entry: Entry): string {
  const first = parseHighlight(entry.highlights[0])
  const t = first.text
  const MAX = entry.codename ? 28 : 36
  if (t.length <= MAX) return t
  return t.slice(0, MAX - 1) + '…'
}

// ─── Stats ──────────────────────────────────────────
const totalReleases = computed(() => changelog.length)
const totalHighlights = computed(() => changelog.reduce((s, e) => s + e.highlights.length, 0))
const firstVersion = computed(() => changelog[changelog.length - 1].version)

// ─── Date formatting ────────────────────────────────
function formatHeroDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  const idx = parseInt(m, 10) - 1
  return `${MONTHS_SHORT[idx]} ${parseInt(d, 10)}, ${y}`
}

function formatLedgerDate(iso: string): string {
  const [, m, d] = iso.split('-')
  const idx = parseInt(m, 10) - 1
  return `${MONTHS_SHORT[idx]} ${parseInt(d, 10)}`
}

// ─── Scroll spy / nav ───────────────────────────────
const isMobile = useIsMobile()
const active = ref('hero')
const sectionRefs = ref<Record<string, HTMLElement | null>>({})
const rootEl = ref<HTMLElement | null>(null)

function setSectionRef(key: string, el: Element | null) {
  sectionRefs.value[key] = el as HTMLElement | null
}

function scrollContainer(): HTMLElement | null {
  return rootEl.value?.closest('.app-main') as HTMLElement | null
    ?? (document.scrollingElement as HTMLElement | null)
}

let observer: IntersectionObserver | null = null

onMounted(async () => {
  archiveGroups.value.slice(0, 2).forEach((g) => expandedMonths.value.add(g.ym))

  await nextTick()
  active.value = 'hero'
  const root = scrollContainer()
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) {
        const key = (visible.target as HTMLElement).dataset.navKey
        if (key) active.value = key
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

function scrollTo(key: string) {
  const el = sectionRefs.value[key]
  const parent = scrollContainer()
  if (!el || !parent) return
  const offset = isMobile.value ? 124 : 24
  const top = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - offset
  parent.scrollTo({ top, behavior: 'smooth' })
}

interface NavItem { key: string; label: string; sublabel: string; isHero?: boolean }

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { key: 'hero', label: '本期', sublabel: heroEntry.value.version, isHero: true },
  ]
  for (const g of archiveGroups.value) {
    items.push({
      key: g.ym,
      label: g.mon,
      sublabel: `${g.year} · ${g.entries.length}`,
    })
  }
  return items
})

// ─── Copy version feedback ──────────────────────────
const copiedVersion = ref<string | null>(null)
let copyTimer: number | undefined
async function copyVersion(v: string) {
  try {
    await navigator.clipboard.writeText(v)
    copiedVersion.value = v
    if (copyTimer) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => { copiedVersion.value = null }, 1400)
  } catch { /* noop */ }
}
</script>

<template>
  <div ref="rootEl" class="changelog-view">
    <header class="page-head">
      <div class="eyebrow">VIII · CHANGELOG</div>
      <h1 class="page-title">更新日誌</h1>
      <p class="page-stats">
        自 <span class="stats-pin">{{ firstVersion }}</span>
        起 <span class="stats-num">{{ totalReleases }}</span> 次發行 ·
        <span class="stats-num">{{ totalHighlights }}</span> 條變更
      </p>
    </header>

    <nav class="chip-rail" aria-label="月份快速跳轉">
      <button
        v-for="n in navItems"
        :key="n.key"
        type="button"
        class="chip"
        :class="{ 'chip--active': active === n.key, 'chip--hero': n.isHero }"
        @click="scrollTo(n.key)"
      >
        <span class="chip-label">{{ n.label }}</span>
        <span class="chip-sub">{{ n.sublabel }}</span>
      </button>
    </nav>

    <div class="layout">
      <nav class="rail" aria-label="時間軸導覽">
        <div class="rail-header">Edition</div>
        <div class="rail-list">
          <span class="rail-line" aria-hidden="true" />
          <button
            v-for="n in navItems"
            :key="n.key"
            type="button"
            class="rail-item"
            :class="{
              'rail-item--active': active === n.key,
              'rail-item--hero': n.isHero,
            }"
            @click="scrollTo(n.key)"
          >
            <span class="rail-bar" aria-hidden="true" />
            <span class="rail-node" aria-hidden="true" />
            <span class="rail-mon">{{ n.label }}</span>
            <span class="rail-meta">{{ n.sublabel }}</span>
          </button>
        </div>
      </nav>

      <div class="content">
        <!-- HERO -->
        <section
          class="hero"
          :ref="(el) => setSectionRef('hero', el as Element | null)"
          data-nav-key="hero"
        >
          <div class="hero-eyebrow">本　期　·　{{ heroMonthLabel }}</div>

          <div class="hero-head">
            <h2 class="hero-title">
              <button type="button" class="ver-btn" @click="copyVersion(heroEntry.version)" :aria-label="`複製版本 ${heroEntry.version}`">
                <span class="ver">{{ heroEntry.version }}</span>
                <span v-if="copiedVersion === heroEntry.version" class="ver-copied" aria-live="polite">已複製</span>
              </button>
              <span v-if="heroEntry.codename" class="codename">"{{ heroEntry.codename }}"</span>
            </h2>
            <div class="hero-meta">
              <span class="hero-date">{{ heroDate }}</span>
              <span class="hero-tag" :class="`tag--${heroTag.toLowerCase()}`">{{ TAG_LABEL[heroTag] }}</span>
            </div>
          </div>

          <div class="hero-rule" aria-hidden="true" />

          <ol class="hero-highlights">
            <li v-for="(item, i) in heroVisibleHighlights" :key="i" class="hero-hl">
              <template v-if="parseHighlight(item).category">
                <h3 class="hero-hl-cat">{{ parseHighlight(item).category }}</h3>
                <p class="hero-hl-text">{{ parseHighlight(item).text }}</p>
              </template>
              <template v-else>
                <p class="hero-hl-text hero-hl-text--lead">{{ item }}</p>
              </template>
            </li>
          </ol>

          <button
            v-if="heroEntry.highlights.length > HERO_PREVIEW_COUNT"
            type="button"
            class="hero-expand"
            @click="toggleHero"
          >
            <span v-if="!heroExpanded">還有 {{ heroRemainingCount }} 條更新 ▾</span>
            <span v-else>收合 ▴</span>
          </button>
        </section>

        <div class="archive-divider" aria-hidden="true">
          <span class="divider-label">之前的版本</span>
          <span class="divider-rule" />
        </div>

        <section
          v-for="g in archiveGroups"
          :key="g.ym"
          :ref="(el) => setSectionRef(g.ym, el as Element | null)"
          :data-nav-key="g.ym"
          class="month"
          :class="{ 'month--collapsed': !isMonthExpanded(g.ym) }"
        >
          <button
            type="button"
            class="month-head"
            :aria-expanded="isMonthExpanded(g.ym)"
            @click="toggleMonth(g.ym)"
          >
            <h3 class="month-mon">{{ g.mon }}</h3>
            <span class="month-zh">{{ g.monZh }} · {{ g.year }}</span>
            <span class="month-spacer" />
            <span class="month-count">{{ g.entries.length }} RELEASE{{ g.entries.length > 1 ? 'S' : '' }}</span>
            <svg
              class="month-chev"
              :class="{ 'is-open': isMonthExpanded(g.ym) }"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <ol v-if="isMonthExpanded(g.ym)" class="ledger">
            <li
              v-for="e in g.entries"
              :key="e.version"
              class="row"
              :class="[`row--${tagOf(e.version).toLowerCase()}`, { 'row--open': isRowExpanded(e.version) }]"
            >
              <button
                type="button"
                class="row-summary"
                :aria-expanded="isRowExpanded(e.version)"
                @click="toggleRow(e.version)"
              >
                <span class="row-dot" aria-hidden="true">{{ tagOf(e.version) === 'PATCH' ? '○' : '●' }}</span>
                <span class="row-ver">{{ e.version }}</span>
                <span class="row-date">{{ formatLedgerDate(e.date) }}</span>
                <span class="row-tail">
                  <span v-if="e.codename" class="row-codename">"{{ e.codename }}"</span>
                  <span class="row-summary-text">{{ summaryFor(e) }}</span>
                </span>
              </button>

              <div v-if="isRowExpanded(e.version)" class="row-body">
                <ul class="row-hl-list">
                  <li v-for="(item, i) in e.highlights" :key="i" class="row-hl">
                    <template v-if="parseHighlight(item).category">
                      <span class="row-hl-cat">{{ parseHighlight(item).category }}</span>
                      <span class="row-hl-sep">：</span>
                      <span class="row-hl-text">{{ parseHighlight(item).text }}</span>
                    </template>
                    <template v-else>
                      <span class="row-hl-text">{{ item }}</span>
                    </template>
                  </li>
                </ul>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.changelog-view {
  --parch-50: oklch(0.28 0.04 55);
  --parch-100: oklch(0.35 0.04 55);
  --parch-200: oklch(0.42 0.04 55);
  --ink-900: oklch(0.20 0.04 55);
  --fg-muted: oklch(0.50 0.03 60);
  --fg-faint: oklch(0.62 0.03 60);
  --gold: oklch(0.62 0.12 65);
  --gold-deep: oklch(0.55 0.14 60);
  --gold-soft: oklch(0.62 0.12 65 / .12);
  --gold-line: oklch(0.62 0.12 65 / .32);
  --lapis: oklch(0.55 0.10 50);
  --line: oklch(0.55 0.04 65 / .18);
  --line-strong: oklch(0.55 0.04 65 / .32);

  --display: 'Cormorant Garamond', 'Noto Serif TC', serif;
  --serif: 'Noto Serif TC', serif;
  --sans: 'Noto Sans TC', system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, monospace;

  --content-fs: 15px;

  max-width: 920px;
  margin: 0 auto;
  padding: 56px 40px 96px;
  color: var(--parch-50);

  background-image:
    radial-gradient(oklch(0.55 0.04 65 / 0.03) 1px, transparent 1px),
    radial-gradient(oklch(0.55 0.04 65 / 0.018) 1px, transparent 1px);
  background-size: 18px 18px, 11px 11px;
  background-position: 0 0, 6px 9px;
}

.changelog-view :focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
  border-radius: 4px;
}

/* ── Page head ── */
.page-head {
  margin-bottom: 56px;
}
.eyebrow {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .35em;
  color: var(--gold);
  text-transform: uppercase;
  margin-bottom: 14px;
}
.page-title {
  font-family: var(--display);
  font-style: italic;
  font-weight: 500;
  font-size: clamp(40px, 7vw, 64px);
  letter-spacing: -0.015em;
  margin: 0;
  color: var(--parch-50);
  line-height: 1;
}
.page-stats {
  margin: 14px 0 0;
  color: var(--fg-muted);
  font-family: var(--serif);
  font-size: 14.5px;
  font-style: italic;
}
.stats-pin {
  font-family: var(--mono);
  font-style: normal;
  color: var(--parch-100);
  letter-spacing: .04em;
}
.stats-num {
  font-family: var(--mono);
  font-style: normal;
  color: var(--gold-deep);
  font-weight: 500;
}

/* ── Layout ── */
.layout {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 36px;
  align-items: flex-start;
}

/* ── Rail ── */
.rail {
  position: sticky;
  top: 24px;
  align-self: flex-start;
}
.rail-header {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .35em;
  color: var(--fg-faint);
  text-transform: uppercase;
  padding-left: 4px;
  margin-bottom: 18px;
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
.rail-item--hero .rail-node {
  background: var(--gold);
  border-color: var(--gold-line);
}
.rail-mon {
  display: block;
  font-family: var(--display);
  font-style: italic;
  font-weight: 500;
  font-size: 19px;
  letter-spacing: -.01em;
  line-height: 1;
  color: var(--fg-muted);
  transition: color .2s ease-out;
}
.rail-item--hero .rail-mon {
  font-style: normal;
  font-family: var(--serif);
  font-weight: 600;
  color: var(--parch-100);
  font-size: 16px;
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
  box-shadow: 0 0 8px var(--gold-line);
}
.rail-item--active .rail-mon { color: var(--parch-50); }
.rail-item--active .rail-meta { color: var(--gold); }

/* ── Mobile chip rail ── */
.chip-rail { display: none; }

/* ── Content ── */
.content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ── HERO ── */
.hero {
  scroll-margin-top: 24px;
  margin-bottom: 64px;
}
.hero-eyebrow {
  font-family: var(--display);
  font-style: italic;
  font-size: 16px;
  color: var(--gold-deep);
  margin-bottom: 18px;
}
.hero-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px 24px;
  margin-bottom: 14px;
}
.hero-title {
  margin: 0;
  font-family: var(--display);
  font-weight: 500;
  font-size: clamp(28px, 4.4vw, 40px);
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: var(--parch-50);
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}
.ver-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  display: inline-flex;
  align-items: baseline;
  gap: 12px;
}
.ver-btn:hover .ver { color: var(--gold-deep); }
.ver { transition: color .15s ease-out; }
.ver-copied {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .15em;
  color: var(--gold);
  font-weight: 500;
  text-transform: uppercase;
  font-style: normal;
}
.codename {
  font-family: var(--display);
  font-style: italic;
  font-weight: 400;
  color: var(--fg-muted);
  font-size: 0.78em;
}
.hero-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 14px;
  white-space: nowrap;
}
.hero-date {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .12em;
  color: var(--fg-faint);
  text-transform: uppercase;
}
.hero-tag {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: .25em;
  padding: 3px 10px;
  border: 1px solid currentColor;
  border-radius: 3px;
  white-space: nowrap;
}
.tag--major { color: var(--gold); }
.tag--minor { color: var(--lapis); }
.tag--patch { color: var(--fg-faint); }

.hero-rule {
  margin: 6px 0 32px;
  height: 1px;
  background: linear-gradient(
    90deg,
    var(--gold) 0,
    var(--gold) 56px,
    var(--line-strong) 56px,
    var(--line-strong) 100%
  );
}

.hero-highlights {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 28px;
  max-width: 62ch;
}
.hero-hl {
  margin: 0;
}
.hero-hl-cat {
  margin: 0 0 6px;
  font-family: var(--serif);
  font-weight: 600;
  font-size: 17px;
  line-height: 1.4;
  color: var(--parch-50);
}
.hero-hl-text {
  margin: 0;
  font-family: var(--serif);
  font-size: var(--content-fs);
  line-height: 1.85;
  color: var(--parch-100);
}

.hero-expand {
  margin-top: 32px;
  background: none;
  border: 1px solid var(--gold-line);
  color: var(--gold-deep);
  cursor: pointer;
  padding: 8px 18px;
  border-radius: 999px;
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: .18em;
  transition: color .15s ease-out, border-color .15s ease-out, background-color .15s ease-out;
}
.hero-expand:hover {
  background: var(--gold-soft);
  border-color: var(--gold);
  color: var(--gold);
}

/* ── Archive divider ── */
.archive-divider {
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 0 0 36px;
}
.divider-label {
  font-family: var(--display);
  font-style: italic;
  font-size: 16px;
  color: var(--fg-muted);
  flex-shrink: 0;
}
.divider-rule {
  flex: 1;
  height: 1px;
  background: var(--line-strong);
}

/* ── Month section ── */
.month {
  scroll-margin-top: 24px;
  border-top: 1px solid var(--line);
}
.month:last-child {
  border-bottom: 1px solid var(--line);
}

.month-head {
  display: flex;
  align-items: baseline;
  gap: 14px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 22px 4px 18px;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: color .15s ease-out;
}
.month-head:hover { color: var(--gold-deep); }
.month-mon {
  font-family: var(--display);
  font-style: italic;
  font-weight: 500;
  font-size: 30px;
  letter-spacing: -.015em;
  color: var(--parch-50);
  margin: 0;
  line-height: 1;
}
.month-zh {
  font-family: var(--serif);
  font-size: 13px;
  color: var(--fg-faint);
  letter-spacing: .08em;
}
.month-spacer { flex: 1; }
.month-count {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--fg-faint);
  letter-spacing: .2em;
}
.month-chev {
  color: var(--fg-faint);
  transition: transform .25s ease-out;
}
.month-chev.is-open {
  transform: rotate(180deg);
}

/* ── Ledger ── */
.ledger {
  list-style: none;
  margin: 0;
  padding: 0 0 18px;
  display: flex;
  flex-direction: column;
}
.row {
  border-top: 1px dashed var(--line);
}
.row:first-child { border-top: none; }

.row-summary {
  display: grid;
  grid-template-columns: 16px 64px 56px 1fr;
  align-items: baseline;
  gap: 14px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 12px 4px;
  text-align: left;
  font: inherit;
  color: var(--fg-muted);
  transition: color .15s ease-out, background-color .15s ease-out;
  border-radius: 2px;
}
.row-summary:hover {
  color: var(--parch-100);
  background: var(--gold-soft);
}
.row--open .row-summary {
  color: var(--parch-50);
}
.row-dot {
  font-size: 10px;
  color: var(--fg-faint);
  line-height: 1;
  text-align: center;
}
.row--major .row-dot,
.row--minor .row-dot { color: var(--gold); }
.row--patch .row-dot { color: var(--fg-faint); }

.row-ver {
  font-family: var(--mono);
  font-size: 12.5px;
  color: var(--parch-100);
  letter-spacing: .02em;
}
.row-date {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-faint);
  letter-spacing: .08em;
}
.row-tail {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
}
.row-codename {
  font-family: var(--display);
  font-style: italic;
  font-size: 14px;
  color: var(--gold-deep);
  white-space: nowrap;
  flex-shrink: 0;
}
.row-summary-text {
  font-family: var(--serif);
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--fg-muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row--open .row-summary-text { color: var(--parch-100); }

.row-body {
  padding: 4px 4px 22px 94px;
}
.row-hl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-width: 62ch;
}
.row-hl {
  font-family: var(--serif);
  font-size: 14px;
  line-height: 1.7;
  color: var(--parch-100);
}
.row-hl-cat {
  font-weight: 600;
  color: var(--parch-50);
}
.row-hl-sep {
  color: var(--fg-faint);
  margin: 0 4px 0 1px;
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .rail-item, .rail-bar, .rail-node, .rail-mon, .rail-meta,
  .month-head, .month-chev, .row-summary, .ver-btn, .ver,
  .hero-expand {
    transition: none !important;
  }
}

/* ── Mobile ── */
@media (max-width: 900px) {
  .changelog-view {
    padding: 24px 16px 56px;
  }
  .layout {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .rail { display: none; }

  .chip-rail {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    margin: 0 -16px 28px;
    padding: 8px 16px;
    position: sticky;
    top: var(--mobile-app-bar-h, 52px);
    z-index: 10;
    background: color-mix(in srgb, var(--app-bg) 82%, transparent);
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
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    padding: 6px 14px;
    min-height: 44px;
    background: var(--app-surface);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    color: var(--fg-muted);
    cursor: pointer;
    font: inherit;
    transition: color .15s ease-out, border-color .15s ease-out, background-color .15s ease-out;
  }
  .chip-label {
    font-family: var(--display);
    font-style: italic;
    font-weight: 500;
    font-size: 16px;
    line-height: 1.1;
  }
  .chip-sub {
    font-family: var(--mono);
    font-size: 9.5px;
    letter-spacing: .15em;
    color: var(--fg-faint);
    margin-top: 1px;
  }
  .chip--hero .chip-label {
    font-style: normal;
    font-family: var(--serif);
    font-weight: 600;
  }
  .chip--active {
    color: var(--ink-900);
    background: var(--gold);
    border-color: var(--gold);
  }
  .chip--active .chip-label,
  .chip--active .chip-sub {
    color: var(--ink-900);
  }

  .hero { scroll-margin-top: calc(var(--mobile-app-bar-h, 52px) + 56px); margin-bottom: 48px; }
  .month { scroll-margin-top: calc(var(--mobile-app-bar-h, 52px) + 56px); }

  .page-head { margin-bottom: 32px; }
  .page-title { font-size: 38px; }
  .page-stats { font-size: 13px; }

  .hero-title { font-size: 26px; }
  .hero-meta { gap: 10px; }

  .hero-rule { margin: 8px 0 24px; }
  .hero-highlights { gap: 22px; }
  .hero-hl-cat { font-size: 16px; }

  .archive-divider { margin-bottom: 24px; }

  .month-head { padding: 18px 4px 14px; }
  .month-mon { font-size: 26px; }

  .row-summary {
    grid-template-columns: 16px auto 1fr;
    grid-template-rows: auto auto;
    row-gap: 4px;
    column-gap: 12px;
    padding: 14px 4px;
  }
  .row-dot { grid-row: 1 / span 2; align-self: start; padding-top: 4px; }
  .row-ver { grid-column: 2; grid-row: 1; }
  .row-date { grid-column: 3; grid-row: 1; justify-self: start; }
  .row-tail {
    grid-column: 2 / -1;
    grid-row: 2;
    flex-wrap: wrap;
    gap: 4px 10px;
  }
  .row-summary-text { white-space: normal; }
  .row-body { padding: 0 4px 18px 30px; }
}
</style>

<!-- Dark mode token swap. Light theme drives an "Eorzean Codex on parchment"
     metaphor; the same tokens read as a glowing cream stripe on dark surfaces. -->
<style>
[data-theme="dark"] .changelog-view {
  --parch-50: oklch(0.94 0.010 80);
  --parch-100: oklch(0.86 0.012 78);
  --parch-200: oklch(0.78 0.012 75);
  --ink-900: oklch(0.18 0.020 55);
  --fg-muted: oklch(0.68 0.012 70);
  --fg-faint: oklch(0.50 0.010 65);
  --gold: oklch(0.74 0.13 68);
  --gold-deep: oklch(0.80 0.12 70);
  --gold-soft: oklch(0.74 0.13 68 / 0.16);
  --gold-line: oklch(0.74 0.13 68 / 0.36);
  --lapis: oklch(0.72 0.10 50);
  --line: oklch(0.50 0.010 60 / 0.34);
  --line-strong: oklch(0.55 0.012 60 / 0.50);

  background-image:
    radial-gradient(oklch(0.55 0.030 60 / 0.06) 1px, transparent 1px),
    radial-gradient(oklch(0.55 0.030 60 / 0.04) 1px, transparent 1px);
}

[data-theme="dark"] .changelog-view .row-summary:hover {
  background: oklch(0.74 0.13 68 / .08);
}
</style>
