const PasskeyCredential = require('../models/PasskeyCredential');

const isPasskeyEnrollmentPolicyEnabled = () => {
  const configuredValue = String(process.env.PASSKEYS_REQUIRED || 'true').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(configuredValue);
};

const getPasskeyEnrollmentStatus = async (userId) => {
  const policyEnabled = isPasskeyEnrollmentPolicyEnabled();

  if (!policyEnabled || !userId) {
    return {
      hasPasskey: !policyEnabled,
      passkeyRequired: false
    };
  }

  const passkeyCount = await PasskeyCredential.countDocuments({
    user: userId,
    revokedAt: null
  });

  const hasPasskey = passkeyCount > 0;

  return {
    hasPasskey,
    passkeyRequired: !hasPasskey
  };
};

const attachPasskeyEnrollmentStatus = async (userPayload, userId) => ({
  ...userPayload,
  ...(await getPasskeyEnrollmentStatus(userId || userPayload?._id || userPayload?.id))
});

const requirePasskeyEnrollment = async (req, res, next) => {
  try {
    const status = await getPasskeyEnrollmentStatus(req.user?._id);

    req.passkeyEnrollment = status;

    if (status.passkeyRequired) {
      return res.status(403).json({
        code: 'PASSKEY_REQUIRED',
        message: 'Passkey setup is required before using VaaniArc.',
        passkeyRequired: true,
        hasPasskey: false
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  attachPasskeyEnrollmentStatus,
  getPasskeyEnrollmentStatus,
  isPasskeyEnrollmentPolicyEnabled,
  requirePasskeyEnrollment
};
