# PROTOTYPE — wayfinder #191「決定待辦條目旁的回饋迴路呈現」

丟棄式原型。**不要 merge 進 main。**

決議見 https://github.com/andycom12000/ff14-craft-helper/issues/191 的 resolution comment。

## 內容

| 檔案 | 用途 |
|---|---|
| `todo-feedback-proto.html` | 待辦區塊四變體 + 定案變體。直接用瀏覽器開 |
| `build-191.mjs` | 讀 72 份日快照 → 產出 `todo-feedback-proto.html` |
| `verdict-history.mjs` | 逐日跑 `evaluate()`，量測每條規則的觸發史／亮起／熄滅／前 3 名 churn |
| `symmetric-ci.mjs` | 四種「宣告熄滅」規則的準確度對拍（本票最關鍵的量測） |
| `quiet-window.mjs` | 滉清窗 N 的過濾效果 + 熄滅區塊長度 |
| `wow-on-todos.mjs` | WoW delta 在待辦列上實際畫得出東西的比例 |
| `verdict-size.mjs` | verdict 歷史三種預算方式的體積實測 |
| `191-proto-full.png` / `191-final.png` | 截圖 |

## 重現

```bash
# 1. 取出日快照（gh-data 分支）
mkdir -p .tmp/scratch/ga-history
for f in $(git ls-tree -r --name-only origin/gh-data | grep '^history/'); do
  git show origin/gh-data:$f > .tmp/scratch/ga-history/$(basename $f)
done
# 2. 量測 → 建原型
node verdict-history.mjs && node symmetric-ci.mjs && node wow-on-todos.mjs && node verdict-size.mjs
node build-191.mjs   # → .tmp/scratch/proto-191/todo-feedback-proto.html
```

## 這個原型答出來的事

- **WoW delta 在待辦列上 92% 是空的**（156 個「待辦列 × 天」只有 12 格畫得出箭頭）—— 待辦是「一直很差」的清單，delta 量的是「最近變了」，定義上互斥
- **滉清窗攔不住假熄滅**（N 從 2 到 10 完全不變，N=7 的假熄滅率反而比 N=1 高）；**對稱 CI 可以**（實質誤判 0 次）
- **待辦幾乎不動**：前 3 名成員在 71 次日對日比較裡只變動 7 次（10%）
- **72 天裡從來沒有空狀態**，最少的一天也有 1 條在響
