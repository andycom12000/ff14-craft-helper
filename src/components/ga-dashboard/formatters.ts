export const fmtInt = (n: number) => n.toLocaleString('en-US')
export const fmtPct = (n: number) => (n * 100).toFixed(1) + '%'
export const fmtSec = (n: number) => n.toFixed(1) + 's'
