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
    version: "v2.22.0",
    date: "2026-07-08",
    highlights: [
      "【本期效能總覽】這一版把批量／模擬器的求解速度整包翻新，五個層面的加速會互相疊加：① 底層求解引擎升級、單次求解約 2.9× 更快（解的品質完全不變）；② 重複跑同一個批次改讀快取、幾乎秒回（實測 1012ms → 6ms）；③ 多職業的鑲嵌建議批次改並行、快 4～5 成；④ 12 核以上的電腦批量整體再快約 18%；⑤ 批量從「算完才一次全出」改成邊解邊揭露，第一個職業的成品幾秒內就看得到。對你的操作幾乎零影響 —— 全部是後台加速、不用改任何設定，而且沒有一項是拿解的品質換速度。唯二會看到的新畫面：批量進度變得更細（見下一條），以及極少數卡超過 60 秒的病態配方會被標「求解超時」單獨跳過、不再拖死整批。此外引擎升級含一個 strict quality 正確性修正，少數配方「能否保證 HQ／要鑲幾顆」的判定會比以前更準",
      "【求解引擎升級 · 約 2.9× 更快】把底層 raphael-rs 求解器升到 v0.28.5：實測 21 個配方全數受惠、單次求解約快 2.9 倍，而產出的手法步數與 HQ 結果與舊版完全相同 —— 純加速、零品質變化（已用新舊 binary 交叉對拍確認加速來自引擎、非量測雜訊）。這版並帶一個正確性修正（strict quality #353）：我們的「能否 100% 保證 HQ」可行性判定與鑲嵌 double-max 判定都走 strict 路徑，之前極少數配方可能「宣稱達標卻其實沒達標」，現在更誠實 —— 受影響配方的鑲嵌顆數或 HQ 結論可能與舊版略有出入（是變準、不是退步）。附帶遊戲資料更新到 7.51／國際版 7.15",
      "【批量進度不再死寂】批量計算從「一條聚合進度條」升級成「已完成 X／N」逐職狀態列表：每個職業各自顯示排隊中／求解中（含 %）／完成（含手法步數、是否雙滿 HQ）／失敗（含原因），任一職業一解完就立刻顯示手法摘要，不必等整批跑完。鑲嵌建議計算時也會顯示「探測 X／Y」即時進度，不再只有一句乾等的文字（#162）。另外單件模擬器頁按「取消」改成只取消當下這一筆，不再誤砍整個求解器 pool、連帶殺掉背景並行中的工作",
      "【重複求解秒回】以前改個數量、重整頁面、或跨分頁再算同一個配方，solver 都得從頭重解。現在加了求解結果快取（記憶體 + IndexedDB 持久化，跨分頁、重開瀏覽器都留著）：同一組配裝＋配方算過一次後第二次直接回放（實測 1012ms → 記憶體 6ms／重整後 IndexedDB 77ms）。「無解」也會快取（一樣昂貴且確定）；被取消或超時的則不快取，不會回放到壞結果。快取綁定 solver 版本，引擎一升級就自動失效、不會拿到舊引擎的過時解",
      "【多職業鑲嵌批次並行】批量開「鑲嵌建議」時，收尾要對每個職業各反推一次 solver，以前一個職業算完才換下一個。現在多職業之間改並行（實測等成本雙職業 −46%、混合成本 −20～26%），單一職業失敗也不會拖垮其他職業。買菜推薦的內層試算一併並行化 —— 但「最便宜組合優先」的外層順序刻意不動，所以推薦結果與以前完全一致",
      "【病態配方不再拖死整批】極少數難解配方以前可能無限占用求解器（曾觀測 >3 分鐘），整批只能一起取消。現在每一筆求解加了 60 秒上限，超時就把那筆標成「求解超時」單獨跳過、其餘配方照常完成，批量不再卡死。正常配方（多在 3～12 秒解完）完全碰不到這個上限",
      "【多核電腦批量再快 18%】求解器同時並行的工作數（worker pool）以前固定 2 條。實測在 12 邏輯核以上的電腦開到 3 條，批量整體時間中位數再快約 18%（三組測資 −16.8～23.5%、零退步）；不到 12 核的電腦維持 2 條、行為完全不變。也測過 4 條，但增幅落在量測雜訊內又多吃一份記憶體，所以封頂在 3 條",
      "【內部】效能改造分兩期共 6 個 PR（#169–#174）落地：期一純前端（求解快取／序列迴圈並行化／漸進式等待體驗），期二 solver 深化（引擎升級／求解超時 deadline／worker pool 自適應）；每項效能宣稱都附 BenchPanel 前後對比數據，設計與實測留底於 docs/superpowers/specs/2026-07-07-batch-simulator-perf-experience-design.md",
    ],
  },
  {
    version: "v2.21.0",
    date: "2026-06-23",
    highlights: [
      "【批量不再卡在 95%】部分配方在批量「分組採購清單」階段會卡很久（最久 10 幾分鐘、看起來像當機）—— 根因是收尾的鑲嵌建議要對每個職別逐一反推 solver（每張卡跑很多次求解），而且整段 95% 之後毫無進度回饋。現在：① 鑲嵌建議改成可開關、預設關閉，不需要的人批量直接秒收尾；② 真的要算時，95–99% 會顯示「正在評估鑲嵌建議… X / Y」逐職進度，不再是死寂的 95%",
      "【「鑲嵌建議」開關進駐兩處】批量設定與單一製作頁都加了「鑲嵌建議」開關（預設關閉、設定會記住）。單一製作頁的開關放在「再補鑲嵌」步驟標題列，隨時可開可關 —— 即使建議已判定「HQ 素材已足夠、無需鑲嵌」也不會消失；關閉時不跑 ride-along 求解，開啟後若畫面上已有解，會立即補算當前結果那張卡、不必重新求解",
    ],
  },
  {
    version: "v2.20.0",
    date: "2026-06-11",
    highlights: [
      "【鑲嵌工作台成形】「再補鑲嵌」區從單張建議卡長成完整工作台：新增正向試算台 — 自己擺魔晶石（等級 × 顆數）即時看裝備數值與真 solver 的 HQ 判定，一鍵「載入逆向建議」後微調再驗證；「套用鑲嵌（模擬）」把增量掛成 session 覆寫（不寫進配裝、可撤銷），覆寫生效時可再「存成配裝…」永久寫入（只存此職業 / 套用到全部職業）。試算台平時收摺、有東西（載入過建議 / 擺了魔晶石 / 覆寫生效中）會自動展開不藏狀態；計算中有取消鈕＋「難配方可能需數十秒」預期提示",
      "【鑲嵌建議結果表格化】逆向建議從單行文字改成結構化表格：一列一種魔晶石（能力值增量 / 佔用槽位 / 預估顆數 / 費用），底部合計列收總槽數、總顆數與總費用；動到禁斷時註明「顆數已含禁斷失敗的預估耗損」。批量頁的清單也換成同一張表，兩處不再各自表述",
      "【鑲嵌顆數估算大修】之前深度禁斷方案的顆數會被高估約 2–3 倍：① overmeld 深度改成 per-piece 池（12/12/12/6 — 每件裝備自己的第 1 禁斷槽都是 17%，不是全帳戶共用一條往 5% 地板掉的階梯）；② 搜尋預算不足時不再把「接近天花板的 control」當成已確認的最小值回報（開新一層前先驗證預算夠跑完整個二分）；③ 建議以「備齊全部 HQ 素材」為基準時，卡片會明說這個前提，套用後用部分 HQ 重模擬不會誤以為建議跳票",
      "【可行性判定更準】① 內層搜尋擴成 control × CP 二維 — CP-bound 配方（CP 不夠跑滿手法）之前會被誤判成「無法只靠鑲嵌保證 HQ」；② 加 craftsmanship 階梯（換底裝等級逐階試）與全五鑲上界預檢 — 真不可行的配方一次 solve 就能確定、不用跑完整段搜尋；③ 自訂配方等無 HQ 素材槓桿時，卡片先說明「鑲嵌需獨力補滿」，大顆數建議不再顯得突兀",
      "【狀態誠實化】計算逾時 / 失敗 / 取消 / 搜尋達上限 / 真不可行現在各自講清楚，不再共用同一句話；只有 solver 確認過的方案才會說「即可保證 HQ」並提供套用按鈕，沒確認過的不再假裝保證。配套：每次 solve 有 wall-clock 上限＋可即時中止（取消鈕真的會終止 WASM 運算）、市場價抓取改非阻塞（沒市價時退回「依鑲嵌數量估算」排序）、食藥 buff 與畫面同基準計算、套用覆寫後建議卡會正確標記過期",
      "【移除「全 BiS 對照」框架】批量頁鑲嵌卡不再顯示「跟全頂級五鑲比省 X gil」— 那張 BiS 參考表每個 patch 都要人工維護、過期就說謊，改成直接給「最省錢達標」絕對成本",
      "【內部】Playwright e2e harness 落地（配方走 bundled 資料、只 mock Universalis），鑲嵌流程四條 spec 上線；ADR-0002 記錄 bounded solver search 設計；不可 HQ 的配方整段「如何保證 HQ」不再渲染",
      "【遊戲資料更新】例行重抓上游 datamining（zh-TW / zh-CN / en / ja / recipes / RLT）",
    ],
  },
  {
    version: "v2.19.1",
    date: "2026-05-29",
    highlights: [
      "【鑲嵌建議更準了】修掉三個讓成本估算失真的校準問題：① `solveProgressBreakpoint` 之前對當前星級配方會高估 craftsmanship 約 3×、誤報「槽位不足，需換底裝」→ 改信 RLT 自帶的 `suggestedCraftsmanship`（自訂配方走修正後的封閉式 fallback）；② overmeld 成功率階梯錯置修正為 `[0.17, 0.10, 0.07, 0.05]`（第 2、3 槽之前被高估、期望購買顆數被低估）；③ 自然槽拆分校正 25/35 → 18/42（之前把太多槽當免費、gil 系統性偏低）；④ BiS 參考表更新到 7.3（craftsmanship 5811 / control 5309 / cp 649）。合起來讓可行性判斷與 gil 估算更貼近實際遊戲",
      "【鑲嵌建議卡片視覺打磨】MeldAdvisorCard 走一輪 impeccable 設計收尾",
      "【內部】meld-advisor 服務層 simplify：抽出 `isDoubleMax` predicate 與 `emptyMeldPlan` factory、`solveQualityBreakpoint` 改單次 buff pass，零行為變更（golden snapshot 不動）；附帶 meld-advisor 實戰驗證報告進 `docs/audits/`。對核心行為無影響",
    ],
  },
  {
    version: "v2.19.0",
    date: "2026-05-28",
    highlights: [
      "【新增「鑲嵌建議」卡片】模擬器與批量頁多了一張卡，反推「要 100% HQ 最少要鑲多少魔晶石」並對照「全頂級五鑲（BiS）」的天花板 —— 標頭直接給你「跟全頂級鑲比省了 X gil」，量化你之前過度鑲嵌花了多少冤枉錢。模擬器版本跟著現有 solve 按鈕跑、解完才填卡（編配裝中途不會偷跑 solver、會標成「stale」灰掉等你重算）；批量版本在批量管線跑完後針對每個職別各出一張卡，HQ 副材料會餵進 initialQuality 不讓控制需求被高估。BiS 端永遠不真的 solve，走每個版本維護的參考表",
      "【批量採購清單：潛水艇／飛空艇／工坊專案修正】把多筆「公司製作專案」（潛艇、飛空艇、工坊材料）丟進採購清單時兩個 bug：① 改數量 / 移除任一列都只會打到第一列（所有公司製作專案共用佔位 itemId=-1，store action 是用 itemId 找列、永遠中第一個）；② 那個 -1 還會被送進 Universalis 跨服／單服查價跟 Garlandtools，每列掛永久「跨服查價失敗 重試」、總表跳「N 列查價失敗」、點查價連結直接 404。修法：① 引入 targetKey()（公司製作走 project:<id>、其他走 item:<id>）讓 store + UI 都用穩定 key；② 在 fetchPrices / fetchCrossWorldBestForTargets / fetchItemAcquisition 三個邊界補 isMarketableTarget() / isMarketableItemId() 守衛，並在採購列上把市場 chip 換成「⚒ 工坊製作」label。網路面板實測 0 筆 /-1 請求",
      "【內部】鑲嵌建議的 overmeld 階梯每軸獨立重置：原本 craftsmanship → control → cp 共用同一個 overmeldDepth cursor，導致 control / cp 的第一顆 overmeld 被誤套到階梯地板價（0.05）而不是頂端（0.17），craftsmanship 只要動到 overmeld，control / cp 成本就會被吹大約 3.4×。把 ladder index 拉進 allocateForStat() local（結構性 reset、不靠 caller 記得重置），全域的 35 槽 overmeldRemaining 維持共用所以可行性 cap 不變。pin 兩個 regression：(a) craftsmanship 重配後 control 第一顆 overmeld = 1/0.17；(b) 總 meld > 60 仍報 infeasible",
      "【遊戲資料更新】例行重抓上游 datamining（zh-TW / zh-CN / en / ja / recipes / RLT）",
    ],
  },
  {
    version: "v2.18.3",
    date: "2026-05-26",
    highlights: [
      "【慢網路下首頁載入更快】之前首頁要等 Google 字型樣式表整包下載完才開始畫面 — 慢連線（Slow 4G）下光這一步就擋了約 3 秒。改成字型非阻塞載入：文字先用系統字型立刻畫出來、字型載好再無痕換上（display=swap），慢網路的首次內容繪製明顯提早，版面位移維持 0。一般網路下幾乎無感、純賺慢裝置體驗",
      "【開「配裝」設定抽屜不再卡頓】按配裝開設定時，8 職 × 4 欄共 32 個數值輸入框原本一次同步掛載，中階手機上會卡一下（互動延遲約 550ms）。改成抽屜先滑出、輸入框延後一幀才掛載，點擊回應快很多（實測 INP 549ms → 208ms）；輸入內容與自動聚焦行為不變",
    ],
  },
  {
    version: "v2.18.2",
    date: "2026-05-24",
    highlights: [
      "【內部】/admin/ga v2 圖表誠實度與資料修正（接 live GA 第二批）：① market_region 之前誤接 `settings.region`（Universalis 市場區，沒有台服值）導致台服永遠 0 → 改接 `settings.language`（UI locale），cht 桶才會累積真實資料（這條會進 production gtag）。② 新手里程碑「漏斗」其實是各自獨立的計數（used_batch 可能 > viewed_recipe），舊梯形漏斗會往外膨脹說謊 → 改平行水平條 +「非嚴格漏斗」標註、標出最少抵達的里程碑。③ ToolUsageByRlv / RecipeDifficultyKind / ExpertCollectableMatrix 在稀疏資料下會把 0/0 算成 NaN 寫進 `<rect width>`（console 噴數百次）→ 全補 denominator floor；樣本太少時不再亂下「偏向 X」「完成率紅燈」結論，改中性灰 +「樣本不足」。④ Q4 漏斗顏色改方向感知（轉換率越高越綠），消除「34.2% 是綠色卻被 TL;DR 點名最大流失」的矛盾；頁面健康表低於中位數的 Δ 從琥珀改紅。⑤ raw event 名（solver_rerun 等）補進中文對照不再外漏；中文名缺失列空白改顯示「名稱待補」；FailuresBar 過長 reason 截斷 + hover 看全文；Q6 重排讓頁面收在有資料的圖而非空盒；空狀態變輕並加「此區間尚無事件」。設計收尾走 impeccable critique（修掉 P0 假漏斗、NaN storm、顏色矛盾）。對一般使用者不可見",
    ],
  },
  {
    version: "v2.18.1",
    date: "2026-05-24",
    highlights: [
      "【內部】/admin/ga v2 接 live GA 後抓出的資料/埋點修正：① `rlv` 之前誤記成工匠職等（recipeLevelTable.classJobLevel ≤90/100）而非真正的 RLV index，導致所有配方都落在「< 600」桶 → 改抓 `RecipeRecord.rlv`，配方難度直方圖與工具偏好分組才有正確分佈。② `solver_complete` 漏帶 `is_expert`/`is_collectable`（`solver_start` 有、complete 忘了透傳），導致「高難度 × 收藏品」矩陣的完成率全擠進『一般×一般』格、其餘格顯示 0% → 補上 taxonomy 透傳；`solver_start` 也補 `rlv`。③ `api_failure` 之前記整條 URL（含 URL-encoded 世界名，且 50 字截斷會切在 %XX 中間變亂碼）→ 改記 path，dashboard 端再 strip origin + decode + 安全截斷（舊資料一併變可讀）。④ 未選市場伺服器時 Universalis 會送出畸形的 `/api/v2//<id>` 請求（必 404）→ 加守衛提早擋下、不再污染 api_failure。⑤ 新手里程碑漏斗的 drop 可能變負數（里程碑是各自獨立的 localStorage 旗標、本來就不是嚴格依序漏斗）→ clamp ≥ 0，不再顯示 −2500% 這種爛數字。對一般使用者不可見",
    ],
  },
  {
    version: "v2.18.0",
    date: "2026-05-23",
    highlights: [
      "【內部】Owner-only /admin/ga dashboard v2：延伸既有 Q1–Q3，往下接三段 ɪᴠ / ᴠ / ᴠɪ 共 10 張新圖 —— 新手里程碑漏斗、工具偏好（依 RLV 區間分組，模擬器 / 批量 / BOM 三條獨立 max bar + 偏向 X callout）、配方難度（recipe_select RLV 直方圖）+ craft_kind 完成率、高難度 × 收藏品 2×2 矩陣、誤用提示統計、配方進入路徑（100% 堆疊條 + unknown>0 紅色異常 banner）、首動作時間 × 第一個事件、API 失敗端點排行（端點列表為主視覺、matrix 為輔）、中文名缺失 top items、正式環境 WASM 載入分佈（整體實心圓 + 冷啟動子集空心菱形）。RegionSplitLedger 取代 LedgerGlance：5 列 ledger 右側拆「台服 / 國際服 / 未設定」三欄 spark + 次數/比例 toggle（localStorage 持久化）；新增左側 scroll-spy RailNav（56→248px hover 展開）與進場淡入（respects prefers-reduced-motion）。型別全 additive（schemaVersion 維持 1、欄位全 optional，舊 snapshot 照樣 parse），任一欄位缺資料時圖表降級為「資料累積中」placeholder。buildBundle() 對 live GA 驗證後接上 8/10 個 v2 聚合（byRegion / onboardingFunnel / toolUsageByRlv / taxonomy / misuseSignals / recipeEntrySource / apiFailures / localeMissTop）；驗證時順手修掉 region 字面映射、rlv 空值誤塞 < 600、completeRate >1 三個聚合 bug。perfProfile 與 timeToFirstAction 待 client 端補發 wasm_load_ms / worker_pool_init_ms / time_to_first_action 數值事件，toolUsageByRlv 的 batch RLV 歸戶待 recipes.json join——在此之前那幾張圖維持 placeholder。設計來源 Claude Design handoff，留底於 `docs/superpowers/specs/2026-05-23-ga-dashboard-v2-design-brief.md`。對一般使用者完全不可見",
    ],
  },
  {
    version: "v2.17.0",
    date: "2026-05-22",
    highlights: [
      "【快速購買 step 3 直接當製作清單】快速購買模式跑完後 step 3 不再是空白頁 — 把這次批量的目標投影成 crafting TODO（跟巨集模式同一套版面），可以邊做邊勾、做幾個剩幾個一目了然。沒跑 solver 的快速購買模式，巨集按鈕和 HQ 提示列會自動 gate 掉不顯示；巨集模式（含 double-max「全 NQ 即可」配方）原本的 hint 行保持原樣，gate 條件改成「solver 有沒有跑」而不是「hqAmounts 有沒有東西」",
      "【取消批量計算不再卡在「準備求解器」】使用者在 worker pool 還沒 ready 時按取消，會卡在 preparing solver 永遠跳不回去 — cancelSolve() 之前只 reject 已 queue 的請求、留著 wasmReadyWaiters / wasmErrorWaiters 沒清。現在 cancel 會同時把這兩個 waiter array 全部 reject 成 SolveCancelledError，batch-optimizer / SolverPanel / CraftRecommendation / useSimulator / BenchPanel 任何在等 WASM init 的呼叫端都能立刻收到取消訊號脫身",
      "【內部】Solver façade 重構大收尾：所有非 worker 直連的呼叫端（batch-optimizer / buff-recommender / self-craft-candidates / BatchView cancellation / unhandledrejection handler）都改走 `src/solver/api.ts` 服務層；cancellation 全面改成 `instanceof SolveCancelledError` 判斷，順手砍掉 SOLVE_CANCELLED 字串常數；batch result types 抽 `src/stores/batch.types.ts`；useSimulator 的 Soul-only fallback 改走 `gearsetToBuffedStats` 統一 pipeline（ADR-0001 收口）。call sites 縮成 façade，未來新增 solver 行為只動一個檔",
      "【內部】Docs-only PR 走得通了：`ci.yml` 改成 docs PR 也跑（30-40s no-op pass）解 branch protection 死結；新增 `.claude/skills/docs-pr` skill 把 conventional-commit prefix、body 形狀、`docs(changelog):` 流程一次寫死，AFK agent 改 ADR / spec / plan 不會再撞牆。架構深化計畫 `docs/superpowers/plans/2026-05-21-codebase-architecture-deepening.md` 已落地，後續重構基於它走",
    ],
  },
  {
    version: "v2.16.0",
    date: "2026-05-21",
    highlights: [
      "【購物清單能勾完成了】材料明細 tab 每一列加了「已完成」核取，邊跑邊買的時候可以勾掉手上拿到的，看一眼就知道還剩幾件。footer 有採購進度條（X / Y 完成）+ 全部完成 tag，跟批量採購清單同一套視覺語言。勾選狀態綁這份 BOM（targets + 取得方式 hash 當 key），改數量或切自製/直購會自然歸零、F5 / 切頁切回會還原；localStorage 走 LRU 16 + 14 天 GC，多份 BOM 來回切互不污染",
      "【內部】抽 `evictLruByPrefix(prefix, limit)` 共用 helper：BOM 的 route-session + completed 兩處的 LS 清掃邏輯收成一份；BomDecisionRow 的 grid 從 8 欄擴到 9 欄但 nested drill-down 子列維持 8 欄（PR review 抓出的 silent-desync：sub-craft 子節點誤掛 checkbox 但不計入 X/Y 池子）。新增 15 個 unit test 覆蓋 bomKey 穩定性 / recalc 行為 / LRU 容錯 / empty-Set 自動 removeItem",
    ],
  },
  {
    version: "v2.15.6",
    date: "2026-05-20",
    highlights: [
      "【配裝表也能勾「專家之證」】之前 /gearset 頁面少了專家之證勾選框，要動專家狀態只能從配方配置抽屜進去；現在 /gearset 桌面版每列直接顯示「專家之證」核取（開啟時帶可可色光暈、上方有「專家配置 N / 3」狀態列與超限警告），手機版手風琴摘要有「專」標籤、展開後在屬性欄位下方也補上開關",
      "【內部】Owner-only /admin/ga dashboard UI/UX 大改：把「儀表板呈現數據」改寫成「報表指出問題並建議怎麼做」。新增 per-section TL;DR pill + 一行白話結論（自動點名首頁進入來源 / 最差漏斗第一個流失點 / 回訪者主要動作）；EngagementScatter 換成 PagesTable（中位數基準的 Δ 排序，讓首頁 -67% session 之類的異常直接被看見）；Q4 漏斗組（Recipe→Solver / Solver→Macro / Batch prep→Optimize / BOM→Consumed）併入 Q2「漏在哪」當第三層；ReturningEventsBar 把 GA snake_case 翻成中文功能名（universalis_fetch → 市場價查詢）；容器寬度 1180 → 1720（≥1440 才看得到，1920 螢幕內容區佔比 67 → 90%）；12 張圖補齊 role=img + aria-label；palette / formatters / paths 三個共用模組砍掉 12 處重複",
      "【內部】GA daily snapshot workflow 第二次以後排程跑會 fail：`git worktree add origin/gh-data` 進 detached HEAD、`git push -u origin gh-data` 噴 `src refspec gh-data does not match any`。改用 `-B gh-data` 強制建立本地 branch — 首次跑因為走 orphan bootstrap 路徑沒中、第二次以後才會出現",
    ],
  },
  {
    version: "v2.15.5",
    date: "2026-05-20",
    highlights: [
      "【模擬器：專家配方條件擴張】6 個工匠配方條件埋進求解 / 模擬器：4 個無狀態（Centered / Sturdy / Pliant / Malleable）+ 2 個有狀態（Primed / Good Omen，含 lock UX）；模擬器面板可手動切條件做沙盤推演；adversarial 開關讓求解器知道條件會隨機跳、避免做出在新條件下會崩的計畫",
      "【專家之證跟隨配裝走】配裝表新增 specialist 標記，匠之魂 +20 加成只在該配裝開了 specialist 時帶進求解參數；Heart & Soul / Quick Innovation 也按同邏輯 gate 在 specialist 配裝才解鎖；Soul of the Crafter / 食物 / 藥水的疊加順序統一",
      "【BOM 素材名一鍵複製】材料詳細頁的物品名點下去直接 copy 到剪貼簿，方便去遊戲內貼搜尋",
      "【批量按鈕落在游標位置】之前批量做完的 CTA 會跑到頁面頂端、要往回捲；現在按鈕落在游標所在那一行，做完一個立刻能按下一個",
      "【自製候選重新比價】批量計算的自製候選之前定價時沒考慮市場 listing 實際能不能填滿你要的數量，會把「掛單只有 1 個但你要 10 個」當成可直購；改成依 listing 累積數量與 fulfillment 重新比價，自製建議更貼合實情",
      "【遊戲資料更新】例行重抓 datamining 上游",
      "【內部】GA 追蹤大幅擴張：新增 14 個 custom dimension（market region / recipe taxonomy / page funnel）；analytics.ts 的 send() 補上 page_location 讓 custom events 帶上 SPA hash 路由，後續可以切「在 /simulator 跑了多少次 solve」這層。Owner-only /admin/ga 路由：站內可視化 dashboard 含 11 張 D3 圖（pages treemap / 漏斗 / scatter / web vitals / new vs returning），daily cron 推 snapshot 到 gh-data branch、dashboard runtime fetch raw.githubusercontent.com 不靠 deploy refresh",
    ],
  },
  {
    version: 'v2.15.4',
    date: '2026-05-17',
    highlights: [
      '【部署後不再卡死（補洞）】v2.15.3 補的偵測規則漏了 Vite 在 CSS preload 失敗時丟的特有 error（`Unable to preload CSS for ...`），就在 v2.15.3 自己 deploy 的當下 smoke test 直接撞到。補進 regex 後現在 4 種變體都能 catch',
    ],
  },
  {
    version: 'v2.15.3',
    date: '2026-05-17',
    highlights: [
      '【部署後不再卡死】之前每次發新版本，留在舊頁面的人按 nav 切頁會整個沒反應 — 舊 build 的 lazy chunk 在 GitHub Pages 已經被新檔取代，瀏覽器抓不到那支 JS，router 的 promise 永遠等不到、UI 凍住。現在偵測到這個 error 簽名就自動重整到新版（10 秒內只會 reload 一次，避免新舊 build 同時上線那短暫 window 進入無限 reload）。同時送 `stale_chunk_reload` GA 事件，之後就能看出這種情況一週發生幾次',
    ],
  },
  {
    version: 'v2.15.2',
    date: '2026-05-17',
    highlights: [
      '【內部】補齊 GA 追蹤埋點：新增 12 個事件（BOM 操作 / Solver 結果消化 / 新用戶里程碑 / Universalis 失敗原因）+ augment `sab_unavailable` 帶瀏覽器資訊；settings store 公開 9 個顯式 setter，後續 UI 改動會自動經由 `settings_change` 事件被觀察到。對使用者完全不可見，純為了後續產品決策能有數據依據。Spec / plan 留底於 `docs/superpowers/specs|plans/2026-05-17-ga-tracking-expansion*`',
    ],
  },
  {
    version: 'v2.15.1',
    date: '2026-05-16',
    highlights: [
      '【巨集 wait 時間修正】工匠的絕技 / 專心致志 / 快速改革 / 觀察 / 秘訣 五個技能原本被誤 cap 在 <wait.2>，動畫沒跑完就接下個指令；改用對拍 raphael upstream `time_cost()` 的 per-skill 查表，這些技能改回 <wait.3>',
    ],
  },
  {
    version: 'v2.15.0',
    date: '2026-05-14',
    highlights: [
      '【部隊工坊（實驗中）】新增「部隊工坊」頁面：追蹤潛水艇 / 飛空艇 / 工坊建材的素材繳交進度',
      '剩餘素材一鍵推進購物清單（Tracker → BOM 單向同步）',
      '支援整艘潛水艇 / 飛空艇的 4 零件 bundle 專案',
      '每個 phase 的 supplyItem 都有獨立進度 counter',
      '【批量等級警告軟硬分級】prepare-list 等級警告拆成「硬阻擋」（裝等不足、必擋）與「軟提示」（可做但不建議）兩層；含硬阻擋目標時 optimize 按鈕停用；軟提示配色改暖色與暗模可讀性修正',
      '【批量計算穩定性】Universalis 暫時抓取失敗自動 retry 避免批量計算當機；isDoubleMax quality 目標依配方類型分流；自製清單建構時 self-craft 項目正確轉成 craft；0 星配方等級不符在模擬器顯示為軟提示',
    ],
  },
  {
    version: 'v2.14.0',
    date: '2026-05-13',
    highlights: [
      '【批量計算明顯變快】啟用 2 個 worker 同時跑求解（worker pool + FIFO queue），同時 Phase 1（逐配方求解）與 Phase 4.6（buff 套用與自製驗證）各自內部也改成並行；同一份配方清單相較 v2.13.0 通常快 1.5–2×。空閒桌面（hwc≥4）受益最大，低核心數機器自動退回 serial 不會變慢',
      '【混 lv90+ 配方組合不再倒退】先前 8 配方混 lv94–lv100 的批次組合在 worker pool 啟用後反而比單 worker 還慢 1.5×（rayon 兩個 worker 內部各開滿 thread 互搶 CPU）；現在限制每個 worker 的 rayon thread = hwc / pool size，contention 完全消除。內部 ABTest（Boundary preset · hwc=20 · 同一 commit 純切 thread 上限）：dataset-3 從 38.9 s 砍到 22.1 s（−43% · 1.76× faster），三個 dataset 一致 1.59–1.76× 改善',
      '【進度條跟得上實際進度】之前進度條是「假動畫」（每秒固定推進），跟求解器真實工作量無關；現在接通 raphael 求解器內部的 processed_nodes 計數，每 50 ms 更新一次。簡單配方 1 秒推到底、深搜索配方 (lv100 expert) 進度條會在 50-90% 區段慢下來，符合人對「正在思考」的直覺',
      '【solver 不再 silent fail】Worker 內崩潰（OOM、panic）以前會讓進度條停在某個百分比、永遠不結束；現在 main thread 攔截 onerror 把所有 in-flight 計算 reject 並重建 pool，使用者馬上看到錯誤訊息可重試',
      '【HQ 可行性預檢】批量計算前先用啟發式（craftsmanship / control / cp 餘量加總 vs 配方 quality 需求）篩出「以當前裝備幾乎不可能達到 HQ」的配方，跳過 full solve 直接走 NQ 模板；上游真正需要 HQ 的配方仍走完整求解，命中率夠高就省掉一大塊計算時間',
      '【內部】`src/solver/worker.ts` 從單 worker 改為 2-slot pool + FIFO queue + requestId 多工器；`solver-worker.ts` rayon thread cap = `deriveRayonThreads(hwc)`；新增 `pool-config.ts` 集中 POOL_SIZE 與 thread 換算；raphael-wasm-wrapper 暴露 `init_threads(N)` 與 `progress_callback`（50 ms throttle、`MacroSolverStats` 走 serde shim 攤平到 solve envelope）；`batch-optimizer.ts` Phase 1 用 `Promise.allSettled` 取代 sequential for、Phase 4.6 的 buff 對拍與 self-craft 候選驗證改 `Promise.all`；新增 dev-only `/batch?bench=1` BenchPanel（gearset preset 切換 + dataset-1/2/3 fixtures + [bperf] CSV 輸出）+ `npm run bench:solver` raphael-cli native baseline 對拍；spec/plan 留底於 `docs/superpowers/specs|plans/2026-05-12-*` 與 `docs/superpowers/specs/2026-05-12-rayon-contention-investigation-design.md`（後者 §9 含 ABTest 完整驗證表）',
    ],
  },
  {
    version: 'v2.13.0',
    date: '2026-05-11',
    highlights: [
      '【批量採購多了一條「跟 NPC 買」路線】算完批量後新增「NPC 採購建議」區：把所有可向 NPC 商人購入、且比市場便宜的素材撈出來，依「攤位（同一個 NPC）」分組成花名冊，每攤顯示「N 項素材 · 共省 X gil」與商人座標。逐項或整攤勾選後，被勾的素材會從原本的市場群組移走，改放進採購清單最上方的「NPC 攤位」分組，總計即時扣掉省下的 gil（不必重跑計算）',
      '【NPC 攤位列在採購清單最上方】被選中的 NPC 採購素材以攤位卡形式釘在採購清單頂端：標題列顯示 NPC 名稱 + 區域 + 座標 + 距離最近的乙太傳送點，桌面版直接內嵌區域地圖（標出商人位置），手機版開抽屜檢視；每張攤位卡含「複製 /tp 指令」與「複製座標旗標」兩顆快速動作鍵，把採購當場執行的所有資訊收在同一個卡片',
      '【採購清單列改用 el-table 統一樣式】NPC 攤位內的素材列改成跟既有伺服器表格同一套 el-table（同樣 row 高、同樣展開、同樣 hover），不再因為走自製 grid 而在桌面 / 手機混排時看起來有兩種行高',
      '【Step 2 拆成 2.1 採購建議 / 2.2 採購清單】之前「採購材料」step 把建議卡（料理藥水推薦、自製建議、NPC 採購建議）跟採購清單擠在同一階。改成兩個子段：2.1 集中所有「決策建議」、2.2 是執行用的清單。三張建議卡共用 `<details class=sug>` 同一套語彙（標題列 · 摘要 · 已省/可省 chip · 展開按鈕），桌面寬版以 grid 並排呈現，視覺重心一致',
      '【料理藥水建議卡改可摺疊】BuffRecommendationCard 重寫成 `<details>` 形式，跟自製 / NPC 建議卡同一個外殼；展開後底部新增「套用建議」按鈕，一鍵把推薦的食藥 + 啟用對象配方寫進設定，省去自己滑下去找開關',
      '【配方搜尋過濾器修好了】之前過濾器（職業 / 等級）是套在 SEARCH_LIMIT cap 之後才篩，導致搜出來只剩前 N 筆再被過濾，常常零結果。改成在 capping 之前先套過濾器，現在改職業 / 等級會重新查詢並把過濾條件帶進 query，結果跟預期一致',
      '【遊戲資料更新】例行重抓 datamining 上游：zh-TW（aaa607e → 04977ee）跟 Universalis worlds 列表同步重產；`build-game-data.mjs` 修了一個 cache 行為 — 之前切換 datamining repo 來源（例如官方 → fork）後 cached repo 仍指向舊 origin，現在偵測到 origin url 變動會自動更新',
      '【內部】新增 `services/aetherytes.ts` 處理「給座標找最近乙太」的查表；`types/acquisition.ts` 抽出 `AcquisitionSource` 與 `NpcPurchaseCandidate` 型別；`batch-optimizer.ts` 新增 Phase 4a / 4b：並行抓 NPC availability + locations、批次解析 zone / NPC 名稱與乙太資料，避免 `useZoneName` / `useNpcName` 渲染 `#zone:XXX` placeholder；`stores/batch.ts` 新增 `selectedNpcIds` / `doneNpcIds` 狀態 + `finalShoppingItems` 套用 NPC commit override，總計改從 `finalShoppingItems` 一致推導（同時涵蓋 quick-buy quality toggle 與 NPC commit）；`shopping-list.ts` 新增 `isNpcServer` helper + `npc:<id>` server tag 慣例；`composables/useRecipeSearch.ts` 把 RecipeSearch / RecipeSearchSidebar 兩處的 query + filter + debounce + onComplete tracking 抽成共用 hook',
    ],
  },
  {
    version: 'v2.12.0',
    date: '2026-05-11',
    highlights: [
      '【購物清單「完成品預設」切換】查價設定新增 toggle，可選「自製」（成品自己做，原本行為）或「直購」（成品直接買）。切到直購後，所有可製作的完成品自動翻成 market mode，並抓同 DC 內最便宜的伺服器；非可製作目標（NPC 商店家具、FATE 獎勵、採集類）只要切在 market mode 也吃同樣待遇。設定走 LS 持久化，跨 session 保留',
      '【完成品列掛 server pill】每筆完成品旁邊顯示「該 DC 最便宜的伺服器」chip：home server 用 toast-gold + 「你」標籤，其他 server 用 strawberry-jam；單價欄直接帶該 server 報價（不是本服價）。點開列：desktop 內嵌、mobile 底部 sheet 都會展開跨服掛單表（每 server 的 NQ / HQ / 數量 / 上架時間，最便宜 row 自動高亮），資料來自計算階段已預抓的 listings — 點開 0 ms，不再重打 Universalis',
      '【完成品列依 server 分組】列順序改成依 server pill 中文字母序排序：同 server 的所有完成品排在一起，方便逐 server 跑採購；沒 pill 的（craft mode、NPC、採集）一律排到最後',
      '【跨服查價失敗 per-row 重試】單筆 fetch 失敗（CORS / Universalis rate limit）時 row 上顯示「跨服查價失敗 重試」chip，點下去只重打那一筆；retry 中顯示「跨服查價中…」。對齊既有材料 row 「查價失敗 重試」chip 的視覺',
      '【內部】`useCrossWorldPricing` data / loading 改成 module-scope singleton，bom store 預抓與 BomMarketDetail onMounted 共用同一份快取（dedupe 讓點開列不再重打 API）；新增 watcher 把 composable cache 投影回 bom store 的 cheapest map 與 fetch status，避免 stale failed status；`fetchingCrossWorldIds` 移除（與 composable loading 重複）；`isTarget` 改成 BomDecisionRow 的 prop，砍掉每列 `bom.targets.some()` 的 O(N) reactive scan；`applyTargetDefault` 改成 batch 一次 commit acquisitionMode + node.collapsed 並只跑一次 `recalcFlat`（22 targets 就少 22 次 tree walk）；spec + plan 留底於 `docs/superpowers/specs|plans/2026-05-10-bom-purchase-mode-toggle*`',
    ],
  },
  {
    version: 'v2.11.4',
    date: '2026-05-10',
    highlights: [
      '【遊戲資料更新】例行重抓 datamining 上游 commit：zh-TW 換成 andycom12000/ffxiv-datamining-tw fork（之前 b22ac69 切換的設定，這次跟著工作流的產出寫進 manifest），zh-CN 與 en / ja 各 bump 到最新 commit；recipes / items / RLT / worlds 等資料檔同步重產',
    ],
  },
  {
    version: 'v2.11.3',
    date: '2026-05-10',
    highlights: [
      '【繁中技能 / buff 名稱對齊遊戲內用詞】比對 ffxiv-datamining-tw CSV 與遊戲實際顯示，修正模擬器與批量製作頁面的兩個技能名稱：HeartAndSoul「心靈之手 → 專心致志」、DaringTouch「大膽加工 → 冒進」；同時把 7 個誤存成簡中字形的 buff 名稱改回繁中（內靜、儉約、長期儉約、闊步、最終確認、堅信、專心致志）',
    ],
  },
  {
    version: 'v2.11.2',
    date: '2026-05-10',
    highlights: [
      '【模擬器窄 desktop 不再要往下捲】1100–1360px 改成 b-main 內部雙欄（cockpit-body | HQ stack），「初期品質 / 最佳手法」不再堆在 cockpit-body 下方；1361–1720px 用 display:contents 把 cockpit-body 拆解到 b-main grid，HQ 改進 col 1（tool 下方），不再被技能序列擠出無意義空白',
      '【模擬器窄 rail 數字不再排成直式】食藥區「基礎 / 最終能力值」在 1100–1360px 窄 rail 改成單欄堆疊的 stat-grid（label–value 並排），CJK 標籤「作業精度 / 加工精度 / CP」不再因欄位過窄被斷成直式字',
      '【配裝抽屜批次調整能完整展開】窄 viewport 下「調整配裝」抽屜內展開「批次調整」會被 flex-shrink 擠到只剩 trigger 高度（overflow:hidden 把 min-height 解析成 0），加上 flex-shrink: 0 後完整顯示輸入欄位 + 套用全部按鈕',
      '【購物清單採買路線工具列】進度條 teleport 到 segmented control 同列右側；工具列本身改為 1fr auto 1fr 三欄：上一站 ‹ 在最左、01/02/03 數字 chip 永遠正中、下一站 › + ⌫ 重設 在最右；上/下站做循環，01 往前跳到最後一站、最後往後跳回 01',
      '【購物清單收據對齊】hero 數字旁的「省 X% · -Y」省% pill 改用 inline 結構（vertical-align: 0.6em），跟「Gil」superscript 同高；sticky「材料明細」頂部 strip 內所有 icon / 數字 / pill / 按鈕改用 align-items: center，不再因 baseline 對齊讓小字沉到 row 底部',
      '【FlowBreadcrumb 數字置中】桌面流程列 "1 配方 / 2 模式 / 3 食藥…" 的拉丁數字字形視覺上比 CJK 偏下，改用 align-items: baseline 跟「配方 / 模式 / 食藥」標籤共用同一條基線',
      '【內部】重複 percent 計算改用 `percentOf` util；BomRoutePlanner 的 gotoPrev/gotoNext 合成單一 gotoStep(delta)；多檔長篇 narrative 註解改寫成只保留 WHY 一行',
    ],
  },
  {
    version: 'v2.11.1',
    date: '2026-05-09',
    highlights: [
      '【採買路線地圖修正】路線分組卡的區域地圖之前最縮小狀態仍會被裁切（cover + MIN_ZOOM=1 的後遺症），改成 contain 完整顯示整張方圖；同步把採集點 / 商人座標 marker 投影到實際 contain-fit 範圍內，過去掉到 letterbox 黑邊外的標記現在會正確貼齊地圖特徵',
    ],
  },
  {
    version: 'v2.11.0',
    date: '2026-05-09',
    highlights: [
      '【採買路線規劃器】購物清單算完後新增「採買路線」分頁：把所有 NPC 商人 / 採集點素材依區域分組，每組顯示傳送水晶 + 區域地圖（高亮所有採集點 / 商人座標），可依「省 gil」或「少跳」兩種策略自動排序組內物品；每筆勾選即時更新進度，跨會話保留打勾與排除狀態',
      '【素材取得 drill-down 改成自動展開】材料明細選一個取得方式後，drill 面板會自動打開顯示對應細節（自製 → 子配方樹、市場 → 跨服比價、NPC/自採 → 商人地點 + 區域地圖），不用再多按一次列才看得到',
      '【決策表雙欄並排】≥1100px 容器寬度時，「完成品」與「材料」改為左右並排卡片，配方深的清單不再需要一路捲到底；≤1100px 自動回單欄堆疊',
      '【收據語感調整】總計列改寫為「全部市買要 X Gil，自製會多花 Y」（從原本的「比全部市買 X 多花 Y」），主詞清楚不像稅務局通知；省 / 多 chip 對稱改成單字 lead（「省 99% · −206」「多 99% · +206」），保留百分比與絕對值兩個決策指標',
      '【sticky 頁首霧面化】滾過總計後保留採買路線分頁與條列摘要在頂端，背景改成 frosted-cream + backdrop-blur，左右延伸到主區邊緣不再被 max-width 截斷；只在實際 pinned 時開啟 blur，at-rest 不耗 GPU',
      '【完成品行為一致化】非可製作目標（NPC 商店家具、FATE 獎勵等）的取得方式改變時，drill 面板也會跟著自動展開；之前只有可製作素材有這個行為',
      '【無障礙】picker 觸發 auto-expand 時新增一條 polite aria-live announce 給螢幕閱讀器；mobile (<900px) 操作按鈕跟 segmented tabs 拉到 44×44 觸控目標尺寸',
      '【視覺收斂】送往批量按鈕從 cocoa-fill 主動作降為 cocoa-tint ghost，把 hero 「216 Gil」還給總價；採買路線群組卡 / 路線工具列等元件全部對齊吐司工坊設計系統 (Jam-Jar Rule)',
      '【內部】新增 `services/zone-meta.ts`（區域名稱 + 地圖座標 batch lookup）、`services/route-planner.ts`（兩種排序策略 + 跨組 group 排序）、`composables/useObserverFlag.ts`（IntersectionObserver-driven boolean 狀態抽象）、`composables/useZoneName.ts` / `useNpcName.ts`；`stores/bom.ts` 補 `routeViewSession` / `routeViewPrefs` 含 LRU 持久化；補上 4 個關鍵 GA 事件（`bom_calculate` / `bom_acquisition_mode_set` / `bom_send_to_batch` / `bom_route_optimize_set`）；新增 13 套單元測試覆蓋路線規劃器、區域 meta、map coords、aetherytes data',
    ],
  },
  {
    version: 'v2.10.1',
    date: '2026-05-08',
    highlights: [
      '【OCR 截圖匯入修好了】裝備清單截圖辨識在 production 因為 tesseract worker 抓錯路徑（少了 `/ff14-craft-helper/` 前綴）整個 fail，已修復；同時把 leptonica 對窄行裁圖的 `Image too small to scale` / `Line cannot be recognized` 警告塞進 shim 的 console 過濾器，DevTools 不再被洗版',
    ],
  },
  {
    version: 'v2.10.0',
    date: '2026-05-05',
    highlights: [
      '【手機版重新設計】<900px 起，左 rail 收進底部 sheet，最上方留一條 chip 摘要列直接看 ×N 目標品；點「編輯目標」開抽屜進去改清單／設定／按計算。決策列若是自製 row，點下去也會走底部 sheet 而不是擠在當列展開',
      '【自動 scroll 到總計列】算完那一刻畫面自動 smooth-scroll 到主區頂端的總計列，再也不用自己滾下去看花多少 gil',
      '【跨服比價回到 drill-down】v2.9.0 把舊版的 cross-world 跨服價格表洗掉了，這版補回 — drill 開時自動拉 garlandtools / Universalis 跨 DC 比價，列在「直購本品 vs 材料自製」下面',
      '【查價失敗 per-row 重試】Universalis 偶爾會掉部分回應，現在每列遇到查價失敗會在單價欄出現一顆「查價失敗 重試」chip 直接點重打；總計列右上角會出現「N 列查價失敗」warn 計數',
      '【分享下拉】總計列「分享連結」改成 dropdown，多了「複製材料清單 (Markdown)」一鍵帶純文字材料清單到 Discord/Notion',
      '【chip 圖示更直覺】取得方式 chip 從 M/C/G/N 字母換成 `⌖ ⚒ ⛏ ⛟` 符號，配合多語 fallback font 在 zh-TW/zh-CN/ja/en 都可讀',
      '【匯入體驗】Teamcraft 匯入對話框新增「填入範例連結」一鍵試用、>30 筆時顯示「比對中 12 / 38」進度計數、不再因匯入靜默觸發計算（v2.9.0 行為違反原 spec Q5）',
      '【技能翻譯修正】模擬器與批量製作頁面的 Immaculate Mend 由錯誤的「精修II」改回 zh-TW 社群通譯「巧奪天工」',
      '【匯入家具清單看得到名字】之前 Teamcraft 房屋家具列表裡的 NPC 商店／FATE 獎勵物品會顯示「物品 #6661」這種純 ID — 因為本地物品 DB 只收錄製作系統涵蓋的素材／成品。這版加了一層 lazy-loaded 的「extra shard」，匯入對話框遇到非製作物品時自動拉名字回來，cold-start 不變，9 成原本顯示 ID 的家具現在會看到實際名稱（如「沙之都風景畫」、「神學院書櫃」、「黑渦團團旗」）',
      '【非製作物品也納入採購清單】NPC 商店、FATE 獎勵、採集類物品從 Teamcraft 匯入後不再被丟掉，改成跟可製作目標並列在「完成品」群組裡 — 你可以為它們挑「市場 / NPC / 自採」chip，總價會把它們算進去。轉到批量計算時會自動跳過這些非製作物品（batch 仍只處理可做的目標）',
      '【內部】bom store 增 priceFetchStatus / fetchingPriceIds + hoist fetchPrices；BomCraftTreeNode 加「自製成本拆解」eyebrow 標題，desktop 與 mobile sheet 都套用；items DB 改採雙層 shard 架構（lean recipe-referenced + 懶載入 extra）',
    ],
  },
  {
    version: 'v2.9.0',
    date: '2026-05-05',
    highlights: [
      '【購物清單大改版】整頁 redesign 為決策 cockpit：左 sticky rail 放目標清單 + 查價設定 + 計算 CTA，主區是「素材取得決策表」hero。每筆素材一列，可選 市場 / 自製 / 自採 / NPC 四種取得方式，總價與「估省 vs 全部市買」即時更新',
      '【最划算自動套用】算完後系統會自動為每筆素材挑選 {市場, 自製, NPC} 中最便宜的一種（自採排除，因為它是時間成本不是 gil 成本）；自製成本 = 子配方遞迴；NPC 售價來自 garlandtools',
      '【取得方式智慧過濾】每筆素材的 chip 會根據 garlandtools 資料隱藏不適用選項：純採集礦不顯示「自製」、半成品不顯示「自採」、沒 NPC 售的不顯示 NPC',
      '【Teamcraft 匯入／匯出】貼 `https://ffxivteamcraft.com/import/...` 連結直接匯入；ReMakePlace、MakePlace 等工具的 export 也通用。同時可從總計列「分享連結」一鍵複製 Teamcraft URL 帶走清單',
      '【自製拆解 row drill-down】craftable row 點任意位置（chip 除外）即展開子配方對比面板，顯示「直購本品 vs 材料自製」與差價，水晶以橫條 chip 收合不佔列數',
      '【批量製作入口】總計列「轉到批量計算」一鍵把目前 BOM 目標送進 batchStore 跳轉 /batch，銜接後續製作流程',
      '【視覺對齊吐司工坊設計系統】cocoa 主色（crafting zone）；rail 是單張卡，內部用 dashed divider + mono eyebrow label 切段，沒有 box-in-box；Jam-Jar Rule 守住 — 自製 chip 用 cocoa，其他三個 active chip 用深暖棕中性色',
      '【內部】新增 `services/teamcraft-import.ts` parser/builder（含 39 個單測）、`services/item-acquisition.ts` 整合 garlandtools；BOM store 加 `acquisitionMode` / `expandedRows` / `acquisitionAvailability` 與 `applyOptimalDefaults()`；元件拆出 BomDecisionRow / BomDecisionTable / BomCraftTreeNode / BomTotalsBar / BomSettingsCard / BomImportDialog',
    ],
  },
  {
    version: 'v2.8.0',
    date: '2026-05-05',
    highlights: [
      '【就地填配裝】模擬器、批量製作、首頁的「前往設定」入口不再跳到配裝管理頁；改成從畫面底部滑出 sheet，當下就能編輯 8 職數值，關閉後回到原本的配方／佇列／食藥設定，不被打斷',
      '【模擬器等級守門】選到的配方等級超過該職等級時，模擬器顯示警告 banner（遊戲本身就會禁止製作），cockpit 區暫時鎖定，按「調整配裝 ▾」就地修正後即可繼續',
      '【批量製作軟提醒】batch 內若有配方等級超過該職等級，會在「開始最佳化」上方顯示提醒 alert（可繼續執行，因可能是先規劃未來目標），對應的 recipe 卡片上會出現 cocoa 色 `Lv X · 需 Y` chip 提醒，點擊可直接開 sheet 修正',
      '【批量製作守門】若批次裡有任何職還沒設定數值，「開始最佳化」按鈕會先打開 sheet 並聚焦到第一個缺的職，避免無解結果',
      '【模擬器配裝快捷】sidebar 左欄頂部新增 ⚒ 配裝 quick-action 按鈕，隨時開 sheet；缺數值 / 等級不足時按鈕變橘色並帶警示點，手機版同樣 teleport 到上方 bar',
      '【內部】`GearsetSheet.vue` 抽為共用元件供四處使用；移除 SimulatorView / DashboardView 多處 `router.push(\'/gearset\')`，僅保留 onboarding 流程的首次導頁與 sidebar 主選單路由',
    ],
  },
  {
    version: 'v2.7.0',
    date: '2026-05-05',
    highlights: [
      '【批量採購數量修正】食物／藥品配方（每次製作產出 3 份）的買 vs 自製判斷與材料量都會錯算：門檻把「每次 craft 的素材成本（=3 份的成本）」直接拿來跟「單份買價」比較，過度偏向直購；自製時材料又按使用者填的份數整份再乘一次。現在統一以 `amountResult` 換算「想要的份數 → 製作次數」，閾值改成 per-output 比對，材料按實際 craft 次數算',
      '【份數標示更清楚】批量製作與購物清單的目標卡片永遠顯示「× N 份」徽章，amountResult > 1 的配方額外顯示「每次製作產出 M 份 → 共 K 次製作」黃字提示，手機版終於看得出輸入框是份數而非無單位數字',
      '【NQ／HQ 拆分說明】當系統因部分配方需要 HQ 起手品質而把同一素材拆成兩列（一列 NQ、一列 HQ）時，新增首次提示橫幅說明「這不是顯示錯誤」；按「知道了」後改顯示一個 `?` chip，點擊可隨時重看說明，狀態跨會話保留',
      '【採購進度分母修正】在「自製建議」勾選把某成品改為自製後，採購清單會即時把該成品換成原料，但底下「採購進度 0 / N 完成」的分母還是用最佳化器初始輸出，不會跟著動；現在改用實際顯示的清單來算',
      '【內部】`Recipe` interface 加入 `amountResult` 並從 RecipeRecord 端到端 plumb；`RecipeOptimizeResult` 新增 `outputAmount` 與 `quantity`（craft 次數）兩種語意；BOM tree expansion 同步以 amountResult 套用 ⌈amount/yield⌉ 換算',
    ],
  },
  {
    version: 'v2.6.0',
    date: '2026-04-28',
    highlights: [
      '【觀測指標擴充】補上 Web Vitals（LCP / CLS / INP / FCP / TTFB）、Universalis 市場 API 成功率與耗時、求解器裝備區段（entry / mid / bis 三段）、配方搜尋關鍵字與無結果率、WASM 載入失敗與 SharedArrayBuffer 不可用的 canary 事件',
      '【內部】GA4 註冊 24 個 custom dimension / metric，並建立「吐司工坊」儀表板的 4 區塊（使用者規模 / 功能使用 / 效能與穩定 / 玩家洞察）',
      '【內部】新增 web-vitals 套件、gear-bucket 分類器與單元測試；Universalis fetch 重構為支援可選追蹤參數，metadata 端點不污染成功率指標',
    ],
  },
  {
    version: 'v2.5.0',
    date: '2026-04-28',
    highlights: [
      '【主題切換移到頁首】右上角新增 light / dark 切換按鈕，一鍵切換主題；設定頁的主題選擇器同步移除避免重複',
      '【匿名使用統計】補上頁面瀏覽、求解器、批量製作、配方選擇等事件的匿名統計，未來可依實際使用狀況排序新功能優先序；production 錯誤也會自動上報以便回頭排查（不收集任何個人資料）',
      '【設計系統文件】新增 DESIGN.md / DESIGN.json，把吐司工坊的色票、字體、間距、元件 token 正式定稿',
      '【內部】.tmp/ 暫存目錄正式列入慣例，驗證截圖與 UI 比對素材集中管理；mobile UX backlog 文件整理',
    ],
  },
  {
    version: 'v2.4.0',
    date: '2026-04-28',
    codename: 'Open Counter',
    highlights: [
      '【Dashboard 寬螢幕版面】首頁改為寬螢幕專屬 editorial layout，把批量製作做成 hero 切片區塊，桌面寬螢幕視野完整利用；非寬螢幕沿用既有版型',
      '【模擬器寬螢幕 Cockpit】模擬器改為寬螢幕 cockpit layout，加入 flow breadcrumb 流程列；solver 控制區改為 hero hub（大 CTA + italic hint），求解中以 progress bar + 取消鈕共占同一空間',
      '【HQ 推薦清單重設計】HQ 推薦從表格改為 top-2 可可色清單，凸顯最便宜兩組，套用按鈕重設計；缺價提示也只針對實際顯示的組合',
      '【更新日誌 Parchment Poet 重設計】最新版本升格為 hero（Cormorant italic eyebrow + 金線 underline + 雙行 highlight）；舊版本改為月份 ledger（dot ● 重大／更新、○ 修正 + 一行摘要），密度與可讀性大幅提升',
      '【修正 HQ 推薦消失 bug】路由切換回模擬器後 HQ 推薦偶爾不出現：WASM ready waiter 從單一 callback slot 改為 queue，多元件並發 register 不再互相蓋掉',
      '【Dashboard 文案】批量製作 CTA 副文案從「5 分鐘搞定一爐 100 件」改為「30 分鐘內搞定籌備任務」，更貼近實際使用情境',
    ],
  },
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
