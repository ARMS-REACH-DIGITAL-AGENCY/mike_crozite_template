// src/lib/shrinkPhoto.ts
// Shrinks a phone photo in the browser so a normal photo never hits the
// upload size limit. Keeps the original if the browser can't read it.
// Used by the Add a Story drawer and the photo button on comments.
const MAX_EDGE = 2048;

export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return blob || file;
  } catch {
    return file;
  }
}

// "IMG_1234.HEIC" -> "IMG_1234.jpg" (the shrunk photo is always a JPEG).
export function jpegName(file: File) {
  return file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg';
}
