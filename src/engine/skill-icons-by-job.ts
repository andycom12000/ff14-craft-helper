// Per-job icon IDs for the 11 crafting skills whose icon differs by job.
// Extracted from .data-cache/xiv-data/csv/en/CraftAction.csv on 2026-04-24.
// The +50-per-job offset heuristic almost holds but GSM has off-by-one
// deviations for several skills, so the full table is stored explicitly.

export type Job = 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL'

export const JOB_ORDER: readonly Job[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL']

const ICONS_BY_JOB: Record<string, Record<Job, number>> = {
  BasicSynthesis:    { CRP: 1501, BSM: 1551, ARM: 1601, GSM: 1651, LTW: 1701, WVR: 1751, ALC: 1801, CUL: 1851 },
  BasicTouch:        { CRP: 1502, BSM: 1552, ARM: 1602, GSM: 1652, LTW: 1702, WVR: 1752, ALC: 1802, CUL: 1852 },
  DelicateSynthesis: { CRP: 1503, BSM: 1553, ARM: 1603, GSM: 1653, LTW: 1703, WVR: 1753, ALC: 1803, CUL: 1853 },
  PreparatoryTouch:  { CRP: 1507, BSM: 1557, ARM: 1607, GSM: 1657, LTW: 1707, WVR: 1757, ALC: 1807, CUL: 1857 },
  IntensiveSynthesis:{ CRP: 1514, BSM: 1564, ARM: 1614, GSM: 1663, LTW: 1714, WVR: 1763, ALC: 1814, CUL: 1863 },
  StandardTouch:     { CRP: 1516, BSM: 1566, ARM: 1616, GSM: 1665, LTW: 1716, WVR: 1765, ALC: 1816, CUL: 1865 },
  Groundwork:        { CRP: 1518, BSM: 1568, ARM: 1618, GSM: 1667, LTW: 1718, WVR: 1767, ALC: 1818, CUL: 1867 },
  PrudentSynthesis:  { CRP: 1520, BSM: 1570, ARM: 1621, GSM: 1670, LTW: 1720, WVR: 1770, ALC: 1821, CUL: 1870 },
  RefinedTouch:      { CRP: 1522, BSM: 1572, ARM: 1623, GSM: 1674, LTW: 1722, WVR: 1772, ALC: 1823, CUL: 1873 },
  PreciseTouch:      { CRP: 1524, BSM: 1574, ARM: 1625, GSM: 1676, LTW: 1724, WVR: 1774, ALC: 1825, CUL: 1875 },
  PrudentTouch:      { CRP: 1535, BSM: 1584, ARM: 1635, GSM: 1686, LTW: 1734, WVR: 1784, ALC: 1835, CUL: 1886 },
}

export function getPerJobIconId(skillId: string, job: Job | null | undefined): number | null {
  if (!job) return null
  return ICONS_BY_JOB[skillId]?.[job] ?? null
}
