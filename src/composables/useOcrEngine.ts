import { ref, onUnmounted } from 'vue'
import type { Worker } from 'tesseract.js'

export function useOcrEngine() {
  const isLoading = ref(false)
  const isReady = ref(false)
  const progress = ref(0)
  let worker: Worker | null = null

  async function ensureWorker(): Promise<Worker> {
    if (worker) return worker
    isLoading.value = true
    const Tesseract = await import('tesseract.js')
    worker = await Tesseract.createWorker('chi_tra', undefined, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // Each pass reports its own 0→1 progress; scale across the two passes.
          progress.value = (currentPass + m.progress) / TOTAL_PASSES
        }
      },
    })
    isReady.value = true
    isLoading.value = false
    return worker
  }

  // Dual-PSM fusion: PSM 6 (uniform block) + PSM 4 (single column) each recover
  // different subsets of items. Measured on 11 screenshots: +14.4pp auto-match
  // vs single PSM 6 (101/118 vs 84/118), partial coverage 99.2%.
  const TOTAL_PASSES = 2
  let currentPass = 0

  async function recognize(image: Blob): Promise<string> {
    const w = await ensureWorker()
    progress.value = 0
    const passes: string[] = []
    for (const [i, psm] of (['6', '4'] as const).entries()) {
      currentPass = i
      await w.setParameters({ tessedit_pageseg_mode: psm as any })
      const { data: { text } } = await w.recognize(image)
      passes.push(text)
    }
    return passes.join('\n')
  }

  async function terminate() {
    if (worker) {
      await worker.terminate()
      worker = null
    }
    isReady.value = false
  }

  onUnmounted(terminate)

  return { isLoading, isReady, progress, recognize, terminate }
}
