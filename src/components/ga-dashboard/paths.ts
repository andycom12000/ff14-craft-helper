// GA reports pages under the GitHub Pages base prefix /ff14-craft-helper/.
// stripPath normalises that away so labels read as the in-app route.
export function stripPath(p: string): string {
  const t = p.replace(/^\/ff14-craft-helper\/?/, '').replace(/^\/+/, '')
  return t === '' ? 'home' : t
}
