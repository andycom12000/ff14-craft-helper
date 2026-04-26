## Design Context

### Product Name
**吐司工坊（Toast Workshop）** — 主品牌名
**FFXIV 製作助手** — 副線（永遠出現於 logo 旁與 SEO meta，確保發現性）

### Register
product

### Users
- **主要使用者**：FFXIV 生產職玩家，從新手到硬核工匠都有
- **核心用戶**：熟悉遊戲機制、追求最佳化 rotation 和利潤的進階玩家
- **使用情境**：製作前查詢配方、規劃批量生產、比價市場、查看採集時間
- **語言**：繁體中文為主

### Brand Personality
- **三詞個性**：溫暖 / 親切 / 輕鬆 + 手藝人自豪
- **情緒目標**：像麵包師傅介紹今天的麵包——貼心、有人氣、不冷冰，不謙卑也不炫耀
- **語調**：友善、直接、不說教
- **物理場景**：早晨剛開門的麵包店——陽光、烘焙紙、果醬罐、人氣

### Aesthetic Direction
- **視覺基調**：Light theme · 奶油白主背景 · 多色烘焙感點綴
- **風格**：明亮活潑、有人氣、手作感，避免冷冰冰科技風或夜晚沉重感
- **色彩策略**：Full Palette — 多色語意（果醬罐排隊隱喻）
  - **吐司金** `oklch(0.65 0.18 65)` — 主品牌色 / focus / primary CTA
  - **可可** `oklch(0.50 0.16 40)` — 製作（配裝、模擬、批量、購物清單）
  - **草莓醬** `oklch(0.58 0.20 15)` — 市場
  - **抹茶** `oklch(0.62 0.17 135)` — 採集計時器
  - **藍莓** `oklch(0.55 0.18 245)` — 副情境 / 提示
- **字體**：
  - Wordmark「吐司工坊」：Noto Serif TC 900
  - 區塊標題：Noto Serif TC 600/700
  - 介面正文：Noto Sans TC
  - 引言 / 黑板字：Cormorant Garamond italic
  - 程式碼 / 數字：Fira Code
- **活潑元素**：hover 微抬升（無旋轉）、紙感背景（hero / onboarding）、Cormorant italic 引言；**不傾斜任何元件**

### Anti-References
- **tnze.yyyy.games**：功能完整但流程繁瑣，批量製作需要來回 navigate 多次，缺乏最佳化功能簡化操作。Dark theme，與「吐司工坊」明亮路線形成差異化
- **beherw FFXIV_Market**：市場功能硬塞製作功能，導致每個功能都做不深，用戶最終還是得去其他工具
- **核心教訓**：每個功能要專注做好，流程要精簡，不要讓用戶在頁面間來回跳轉

### Design Principles
1. **流程精簡**：減少操作步驟，一個頁面完成一件事的完整流程
2. **專注深耕**：每個功能做到位，而非什麼都沾一點
3. **溫暖引導**：用友善的方式引導用戶，而非丟一堆選項讓人自己摸索
4. **資訊密度適中**：進階玩家需要的數據要在，但不要一次把所有東西都攤開
5. **明亮可及**：明亮 light theme，視覺差異化於同類工具，降低進入門檻

### Reference
- Rebrand spec：`docs/superpowers/specs/2026-04-26-toast-workshop-rebrand-design.md`
- 視覺鎖定版預覽：`public/color-preview.html`
