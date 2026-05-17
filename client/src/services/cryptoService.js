import api from './api';
import sodium from 'libsodium-wrappers';
import { getOrCreateDeviceId } from '../utils/device';
import { normalizeId } from '../utils/identity';
import { isExpiredMessage, markAttachmentConsumedLocally } from '../utils/messagePrivacy';
import {
  DEFAULT_DIRECT_SESSION_MAX_SKIP,
  normalizeDirectSessionState,
  registerReceivedDirectSessionCounter,
  validateIncomingDirectSessionCounter
} from '../utils/directSessionState';
import {
  decapsulatePostQuantumSharedSecret,
  encapsulatePostQuantumSharedSecret,
  generatePostQuantumKemKeyPair,
  generatePostQuantumSignatureKeyPair,
  POST_QUANTUM_KEM_ALGORITHM,
  POST_QUANTUM_SIGNATURE_ALGORITHM,
  signPostQuantum,
  verifyPostQuantumSignature
} from '../utils/postQuantumCrypto';
import { buildEncryptedAttachmentMetadata } from '../utils/attachmentPreview';
import {
  deleteDeviceKeyMaterial,
  deleteDeviceSessionsForDevice,
  loadDeviceKeyMaterial,
  saveDeviceKeyMaterial,
  loadDeviceSession,
  saveDeviceSession
} from '../utils/secureKeyStore';

const IDENTITY_VERSION = 1;
const PAYLOAD_VERSION = 1;
const DEVICE_PAYLOAD_VERSION = 2;
const LEGACY_DIRECT_SESSION_PAYLOAD_VERSION = 3;
const CLASSICAL_DIRECT_SESSION_PAYLOAD_VERSION = 4;
const DIRECT_SESSION_PAYLOAD_VERSION = 5;
const DEVICE_BUNDLE_VERSION = 4;
const DEVICE_ALGORITHM = 'secretbox+sealed-box+ed25519+ml-dsa-87';
const DIRECT_SESSION_ALGORITHM = 'x3dh-ml-kem1024-hybrid-secretbox-sealed-ratchet-v3';
const DIRECT_SESSION_RATCHET_MODE = 'sealed-box-per-message';
const BACKUP_VERSION = 1;
const BACKUP_ITERATIONS = 250000;
const DEFAULT_ONE_TIME_PREKEY_COUNT = 12;
const LOW_ONE_TIME_PREKEY_THRESHOLD = 4;
const SIGNED_PREKEY_ROTATION_MS = 7 * 24 * 60 * 60 * 1000;
const IMPLEMENTED_POST_QUANTUM_KEMS = [POST_QUANTUM_KEM_ALGORITHM];
const IMPLEMENTED_POST_QUANTUM_SIGNATURES = [POST_QUANTUM_SIGNATURE_ALGORITHM];
const ENCRYPTED_PLACEHOLDER = '[Encrypted message]';
const ENCRYPTED_ATTACHMENT_PLACEHOLDER = '[Encrypted attachment]';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const base64FromArrayBuffer = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
};

const base64FromBytes = (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return base64FromArrayBuffer(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
};

const arrayBufferFromBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const bytesFromBase64 = (value) => new Uint8Array(arrayBufferFromBase64(value));

const bytesToHex = (buffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
};

const formatFingerprint = (hex) => {
  if (!hex) {
    return null;
  }

  return hex.toUpperCase().match(/.{1,4}/g)?.join(' ') || hex.toUpperCase();
};

const isTimestampStale = (value, maxAgeMs) => {
  if (!value) {
    return true;
  }

  const parsedTimestamp = new Date(value).getTime();
  return !Number.isFinite(parsedTimestamp) || (Date.now() - parsedTimestamp) >= maxAgeMs;
};

const publicStorageKey = (userId) => `vaaniarc_e2ee_public_${userId}`;
const privateStorageKey = (userId) => `vaaniarc_e2ee_private_${userId}`;
const trustedContactsStorageKey = (userId) => `vaaniarc_e2ee_trusted_contacts_${userId}`;

const parsePayload = (payload) => {
  if (!payload) {
    return null;
  }

  try {
    return typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch (error) {
    console.error('Invalid encrypted payload format:', error);
    return null;
  }
};

const createDownloadUrl = (blob, filename) => {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
};

const randomUploadName = () => {
  if (crypto.randomUUID) {
    return `${crypto.randomUUID()}.vaani`;
  }

  return `encrypted-${Date.now()}.vaani`;
};

const buildIdentityState = ({
  status,
  userId = null,
  fingerprint = null,
  serverFingerprint = null,
  message,
  publishStatus = 'ok'
}) => ({
  status,
  userId,
  fingerprint,
  serverFingerprint,
  publishStatus,
  message
});

const isNotFoundError = (error) => (
  error?.statusCode === 404
  || error?.category === 'not_found'
  || /not found|not set up|no active device/i.test(String(error?.message || ''))
);

const extractAttachmentDetails = (message) => {
  if (message?.fileMetadata?.encryptionPayload) {
    return {
      fileUrl: message.fileUrl,
      encryptionPayload: message.fileMetadata.encryptionPayload,
      fileMetadata: message.fileMetadata
    };
  }

  if (message?.content?.file?.encryptionPayload) {
    return {
      fileUrl: message.content.file.url,
      encryptionPayload: message.content.file.encryptionPayload,
      fileMetadata: message.content.file
    };
  }

  return null;
};

const withoutSignature = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const unsignedPayload = { ...payload };
  delete unsignedPayload.signature;
  delete unsignedPayload.pqSignature;
  return unsignedPayload;
};

const sortDeviceBundles = (devices = []) => [...devices].sort((left, right) => {
  const leftKey = `${normalizeId(left.userId)}:${left.deviceId || ''}`;
  const rightKey = `${normalizeId(right.userId)}:${right.deviceId || ''}`;
  return leftKey.localeCompare(rightKey);
});

const uniqueUserIds = (userIds = []) => [...new Set(userIds.map((userId) => normalizeId(userId)).filter(Boolean))];

const buildPreKeyId = (prefix = 'prekey') => {
  if (crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const cryptoService = {
  activeUserId: null,
  activeDeviceId: getOrCreateDeviceId(),
  identityState: buildIdentityState({
    status: 'signed_out',
    message: 'Sign in to enable end-to-end encryption.'
  }),
  deviceIdentity: null,
  deviceBundleCache: new Map(),
  sessionCache: new Map(),
  directEnvelopeCache: new Map(),
  sodiumReady: null,
  publicKeyCache: new Map(),
  privateKeyCache: new Map(),

  get encryptedPlaceholder() {
    return ENCRYPTED_PLACEHOLDER;
  },

  get encryptedAttachmentPlaceholder() {
    return ENCRYPTED_ATTACHMENT_PLACEHOLDER;
  },

  getIdentityState() {
    return this.identityState;
  },

  setIdentityState(nextState) {
    this.identityState = nextState;
    return nextState;
  },

  getTrustedContacts() {
    if (!this.activeUserId) {
      return {};
    }

    try {
      const trustedContacts = localStorage.getItem(trustedContactsStorageKey(this.activeUserId));
      return trustedContacts ? JSON.parse(trustedContacts) : {};
    } catch (error) {
      console.error('Failed to parse trusted contacts:', error);
      return {};
    }
  },

  persistTrustedContacts(trustedContacts) {
    if (!this.activeUserId) {
      return;
    }

    localStorage.setItem(
      trustedContactsStorageKey(this.activeUserId),
      JSON.stringify(trustedContacts)
    );
  },

  getCurrentDeviceId() {
    if (!this.activeDeviceId) {
      this.activeDeviceId = getOrCreateDeviceId();
    }

    return this.activeDeviceId;
  },

  async ensureSodiumReady() {
    if (!this.sodiumReady) {
      this.sodiumReady = sodium.ready.then(() => sodium);
    }

    return this.sodiumReady;
  },

  async getFingerprintForValue(value) {
    if (!value) {
      return null;
    }

    const serializedValue = typeof value === 'string' ? value : stableStringify(value);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      textEncoder.encode(serializedValue)
    );

    return formatFingerprint(bytesToHex(digest));
  },

  async getHashHexForValue(value) {
    if (!value) {
      return null;
    }

    const serializedValue = typeof value === 'string' ? value : stableStringify(value);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      textEncoder.encode(serializedValue)
    );

    return bytesToHex(digest);
  },

  async buildDeviceSetFingerprint(devices = []) {
    if (!devices.length) {
      return null;
    }

    const serializedDevices = sortDeviceBundles(devices).map((device) => ({
      deviceId: device.deviceId,
      ...this.buildDeviceFingerprintMaterial(device)
    }));

    return this.getFingerprintForValue(serializedDevices);
  },

  buildDeviceCryptoProfile() {
    return {
      version: 1,
      initialAgreement: {
        implemented: ['curve25519-prekey', POST_QUANTUM_KEM_ALGORITHM],
        planned: [],
        targetMode: 'dual-hybrid'
      },
      ratchet: {
        implemented: DIRECT_SESSION_RATCHET_MODE,
        maxSkip: DEFAULT_DIRECT_SESSION_MAX_SKIP
      },
      signatures: {
        implemented: ['ed25519', POST_QUANTUM_SIGNATURE_ALGORITHM],
        planned: []
      },
      transparency: {
        mode: 'append-only-log-root-v2'
      },
      storage: {
        client: 'indexeddb-aes-gcm-wrapped'
      }
    };
  },

  buildAuxiliaryDeviceBundles(identity) {
    if (!identity) {
      return null;
    }

    const pqSignatureBundle = identity.postQuantum?.signatures?.publicKey
      ? {
          algorithm: identity.postQuantum.signatures.algorithm || POST_QUANTUM_SIGNATURE_ALGORITHM,
          publicKey: identity.postQuantum.signatures.publicKey
        }
      : null;
    const pqKemBundle = identity.postQuantum?.kem
      ? {
          algorithm: identity.postQuantum.kem.algorithm || POST_QUANTUM_KEM_ALGORITHM,
          signedPreKey: identity.postQuantum.kem.signedPreKey
            ? {
                id: identity.postQuantum.kem.signedPreKey.id,
                publicKey: identity.postQuantum.kem.signedPreKey.publicKey,
                signature: identity.postQuantum.kem.signedPreKey.signature,
                pqSignature: identity.postQuantum.kem.signedPreKey.pqSignature || null
              }
            : null,
          oneTimePreKeys: Array.isArray(identity.postQuantum.kem.oneTimePreKeys)
            ? identity.postQuantum.kem.oneTimePreKeys.map((preKey) => ({
              id: preKey.id,
              publicKey: preKey.publicKey
            }))
            : []
        }
      : null;

    return {
      classical: {
        keyAgreement: 'curve25519-prekey',
        signing: 'ed25519',
        encryptionPublicKey: identity.encryptionPublicKey || null,
        signingPublicKey: identity.signingPublicKey || null
      },
      postQuantum: pqSignatureBundle || pqKemBundle
        ? {
            signatures: pqSignatureBundle,
            kem: pqKemBundle
          }
        : null,
      announcedAlgorithms: {
        kems: IMPLEMENTED_POST_QUANTUM_KEMS,
        signatures: IMPLEMENTED_POST_QUANTUM_SIGNATURES
      },
      ratchet: {
        mode: DIRECT_SESSION_RATCHET_MODE,
        maxSkip: DEFAULT_DIRECT_SESSION_MAX_SKIP
      }
    };
  },

  getPostQuantumBundle(identityOrDevice = null) {
    const auxiliaryBundles = identityOrDevice?.auxiliaryBundles || identityOrDevice?.keyBundle?.auxiliaryBundles || null;
    return auxiliaryBundles?.postQuantum || null;
  },

  getPostQuantumSignaturePublicKey(identityOrDevice = null) {
    return this.getPostQuantumBundle(identityOrDevice)?.signatures?.publicKey || null;
  },

  getPostQuantumKemBundle(identityOrDevice = null) {
    return this.getPostQuantumBundle(identityOrDevice)?.kem || null;
  },

  deviceSupportsPostQuantumHandshake(device = null) {
    return Boolean(this.getPostQuantumKemBundle(device)?.signedPreKey?.publicKey);
  },

  concatByteArrays(...parts) {
    const arrays = parts.filter(Boolean).map((part) => (
      part instanceof Uint8Array ? part : new Uint8Array(part)
    ));
    const totalLength = arrays.reduce((sum, part) => sum + part.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    arrays.forEach((part) => {
      combined.set(part, offset);
      offset += part.length;
    });

    return combined;
  },

  async hashBytes(...parts) {
    const sodiumInstance = await this.ensureSodiumReady();
    return sodiumInstance.crypto_generichash(
      sodiumInstance.crypto_secretbox_KEYBYTES,
      this.concatByteArrays(...parts)
    );
  },

  deriveSessionCacheKey(remoteUserId, remoteDeviceId) {
    return `${this.activeUserId || 'unknown'}:${this.getCurrentDeviceId() || 'unknown'}:${normalizeId(remoteUserId)}:${remoteDeviceId}`;
  },

  deriveDirectEnvelopeCacheKey(parsedPayload, envelope) {
    return [
      normalizeId(parsedPayload?.senderUserId),
      parsedPayload?.senderDeviceId || '',
      envelope?.deviceId || '',
      String(envelope?.counter ?? ''),
      parsedPayload?.signature || '',
      parsedPayload?.pqSignature || ''
    ].join(':');
  },

  rememberDirectEnvelopePayload(cacheKey, plaintext) {
    if (!cacheKey || !plaintext) {
      return;
    }

    this.directEnvelopeCache.set(cacheKey, plaintext);

    if (this.directEnvelopeCache.size > 128) {
      const oldestKey = this.directEnvelopeCache.keys().next().value;
      if (oldestKey) {
        this.directEnvelopeCache.delete(oldestKey);
      }
    }
  },

  async loadSessionState(remoteUserId, remoteDeviceId) {
    const cacheKey = this.deriveSessionCacheKey(remoteUserId, remoteDeviceId);

    if (this.sessionCache.has(cacheKey)) {
      return this.sessionCache.get(cacheKey);
    }

    const session = await loadDeviceSession(
      this.activeUserId,
      this.getCurrentDeviceId(),
      normalizeId(remoteUserId),
      remoteDeviceId
    );

    if (session) {
      const normalizedSession = normalizeDirectSessionState(session);
      this.sessionCache.set(cacheKey, normalizedSession);
      return normalizedSession;
    }

    return session;
  },

  async persistSessionState(remoteUserId, remoteDeviceId, session) {
    const normalizedRemoteUserId = normalizeId(remoteUserId);
    const cacheKey = this.deriveSessionCacheKey(normalizedRemoteUserId, remoteDeviceId);
    const nextSession = normalizeDirectSessionState({
      version: 1,
      ...session,
      remoteUserId: normalizedRemoteUserId,
      remoteDeviceId
    });
    const persistedSession = { ...nextSession };
    delete persistedSession.receivedCounters;

    this.sessionCache.set(cacheKey, nextSession);
    await saveDeviceSession(
      this.activeUserId,
      this.getCurrentDeviceId(),
      normalizedRemoteUserId,
      remoteDeviceId,
      persistedSession
    );

    return nextSession;
  },

  async createSignedPreKey(identity) {
    const sodiumInstance = await this.ensureSodiumReady();
    const preKeyPair = sodiumInstance.crypto_box_keypair();
    const signature = sodiumInstance.crypto_sign_detached(
      preKeyPair.publicKey,
      bytesFromBase64(identity.signingPrivateKey)
    );
    const pqSignature = identity?.postQuantum?.signatures?.privateKey
      ? signPostQuantum(preKeyPair.publicKey, identity.postQuantum.signatures.privateKey)
      : null;

    return {
      id: buildPreKeyId('signed-prekey'),
      publicKey: base64FromBytes(preKeyPair.publicKey),
      privateKey: base64FromBytes(preKeyPair.privateKey),
      signature: base64FromBytes(signature),
      pqSignature,
      createdAt: new Date().toISOString()
    };
  },

  async createOneTimePreKeys(count = DEFAULT_ONE_TIME_PREKEY_COUNT) {
    const sodiumInstance = await this.ensureSodiumReady();

    return Array.from({ length: count }, () => {
      const preKeyPair = sodiumInstance.crypto_box_keypair();
      return {
        id: buildPreKeyId('otk'),
        publicKey: base64FromBytes(preKeyPair.publicKey),
        privateKey: base64FromBytes(preKeyPair.privateKey)
      };
    });
  },

  async createPostQuantumSignedPreKey(identity) {
    const pqKeyPair = generatePostQuantumKemKeyPair();
    const publicKeyBytes = bytesFromBase64(pqKeyPair.publicKey);
    const sodiumInstance = await this.ensureSodiumReady();
    const signature = sodiumInstance.crypto_sign_detached(
      publicKeyBytes,
      bytesFromBase64(identity.signingPrivateKey)
    );
    const pqSignature = identity?.postQuantum?.signatures?.privateKey
      ? signPostQuantum(publicKeyBytes, identity.postQuantum.signatures.privateKey)
      : null;

    return {
      id: buildPreKeyId('pq-signed-prekey'),
      publicKey: pqKeyPair.publicKey,
      privateKey: pqKeyPair.privateKey,
      signature: base64FromBytes(signature),
      pqSignature,
      createdAt: new Date().toISOString()
    };
  },

  async createPostQuantumOneTimePreKeys(count = DEFAULT_ONE_TIME_PREKEY_COUNT) {
    return Array.from({ length: count }, () => {
      const pqKeyPair = generatePostQuantumKemKeyPair();
      return {
        id: buildPreKeyId('pq-otk'),
        publicKey: pqKeyPair.publicKey,
        privateKey: pqKeyPair.privateKey
      };
    });
  },

  async verifySignedPreKey(bundle, signedPreKey = bundle?.keyBundle?.signedPreKey) {
    const sodiumInstance = await this.ensureSodiumReady();
    const signingPublicKey = bundle?.keyBundle?.signingPublicKey;
    const pqSigningPublicKey = this.getPostQuantumSignaturePublicKey(bundle);

    if (!signingPublicKey || !signedPreKey?.publicKey || !signedPreKey?.signature) {
      return false;
    }

    const publicKeyBytes = bytesFromBase64(signedPreKey.publicKey);
    const isClassicalValid = sodiumInstance.crypto_sign_verify_detached(
      bytesFromBase64(signedPreKey.signature),
      publicKeyBytes,
      bytesFromBase64(signingPublicKey)
    );

    if (!isClassicalValid) {
      return false;
    }

    if (!pqSigningPublicKey) {
      return true;
    }

    return Boolean(signedPreKey?.pqSignature)
      && verifyPostQuantumSignature(signedPreKey.pqSignature, publicKeyBytes, pqSigningPublicKey);
  },

  async verifyPostQuantumSignedPreKey(bundle) {
    const pqKemBundle = this.getPostQuantumKemBundle(bundle);

    if (!pqKemBundle?.signedPreKey?.publicKey) {
      return false;
    }

    return this.verifySignedPreKey(bundle, pqKemBundle.signedPreKey);
  },

  buildDeviceFingerprintMaterial(identity = {}) {
    const keyBundle = identity?.keyBundle || identity || {};
    const auxiliaryBundles = identity?.auxiliaryBundles || keyBundle?.auxiliaryBundles || null;

    return {
      algorithm: keyBundle.algorithm || identity.algorithm || DEVICE_ALGORITHM,
      encryptionPublicKey: keyBundle.encryptionPublicKey || identity.encryptionPublicKey || null,
      signingPublicKey: keyBundle.signingPublicKey || identity.signingPublicKey || null,
      postQuantumSignaturePublicKey: auxiliaryBundles?.postQuantum?.signatures?.publicKey
        || identity?.postQuantum?.signatures?.publicKey
        || null
    };
  },

  async finalizeDeviceIdentity(identity = {}) {
    const auxiliaryBundles = this.buildAuxiliaryDeviceBundles(identity);
    const fingerprint = await this.getFingerprintForValue(
      this.buildDeviceFingerprintMaterial(identity)
    );

    return {
      ...identity,
      auxiliaryBundles,
      fingerprint
    };
  },

  async ensureDevicePreKeys(identity, publishedDevices = []) {
    const currentDevice = publishedDevices.find((device) => device.deviceId === identity.deviceId);
    const publishedPreKeyCount = currentDevice?.keyBundle?.oneTimePreKeys?.length || 0;
    const hasPublishedSignedPreKey = Boolean(currentDevice?.keyBundle?.signedPreKey?.publicKey);
    const publishedPostQuantumKem = this.getPostQuantumKemBundle(currentDevice);
    const publishedPostQuantumPreKeyCount = publishedPostQuantumKem?.oneTimePreKeys?.length || 0;
    const hasPublishedPostQuantumSignedPreKey = Boolean(publishedPostQuantumKem?.signedPreKey?.publicKey);
    const shouldRotateSignedPreKey = isTimestampStale(
      identity?.signedPreKey?.createdAt || currentDevice?.keyBundle?.signedPreKey?.publishedAt || null,
      SIGNED_PREKEY_ROTATION_MS
    );
    const shouldRotatePostQuantumSignedPreKey = isTimestampStale(
      identity?.postQuantum?.kem?.signedPreKey?.createdAt || publishedPostQuantumKem?.signedPreKey?.publishedAt || null,
      SIGNED_PREKEY_ROTATION_MS
    );
    let nextIdentity = identity;

    if (!nextIdentity.cryptoProfile) {
      nextIdentity = {
        ...nextIdentity,
        cryptoProfile: this.buildDeviceCryptoProfile()
      };
    }

    if (!nextIdentity.postQuantum?.signatures?.publicKey || !nextIdentity.postQuantum?.signatures?.privateKey) {
      nextIdentity = {
        ...nextIdentity,
        postQuantum: {
          ...nextIdentity.postQuantum,
          signatures: generatePostQuantumSignatureKeyPair(),
          kem: {
            ...(nextIdentity.postQuantum?.kem || {})
          }
        }
      };
    }

    if (!nextIdentity.signedPreKey?.publicKey || !nextIdentity.signedPreKey?.signature || shouldRotateSignedPreKey) {
      nextIdentity = {
        ...nextIdentity,
        signedPreKey: await this.createSignedPreKey(nextIdentity)
      };
    }

    if (
      !nextIdentity.postQuantum?.kem?.signedPreKey?.publicKey
      || !nextIdentity.postQuantum?.kem?.signedPreKey?.signature
      || !nextIdentity.postQuantum?.kem?.signedPreKey?.pqSignature
      || shouldRotatePostQuantumSignedPreKey
    ) {
      nextIdentity = {
        ...nextIdentity,
        postQuantum: {
          ...nextIdentity.postQuantum,
          signatures: nextIdentity.postQuantum.signatures,
          kem: {
            ...(nextIdentity.postQuantum?.kem || {}),
            algorithm: POST_QUANTUM_KEM_ALGORITHM,
            signedPreKey: await this.createPostQuantumSignedPreKey(nextIdentity)
          }
        }
      };
    }

    if (!Array.isArray(nextIdentity.oneTimePreKeys) || nextIdentity.oneTimePreKeys.length < LOW_ONE_TIME_PREKEY_THRESHOLD) {
      const replenishedOneTimePreKeys = await this.createOneTimePreKeys(DEFAULT_ONE_TIME_PREKEY_COUNT);
      nextIdentity = {
        ...nextIdentity,
        oneTimePreKeys: [
          ...(Array.isArray(nextIdentity.oneTimePreKeys) ? nextIdentity.oneTimePreKeys : []),
          ...replenishedOneTimePreKeys
        ]
      };
    }

    if (
      !Array.isArray(nextIdentity.postQuantum?.kem?.oneTimePreKeys)
      || nextIdentity.postQuantum.kem.oneTimePreKeys.length < LOW_ONE_TIME_PREKEY_THRESHOLD
    ) {
      const replenishedPostQuantumOneTimePreKeys = await this.createPostQuantumOneTimePreKeys(DEFAULT_ONE_TIME_PREKEY_COUNT);
      nextIdentity = {
        ...nextIdentity,
        postQuantum: {
          ...nextIdentity.postQuantum,
          signatures: nextIdentity.postQuantum.signatures,
          kem: {
            ...(nextIdentity.postQuantum?.kem || {}),
            algorithm: POST_QUANTUM_KEM_ALGORITHM,
            signedPreKey: nextIdentity.postQuantum?.kem?.signedPreKey || null,
            oneTimePreKeys: [
              ...(Array.isArray(nextIdentity.postQuantum?.kem?.oneTimePreKeys)
                ? nextIdentity.postQuantum.kem.oneTimePreKeys
                : []),
              ...replenishedPostQuantumOneTimePreKeys
            ]
          }
        }
      };
    }

    nextIdentity = await this.finalizeDeviceIdentity(nextIdentity);

    if (
      !hasPublishedSignedPreKey
      || publishedPreKeyCount < LOW_ONE_TIME_PREKEY_THRESHOLD
      || !hasPublishedPostQuantumSignedPreKey
      || publishedPostQuantumPreKeyCount < LOW_ONE_TIME_PREKEY_THRESHOLD
      || nextIdentity !== identity
    ) {
      await this.persistDeviceIdentityV2(nextIdentity.userId, nextIdentity);
    }

    return nextIdentity;
  },

  async generateIdentityKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );

    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    return {
      publicJwk,
      privateJwk
    };
  },

  async importPublicKey(publicJwk) {
    return crypto.subtle.importKey(
      'jwk',
      publicJwk,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true,
      ['encrypt']
    );
  },

  async importPrivateKey(privateJwk) {
    return crypto.subtle.importKey(
      'jwk',
      privateJwk,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true,
      ['decrypt']
    );
  },

  async getPublicKeyFingerprint(publicJwk) {
    if (!publicJwk) {
      return null;
    }

    const digest = await crypto.subtle.digest(
      'SHA-256',
      textEncoder.encode(stableStringify(publicJwk))
    );

    return formatFingerprint(bytesToHex(digest));
  },

  getStoredIdentity(userId) {
    const normalizedUserId = normalizeId(userId);
    const publicJwk = localStorage.getItem(publicStorageKey(normalizedUserId));
    const privateJwk = localStorage.getItem(privateStorageKey(normalizedUserId));

    if (!publicJwk || !privateJwk) {
      return null;
    }

    const parsedPublicJwk = parsePayload(publicJwk);
    const parsedPrivateJwk = parsePayload(privateJwk);

    if (!parsedPublicJwk || !parsedPrivateJwk) {
      return null;
    }

    return {
      publicJwk: parsedPublicJwk,
      privateJwk: parsedPrivateJwk
    };
  },

  persistIdentity(userId, { publicJwk, privateJwk }) {
    const normalizedUserId = normalizeId(userId);
    localStorage.setItem(publicStorageKey(normalizedUserId), JSON.stringify(publicJwk));
    localStorage.setItem(privateStorageKey(normalizedUserId), JSON.stringify(privateJwk));
  },

  async activateIdentity(userId, identity) {
    const normalizedUserId = normalizeId(userId);
    const [publicKey, privateKey] = await Promise.all([
      this.importPublicKey(identity.publicJwk),
      this.importPrivateKey(identity.privateJwk)
    ]);

    this.activeUserId = normalizedUserId;
    this.publicKeyCache.set(normalizedUserId, publicKey);
    this.privateKeyCache.set(normalizedUserId, privateKey);
  },

  async fetchPublishedIdentity(userId) {
    const normalizedUserId = normalizeId(userId);

    if (!normalizedUserId) {
      return null;
    }

    try {
      const response = await api.get(`/keys/identity/${normalizedUserId}`);
      const payload = parsePayload(response.identityKey);

      if (!payload?.publicJwk) {
        return null;
      }

      return payload;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  },

  async uploadIdentityKey(userId, publicJwk) {
    await api.post('/keys/identity', {
      identityKey: JSON.stringify({
        version: IDENTITY_VERSION,
        publicJwk
      })
    });

    this.publicKeyCache.set(normalizeId(userId), await this.importPublicKey(publicJwk));
  },

  async ensureLegacyIdentity(userId) {
    const [localIdentity, publishedIdentity] = await Promise.all([
      Promise.resolve(this.getStoredIdentity(userId)),
      this.fetchPublishedIdentity(userId)
    ]);

    if (!localIdentity && !publishedIdentity) {
      const generatedIdentity = await this.generateIdentityKeyPair();
      this.persistIdentity(userId, generatedIdentity);
      await this.activateIdentity(userId, generatedIdentity);

      const fingerprint = await this.getPublicKeyFingerprint(generatedIdentity.publicJwk);

      try {
        await this.uploadIdentityKey(userId, generatedIdentity.publicJwk);
      } catch (publishError) {
        console.error('Failed to publish legacy identity key:', publishError);
        return {
          status: 'ready',
          userId,
          fingerprint,
          serverFingerprint: fingerprint,
          publishStatus: 'failed',
          message: 'Legacy message recovery is available on this device, but the older recovery key could not be synced yet.'
        };
      }

      return {
        status: 'ready',
        userId,
        fingerprint,
        serverFingerprint: fingerprint,
        message: 'Legacy encrypted history is available on this device.'
      };
    }

    if (!localIdentity && publishedIdentity?.publicJwk) {
      const serverFingerprint = await this.getPublicKeyFingerprint(publishedIdentity.publicJwk);
      this.publicKeyCache.delete(userId);
      this.privateKeyCache.delete(userId);

      return {
        status: 'needs_recovery',
        userId,
        serverFingerprint,
        message: 'Older account-level encrypted history from a previous device needs a backup import to become readable here.'
      };
    }

    await this.activateIdentity(userId, localIdentity);

    const [localFingerprint, serverFingerprint] = await Promise.all([
      this.getPublicKeyFingerprint(localIdentity.publicJwk),
      publishedIdentity?.publicJwk ? this.getPublicKeyFingerprint(publishedIdentity.publicJwk) : Promise.resolve(null)
    ]);

    if (publishedIdentity?.publicJwk && localFingerprint !== serverFingerprint) {
      return {
        status: 'key_mismatch',
        userId,
        fingerprint: localFingerprint,
        serverFingerprint,
        message: 'The legacy recovery key on this browser does not match the older published account key.'
      };
    }

    if (!publishedIdentity?.publicJwk) {
      try {
        await this.uploadIdentityKey(userId, localIdentity.publicJwk);
      } catch (publishError) {
        console.error('Failed to publish legacy identity key:', publishError);
        return {
          status: 'ready',
          userId,
          fingerprint: localFingerprint,
          serverFingerprint: localFingerprint,
          publishStatus: 'failed',
          message: 'Legacy message recovery is available on this device, but the older recovery key could not be synced yet.'
        };
      }
    }

    return {
      status: 'ready',
      userId,
      fingerprint: localFingerprint,
      serverFingerprint: serverFingerprint || localFingerprint,
      message: 'Legacy encrypted history is available on this device.'
    };
  },

  async loadDeviceIdentityV2(userId) {
    const normalizedUserId = normalizeId(userId);
    const deviceId = this.getCurrentDeviceId();

    if (!normalizedUserId || !deviceId) {
      return null;
    }

    const keyMaterial = await loadDeviceKeyMaterial(normalizedUserId, deviceId);
    return keyMaterial ? {
      version: keyMaterial.version || DEVICE_BUNDLE_VERSION,
      algorithm: keyMaterial.algorithm || DEVICE_ALGORITHM,
      userId: normalizedUserId,
      deviceId,
      cryptoProfile: keyMaterial.cryptoProfile || this.buildDeviceCryptoProfile(),
      auxiliaryBundles: keyMaterial.auxiliaryBundles || this.buildAuxiliaryDeviceBundles(keyMaterial),
      postQuantum: keyMaterial.postQuantum || null,
      fingerprint: keyMaterial.fingerprint,
      encryptionPublicKey: keyMaterial.encryptionPublicKey,
      encryptionPrivateKey: keyMaterial.encryptionPrivateKey,
      signingPublicKey: keyMaterial.signingPublicKey,
      signingPrivateKey: keyMaterial.signingPrivateKey,
      signedPreKey: keyMaterial.signedPreKey || null,
      oneTimePreKeys: Array.isArray(keyMaterial.oneTimePreKeys) ? keyMaterial.oneTimePreKeys : []
    } : null;
  },

  async persistDeviceIdentityV2(userId, identity) {
    const normalizedUserId = normalizeId(userId);
    const deviceId = identity?.deviceId || this.getCurrentDeviceId();

    await saveDeviceKeyMaterial(normalizedUserId, deviceId, {
      version: identity.version || DEVICE_BUNDLE_VERSION,
      algorithm: identity.algorithm || DEVICE_ALGORITHM,
      cryptoProfile: identity.cryptoProfile || this.buildDeviceCryptoProfile(),
      auxiliaryBundles: identity.auxiliaryBundles || this.buildAuxiliaryDeviceBundles(identity),
      postQuantum: identity.postQuantum || null,
      fingerprint: identity.fingerprint,
      encryptionPublicKey: identity.encryptionPublicKey,
      encryptionPrivateKey: identity.encryptionPrivateKey,
      signingPublicKey: identity.signingPublicKey,
      signingPrivateKey: identity.signingPrivateKey,
      signedPreKey: identity.signedPreKey || null,
      oneTimePreKeys: Array.isArray(identity.oneTimePreKeys) ? identity.oneTimePreKeys : []
    });
  },

  async generateDeviceIdentityV2(userId) {
    const sodiumInstance = await this.ensureSodiumReady();
    const encryptionKeyPair = sodiumInstance.crypto_box_keypair();
    const signingKeyPair = sodiumInstance.crypto_sign_keypair();
    const signingPrivateKey = base64FromBytes(signingKeyPair.privateKey);
    const postQuantumSignatures = generatePostQuantumSignatureKeyPair();
    const identity = {
      version: DEVICE_BUNDLE_VERSION,
      algorithm: DEVICE_ALGORITHM,
      userId: normalizeId(userId),
      deviceId: this.getCurrentDeviceId(),
      cryptoProfile: this.buildDeviceCryptoProfile(),
      encryptionPublicKey: base64FromBytes(encryptionKeyPair.publicKey),
      encryptionPrivateKey: base64FromBytes(encryptionKeyPair.privateKey),
      signingPublicKey: base64FromBytes(signingKeyPair.publicKey),
      signingPrivateKey,
      signedPreKey: null,
      oneTimePreKeys: [],
      postQuantum: {
        signatures: postQuantumSignatures,
        kem: {
          algorithm: POST_QUANTUM_KEM_ALGORITHM,
          signedPreKey: null,
          oneTimePreKeys: []
        }
      }
    };

    return this.ensureDevicePreKeys(identity, []);
  },

  async activateDeviceIdentityV2(userId, identity) {
    this.activeUserId = normalizeId(userId);
    this.deviceIdentity = {
      version: identity.version || DEVICE_BUNDLE_VERSION,
      algorithm: identity.algorithm || DEVICE_ALGORITHM,
      userId: normalizeId(userId),
      deviceId: identity.deviceId || this.getCurrentDeviceId(),
      cryptoProfile: identity.cryptoProfile || this.buildDeviceCryptoProfile(),
      auxiliaryBundles: identity.auxiliaryBundles || this.buildAuxiliaryDeviceBundles(identity),
      postQuantum: identity.postQuantum || null,
      fingerprint: identity.fingerprint,
      encryptionPublicKey: identity.encryptionPublicKey,
      encryptionPrivateKey: identity.encryptionPrivateKey,
      signingPublicKey: identity.signingPublicKey,
      signingPrivateKey: identity.signingPrivateKey,
      signedPreKey: identity.signedPreKey || null,
      oneTimePreKeys: Array.isArray(identity.oneTimePreKeys) ? identity.oneTimePreKeys : []
    };
  },

  async publishDeviceIdentityV2(userId, identity) {
    const auxiliaryBundles = identity.auxiliaryBundles || this.buildAuxiliaryDeviceBundles(identity);

    await api.registerDeviceKeyBundle({
      deviceId: identity.deviceId || this.getCurrentDeviceId(),
      keyBundle: {
        version: identity.version || DEVICE_BUNDLE_VERSION,
        algorithm: identity.algorithm || DEVICE_ALGORITHM,
        cryptoProfile: identity.cryptoProfile || this.buildDeviceCryptoProfile(),
        encryptionPublicKey: identity.encryptionPublicKey,
        signingPublicKey: identity.signingPublicKey,
        fingerprint: identity.fingerprint,
        auxiliaryBundles,
        signedPreKey: identity.signedPreKey ? {
          id: identity.signedPreKey.id,
          publicKey: identity.signedPreKey.publicKey,
          signature: identity.signedPreKey.signature,
          pqSignature: identity.signedPreKey.pqSignature || null
        } : null,
        oneTimePreKeys: Array.isArray(identity.oneTimePreKeys)
          ? identity.oneTimePreKeys.map((preKey) => ({
            id: preKey.id,
            publicKey: preKey.publicKey
          }))
          : []
      }
    });

    this.deviceBundleCache.delete(normalizeId(userId));
  },

  async fetchUserDeviceBundles(userId, { refresh = false } = {}) {
    const normalizedUserId = normalizeId(userId);

    if (!normalizedUserId) {
      return [];
    }

    if (!refresh && this.deviceBundleCache.has(normalizedUserId)) {
      return this.deviceBundleCache.get(normalizedUserId);
    }

    try {
      const response = await api.getUserDeviceBundles(normalizedUserId);
      const devices = sortDeviceBundles((response?.devices || []).map((device) => ({
        ...device,
        userId: normalizedUserId,
        keyBundleVersion: Number(device.keyBundleVersion || DEVICE_BUNDLE_VERSION)
      })));

      this.deviceBundleCache.set(normalizedUserId, devices);
      return devices;
    } catch (error) {
      if (isNotFoundError(error)) {
        this.deviceBundleCache.set(normalizedUserId, []);
        return [];
      }

      throw error;
    }
  },

  async ensureDeviceIdentityV2(user) {
    const userId = normalizeId(user?._id || user?.id);
    const deviceId = this.getCurrentDeviceId();

    if (!userId || !deviceId) {
      throw new Error('This browser cannot create a device encryption identity.');
    }

    const [localIdentity, publishedDevices] = await Promise.all([
      this.loadDeviceIdentityV2(userId),
      this.fetchUserDeviceBundles(userId, { refresh: true })
    ]);

    const currentPublishedDevice = publishedDevices.find((device) => device.deviceId === deviceId);

    if (!localIdentity && currentPublishedDevice) {
      this.activeUserId = userId;
      this.deviceIdentity = null;

      return {
        status: 'needs_recovery',
        userId,
        serverFingerprint: currentPublishedDevice.keyBundle?.fingerprint || currentPublishedDevice.publicKeyFingerprint || null,
        message: 'This linked device already has published encryption keys. Import your backup to restore them on this browser.'
      };
    }

    let nextIdentity = localIdentity || await this.generateDeviceIdentityV2(userId);
    if (!localIdentity) {
      await this.persistDeviceIdentityV2(userId, nextIdentity);
    }

    nextIdentity = await this.ensureDevicePreKeys(nextIdentity, publishedDevices);

    await this.activateDeviceIdentityV2(userId, nextIdentity);

    const localFingerprint = nextIdentity.fingerprint;
    const publishedDeviceFingerprint = currentPublishedDevice?.keyBundle?.fingerprint
      || currentPublishedDevice?.publicKeyFingerprint
      || null;
    const serverFingerprint = currentPublishedDevice
      ? await this.getFingerprintForValue(this.buildDeviceFingerprintMaterial(currentPublishedDevice))
      : null;

    if (serverFingerprint && serverFingerprint !== localFingerprint) {
      return {
        status: 'key_mismatch',
        userId,
        fingerprint: localFingerprint,
        serverFingerprint,
        message: 'The published encryption bundle for this device does not match the private keys stored in this browser.'
      };
    }

    const requiresPublish = !currentPublishedDevice
      || !currentPublishedDevice.keyBundle?.signedPreKey?.publicKey
      || !Array.isArray(currentPublishedDevice.keyBundle?.oneTimePreKeys)
      || currentPublishedDevice.keyBundle.oneTimePreKeys.length < LOW_ONE_TIME_PREKEY_THRESHOLD;
    const requiresFingerprintRefresh = Boolean(currentPublishedDevice) && publishedDeviceFingerprint !== localFingerprint;
    const shouldPublish = requiresPublish || requiresFingerprintRefresh;

    if (shouldPublish) {
      try {
        await this.publishDeviceIdentityV2(userId, nextIdentity);
      } catch (publishError) {
        console.error('Failed to publish device key bundle:', publishError);
        return {
          status: 'ready',
          userId,
          fingerprint: localFingerprint,
          serverFingerprint: localFingerprint,
          publishStatus: 'failed',
          message: 'Device encryption is active on this browser, but the per-device key bundle could not be synced yet.'
        };
      }
    }

    return {
      status: 'ready',
      userId,
      fingerprint: localFingerprint,
      serverFingerprint: localFingerprint,
      publishStatus: requiresFingerprintRefresh ? 'recovered' : 'ok',
      message: requiresFingerprintRefresh
        ? 'Per-device end-to-end encryption is active on this browser. The published device bundle was refreshed to match the local keys.'
        : 'Per-device end-to-end encryption is active on this browser.'
    };
  },

  async resetCurrentDeviceIdentity(user) {
    const userId = normalizeId(user?._id || user?.id || user);
    const deviceId = this.getCurrentDeviceId();

    if (!userId || !deviceId) {
      throw new Error('This browser cannot reset the current device encryption state.');
    }

    const previousStoredIdentity = await this.loadDeviceIdentityV2(userId);
    const previousActiveUserId = this.activeUserId;
    const previousDeviceIdentity = this.deviceIdentity;
    const nextIdentity = await this.generateDeviceIdentityV2(userId);

    try {
      await this.persistDeviceIdentityV2(userId, nextIdentity);
      await this.activateDeviceIdentityV2(userId, nextIdentity);
      await this.publishDeviceIdentityV2(userId, nextIdentity);
    } catch (error) {
      if (previousStoredIdentity) {
        await this.persistDeviceIdentityV2(userId, previousStoredIdentity);
        await this.activateDeviceIdentityV2(userId, previousStoredIdentity);
      } else {
        await deleteDeviceKeyMaterial(userId, deviceId);
        this.activeUserId = previousActiveUserId || null;
        this.deviceIdentity = previousDeviceIdentity || null;
      }

      throw error;
    }

    try {
      await deleteDeviceSessionsForDevice(userId, deviceId);
    } catch (sessionCleanupError) {
      console.warn('Failed to clear stale encrypted sessions after resetting this device:', sessionCleanupError);
    }

    this.sessionCache.clear();
    this.directEnvelopeCache.clear();
    this.deviceBundleCache.delete(userId);

    return this.ensureIdentity({ _id: userId });
  },

  async ensureIdentity(user) {
    const userId = normalizeId(user?._id || user?.id);

    if (!userId) {
      return this.setIdentityState(buildIdentityState({
        status: 'signed_out',
        message: 'Sign in to enable end-to-end encryption.'
      }));
    }

    if (typeof window === 'undefined' || !window.crypto?.subtle) {
      return this.setIdentityState(buildIdentityState({
        status: 'unsupported',
        userId,
        message: 'This browser cannot use end-to-end encryption.'
      }));
    }

    try {
      const [legacyState, deviceState] = await Promise.all([
        this.ensureLegacyIdentity(userId),
        this.ensureDeviceIdentityV2(user)
      ]);

      if (deviceState.status === 'ready') {
        let message = deviceState.message;

        if (legacyState.status === 'needs_recovery') {
          message = 'Per-device end-to-end encryption is active on this browser. Older account-level encrypted history from a previous device still needs a backup import.';
        } else if (legacyState.publishStatus === 'failed') {
          message = 'Per-device end-to-end encryption is active on this browser. Older recovery keys could not be synced yet.';
        }

        return this.setIdentityState(buildIdentityState({
          status: 'ready',
          userId,
          fingerprint: deviceState.fingerprint,
          serverFingerprint: deviceState.serverFingerprint || deviceState.fingerprint,
          publishStatus: deviceState.publishStatus || legacyState.publishStatus || 'ok',
          message
        }));
      }

      return this.setIdentityState(buildIdentityState({
        status: deviceState.status,
        userId,
        fingerprint: deviceState.fingerprint || legacyState.fingerprint || null,
        serverFingerprint: deviceState.serverFingerprint || legacyState.serverFingerprint || null,
        publishStatus: deviceState.publishStatus || legacyState.publishStatus || 'ok',
        message: deviceState.message || legacyState.message || 'Failed to initialize encryption.'
      }));
    } catch (error) {
      console.error('Failed to initialize encryption identity:', error);

      return this.setIdentityState(buildIdentityState({
        status: 'error',
        userId,
        message: error.message || 'Failed to initialize encryption.'
      }));
    }
  },

  clearActiveIdentity() {
    this.activeUserId = null;
    this.deviceIdentity = null;
    this.deviceBundleCache.clear();
    this.sessionCache.clear();
    this.directEnvelopeCache.clear();
    this.publicKeyCache.clear();
    this.privateKeyCache.clear();
    this.setIdentityState(buildIdentityState({
      status: 'signed_out',
      message: 'Sign in to enable end-to-end encryption.'
    }));
  },

  async fetchUserPublicKey(userId) {
    const normalizedUserId = normalizeId(userId);

    if (!normalizedUserId) {
      throw new Error('Recipient id is required for encryption');
    }

    if (this.publicKeyCache.has(normalizedUserId)) {
      return this.publicKeyCache.get(normalizedUserId);
    }

    const payload = await this.fetchPublishedIdentity(normalizedUserId);

    if (!payload?.publicJwk) {
      throw new Error('Recipient has not set up encryption yet');
    }

    const publicKey = await this.importPublicKey(payload.publicJwk);
    this.publicKeyCache.set(normalizedUserId, publicKey);
    return publicKey;
  },

  async getUserTransparencyInfo(userId) {
    const normalizedUserId = normalizeId(userId);

    if (!normalizedUserId) {
      return {
        status: 'missing',
        head: null,
        entryCount: 0
      };
    }

    try {
      const response = await api.getKeyTransparencyLog(normalizedUserId);
      const entries = Array.isArray(response?.entries) ? response.entries : [];
      let previousEntryHash = null;
      let previousRootHash = null;
      let verifiedChain = true;

      for (const [index, entry] of entries.entries()) {
        const payload = {
          userId: normalizedUserId,
          deviceId: String(entry?.deviceId || ''),
          action: String(entry?.action || ''),
          fingerprint: entry?.fingerprint || null,
          bundleHash: entry?.bundleHash || null,
          cryptoProfileHash: entry?.cryptoProfileHash || null,
          coldPathMaterialHash: entry?.coldPathMaterialHash || null,
          keyBundleVersion: Number(entry?.keyBundleVersion || 2),
          occurredAt: new Date(entry?.occurredAt || new Date()).toISOString()
        };
        const expectedEntryHash = await this.getHashHexForValue(
          `${previousEntryHash || 'root'}:${stableStringify(payload)}`
        );
        const expectedRootHash = await this.getHashHexForValue(
          `${previousRootHash || 'root'}:${expectedEntryHash}`
        );
        const hasLegacyCheckpoint = entry?.logIndex == null || !entry?.logRootHash;

        if (
          entry?.previousEntryHash !== previousEntryHash
          || entry?.entryHash !== expectedEntryHash
          || (!hasLegacyCheckpoint && Number(entry?.logIndex) !== index)
          || (!hasLegacyCheckpoint && entry?.logRootHash !== expectedRootHash)
        ) {
          verifiedChain = false;
          break;
        }

        previousEntryHash = entry.entryHash;
        previousRootHash = hasLegacyCheckpoint ? expectedRootHash : entry.logRootHash;
      }

      if (verifiedChain) {
        const advertisedTreeSize = Number(response?.treeSize || entries.length);
        if (advertisedTreeSize !== entries.length || (response?.rootHash || previousRootHash || null) !== (previousRootHash || null)) {
          verifiedChain = false;
        }
      }

      return {
        status: entries.length ? (verifiedChain ? 'verified' : 'tampered') : 'missing',
        verifiedChain,
        head: response?.head || previousEntryHash || null,
        rootHash: response?.rootHash || previousRootHash || null,
        entryCount: entries.length,
        treeSize: Number(response?.treeSize || entries.length)
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return {
          status: 'missing',
          head: null,
          rootHash: null,
          entryCount: 0,
          treeSize: 0
        };
      }

      console.error('Failed to fetch key transparency history:', error);
      return {
        status: 'unavailable',
        head: null,
        rootHash: null,
        entryCount: 0,
        treeSize: 0
      };
    }
  },

  async getUserSecurityInfo(userId) {
    const normalizedUserId = normalizeId(userId);

    if (!normalizedUserId) {
      return {
        status: 'missing',
        message: 'User id is missing.'
      };
    }

    const deviceBundles = await this.fetchUserDeviceBundles(normalizedUserId);
    const fingerprint = deviceBundles.length
      ? await this.buildDeviceSetFingerprint(deviceBundles)
      : await (async () => {
          const publishedIdentity = await this.fetchPublishedIdentity(normalizedUserId);
          return publishedIdentity?.publicJwk ? this.getPublicKeyFingerprint(publishedIdentity.publicJwk) : null;
        })();

    if (!fingerprint) {
      return {
        userId: normalizedUserId,
        status: 'no_identity',
        fingerprint: null,
        trustedFingerprint: null,
        deviceCount: 0,
        message: 'This contact has not published an encryption identity yet.'
      };
    }

    const trustedContacts = this.getTrustedContacts();
    const transparencyInfo = await this.getUserTransparencyInfo(normalizedUserId);
    const trustedFingerprint = trustedContacts[normalizedUserId] || null;
    const transparencyWarning = transparencyInfo.status === 'tampered'
      ? ' Key transparency history looks inconsistent for this contact.'
      : '';

    if (trustedFingerprint && trustedFingerprint !== fingerprint) {
      return {
        userId: normalizedUserId,
        status: 'changed',
        fingerprint,
        trustedFingerprint,
        deviceCount: deviceBundles.length,
        transparencyStatus: transparencyInfo.status,
        transparencyHead: transparencyInfo.head,
        transparencyRootHash: transparencyInfo.rootHash,
        transparencyEntryCount: transparencyInfo.entryCount,
        message: deviceBundles.length
          ? `This contact changed their linked-device set since you last marked it as verified.${transparencyWarning}`
          : `This contact fingerprint changed since you last marked it as verified.${transparencyWarning}`
      };
    }

    if (trustedFingerprint === fingerprint) {
      return {
        userId: normalizedUserId,
        status: 'verified',
        fingerprint,
        trustedFingerprint,
        deviceCount: deviceBundles.length,
        transparencyStatus: transparencyInfo.status,
        transparencyHead: transparencyInfo.head,
        transparencyRootHash: transparencyInfo.rootHash,
        transparencyEntryCount: transparencyInfo.entryCount,
        message: deviceBundles.length
          ? `This contact device set is verified on this device.${transparencyWarning}`
          : `This contact fingerprint is verified on this device.${transparencyWarning}`
      };
    }

    return {
      userId: normalizedUserId,
      status: 'unverified',
      fingerprint,
      trustedFingerprint: null,
      deviceCount: deviceBundles.length,
      transparencyStatus: transparencyInfo.status,
      transparencyHead: transparencyInfo.head,
      transparencyRootHash: transparencyInfo.rootHash,
      transparencyEntryCount: transparencyInfo.entryCount,
      message: deviceBundles.length
        ? `Compare this contact device-set fingerprint before marking it as verified.${transparencyWarning}`
        : `Compare this fingerprint with the contact before marking it as verified.${transparencyWarning}`
    };
  },

  async verifyUserFingerprint(userId) {
    const securityInfo = await this.getUserSecurityInfo(userId);

    if (!securityInfo?.fingerprint) {
      throw new Error(securityInfo?.message || 'Fingerprint is unavailable for this contact.');
    }

    const trustedContacts = this.getTrustedContacts();
    trustedContacts[securityInfo.userId] = securityInfo.fingerprint;
    this.persistTrustedContacts(trustedContacts);

    return {
      ...securityInfo,
      status: 'verified',
      trustedFingerprint: securityInfo.fingerprint,
      message: 'This contact fingerprint is verified on this device.'
    };
  },

  async unverifyUserFingerprint(userId) {
    const normalizedUserId = normalizeId(userId);
    const trustedContacts = this.getTrustedContacts();

    delete trustedContacts[normalizedUserId];
    this.persistTrustedContacts(trustedContacts);

    return this.getUserSecurityInfo(normalizedUserId);
  },

  async getActivePrivateKey() {
    if (!this.activeUserId) {
      return null;
    }

    if (this.privateKeyCache.has(this.activeUserId)) {
      return this.privateKeyCache.get(this.activeUserId);
    }

    const identity = this.getStoredIdentity(this.activeUserId);
    if (!identity) {
      return null;
    }

    const privateKey = await this.importPrivateKey(identity.privateJwk);
    this.privateKeyCache.set(this.activeUserId, privateKey);
    return privateKey;
  },

  async deriveBackupKey(passphrase, saltBuffer) {
    const importedPassphrase = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(saltBuffer),
        iterations: BACKUP_ITERATIONS,
        hash: 'SHA-256'
      },
      importedPassphrase,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );
  },

  async exportIdentityBackup(passphrase, userId = this.activeUserId) {
    const normalizedUserId = normalizeId(userId);
    const identity = this.getStoredIdentity(normalizedUserId);
    const deviceIdentity = await this.loadDeviceIdentityV2(normalizedUserId);

    if (!normalizedUserId || (!identity && !deviceIdentity)) {
      throw new Error('Encryption backup is not available on this device yet.');
    }

    if (!passphrase || passphrase.length < 8) {
      throw new Error('Use a backup passphrase with at least 8 characters.');
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const backupKey = await this.deriveBackupKey(passphrase, salt.buffer);
    const backupPayload = {
      version: BACKUP_VERSION,
      userId: normalizedUserId,
      createdAt: new Date().toISOString(),
      identity: identity || null,
      deviceIdentityV2: deviceIdentity ? {
        version: deviceIdentity.version || DEVICE_BUNDLE_VERSION,
        algorithm: deviceIdentity.algorithm || DEVICE_ALGORITHM,
        cryptoProfile: deviceIdentity.cryptoProfile || this.buildDeviceCryptoProfile(),
        auxiliaryBundles: deviceIdentity.auxiliaryBundles || null,
        postQuantum: deviceIdentity.postQuantum || null,
        fingerprint: deviceIdentity.fingerprint,
        encryptionPublicKey: deviceIdentity.encryptionPublicKey,
        encryptionPrivateKey: deviceIdentity.encryptionPrivateKey,
        signingPublicKey: deviceIdentity.signingPublicKey,
        signingPrivateKey: deviceIdentity.signingPrivateKey,
        signedPreKey: deviceIdentity.signedPreKey || null,
        oneTimePreKeys: Array.isArray(deviceIdentity.oneTimePreKeys) ? deviceIdentity.oneTimePreKeys : []
      } : null
    };

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      backupKey,
      textEncoder.encode(JSON.stringify(backupPayload))
    );

    const fingerprint = deviceIdentity?.fingerprint || await this.getPublicKeyFingerprint(identity?.publicJwk);
    const backupContent = JSON.stringify({
      version: BACKUP_VERSION,
      algorithm: 'AES-GCM+PBKDF2',
      iterations: BACKUP_ITERATIONS,
      fingerprint,
      salt: base64FromArrayBuffer(salt.buffer),
      iv: base64FromArrayBuffer(iv.buffer),
      ciphertext: base64FromArrayBuffer(ciphertext)
    }, null, 2);

    return {
      content: backupContent,
      filename: `vaaniarc-e2ee-backup-${normalizedUserId}.json`,
      fingerprint
    };
  },

  async downloadIdentityBackup(passphrase, userId = this.activeUserId) {
    const backup = await this.exportIdentityBackup(passphrase, userId);
    createDownloadUrl(
      new Blob([backup.content], { type: 'application/json' }),
      backup.filename
    );

    return backup;
  },

  async importIdentityBackup(serializedBackup, passphrase, expectedUserId = this.activeUserId) {
    if (!serializedBackup) {
      throw new Error('Encryption backup content is required.');
    }

    if (!passphrase || passphrase.length < 8) {
      throw new Error('Enter the backup passphrase with at least 8 characters.');
    }

    const parsedBackup = parsePayload(serializedBackup);

    if (!parsedBackup?.salt || !parsedBackup?.iv || !parsedBackup?.ciphertext) {
      throw new Error('Invalid encryption backup file.');
    }

    const backupKey = await this.deriveBackupKey(passphrase, arrayBufferFromBase64(parsedBackup.salt));

    let decryptedPayload;

    try {
      decryptedPayload = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(arrayBufferFromBase64(parsedBackup.iv))
        },
        backupKey,
        arrayBufferFromBase64(parsedBackup.ciphertext)
      );
    } catch (error) {
      console.error('Failed to decrypt encryption backup:', error);
      throw new Error('Backup passphrase is incorrect or the backup file is corrupted.');
    }

    const backupPayload = parsePayload(textDecoder.decode(decryptedPayload));
    const restoredUserId = normalizeId(backupPayload?.userId);
    const normalizedExpectedUserId = normalizeId(expectedUserId);

    if (!restoredUserId || (!backupPayload?.identity && !backupPayload?.deviceIdentityV2)) {
      throw new Error('Backup file is missing the encryption key material.');
    }

    if (normalizedExpectedUserId && restoredUserId !== normalizedExpectedUserId) {
      throw new Error('This backup belongs to a different account.');
    }

    if (backupPayload?.identity?.publicJwk && backupPayload?.identity?.privateJwk) {
      this.persistIdentity(restoredUserId, backupPayload.identity);
      await this.activateIdentity(restoredUserId, backupPayload.identity);
    }

    if (backupPayload?.deviceIdentityV2?.encryptionPublicKey && backupPayload?.deviceIdentityV2?.signingPublicKey) {
      const restoredDeviceIdentity = {
        ...backupPayload.deviceIdentityV2,
        userId: restoredUserId,
        deviceId: this.getCurrentDeviceId(),
        version: backupPayload.deviceIdentityV2.version || DEVICE_BUNDLE_VERSION,
        algorithm: backupPayload.deviceIdentityV2.algorithm || DEVICE_ALGORITHM,
        cryptoProfile: backupPayload.deviceIdentityV2.cryptoProfile || this.buildDeviceCryptoProfile(),
        auxiliaryBundles: backupPayload.deviceIdentityV2.auxiliaryBundles || null,
        postQuantum: backupPayload.deviceIdentityV2.postQuantum || null,
        fingerprint: backupPayload.deviceIdentityV2.fingerprint
          || await this.getFingerprintForValue(this.buildDeviceFingerprintMaterial({
            ...backupPayload.deviceIdentityV2,
            algorithm: backupPayload.deviceIdentityV2.algorithm || DEVICE_ALGORITHM
          }))
      };

      const finalizedDeviceIdentity = await this.finalizeDeviceIdentity(restoredDeviceIdentity);
      await this.persistDeviceIdentityV2(restoredUserId, finalizedDeviceIdentity);
      await this.activateDeviceIdentityV2(restoredUserId, finalizedDeviceIdentity);
    }

    return this.ensureIdentity({ _id: restoredUserId });
  },

  async buildEnvelopeContext(userIds = []) {
    const identityState = this.getIdentityState();
    const normalizedUserIds = [...new Set(userIds.map((userId) => normalizeId(userId)).filter(Boolean))];

    if (identityState.status !== 'ready') {
      throw new Error(identityState.message || 'Encryption identity is not ready on this device.');
    }

    if (!this.activeUserId) {
      throw new Error('Encryption identity is not ready');
    }

    if (!normalizedUserIds.includes(this.activeUserId)) {
      normalizedUserIds.push(this.activeUserId);
    }

    const publicKeys = await Promise.all(
      normalizedUserIds.map(async (userId) => [userId, await this.fetchUserPublicKey(userId)])
    );

    const aesKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );

    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
    const envelopes = await Promise.all(
      publicKeys.map(async ([userId, publicKey]) => {
        const wrappedKey = await crypto.subtle.encrypt(
          {
            name: 'RSA-OAEP'
          },
          publicKey,
          rawAesKey
        );

        return {
          userId,
          wrappedKey: base64FromArrayBuffer(wrappedKey)
        };
      })
    );

    return {
      aesKey,
      envelopes
    };
  },

  async encryptBytes(aesKey, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      aesKey,
      bytes
    );

    return {
      iv: base64FromArrayBuffer(iv.buffer),
      ciphertext: base64FromArrayBuffer(ciphertext),
      ciphertextBuffer: ciphertext
    };
  },

  async unwrapAesKey(payload) {
    if (!payload || !this.activeUserId) {
      return null;
    }

    const privateKey = await this.getActivePrivateKey();
    if (!privateKey) {
      return null;
    }

    const envelope = payload.envelopes?.find(({ userId }) => normalizeId(userId) === this.activeUserId);
    if (!envelope) {
      return null;
    }

    try {
      const rawAesKey = await crypto.subtle.decrypt(
        {
          name: 'RSA-OAEP'
        },
        privateKey,
        arrayBufferFromBase64(envelope.wrappedKey)
      );

      return crypto.subtle.importKey(
        'raw',
        rawAesKey,
        {
          name: 'AES-GCM'
        },
        false,
        ['decrypt']
      );
    } catch (error) {
      console.error('Failed to unwrap encrypted key:', error);
      return null;
    }
  },

  async decryptBytes(aesKey, ivBase64, ciphertextBase64) {
    return crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(arrayBufferFromBase64(ivBase64))
      },
      aesKey,
      arrayBufferFromBase64(ciphertextBase64)
    );
  },

  async buildDeviceEnvelopeContext(userIds = []) {
    const identityState = this.getIdentityState();
    const normalizedUserIds = [...new Set(userIds.map((userId) => normalizeId(userId)).filter(Boolean))];

    if (identityState.status !== 'ready' || !this.deviceIdentity) {
      throw new Error(identityState.message || 'Device encryption is not ready on this browser.');
    }

    if (!this.activeUserId) {
      throw new Error('Device encryption is not ready on this browser.');
    }

    if (!normalizedUserIds.includes(this.activeUserId)) {
      normalizedUserIds.push(this.activeUserId);
    }

    const bundleCollections = await Promise.all(
      normalizedUserIds.map(async (userId) => [userId, await this.fetchUserDeviceBundles(userId)])
    );

    const recipientDevices = sortDeviceBundles(
      bundleCollections.flatMap(([userId, devices]) => (
        devices
          .filter((device) => device?.keyBundle?.encryptionPublicKey)
          .map((device) => ({
            ...device,
            userId
          }))
      ))
    );

    const usersWithoutBundles = bundleCollections
      .filter(([, devices]) => !devices.length)
      .map(([userId]) => userId);

    if (usersWithoutBundles.length) {
      throw new Error('Some recipients have not set up device encryption yet.');
    }

    const sodiumInstance = await this.ensureSodiumReady();
    const messageKey = sodiumInstance.randombytes_buf(sodiumInstance.crypto_secretbox_KEYBYTES);
    const envelopes = recipientDevices.map((device) => ({
      userId: normalizeId(device.userId),
      deviceId: device.deviceId,
      wrappedKey: base64FromBytes(
        sodiumInstance.crypto_box_seal(
          messageKey,
          bytesFromBase64(device.keyBundle.encryptionPublicKey)
        )
      )
    }));

    return {
      messageKey,
      recipientDevices,
      envelopes
    };
  },

  async buildSignedPayloadV2(unsignedPayload) {
    const sodiumInstance = await this.ensureSodiumReady();

    if (!this.deviceIdentity?.signingPrivateKey) {
      throw new Error('Device signing key is unavailable on this browser.');
    }

    const payloadBytes = textEncoder.encode(stableStringify(unsignedPayload));
    const signature = sodiumInstance.crypto_sign_detached(
      payloadBytes,
      bytesFromBase64(this.deviceIdentity.signingPrivateKey)
    );

    return {
      ...unsignedPayload,
      signature: base64FromBytes(signature),
      pqSignature: this.deviceIdentity?.postQuantum?.signatures?.privateKey
        ? signPostQuantum(payloadBytes, this.deviceIdentity.postQuantum.signatures.privateKey)
        : null
    };
  },

  async verifyDevicePayloadV2(parsedPayload) {
    if (!parsedPayload?.senderUserId || !parsedPayload?.senderDeviceId || !parsedPayload?.signature) {
      return false;
    }

    const sodiumInstance = await this.ensureSodiumReady();
    const senderDevices = await this.fetchUserDeviceBundles(parsedPayload.senderUserId);
    const senderDevice = senderDevices.find((device) => device.deviceId === parsedPayload.senderDeviceId);
    const signingPublicKey = senderDevice?.keyBundle?.signingPublicKey;
    const pqSigningPublicKey = this.getPostQuantumSignaturePublicKey(senderDevice);
    const payloadVersion = Number(parsedPayload.version || parsedPayload.protocolVersion || 1);

    if (!signingPublicKey) {
      return false;
    }

    const payloadBytes = textEncoder.encode(stableStringify(withoutSignature(parsedPayload)));
    const isClassicalValid = sodiumInstance.crypto_sign_verify_detached(
      bytesFromBase64(parsedPayload.signature),
      payloadBytes,
      bytesFromBase64(signingPublicKey)
    );

    if (!isClassicalValid) {
      return false;
    }

    if (!pqSigningPublicKey) {
      return true;
    }

    const requiresPostQuantumSignature = payloadVersion >= DIRECT_SESSION_PAYLOAD_VERSION
      || (
        payloadVersion === DEVICE_PAYLOAD_VERSION
        && String(parsedPayload?.algorithm || '').includes(POST_QUANTUM_SIGNATURE_ALGORITHM)
      );

    if (!parsedPayload?.pqSignature) {
      return !requiresPostQuantumSignature;
    }

    return verifyPostQuantumSignature(parsedPayload.pqSignature, payloadBytes, pqSigningPublicKey);
  },

  async unwrapDeviceMessageKey(parsedPayload) {
    if (!parsedPayload || !this.deviceIdentity || !this.getCurrentDeviceId()) {
      return null;
    }

    const envelope = parsedPayload.envelopes?.find(
      ({ deviceId }) => deviceId === this.getCurrentDeviceId()
    );

    if (!envelope?.wrappedKey) {
      return null;
    }

    try {
      const sodiumInstance = await this.ensureSodiumReady();
      return sodiumInstance.crypto_box_seal_open(
        bytesFromBase64(envelope.wrappedKey),
        bytesFromBase64(this.deviceIdentity.encryptionPublicKey),
        bytesFromBase64(this.deviceIdentity.encryptionPrivateKey)
      );
    } catch (error) {
      console.error('Failed to unwrap device message key:', error);
      return null;
    }
  },

  async encryptTextForUsersV2(plaintext, userIds = []) {
    const sodiumInstance = await this.ensureSodiumReady();
    const { messageKey, envelopes } = await this.buildDeviceEnvelopeContext(userIds);
    const nonce = sodiumInstance.randombytes_buf(sodiumInstance.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodiumInstance.crypto_secretbox_easy(
      textEncoder.encode(plaintext),
      nonce,
      messageKey
    );

    const signedPayload = await this.buildSignedPayloadV2({
      version: DEVICE_PAYLOAD_VERSION,
      protocolVersion: DEVICE_PAYLOAD_VERSION,
      type: 'text',
      algorithm: DEVICE_ALGORITHM,
      senderUserId: this.activeUserId,
      senderDeviceId: this.deviceIdentity.deviceId,
      senderFingerprint: this.deviceIdentity.fingerprint,
      nonce: base64FromBytes(nonce),
      ciphertext: base64FromBytes(ciphertext),
      envelopes: sortDeviceBundles(envelopes)
    });

    return JSON.stringify(signedPayload);
  },

  async decryptTextPayloadV2(parsedPayload) {
    const sodiumInstance = await this.ensureSodiumReady();

    if (!await this.verifyDevicePayloadV2(parsedPayload)) {
      console.error('Failed to verify signed device payload.');
      return null;
    }

    const messageKey = await this.unwrapDeviceMessageKey(parsedPayload);
    if (!messageKey) {
      return null;
    }

    try {
      const decrypted = sodiumInstance.crypto_secretbox_open_easy(
        bytesFromBase64(parsedPayload.ciphertext),
        bytesFromBase64(parsedPayload.nonce),
        messageKey
      );

      return textDecoder.decode(decrypted);
    } catch (error) {
      console.error('Failed to decrypt device message payload:', error);
      return null;
    }
  },

  async encryptAttachmentForUsersV2(file, userIds = []) {
    const sodiumInstance = await this.ensureSodiumReady();
    const { messageKey, envelopes } = await this.buildDeviceEnvelopeContext(userIds);
    const metadata = await buildEncryptedAttachmentMetadata(file);
    const dataNonce = sodiumInstance.randombytes_buf(sodiumInstance.crypto_secretbox_NONCEBYTES);
    const metadataNonce = sodiumInstance.randombytes_buf(sodiumInstance.crypto_secretbox_NONCEBYTES);
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const encryptedFileBytes = sodiumInstance.crypto_secretbox_easy(fileBytes, dataNonce, messageKey);
    const encryptedMetadata = sodiumInstance.crypto_secretbox_easy(
      textEncoder.encode(JSON.stringify(metadata)),
      metadataNonce,
      messageKey
    );

    const encryptionPayload = await this.buildSignedPayloadV2({
      version: DEVICE_PAYLOAD_VERSION,
      protocolVersion: DEVICE_PAYLOAD_VERSION,
      type: 'file',
      algorithm: DEVICE_ALGORITHM,
      senderUserId: this.activeUserId,
      senderDeviceId: this.deviceIdentity.deviceId,
      senderFingerprint: this.deviceIdentity.fingerprint,
      dataNonce: base64FromBytes(dataNonce),
      metadataNonce: base64FromBytes(metadataNonce),
      metadataCiphertext: base64FromBytes(encryptedMetadata),
      envelopes: sortDeviceBundles(envelopes)
    });

    return {
      encryptedFile: new File([encryptedFileBytes], randomUploadName(), {
        type: 'application/octet-stream'
      }),
      encryptionPayload: JSON.stringify(encryptionPayload),
      attachmentMetadata: metadata
    };
  },

  async decryptAttachmentMetadataV2(parsedPayload) {
    const sodiumInstance = await this.ensureSodiumReady();

    if (!await this.verifyDevicePayloadV2(parsedPayload)) {
      console.error('Failed to verify signed device attachment payload.');
      return null;
    }

    const messageKey = await this.unwrapDeviceMessageKey(parsedPayload);
    if (!messageKey) {
      return null;
    }

    try {
      const decryptedMetadata = sodiumInstance.crypto_secretbox_open_easy(
        bytesFromBase64(parsedPayload.metadataCiphertext),
        bytesFromBase64(parsedPayload.metadataNonce),
        messageKey
      );

      return JSON.parse(textDecoder.decode(decryptedMetadata));
    } catch (error) {
      console.error('Failed to decrypt device attachment metadata:', error);
      return null;
    }
  },

  async consumeDevicePreKeyBundle(userId, deviceId) {
    const normalizedUserId = normalizeId(userId);

    try {
      const response = await api.consumeUserDevicePrekey(normalizedUserId, deviceId);
      return response?.device ? {
        ...response.device,
        userId: normalizedUserId
      } : null;
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }

      const bundles = await this.fetchUserDeviceBundles(normalizedUserId, { refresh: true });
      return bundles.find((device) => device.deviceId === deviceId) || null;
    }
  },

  async deriveInitiatorRootKey({
    remoteBundle,
    ephemeralPrivateKey,
    initiatorDeviceId,
    responderDeviceId,
    postQuantumSharedSecrets = []
  }) {
    const sodiumInstance = await this.ensureSodiumReady();
    const remoteIdentityPublicKey = bytesFromBase64(remoteBundle.keyBundle.encryptionPublicKey);
    const remoteSignedPreKeyPublicKey = bytesFromBase64(remoteBundle.keyBundle.signedPreKey.publicKey);
    const remoteOneTimePreKeyPublicKey = remoteBundle.keyBundle.oneTimePreKeys?.[0]?.publicKey
      ? bytesFromBase64(remoteBundle.keyBundle.oneTimePreKeys[0].publicKey)
      : null;

    const sharedParts = [
      sodiumInstance.crypto_scalarmult(
        bytesFromBase64(this.deviceIdentity.encryptionPrivateKey),
        remoteSignedPreKeyPublicKey
      ),
      sodiumInstance.crypto_scalarmult(
        ephemeralPrivateKey,
        remoteIdentityPublicKey
      ),
      sodiumInstance.crypto_scalarmult(
        ephemeralPrivateKey,
        remoteSignedPreKeyPublicKey
      )
    ];

    if (remoteOneTimePreKeyPublicKey) {
      sharedParts.push(
        sodiumInstance.crypto_scalarmult(ephemeralPrivateKey, remoteOneTimePreKeyPublicKey)
      );
    }

    return this.hashBytes(
      textEncoder.encode('vaaniarc-direct-session-root'),
      ...sharedParts,
      ...postQuantumSharedSecrets.map((secret) => (
        secret instanceof Uint8Array ? secret : bytesFromBase64(secret)
      )),
      textEncoder.encode(String(initiatorDeviceId)),
      textEncoder.encode(String(responderDeviceId))
    );
  },

  async deriveResponderRootKey({
    senderIdentityPublicKey,
    senderEphemeralPublicKey,
    initiatorDeviceId,
    responderDeviceId,
    signedPreKeyPrivateKey,
    oneTimePreKeyPrivateKey = null,
    postQuantumSharedSecrets = []
  }) {
    const sodiumInstance = await this.ensureSodiumReady();
    const localIdentityPrivateKey = bytesFromBase64(this.deviceIdentity.encryptionPrivateKey);
    const localSignedPreKeyPrivateKey = bytesFromBase64(signedPreKeyPrivateKey);
    const senderIdentityBytes = bytesFromBase64(senderIdentityPublicKey);
    const senderEphemeralBytes = bytesFromBase64(senderEphemeralPublicKey);
    const sharedParts = [
      sodiumInstance.crypto_scalarmult(localSignedPreKeyPrivateKey, senderIdentityBytes),
      sodiumInstance.crypto_scalarmult(localIdentityPrivateKey, senderEphemeralBytes),
      sodiumInstance.crypto_scalarmult(localSignedPreKeyPrivateKey, senderEphemeralBytes)
    ];

    if (oneTimePreKeyPrivateKey) {
      sharedParts.push(
        sodiumInstance.crypto_scalarmult(bytesFromBase64(oneTimePreKeyPrivateKey), senderEphemeralBytes)
      );
    }

    return this.hashBytes(
      textEncoder.encode('vaaniarc-direct-session-root'),
      ...sharedParts,
      ...postQuantumSharedSecrets.map((secret) => (
        secret instanceof Uint8Array ? secret : bytesFromBase64(secret)
      )),
      textEncoder.encode(String(initiatorDeviceId)),
      textEncoder.encode(String(responderDeviceId))
    );
  },

  async buildDirectSessionState(
    rootKey,
    role,
    remoteUserId,
    remoteDeviceId,
    protocolVersion = DIRECT_SESSION_PAYLOAD_VERSION
  ) {
    const initiatorSend = await this.hashBytes(textEncoder.encode('vaaniarc-initiator-send'), rootKey);
    const initiatorRecv = await this.hashBytes(textEncoder.encode('vaaniarc-initiator-recv'), rootKey);
    const sendChainKey = role === 'initiator' ? initiatorSend : initiatorRecv;
    const recvChainKey = role === 'initiator' ? initiatorRecv : initiatorSend;

    return normalizeDirectSessionState({
      version: 1,
      protocolVersion,
      role,
      remoteUserId: normalizeId(remoteUserId),
      remoteDeviceId,
      sendChainKey: base64FromBytes(sendChainKey),
      recvChainKey: base64FromBytes(recvChainKey),
      sendCounter: 0,
      recvCounter: -1,
      maxSkip: DEFAULT_DIRECT_SESSION_MAX_SKIP,
      ratchetMode: protocolVersion >= CLASSICAL_DIRECT_SESSION_PAYLOAD_VERSION
        ? DIRECT_SESSION_RATCHET_MODE
        : 'counter-kdf-v1',
      receivedCounters: [],
      establishedAt: new Date().toISOString()
    });
  },

  async deriveSessionMessageKey(seedBase64, counter, ratchetSecretBase64 = null) {
    const counterBytes = textEncoder.encode(String(counter));
    return this.hashBytes(
      textEncoder.encode('vaaniarc-msg-key'),
      bytesFromBase64(seedBase64),
      counterBytes,
      ratchetSecretBase64 ? bytesFromBase64(ratchetSecretBase64) : null
    );
  },

  async createDirectSessionRatchet(remoteDevice) {
    const sodiumInstance = await this.ensureSodiumReady();
    const ratchetSecret = sodiumInstance.randombytes_buf(sodiumInstance.crypto_secretbox_KEYBYTES);
    const ciphertext = sodiumInstance.crypto_box_seal(
      ratchetSecret,
      bytesFromBase64(remoteDevice.keyBundle.encryptionPublicKey)
    );
    const ratchetSecretBase64 = base64FromBytes(ratchetSecret);

    return {
      ratchetSecretBase64,
      envelope: {
        suite: DIRECT_SESSION_RATCHET_MODE,
        ciphertext: base64FromBytes(ciphertext),
        commitment: await this.getHashHexForValue(ratchetSecretBase64)
      }
    };
  },

  async openDirectSessionRatchet(envelope) {
    if (!envelope?.ratchet?.ciphertext || !this.deviceIdentity?.encryptionPublicKey || !this.deviceIdentity?.encryptionPrivateKey) {
      return null;
    }

    try {
      const sodiumInstance = await this.ensureSodiumReady();
      const openedSecret = sodiumInstance.crypto_box_seal_open(
        bytesFromBase64(envelope.ratchet.ciphertext),
        bytesFromBase64(this.deviceIdentity.encryptionPublicKey),
        bytesFromBase64(this.deviceIdentity.encryptionPrivateKey)
      );
      const ratchetSecretBase64 = base64FromBytes(openedSecret);

      if (envelope?.ratchet?.commitment) {
        const computedCommitment = await this.getHashHexForValue(ratchetSecretBase64);
        if (computedCommitment !== envelope.ratchet.commitment) {
          return null;
        }
      }

      return ratchetSecretBase64;
    } catch (error) {
      console.error('Failed to unwrap direct session ratchet secret:', error);
      return null;
    }
  },

  async encryptWithDirectSession(sessionState, plaintextBytes, remoteDevice = null) {
    const sodiumInstance = await this.ensureSodiumReady();
    const normalizedState = normalizeDirectSessionState(sessionState);
    let ratchet = null;
    let ratchetSecretBase64 = null;

    if (normalizedState.protocolVersion >= CLASSICAL_DIRECT_SESSION_PAYLOAD_VERSION) {
      if (!remoteDevice?.keyBundle?.encryptionPublicKey) {
        throw new Error('Recipient device cannot accept direct-session ratchet updates.');
      }

      const ratchetPayload = await this.createDirectSessionRatchet(remoteDevice);
      ratchet = ratchetPayload.envelope;
      ratchetSecretBase64 = ratchetPayload.ratchetSecretBase64;
    }

    const messageKey = await this.deriveSessionMessageKey(
      normalizedState.sendChainKey,
      normalizedState.sendCounter,
      ratchetSecretBase64
    );
    const nonce = sodiumInstance.randombytes_buf(sodiumInstance.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodiumInstance.crypto_secretbox_easy(plaintextBytes, nonce, messageKey);

    return {
      counter: normalizedState.sendCounter,
      nonce: base64FromBytes(nonce),
      ciphertext: base64FromBytes(ciphertext),
      ratchet,
      nextSessionState: {
        ...normalizedState,
        sendCounter: normalizedState.sendCounter + 1
      }
    };
  },

  async decryptWithDirectSession(sessionState, envelope) {
    const sodiumInstance = await this.ensureSodiumReady();
    const targetCounter = Number(envelope?.counter);
    const validation = validateIncomingDirectSessionCounter(sessionState, targetCounter);

    if (!validation.isValid) {
      if (validation.error) {
        console.error(validation.error);
      }
      return null;
    }

    let ratchetSecretBase64 = null;
    if (validation.normalizedState.protocolVersion >= CLASSICAL_DIRECT_SESSION_PAYLOAD_VERSION || envelope?.ratchet) {
      ratchetSecretBase64 = await this.openDirectSessionRatchet(envelope);
      if (!ratchetSecretBase64) {
        return null;
      }
    }

    const messageKey = await this.deriveSessionMessageKey(
      validation.normalizedState.recvChainKey,
      targetCounter,
      ratchetSecretBase64
    );

    try {
      const plaintext = sodiumInstance.crypto_secretbox_open_easy(
        bytesFromBase64(envelope.ciphertext),
        bytesFromBase64(envelope.nonce),
        messageKey
      );

      return {
        plaintext,
        nextSessionState: registerReceivedDirectSessionCounter(
          validation.normalizedState,
          targetCounter
        )
      };
    } catch (error) {
      console.error('Failed to decrypt session envelope:', error);
      return null;
    }
  },

  async consumeLocalOneTimePreKey(preKeyId, postQuantumPreKeyId = null) {
    if ((!preKeyId && !postQuantumPreKeyId) || !this.deviceIdentity) {
      return;
    }

    const remainingPreKeys = (this.deviceIdentity.oneTimePreKeys || []).filter(
      (preKey) => !preKeyId || preKey.id !== preKeyId
    );
    const remainingPostQuantumPreKeys = (this.deviceIdentity.postQuantum?.kem?.oneTimePreKeys || []).filter(
      (preKey) => !postQuantumPreKeyId || preKey.id !== postQuantumPreKeyId
    );
    let nextIdentity = {
      ...this.deviceIdentity,
      oneTimePreKeys: remainingPreKeys,
      postQuantum: {
        ...(this.deviceIdentity.postQuantum || {}),
        signatures: this.deviceIdentity.postQuantum?.signatures || null,
        kem: {
          ...(this.deviceIdentity.postQuantum?.kem || {}),
          algorithm: this.deviceIdentity.postQuantum?.kem?.algorithm || POST_QUANTUM_KEM_ALGORITHM,
          signedPreKey: this.deviceIdentity.postQuantum?.kem?.signedPreKey || null,
          oneTimePreKeys: remainingPostQuantumPreKeys
        }
      }
    };

    if (remainingPreKeys.length < LOW_ONE_TIME_PREKEY_THRESHOLD) {
      nextIdentity = {
        ...nextIdentity,
        oneTimePreKeys: [
          ...remainingPreKeys,
          ...await this.createOneTimePreKeys(DEFAULT_ONE_TIME_PREKEY_COUNT)
        ]
      };
    }

    if (remainingPostQuantumPreKeys.length < LOW_ONE_TIME_PREKEY_THRESHOLD) {
      nextIdentity = {
        ...nextIdentity,
        postQuantum: {
          ...nextIdentity.postQuantum,
          signatures: nextIdentity.postQuantum?.signatures || null,
          kem: {
            ...(nextIdentity.postQuantum?.kem || {}),
            algorithm: POST_QUANTUM_KEM_ALGORITHM,
            signedPreKey: nextIdentity.postQuantum?.kem?.signedPreKey || null,
            oneTimePreKeys: [
              ...remainingPostQuantumPreKeys,
              ...await this.createPostQuantumOneTimePreKeys(DEFAULT_ONE_TIME_PREKEY_COUNT)
            ]
          }
        }
      };
    }

    nextIdentity = await this.finalizeDeviceIdentity(nextIdentity);
    this.deviceIdentity = nextIdentity;
    await this.persistDeviceIdentityV2(this.activeUserId, nextIdentity);

    if (
      remainingPreKeys.length < LOW_ONE_TIME_PREKEY_THRESHOLD
      || remainingPostQuantumPreKeys.length < LOW_ONE_TIME_PREKEY_THRESHOLD
    ) {
      try {
        await this.publishDeviceIdentityV2(this.activeUserId, nextIdentity);
      } catch (publishError) {
        console.error('Failed to replenish published one-time prekeys:', publishError);
      }
    }
  },

  async initializeDirectSessionAsInitiator(remoteUserId, remoteDevice) {
    if (!remoteDevice?.keyBundle?.signedPreKey?.publicKey) {
      throw new Error('Recipient device is missing a signed prekey.');
    }

    const isSignedPreKeyValid = await this.verifySignedPreKey(remoteDevice);
    if (!isSignedPreKeyValid) {
      throw new Error('Recipient device signed prekey verification failed.');
    }

    const postQuantumKem = this.getPostQuantumKemBundle(remoteDevice);
    const shouldUsePostQuantumHandshake = this.deviceSupportsPostQuantumHandshake(remoteDevice);

    if (shouldUsePostQuantumHandshake) {
      const isPostQuantumSignedPreKeyValid = await this.verifyPostQuantumSignedPreKey(remoteDevice);
      if (!isPostQuantumSignedPreKeyValid) {
        throw new Error('Recipient device post-quantum signed prekey verification failed.');
      }
    }

    const sodiumInstance = await this.ensureSodiumReady();
    const ephemeralKeyPair = sodiumInstance.crypto_box_keypair();
    const postQuantumSharedSecrets = [];
    let pqKem = null;

    if (shouldUsePostQuantumHandshake) {
      const signedPreKeyEncapsulation = encapsulatePostQuantumSharedSecret(postQuantumKem.signedPreKey.publicKey);
      const oneTimePreKey = postQuantumKem.oneTimePreKeys?.[0] || null;
      const oneTimePreKeyEncapsulation = oneTimePreKey?.publicKey
        ? encapsulatePostQuantumSharedSecret(oneTimePreKey.publicKey)
        : null;

      postQuantumSharedSecrets.push(signedPreKeyEncapsulation.sharedSecret);

      if (oneTimePreKeyEncapsulation?.sharedSecret) {
        postQuantumSharedSecrets.push(oneTimePreKeyEncapsulation.sharedSecret);
      }

      pqKem = {
        algorithm: POST_QUANTUM_KEM_ALGORITHM,
        signedPreKeyId: postQuantumKem.signedPreKey.id,
        signedCiphertext: signedPreKeyEncapsulation.ciphertext,
        oneTimePreKeyId: oneTimePreKey?.id || null,
        oneTimeCiphertext: oneTimePreKeyEncapsulation?.ciphertext || null
      };
    }

    const rootKey = await this.deriveInitiatorRootKey({
      remoteBundle: remoteDevice,
      ephemeralPrivateKey: ephemeralKeyPair.privateKey,
      initiatorDeviceId: this.getCurrentDeviceId(),
      responderDeviceId: remoteDevice.deviceId,
      postQuantumSharedSecrets
    });
    const protocolVersion = shouldUsePostQuantumHandshake
      ? DIRECT_SESSION_PAYLOAD_VERSION
      : CLASSICAL_DIRECT_SESSION_PAYLOAD_VERSION;
    const sessionState = await this.buildDirectSessionState(
      rootKey,
      'initiator',
      remoteUserId,
      remoteDevice.deviceId,
      protocolVersion
    );

    return {
      sessionState,
      preKeyInfo: {
        senderEphemeralPublicKey: base64FromBytes(ephemeralKeyPair.publicKey),
        signedPreKeyId: remoteDevice.keyBundle.signedPreKey.id,
        oneTimePreKeyId: remoteDevice.keyBundle.oneTimePreKeys?.[0]?.id || null,
        pqKem
      }
    };
  },

  async initializeDirectSessionAsResponder(parsedPayload, envelope) {
    if (!this.deviceIdentity?.signedPreKey?.privateKey) {
      throw new Error('The signed prekey is unavailable on this browser.');
    }

    const senderDevices = await this.fetchUserDeviceBundles(parsedPayload.senderUserId, { refresh: true });
    const senderDevice = senderDevices.find((device) => device.deviceId === parsedPayload.senderDeviceId);

    if (!senderDevice?.keyBundle?.encryptionPublicKey) {
      throw new Error('The sender device bundle is unavailable for session bootstrap.');
    }

    const signedPreKey = this.deviceIdentity.signedPreKey;
    if (signedPreKey.id !== envelope?.preKey?.signedPreKeyId) {
      throw new Error('This browser no longer has the requested signed prekey.');
    }

    const oneTimePreKey = envelope?.preKey?.oneTimePreKeyId
      ? (this.deviceIdentity.oneTimePreKeys || []).find((preKey) => preKey.id === envelope.preKey.oneTimePreKeyId)
      : null;
    const protocolVersion = Number(
      parsedPayload.version || parsedPayload.protocolVersion || LEGACY_DIRECT_SESSION_PAYLOAD_VERSION
    );
    const pqKemEnvelope = envelope?.preKey?.pqKem || null;
    const pqKemState = this.deviceIdentity?.postQuantum?.kem || null;
    const pqSharedSecrets = [];
    let pqOneTimePreKey = null;

    if (protocolVersion >= DIRECT_SESSION_PAYLOAD_VERSION || pqKemEnvelope) {
      if (!pqKemEnvelope?.signedCiphertext || !pqKemState?.signedPreKey?.privateKey) {
        throw new Error('The post-quantum prekey is unavailable on this browser.');
      }

      if (pqKemState.signedPreKey.id !== pqKemEnvelope?.signedPreKeyId) {
        throw new Error('This browser no longer has the requested post-quantum signed prekey.');
      }

      pqSharedSecrets.push(decapsulatePostQuantumSharedSecret(
        pqKemEnvelope.signedCiphertext,
        pqKemState.signedPreKey.privateKey
      ));

      pqOneTimePreKey = pqKemEnvelope?.oneTimePreKeyId
        ? (pqKemState.oneTimePreKeys || []).find((preKey) => preKey.id === pqKemEnvelope.oneTimePreKeyId)
        : null;

      if (pqKemEnvelope?.oneTimePreKeyId) {
        if (!pqOneTimePreKey?.privateKey || !pqKemEnvelope?.oneTimeCiphertext) {
          throw new Error('The requested post-quantum one-time prekey is unavailable on this browser.');
        }

        pqSharedSecrets.push(decapsulatePostQuantumSharedSecret(
          pqKemEnvelope.oneTimeCiphertext,
          pqOneTimePreKey.privateKey
        ));
      }
    }

    const rootKey = await this.deriveResponderRootKey({
      senderIdentityPublicKey: senderDevice.keyBundle.encryptionPublicKey,
      senderEphemeralPublicKey: envelope.preKey.senderEphemeralPublicKey,
      initiatorDeviceId: parsedPayload.senderDeviceId,
      responderDeviceId: this.getCurrentDeviceId(),
      signedPreKeyPrivateKey: signedPreKey.privateKey,
      oneTimePreKeyPrivateKey: oneTimePreKey?.privateKey || null,
      postQuantumSharedSecrets: pqSharedSecrets
    });
    const sessionState = await this.buildDirectSessionState(
      rootKey,
      'responder',
      parsedPayload.senderUserId,
      parsedPayload.senderDeviceId,
      protocolVersion
    );

    if (oneTimePreKey?.id || pqOneTimePreKey?.id) {
      await this.consumeLocalOneTimePreKey(oneTimePreKey?.id || null, pqOneTimePreKey?.id || null);
    }

    return sessionState;
  },

  isDirectSessionUserSet(userIds = []) {
    const normalizedUserIds = uniqueUserIds(userIds);
    return normalizedUserIds.length === 2 && normalizedUserIds.includes(this.activeUserId);
  },

  async canEncryptForUsers(userIds = []) {
    const normalizedUserIds = uniqueUserIds(userIds);
    const missingUserIds = [];

    await Promise.all(
      normalizedUserIds.map(async (userId) => {
        const deviceBundles = await this.fetchUserDeviceBundles(userId);
        const hasDeviceKeys = deviceBundles.some(
          (device) => device?.keyBundle?.encryptionPublicKey
        );

        if (hasDeviceKeys) {
          return;
        }

        const publishedIdentity = await this.fetchPublishedIdentity(userId);
        if (!publishedIdentity?.publicJwk) {
          missingUserIds.push(userId);
        }
      })
    );

    return {
      canEncrypt: missingUserIds.length === 0,
      missingUserIds
    };
  },

  async buildDirectTargetDevices(userIds = []) {
    const normalizedUserIds = uniqueUserIds(userIds);
    const bundleCollections = await Promise.all(
      normalizedUserIds.map(async (userId) => [userId, await this.fetchUserDeviceBundles(userId, { refresh: true })])
    );

    const usersWithoutBundles = bundleCollections
      .filter(([, devices]) => !devices.length)
      .map(([userId]) => userId);

    if (usersWithoutBundles.length) {
      throw new Error('Some conversation devices have not finished encryption setup yet.');
    }

    return sortDeviceBundles(
      bundleCollections.flatMap(([userId, devices]) => devices.map((device) => ({
        ...device,
        userId
      })))
    );
  },

  async buildDirectEnvelopeForDevice(plaintextBytes, remoteUserId, remoteDevice) {
    let sessionState = await this.loadSessionState(remoteUserId, remoteDevice.deviceId);
    let mode = 'session';
    let preKey = null;
    const minimumProtocolVersion = this.deviceSupportsPostQuantumHandshake(remoteDevice)
      ? DIRECT_SESSION_PAYLOAD_VERSION
      : CLASSICAL_DIRECT_SESSION_PAYLOAD_VERSION;

    if (sessionState?.protocolVersion < minimumProtocolVersion) {
      sessionState = null;
    }

    if (!sessionState) {
      const preKeyBundle = await this.consumeDevicePreKeyBundle(remoteUserId, remoteDevice.deviceId);
      const bootstrap = await this.initializeDirectSessionAsInitiator(remoteUserId, preKeyBundle || remoteDevice);
      sessionState = bootstrap.sessionState;
      mode = 'prekey';
      preKey = bootstrap.preKeyInfo;
    }

    const encryptedEnvelope = await this.encryptWithDirectSession(sessionState, plaintextBytes, remoteDevice);
    await this.persistSessionState(remoteUserId, remoteDevice.deviceId, encryptedEnvelope.nextSessionState);

    return {
      userId: normalizeId(remoteUserId),
      deviceId: remoteDevice.deviceId,
      mode,
      protocolVersion: encryptedEnvelope.nextSessionState.protocolVersion,
      counter: encryptedEnvelope.counter,
      nonce: encryptedEnvelope.nonce,
      ciphertext: encryptedEnvelope.ciphertext,
      preKey
    };
  },

  async decryptDirectEnvelope(parsedPayload) {
    const targetEnvelope = parsedPayload?.envelopes?.find(
      (envelope) => envelope?.deviceId === this.getCurrentDeviceId()
    );

    if (!targetEnvelope) {
      return null;
    }

    const cacheKey = this.deriveDirectEnvelopeCacheKey(parsedPayload, targetEnvelope);
    if (cacheKey && this.directEnvelopeCache.has(cacheKey)) {
      return this.directEnvelopeCache.get(cacheKey);
    }

    let sessionState = await this.loadSessionState(parsedPayload.senderUserId, parsedPayload.senderDeviceId);

    if (targetEnvelope.mode === 'prekey') {
      sessionState = await this.initializeDirectSessionAsResponder(parsedPayload, targetEnvelope);
    }

    if (!sessionState) {
      return null;
    }

    const decryptedEnvelope = await this.decryptWithDirectSession(sessionState, targetEnvelope);
    if (!decryptedEnvelope?.plaintext) {
      return null;
    }

    await this.persistSessionState(
      parsedPayload.senderUserId,
      parsedPayload.senderDeviceId,
      decryptedEnvelope.nextSessionState
    );
    this.rememberDirectEnvelopePayload(cacheKey, decryptedEnvelope.plaintext);

    return decryptedEnvelope.plaintext;
  },

  async encryptTextForDirectSession(plaintext, userIds = []) {
    const targetDevices = await this.buildDirectTargetDevices(userIds);
    const rawEnvelopes = await Promise.all(
      targetDevices.map((device) => this.buildDirectEnvelopeForDevice(
        textEncoder.encode(plaintext),
        device.userId,
        device
      ))
    );
    const payloadVersion = rawEnvelopes.every((envelope) => envelope.protocolVersion >= DIRECT_SESSION_PAYLOAD_VERSION)
      ? DIRECT_SESSION_PAYLOAD_VERSION
      : CLASSICAL_DIRECT_SESSION_PAYLOAD_VERSION;
    const envelopes = rawEnvelopes.map((envelope) => {
      const nextEnvelope = { ...envelope };
      delete nextEnvelope.protocolVersion;
      return nextEnvelope;
    });

    const signedPayload = await this.buildSignedPayloadV2({
      version: payloadVersion,
      protocolVersion: payloadVersion,
      type: 'text',
      algorithm: DIRECT_SESSION_ALGORITHM,
      senderUserId: this.activeUserId,
      senderDeviceId: this.deviceIdentity.deviceId,
      senderFingerprint: this.deviceIdentity.fingerprint,
      envelopes
    });

    return JSON.stringify(signedPayload);
  },

  async decryptTextPayloadDirect(parsedPayload) {
    if (!await this.verifyDevicePayloadV2(parsedPayload)) {
      console.error('Failed to verify direct session payload.');
      return null;
    }

    const plaintext = await this.decryptDirectEnvelope(parsedPayload);
    return plaintext ? textDecoder.decode(plaintext) : null;
  },

  async encryptAttachmentForDirectSession(file, userIds = []) {
    const sodiumInstance = await this.ensureSodiumReady();
    const targetDevices = await this.buildDirectTargetDevices(userIds);
    const metadata = await buildEncryptedAttachmentMetadata(file);
    const fileKey = sodiumInstance.randombytes_buf(sodiumInstance.crypto_secretbox_KEYBYTES);
    const dataNonce = sodiumInstance.randombytes_buf(sodiumInstance.crypto_secretbox_NONCEBYTES);
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const encryptedFileBytes = sodiumInstance.crypto_secretbox_easy(fileBytes, dataNonce, fileKey);
    const encryptedBundle = textEncoder.encode(JSON.stringify({
      fileKey: base64FromBytes(fileKey),
      metadata
    }));
    const rawEnvelopes = await Promise.all(
      targetDevices.map((device) => this.buildDirectEnvelopeForDevice(
        encryptedBundle,
        device.userId,
        device
      ))
    );
    const payloadVersion = rawEnvelopes.every((envelope) => envelope.protocolVersion >= DIRECT_SESSION_PAYLOAD_VERSION)
      ? DIRECT_SESSION_PAYLOAD_VERSION
      : CLASSICAL_DIRECT_SESSION_PAYLOAD_VERSION;
    const envelopes = rawEnvelopes.map((envelope) => {
      const nextEnvelope = { ...envelope };
      delete nextEnvelope.protocolVersion;
      return nextEnvelope;
    });

    const encryptionPayload = await this.buildSignedPayloadV2({
      version: payloadVersion,
      protocolVersion: payloadVersion,
      type: 'file',
      algorithm: DIRECT_SESSION_ALGORITHM,
      senderUserId: this.activeUserId,
      senderDeviceId: this.deviceIdentity.deviceId,
      senderFingerprint: this.deviceIdentity.fingerprint,
      dataNonce: base64FromBytes(dataNonce),
      envelopes
    });

    return {
      encryptedFile: new File([encryptedFileBytes], randomUploadName(), {
        type: 'application/octet-stream'
      }),
      encryptionPayload: JSON.stringify(encryptionPayload),
      attachmentMetadata: metadata
    };
  },

  async decryptDirectAttachmentBundle(parsedPayload) {
    if (!await this.verifyDevicePayloadV2(parsedPayload)) {
      console.error('Failed to verify direct attachment payload.');
      return null;
    }

    const plaintext = await this.decryptDirectEnvelope(parsedPayload);
    if (!plaintext) {
      return null;
    }

    try {
      return JSON.parse(textDecoder.decode(plaintext));
    } catch (error) {
      console.error('Failed to parse direct attachment bundle:', error);
      return null;
    }
  },

  async encryptTextForUsers(plaintext, userIds = []) {
    try {
      if (this.isDirectSessionUserSet(userIds)) {
        return await this.encryptTextForDirectSession(plaintext, userIds);
      }

      return await this.encryptTextForUsersV2(plaintext, userIds);
    } catch (deviceEncryptionError) {
      console.warn('Falling back to legacy text encryption:', deviceEncryptionError);
      const { aesKey, envelopes } = await this.buildEnvelopeContext(userIds);
      const encrypted = await this.encryptBytes(aesKey, textEncoder.encode(plaintext));

      return JSON.stringify({
        version: PAYLOAD_VERSION,
        type: 'text',
        algorithm: 'AES-GCM+RSA-OAEP',
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        envelopes
      });
    }
  },

  async decryptTextPayload(payload) {
    const parsedPayload = parsePayload(payload);
    if (!parsedPayload) {
      return null;
    }

    if (Number(parsedPayload.version || parsedPayload.protocolVersion || 1) >= LEGACY_DIRECT_SESSION_PAYLOAD_VERSION) {
      return this.decryptTextPayloadDirect(parsedPayload);
    }

    if (Number(parsedPayload.version || parsedPayload.protocolVersion || 1) >= DEVICE_PAYLOAD_VERSION) {
      return this.decryptTextPayloadV2(parsedPayload);
    }

    const aesKey = await this.unwrapAesKey(parsedPayload);
    if (!aesKey) {
      return null;
    }

    try {
      const decrypted = await this.decryptBytes(aesKey, parsedPayload.iv, parsedPayload.ciphertext);
      return textDecoder.decode(decrypted);
    } catch (error) {
      console.error('Failed to decrypt message payload:', error);
      return null;
    }
  },

  async encryptAttachmentForUsers(file, userIds = []) {
    try {
      if (this.isDirectSessionUserSet(userIds)) {
        return await this.encryptAttachmentForDirectSession(file, userIds);
      }

      return await this.encryptAttachmentForUsersV2(file, userIds);
    } catch (deviceEncryptionError) {
      console.warn('Falling back to legacy attachment encryption:', deviceEncryptionError);
      const { aesKey, envelopes } = await this.buildEnvelopeContext(userIds);
      const metadata = await buildEncryptedAttachmentMetadata(file);

      const [encryptedFile, encryptedMetadata] = await Promise.all([
        this.encryptBytes(aesKey, await file.arrayBuffer()),
        this.encryptBytes(aesKey, textEncoder.encode(JSON.stringify(metadata)))
      ]);

      return {
        encryptedFile: new File([encryptedFile.ciphertextBuffer], randomUploadName(), {
          type: 'application/octet-stream'
        }),
        encryptionPayload: JSON.stringify({
          version: PAYLOAD_VERSION,
          type: 'file',
          algorithm: 'AES-GCM+RSA-OAEP',
          dataIv: encryptedFile.iv,
          metadataIv: encryptedMetadata.iv,
          metadataCiphertext: encryptedMetadata.ciphertext,
          envelopes
        }),
        attachmentMetadata: metadata
      };
    }
  },

  async decryptAttachmentMetadata(encryptionPayload) {
    const parsedPayload = parsePayload(encryptionPayload);
    if (!parsedPayload) {
      return null;
    }

    if (Number(parsedPayload.version || parsedPayload.protocolVersion || 1) >= LEGACY_DIRECT_SESSION_PAYLOAD_VERSION) {
      const bundle = await this.decryptDirectAttachmentBundle(parsedPayload);
      return bundle?.metadata || null;
    }

    if (Number(parsedPayload.version || parsedPayload.protocolVersion || 1) >= DEVICE_PAYLOAD_VERSION) {
      return this.decryptAttachmentMetadataV2(parsedPayload);
    }

    const aesKey = await this.unwrapAesKey(parsedPayload);
    if (!aesKey) {
      return null;
    }

    try {
      const decryptedMetadata = await this.decryptBytes(
        aesKey,
        parsedPayload.metadataIv,
        parsedPayload.metadataCiphertext
      );

      return JSON.parse(textDecoder.decode(decryptedMetadata));
    } catch (error) {
      console.error('Failed to decrypt attachment metadata:', error);
      return null;
    }
  },

  async downloadEncryptedAttachment(message) {
    const attachment = extractAttachmentDetails(message);
    const payload = parsePayload(attachment?.encryptionPayload);

    if (!payload || !attachment?.fileUrl) {
      return {
        downloaded: false,
        consumed: false,
        updatedMessage: null
      };
    }

    try {
      const [response, metadata] = await Promise.all([
        fetch(attachment.fileUrl),
        this.decryptAttachmentMetadata(payload)
      ]);

      if (!response.ok) {
        throw new Error('Failed to fetch encrypted attachment');
      }

      const encryptedBuffer = await response.arrayBuffer();
      let decryptedBuffer;

      if (Number(payload.version || payload.protocolVersion || 1) >= LEGACY_DIRECT_SESSION_PAYLOAD_VERSION) {
        const sodiumInstance = await this.ensureSodiumReady();
        const directBundle = await this.decryptDirectAttachmentBundle(payload);

        if (!directBundle?.fileKey) {
          return {
            downloaded: false,
            consumed: false,
            updatedMessage: null
          };
        }

        decryptedBuffer = sodiumInstance.crypto_secretbox_open_easy(
          new Uint8Array(encryptedBuffer),
          bytesFromBase64(payload.dataNonce),
          bytesFromBase64(directBundle.fileKey)
        );
      } else if (Number(payload.version || payload.protocolVersion || 1) >= DEVICE_PAYLOAD_VERSION) {
        if (!await this.verifyDevicePayloadV2(payload)) {
          return {
            downloaded: false,
            consumed: false,
            updatedMessage: null
          };
        }

        const sodiumInstance = await this.ensureSodiumReady();
        const messageKey = await this.unwrapDeviceMessageKey(payload);
        if (!messageKey) {
          return {
            downloaded: false,
            consumed: false,
            updatedMessage: null
          };
        }

        decryptedBuffer = sodiumInstance.crypto_secretbox_open_easy(
          new Uint8Array(encryptedBuffer),
          bytesFromBase64(payload.dataNonce),
          messageKey
        );
      } else {
        const aesKey = await this.unwrapAesKey(payload);
        if (!aesKey) {
          return {
            downloaded: false,
            consumed: false,
            updatedMessage: null
          };
        }

        decryptedBuffer = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: new Uint8Array(arrayBufferFromBase64(payload.dataIv))
          },
          aesKey,
          encryptedBuffer
        );
      }

      const fileName = metadata?.originalName || 'attachment.bin';
      const mimeType = metadata?.mimetype || 'application/octet-stream';
      createDownloadUrl(new Blob([decryptedBuffer], { type: mimeType }), fileName);

      let consumed = false;
      if (message?.isViewOnce && !message?.isViewOnceConsumed) {
        try {
          const chatId = normalizeId(message?.chatId);
          const roomId = normalizeId(message?.room?._id || message?.room);

          if (chatId && message?._id) {
            await api.consumeViewOnceChatMessage(chatId, normalizeId(message._id));
            consumed = true;
          } else if (roomId && message?._id) {
            await api.consumeViewOnceRoomMessage(roomId, normalizeId(message._id));
            consumed = true;
          }
        } catch (consumeError) {
          console.error('Failed to consume view-once attachment:', consumeError);
        }
      }

      return {
        downloaded: true,
        consumed,
        updatedMessage: consumed ? markAttachmentConsumedLocally(message) : message
      };
    } catch (error) {
      console.error('Failed to download encrypted attachment:', error);
      return {
        downloaded: false,
        consumed: false,
        updatedMessage: null
      };
    }
  },

  async hydratePrivateMessage(message) {
    if (!message) {
      return message;
    }

    let nextMessage = { ...message };

    if (isExpiredMessage(message)) {
      return {
        ...nextMessage,
        content: '[Disappearing message expired]',
        fileUrl: null,
        fileMetadata: null,
        decryptedFileMetadata: null,
        isExpired: true
      };
    }

    if (message.isViewOnceConsumed) {
      return markAttachmentConsumedLocally(nextMessage);
    }

    if (message.encryptedContent) {
      const decryptedContent = await this.decryptTextPayload(message.encryptedContent) || message.decryptedContent || null;
      nextMessage = {
        ...nextMessage,
        decryptedContent,
        content: decryptedContent || '[Encrypted message unavailable on this device]'
      };
    }

    if (message.fileMetadata?.encryptionPayload) {
      const decryptedFileMetadata = await this.decryptAttachmentMetadata(message.fileMetadata.encryptionPayload);
      nextMessage = {
        ...nextMessage,
        content: decryptedFileMetadata?.originalName || ENCRYPTED_ATTACHMENT_PLACEHOLDER,
        decryptedFileMetadata
      };
    }

    if (message.replyTo && typeof message.replyTo === 'object') {
      const hydratedReplyTarget = await this.hydratePrivateMessage({
        ...message.replyTo,
        replyTo: null
      });

      nextMessage = {
        ...nextMessage,
        replyTo: hydratedReplyTarget
      };
    }

    return nextMessage;
  },

  async hydratePrivateChats(chats = []) {
    return Promise.all(
      chats.map(async (chat) => ({
        ...chat,
        lastMessage: chat.lastMessage ? await this.hydratePrivateMessage(chat.lastMessage) : chat.lastMessage
      }))
    );
  },

  async hydratePrivateMessages(messages = []) {
    return Promise.all(messages.map((message) => this.hydratePrivateMessage(message)));
  },

  async hydrateRoomMessage(message) {
    if (!message) {
      return message;
    }

    const nextMessage = {
      ...message,
      content: {
        ...(message.content || {})
      }
    };

    if (isExpiredMessage(message)) {
      nextMessage.content.text = '[Disappearing message expired]';
      nextMessage.content.file = null;
      nextMessage.decryptedFileMetadata = null;
      nextMessage.isExpired = true;
      return nextMessage;
    }

    if (message.isViewOnceConsumed) {
      return markAttachmentConsumedLocally(nextMessage);
    }

    if (message.content?.file?.encryptionPayload) {
      const decryptedFileMetadata = await this.decryptAttachmentMetadata(message.content.file.encryptionPayload);
      nextMessage.decryptedFileMetadata = decryptedFileMetadata;
      nextMessage.content.file = {
        ...nextMessage.content.file,
        decryptedMetadata: decryptedFileMetadata
      };
      nextMessage.content.text = decryptedFileMetadata?.originalName || ENCRYPTED_ATTACHMENT_PLACEHOLDER;
    }

    if (!message.encryptedContent) {
      nextMessage.content.text = nextMessage.content.text || message.content?.text || '';
      return nextMessage;
    }

    const decryptedContent = await this.decryptTextPayload(message.encryptedContent) || message.decryptedContent || null;
    nextMessage.decryptedContent = decryptedContent;
    nextMessage.content.text = decryptedContent || '[Encrypted message unavailable on this device]';
    return nextMessage;
  },

  async hydrateRoomMessages(messages = []) {
    return Promise.all(messages.map((message) => this.hydrateRoomMessage(message)));
  }
};

export default cryptoService;
