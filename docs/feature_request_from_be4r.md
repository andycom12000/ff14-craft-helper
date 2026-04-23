## 配裝管理

- 增加一鍵修改所有職業參數的功能

## 設定

- 語言切換放到側欄隨時改
- 伺服器清單會有API error的狀況，評估改為static的版本，有需要再call API更新 [API](https://universalis.app/api/v2/worlds)
- 價格偏好預設擺"NQ/HQ取低者"
- 改語言後巨集也要改語言
- 初次使用直接跳出on-boarding彈窗，要求使用者先設定好server + 語言
- 加入特別感謝的section，裡面可以列入名字
- 作者名字改為 "菸齡 (andycom12000)"

## 製作模擬

- 模擬tab中，可用技能都把"專家"的tag拿掉
- 參考[BestCraft](https://tnze.yyyy.games/#/designer)，將手動模擬製作的功能加上來
- 技能序列改為顯示技能icon

## 製作清單

- 改名為購物清單
- 都是0Gil的問題 (docs/photo_2026-04-23_21-10-42.jpg)
- 要有批量製作的採購材料中，checklist的功能
- tree的功能也有padding問題 (docs/photo_2026-04-23_19-40-01.jpg)
- 原料價格展開後，右半側價格的部分有跑版的問題，可能要切div/col來對齊
- tree view與table view的寬度不同，視覺上不好看

## 批量製作

- 總價位欄不需要sticky
- 採購清單的材料展開後，上綠底色的server不是推薦購買的server而是最低價NQ的
- 製作清單中每個配方的最右邊沒加上padding太貼邊
- 除了無法達到HQ的狀況外，因價位改為直接購買的東西要加上自製的switch，讓使用者決定是否切回自製
- 加上幾個功能性的switch
    - 不要算巨集: 材料預設買全NQ，加上切換全NQ或全HQ的按鈕，個別材料也要可以切換
    - 自動評估食藥: 改為可開關，預設on