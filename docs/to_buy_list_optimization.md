# FF14 Craft Helper 開發項目

## Step 1 - 最佳HQ計算 (calculate_optimal_hq_combination)

### 問題

目前按下模擬後會模擬出當前能達到的最佳解
若最佳解沒辦法達成雙滿條件，則需要使用者額外介入決定加入多少HQ素材

### 需求

- 增加自動計算所需HQ原物料的組合
- 先求出所有可能達成HQ的組合，整合好清單後查價 (避免重複查價)
- 推薦使用者最低價的HQ組合
- 可設定是否要遞迴查價: 遞迴計算半成品的HQ購買/自製成本
- 可設定最大遞迴深度
- 列出**僅包含**最佳組合的物料/半成品的列表及價格，**不包含**所需之水晶
- 若可以直接達成雙滿條件，則僅處理查價的部分(同樣要吃遞迴查價的參數決定是否遞迴)


## Step 2 - 採購清單

### 需求

- 將原始素材中的元素水晶另外顯示，不查價格只顯示總量
- 在設定中加入`跨服採購`的選項
    - 勾選後最低價改為顯示所有伺服器中最低價者
    - **Grouping功能**: 將要購買的原物料依不同伺服器group成數張表格，讓使用者可以travel一次就採購完所有素材
    - 未勾選時僅顯示當前伺服器價格、也不做grouping


## Step 3 - 一鍵batch模擬

### 問題

目前的操作流程為
1. 查詢要製作的配方
2. 模擬後決定所需採購/製作的素材
    - 若有需要製作的素材就需要recursive再run一次
3. 將配方導入材料清單，根據模擬的結果多次來回操作
4. 根據查價結果到各伺服器採購所需物料
5. 製作
    - 若有半成品需製作，將半成品的配方帶入模擬器後取得巨集
    - 全部半成品製作/採購完後去得目標材料的巨集

若有n項目標要製作，就需要操作1~5至少`O(n)` + 若需遞迴則至少為`O(m*n)`

### 需求

簡化目前的流程
- 查詢n個製作目標的配方，加入batch list
- 按鈕啟動最佳模擬計算流程，以下是pseudo code
    ```python
    CROSS_SERVER = True

    def get_optimized_to_buy_list(batch_list):
        to_buy_list = []
        for recipe in batch_list:
            simulation_result = simulate_best_process(recipe)
            best_combo = calculate_optimal_hq_combination(simulation_result)
            to_buy_list.add(best_combo.Materials)
        return to_buy_list

    def simulate_best_process():
        # 使用raphael找出最佳解
    
    def calculate_optimal_hq_combination():
        # Step 1的最佳HQ組合&價格計算

    def process_to_buy_list(material_list):
        server_material_map = {}
        for material in material_list:
            result = get_best_price(material, CROSS_SERVER)
            server_material_map[result.Server].Add(result)
    
    def get_best_price(material, cross_server):
        # 根據是否跨服，查出最低價格，回傳物料資訊、價格、目標server

    def get_batch_list():
        # 使用者傳入的batch list

    def main_process():
        batch_list = get_batch_list()
        to_buy_list = get_optimized_to_buy_list(batch_list)
        return process_to_buy_list(to_buy_list)
    ```
- 前端UI根據是否要跨服決定是否要grouping後再呈現結果
- 有條件不符的例外時跳出dialog讓使用者決定處置方式:
    - 職業等級不足自製配方
    - 無法求出達成雙滿的組合
- 排出一個todo list給使用者
    - 讓使用者可以直接照todo list製作
    - todo list中需要包含目標品項及所需的巨集
    - todo list要可以mark為done方便使用者追蹤流程
- Batch的過程中需要**進度條**，讓使用者看到實際處理進度