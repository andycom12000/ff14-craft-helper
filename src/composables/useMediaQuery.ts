import { ref, onBeforeUnmount, type Ref } from 'vue'

export const MOBILE_BREAKPOINT = '(max-width: 640px)'

export function useMediaQuery(query: string): Ref<boolean> {
  const mql = typeof window !== 'undefined' ? window.matchMedia(query) : null
  const matches = ref(mql?.matches ?? false)
  const onChange = (e: MediaQueryListEvent) => { matches.value = e.matches }
  mql?.addEventListener('change', onChange)
  onBeforeUnmount(() => mql?.removeEventListener('change', onChange))
  return matches
}

export function useIsMobile(): Ref<boolean> {
  return useMediaQuery(MOBILE_BREAKPOINT)
}
