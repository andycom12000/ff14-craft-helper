import { ref, watch, onBeforeUnmount, type Ref } from 'vue'

/**
 * Tracks an arbitrary boolean derived from an element's intersection state.
 * The watch reattaches if the ref reseats; the observer is disconnected on
 * unmount. Mirrors the shape of `useStickyToolbarHeight` so call sites read
 * the same way.
 *
 * Usage:
 *   const { targetRef, flag } = useObserverFlag(
 *     (entry) => !entry.isIntersecting,
 *     { rootMargin: '-20px 0 0 0' },
 *   )
 *   <div ref="targetRef" />
 */
export function useObserverFlag(
  compute: (entry: IntersectionObserverEntry) => boolean,
  options?: IntersectionObserverInit,
): { targetRef: Ref<HTMLElement | null>; flag: Ref<boolean> } {
  const targetRef = ref<HTMLElement | null>(null)
  const flag = ref(false)
  let observer: IntersectionObserver | null = null

  watch(targetRef, (el, prev) => {
    if (prev) observer?.unobserve(prev)
    if (!el) {
      flag.value = false
      return
    }
    if (!observer) {
      observer = new IntersectionObserver(([entry]) => {
        flag.value = compute(entry)
      }, options)
    }
    observer.observe(el)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { targetRef, flag }
}
