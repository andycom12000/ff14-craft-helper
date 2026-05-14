# Universalis Retry — 後續改善 Design

**Date:** 2026-05-14
**Scope:** `src/api/universalis.ts`、`src/__tests__/api/universalis.test.ts`
**Origin:** PR #13 [FF1-8](https://linear.app/ff14-craft-helper/issue/FF1-8) code review，5 個並行 review agents 找到 4 個非阻斷性 issue（confidence < 80 未列入 review comment，但值得在後續 PR 收齊）
**Goal:** 補強 retry 機制的長期穩固度與觀測準確度，**不擴大 PR #13 的範圍**

---

## 1. 背景

PR #13 在 `fetchUniversalis` 加 retry-with-backoff（2 retries, 300/800ms），修掉 batch 計算偶發崩潰。Review agents 找到 4 個次要問題，confidence 50 / 68 / 35 / 35，沒到 ≥80 阻斷門檻。本 spec 把它們捕捉下來，方便未來在「真的影響使用者」或「需要重構同一塊」時批次解決。

> **CLAUDE.md 提醒**：「Don't add features, refactor, or introduce abstractions beyond what the task requires」。本 spec 列出的改動屬「未來消費者導向」性質，**沒有可測量勝利前不要單獨切 PR**。建議搭著下一次真正需要碰 retry 邏輯的 PR（e.g. 加 jitter、加 circuit-breaker、改 telemetry schema）一次處理。

## 2. 4 個 issue 摘要

| # | 議題 | 嚴重度 | 觸發條件 | 建議行動時機 |
| --- | --- | ---: | --- | --- |
| A | regex 解析 HTTP status 脆弱 | 中 | 有人改 `attemptFetch` 錯誤訊息格式（例如 i18n、加 prefix）| 改 retry 邏輯時順手帶 |
| B | `RETRY_BACKOFF_MS[attempt]` 無 bounds check | 低 | `MAX_RETRIES` 改成 3+ 但忘了補陣列 | 改 retry 次數時 |
| C | `duration_ms` 含 backoff sleep | 低 | 看 GA scorecard 平均耗時被 retry path 拖高 | 動 telemetry schema 時 |
| D | retry 測試用 real timers（每測 ~1.1s）| 微 | CI 整體變慢 | 全測 > 60s 再回頭看 |

## 3. 議題詳述

### A. Regex 解析 status code 脆弱（confidence 68）

**現況：**

```ts
// attemptFetch
throw new Error(`Universalis request failed: ${response.status} ${response.statusText}`)

// 上層 retry loop
function isRetriable(err) {
  const m = /Universalis request failed: (\d+)/.exec(err.message)
  if (m) return Number(m[1]) >= 500 && Number(m[1]) < 600
  return false
}
function extractStatus(err) { /* 同樣 regex */ }
```

**風險：** 訊息格式定義在 `attemptFetch` 單一處，但被兩個函式 regex 反推。任何改字（i18n、加 trace id、簡化文字）都會讓 retry 與分析事件**靜默失效**（status=0, isRetriable=false）。

**修法：** 自訂 error class 帶型別欄位。

```ts
class UniversalisHttpError extends Error {
  constructor(public status: number, public statusText: string) {
    super(`Universalis request failed: ${status} ${statusText}`)
    this.name = 'UniversalisHttpError'
  }
}
// isRetriable / extractStatus 直接讀 err.status，不再 regex
```

**規模：** ~20 行內，含一個新 class + 兩個 helper 改寫。無外部 API 影響。
**測試：** 既有 retry 測試應仍綠；視需要加 1 個「自訂 error 攜帶正確 status」測試。

---

### B. `RETRY_BACKOFF_MS[attempt]` 無 bounds check（confidence 50）

**現況：**

```ts
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = [300, 800]
// ...
await sleep(RETRY_BACKOFF_MS[attempt])
```

當 `MAX_RETRIES = 2` 時 `attempt ∈ {0, 1}` 對到 `[300, 800]`，正確。但若有人把 `MAX_RETRIES` 改成 3 而忘了補陣列，`RETRY_BACKOFF_MS[2]` 是 `undefined`，`setTimeout(fn, undefined)` 等價 `setTimeout(fn, 0)` → 第三次 retry 沒 backoff，等於連打三槍。

**修法選一：**

1. **單 source-of-truth**：用函式而非陣列：`backoffFor(attempt) = 300 * Math.pow(2, attempt)` → exponential，任意 attempt 數都對應。
2. **顯式 clamp**：`sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS.at(-1)!)`。

推薦 #1，因 jitter / cap 都好加：

```ts
function backoffFor(attempt: number): number {
  const base = 250 * Math.pow(2, attempt)       // 250, 500, 1000, ...
  const jitter = Math.random() * 100             // 0-100ms
  return Math.min(base + jitter, 3000)
}
```

**規模：** 5–10 行。
**附帶價值：** jitter 可降低 thundering-herd（多個 batch chunk 同時 retry 時打到 Universalis 的瞬間流量會錯開）。

---

### C. `duration_ms` 現在含 backoff sleep（confidence 35）

**現況：** `startedAt` 在 retry loop **外**，所以 `duration_ms = 真實 fetch + 300ms backoff + 真實 fetch + 800ms backoff + 真實 fetch`。原本 commit `fc37946` 把 `duration_ms` 當「單次 round-trip 耗時」追蹤，但沒明文寫死契約。

**影響：** GA dashboard `2026-04-28-ga-dashboard-and-tracking-design.md:104` 用 `universalis_fetch.duration_ms` 算「Universalis 平均耗時」。retry path 會把這個指標往上拉、看起來「Universalis 變慢了」，但實際只是我們在等 backoff。

**修法（任選或合併）：**

1. 加 `retry_count: number` 欄位到 `universalis_fetch` 事件 → dashboard 可選擇 `WHERE retry_count = 0` 看純 round-trip。
2. 把 `duration_ms` 切兩個：`duration_ms`（總 wall time）+ `last_attempt_ms`（最後一次 fetch 純耗時）。
3. **不動。** 接受「duration_ms = 邏輯呼叫總耗時」這個新語意；只在 dashboard 標註。

推薦 #1，最小變動，向後相容（既有 dashboard 不會壞，只是新增 dimension）。

**規模：** 3–5 行 + 1 行 dashboard 註腳。

---

### D. 新 retry 測試用 real timers（confidence 35）

**現況：** `gives up after max retries (3 attempts) on persistent TypeError` 跑掉 ~1.1s（300ms + 800ms 真實 `setTimeout`）。其他兩個 retry 測試各 ~300ms。整套 universalis test ~1.75s。

**修法：**

```ts
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// 在 await 期間 vi.runAllTimersAsync()
```

需要小心 `await getMarketData(...)` 與 `vi.runAllTimersAsync()` 的交織順序。

**規模：** 5–15 行，須驗證 vitest 假計時器與 `Promise.all` chunk 互動正確。
**價值低**：1.1s 在整套 ~12s 測試中佔比 < 10%，不阻塞 dev。**等 CI 真的痛了再動**。

## 4. 建議切 PR 策略

| 觸發條件 | 一起做 |
| --- | --- |
| 下次改 `fetchUniversalis` 任一邏輯（加 circuit-breaker、改 max-retries、加 jitter）| A + B 一起改 |
| 下次動 telemetry schema（換 GA / Sentry / 加 dimensions）| C 一起 |
| CI 變慢需優化測試 wall-time 時 | D |
| **單獨切 PR 把 4 個一次解掉**| **不建議**。沒有可測量勝利，CLAUDE.md 明文反對「零收益的最佳化基礎建設」 |

## 5. 非目標（Non-Goals）

- 改 `MAX_RETRIES` 數量（目前 2 次足夠吸收實測 transient）
- 加 circuit-breaker（單一使用者個人工具，沒這個量級）
- 改 `Promise.all` 為 `Promise.allSettled` 換 partial success（會讓 priceMap 不完整、craft vs buy 比較全錯，得不償失）
- 對 Universalis 加 client-side rate limit（沒有觀察到 429）

## 6. 參考

- PR #13: https://github.com/andycom12000/ff14-craft-helper/pull/13
- Linear FF1-8: https://linear.app/ff14-craft-helper/issue/FF1-8
- Commit `fc37946 feat(analytics): instrument Universalis market fetches`
- GA dashboard spec: `docs/superpowers/specs/2026-04-28-ga-dashboard-and-tracking-design.md:104`
