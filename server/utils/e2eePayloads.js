const parseEncryptedPayload = (payload) => {
  if (!payload) {
    return null;
  }

  try {
    return typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch (error) {
    return null;
  }
};

const getProtocolVersion = (payload) => {
  const parsedPayload = parseEncryptedPayload(payload);
  const version = Number(parsedPayload?.version || parsedPayload?.protocolVersion || 1);
  return Number.isFinite(version) && version > 0 ? version : 1;
};

const getSenderDeviceId = (payload) => {
  const parsedPayload = parseEncryptedPayload(payload);
  return parsedPayload?.senderDeviceId || null;
};

const getEnvelopeDeviceIds = (payload) => {
  const parsedPayload = parseEncryptedPayload(payload);
  const envelopes = Array.isArray(parsedPayload?.envelopes) ? parsedPayload.envelopes : [];

  return [...new Set(envelopes
    .map((envelope) => envelope?.deviceId)
    .filter((deviceId) => typeof deviceId === 'string' && deviceId.trim().length > 0)
    .map((deviceId) => deviceId.trim()))];
};

const getPayloadMetadata = ({ encryptedContent = null, encryptionPayload = null }) => {
  const sourcePayload = encryptedContent || encryptionPayload || null;

  return {
    protocolVersion: getProtocolVersion(sourcePayload),
    senderDeviceId: getSenderDeviceId(sourcePayload),
    targetDeviceIds: getEnvelopeDeviceIds(sourcePayload)
  };
};

const validateDeviceBoundPayload = ({
  encryptedContent = null,
  encryptionPayload = null,
  authenticatedDeviceId = null,
  requireSelfEnvelope = false
}) => {
  const metadata = getPayloadMetadata({ encryptedContent, encryptionPayload });

  if (metadata.protocolVersion < 2) {
    return {
      ...metadata,
      isValid: true,
      error: null
    };
  }

  if (!authenticatedDeviceId) {
    return {
      ...metadata,
      isValid: false,
      error: 'A registered device ID is required for v2 encrypted payloads.'
    };
  }

  if (!metadata.senderDeviceId) {
    return {
      ...metadata,
      isValid: false,
      error: 'The encrypted payload is missing the sender device ID.'
    };
  }

  if (metadata.senderDeviceId !== authenticatedDeviceId) {
    return {
      ...metadata,
      isValid: false,
      error: 'The encrypted payload sender device does not match the authenticated device.'
    };
  }

  if (!metadata.targetDeviceIds.length) {
    return {
      ...metadata,
      isValid: false,
      error: 'The encrypted payload does not contain any target devices.'
    };
  }

  if (requireSelfEnvelope && !metadata.targetDeviceIds.includes(authenticatedDeviceId)) {
    return {
      ...metadata,
      isValid: false,
      error: 'The encrypted payload does not include the current sender device.'
    };
  }

  return {
    ...metadata,
    isValid: true,
    error: null
  };
};

module.exports = {
  parseEncryptedPayload,
  getProtocolVersion,
  getSenderDeviceId,
  getEnvelopeDeviceIds,
  getPayloadMetadata,
  validateDeviceBoundPayload
};
