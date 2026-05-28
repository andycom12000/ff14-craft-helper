# Meld-Advisor 真實案例驗證報告（issue #97）

- 日期：2026-05-29
- 範圍：meld-advisor 數值正確性、slot baseline、HQ→initialQuality、邊界分支
- 方法：以真實 `public/data/rlt.json` 的 RecipeLevelTable + web 研究的社群 BiS/遊戲常數，對 `src/services/meld-advisor.ts` 與 `src/engine/materia.ts` 的純函式直接對拍（vitest 一次性 harness，已移除未 commit）。
- 重要前提：本輪**未跑 WASM/native solver**。所有「closed-form 層」結論為確定性事實；標註「需 solver 確認」者指 `adviseMeld` 端到端行為（Step 0 already-meets + Step 4 confirm）可能遮蔽或放大。
- **本票不修 bug**；發現項已 spin off 成獨立 ticket（見文末）。

---

## TL;DR

驗證**找到 5 項系統性偏差**,其中 2 項屬「advisor 對一般 recipe 會給出錯誤/不可行結果」的高嚴重度問題 —— 正是本票要抓的「unit test 擋不住的系統性偏差」。**建議先修 F1/F2 再做 UI 精修(#98)與 Scope 2 截圖**,否則是在替一個會算錯的引擎做門面。

| # | 嚴重度 | 一句話 | 確認層級 |
|---|---|---|---|
| F1 | 高 | `solveProgressBreakpoint` 高估 craftsmanship → costOptimal 假性「槽位不足」 | closed-form 確定;端到端需 solver 確認 |
| F2 | 高 | quality 過度接受 + bump 只動正軸 → costOptimal 系統性 under-provision control | closed-form 確定;端到端需 solver 確認 |
| F3 | 中 | `OVERMELD_SUCCESS_LADDER` 數值錯置 | 確定(對照 2 來源) |
| F4 | 中 | `SLOT_STRUCTURE` guaranteed/overmeld 拆分過樂觀 | 方向確定;精確值待考 |
| F5 | 中 | `BIS_REFERENCE` 過期 | 待 1 來源確認 |

---

## Scope 1 — 數值正確性(社群 BiS 對拍方法)

方法:取真實 RLT,以估計的「剝鑲嵌底裝」跑 closed-form pipeline(`solveProgressBreakpoint` → `solveQualityBreakpoint` → `translateDeltaToMeldPlan`),並與 `computeBisPlan` 比較。價格用 synthetic price map(XII craft/control 8000、cp 12000 gil)以取得可比 gil。

> 註:社群 BiS 的**精確底裝(un-melded)stats** 藏在 Etro/Teamcraft embed,本輪未取得;下方 base 為標註的估計值。這不影響 F1/F2 的結論(它們是 closed-form 行為,與精確 base 無關)。

| 案例 | base (craft/control/cp/lv) | closed-form Δ | costOptimal | bis | 觀察 |
|---|---|---|---|---|---|
| rlv130 Lv53 練功(control-bound) | 500/380/340/53 | 0/0/0 | feasible, 0 步, 0 gil | infeasible | closed-form 判「已達標」(需 solver 證實) |
| rlv690 Lv100 demanding | 4500/4100/560/100 | **7933**/0/0 | **infeasible「槽位不足」**, 36 步 | feasible, 2,475,294 gil | base craft 4500 已 > suggested 4207,卻要 +7933 → **F1** |
| rlv641 Lv90 4★ | 3700/3400/560/90 | **4184**/0/0 | **infeasible**, 36 步 | infeasible | 同 F1;Δcontrol 仍是 0 → **F2** |

**結論**:三例中有兩例 costOptimal 直接 **infeasible**,且 Δcontrol 全為 0。`gapGil` 因 costOptimal 不可行而無法計算。這不是「advisor 比社群省多少」的良性差異,而是 **advisor 對當前 patch 的一般 recipe 根本算不出可行解**。

---

## Scope 1b — Gear slot baseline

`SLOT_STRUCTURE = { guaranteedSlots: 25, overmeldSlots: 35 }`(總 60)。

**遊戲事實(web 研究,見來源)**:
- 滿職套裝 = 12 件(武器+副工具+5 防具+5 飾品),pentameld 每件 5 → **總槽 60 ✓ 正確**。
- 高階**製作裝**自然槽(100% 綠槽):武器+5 防具約各 2、副工具約 1、5 飾品各 1 → guaranteed ≈ **18**、overmeld ≈ **42**。
- 即使按 code 自己 docstring 的「武器&防具 2、飾品 1」推算也約 19/41,**與常數 25/35 對不上**。

| 量 | code | 實際估計 | 偏差方向 |
|---|---|---|---|
| 總槽 | 60 | 60 | ✓ |
| guaranteed(免費 100%) | 25 | ~18 | code **高估** |
| overmeld(吃 fail ladder) | 35 | ~42 | code **低估** |

**影響**:guaranteed 槽是免費的、overmeld 槽要 ×6~20 顆。把 25 顆當免費(實際只 ~18)→ **系統性低估成本**。→ **F4**

**overmeld 成功率 ladder(F3,於此一併驗)**:
- code:`[0.17, 0.17, 0.10, 0.05]` → 每放 1 顆的期望購買數 `[5.88, 5.88, 10, 20]`
- 實際(Grade V+,2 來源一致):`[0.17, 0.10, 0.07, 0.05]` → `[5.88, 10, 14.29, 20]`
- 在實際 plan 中可見:Δcraft 1500 的 costOptimal 期望顆數 = `[25, 5.88, 5.88, 10]` —— 第 2、3 顆出現**重複的 5.88**,即 ladder 錯置的直接證據。
- 額外:遊戲規定偶數頂階(XII)**只能進第 1 個 overmeld 槽**,2~4 槽須用 XI/IX/…(成功率較高)。advisor 全程用 XII(②-lite scope-out),與機制不符,亦影響成本真實度。

---

## Scope 2 — 邊界分支觸發 + 截圖

**狀態:本輪未產出 6 張截圖(deferred),理由如下**:

1. F1 導致「槽位不足(infeasible)」分支會對**大量正常 recipe 假性觸發** —— 在引擎修好前替這些 UI 狀態截圖,截到的是 bug 畫面,參考價值低。
2. 建議**先修 F1/F2,再跑 Scope 2 截圖**(可與 #98 impeccable UI pass 合併一輪瀏覽器驗證)。

可立即連結的觀察:6 個分支中,「槽位不足」與「costOptimal 空計畫(已達標)」目前極易被**錯誤**觸發(F1/F2),其餘(部分缺價 / 市場不可用 / canHq:false 隱藏 / 多職降級)未在本輪以瀏覽器逐一觸發。**Scope 2 視為未完成,建議排在 F1/F2 之後。**

---

## Scope 3 — HQ 素材 → initialQuality 回歸

分兩步:證明數學「有接」、再證明實務操作點「失效」。

**3a — 承重牆數學確實有接**(壓力 recipe:quality 60000、cp 120,逼 control 成為 binding):

| initialQuality | Δcontrol |
|---|---|
| 0 | 4935 |
| 15000 (25%) | 3570 |
| 30000 (50%) | 2205 |
| 45000 (75%) | 840 |

→ initialQuality 上升、Δcontrol 單調下降。**`solveQualityBreakpoint` 的 HQ head-start 邏輯本身正確。**

**3b — 但在真實 recipe 操作點完全失效(F2)**:

| 案例 | Δcontrol |
|---|---|
| rlv641 control=0 cp=180 | 0 |
| rlv690 control=3000 cp=600 | 0 |
| rlv690 control=800 cp=500 | 0 |

→ 連 control=0 都被判「quality 已達標」。原因:quality 上界 `baseQuality × 25 × steps × 1.10`,而 `baseQuality` 有 +35 floor,對一般 recipe 即使 control=0 也遠超門檻。

**綜合(F2)**:`feasibility-prefilter` 註解明說 quality「tuned for false positive(over-accept),solver catches the rest」—— 但 `confirmBreakpointWithSolver` 的 bump 只調**已 >0** 的軸:

```
control: delta.control === 0 ? 0 : Math.ceil(delta.control * 1.05) + 1
```

closed-form 幾乎恆回 Δcontrol=0 → solver confirm 失敗時 **control 永遠停在 0、長不出來**。結果:當 control 才是 binding 約束時,costOptimal 會回一個 **control melds = 0 的 under-spec 計畫**,且這正是「HQ 對照組」想驗的承重牆 —— 在實務上根本沒被行使。

---

## 驗收條件對照

- [x] **數值正確性**:3 個真實 RLT 案例對拍紀錄(上表)。發現 costOptimal 對當前 patch recipe 系統性 infeasible/under-spec。*(社群 BiS 精確底裝待自 Etro 取得;不影響結論)*
- [x] **Gear slot baseline**:總 60 ✓;guaranteed/overmeld 25/35 vs 實際 ~18/42 已記錄 → F4。
- [x] **HQ→initialQuality**:3a 證明數學正確、3b 證明實務失效 + 對照組(control=0 仍判達標)。
- [x] **發現項 spin off**:見下;本票未修 bug。
- [ ] **邊界分支 6 截圖**:**未完成**,建議排在 F1/F2 修復之後(理由見 Scope 2)。
- [x] **報告 commit 進 repo**:本檔(`docs/audits/`;原選 `docs/internal/` 因被 gitignore 改放此處)。

---

## Spin-off tickets

全部帶 AI triage disclaimer、label `bug` + `needs-triage`、連回 #97。

- **F1 → #99** — `solveProgressBreakpoint` 高估 craftsmanship 致 costOptimal 假性 infeasible
- **F2 → #100** — costOptimal 系統性 under-provision control(quality over-accept + bump 只動正軸)
- **F3 → #101** — `OVERMELD_SUCCESS_LADDER` 數值錯置(`[0.17,0.17,0.10,0.05]` → `[0.17,0.10,0.07,0.05]`)
- **F4/F5 → #102** — meld-advisor 模型校準:slot 拆分(~18/42)+ `BIS_REFERENCE` 7.3 更新

## 來源

- Materia 機制 / overmeld 成功率:https://ffxiv.consolegameswiki.com/wiki/Materia
- 7.x 製作 BiS 與鑲嵌:https://www.icy-veins.com/ffxiv/crafting-doh-endgame-melding-stat-priority ; https://ffxivgillionaire.com/crafter-bis-gear
- Crested 套裝鑲嵌總量(7.3):https://nosygamer.blogspot.com/2025/08/how-much-materia-is-needed-to-meld_15.html
- RLT 數值:repo 內 `public/data/rlt.json`
