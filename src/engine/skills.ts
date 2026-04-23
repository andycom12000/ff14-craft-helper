import { getIconUrl } from '@/utils/icon-url'
import { getPerJobIconId, type Job } from './skill-icons-by-job'

export type SkillCategory = 'progress' | 'quality' | 'buff' | 'repair' | 'other'

export interface SkillDefinition {
  id: string
  nameEn: string
  nameZh: string
  nameJa: string
  category: SkillCategory
  level: number
  cp: number
  durability: number
  description: string
  iconId: number
}

export const SKILLS: SkillDefinition[] = [
  // Progress
  { id: 'BasicSynthesis', nameEn: 'Basic Synthesis', nameZh: '製作', nameJa: '作業', category: 'progress', level: 1, cp: 0, durability: 10, description: '120% 效率進展', iconId: 1501 },
  { id: 'CarefulSynthesis', nameEn: 'Careful Synthesis', nameZh: '模範製作', nameJa: '模範作業', category: 'progress', level: 62, cp: 7, durability: 10, description: '180% 效率進展', iconId: 1986 },
  { id: 'RapidSynthesis', nameEn: 'Rapid Synthesis', nameZh: '高速製作', nameJa: '高速作業', category: 'progress', level: 9, cp: 0, durability: 10, description: '500% 效率進展 (50% 成功率)', iconId: 1988 },
  { id: 'Groundwork', nameEn: 'Groundwork', nameZh: '坯料製作', nameJa: '下地作業', category: 'progress', level: 72, cp: 18, durability: 20, description: '360% 效率進展', iconId: 1518 },
  { id: 'IntensiveSynthesis', nameEn: 'Intensive Synthesis', nameZh: '集中製作', nameJa: '集中作業', category: 'progress', level: 78, cp: 6, durability: 10, description: '400% 效率（高品質限定）', iconId: 1514 },
  { id: 'PrudentSynthesis', nameEn: 'Prudent Synthesis', nameZh: '儉約製作', nameJa: '倹約作業', category: 'progress', level: 88, cp: 18, durability: 5, description: '180% 效率，5 耐久', iconId: 1520 },
  { id: 'MuscleMemory', nameEn: 'Muscle Memory', nameZh: '堅信', nameJa: '確信', category: 'progress', level: 54, cp: 6, durability: 10, description: '300% 效率（首步限定）', iconId: 1994 },
  { id: 'DelicateSynthesis', nameEn: 'Delicate Synthesis', nameZh: '精密製作', nameJa: '精密作業', category: 'progress', level: 76, cp: 32, durability: 10, description: '150% 進展 + 100% 品質（Lv.94 前為 100% 進展）', iconId: 1503 },

  // Quality
  { id: 'BasicTouch', nameEn: 'Basic Touch', nameZh: '加工', nameJa: '加工', category: 'quality', level: 5, cp: 18, durability: 10, description: '100% 效率品質', iconId: 1502 },
  { id: 'StandardTouch', nameEn: 'Standard Touch', nameZh: '中級加工', nameJa: '中級加工', category: 'quality', level: 18, cp: 32, durability: 10, description: '125% 效率品質', iconId: 1516 },
  { id: 'AdvancedTouch', nameEn: 'Advanced Touch', nameZh: '上級加工', nameJa: '上級加工', category: 'quality', level: 84, cp: 46, durability: 10, description: '150% 效率品質', iconId: 1519 },
  { id: 'PreciseTouch', nameEn: 'Precise Touch', nameZh: '集中加工', nameJa: '集中加工', category: 'quality', level: 53, cp: 18, durability: 10, description: '150% 效率（高品質限定）', iconId: 1524 },
  { id: 'PrudentTouch', nameEn: 'Prudent Touch', nameZh: '儉約加工', nameJa: '倹約加工', category: 'quality', level: 66, cp: 25, durability: 5, description: '100% 效率，5 耐久', iconId: 1535 },
  { id: 'PreparatoryTouch', nameEn: 'Preparatory Touch', nameZh: '坯料加工', nameJa: '下地加工', category: 'quality', level: 71, cp: 40, durability: 20, description: '200% 效率，IQ+2', iconId: 1507 },
  { id: 'HastyTouch', nameEn: 'Hasty Touch', nameZh: '倉促', nameJa: 'ヘイスティタッチ', category: 'quality', level: 9, cp: 0, durability: 10, description: '100% 效率 (60% 成功率)', iconId: 1989 },
  { id: 'TrainedFinesse', nameEn: 'Trained Finesse', nameZh: '工匠的神技', nameJa: '匠の神業', category: 'quality', level: 90, cp: 32, durability: 0, description: '100% 效率，0 耐久（IQ=10）', iconId: 1997 },
  { id: 'ByregotsBlessing', nameEn: 'Byregot\'s Blessing', nameZh: '比爾格的祝福', nameJa: 'ビエルゴの祝福', category: 'quality', level: 50, cp: 24, durability: 10, description: '100% + IQ*20% 效率', iconId: 1975 },
  { id: 'Reflect', nameEn: 'Reflect', nameZh: '閒靜', nameJa: '静心', category: 'quality', level: 69, cp: 6, durability: 10, description: '300% 效率（首步限定），IQ+2', iconId: 1982 },
  { id: 'TrainedEye', nameEn: 'Trained Eye', nameZh: '工匠的神速技巧', nameJa: '匠の早業', category: 'quality', level: 80, cp: 250, durability: 10, description: '品質拉滿（首步限定）', iconId: 1981 },
  { id: 'RefinedTouch', nameEn: 'Refined Touch', nameZh: '精煉加工', nameJa: '洗練加工', category: 'quality', level: 92, cp: 24, durability: 10, description: '100% 效率，IQ+2（加工連段後）', iconId: 1522 },
  { id: 'DaringTouch', nameEn: 'Daring Touch', nameZh: '大膽加工', nameJa: '大胆加工', category: 'quality', level: 96, cp: 0, durability: 10, description: '150% 效率 (60% 成功率)', iconId: 1998 },

  // Buff
  { id: 'WasteNot', nameEn: 'Waste Not', nameZh: '儉約', nameJa: '倹約', category: 'buff', level: 15, cp: 56, durability: 0, description: '耐久消耗減半，4 回合', iconId: 1992 },
  { id: 'WasteNotII', nameEn: 'Waste Not II', nameZh: '長期儉約', nameJa: '長期倹約', category: 'buff', level: 47, cp: 98, durability: 0, description: '耐久消耗減半，8 回合', iconId: 1993 },
  { id: 'Veneration', nameEn: 'Veneration', nameZh: '崇敬', nameJa: 'ヴェネレーション', category: 'buff', level: 15, cp: 18, durability: 0, description: '進展+50%，4 回合', iconId: 1995 },
  { id: 'Innovation', nameEn: 'Innovation', nameZh: '改革', nameJa: 'イノベーション', category: 'buff', level: 26, cp: 18, durability: 0, description: '品質+50%，4 回合', iconId: 1987 },
  { id: 'GreatStrides', nameEn: 'Great Strides', nameZh: '闊步', nameJa: 'グレートストライド', category: 'buff', level: 21, cp: 32, durability: 0, description: '品質+100%，3 回合', iconId: 1955 },
  { id: 'FinalAppraisal', nameEn: 'Final Appraisal', nameZh: '最終確認', nameJa: '最終確認', category: 'buff', level: 42, cp: 1, durability: 0, description: '進展不超上限，5 回合', iconId: 1983 },

  // Repair / Other
  { id: 'MastersMend', nameEn: 'Master\'s Mend', nameZh: '精修', nameJa: 'マスターズメンド', category: 'repair', level: 7, cp: 88, durability: 0, description: '恢復 30 耐久', iconId: 1952 },
  { id: 'Manipulation', nameEn: 'Manipulation', nameZh: '掌握', nameJa: 'マニピュレーション', category: 'repair', level: 65, cp: 96, durability: 0, description: '每回合恢復 5 耐久，8 回合', iconId: 1985 },
  { id: 'ImmaculateMend', nameEn: 'Immaculate Mend', nameZh: '精修II', nameJa: 'マスターズメンドII', category: 'repair', level: 98, cp: 112, durability: 0, description: '耐久恢復至上限', iconId: 1950 },
  { id: 'Observe', nameEn: 'Observe', nameZh: '觀察', nameJa: '経過観察', category: 'other', level: 13, cp: 7, durability: 0, description: '等待一回合', iconId: 1954 },
  { id: 'TricksOfTheTrade', nameEn: 'Tricks of the Trade', nameZh: '秘訣', nameJa: '秘訣', category: 'other', level: 13, cp: 0, durability: 0, description: '恢復 20 CP（高品質限定）', iconId: 1990 },
  { id: 'HeartAndSoul', nameEn: 'Heart and Soul', nameZh: '心靈之手', nameJa: '一心不乱', category: 'other', level: 86, cp: 0, durability: 0, description: '下次可用高品質限定技能', iconId: 1996 },
  { id: 'QuickInnovation', nameEn: 'Quick Innovation', nameZh: '快速改革', nameJa: 'クイックイノベーション', category: 'buff', level: 96, cp: 0, durability: 0, description: '免費改革 1 回合', iconId: 1999 },
  { id: 'TrainedPerfection', nameEn: 'Trained Perfection', nameZh: '工匠的神髓', nameJa: '匠の絶技', category: 'buff', level: 100, cp: 0, durability: 0, description: '下次行動不消耗耐久', iconId: 1926 },
]

const SKILL_MAP = new Map<string, SkillDefinition>(SKILLS.map(s => [s.id, s]))

export function getSkillById(id: string): SkillDefinition | undefined {
  return SKILL_MAP.get(id)
}

export function getSkillName(id: string): string {
  return SKILL_MAP.get(id)?.nameZh ?? id
}

export type SupportedLocale = 'zh-TW' | 'zh-CN' | 'en' | 'ja'

export function getSkillNameByLocale(id: string, locale: SupportedLocale): string {
  const skill = SKILL_MAP.get(id)
  if (!skill) return id
  switch (locale) {
    case 'en': return skill.nameEn
    case 'ja': return skill.nameJa
    case 'zh-TW':
    case 'zh-CN':
    default: return skill.nameZh
  }
}

export function getSkillIconUrl(idOrSkill: string | SkillDefinition, job?: Job | null): string | null {
  const skill = typeof idOrSkill === 'string' ? SKILL_MAP.get(idOrSkill) : idOrSkill
  if (!skill) return null
  const perJob = job ? getPerJobIconId(skill.id, job) : null
  const iconId = perJob ?? skill.iconId
  if (!iconId) return null
  return getIconUrl(iconId)
}

export function getSkillsByLevel(level: number): SkillDefinition[] {
  return SKILLS.filter(s => s.level <= level)
}
