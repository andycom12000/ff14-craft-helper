// Shared on-scroll reveal — one IntersectionObserver toggles `.in-view` on each
// registered element the first time it scrolls into view. The reveal CSS lives
// in `src/components/ga-dashboard/dashboard.css` and respects
// `prefers-reduced-motion`. Call `attach(el)` from a chart/section root.

let observer: IntersectionObserver | null = null

function ensureObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view')
          observer!.unobserve(e.target)
        }
      })
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
  )
  return observer
}

export function useScrollReveal() {
  function attach(el: Element | null) {
    const obs = ensureObserver()
    if (el && obs) obs.observe(el)
  }
  return { attach }
}
