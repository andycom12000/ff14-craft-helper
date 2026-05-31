# ADR 0002: 鑲嵌建議以「有界 solver 成本搜尋」為權威，closed-form 降級為種子

**Status:** Accepted
**Date:** 2026-05-31
**Context:** Issue #123（承 #97 稽核的 F1/F2 系統性偏差）。鑲嵌建議引擎對「裸裝差一點就能 HQ」的情境，推薦了鑲在昂貴繞路、數量爆量、但「技術上能 HQ」的方案（如：差 243 品質卻建議 400+ 顆作業魔晶石、約 8 萬 gil）。根因是引擎以 closed-form 公式選軸＋估量、solver 只驗「能否 double-max」，整條管線沒有任何一步在管「最省」。詳見 [CONTEXT.md](../../CONTEXT.md) 的「製作能力與資源耦合」與「鑲嵌建議」。

## Decision

鑲嵌建議的正確性權威是**真 solver（Raphael）**，不是 closed-form 公式。引擎改為 **有界成本搜尋（bounded cost search）**：

- 搜尋空間：三維 Δ(作業 × 加工 × CP)。
- 目標：在「solver 能 double-max（保證 HQ）」且「總鑲嵌量 ≤ 實際槽位（`SLOT_STRUCTURE` 60 格）」的方案中，**總 gil 最低**。
- 界線（避免暴力爆炸）：外層只試一個很短的**作業階梯**——「剛好 secure 進度」起，每階多到「可少做 1 步進度」，到「進度 1 步做完」封頂（進度步數本就只有少少幾步）；每一階用 solver 收斂出最省的加工(＋CP)，全部比 gil 取最低。
- 缺市場價時：改以「總鑲嵌顆數 / 占用格數最少」為排序依據（gil 不可得）。

**closed-form（原 F1 `solveProgressBreakpoint`、F2 `quietCanReachHQQuality`/`canReachHQQuality`）降級為非綁定種子**：只用來猜搜尋起點以減少 solve 次數，猜錯不影響正確性（solver 會修）。因此不再花力氣「修對」其數值；同步清除說謊的 `PROGRESS_REACHABLE_FACTOR` 註解，以及由灌爆種子觸發的假性「槽位不足，需換底裝」。

### 正向 substrate ／ 逆向搜尋 ／ 正向試算台

鑲嵌建議統一在「鑲嵌工作台（Meld Workbench）」框架下，兩種模式共用同一個**正向 solver substrate**（`solveCraftForRecipe` / `simulateCraftForRecipe`）：

- **正向（試算台）**：使用者自擺鑲嵌（grade／顆數）→ 即時看素質、能否 HQ。重用 #124 的「套用鑲嵌（模擬）」session-only override 作素質覆蓋。對齊社群工具體驗，且我們多了真 solver 自動找手法。
- **逆向（最佳化）**：本 ADR 的有界成本搜尋——本質是**在候選鑲嵌素質上反覆呼叫正向 substrate**（solver double-max 判定）挑最省。逆向不是另一套引擎，是正向的搜尋外殼。

整合點：逆向算出的最省方案可一鍵**載入正向試算台**繼續微調（改 grade／顆數即時回饋）。逆向給答案、正向讓使用者驗證與調整，形成閉環。

## Rationale

- **作業與加工耦合**：兩者搶同一份耐久＋CP 預算（見 CONTEXT.md）。closed-form 把它們當獨立軸估，必然在耦合處出錯——這已是同一塊引擎第 N 次 case-by-case 修補（#94/#99/#100/#101/#102/#105/#123）。打地鼠的根因是「用近似公式扮演權威」。
- **solver 本來就在 loop 裡**：`adviseMeld` 已是 async，Step 0（already-meets）與 Step 4（confirm）本就呼叫 `deps.solve`。改以搜尋為權威不是引入 async，而是把既有 solver 從「事後驗章」升級為「主導選擇」。
- **嚴謹度勝過 closed-form**：純啟發式規則「作業只補到 secure 進度、品質一律補加工」覆蓋 ~99% recipe，但在**進度要求極低、品質要求極高**的 recipe 會錯——此時灌作業壓縮進度步數、把預算全還給品質，可能比直接補加工更省。有界搜尋吃得下這族群。
- **產品定位（賣點）**：現有工具（Teamcraft / Ariyala）只做**正向**估算（先給鑲嵌、估幾顆魔晶石），社群靠 breakpoint 直覺手動湊。**沒有任何主流工具做「給目標 HQ、自動反推最省鑲嵌」**。本決策讓吐司工坊成為唯一提供此自動化的工具——且因逆向是搭在我們已有、已上線的正向 substrate 上，兩模式合成單一「鑲嵌工作台」：逆向自動給最省、正向讓使用者 what-if 微調，正向那半對齊社群、逆向那半是獨家。
- **成本可接受**：鑲嵌建議是使用者手動觸發的非熱路徑，多跑數十次 solve、慢數秒可接受。

## Consequences

- 每次鑲嵌建議的 solve 次數從個位數升到數十次（有界、有 hard cap backstop）；UX 上是「按一下、轉幾秒」。
- 引擎輸出符合三條合約：保證 HQ ＋ 最省 gil ＋ 符合現實槽位。重現案例會從「400+ 顆作業」收斂到「少量加工」。
- closed-form 數值正確性不再是正確性來源，後續不必再開「修 F1/F2 數值」類 ticket；種子偏差只影響速度。
- 假性「槽位不足」與「假性已達標（0 鑲嵌）」兩類誤報一併消除（後者見 [[project_meld_advisor_zero_delta_bug]]）。
