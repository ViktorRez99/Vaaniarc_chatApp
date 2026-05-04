import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration
} from '@simplewebauthn/browser';

import apiService from './api';

const normalizeBrowserPasskeyError = (error, fallbackMessage) => {
  const message = String(error?.message || '');

  if (/not supported|webauthn is not supported/i.test(message)) {
    return 'This browser does not support passkeys.';
  }

  if (/abort|cancel|not allowed/i.test(message)) {
    return fallbackMessage;
  }

  return message || fallbackMessage;
};

const passkeyService = {
  isSupported() {
    return browserSupportsWebAuthn();
  },

  async authenticate(identifier = '') {
    if (!this.isSupported()) {
      throw new Error('This browser does not support passkeys.');
    }

    try {
      const { attemptId, options } = await apiService.getWebAuthnAuthenticationOptions({
        identifier: identifier.trim()
      });
      const response = await startAuthentication({
        optionsJSON: options
      });

      return apiService.verifyWebAuthnAuthentication({
        attemptId,
        response
      });
    } catch (error) {
      throw new Error(normalizeBrowserPasskeyError(
        error,
        'Passkey sign-in was cancelled before it completed.'
      ));
    }
  },

  async enroll(label = '') {
    if (!this.isSupported()) {
      throw new Error('This browser does not support passkeys.');
    }

    try {
      const { attemptId, options } = await apiService.getWebAuthnRegistrationOptions({
        label: label.trim()
      });
      const response = await startRegistration({
        optionsJSON: options
      });

      return apiService.verifyWebAuthnRegistration({
        attemptId,
        response,
        label: label.trim()
      });
    } catch (error) {
      throw new Error(normalizeBrowserPasskeyError(
        error,
        'Passkey setup was cancelled before it completed.'
      ));
    }
  },

  async list() {
    const response = await apiService.listPasskeys();
    return response.passkeys || [];
  },

  async revoke(passkeyId) {
    return apiService.revokePasskey(passkeyId);
  }
};

export default passkeyService;
