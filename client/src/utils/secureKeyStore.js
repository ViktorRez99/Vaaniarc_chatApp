const DATABASE_NAME = 'vaaniarc-e2ee';
const DATABASE_VERSION = 3;
const DEVICE_KEYS_STORE = 'device_keys';
const DEVICE_SESSIONS_STORE = 'device_sessions';
const WRAPPING_KEYS_STORE = 'wrapping_keys';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const canUseIndexedDb = () => typeof indexedDB !== 'undefined';

const getCryptoSubtle = () => {
  const cryptoObject = globalThis.crypto;

  if (!cryptoObject?.subtle) {
    throw new Error('Web Crypto is unavailable in this environment.');
  }

  return cryptoObject.subtle;
};

const openDatabase = () => new Promise((resolve, reject) => {
  if (!canUseIndexedDb()) {
    reject(new Error('IndexedDB is unavailable in this environment.'));
    return;
  }

  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

  request.onupgradeneeded = () => {
    const database = request.result;

    if (!database.objectStoreNames.contains(DEVICE_KEYS_STORE)) {
      database.createObjectStore(DEVICE_KEYS_STORE, { keyPath: 'id' });
    }

    if (!database.objectStoreNames.contains(DEVICE_SESSIONS_STORE)) {
      database.createObjectStore(DEVICE_SESSIONS_STORE, { keyPath: 'id' });
    }

    if (!database.objectStoreNames.contains(WRAPPING_KEYS_STORE)) {
      database.createObjectStore(WRAPPING_KEYS_STORE, { keyPath: 'id' });
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
});

const runTransaction = async (storeName, mode, handler) => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    let settled = false;

    transaction.oncomplete = () => {
      database.close();
      if (!settled) {
        resolve(undefined);
      }
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('IndexedDB transaction failed.'));
    };

    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('IndexedDB transaction aborted.'));
    };

    handler(store, (value) => {
      settled = true;
      resolve(value);
    }, reject);
  });
};

const recordId = (userId, deviceId) => `${userId}:${deviceId}:v2`;
const wrapKeyRecordId = (userId, deviceId) => `${userId}:${deviceId}:wrap`;

const sessionRecordId = (userId, deviceId, remoteUserId, remoteDeviceId) => [
  userId,
  deviceId,
  remoteUserId,
  remoteDeviceId,
  'session'
].map((part) => String(part || '').trim()).join(':');

const base64FromArrayBuffer = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
};

const arrayBufferFromBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const loadRawRecord = async (storeName, id) => runTransaction(storeName, 'readonly', (store, resolve, reject) => {
  const request = store.get(id);
  request.onsuccess = () => resolve(request.result || null);
  request.onerror = () => reject(request.error || new Error('Failed to load IndexedDB record.'));
});

const saveRawRecord = async (storeName, value) => runTransaction(storeName, 'readwrite', (store, resolve, reject) => {
  const request = store.put(value);
  request.onsuccess = () => resolve(value);
  request.onerror = () => reject(request.error || new Error('Failed to save IndexedDB record.'));
});

const deleteRawRecord = async (storeName, id) => runTransaction(storeName, 'readwrite', (store, resolve, reject) => {
  const request = store.delete(id);
  request.onsuccess = () => resolve(true);
  request.onerror = () => reject(request.error || new Error('Failed to delete IndexedDB record.'));
});

const generateWrappingKey = async () => getCryptoSubtle().generateKey(
  {
    name: 'AES-GCM',
    length: 256
  },
  false,
  ['encrypt', 'decrypt']
);

const getOrCreateWrappingKey = async (userId, deviceId) => {
  const id = wrapKeyRecordId(userId, deviceId);
  const existingRecord = await loadRawRecord(WRAPPING_KEYS_STORE, id);

  if (existingRecord?.cryptoKey) {
    return existingRecord.cryptoKey;
  }

  const cryptoKey = await generateWrappingKey();
  await saveRawRecord(WRAPPING_KEYS_STORE, {
    id,
    userId,
    deviceId,
    cryptoKey,
    createdAt: new Date().toISOString()
  });

  return cryptoKey;
};

const encryptPayload = async (userId, deviceId, payload) => {
  const cryptoObject = globalThis.crypto;
  const subtle = getCryptoSubtle();
  const wrappingKey = await getOrCreateWrappingKey(userId, deviceId);
  const iv = cryptoObject.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    wrappingKey,
    plaintext
  );

  return {
    iv: base64FromArrayBuffer(iv.buffer),
    ciphertext: base64FromArrayBuffer(ciphertext)
  };
};

const decryptPayload = async (userId, deviceId, encryptedPayload) => {
  const subtle = getCryptoSubtle();
  const wrappingKey = await getOrCreateWrappingKey(userId, deviceId);
  const decrypted = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(arrayBufferFromBase64(encryptedPayload.iv))
    },
    wrappingKey,
    arrayBufferFromBase64(encryptedPayload.ciphertext)
  );

  return JSON.parse(textDecoder.decode(decrypted));
};

const stripIndexedDbMetadata = (record = {}, extraFields = []) => {
  const payload = { ...record };
  delete payload.id;
  delete payload.userId;
  delete payload.deviceId;
  delete payload.remoteUserId;
  delete payload.remoteDeviceId;
  delete payload.updatedAt;
  delete payload.encryptedPayload;

  extraFields.forEach((field) => {
    delete payload[field];
  });

  return payload;
};

const _loadProtectedRecord = async (storeName, id, userId, deviceId) => {
  const record = await loadRawRecord(storeName, id);

  if (!record) {
    return null;
  }

  if (record.encryptedPayload?.iv && record.encryptedPayload?.ciphertext) {
    return decryptPayload(userId, deviceId, record.encryptedPayload);
  }

  return stripIndexedDbMetadata(record);
};

export const loadDeviceKeyMaterial = async (userId, deviceId) => {
  const id = recordId(userId, deviceId);
  const record = await loadRawRecord(DEVICE_KEYS_STORE, id);

  if (!record) {
    return null;
  }

  if (record.encryptedPayload?.iv && record.encryptedPayload?.ciphertext) {
    return decryptPayload(userId, deviceId, record.encryptedPayload);
  }

  const legacyPayload = stripIndexedDbMetadata(record);
  await saveDeviceKeyMaterial(userId, deviceId, legacyPayload);
  return legacyPayload;
};

export const saveDeviceKeyMaterial = async (userId, deviceId, payload) => {
  const id = recordId(userId, deviceId);
  const encryptedPayload = await encryptPayload(userId, deviceId, payload);

  await saveRawRecord(DEVICE_KEYS_STORE, {
    id,
    userId,
    deviceId,
    encryptedPayload,
    updatedAt: new Date().toISOString()
  });

  return {
    id,
    userId,
    deviceId,
    ...payload
  };
};

export const deleteDeviceKeyMaterial = async (userId, deviceId) => {
  const id = recordId(userId, deviceId);
  return deleteRawRecord(DEVICE_KEYS_STORE, id);
};

export const loadDeviceSession = async (userId, deviceId, remoteUserId, remoteDeviceId) => {
  const id = sessionRecordId(userId, deviceId, remoteUserId, remoteDeviceId);
  const record = await loadRawRecord(DEVICE_SESSIONS_STORE, id);

  if (!record) {
    return null;
  }

  if (record.encryptedPayload?.iv && record.encryptedPayload?.ciphertext) {
    return decryptPayload(userId, deviceId, record.encryptedPayload);
  }

  const legacyPayload = stripIndexedDbMetadata(record);
  await saveDeviceSession(userId, deviceId, remoteUserId, remoteDeviceId, legacyPayload);
  return legacyPayload;
};

export const saveDeviceSession = async (userId, deviceId, remoteUserId, remoteDeviceId, payload) => {
  const id = sessionRecordId(userId, deviceId, remoteUserId, remoteDeviceId);
  const encryptedPayload = await encryptPayload(userId, deviceId, payload);

  await saveRawRecord(DEVICE_SESSIONS_STORE, {
    id,
    userId,
    deviceId,
    remoteUserId,
    remoteDeviceId,
    encryptedPayload,
    updatedAt: new Date().toISOString()
  });

  return {
    id,
    userId,
    deviceId,
    remoteUserId,
    remoteDeviceId,
    ...payload
  };
};

export const deleteDeviceSession = async (userId, deviceId, remoteUserId, remoteDeviceId) => {
  const id = sessionRecordId(userId, deviceId, remoteUserId, remoteDeviceId);
  return deleteRawRecord(DEVICE_SESSIONS_STORE, id);
};
