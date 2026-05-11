/**
 * Build a `/tp` chat command targeting an aetheryte.
 * FFXIV's client matches this against aetheryte names; pass `aetheryteName`
 * (e.g. "烏爾達哈"), NOT a zone PlaceName.
 */
export function buildTpCommand(aetheryteName: string): string {
  return `/tp ${aetheryteName.trim()}`
}
