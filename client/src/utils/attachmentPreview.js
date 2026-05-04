import { encode } from 'blurhash';

const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 4;
const BLURHASH_MAX_DIMENSION = 32;
const GENERATABLE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp'
]);

const createCanvasElement = (width, height) => {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const getScaledDimensions = (width, height, maxDimension = BLURHASH_MAX_DIMENSION) => {
  if (!width || !height) {
    return {
      width: maxDimension,
      height: maxDimension
    };
  }

  const largestDimension = Math.max(width, height);
  const scale = largestDimension > maxDimension ? maxDimension / largestDimension : 1;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
};

const revokeObjectUrl = (objectUrl) => {
  if (objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(objectUrl);
  }
};

const loadImageElement = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    revokeObjectUrl(objectUrl);
    resolve(image);
  };

  image.onerror = () => {
    revokeObjectUrl(objectUrl);
    reject(new Error('The image preview could not be loaded.'));
  };

  image.src = objectUrl;
});

const loadPreviewSource = async (file) => {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }

  return loadImageElement(file);
};

const closePreviewSource = (source) => {
  if (source && typeof source.close === 'function') {
    source.close();
  }
};

export const getAttachmentCategory = (mimetype = '') => {
  if (String(mimetype).startsWith('image/')) {
    return 'image';
  }

  if (String(mimetype).startsWith('video/')) {
    return 'video';
  }

  if (String(mimetype).startsWith('audio/')) {
    return 'audio';
  }

  return 'file';
};

export const canGenerateAttachmentPreview = (file) => {
  if (!file?.type) {
    return false;
  }

  return GENERATABLE_IMAGE_MIME_TYPES.has(file.type.toLowerCase());
};

export const createLocalAttachmentPreviewUrl = (file) => {
  if (!canGenerateAttachmentPreview(file) || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }

  return URL.createObjectURL(file);
};

export const formatAttachmentSize = (size) => {
  const numericSize = Number(size);
  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    return 'Unknown size';
  }

  if (numericSize < 1024) {
    return `${numericSize} B`;
  }

  if (numericSize < 1024 * 1024) {
    return `${Math.max(1, Math.round(numericSize / 1024))} KB`;
  }

  return `${(numericSize / (1024 * 1024)).toFixed(numericSize >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
};

export const isImageAttachmentMetadata = (metadata = null) => (
  metadata?.category === 'image'
  || String(metadata?.mimetype || '').startsWith('image/')
  || metadata?.preview?.kind === 'blurhash'
);

export const buildEncryptedAttachmentMetadata = async (file) => {
  const metadata = {
    originalName: file?.name || 'Attachment',
    mimetype: file?.type || 'application/octet-stream',
    size: Number(file?.size || 0),
    category: getAttachmentCategory(file?.type || '')
  };

  if (!canGenerateAttachmentPreview(file)) {
    return metadata;
  }

  let previewSource = null;

  try {
    previewSource = await loadPreviewSource(file);
    const naturalWidth = Number(previewSource.width || 0);
    const naturalHeight = Number(previewSource.height || 0);
    const { width, height } = getScaledDimensions(naturalWidth, naturalHeight);
    const canvas = createCanvasElement(width, height);

    if (!canvas) {
      return metadata;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return metadata;
    }

    context.drawImage(previewSource, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const blurhash = encode(
      imageData.data,
      width,
      height,
      BLURHASH_COMPONENTS_X,
      BLURHASH_COMPONENTS_Y
    );

    return {
      ...metadata,
      preview: {
        kind: 'blurhash',
        hash: blurhash,
        width: naturalWidth || width,
        height: naturalHeight || height
      }
    };
  } catch (error) {
    console.warn('Failed to generate attachment preview metadata:', error);
    return metadata;
  } finally {
    closePreviewSource(previewSource);
  }
};
