const SCALE = 2

/**
 * Upscale screenshot 2x with high-quality resampling for better OCR accuracy.
 *
 * Measured across 11 FF14 supply-mission screenshots (118 items): 2x beats
 * 3x/4x/5x on recognition rate despite intuition — Tesseract's layout
 * analysis is tuned for near-native resolution, and higher scales introduce
 * resample artefacts that confuse character boundaries.
 *
 * Earlier versions also desaturated colorful pixels + Otsu-binarized the
 * result; that approach erases entire rows where icons overlap text.
 */
export async function preprocessForOcr(imageBlob: Blob): Promise<Blob> {
  const img = await loadImage(imageBlob)

  const canvas = document.createElement('canvas')
  canvas.width = img.width * SCALE
  canvas.height = img.height * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png')
  })
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      resolve(img)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
}
