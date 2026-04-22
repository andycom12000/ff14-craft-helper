// URL pattern mirrors XIVAPI v1 legacy icon paths. If xivapi-v2.xivcdn.com
// requires a different layout, adjust after live verification (see Risk R2 in plan).
const ICON_CDN = 'https://xivapi-v2.xivcdn.com'

function pad6(n: number): string {
  return String(n).padStart(6, '0')
}

/**
 * Build a CDN URL for an FFXIV icon given its numeric icon ID.
 *
 * FFXIV icons are organized on disk by thousands (e.g. icon 5057 lives in
 * folder `005000/`). The returned URL points at the high-resolution variant.
 *
 * Pure function — no reactivity, no network access.
 */
export function getIconUrl(iconId: number): string {
  const folder = Math.floor(iconId / 1000) * 1000
  return `${ICON_CDN}/i/${pad6(folder)}/${pad6(iconId)}_hr1.png`
}
