import { ref, watch, onUnmounted, type Ref } from 'vue'
import { searchRecipes, type RecipeSearchResult } from '@/api/xivapi'

interface UseRecipeSearchParams {
  query: Ref<string>
  job: Ref<string>
  levelMin: Ref<number | undefined>
  levelMax: Ref<number | undefined>
  /** Fires once per resolved search (success or empty after error). */
  onComplete?: (results: RecipeSearchResult[], query: string) => void
}

const DEBOUNCE_MS = 200

export function useRecipeSearch(params: UseRecipeSearchParams) {
  const { query, job, levelMin, levelMax, onComplete } = params
  const results = ref<RecipeSearchResult[]>([])
  const loading = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let searchSeq = 0

  watch([query, job, levelMin, levelMax], ([q]) => {
    if (debounceTimer) clearTimeout(debounceTimer)

    const trimmed = String(q).trim()
    if (!trimmed) {
      results.value = []
      return
    }

    const seq = ++searchSeq
    debounceTimer = setTimeout(async () => {
      loading.value = true
      try {
        const res = await searchRecipes(trimmed, {
          job: job.value || undefined,
          rlvMin: levelMin.value ?? undefined,
          rlvMax: levelMax.value ?? undefined,
        })
        if (seq !== searchSeq) return
        results.value = res
      } catch {
        if (seq !== searchSeq) return
        results.value = []
      } finally {
        if (seq === searchSeq) {
          loading.value = false
          onComplete?.(results.value, trimmed)
        }
      }
    }, DEBOUNCE_MS)
  })

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  return { results, loading }
}
