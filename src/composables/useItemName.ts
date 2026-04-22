import { computed, type ComputedRef, type MaybeRefOrGetter } from 'vue'

export function useItemName(_itemId: MaybeRefOrGetter<number>): ComputedRef<string> {
  return computed(() => 'stub')
}
