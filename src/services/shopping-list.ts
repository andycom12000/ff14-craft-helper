export interface MaterialBase {
  itemId: number
  name: string
  icon: string
  amount: number
}

export interface MaterialWithPrice extends MaterialBase {
  type: 'nq' | 'hq' | 'craft'
  unitPrice: number
  server?: string
}

export interface CrystalSummary {
  itemId: number
  name: string
  amount: number
}

export interface ServerGroup {
  server: string
  items: MaterialWithPrice[]
  subtotal: number
}

const CRYSTAL_THRESHOLD = 20

export function separateCrystals(materials: MaterialBase[]): {
  crystals: CrystalSummary[]
  nonCrystals: MaterialBase[]
} {
  const crystals: CrystalSummary[] = []
  const nonCrystals: MaterialBase[] = []

  for (const m of materials) {
    if (m.itemId < CRYSTAL_THRESHOLD) {
      crystals.push({ itemId: m.itemId, name: m.name, amount: m.amount })
    } else {
      nonCrystals.push(m)
    }
  }
  return { crystals, nonCrystals }
}

export function groupByServer(materials: MaterialWithPrice[]): ServerGroup[] {
  const groups = new Map<string, MaterialWithPrice[]>()

  for (const m of materials) {
    const server = m.server ?? 'Unknown'
    if (!groups.has(server)) groups.set(server, [])
    groups.get(server)!.push(m)
  }

  return Array.from(groups.entries()).map(([server, items]) => ({
    server,
    items,
    subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.amount, 0),
  }))
}

export function aggregateMaterials(
  materialsArrays: MaterialBase[][],
): MaterialBase[] {
  const map = new Map<number, MaterialBase>()
  for (const materials of materialsArrays) {
    for (const m of materials) {
      const existing = map.get(m.itemId)
      if (existing) {
        existing.amount += m.amount
      } else {
        map.set(m.itemId, { ...m })
      }
    }
  }
  return Array.from(map.values())
}
