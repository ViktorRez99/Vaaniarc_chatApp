import {
  decapsulatePostQuantumSharedSecret,
  encapsulatePostQuantumSharedSecret,
  generatePostQuantumKemKeyPair,
  generatePostQuantumSignatureKeyPair,
  signPostQuantum,
  verifyPostQuantumSignature
} from './postQuantumCrypto';

describe('postQuantumCrypto', () => {
  it('signs and verifies payloads with ML-DSA-87', () => {
    const keyPair = generatePostQuantumSignatureKeyPair();
    const message = new TextEncoder().encode('vaaniarc-pq-signature');
    const signature = signPostQuantum(message, keyPair.privateKey);

    expect(verifyPostQuantumSignature(signature, message, keyPair.publicKey)).toBe(true);
  });

  it('round-trips shared secrets with ML-KEM-1024', () => {
    const keyPair = generatePostQuantumKemKeyPair();
    const encapsulated = encapsulatePostQuantumSharedSecret(keyPair.publicKey);
    const decapsulatedSecret = decapsulatePostQuantumSharedSecret(
      encapsulated.ciphertext,
      keyPair.privateKey
    );

    expect(decapsulatedSecret).toBe(encapsulated.sharedSecret);
  });
});
