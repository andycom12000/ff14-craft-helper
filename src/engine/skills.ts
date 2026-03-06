export type SkillCategory = 'progress' | 'quality' | 'buff' | 'repair' | 'other'

export interface SkillDefinition {
  id: string
  name: string
  nameZh: string
  category: SkillCategory
  level: number
  cp: number
  durability: number
  description: string
}

export const SKILLS: SkillDefinition[] = [
  // Progress
  { id: 'BasicSynthesis', name: 'Basic Synthesis', nameZh: '製作', category: 'progress', level: 1, cp: 0, durability: 10, description: '120% 效率進展' },
  { id: 'CarefulSynthesis', name: 'Careful Synthesis', nameZh: '模範製作', category: 'progress', level: 62, cp: 7, durability: 10, description: '180% 效率進展' },
  { id: 'RapidSynthesis', name: 'Rapid Synthesis', nameZh: '高速製作', category: 'progress', level: 9, cp: 0, durability: 10, description: '500% 效率進展 (50% 成功率)' },
  { id: 'Groundwork', name: 'Groundwork', nameZh: '坯料製作', category: 'progress', level: 72, cp: 18, durability: 20, description: '360% 效率進展' },
  { id: 'IntensiveSynthesis', name: 'Intensive Synthesis', nameZh: '集中製作', category: 'progress', level: 78, cp: 6, durability: 10, description: '400% 效率（高品質限定）' },
  { id: 'PrudentSynthesis', name: 'Prudent Synthesis', nameZh: '儉約製作', category: 'progress', level: 88, cp: 18, durability: 5, description: '180% 效率，5 耐久' },
  { id: 'MuscleMemory', name: 'Muscle Memory', nameZh: '堅信', category: 'progress', level: 54, cp: 6, durability: 10, description: '300% 效率（首步限定）' },
  { id: 'FocusedSynthesis', name: 'Focused Synthesis', nameZh: '注視製作', category: 'progress', level: 67, cp: 5, durability: 10, description: '200% 效率（觀察後 100%）' },
  { id: 'DelicateSynthesis', name: 'Delicate Synthesis', nameZh: '精密製作', category: 'progress', level: 76, cp: 32, durability: 10, description: '100% 進展 + 100% 品質' },

  // Quality
  { id: 'BasicTouch', name: 'Basic Touch', nameZh: '加工', category: 'quality', level: 5, cp: 18, durability: 10, description: '100% 效率品質' },
  { id: 'StandardTouch', name: 'Standard Touch', nameZh: '中級加工', category: 'quality', level: 18, cp: 32, durability: 10, description: '125% 效率品質' },
  { id: 'AdvancedTouch', name: 'Advanced Touch', nameZh: '上級加工', category: 'quality', level: 84, cp: 46, durability: 10, description: '150% 效率品質' },
  { id: 'PreciseTouch', name: 'Precise Touch', nameZh: '集中加工', category: 'quality', level: 53, cp: 18, durability: 10, description: '150% 效率（高品質限定）' },
  { id: 'PrudentTouch', name: 'Prudent Touch', nameZh: '儉約加工', category: 'quality', level: 66, cp: 25, durability: 5, description: '100% 效率，5 耐久' },
  { id: 'PreparatoryTouch', name: 'Preparatory Touch', nameZh: '坯料加工', category: 'quality', level: 71, cp: 40, durability: 20, description: '200% 效率，IQ+2' },
  { id: 'HastyTouch', name: 'Hasty Touch', nameZh: '倉促', category: 'quality', level: 9, cp: 0, durability: 10, description: '100% 效率 (60% 成功率)' },
  { id: 'FocusedTouch', name: 'Focused Touch', nameZh: '注視加工', category: 'quality', level: 68, cp: 18, durability: 10, description: '150% 效率（觀察後 100%）' },
  { id: 'TrainedFinesse', name: 'Trained Finesse', nameZh: '工匠的神速技巧', category: 'quality', level: 90, cp: 32, durability: 0, description: '100% 效率，0 耐久（IQ=10）' },
  { id: 'ByregotsBlessing', name: 'Byregot\'s Blessing', nameZh: '比爾格的祝福', category: 'quality', level: 50, cp: 24, durability: 10, description: '100% + IQ*20% 效率' },
  { id: 'Reflect', name: 'Reflect', nameZh: '閒靜', category: 'quality', level: 69, cp: 6, durability: 10, description: '300% 效率（首步限定），IQ+2' },
  { id: 'TrainedEye', name: 'Trained Eye', nameZh: '工匠的神技', category: 'quality', level: 80, cp: 250, durability: 10, description: '品質拉滿（首步限定）' },

  // Buff
  { id: 'WasteNot', name: 'Waste Not', nameZh: '儉約', category: 'buff', level: 15, cp: 56, durability: 0, description: '耐久消耗減半，4 回合' },
  { id: 'WasteNotII', name: 'Waste Not II', nameZh: '長期儉約', category: 'buff', level: 47, cp: 98, durability: 0, description: '耐久消耗減半，8 回合' },
  { id: 'Veneration', name: 'Veneration', nameZh: '崇敬', category: 'buff', level: 15, cp: 18, durability: 0, description: '進展+50%，4 回合' },
  { id: 'Innovation', name: 'Innovation', nameZh: '改革', category: 'buff', level: 26, cp: 18, durability: 0, description: '品質+50%，4 回合' },
  { id: 'GreatStrides', name: 'Great Strides', nameZh: '闊步', category: 'buff', level: 21, cp: 32, durability: 0, description: '品質+100%，3 回合' },
  { id: 'FinalAppraisal', name: 'Final Appraisal', nameZh: '最終確認', category: 'buff', level: 42, cp: 1, durability: 0, description: '進展不超上限，5 回合' },

  // Repair / Other
  { id: 'MastersMend', name: 'Master\'s Mend', nameZh: '精修', category: 'repair', level: 7, cp: 88, durability: 0, description: '恢復 30 耐久' },
  { id: 'Manipulation', name: 'Manipulation', nameZh: '掌握', category: 'repair', level: 65, cp: 96, durability: 0, description: '每回合恢復 5 耐久，8 回合' },
  { id: 'Observe', name: 'Observe', nameZh: '觀察', category: 'other', level: 13, cp: 7, durability: 0, description: '等待一回合' },
  { id: 'TricksOfTheTrade', name: 'Tricks of the Trade', nameZh: '秘訣', category: 'other', level: 13, cp: 0, durability: 0, description: '恢復 20 CP（高品質限定）' },
]

const SKILL_MAP = new Map<string, SkillDefinition>(SKILLS.map(s => [s.id, s]))

export function getSkillById(id: string): SkillDefinition | undefined {
  return SKILL_MAP.get(id)
}

export function getSkillName(id: string): string {
  return SKILL_MAP.get(id)?.nameZh ?? id
}

export function getSkillsByLevel(level: number): SkillDefinition[] {
  return SKILLS.filter(s => s.level <= level)
}
