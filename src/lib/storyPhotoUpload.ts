// Story photos are copied while the picker still grants access, then kept
// as prepared, memory-backed blobs for the eventual Post action.
export const STORY_PHOTO_MAX_BYTES = 1_000_000;
// The exact multipart body must stay below Vercel's 4.5 MB request limit.
// Four prepared photos leave room for the story, tags and multipart fields.
export const STORY_UPLOAD_MAX_BYTES = 4_400_000;
const MAX_EDGE = 2048;

export type StoryPhotoData = { blob: Blob; name: string };

export async function copyStoryPhoto(file: File): Promise<StoryPhotoData> {
  try {
    // Start this read in the file input's change handler, before clearing
    // the input or waiting for authentication, text entry or compression.
    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) throw new Error('Empty photo');
    return { blob: new Blob([bytes], { type: file.type }), name: file.name };
  } catch {
    throw new Error(`We couldn't read ${file.name || 'that photo'}. Please choose it again from your device.`);
  }
}

type DecodedPhoto = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodePhoto(blob: Blob): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (bitmap.width > 0 && bitmap.height > 0) {
        return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
      }
      bitmap.close();
    } catch {
      // Some phone formats decode through <img> but not createImageBitmap.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Photo could not be decoded'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty photo');
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function prepareStoryPhoto(photo: StoryPhotoData): Promise<StoryPhotoData> {
  let decoded: DecodedPhoto | undefined;
  try {
    decoded = await decodePhoto(photo.blob);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    let scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));

    // Keep the normal 2048px/0.86 result when it fits. Only larger images
    // need lower quality or dimensions; never fall back to the picker File.
    for (let attempt = 0; attempt < 10; attempt++) {
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.76, 0.66]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob || blob.type !== 'image/jpeg' || !blob.size) throw new Error('Photo could not be encoded');
        if (blob.size <= STORY_PHOTO_MAX_BYTES) {
          return { blob, name: photo.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg' };
        }
      }
      scale *= 0.8;
    }
    throw new Error('Photo could not be made small enough');
  } catch {
    throw new Error(`We couldn't prepare ${photo.name || 'that photo'}. Please try a JPG, PNG or WebP photo.`);
  } finally {
    decoded?.release();
  }
}

export async function createStoryUploadBody(form: FormData): Promise<{ body: Blob; contentType: string }> {
  const encoded = new Response(form);
  const contentType = encoded.headers.get('content-type');
  if (!contentType) throw new Error('Your photos could not be prepared for upload. Please try again.');
  const body = await encoded.blob();
  if (body.size > STORY_UPLOAD_MAX_BYTES) {
    throw new Error('These photos are too large to post together. Remove a photo and try again.');
  }
  // Preserve the encoder's exact boundary, including its case, instead of
  // relying on Blob.type normalization to reproduce the multipart header.
  return { body, contentType };
}
