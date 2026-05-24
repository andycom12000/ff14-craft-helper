const LABELS: Record<string, string> = {
  // Market
  universalis_fetch: '市場價查詢',

  // Crafting · solver
  solver_start:      'Solver 啟動',
  solver_complete:   'Solver 完成',
  solver_failed:     'Solver 失敗',
  solver_rerun:      'Solver 重新求解',
  solver_macro_copy: '複製 macro',

  // Crafting · batch
  batch_add_recipe:               '加入批次',
  queue_add_recipe:               '加入佇列',
  batch_optimization_start:       '批量最佳化 · 啟動',
  batch_optimization_complete:    '批量最佳化 · 完成',
  batch_optimization_failed:      '批量最佳化 · 失敗',
  batch_optimization_cancelled:   '批量最佳化 · 取消',

  // Crafting · BOM / gearset / recipe
  bom_acquisition_mode_set: 'BOM 取得模式',
  bom_calculate:            'BOM 計算',
  bom_target_add:           'BOM 新增目標',
  bom_send_to_batch:        'BOM 送入批次',
  bom_copy_list:            'BOM 複製清單',
  bom_item_check:           'BOM 勾選材料',
  aetheryte_tp_copy:        '傳送座標複製',
  gearset_sheet_open:       '開啟配裝',
  recipe_select:            '選擇配方',
  recipe_name_locale_miss:  '中文名缺失',
  simulator_entry_source:   '模擬器進入來源',

  // Meta
  web_vitals:      '效能指標',
  page_view:       '頁面瀏覽',
  session_start:   'Session 起始',
  scroll:          '捲動',
  user_engagement: '互動時長',

  // Errors
  exception: '例外',
}

export function eventLabel(tag: string): string {
  return LABELS[tag] ?? tag
}
