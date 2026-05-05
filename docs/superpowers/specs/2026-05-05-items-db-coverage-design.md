# Items DB Coverage — Non-Craftable Items

**Status**: Plan, awaiting confirmation
**Date**: 2026-05-05
**Surface**: `public/data/items/*.json`, `scripts/build-game-data.mjs`, `src/services/local-data-source.ts`, `src/components/bom/BomImportDialog.vue`
**Register**: product

---

## 1. Why this exists

The local items DB currently only contains items referenced by some recipe (as result OR ingredient). Build script (`build-game-data.mjs:394`) drops any item whose ID isn't in the recipe-referenced whitelist.

Symptom: a Teamcraft list of housing furniture (mix of player-craftable + NPC-shop / FATE / 鑽石歲入交換 items) imports cleanly for the craftable subset but every non-craftable row degrades to `物品 #XXXXX` because we genuinely don't know the name. v2.10.1 ships clearer copy ("非製作物品"), but the user still loses the name.

This plan answers: do we widen the DB, fetch names lazily, or accept the current cap?

---

## 2. Constraints

- **Bundle budget**: current items.json (4 locales) is 2.3 MB combined — already a non-trivial part of the cold-start cost. Doubling that crosses a perceptible threshold on slow connections.
- **Build pipeline**: `build-game-data.mjs` already pulls from 3 dataming repos. Per-locale Item.csv contains ~40k rows; we currently keep ~12k (~30%).
- **Use case scope**: BOM is a craft tool. Non-craftable items have no materials to compute — they show up only as labels in the import preview and (potentially) in raw materials list when user manually adds them. The product won't grow features that depend on non-craftable item metadata in the foreseeable future.
- **Offline**: project supports offline use after first load (PWA manifest exists). Any solution that requires network on cold start regresses that.

---

## 3. Approaches considered

| # | Approach | Bundle delta | Offline-friendly | UX completeness | Build complexity |
|---|---|---|---|---|---|
| A | **Full DB** (every Item.csv row with non-empty Name) | +1.5–2× per locale | ✅ | 100% | Trivial — drop the whitelist filter |
| B | **Two-tier shards** — keep recipe-referenced as default, ship a separate `items-extra/<locale>.json` lazy-loaded on miss | +0 cold-start; +tier-2 on first import-with-unknowns | ✅ once warmed | 100% | Medium |
| C | **JIT XIVAPI lookup** — when `getItem()` misses, call XIVAPI; cache to localStorage | 0 | ❌ | 100% online; degrades offline | Low |
| D | **Status quo + clarified copy** (shipped as part of 0b4cc59) | 0 | n/a | "shows ID + reason" | n/a |

Detailed notes:

**A (Full DB)** — easiest. Drop the `if (!whitelist.has(id)) continue` filter or relax it to `name && name.trim() !== ''`. Per the data probe, this would take items per locale from 12,007 to roughly 35–40k. Bundle estimate per locale: ~1.4–1.6 MB → ~5.5 MB total (vs current 2.3 MB).

**B (Shards)** — keep the lean tier as today; build a parallel `items-extra/<locale>.json` containing only the items that are NOT in the lean tier. Lazy-load it on the first `getItem` miss (so the cold-start path is unchanged). 4× extra files of ~1 MB each, lazy.

**C (JIT XIVAPI)** — minimum bundle impact, but every fresh import with unknowns triggers N network round-trips (one per ID, or batched). XIVAPI rate limits + offline regression. Cache hits afterwards. Probably best paired with B, not on its own.

**D (just clarify copy)** — shipped. The user's diagnosis confirms the items aren't in any locale, so they really do need *some* extra data source to surface names. Keeping D-only means accepting that limitation as permanent.

---

## 4. Recommendation

**Approach B (two-tier shards)** with A as a fallback if B's complexity isn't worth it.

Reasoning:
- Cold-start path unchanged → no perf regression for the 90%+ of users who never paste a Teamcraft URL.
- Offline-friendly after first warm-up.
- Doesn't bloat every cache entry.
- Keeps `loadItems()` as the single read path; consumers don't change.
- Build script change is constrained to one extra emit pass.

Defer C (JIT XIVAPI) — the lazy shard already covers the use case without network dependency. Keep it in mind if shards get unwieldy.

---

## 5. Implementation slices

### Slice 1 — Build pipeline emits the extra shard

`scripts/build-game-data.mjs`:
- After current `buildItems()` runs (line 510), run a second pass over the same CSV rows but using a *different* whitelist: every named item NOT in `referencedItems`.
- Emit to `public/data/items/<locale>-extra.json` with the same schema as `<locale>.json`.
- Update `manifest.json` to record the extra shard's hash + size so cache invalidation works.

Sanity check: extra-shard count should be roughly 2–3× the recipe-referenced count (per locale). Add to existing failures array if not.

### Slice 2 — `local-data-source.ts` lazy-load on miss

`loadItems(locale)` currently returns a `Map<id, ItemRecord>` from the lean shard. Add:

```ts
async function ensureExtraItemsLoaded(locale: Locale): Promise<void>
```

Called by `getItem()` only when the lean map misses. Fetches the extra shard, merges into the same `itemsCache` map, sets a `loaded-extra` flag per locale so subsequent misses don't re-fetch.

`getItem()` flow:
1. `loadItems(loc)` — lean shard
2. If found → return
3. `ensureExtraItemsLoaded(loc)` — lazy
4. Re-query map → return (or undefined if truly absent / corrupt id)

Edge case: if extra-shard fetch fails, log + record a flag so we don't retry every miss (otherwise a single bad ID hammers the network).

### Slice 3 — Import dialog surface

Once getItem covers more IDs, `ResolvedTeamcraftEntry.unknown` should fire only for IDs NOT in either shard (i.e. truly bogus IDs or items past the data version). Adjust copy:

- `unknown=true` (still nothing in either shard) → keep current "非製作物品（NPC／採集／獎勵類），跳過" copy as catch-all
- New state: item *found* via extra shard but no recipe → currently classified as "找不到配方，跳過" which is fine; the row now shows the real name.

No new state machine — just better data feeds the existing copy.

### Slice 4 — `searchRecipes` ↔ shard interaction

`searchRecipesByName` only walks recipes, so it's not affected. But `searchRecipes` in `xivapi.ts:39` looks up icons for results via `loadItems()`. Verify that recipe-referenced items always live in the lean shard (they should — that's the whitelist).

No change expected, but add a unit test: `every recipe-referenced ID exists in the lean items shard` (hard assertion).

### Slice 5 — Tests + sanity checks

- `local-data-source` test: mock fetches; `getItem(unknown_id_in_extra)` triggers extra load on first call only.
- Build script test (or manual smoke): after running `npm run build-game-data`, verify the 9 IDs from the user's repro URL all appear in either lean or extra shard.
- Bundle-size CI check (if any): allow extra shard files but track separately so accidental migration doesn't sneak items into the lean tier.

---

## 6. Open questions

- **Q1**: do we localize `物品 #XXXXX` placeholder per-locale? Currently the placeholder string is hard-coded zh. After Slice 2, this codepath is rare but not eliminated. Defer until i18n revisit.
- **Q2**: should `BomImportDialog.confirmImport` ever proceed for items found in the extra shard but lacking recipes? **No** — BOM still requires a recipe to compute materials. The row just gets a clearer label, not a free pass to the import.
- **Q3**: do we ship Slice 1 alone (silent data growth, no UI change) before Slice 2 to spread risk? The lean shard doesn't reference extra-shard IDs, so shipping S1 alone is a no-op. Combined commit is fine.

---

## 7. Out of scope

- Including non-Item sheets (Quest names, Achievement names, etc.).
- Switching to live XIVAPI for items globally (would change offline story).
- Translations for items missing from any locale (data layer; not our pipeline's responsibility).
- A full "items browser" UI for non-craftable items (no product use case yet).
- Including item *descriptions*, *flavor text*, or other Item.csv columns beyond `Name / LevelItem / CanBeHq / Icon`. Adding those would balloon the shard; we keep the same schema.

---

## 8. Risk callouts

- **Repo data lag**: TW datamining repo lags ~13% behind XIVAPI per existing build comment. The 9 repro-URL IDs all come back missing across all 4 locales, so this is a deeper coverage gap than "lag" — likely items dropped during the upstream extract for being non-Item sheet entries (e.g. 家具 housing pieces with `Item` sheet entries that get filtered upstream). Verify with `wc -l` on raw Item.csv vs shard count before signing off Slice 1's whitelist relaxation.
- **Schema-version bump**: lazy shard share the same row tuple shape `[id, name, levelItem, canBeHq, iconId]`. If a future build needs new columns, both shards bump together. `schemaVersion` field on the JSON envelope already exists — bump it on both.
- **Stale shard cache**: PWA service worker caches existing items.json by hash. The new `<locale>-extra.json` enters the cache on first lazy load; ensure it's added to the precache manifest the same way.

---

## 9. Estimated effort

| Slice | Engineering | Risk |
|---|---|---|
| 1 | half-day | low — pure additive build output |
| 2 | half-day | medium — lazy-load logic + cache merge |
| 3 | trivial | low |
| 4 | < 1h (test only) | low |
| 5 | half-day | low |

Total ~2 dev-days end-to-end including review.
