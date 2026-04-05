import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';

export const POST_QUANTUM_KEM_ALGORITHM = 'ml-kem-1024';
export const POST_QUANTUM_SIGNATURE_ALGORITHM = 'ml-dsa-87';

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

export const base64FromBytes = (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return base64FromArrayBuffer(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
};

export const bytesFromBase64 = (value) => new Uint8Array(arrayBufferFromBase64(value));

export const generatePostQuantumSignatureKeyPair = () => {
  const { publicKey, secretKey } = ml_dsa87.keygen();

  return {
    algorithm: POST_QUANTUM_SIGNATURE_ALGORITHM,
    publicKey: base64FromBytes(publicKey),
    privateKey: base64FromBytes(secretKey)
  };
};

export const signPostQuantum = (messageBytes, privateKeyBase64) => base64FromBytes(
  ml_dsa87.sign(
    messageBytes instanceof Uint8Array ? messageBytes : new Uint8Array(messageBytes),
    bytesFromBase64(privateKeyBase64)
  )
);

export const verifyPostQuantumSignature = (signatureBase64, messageBytes, publicKeyBase64) => {
  if (!signatureBase64 || !publicKeyBase64) {
    return false;
  }

  return ml_dsa87.verify(
    bytesFromBase64(signatureBase64),
    messageBytes instanceof Uint8Array ? messageBytes : new Uint8Array(messageBytes),
    bytesFromBase64(publicKeyBase64)
  );
};

export const generatePostQuantumKemKeyPair = () => {
  const { publicKey, secretKey } = ml_kem1024.keygen();

  return {
    algorithm: POST_QUANTUM_KEM_ALGORITHM,
    publicKey: base64FromBytes(publicKey),
    privateKey: base64FromBytes(secretKey)
  };
};

export const encapsulatePostQuantumSharedSecret = (publicKeyBase64) => {
  const {
    cipherText,
    sharedSecret
  } = ml_kem1024.encapsulate(bytesFromBase64(publicKeyBase64));

  return {
    algorithm: POST_QUANTUM_KEM_ALGORITHM,
    ciphertext: base64FromBytes(cipherText),
    sharedSecret: base64FromBytes(sharedSecret)
  };
};

export const decapsulatePostQuantumSharedSecret = (ciphertextBase64, privateKeyBase64) => base64FromBytes(
  ml_kem1024.decapsulate(
    bytesFromBase64(ciphertextBase64),
    bytesFromBase64(privateKeyBase64)
  )
);

