const fs = require('fs/promises');

const ENCRYPTED_UPLOAD_MIME_TYPE = 'application/octet-stream';
const DEFAULT_ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/plain',
  'application/pdf'
];
const IMAGE_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif'
];

const FILE_SIGNATURES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  'image/gif': [
    Buffer.from('GIF87a', 'ascii'),
    Buffer.from('GIF89a', 'ascii')
  ],
  'application/pdf': [Buffer.from('%PDF-', 'ascii')]
};

const getAllowedUploadMimeTypes = () => {
  const configuredTypes = process.env.ALLOWED_FILE_TYPES
    ? process.env.ALLOWED_FILE_TYPES
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean)
    : DEFAULT_ALLOWED_UPLOAD_MIME_TYPES;

  return configuredTypes.filter((type) => type !== ENCRYPTED_UPLOAD_MIME_TYPE);
};

const isEncryptedUpload = ({ mimetype, encryptedFilePayload }) => (
  Boolean(encryptedFilePayload) && mimetype === ENCRYPTED_UPLOAD_MIME_TYPE
);

const isUploadMimeAllowed = ({ mimetype, encryptedFilePayload, allowedMimetypes = null }) => {
  if (isEncryptedUpload({ mimetype, encryptedFilePayload })) {
    return true;
  }

  const allowedTypes = allowedMimetypes || getAllowedUploadMimeTypes();
  return allowedTypes.includes(mimetype);
};

const readLeadingBytes = async (filePath, maxBytes = 64) => {
  const handle = await fs.open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const matchesSignature = (buffer, signatures = []) => (
  signatures.some((signature) => (
    buffer.length >= signature.length
    && buffer.subarray(0, signature.length).equals(signature)
  ))
);

const isLikelyPlainText = (buffer) => {
  if (!buffer.length) {
    return false;
  }

  for (const byte of buffer.values()) {
    const isWhitespace = byte === 0x09 || byte === 0x0A || byte === 0x0D;
    const isPrintableAscii = byte >= 0x20 && byte <= 0x7E;

    if (!isWhitespace && !isPrintableAscii) {
      return false;
    }
  }

  return true;
};

const validateStoredUpload = async ({
  filePath,
  mimetype,
  encryptedFilePayload = null,
  allowedMimetypes = null
}) => {
  if (!isUploadMimeAllowed({ mimetype, encryptedFilePayload, allowedMimetypes })) {
    return {
      isValid: false,
      error: `File type ${mimetype} is not allowed`
    };
  }

  const leadingBytes = await readLeadingBytes(filePath);
  if (!leadingBytes.length) {
    return {
      isValid: false,
      error: 'Uploaded files must not be empty.'
    };
  }

  if (isEncryptedUpload({ mimetype, encryptedFilePayload })) {
    return {
      isValid: true,
      isEncrypted: true
    };
  }

  if (mimetype === 'text/plain') {
    return isLikelyPlainText(leadingBytes)
      ? { isValid: true, isEncrypted: false }
      : {
        isValid: false,
        error: 'The uploaded text file does not match its declared type.'
      };
  }

  if (!matchesSignature(leadingBytes, FILE_SIGNATURES[mimetype] || [])) {
    return {
      isValid: false,
      error: 'The uploaded file content does not match its declared type.'
    };
  }

  return {
    isValid: true,
    isEncrypted: false
  };
};

module.exports = {
  ENCRYPTED_UPLOAD_MIME_TYPE,
  DEFAULT_ALLOWED_UPLOAD_MIME_TYPES,
  IMAGE_UPLOAD_MIME_TYPES,
  getAllowedUploadMimeTypes,
  isUploadMimeAllowed,
  validateStoredUpload
};
