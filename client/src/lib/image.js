const MAX_DIMENSION = 1280;
const TARGET_BYTES = 400_000; // keeps 150 phones downloading each image quickly on mobile data
const MAX_INPUT_BYTES = 25_000_000;

let webpSupported = null;
function canEncodeWebp() {
  if (webpSupported === null) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupported;
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img> decoding (older Safari).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Shrinks a photo or screenshot to at most 1280px and ~400 KB, re-encoding as
 * WebP (or JPEG where WebP encoding isn't available). Returns a data URL.
 * Animated GIFs become a still image.
 */
export async function compressImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose an image file (JPEG, PNG, WebP or GIF)');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is over 25 MB. Try a smaller one.');

  let source;
  try {
    source = await loadImage(file);
  } catch {
    throw new Error("Couldn't read that image. Try a JPEG or PNG.");
  }
  const type = canEncodeWebp() ? 'image/webp' : 'image/jpeg';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let scale = Math.min(1, MAX_DIMENSION / Math.max(source.width, source.height));

  for (let round = 0; round < 4; round++, scale *= 0.7) {
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    // JPEG has no transparency, so give transparent PNGs a white background instead of black.
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.72, 0.6]) {
      const blob = await toBlob(canvas, type, quality);
      if (blob && blob.size <= TARGET_BYTES) {
        source.close?.();
        return toDataUrl(blob);
      }
    }
  }
  source.close?.();
  throw new Error("Couldn't shrink that image enough. Try a smaller one.");
}

/** Gets an image file from a paste or drop event, if there is one. */
export function imageFromTransfer(dataTransfer) {
  return [...(dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/')) ?? null;
}
