const SCALE = 3

/**
 * Compute Otsu's threshold for a grayscale histogram.
 * Finds the threshold that minimises intra-class variance.
 */
function otsuThreshold(grayPixels: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0)
  for (let i = 0; i < grayPixels.length; i++) {
    histogram[grayPixels[i]]++
  }

  const total = grayPixels.length
  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i]

  let sumBg = 0
  let weightBg = 0
  let maxVariance = 0
  let bestThreshold = 128

  for (let t = 0; t < 256; t++) {
    weightBg += histogram[t]
    if (weightBg === 0) continue
    const weightFg = total - weightBg
    if (weightFg === 0) break

    sumBg += t * histogram[t]
    const meanBg = sumBg / weightBg
    const meanFg = (sumAll - sumBg) / weightFg
    const variance = weightBg * weightFg * (meanBg - meanFg) ** 2

    if (variance > maxVariance) {
      maxVariance = variance
      bestThreshold = t
    }
  }

  return bestThreshold
}

/**
 * Preprocess game screenshot for better OCR accuracy.
 * Game UI has light text on dark background.
 * Steps: upscale 3x → grayscale → Otsu binarize (bright text → black, dark bg → white)
 * Tesseract expects black text on white background and works best with large text.
 */
export async function preprocessForOcr(imageBlob: Blob): Promise<Blob> {
  const img = await loadImage(imageBlob)

  // Step 1: Draw original at higher resolution for better OCR
  const canvas = document.createElement('canvas')
  canvas.width = img.width * SCALE
  canvas.height = img.height * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  // Step 2: Grayscale
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const pixelCount = data.length / 4
  const grayPixels = new Uint8Array(pixelCount)

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4
    grayPixels[i] = Math.round(0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2])
  }

  // Step 3: Otsu's adaptive threshold
  const threshold = otsuThreshold(grayPixels)

  // Step 4: Binarize — bright pixels (text) → black(0), dark pixels (bg) → white(255)
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4
    const binary = grayPixels[i] > threshold ? 0 : 255
    data[off] = binary
    data[off + 1] = binary
    data[off + 2] = binary
  }

  ctx.putImageData(imageData, 0, 0)

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
