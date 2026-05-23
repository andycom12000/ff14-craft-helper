export const fmtInt = (n: number) => n.toLocaleString('en-US')
export const fmtPct = (n: number) => (n * 100).toFixed(1) + '%'
export const fmtSec = (n: number) => n.toFixed(1) + 's'
export const fmtMs = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 's' : Math.round(n) + 'ms')
