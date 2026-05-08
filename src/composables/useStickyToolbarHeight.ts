import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

/**
 * Tracks the rendered height of a sticky toolbar (e.g. FlowBreadcrumb) so
 * a CSS var can drive `scroll-margin-top` on sections below it. The toolbar
 * height changes with active label length / pending-state copy, so a static
 * offset would land scroll targets behind the toolbar.
 *
 * Usage:
 *   const { targetRef, height } = useStickyToolbarHeight()
 *   <div :style="{ '--flow-h': `${height}px` }">
 *     <FlowBreadcrumb ref="targetRef" ... />
 *   </div>
 */
export function useStickyToolbarHeight(): {
  targetRef: Ref<{ $el?: HTMLElement } | HTMLElement | undefined>
  height: Ref<number>
} {
  const targetRef = ref<{ $el?: HTMLElement } | HTMLElement>()
  const height = ref(0)
  let observer: ResizeObserver | null = null

  onMounted(() => {
    const node = targetRef.value as { $el?: HTMLElement } | HTMLElement | undefined
    const el = (node && '$el' in node ? node.$el : node) as HTMLElement | undefined
    if (!el || typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      // border-box height matches the visual area the sticky toolbar covers.
      const borderBox = entry.borderBoxSize?.[0]
      height.value = borderBox ? borderBox.blockSize : entry.target.getBoundingClientRect().height
    })
    observer.observe(el)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { targetRef, height }
}
