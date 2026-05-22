/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

const ensureUploadsDirectory = () => {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return UPLOADS_DIR;
};

const sanitizeStoredFilename = (filename) => path.basename(String(filename || '').trim());

const resolveStoredFilePath = (filename) => path.join(
  ensureUploadsDirectory(),
  sanitizeStoredFilename(filename)
);

const buildAttachmentUrl = (filename) => `/api/upload/files/${sanitizeStoredFilename(filename)}`;
const buildAvatarUrl = (filename) => `/api/upload/avatars/${sanitizeStoredFilename(filename)}`;
const buildLegacyUploadUrl = (filename) => `/uploads/${sanitizeStoredFilename(filename)}`;

module.exports = {
  UPLOADS_DIR,
  buildAttachmentUrl,
  buildAvatarUrl,
  buildLegacyUploadUrl,
  ensureUploadsDirectory,
  resolveStoredFilePath,
  sanitizeStoredFilename
};
