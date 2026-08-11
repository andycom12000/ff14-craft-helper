# ADR 0003: 等級同步在「配方 × 裝備組」交會點計算，canonical 配方保持未同步

**Status:** Accepted
**Date:** 2026-08-11
**Context:** 使用者回報宇宙探索出現一種「接取任務時會同步等級」的配方，本站沒有這套機制。詳見 [CONTEXT.md](../../CONTEXT.md) 的「等級同步配方」與「資料責任分界」。

## 機制（已對實機驗證）

`Recipe` sheet 的 `MaxAdjustableJobLevel` 欄非 0 即代表該配方可調整；全遊戲僅 768 個配方符合，全部是宇宙探索 D／C／B 級任務用配方，且全部寫在 `MaxAdjustableJobLevel = 100`、`RecipeLevelTable = 690`。換算規則：

```
L    = min(製作者該職業等級, recipe.maxAdjustableJobLevel)
rlv' = GathererCrafterLvAdjustTable[L].RecipeLevel
base = RecipeLevelTable[rlv']

難度 = floor(base.difficulty × recipe.difficultyFactor / 100)
品質 = floor(base.quality    × recipe.qualityFactor    / 100)
耐久 = floor(base.durability × recipe.durabilityFactor / 100)
進度／品質的 divider 與 modifier、星數、等級一律改用 rlv' 這一列
```

製作者的作業／加工／CP **不**受同步影響（無裝等 sync）。

實機對拍兩組，6/6 精確命中：

| 職業／等級 | 配方 | rlv' | 計算值 | 實機 |
|---|---|---|---|---|
| CRP 94 | 研究用的木材（36168，61/48/50） | 660 | 2928 / 4512 / 40 | 2928 / 4512 / 40 |
| WVR 90 | 統一規格的棉線（36480，61/48/50） | 560 | 2135 / 3456 / 40 | 2135 / 3456 / 40 |

`GathererCrafterLvAdjustTable` 另有一欄常被誤認為配方等級的 `Unknown1`。判別依據：正確欄位換算出的列必須滿足 `ClassJobLevel == 製作者等級 && Stars == 0`。`RecipeLevel` 欄 100 級全數通過，`Unknown1` 欄違反 29 次（例：Lv61 會對到 rlvl 204，那是 Lv60 ★★ 的列）。此性質已固化為不變式測試。

## Decision

**同步在「配方遇上裝備組」的交會點計算，配方本身永遠以未同步形式流通。**

- 配方載入路徑不做同步，回傳的永遠是未同步的原始配方（Lv100 / rlvl 690），作為 canonical 資料。
- 同步是一個純函式：`(配方, 製作者等級) → 配方`，回傳同樣的配方形狀。
- 呼叫點收斂到「配方 × 裝備組」交會處。**實作後的實際清單（七處）**：

  | 交會點 | 位置 | 用途 |
  |---|---|---|
  | 模擬器 craft params | `src/composables/useSimulator.ts` | 求解、顯示、鑲嵌建議、初期品質 |
  | 批量求解 | `src/services/batch-optimizer.ts`（Phase 1a，與 pin 給求解的 gearset 同源）| 每項用各自職業的等級 |
  | 批量快速採購 | `src/services/batch-optimizer.ts`（quick-buy 分支）| 待辦清單顯示 |
  | 批量等級門檻橫幅 | `src/services/batch-level-gating.ts` | `checkLevelGate` 判定 |
  | 批量配方卡 | `src/components/batch/BatchRecipeCard.vue` | 顯示 + 等級 pill |
  | 配方詳情 | `src/views/RecipeView.vue` | 顯示 + 降級標示 |
  | 自製建議子材料 | `src/services/self-craft-candidates.ts` | 等級預篩 + 子配方求解 |

- 顯示層、等級門檻判定、名匠洞察力判定一律吃同步後的值——同步後它**就是**那個等級的配方。
- **消費端若自己去讀 `recipeStore.currentRecipe`，就繞過了交會點**。這類元件必須改吃 prop（由已同步的上游餵入），不能讀 store。
- 換算表隨既有資料管線產出，與配方等級表同檔；資料不全在 build 階段就失敗，不留到 runtime。

## Considered Options

**在配方載入時 bake 進 store。** 這是最初的方案，在「同步等級由使用者手動指定」的前提下成立。改為全自動、等級來自裝備組之後就崩了：載入時手上沒有裝備組，而使用者載入配方後才去改裝備組等級是完全正常的操作順序——baked 的值會靜靜地停在舊等級，畫面看起來一切正常。這是本 ADR 存在的主因。

**全域 derived computed。** 表達不了批量佇列跨職業的情形：佇列裡每一項要用**各自職業**的等級，單一全域值無從表達。

**型別手術（把配方等級表從配方型別上移除，強制編譯期呼叫）。** 量測後否決：該欄位在 `src/` 有 125 處、橫跨 44 個檔案（production 約 18 檔），為 768 個配方做這種規模的改動比例不對。決策維持不變，但**當初「收斂到兩個交會點、風險面小到測試即可完全覆蓋」的估計是錯的**——見 Consequences。

## 明確排除

- **任務層**（任務 → 配方群組、銀星／金星評分門檻）。評分相關 sheet 目前連欄位名都尚未被社群還原。
- **宇宙探索專屬技能**。同步任務中的製作任務共 624 個：496 個（79%）無臨時技能、96 個（15%）給 Material Miracle、32 個（5%）給 Stellar Steady Hand。上游 raphael 只實作了後者（前者全 repo 零命中），而我方 wrapper 已有 `stellar_steady_hand_charges` 欄位但寫死 0。接出來需 rebuild WASM 並 bump `SOLVER_CACHE_EPOCH`（使全站解答快取失效），僅為涵蓋 5% 的同步任務，且充能數住在被排除的任務層。此議題與等級同步正交（同樣技能亦出現在不同步的 A／EX 任務），應獨立評估。

## Consequences

- Lv100 使用者的數字完全不變——同步在等級 100 時是恆等變換。實際受益者只有拿宇宙探索練級的 sub-100 玩家。
- 裝備組等級成為同步結果的唯一輸入。裝備組等級停在預設 100 的低等玩家會拿到 Lv100 難度、算出他做不到的手法，且畫面無異狀。這是「資料責任分界」下的刻意取捨，不加防呆。
- 解答快取不需處理：快取鍵是整份 solver 設定的 canonical JSON，同步後數值不同自然產生不同鍵，**不需要** bump `SOLVER_CACHE_EPOCH`。
- **GA 的 `rlv` 維度刻意回報未同步的值。** 同步後配方的 `rlv` 是換算過的，但 `/admin/ga` 的 ToolUsageByRlv 一列混了兩種來源：select／simulator 依事件當下 client 送的 `rlv` 分組，batch／bom 則是拿 `recipe_id` 去 join 當日的 `recipes.json`（見 `ga-snapshot.ts`）。若送同步後的 rlv，這 768 個配方會散進 `recipes.json` 裡根本不存在的 rlv 列。因此同步後的配方帶一個 `canonicalRlv`，taxonomy 讀它而非 `rlv`。代價是 GA 看不出「這次求解實際打的是哪個同步等級」——需要的話應該另開一個維度，而不是污染 `rlv`。
- 768 個同步配方在資料上全部乾淨（0 個 expert、0 個需專精、0 個屬性硬門檻、0 個 RequiredQuality、全部可 HQ、0 個需祕籍），因此不需處理與這些機制的交互。此性質未來可能改變。
- **交會點是七個而不是兩個，這個低估在實作時被 code review 抓到。** 原本的推論是「下游消費端都由那兩個交會點餵資料」，但實際上顯示層（配方詳情、批量卡片、批量等級橫幅）、批量快速採購、以及自製建議子材料求解都各自持有配方與裝備組，不經過那兩點。最嚴重的一個是 `InitialQuality.vue`：它不吃 prop、直接讀 `recipeStore.currentRecipe`，於是用**未同步**的品質上限算初期品質，再經 `craftParams.initialQuality` 進 solver 的 `initial_quality`（無 clamp）——等於騙求解器已有一段不存在的品質，解出來的手法在遊戲裡出 NQ。768 個同步配方中有 144 個 `materialQualityFactor > 0` 會踩到。
  真正的風險面不是「交會點有幾個」，而是**「有幾個地方直接讀 `recipeStore.currentRecipe` 的 `recipeLevelTable`」**。日後新增讀取點時，這是該檢查的不變式。
- **同步函式只有 `canonicalRlv` 是 re-sync-safe，`levelSync` 不是。** 重複同步一個已同步的配方時，`canonicalRlv` 會保留最初的原始 rlv，但 `levelSync.originalLevel` 讀的是輸入配方的 `level`，會變成上一次的同步等級而非真正的原始等級（標示就會顯示「94 → 90」而不是「100 → 90」）。目前七個呼叫點餵進去的都是 canonical 未同步配方，所以這條路徑不可達——**這是靠呼叫端維持的前提，不是函式自己保證的**。要支援 re-sync 就得先修 `levelSync`。
