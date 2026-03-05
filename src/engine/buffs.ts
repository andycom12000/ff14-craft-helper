export type BuffType =
  | 'InnerQuiet'
  | 'WasteNot'
  | 'WasteNotII'
  | 'Veneration'
  | 'Innovation'
  | 'GreatStrides'
  | 'Manipulation'
  | 'FinalAppraisal'
  | 'MuscleMemory'
  | 'Pliant'

export interface BuffInfo {
  name: string
  maxDuration: number
  maxStacks: number
  description: string
}

export const BUFF_DEFINITIONS: Record<BuffType, BuffInfo> = {
  InnerQuiet: {
    name: '内静',
    maxDuration: Infinity,
    maxStacks: 10,
    description: '每次品質行動增加疊層，提升品質加成',
  },
  WasteNot: {
    name: '俭约',
    maxDuration: 4,
    maxStacks: 1,
    description: '耐久消耗減半',
  },
  WasteNotII: {
    name: '长期俭约',
    maxDuration: 8,
    maxStacks: 1,
    description: '耐久消耗減半',
  },
  Veneration: {
    name: '崇敬',
    maxDuration: 4,
    maxStacks: 1,
    description: '進展效率提升 50%',
  },
  Innovation: {
    name: '改革',
    maxDuration: 4,
    maxStacks: 1,
    description: '品質效率提升 50%',
  },
  GreatStrides: {
    name: '阔步',
    maxDuration: 3,
    maxStacks: 1,
    description: '下次品質行動效率提升 100%',
  },
  Manipulation: {
    name: '掌握',
    maxDuration: 8,
    maxStacks: 1,
    description: '每回合恢復 5 耐久',
  },
  FinalAppraisal: {
    name: '最终确认',
    maxDuration: 5,
    maxStacks: 1,
    description: '進展超過上限時保留 1 點',
  },
  MuscleMemory: {
    name: '坚信',
    maxDuration: 5,
    maxStacks: 1,
    description: '下次進展行動效率提升 100%',
  },
  Pliant: {
    name: '安定',
    maxDuration: 0,
    maxStacks: 1,
    description: 'CP 消耗減半（狀態觸發）',
  },
}
