export type GearBucket = 'entry' | 'mid' | 'bis'

interface BisPoint {
  level: number
  craftsmanship: number
  control: number
}

// Approximate BiS at each crafter level cap. Values are intentionally
// conservative round numbers — used only for three-bucket classification,
// not precision math. Calibrate against community BiS guides if the
// distribution looks off.
const APPROX_BIS: BisPoint[] = [
  { level: 50, craftsmanship: 410, control: 410 },
  { level: 60, craftsmanship: 760, control: 760 },
  { level: 70, craftsmanship: 1750, control: 1700 },
  { level: 80, craftsmanship: 2700, control: 2600 },
  { level: 90, craftsmanship: 4070, control: 3900 },
  { level: 100, craftsmanship: 5400, control: 5200 },
]

function lookupBis(level: number): BisPoint {
  // Floor to the largest cap <= level. Below lv50, clamp to lv50.
  let chosen = APPROX_BIS[0]
  for (const point of APPROX_BIS) {
    if (point.level <= level) chosen = point
  }
  return chosen
}

export function classifyGearBucket(
  level: number,
  craftsmanship: number,
  control: number,
): GearBucket {
  const bis = lookupBis(level)
  const ratio = (craftsmanship / bis.craftsmanship + control / bis.control) / 2
  if (ratio >= 0.95) return 'bis'
  if (ratio >= 0.70) return 'mid'
  return 'entry'
}
