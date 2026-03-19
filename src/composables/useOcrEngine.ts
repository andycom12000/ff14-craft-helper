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
          progress.value = m.progress
        }
      },
    })
    // PSM 6 = Assume a single uniform block of text
    // Better for game UI tables with consistent row structure
    await worker.setParameters({
      tessedit_pageseg_mode: '6' as any,
    })
    isReady.value = true
    isLoading.value = false
    return worker
  }

  async function recognize(image: Blob): Promise<string> {
    const w = await ensureWorker()
    progress.value = 0
    const { data: { text } } = await w.recognize(image)
    return text
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
