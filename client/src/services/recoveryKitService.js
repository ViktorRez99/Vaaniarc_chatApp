import apiService from './api';
import cryptoService from './cryptoService';
import { normalizeId } from '../utils/identity';

const SECRETS_SCRIPT_URL = '/vendor/secrets.min.js';
let secretsLibraryPromise = null;

const loadSecretsLibrary = async () => {
  if (typeof window === 'undefined') {
    throw new Error('Recovery kits can only be created in the browser.');
  }

  if (window.secrets) {
    return window.secrets;
  }

  if (!secretsLibraryPromise) {
    secretsLibraryPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[data-vaaniarc-secrets="${SECRETS_SCRIPT_URL}"]`);
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.secrets), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Failed to load the recovery crypto library.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = SECRETS_SCRIPT_URL;
      script.async = true;
      script.dataset.vaaniarcSecrets = SECRETS_SCRIPT_URL;
      script.onload = () => resolve(window.secrets);
      script.onerror = () => reject(new Error('Failed to load the recovery crypto library.'));
      document.head.appendChild(script);
    });
  }

  const secretsLibrary = await secretsLibraryPromise;
  if (!secretsLibrary?.share || !secretsLibrary?.random) {
    throw new Error('The recovery crypto library did not initialize correctly.');
  }

  return secretsLibrary;
};

const normalizeContact = (contact) => ({
  userId: normalizeId(contact?.userId || contact?._id || contact?.id),
  username: contact?.username || '',
  avatar: contact?.avatar || null
});

const validateThreshold = (threshold, contactCount) => {
  const normalizedThreshold = Number.parseInt(threshold, 10);

  if (!Number.isInteger(normalizedThreshold) || normalizedThreshold < 2 || normalizedThreshold > contactCount) {
    throw new Error('Choose a threshold between 2 and the number of trusted contacts.');
  }

  return normalizedThreshold;
};

const buildEncryptedSharePayload = async ({ ownerUser, label, share, contact }) => {
  const securityInfo = await cryptoService.getUserSecurityInfo(contact.userId);

  if (!securityInfo?.fingerprint) {
    throw new Error(`${contact.username || 'This contact'} has not finished secure device setup yet.`);
  }

  const encryptedEnvelope = await cryptoService.encryptTextForUsers(
    JSON.stringify({
      version: 1,
      type: 'recovery-share',
      ownerUserId: normalizeId(ownerUser?._id || ownerUser?.id),
      ownerUsername: ownerUser?.username || '',
      label,
      share
    }),
    [contact.userId]
  );

  return {
    recipientUserId: contact.userId,
    recipientFingerprint: securityInfo.fingerprint,
    encryptedEnvelope
  };
};

const buildRecoveryPayload = async ({ ownerUser, label, threshold, contacts }) => {
  const secrets = await loadSecretsLibrary();
  const resolvedContacts = contacts
    .map((contact) => normalizeContact(contact))
    .filter((contact) => contact.userId);

  if (resolvedContacts.length < 2) {
    throw new Error('Select at least two trusted contacts.');
  }

  const normalizedThreshold = validateThreshold(threshold, resolvedContacts.length);
  const recoverySecret = secrets.random(256);
  const shares = secrets.share(recoverySecret, resolvedContacts.length, normalizedThreshold);

  const encryptedShares = await Promise.all(
    resolvedContacts.map((contact, index) => buildEncryptedSharePayload({
      ownerUser,
      label,
      share: shares[index],
      contact
    }))
  );

  return {
    label,
    threshold: normalizedThreshold,
    contacts: resolvedContacts.map((contact, index) => ({
      userId: contact.userId,
      shareIndex: index + 1,
      fingerprint: encryptedShares[index].recipientFingerprint
    })),
    shardEnvelopes: encryptedShares.map((share, index) => ({
      recipientUserId: share.recipientUserId,
      recipientFingerprint: share.recipientFingerprint,
      shareIndex: index + 1,
      encryptedEnvelope: share.encryptedEnvelope
    }))
  };
};

const recoveryKitService = {
  async listRecoveryKits() {
    const response = await apiService.listRecoveryKits();
    return response.kits || [];
  },

  async getReceivedShares() {
    const response = await apiService.getReceivedRecoveryShares();
    return response.receivedShares || [];
  },

  async createRecoveryKit({ ownerUser, label, threshold, contacts }) {
    const payload = await buildRecoveryPayload({
      ownerUser,
      label,
      threshold,
      contacts
    });

    return apiService.createRecoveryKit(payload);
  },

  async rotateRecoveryKit(kitId, { ownerUser, label, threshold, contacts }) {
    const payload = await buildRecoveryPayload({
      ownerUser,
      label,
      threshold,
      contacts
    });

    return apiService.rotateRecoveryKit(kitId, payload);
  },

  async revokeRecoveryKit(kitId) {
    return apiService.revokeRecoveryKit(kitId);
  },

  async decryptReceivedShare(encryptedEnvelope) {
    const decryptedEnvelope = await cryptoService.decryptTextPayload(encryptedEnvelope);

    if (!decryptedEnvelope) {
      throw new Error('This browser could not decrypt the selected recovery share.');
    }

    try {
      return JSON.parse(decryptedEnvelope);
    } catch (_ERROR) {
      throw new Error('The recovery share payload is invalid.');
    }
  }
};

export default recoveryKitService;
