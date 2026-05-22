/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const SECURE_TEXT_PLACEHOLDER = '[Encrypted message]';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const resolveStoredTextContent = ({ plaintext = '', encryptedContent = null }) => {
  const normalizedPlaintext = normalizeText(plaintext);

  if (!encryptedContent) {
    return normalizedPlaintext;
  }

  if (normalizedPlaintext && normalizedPlaintext !== SECURE_TEXT_PLACEHOLDER) {
    throw new Error('Secure messages must not include plaintext content.');
  }

  return SECURE_TEXT_PLACEHOLDER;
};

module.exports = {
  SECURE_TEXT_PLACEHOLDER,
  normalizeText,
  resolveStoredTextContent
};
