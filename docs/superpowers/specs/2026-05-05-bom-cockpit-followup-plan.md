# BOM Decision Cockpit — Follow-up Plan

**Status**: Plan, awaiting confirmation
**Date**: 2026-05-05
**Predecessor**: `2026-05-05-bom-decision-cockpit-design.md` (shipped at v2.9.0)
**Surface**: `src/views/BomView.vue` + `src/components/bom/`
**Register**: product

---

## 1. Why this exists

The v2.9.0 BOM cockpit ships the core idea (decision table, Teamcraft import, optimal-default mode picker) but leaves a handful of items from the original brief partially or unimplemented. This plan collects them, plus a small set of post-ship UX issues the user surfaced during review, and groups them by priority so the next pass is targeted.

The plan deliberately **does not** retread parts of the brief that already shipped. For full context on rationale, layout, color, and out-of-scope decisions (Q1–Q7), see the predecessor brief.

---

## 2. Issues vs. brief

### Critical (functional bugs / regressions)

| # | Brief reference | Current state | Why it matters |
|---|---|---|---|
| **C1** | §11 Q5 「匯入後不自動計算，停在『已匯入』由使用者觸發」 | `BomView.handleImported` calls `void handleCalculate()` after import | Direct violation of confirmed decision — user explicitly chose manual trigger. A previously-matching list shouldn't be silently re-fetched on import |
| **C2** | §7 主流程 6.「Cross-world price 詳情仍透過 row 展開（沿用 CrossWorldPriceDetail）」 | New drill-down panel only shows craft-vs-buy comparison; the `CrossWorldPriceDetail` cross-server price grid is gone | Power users who built habits around per-row server price comparison lost a feature |

### Real UX gaps (brief items not yet implemented)

| # | Brief reference | Current state | Notes |
|---|---|---|---|
| **U1** | §6 「Price fetch failed (per row)」: row 顯示「查價失敗 重試」、總計列 warn | Whole-batch error toast only; no per-row retry affordance | Universalis regularly returns partial failures; per-row retry is the right granularity |
| **U2** | §7 主流程 2.「計算結束自動 scroll 到主區頂端總計列」 | No scroll; main pane stays where it was | One `nextTick` + `scrollIntoView({ block: 'start', behavior: 'smooth' })` |
| **U3** | §5 `<900` viewport: 「目標收成 chip 摘要 + 抽屜」 | Single-column stack of full target table | Matters on phones — current stack pushes the decision table below the fold of every page |
| **U4** | §6 mobile 「drill-down → bottom sheet」 | Container-query inline expansion | Inline drill on a 375px-wide screen is cramped; bottom sheet is the spec'd answer |

### Polish (brief content that survived but didn't get fully wired)

| # | Brief reference | Current state |
|---|---|---|
| **P1** | §10 「Acquisition source vocabulary」 chip 圖示 `⌖ ⚒ ⛏ ⛟` | Single ASCII letters `M C G N` |
| **P2** | §7 Export flow 1.「總計列右上角『分享 ▾』menu」 | Single-action「分享連結」button (no menu surface) |
| **P3** | §8 主區「Drill-down 標題」「自製成本拆解」/「市場 vs 自製對比」 | No explicit section title in the drill panel |
| **P4** | §6 Import dialog · empty 「輸入框 + 範例 + 支援來源說明」 | Has placeholder + 副標, but no example URL the user can one-click try |
| **P5** | §8 動態範圍 「Import URL ≈ 200+ 筆，不另設上限」 | Untested at that scale; garlandtools 6-worker pool will take ~7s for 200 items, no progress indicator |

### Code hygiene

| # | What | Action |
|---|---|---|
| **H1** | `src/components/bom/BomMaterialRow.vue` is orphaned (last importer was the deleted `BomCraftTree.vue`) | Delete |

### Confirmed deviations FROM the brief that we keep (not gaps, recorded for accuracy)

These are **intentional improvements** the user requested mid-build. They contradict the original brief but reflect post-discovery decisions and supersede the original spec:

| Brief said | We ship | Why |
|---|---|---|
| 「Calculated · default = 全部市場買」 | Default to **cheapest of {market, craft, npc}** (gather excluded) | Pragmatically more useful; user explicitly requested |
| Drill-down toggled by chev only | Whole row clickable when `craftable && mode==='craft'`; pills `stop.propagation` to keep their own click | Discoverability — original 24px chev was missed |
| 「展開▾」label in total cell | Just `—` (matches unit cell) | Removed misleading fake-button text |
| Active non-craft chip surface = `var(--app-surface)` (relied on shadow) | Active chip = `var(--app-text)` deep-brown bg + cream text | Original was invisible against row bg |
| Column `auto` for segmented col | Fixed-width 260px col with `justify-self: center` for chip group; explicit `1fr` filler col between qty and seg | Original drifted across rows because `auto` follows content; new layout aligns header + every row |

---

## 3. Implementation slices

Slice ordering reflects "fix bugs first, then restore lost features, then polish":

### Slice A — Critical (fast)
- **A1**: Remove `void handleCalculate()` from `handleImported` (one line). Replace with toast「已匯入，按計算開始拆解素材」or similar nudge.
- **A2**: Delete `src/components/bom/BomMaterialRow.vue` (orphan).

### Slice B — Lost feature: per-row cross-world price (medium)
- **B1**: Re-introduce `CrossWorldPriceDetail` inside the drill-down panel (`BomCraftTreeNode`). The existing component takes `data` + `loading` props; wire to `useCrossWorldPricing` composable that BomSummary uses.
- **B2**: Decide layout: cross-world detail ABOVE the children list, or as a tabbed sub-view inside drill-down. Default proposal: above (matches original UX).
- **B3**: Fetch trigger: on drill expand, call `fetchCrossWorldData(node.itemId)` if not cached. Loading state: skeleton inside the panel.

### Slice C — Per-row retry + warn (medium)
- **C1**: `bom store` track per-itemId fetch state: `priceFetchStatus: Map<itemId, 'ok' | 'failed'>`.
- **C2**: `BomDecisionRow` when row's status is `'failed'`: show inline「查價失敗 重試」chip in the unit cell.
- **C3**: `BomTotalsBar` show warn icon + count of failed rows when any row failed.
- **C4**: Retry handler: per-row「重試」calls `fetchPrices([itemId])` and updates status.

### Slice D — Calculate auto-scroll + mobile drawer + bottom sheet (medium-large)
- **D1**: After `handleCalculate` resolves, `nextTick(() => totalsBarRef.value?.scrollIntoView({ block: 'start', behavior: 'smooth' }))`.
- **D2**: `<900` viewport: replace stacked rail with a sticky chip summary at top of viewport (`× 帝國製強化纖維 3` `× 羊毛線 5` ...) + a「✎ 編輯目標」button that opens a bottom drawer containing the full target list + settings + calc CTA.
- **D3**: Drill-down on `<900`: when a craftable row is clicked open, instead of inline expansion, mount the drill content in an `el-drawer placement="bottom"` (or native sheet). Closing returns to the table.
- **D4**: Verify the bottom sheet doesn't break the `:focus-visible` keyboard path; trap focus while open.

### Slice E — Polish pass
- **E1**: Swap chip icon letters for the brief's unicode set (`⌖ ⚒ ⛏ ⛟`). Verify font fallback in 4 locales (zh-TW, zh-CN, en, ja). If a locale falls back ugly, keep the letter. Acceptance: visually clean in zh-TW (the dominant locale).
- **E2**: Convert「分享連結」button to「分享 ▾」el-dropdown with one item「複製 Teamcraft 連結」for now; gives room to add「複製 Markdown 清單」or similar later without UI churn.
- **E3**: Drill-down panel header: small mono eyebrow「自製成本拆解」above the comparison strip.
- **E4**: Import dialog empty state: add a「填入範例」link below the textarea, fills `https://ffxivteamcraft.com/import/NTM0MCw4LDM7NTMzNyw0LDU=` (or similar sample) so first-time users see the format.
- **E5**: Import progress indicator: when resolving > 30 entries, show a「比對中 12 / 38」counter that updates as `fetchItemAcquisitionBatch` workers complete.

---

## 4. Confirmed answers carried over

These remain unchanged from the predecessor brief and apply to all slices below:

- **Color zone**: BOM = crafting → cocoa accent only. Jam-Jar Rule still binding.
- **Flat-Until-Touched** still binding for any new card / panel introduced.
- **No-Gray Rule** still binding.
- **Baseline for 估省**: 全部市場買.
- **Target rows are immutable** (always craft).

---

## 5. Open questions

None I'm aware of — every item above maps to a specific section of the original brief or a user-acknowledged regression. If a slice surfaces an ambiguous design choice during implementation, raise it then.

---

## 6. Out of scope (still)

- Real Batch ↔ BOM merger (the「→ 批量計算」button continues to be the only handoff).
- Gathering-route map for items in `gather` mode.
- Other game tools' list formats.
- Teamcraft callback URL.
- Marketboard websocket / realtime price refresh.

---

## 7. Test additions per slice

Reuse the existing test layout (`src/__tests__/...`):

- **B**: extend `bom-cross-world` tests to cover the drill-down trigger path; mock `getAggregatedPrices`.
- **C**: `bom store` test for `priceFetchStatus` transitions; per-itemId retry call.
- **D**: viewport-snapshot integration test (Cypress / Playwright if added later) — for now, manual chrome-devtools-mcp at 375 / 768.
- **E**: snapshot test on chip render so swapping letter → unicode doesn't silently regress.

---

## 8. Recommended commit slices

Each slice → one commit, one feat/fix/refactor message. Don't bundle B with C (different concerns; bisect-friendly).

```
fix(bom): respect Q5 — don't auto-calculate after import     [A1]
chore(bom): remove orphan BomMaterialRow.vue                  [A2]
feat(bom): restore cross-world price detail in drill-down     [B]
feat(bom): per-row price-fetch retry + totals bar warn        [C]
feat(bom): auto-scroll to totals + mobile chip-drawer + sheet [D]
chore(bom): polish chip icons / share menu / drill title      [E]
```

Tag bump after slice D ships → `v2.10.0` (mobile redesign + restored cross-world view is feature-grade; A–C alone are point-release territory).

---

## 9. Execution order & parallelism

The slices in §3 are ordered by priority, but execution overlaps where files don't conflict. File-touch matrix below dictates what can run in parallel without merge churn:

| File | Tasks that touch it |
|---|---|
| `BomView.vue` | A1 · D1 · D2 |
| `BomCraftTreeNode.vue` | B · D3 · E3 |
| `BomDecisionRow.vue` | C2 · D3 · E1 |
| `BomTotalsBar.vue` | C3 · E2 |
| `BomImportDialog.vue` | E4 · E5 |
| `bom store` | C1 (sole owner) |

### Parallelism plan

```
WAVE 1 (open) — fire 3 in parallel:
  [main]   A1 — remove auto-calculate (1-line, no agent overhead)
  [agent]  A2 — delete BomMaterialRow.vue + grep stale imports
  [agent]  Scout-B — read CrossWorldPriceDetail props/events,
                     useCrossWorldPricing signature, getAggregatedPrices callers
  [agent]  Scout-D — el-drawer placement="bottom" focus-trap behavior,
                     existing <900 breakpoints, sticky-header vs scrollIntoView interaction

         ↓  (wait for both scouts before B/D start)

SEQUENTIAL CORE — main thread, scouts inform decisions:
  B implementation  → [agent: write tests for cross-world drill trigger]
  C implementation  → [agent: write tests for priceFetchStatus + retry]
  D implementation  → [agent: write snapshot/visual tests at 375/768]

         ↓  (test agents commit alongside main)

WAVE 2 (polish) — fire 4 in parallel (no file conflicts):
  [agent]  E1 — chip icons (BomDecisionRow.vue) + 4-locale visual check
  [agent]  E2 — share dropdown menu (BomTotalsBar.vue)
  [agent]  E3 — drill title eyebrow (BomCraftTreeNode.vue)
  [agent]  E4+E5 — single agent: import example link + progress counter
                   (both in BomImportDialog.vue)
```

### What's NOT parallelizable (and why)

- **A1 alone in an agent**: 1-line change + toast copy, agent boot cost > the work.
- **B/C/D core implementation**: layout/reactivity decisions need continuous judgment; delegating to agents loses control of design tradeoffs.
- **E1 verification**: needs Chrome DevTools MCP visual check across locales — must run on main thread.

### Tag/commit cadence reminder

Wave 1 + B + C → patch releases (`v2.9.x`). Wave 2 ships alongside D → bump to `v2.10.0`.

