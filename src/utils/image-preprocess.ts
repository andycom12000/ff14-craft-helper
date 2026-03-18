const SCALE = 3

/**
 * Preprocess game screenshot for better OCR accuracy.
 * Game UI has light text on dark background.
 * Steps: upscale 3x → grayscale → binarize (bright text → black, dark bg → white)
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

  // Step 2: Grayscale + binarize
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]

    // Binarize: bright pixels (text) → black(0), dark pixels (bg) → white(255)
    const binary = gray > 160 ? 0 : 255

    data[i] = binary
    data[i + 1] = binary
    data[i + 2] = binary
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
