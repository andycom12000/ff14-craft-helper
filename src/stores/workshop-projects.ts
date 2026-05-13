import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CompanyCraftCategory, CompanyCraftPhase, CompanyCraftSequence } from '@/services/local-data-source.types'

export interface PhaseProgressKey {
  sequenceId: number
  partIndex: number
  processIndex: number
}

export interface WorkshopProjectSequence {
  sequenceId: number
}

export interface WorkshopProject {
  id: string
  name: string
  category: CompanyCraftCategory
  createdAt: number
  completedAt?: number
  sequences: WorkshopProjectSequence[]
  phaseProgress: Record<string, Record<number, number>>
}

export function serializePhaseKey(k: PhaseProgressKey): string {
  return `${k.sequenceId}:${k.partIndex}:${k.processIndex}`
}

export function parsePhaseKey(s: string): PhaseProgressKey {
  const [seq, part, proc] = s.split(':').map(Number)
  return { sequenceId: seq, partIndex: part, processIndex: proc }
}

function genId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// Aggregation selectors (pure functions, no store dependency)
// ---------------------------------------------------------------------------

export function getDelivered(
  project: WorkshopProject,
  phaseKey: string,
  supplyIndex: number,
): number {
  return project.phaseProgress[phaseKey]?.[supplyIndex] ?? 0
}

export function isPhaseComplete(
  project: WorkshopProject,
  phase: CompanyCraftPhase,
  phaseKey: string,
): boolean {
  for (let i = 0; i < phase.supplyItems.length; i++) {
    if (getDelivered(project, phaseKey, i) < phase.supplyItems[i].amount) return false
  }
  return true
}

export function getTotalMaterials(
  project: WorkshopProject,
  sequences: CompanyCraftSequence[],
  seqById: Map<number, CompanyCraftSequence> = new Map(sequences.map(s => [s.id, s])),
): Map<number, number> {
  const out = new Map<number, number>()
  for (const ref of project.sequences) {
    const seq = seqById.get(ref.sequenceId)
    if (!seq) continue
    for (const phase of seq.phases) {
      for (const supply of phase.supplyItems) {
        out.set(supply.itemId, (out.get(supply.itemId) ?? 0) + supply.amount)
      }
    }
  }
  return out
}

export function getRemainingMaterials(
  project: WorkshopProject,
  sequences: CompanyCraftSequence[],
  seqById: Map<number, CompanyCraftSequence> = new Map(sequences.map(s => [s.id, s])),
): Map<number, number> {
  const out = new Map<number, number>()
  for (const ref of project.sequences) {
    const seq = seqById.get(ref.sequenceId)
    if (!seq) continue
    for (const phase of seq.phases) {
      const phaseKey = serializePhaseKey({
        sequenceId: ref.sequenceId,
        partIndex: phase.partIndex,
        processIndex: phase.processIndex,
      })
      for (let i = 0; i < phase.supplyItems.length; i++) {
        const supply = phase.supplyItems[i]
        const remaining = Math.max(0, supply.amount - getDelivered(project, phaseKey, i))
        if (remaining <= 0) continue
        out.set(supply.itemId, (out.get(supply.itemId) ?? 0) + remaining)
      }
    }
  }
  return out
}

export interface ProjectProgressDetail {
  done: number
  total: number
  ratio: number
}

export function getProjectProgressDetail(
  project: WorkshopProject,
  sequences: CompanyCraftSequence[],
  seqById: Map<number, CompanyCraftSequence> = new Map(sequences.map(s => [s.id, s])),
): ProjectProgressDetail {
  let total = 0
  let done = 0
  for (const ref of project.sequences) {
    const seq = seqById.get(ref.sequenceId)
    if (!seq) continue
    for (const phase of seq.phases) {
      const phaseKey = serializePhaseKey({
        sequenceId: ref.sequenceId,
        partIndex: phase.partIndex,
        processIndex: phase.processIndex,
      })
      total += 1
      if (isPhaseComplete(project, phase, phaseKey)) done += 1
    }
  }
  return { done, total, ratio: total === 0 ? 0 : done / total }
}

export function getProjectProgress(
  project: WorkshopProject,
  sequences: CompanyCraftSequence[],
  seqById?: Map<number, CompanyCraftSequence>,
): number {
  return getProjectProgressDetail(project, sequences, seqById).ratio
}

export const useWorkshopProjectsStore = defineStore('workshop-projects', () => {
  const projects = ref<WorkshopProject[]>([])
  const progressVersion = ref(0)

  function getProject(id: string): WorkshopProject | null {
    return projects.value.find(p => p.id === id) ?? null
  }

  function createProject(input: {
    name: string
    category: CompanyCraftCategory
    sequences: WorkshopProjectSequence[]
  }): string {
    const id = genId()
    projects.value.push({
      id,
      name: input.name,
      category: input.category,
      createdAt: Date.now(),
      sequences: [...input.sequences],
      phaseProgress: {},
    })
    return id
  }

  function deleteProject(id: string) {
    projects.value = projects.value.filter(p => p.id !== id)
  }

  function renameProject(id: string, name: string) {
    const proj = getProject(id)
    if (proj) proj.name = name
  }

  function getDelivered(projectId: string, phaseKey: string, supplyIndex: number): number {
    const proj = getProject(projectId)
    if (!proj) return 0
    return proj.phaseProgress[phaseKey]?.[supplyIndex] ?? 0
  }

  function setDelivered(projectId: string, phaseKey: string, supplyIndex: number, value: number) {
    const proj = getProject(projectId)
    if (!proj) return
    const clamped = Math.max(0, Math.floor(value))
    const current = proj.phaseProgress[phaseKey]?.[supplyIndex] ?? 0
    if (current === clamped) return
    const row = proj.phaseProgress[phaseKey] ?? {}
    proj.phaseProgress = {
      ...proj.phaseProgress,
      [phaseKey]: { ...row, [supplyIndex]: clamped },
    }
    progressVersion.value++
  }

  function markCompleted(id: string) {
    const proj = getProject(id)
    if (proj) proj.completedAt = Date.now()
  }

  function unmarkCompleted(id: string) {
    const proj = getProject(id)
    if (proj) delete proj.completedAt
  }

  const activeProjects = computed(() => projects.value.filter(p => !p.completedAt))

  return {
    projects,
    progressVersion,
    activeProjects,
    getProject,
    createProject,
    deleteProject,
    renameProject,
    getDelivered,
    setDelivered,
    markCompleted,
    unmarkCompleted,
  }
}, {
  persist: {
    pick: ['projects'],
  },
})
