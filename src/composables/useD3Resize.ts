import { onMounted, onBeforeUnmount, ref, type Ref } from 'vue'

export function useD3Resize(elRef: Ref<HTMLElement | null>, onResize: (w: number, h: number) => void) {
  const width = ref(0)
  const height = ref(0)
  let ro: ResizeObserver | null = null

  onMounted(() => {
    if (!elRef.value) return
    ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      const h = Math.round(entry.contentRect.height)
      if (w === width.value && h === height.value) return
      width.value = w
      height.value = h
      onResize(w, h)
    })
    ro.observe(elRef.value)
  })

  onBeforeUnmount(() => {
    ro?.disconnect()
    ro = null
  })

  return { width, height }
}
