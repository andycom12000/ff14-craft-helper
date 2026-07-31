# PROTOTYPE — wayfinder #184「決定基準線與趨勢的呈現形式」

丟棄式原型。**不要 merge 進 main。**

決議見 https://github.com/andycom12000/ff14-craft-helper/issues/184 的 resolution comment。

## 內容

| 檔案 | 用途 |
|---|---|
| `baseline-proto.html` | 四變體原型（A 走勢線 / B 上期 delta / C 異常帶 / D 組合）。直接用瀏覽器開，底部浮動列或 `?v=A\|B\|C\|D` 切換 |
| `proto-template.html` | 原型模板，`/*__DATA__*/` 由 builder 注入 |
| `build-proto.mjs` | 讀 `series.json` → 產出 `baseline-proto.html` |
| `build-series.mjs` | 讀 71 份日快照 → 產出 `series.json`（8 指標 × 3 windows） |
| `wow-fire-rate.mjs` | 量測 Wilson CI 閘門後 WoW delta 的基線誤報率 |
| `series.json` | 派生序列（原始資料來自 `gh-data` 分支 `history/`） |
| `184-variant-*.png` | 四變體截圖 |

## 重現

```bash
# 1. 取出 71 份日快照
mkdir -p .tmp/scratch/ga-history
for f in $(git ls-tree -r --name-only origin/gh-data | grep '^history/'); do
  git show origin/gh-data:$f > .tmp/scratch/ga-history/$(basename $f)
done
# 2. 建序列 → 建原型
node build-series.mjs && node build-proto.mjs
```

## 這個原型答出來的事

- **28d 滾動視窗畫不出趨勢**：相鄰兩點共用 27/28 資料，SAB 修復在 7d 上 8 天到位、在 28d 上被抹成 28 天斜坡
- **Wilson CI 閘門讓 WoW delta 成立**：可信指標基線誤報率 0–11%（對照 #181 實測固定 pp 門檻的 17–38%），且 SAB 修復期間準確連亮 7 天後自動安靜
