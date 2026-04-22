// FFXIV icon CDN — beta.xivapi.com serves pre-rendered PNGs via the asset
// endpoint. Format verified against live CDN (2026-04, iconId 38508, 26634).
const ICON_BASE = 'https://beta.xivapi.com/api/1/asset/ui/icon'

function pad6(n: number): string {
  return String(n).padStart(6, '0')
}

/**
 * Build a CDN URL for an FFXIV icon given its numeric icon ID.
 *
 * FFXIV icons are organized on disk by thousands (e.g. icon 26634 lives in
 * folder `026000/`). The returned URL points at the high-resolution variant
 * converted to PNG by xivapi's asset service.
 *
 * Pure function — no reactivity, no network access.
 */
export function getIconUrl(iconId: number): string {
  const folder = Math.floor(iconId / 1000) * 1000
  return `${ICON_BASE}/${pad6(folder)}/${pad6(iconId)}_hr1.tex?format=png`
}
