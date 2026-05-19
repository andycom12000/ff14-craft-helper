// src/composables/useTooltip.ts
// Shared tooltip layer — one DOM node per page, all charts call into it.
// Tooltip element is created on first use and lives in document.body so it's
// not constrained by chart container overflow.

let tipEl: HTMLDivElement | null = null

function ensureTipEl() {
  if (tipEl) return tipEl
  const el = document.createElement('div')
  el.className = 'ga-tooltip'
  el.style.cssText = [
    'position:absolute', 'pointer-events:none', 'opacity:0',
    'transition:opacity 120ms ease-out', 'z-index:1000',
    'background:oklch(0.26 0.022 62)', 'color:oklch(0.94 0.022 82)',
    'border:1px solid oklch(0.42 0.035 60 / 0.36)', 'border-radius:6px',
    'padding:10px 14px', 'font-size:13px', 'line-height:1.5', 'max-width:280px',
    'box-shadow:0 16px 48px oklch(0.10 0 0 / 0.45)',
    "font-family:'Noto Sans TC', sans-serif",
  ].join(';')
  document.body.appendChild(el)
  tipEl = el
  return el
}

export function useTooltip() {
  function show(html: string, ev: MouseEvent) {
    const el = ensureTipEl()
    el.innerHTML = html
    el.style.opacity = '1'
    el.style.left = (ev.pageX + 14) + 'px'
    el.style.top  = (ev.pageY + 14) + 'px'
  }
  function move(ev: MouseEvent) {
    if (!tipEl) return
    tipEl.style.left = (ev.pageX + 14) + 'px'
    tipEl.style.top  = (ev.pageY + 14) + 'px'
  }
  function hide() {
    if (!tipEl) return
    tipEl.style.opacity = '0'
  }
  return { show, move, hide }
}
